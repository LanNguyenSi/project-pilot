# Build context is the repository root so the root package-lock.json is
# available: docker build -f frontend/Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY mcp/package.json ./mcp/
RUN npm ci --workspace=frontend --include-workspace-root --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY frontend ./frontend
# NEXT_PUBLIC_* values are inlined into the client bundle at build time: a build
# without these --build-arg flags bakes the defaults below into a production
# image silently, and the running container cannot change them afterwards.
# docker-compose.prod.yml passes both; a manual `docker build` must too.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEPSIGHT_URL=https://depsight.opentriologue.ai
ENV NEXT_PUBLIC_DEPSIGHT_URL=$NEXT_PUBLIC_DEPSIGHT_URL
RUN npm run build --workspace=frontend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The Next.js standalone server listens on $HOSTNAME, and Docker sets HOSTNAME
# to the container id, so without this the server is not reachable on the
# container's addresses and the healthcheck below (localhost:3000) never passes.
ENV HOSTNAME=0.0.0.0

# With the lockfile at the repo root, Next traces from /app, so the standalone
# server lands in frontend/ inside the standalone output.
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

# Run as the image's unprivileged `node` user (uid 1000), not root. The copied
# files stay root-owned and read-only for it. The one place the standalone
# server writes at runtime is .next/cache (the image optimizer's cache), so
# that directory alone is created here and owned by `node`.
RUN mkdir -p frontend/.next/cache && chown node:node frontend/.next/cache
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "frontend/server.js"]
