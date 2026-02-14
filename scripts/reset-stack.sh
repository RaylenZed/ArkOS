#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f "docker-compose.yml" ]]; then
  echo "docker-compose.yml not found in ${ROOT_DIR}"
  exit 1
fi

run_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "This will stop and remove ArkMedia containers, network, and volumes."
echo "Optional steps can also remove project images and data directories."
echo
read -r -p "Type RESET-ARKMEDIA to continue: " CONFIRM
if [[ "${CONFIRM}" != "RESET-ARKMEDIA" ]]; then
  echo "Cancelled."
  exit 1
fi

read -r -p "Remove project images too? [y/N]: " REMOVE_IMAGES
REMOVE_IMAGES="${REMOVE_IMAGES:-N}"

read -r -p "Remove project data directories under /srv/docker and media/downloads? [y/N]: " REMOVE_DATA
REMOVE_DATA="${REMOVE_DATA:-N}"

read -r -p "Run global prune for unused Docker resources (all projects)? [y/N]: " GLOBAL_PRUNE
GLOBAL_PRUNE="${GLOBAL_PRUNE:-N}"

echo
echo "Step 1/4: stopping stack"
run_root docker compose down -v --remove-orphans || true

if [[ "${REMOVE_IMAGES}" == "y" || "${REMOVE_IMAGES}" == "Y" ]]; then
  echo "Step 2/4: removing project images"
  mapfile -t SERVICE_IMAGES < <(run_root docker compose config | awk '/image:/ {print $2}')
  SERVICE_IMAGES+=("arkmedia-stack-caddy:latest")
  for img in "${SERVICE_IMAGES[@]}"; do
    run_root docker image rm -f "${img}" >/dev/null 2>&1 || true
  done
else
  echo "Step 2/4: skip image removal"
fi

if [[ "${REMOVE_DATA}" == "y" || "${REMOVE_DATA}" == "Y" ]]; then
  echo "Step 3/4: removing data directories"
  run_root rm -rf /srv/docker/caddy /srv/docker/openlist /srv/docker/emby /srv/docker/qbittorrent
  run_root rm -rf /srv/downloads /srv/media/incoming
  echo "Kept /srv/media/local, /srv/cloud, /vol1 by default."
else
  echo "Step 3/4: skip data directory removal"
fi

if [[ "${GLOBAL_PRUNE}" == "y" || "${GLOBAL_PRUNE}" == "Y" ]]; then
  echo "Step 4/4: running global prune"
  run_root docker system prune -af --volumes
else
  echo "Step 4/4: skip global prune"
fi

run_root rm -f docker-compose.override.yml .mounts.state

echo
echo "Reset completed."
echo "Next:"
echo "  cp .env.example .env"
echo "  edit .env"
echo "  follow README deployment steps"
