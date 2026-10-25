# Build context is the repository root so the root package-lock.json is
# available: docker build -f frontend/Dockerfile .
FROM node:22-alpine AS deps
WORKDIR /app
# node 22's bundled npm 10 crashes resolving @vitest/coverage-v8's exact vitest
# peer pin ("Cannot read properties of null (reading 'edgesOut')"); npm >= 11 resolves it.
RUN npm install -g npm@11
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
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEPSIGHT_URL=https://depsight.opentriologue.ai
ENV NEXT_PUBLIC_DEPSIGHT_URL=$NEXT_PUBLIC_DEPSIGHT_URL
RUN npm run build --workspace=frontend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# With the lockfile at the repo root, Next traces from /app, so the standalone
# server lands in frontend/ inside the standalone output.
COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "frontend/server.js"]
