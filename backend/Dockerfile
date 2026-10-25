# Build context is the repository root so the root package-lock.json is
# available: docker build -f backend/Dockerfile .
FROM node:22-alpine AS builder

# openssl must be present before `npm ci`: @prisma/engines downloads the CLI
# query and schema engines in its postinstall for the openssl version it
# detects. The runner has openssl 3; without it here the engines copied into
# the image target openssl 1.1 and every new container would fetch the
# openssl-3.0.x engines from binaries.prisma.sh before `prisma db push`.
RUN apk add --no-cache openssl
WORKDIR /app
# Root manifest + lockfile and every workspace manifest, so `npm ci` can check
# the lockfile against the whole workspace tree and installs exactly what CI tests.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY mcp/package.json ./mcp/
RUN npm ci --workspace=backend --include-workspace-root --no-audit --no-fund
COPY backend/prisma ./backend/prisma
RUN cd backend && npx prisma generate
COPY backend ./backend
RUN npm run build --workspace=backend

# Production dependencies of the backend workspace only, from the same lockfile.
FROM node:22-alpine AS prod-deps
# Same reason as in the builder stage: engines are chosen at install time.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY mcp/package.json ./mcp/
RUN npm ci --workspace=backend --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runner

RUN apk add --no-cache openssl
WORKDIR /app/backend

# node_modules holds the backend's production dependencies only. The prisma CLI
# the start command needs is already among them: the lockfile marks prisma and
# @prisma/engines devOptional (optional peer of @prisma/client), which
# `--omit=dev` keeps. Copying both from the builder guards against a lockfile
# where that is no longer so; the copy that adds something today is `.prisma`,
# the client generated in the builder.
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=builder /app/node_modules/prisma /app/node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines /app/node_modules/@prisma/engines
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
