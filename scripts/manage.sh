#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_CMD=(docker compose -f "$ROOT_DIR/infra/docker-compose.yml")
ACTION="${1:-}"

if [[ -z "$ACTION" ]]; then
  echo "Usage: $0 {up|down|restart|ps|logs|config|reset-admin-password}"
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
  reset-admin-password)
    NEW_PASSWORD="${2:-}"
    TARGET_USER="${3:-admin}"
    if [[ -z "$NEW_PASSWORD" ]]; then
      echo "Usage: $0 reset-admin-password <new_password> [username]"
      exit 1
    fi
    NEW_PASSWORD="$NEW_PASSWORD" TARGET_USER="$TARGET_USER" \
      "${COMPOSE_CMD[@]}" run --rm -e NEW_PASSWORD -e TARGET_USER api \
      node --input-type=module -e '
        import bcrypt from "bcryptjs";
        import Database from "better-sqlite3";
        const username = process.env.TARGET_USER || "admin";
        const password = process.env.NEW_PASSWORD || "";
        if (!password || password.length < 8) {
          console.error("new password must be at least 8 chars");
          process.exit(1);
        }
        const db = new Database("/data/sqlite/arknas.db");
        const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
        if (!user) {
          console.error(`user not found: ${username}`);
          process.exit(1);
        }
        const now = new Date().toISOString();
        const hash = bcrypt.hashSync(password, 10);
        db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hash, now, user.id);
        console.log(`password updated for user: ${username}`);
      '
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
