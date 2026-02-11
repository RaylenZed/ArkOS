#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_CMD=(docker compose -f "$ROOT_DIR/infra/docker-compose.yml")
ACTION="${1:-}"

if [[ -z "$ACTION" ]]; then
  echo "Usage: $0 {up|down|restart|ps|logs|config}"
  exit 1
fi

case "$ACTION" in
  up)
    "${COMPOSE_CMD[@]}" up -d --build
    ;;
  down)
    "${COMPOSE_CMD[@]}" down
    ;;
  restart)
    "${COMPOSE_CMD[@]}" down
    "${COMPOSE_CMD[@]}" up -d --build
    ;;
  ps)
    "${COMPOSE_CMD[@]}" ps
    ;;
  logs)
    "${COMPOSE_CMD[@]}" logs -f --tail=200
    ;;
  config)
    "${COMPOSE_CMD[@]}" config
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
