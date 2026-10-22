# D2 — LogLens API image (multi-stage)
# Build from labs/loglens:  docker build -f server/Dockerfile -t loglens-api:0.1 .
# Run:  docker run --rm -p 8091:8091 -e SESSION_SECRET=change-me -v loglens-data:/app/server/data loglens-api:0.1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci \
  && rm -rf /var/lib/apt/lists/*

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/server/package.json ./server/package.json
COPY --from=deps /app/client/package.json ./client/package.json
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
RUN npm run build --workspace=server

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8091

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# better-sqlite3 needs a short native compile on slim images;
# apt upgrade picks up fixed Debian packages Trivy flags on the base image.
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --workspace=server --omit=dev \
  && npm cache clean --force \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/server/dist ./server/dist
COPY server/fixtures ./server/fixtures
COPY server/knowledge ./server/knowledge
# DATA-0: SQL migrations (loaded from serverRoot/src/db/migrations at runtime)
COPY server/src/db/migrations ./server/src/db/migrations

RUN mkdir -p /app/server/data

WORKDIR /app/server
EXPOSE 8091
CMD ["node", "dist/index.js"]
