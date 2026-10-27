#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
echo '== Historical Parts 38-47 regression carried into 0.8 =='
./scripts/validate-0.8.sh
python3 scripts/quality/browser-journeys-41-44.py
python3 scripts/quality/preservation-0.8-contract.py
if [[ "${TCS_SKIP_RUST_GATES:-0}" != "1" ]] && command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then ./scripts/rust-gates.sh; else echo 'RUST GATES: PENDING/DEFERRED'; fi
echo 'PARTS 38-47 REGRESSION ON 0.8: PASS'
