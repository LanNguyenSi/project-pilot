# Build context is the repository root so the root package-lock.json is
# available: docker build -f backend/Dockerfile .
FROM node:22-alpine AS builder

WORKDIR /app
# node 22's bundled npm 10 crashes resolving @vitest/coverage-v8's exact vitest
# peer pin ("Cannot read properties of null (reading 'edgesOut')"); npm >= 11 resolves it.
RUN npm install -g npm@11
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

FROM node:22-alpine AS runner

RUN apk add --no-cache openssl
WORKDIR /app/backend

# node_modules is carried over from the builder as before: the start command
# needs the prisma CLI (a devDependency), so dev dependencies stay in this image.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
