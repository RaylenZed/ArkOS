#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <backup-tar.gz> --yes"
  exit 1
fi

BACKUP_FILE="$1"
CONFIRM_FLAG="$2"

if [[ "$CONFIRM_FLAG" != "--yes" ]]; then
  echo "Restore requires --yes flag"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
docker compose -f infra/docker-compose.yml down || true

tar -xzf "$BACKUP_FILE" -C "$ROOT_DIR"

echo "Restore completed from: $BACKUP_FILE"
echo "Run 'make up' to start services."
