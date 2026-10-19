FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci

COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend
RUN npm run db:generate --workspace=apps/backend
RUN npm run build --workspace=apps/backend
RUN npm run build --workspace=apps/frontend

# ── Production image ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
RUN npm ci --omit=dev --workspace=apps/backend --include-workspace-root=true
RUN npm run db:generate --workspace=apps/backend
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/frontend/dist ./public
COPY apps/backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN apk add --no-cache su-exec \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /var/data \
  && chown -R node:node /var/data /app
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
