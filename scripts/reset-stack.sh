#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACKS=(gateway openlist emby qbittorrent watchtower)

run_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

env_file_for_stack() {
  local stack="$1"
  local env_file="${ROOT_DIR}/${stack}/.env"
  local env_example="${ROOT_DIR}/${stack}/.env.example"
  if [[ -f "${env_file}" ]]; then
    echo "${env_file}"
    return
  fi
  if [[ -f "${env_example}" ]]; then
    echo "${env_example}"
    return
  fi
  echo ""
}

echo "This will stop and remove all ArkMedia stack containers and networks."
echo "Optional steps can also remove images and data directories."
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
echo "Step 1/4: stopping stacks"
for s in "${STACKS[@]}"; do
  compose_file="${ROOT_DIR}/${s}/docker-compose.yml"
  override_file="${ROOT_DIR}/${s}/docker-compose.override.yml"
  env_file="$(env_file_for_stack "${s}")"

  [[ -f "${compose_file}" ]] || continue
  [[ -n "${env_file}" ]] || continue

  if [[ -f "${override_file}" ]]; then
    run_root docker compose --env-file "${env_file}" -f "${compose_file}" -f "${override_file}" down -v --remove-orphans || true
  else
    run_root docker compose --env-file "${env_file}" -f "${compose_file}" down -v --remove-orphans || true
  fi
done

GATEWAY_ENV="$(env_file_for_stack gateway)"
ARK_NETWORK="arkmedia-net"
if [[ -n "${GATEWAY_ENV}" ]]; then
  ARK_NETWORK="$(awk -F= '/^ARK_NETWORK=/{print $2}' "${GATEWAY_ENV}")"
  ARK_NETWORK="${ARK_NETWORK:-arkmedia-net}"
fi
run_root docker network rm "${ARK_NETWORK}" >/dev/null 2>&1 || true

if [[ "${REMOVE_IMAGES}" == "y" || "${REMOVE_IMAGES}" == "Y" ]]; then
  echo "Step 2/4: removing project images"
  mapfile -t SERVICE_IMAGES < <(
    for s in "${STACKS[@]}"; do
      compose_file="${ROOT_DIR}/${s}/docker-compose.yml"
      env_file="$(env_file_for_stack "${s}")"
      [[ -f "${compose_file}" ]] || continue
      [[ -n "${env_file}" ]] || continue
      run_root docker compose --env-file "${env_file}" -f "${compose_file}" config 2>/dev/null | awk '/image:/ {print $2}'
    done | sort -u
  )
  SERVICE_IMAGES+=("arkmedia-gateway-caddy:latest")
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

echo "Cleaning override files"
for s in "${STACKS[@]}"; do
  run_root rm -f "${ROOT_DIR}/${s}/docker-compose.override.yml" "${ROOT_DIR}/${s}/.mounts.state"
done

echo
echo "Reset completed."
echo "Next:"
echo "  cp gateway/.env.example gateway/.env"
echo "  cp openlist/.env.example openlist/.env"
echo "  cp emby/.env.example emby/.env"
echo "  cp qbittorrent/.env.example qbittorrent/.env"
echo "  cp watchtower/.env.example watchtower/.env"
echo "  sudo ./scripts/stack.sh up"
