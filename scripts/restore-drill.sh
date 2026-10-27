#!/usr/bin/env bash
# Restore drill: proves that scripts/backup.sh and scripts/restore.sh round-trip a
# real database. Runs in CI against a throwaway Postgres 16 and can be run by hand
# against any scratch Postgres container; never point it at production.
#
# It applies the schema the way a deploy does (`prisma db push`, no data-loss flag),
# seeds a few rows, runs the REAL scripts/backup.sh, restores the dump with the REAL
# scripts/restore.sh into a second, freshly created database, and asserts row counts,
# one row's content and a unique constraint. Then it restores the same dump into that
# now populated database after a newer release's table (with a foreign key into a
# dumped table) and a row written after the dump were added: both must be gone
# afterwards, the pre-restore dump must hold them, and `prisma db push` must find the
# schema in sync. Finally a truncated dump and a SQL copy that vanishes after
# conversion must leave the database unchanged, and a pg_dump cut short must not be
# published. The scripts see a `docker` shim that maps
# `docker compose -f <file> exec -T db <cmd>` onto `docker exec -i <container> <cmd>`,
# so every pg_dump, pg_restore and psql option comes from the scripts themselves: if
# their options drift, this drill fails.
#
# Usage:
#   DRILL_PG_CONTAINER=<container of a postgres:16 started with user/db project_pilot> \
#   DRILL_DATABASE_URL=postgresql://project_pilot:<password>@127.0.0.1:<port>/project_pilot \
#   scripts/restore-drill.sh
# Run it from anywhere; it uses the checkout it lives in (needs `npm ci` done).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DRILL_PG_CONTAINER:?set DRILL_PG_CONTAINER to the scratch Postgres container}"
: "${DRILL_DATABASE_URL:?set DRILL_DATABASE_URL to the connection URL of its project_pilot database}"
SRC_DB=project_pilot
DST_DB=project_pilot_restored
PG_ROLE=project_pilot
EXPECT_USERS=2
EXPECT_CREDS=3
EXPECT_SERVICE='project-forge'
EXPECT_TOKEN='enc:drill-three'

REAL_DOCKER="$(command -v docker)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/backups" "$WORK/tmp"
: > "$WORK/compose.yml"

# The shim answers only the compose calls the scripts make.
cat > "$WORK/bin/docker" <<SHIM
#!/usr/bin/env bash
if [ "\$1" = compose ] && [ "\$2" = -f ]; then
  shift 3
  case "\$1" in
    ps) echo db; exit 0 ;;
    exec)
      shift
      [ "\$1" = -T ] && shift
      shift # service name
      # DRILL_RM_ON_DUMP: files (glob allowed) removed when a pg_dump runs, i.e. between
      # restore.sh converting the dump and loading it
      case "\$*" in
        *pg_dump*) [ -z "\${DRILL_RM_ON_DUMP:-}" ] || rm -f \$DRILL_RM_ON_DUMP ;;
      esac
      exec "$REAL_DOCKER" exec -i "$DRILL_PG_CONTAINER" "\$@"
      ;;
  esac
fi
echo "drill docker shim: unexpected call: \$*" >&2
exit 9
SHIM
chmod +x "$WORK/bin/docker"

sql() { # sql <database> <statement>: print the bare result
  "$REAL_DOCKER" exec -i -e PGOPTIONS='-c client_min_messages=warning' "$DRILL_PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_ROLE" -d "$1" -tA -c "$2"
}
fail() { echo "drill: FAIL: $*" >&2; exit 1; }
expect() { # expect <label> <actual> <expected>
  [ "$2" = "$3" ] || fail "$1: got '$2', expected '$3'"
  echo "drill: ok: $1 = $3"
}
# run_script <script> <env assignments...> -- <args...>: run a REAL script against the shim
run_script() {
  local script="$1"; shift
  local envs=()
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  shift
  env PATH="$WORK/bin:$PATH" BACKUP_COMPOSE_FILE="$WORK/compose.yml" BACKUP_DIR="$WORK/backups" TMPDIR="$WORK/tmp" \
    "${envs[@]}" "$REPO_ROOT/scripts/$script" "$@"
}

# The drill truncates "User" in the source database: refuse anything that looks like the
# production database. By name, and (once the schema exists) by content: any user whose id
# does not start with drill- means this is not a scratch database.
guard_container() { # guard_container <container name>
  [ "$1" != project-pilot-db ] || fail "refusing to run against the production container project-pilot-db"
}
guard_rows() { # guard_rows <database>
  local n
  n="$(sql "$1" "SELECT count(*) FROM \"User\" WHERE id NOT LIKE 'drill-%'")"
  [ "$n" = 0 ] || fail "refusing to seed: database $1 holds $n user(s) that are not drill rows"
}
guard_container "$DRILL_PG_CONTAINER"

echo "drill: applying the schema like a deploy (prisma db push)"
cd "$REPO_ROOT/backend"
DATABASE_URL="$DRILL_DATABASE_URL" HOME="$WORK" npx prisma db push --skip-generate --schema=prisma/schema.prisma

guard_rows "$SRC_DB"
echo "drill: seeding"
sql "$SRC_DB" 'TRUNCATE "User" CASCADE' > /dev/null
sql "$SRC_DB" "INSERT INTO \"User\" (id, email, name, \"updatedAt\") VALUES
  ('drill-u1', 'one@drill.invalid', 'Drill One', now()),
  ('drill-u2', 'two@drill.invalid', 'Drill Two', now())" > /dev/null
sql "$SRC_DB" "INSERT INTO \"Session\" (id, \"tokenHash\", \"userId\", \"expiresAt\") VALUES
  ('drill-s1', 'hash-one', 'drill-u1', now() + interval '1 day')" > /dev/null
sql "$SRC_DB" "INSERT INTO \"ServiceCredential\" (id, \"userId\", service, token, \"updatedAt\") VALUES
  ('drill-c1', 'drill-u1', 'agent-tasks', 'enc:drill-one', now()),
  ('drill-c2', 'drill-u1', 'deploy-panel', 'enc:drill-two', now()),
  ('drill-c3', 'drill-u2', '$EXPECT_SERVICE', '$EXPECT_TOKEN', now())" > /dev/null
expect "seeded users" "$(sql "$SRC_DB" 'SELECT count(*) FROM "User"')" "$EXPECT_USERS"

echo "drill: backup.sh"
run_script backup.sh PG_DB="$SRC_DB" --
dump="$(find "$WORK/backups" -maxdepth 1 -name 'project-pilot-*.dump')"
if [ -z "$dump" ] || [ "$(wc -l <<< "$dump" | tr -d ' ')" != 1 ]; then
  fail "expected exactly one dump in $WORK/backups"
fi

echo "drill: restore.sh into a fresh database"
sql postgres "DROP DATABASE IF EXISTS $DST_DB" > /dev/null
sql postgres "CREATE DATABASE $DST_DB OWNER $PG_ROLE" > /dev/null
# A fresh database is below backup.sh's size floor, so no pre-restore dump here; the
# shim has no `run` or `stop`, so the app and schema steps are skipped (the next case
# runs prisma itself).
run_script restore.sh RESTORE_APP_SERVICE='' RESTORE_SCHEMA_SERVICE='' PG_DB="$DST_DB" -- --yes --no-pre-backup "$dump"

echo "drill: asserting the restored database"
expect "restored users" "$(sql "$DST_DB" 'SELECT count(*) FROM "User"')" "$EXPECT_USERS"
expect "restored credentials" "$(sql "$DST_DB" 'SELECT count(*) FROM "ServiceCredential"')" "$EXPECT_CREDS"
expect "restored sessions" "$(sql "$DST_DB" 'SELECT count(*) FROM "Session"')" 1
expect "restored row content" \
  "$(sql "$DST_DB" "SELECT service || '|' || \"userId\" || '|' || token FROM \"ServiceCredential\" WHERE id = 'drill-c3'")" \
  "$EXPECT_SERVICE|drill-u2|$EXPECT_TOKEN"
expect "unique constraint on credentials" \
  "$(sql "$DST_DB" "SELECT count(*) FROM pg_indexes WHERE tablename = 'ServiceCredential' AND indexdef LIKE '%UNIQUE%userId%service%'")" 1

echo "drill: restore into a populated database whose schema is newer than the dump"
DST_URL="${DRILL_DATABASE_URL%/"$SRC_DB"}/$DST_DB"
[ "$DST_URL" != "$DRILL_DATABASE_URL" ] || fail "DRILL_DATABASE_URL must end in /$SRC_DB"
cp "$dump" "$WORK/first.dump"
sql "$DST_DB" 'CREATE TABLE drill_extra (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "User"(id))' > /dev/null
sql "$DST_DB" "INSERT INTO drill_extra VALUES ('x1', 'drill-u1')" > /dev/null
sql "$DST_DB" "INSERT INTO \"User\" (id, email, name, \"updatedAt\") VALUES ('drill-post', 'post@drill.invalid', 'written-after-dump', now())" > /dev/null
expect "users before the second restore" "$(sql "$DST_DB" 'SELECT count(*) FROM "User"')" 3
run_script restore.sh RESTORE_APP_SERVICE='' RESTORE_SCHEMA_SERVICE='' PG_DB="$DST_DB" -- --yes "$WORK/first.dump"
expect "users after the second restore" "$(sql "$DST_DB" 'SELECT count(*) FROM "User"')" "$EXPECT_USERS"
expect "row written after the dump" "$(sql "$DST_DB" "SELECT count(*) FROM \"User\" WHERE id = 'drill-post'")" 0
expect "table of the newer schema" "$(sql "$DST_DB" "SELECT coalesce(to_regclass('public.drill_extra')::text, 'gone')")" gone
expect "credentials after the second restore" "$(sql "$DST_DB" 'SELECT count(*) FROM "ServiceCredential"')" "$EXPECT_CREDS"
expect "public schema owner" "$(sql "$DST_DB" "SELECT nspowner::regrole FROM pg_namespace WHERE nspname = 'public'")" pg_database_owner
pre=""
for f in "$WORK"/backups/project-pilot-*.dump; do [ "$f" = "$dump" ] || pre="$f"; done
[ -n "$pre" ] || fail "no pre-restore dump was written"
# The pre-restore dump must hold the replaced state; read it back as SQL through the
# container (pg_restore is the only reader of the custom format).
pre_sql="$("$REAL_DOCKER" exec -i "$DRILL_PG_CONTAINER" pg_restore -f - < "$pre")"
grep -q 'drill_extra' <<< "$pre_sql" || fail "the pre-restore dump lacks the newer table"
grep -q 'written-after-dump' <<< "$pre_sql" || fail "the pre-restore dump lacks the row written after the dump"
echo "drill: ok: pre-restore dump holds the replaced state"
# The schema step: the schema must already match what prisma db push would build.
push_out="$(cd "$REPO_ROOT/backend" && DATABASE_URL="$DST_URL" HOME="$WORK" npx prisma db push --skip-generate --schema=prisma/schema.prisma 2>&1)" \
  || fail "prisma db push failed on the restored database: $push_out"
grep -q 'already in sync' <<< "$push_out" || fail "restored schema is not in sync with prisma/schema.prisma: $push_out"
echo "drill: ok: prisma db push finds the restored schema in sync"

echo "drill: a truncated dump must be refused and leave the database unchanged"
size="$(wc -c < "$dump" | tr -d ' ')"
head -c "$((size - 20))" "$dump" > "$WORK/truncated.dump"
if run_script restore.sh RESTORE_APP_SERVICE='' RESTORE_SCHEMA_SERVICE='' PG_DB="$DST_DB" -- --yes --no-pre-backup "$WORK/truncated.dump" 2> "$WORK/truncated.err"; then
  fail "restore.sh accepted a truncated dump"
fi
grep -q 'could not be read as a custom-format dump' "$WORK/truncated.err" || fail "truncated dump failed for another reason: $(cat "$WORK/truncated.err")"
expect "credentials after the truncated-dump restore" "$(sql "$DST_DB" 'SELECT count(*) FROM "ServiceCredential"')" "$EXPECT_CREDS"

echo "drill: a SQL copy that becomes unreadable after conversion must leave the database unchanged"
# restore.sh loads a private SQL copy. The shim deletes that copy when the pre-restore
# pg_dump runs (after conversion, before the load), so psql receives the schema reset
# but no dump; the transaction must not be committed.
tables_before="$(sql "$DST_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
[ "$tables_before" -gt 0 ] || fail "expected tables before the vanish case, got $tables_before"
if run_script restore.sh DRILL_RM_ON_DUMP="$WORK/tmp/restore-dump.*" RESTORE_APP_SERVICE='' RESTORE_SCHEMA_SERVICE='' PG_DB="$DST_DB" \
  -- --yes "$WORK/first.dump" 2> "$WORK/vanish.err"; then
  fail "restore.sh reported success although its SQL copy vanished"
fi
grep -q 'nothing was committed' "$WORK/vanish.err" || fail "vanish case: unexpected message: $(cat "$WORK/vanish.err")"
expect "tables after the vanished-copy restore" \
  "$(sql "$DST_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")" "$tables_before"
expect "credentials after the vanished-copy restore" "$(sql "$DST_DB" 'SELECT count(*) FROM "ServiceCredential"')" "$EXPECT_CREDS"
[ -z "$(find "$WORK/tmp" -mindepth 1)" ] || fail "temporary copy of the dump was left behind"

echo "drill: backup.sh must not publish a truncated dump"
# backup.sh validates by reading the archive completely; feed the validator a real dump
# cut 20 bytes short (inside the data section, so the table of contents still lists
# fine and only a full read notices) through a shim whose pg_dump output is cut short.
CUT=$((size - 20))
mkdir -p "$WORK/shortbin"
cat > "$WORK/shortbin/docker" <<SHIM
#!/usr/bin/env bash
if [ "\$1" = compose ] && [ "\$2" = -f ]; then
  shift 3
  case "\$1" in
    ps) echo db; exit 0 ;;
    exec)
      shift
      [ "\$1" = -T ] && shift
      shift # service name
      case "\$*" in
        *pg_dump*) "$REAL_DOCKER" exec -i "$DRILL_PG_CONTAINER" "\$@" | head -c $CUT; exit 0 ;;
      esac
      exec "$REAL_DOCKER" exec -i "$DRILL_PG_CONTAINER" "\$@"
      ;;
  esac
fi
echo "drill docker shim: unexpected call: \$*" >&2
exit 9
SHIM
chmod +x "$WORK/shortbin/docker"
mkdir -p "$WORK/backups2"
if env PATH="$WORK/shortbin:$PATH" BACKUP_COMPOSE_FILE="$WORK/compose.yml" BACKUP_DIR="$WORK/backups2" PG_DB="$SRC_DB" \
  "$REPO_ROOT/scripts/backup.sh" 2> "$WORK/short.err"; then
  fail "backup.sh published a dump cut off 20 bytes before its end"
fi
[ -z "$(find "$WORK/backups2" -mindepth 1)" ] || fail "backup.sh left files behind after a cut-off dump"
echo "drill: ok: a cut-off dump is not published"

echo "drill: the scratch-database guards must refuse a production-looking target"
if ( guard_container project-pilot-db ) 2> "$WORK/guard1.err"; then fail "guard_container accepted project-pilot-db"; fi
grep -q 'production container' "$WORK/guard1.err" || fail "guard_container failed for another reason: $(cat "$WORK/guard1.err")"
sql "$SRC_DB" "INSERT INTO \"User\" (id, email, name, \"updatedAt\") VALUES ('real-1', 'real@example.invalid', 'real user', now())" > /dev/null
if ( guard_rows "$SRC_DB" ) 2> "$WORK/guard2.err"; then
  sql "$SRC_DB" "DELETE FROM \"User\" WHERE id = 'real-1'" > /dev/null
  fail "guard_rows accepted a database holding a non-drill user"
fi
sql "$SRC_DB" "DELETE FROM \"User\" WHERE id = 'real-1'" > /dev/null
grep -q 'not drill rows' "$WORK/guard2.err" || fail "guard_rows failed for another reason: $(cat "$WORK/guard2.err")"
guard_rows "$SRC_DB"
echo "drill: ok: production-looking targets are refused"

sql postgres "DROP DATABASE $DST_DB" > /dev/null
echo "drill: PASSED"
