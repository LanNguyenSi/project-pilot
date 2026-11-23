.PHONY: install setup dev dev-full dev-backend dev-frontend build clean docker-up docker-down db-generate db-push deploy backup restore

install:
	npm install

setup: install db-generate
	@echo "Setup complete. Run 'make docker-up' for PostgreSQL, then 'make db-push'."

dev:
	npm run dev

dev-full: install db-generate docker-up
	@echo "Waiting for PostgreSQL..."
	@until docker compose exec db pg_isready -U project_pilot -q 2>/dev/null; do sleep 1; done
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f frontend/.env || cp frontend/.env.example frontend/.env
	cd backend && npx prisma db push --skip-generate
	npm run dev

dev-backend:
	npm run dev:backend

dev-frontend:
	npm run dev:frontend

build:
	npm run build

clean:
	rm -rf backend/dist frontend/.next mcp/dist

docker-up:
	docker compose up db -d
	@echo "PostgreSQL running on localhost:5432"

docker-down:
	docker compose down

db-generate:
	cd backend && npx prisma generate

db-push:
	cd backend && npx prisma db push

# Manual fallback for the relay deploy: same steps as `.relay.yml`
# (pull, refresh the images this deploy builds on with `pull db` plus
# `build --pull`, build/up, `prisma db push` without a data-loss flag,
# then bounded waits on the backend `/api/health` and on the frontend's
# port 3000). A destructive schema change makes the push fail and the
# deploy exit non-zero. `git pull` has already run at that point, and a
# pull failure fails before any image is built or any container is
# restarted, so a retry is safe.
HEALTH_TRIES ?= 30
HEALTH_INTERVAL ?= 2

deploy:
	@case "$(HEALTH_TRIES)" in ''|*[!0-9]*|0*) echo "deploy: HEALTH_TRIES must be a positive integer, got '$(HEALTH_TRIES)'" >&2; exit 2;; esac; \
	case "$(HEALTH_INTERVAL)" in ''|*[!0-9]*|0*) echo "deploy: HEALTH_INTERVAL must be a positive integer, got '$(HEALTH_INTERVAL)'" >&2; exit 2;; esac
	git pull
	docker compose -f docker-compose.prod.yml pull db
	docker compose -f docker-compose.prod.yml build --pull
	docker compose -f docker-compose.prod.yml up -d
	docker compose -f docker-compose.prod.yml exec -T -e HOME=/tmp backend npx prisma db push --schema=prisma/schema.prisma --skip-generate
	@i=0; \
	until docker compose -f docker-compose.prod.yml exec -T backend wget -q --spider http://localhost:3001/api/health; do \
		i=$$((i+1)); \
		if [ $$i -ge $(HEALTH_TRIES) ]; then \
			echo "deploy failed: /api/health still failing after $(HEALTH_TRIES) attempts, $(HEALTH_INTERVAL)s apart" >&2; exit 1; \
		fi; \
		sleep $(HEALTH_INTERVAL); \
	done; \
	i=0; \
	until docker compose -f docker-compose.prod.yml exec -T frontend node -e "fetch('http://localhost:3000', { signal: AbortSignal.timeout(3000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; do \
		i=$$((i+1)); \
		if [ $$i -ge $(HEALTH_TRIES) ]; then \
			echo "deploy failed: frontend :3000 still failing after $(HEALTH_TRIES) attempts, $(HEALTH_INTERVAL)s apart" >&2; exit 1; \
		fi; \
		sleep $(HEALTH_INTERVAL); \
	done; \
	echo "deploy ok: backend and frontend healthy"

# Backup and restore of the production database (docker-compose.prod.yml), run in the
# checkout on the production host. Dumps go to $HOME/project-pilot-backups by default,
# never into the checkout. See docs/configuration.md, "Backup and restore".
backup:
	scripts/backup.sh

# Destructive. make restore FILE=<dump> CONFIRM=yes [NO_PRE_BACKUP=yes]
restore:
	scripts/restore.sh $(if $(filter yes,$(CONFIRM)),--yes) $(if $(filter yes,$(NO_PRE_BACKUP)),--no-pre-backup) $(if $(FILE),"$(FILE)")
