#!/usr/bin/with-contenv bash
set -euo pipefail

CONF="/config/qBittorrent/qBittorrent.conf"
mkdir -p /config/qBittorrent

if [[ ! -f "${CONF}" ]]; then
  cat > "${CONF}" <<'INI'
[Preferences]
INI
fi

# Clear any previously injected block and legacy WebUI keys (both old and new formats).
sed -i \
  -e '/^; ARKOS_WEBUI_BEGIN$/,/^; ARKOS_WEBUI_END$/d' \
  -e '/^WebUIAddress=/d' \
  -e '/^WebUIPort=/d' \
  -e '/^WebUIHostHeaderValidation=/d' \
  -e '/^WebUICSRFProtection=/d' \
  -e '/^WebUIReverseProxySupportEnabled=/d' \
  -e '/^WebUIServerDomains=/d' \
  -e '/^WebUITrustedReverseProxies=/d' \
  -e '/^WebUIAlternativeUIEnabled=/d' \
  -e '/^WebUI\\Address=/d' \
  -e '/^WebUI\\Port=/d' \
  -e '/^WebUI\\HostHeaderValidation=/d' \
  -e '/^WebUI\\CSRFProtection=/d' \
  -e '/^WebUI\\ReverseProxySupportEnabled=/d' \
  -e '/^WebUI\\ServerDomains=/d' \
  -e '/^WebUI\\TrustedReverseProxies=/d' \
  -e '/^WebUI\\AlternativeUIEnabled=/d' \
  "${CONF}"

# Append an explicit Preferences block at EOF so keys never end up under a wrong section.
cat >> "${CONF}" <<'EOF'
; ARKOS_WEBUI_BEGIN
[Preferences]
WebUI\Address=0.0.0.0
WebUI\Port=8080
WebUI\HostHeaderValidation=false
WebUI\CSRFProtection=false
WebUI\ReverseProxySupportEnabled=false
WebUI\ServerDomains=*
WebUI\TrustedReverseProxies=127.0.0.1/8;10.0.0.0/8;172.16.0.0/12;192.168.0.0/16;fc00::/7
WebUI\AlternativeUIEnabled=false
; ARKOS_WEBUI_END
EOF
