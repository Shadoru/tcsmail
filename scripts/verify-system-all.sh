#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
runner(){ if command -v timeout >/dev/null 2>&1; then timeout 90s "$@"; else "$@"; fi; }
runner ./scripts/verify-system-static.sh
runner python3 scripts/verify-system-upgrade.py
runner ./scripts/verify-system-runtime.sh
echo 'THREE-WAY WHOLE-SYSTEM VERIFICATION: PASS'
