# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --fetch-retries=5

COPY tsconfig*.json vite.config.ts vite.server.config.ts index.html ./
COPY src ./src
COPY server ./server

RUN npm run build && npm run build:server

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only: the built server bundles the shared domain, so
# nothing from `src/` or the toolchain needs to ship.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --fetch-retries=5 && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

USER node
EXPOSE 3000

# Migrations run inside the server at startup, before it accepts a request, so
# a first run against an empty volume yields a working, empty ORBIT (FR-004).
CMD ["node", "dist-server/main.js"]
