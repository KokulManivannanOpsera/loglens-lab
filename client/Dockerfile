# D2 — LogLens UI image (Vite build → nginx)
# Build from labs/loglens:  docker build -f client/Dockerfile -t loglens-web:0.1 .
# Needs API at API_UPSTREAM (compose: http://api:8091 · manual run: http://loglens-api:8091).

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# Workspace lockfile also lists better-sqlite3 (server); skip native compile — UI never loads it.
RUN npm ci --ignore-scripts
COPY client ./client
RUN npm run build --workspace=client

FROM nginx:1.27-alpine
RUN apk upgrade --no-cache
# Compose uses PORT=80; PaaS (Render/Railway) injects PORT (often 10000).
ENV PORT=80
ENV API_UPSTREAM=http://loglens-api:8091
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/client/dist /usr/share/nginx/html
EXPOSE 80
