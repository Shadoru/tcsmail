#!/usr/bin/env bash
set -Eeuo pipefail
for c in python3 cargo rustc node npm; do command -v "$c" >/dev/null || { echo "BLOCKED: $c ausente" >&2; exit 2; }; done
python3 --version; rustc --version; cargo --version; node --version; npm --version
pkg-config --modversion webkit2gtk-4.1 2>/dev/null || { echo 'BLOCKED: WebKitGTK 4.1 development package ausente' >&2; exit 2; }
echo 'HOMOLOGATION PREFLIGHT: PASS'
