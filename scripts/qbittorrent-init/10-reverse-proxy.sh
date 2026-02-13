#!/usr/bin/with-contenv bash
set -euo pipefail

CONF_FILE="/config/qBittorrent/qBittorrent.conf"
mkdir -p "$(dirname "${CONF_FILE}")"
touch "${CONF_FILE}"

set_cfg() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${CONF_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${CONF_FILE}"
  else
    echo "${key}=${value}" >> "${CONF_FILE}"
  fi
}

# Reverse-proxy compatibility. Avoids common "Unauthorized" on proxied access.
set_cfg 'WebUI\\ReverseProxySupportEnabled' 'true'
set_cfg 'WebUI\\HostHeaderValidation' 'false'
set_cfg 'WebUI\\CSRFProtection' 'false'
