#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${1:-$ROOT_DIR/backups}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/arknas-backup-$TS.tar.gz"

mkdir -p "$BACKUP_DIR"
mkdir -p "$ROOT_DIR/data"

items=("data" "infra/docker-compose.yml" ".env.example" "README.md" "docs")
if [[ -f "$ROOT_DIR/.env" ]]; then
  items+=(".env")
fi

cd "$ROOT_DIR"
tar -czf "$OUT_FILE" "${items[@]}"

echo "Backup created: $OUT_FILE"
