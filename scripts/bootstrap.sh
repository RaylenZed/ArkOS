#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root or with sudo: sudo ./scripts/bootstrap.sh"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ROOT_DIR}/.env.example" "${ENV_FILE}"
  echo "Created .env from .env.example at ${ENV_FILE}"
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required_vars=(
  PUID
  PGID
  CADDY_DATA
  CADDY_CONFIG
  OPENLIST_DATA
  JELLYFIN_CONFIG
  JELLYFIN_CACHE
  QBIT_CONFIG
  DOWNLOADS_PATH
  MEDIA_LOCAL_PATH
  MEDIA_INCOMING_PATH
  CLOUD_MOUNT_ROOT
  RCLONE_CACHE_DIR
)

for key in "${required_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required variable in .env: ${key}"
    exit 1
  fi
done

mkdir -p \
  "${CADDY_DATA}" \
  "${CADDY_CONFIG}" \
  "${OPENLIST_DATA}" \
  "${JELLYFIN_CONFIG}" \
  "${JELLYFIN_CACHE}" \
  "${QBIT_CONFIG}" \
  "${DOWNLOADS_PATH}" \
  "${MEDIA_LOCAL_PATH}" \
  "${MEDIA_INCOMING_PATH}" \
  "${CLOUD_MOUNT_ROOT}" \
  "${RCLONE_CACHE_DIR}"

chown -R "${PUID}:${PGID}" "${OPENLIST_DATA}" "${QBIT_CONFIG}"
chmod -R u+rwX,g+rwX "${OPENLIST_DATA}" "${QBIT_CONFIG}"

# Ensure parent directories are traversable by containers.
chmod 755 /srv || true
chmod 755 /srv/docker || true

echo "Bootstrap completed."
echo "Next steps:"
echo "  1) Edit .env"
echo "  2) Run: sudo docker compose up -d --build"
