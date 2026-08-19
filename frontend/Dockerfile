FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
# node 22's bundled npm 10 crashes resolving @vitest/coverage-v8's exact vitest
# peer pin ("Cannot read properties of null (reading 'edgesOut')"); npm >= 11 resolves it.
RUN npm install -g npm@11
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEPSIGHT_URL=https://depsight.opentriologue.ai
ENV NEXT_PUBLIC_DEPSIGHT_URL=$NEXT_PUBLIC_DEPSIGHT_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
