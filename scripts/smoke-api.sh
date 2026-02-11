#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
PORT="${1:-18081}"
TMP_BASE="/tmp/arknas-smoke-$$"
PID_FILE="$TMP_BASE/api.pid"
LOG_FILE="$TMP_BASE/api.log"

mkdir -p "$TMP_BASE"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

(
  cd "$API_DIR"
  PORT="$PORT" \
  ARKNAS_DB_PATH="$TMP_BASE/sqlite/arknas.db" \
  CERTS_DIR="$TMP_BASE/certs" \
  JWT_SECRET="smoke-secret" \
  ADMIN_USERNAME="admin" \
  ADMIN_PASSWORD="admin123" \
  node src/server.js >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
)

sleep 2

curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null
TOKEN="$(curl -sf -X POST "http://127.0.0.1:$PORT/api/auth/login" -H 'content-type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).token||""))')"

if [[ -z "$TOKEN" ]]; then
  echo "Smoke failed: token missing"
  exit 1
fi

curl -sf "http://127.0.0.1:$PORT/api/auth/me" -H "Authorization: Bearer $TOKEN" >/dev/null
curl -sf "http://127.0.0.1:$PORT/api/settings/integrations" -H "Authorization: Bearer $TOKEN" >/dev/null

echo "Smoke API passed"
