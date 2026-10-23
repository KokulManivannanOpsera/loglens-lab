#!/usr/bin/env bash
# D9 — pull GHCR images for staging|production (from deploy/<env>.json) and run compose.
set -euo pipefail

ENV_NAME="${1:-staging}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/deploy/${ENV_NAME}.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST — run LogLens CD for ${ENV_NAME} first."
  exit 1
fi

SHA="$(python3 -c "import json; d=json.load(open('$MANIFEST')); print(d.get('sha') or '')")"
if [[ -z "$SHA" || "$SHA" == "None" ]]; then
  echo "$MANIFEST has no sha yet. Actions → LogLens CD → deploy → ${ENV_NAME}."
  exit 1
fi

eval "$(python3 <<PY
import json
d = json.load(open("$MANIFEST"))
img = d["images"]
print(f'export LOGLENS_API_IMAGE={img["api"]!r}')
print(f'export LOGLENS_WEB_IMAGE={img["web"]!r}')
print(f'export LOGLENS_AI_IMAGE={img["ai"]!r}')
PY
)"

echo "Environment: ${ENV_NAME}"
echo "SHA:         ${SHA}"
echo "api:         ${LOGLENS_API_IMAGE}"
echo "web:         ${LOGLENS_WEB_IMAGE}"
echo "ai:          ${LOGLENS_AI_IMAGE}"

cd "$ROOT"
# Login if needed (public packages can skip)
if [[ -n "${GITHUB_TOKEN:-}" && -n "${GITHUB_USER:-}" ]]; then
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin
fi

docker compose -f docker-compose.cd.yml pull
docker compose -f docker-compose.cd.yml up -d
echo "Up. UI http://localhost:8088  health: curl -sS http://localhost:8088/api/health"
