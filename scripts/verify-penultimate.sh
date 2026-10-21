#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo '== 0.8 integrated pre-release verification =='
./scripts/verify-system-static.sh
python3 scripts/verify-system-upgrade.py
./scripts/verify-system-runtime.sh
if [[ "${TCS_SKIP_RUST_GATES:-0}" != "1" ]] && command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then ./scripts/rust-gates.sh; else echo 'RUST GATES: PENDING/DEFERRED'; fi
echo 'TCS MAIL 0.8 PRE-RELEASE AVAILABLE GATES: PASS'
