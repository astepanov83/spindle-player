#!/usr/bin/env bash
# Ubuntu 24.04+ blocks the user namespaces Chromium's sandbox needs, so
# `npm run dev` aborts with a chrome-sandbox error. This allows them for this
# repo's Electron only, the same way the installed .deb does for the app.
# Run once per machine: sudo ./scripts/setup-apparmor-dev.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

repo="$(cd "$(dirname "$0")/.." && pwd)"
electron="$repo/node_modules/electron/dist/electron"
target=/etc/apparmor.d/spindle-dev

cat > "$target" <<PROFILE
abi <abi/4.0>,
include <tunables/global>

profile spindle-dev "$electron" flags=(unconfined) {
  userns,

  include if exists <local/spindle-dev>
}
PROFILE

apparmor_parser --replace "$target"
echo "Loaded $target for $electron"
