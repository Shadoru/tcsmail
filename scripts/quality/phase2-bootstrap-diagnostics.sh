#!/usr/bin/env bash
# Diagnostic bootstrap: NEVER a phase-2 release gate or an approval.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
mkdir -p reports/phase2
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="reports/phase2/bootstrap-${STAMP}.log"
exec > >(tee "$LOG") 2>&1
printf 'TCS Mail diagnostic bootstrap: %s\n' "$STAMP"
if ! command -v cargo >/dev/null 2>&1 || ! command -v rustc >/dev/null 2>&1; then
  echo 'BLOCKED: Rust toolchain missing; no compilation performed.'
  exit 3
fi
cargo --version; rustc --version
if [[ ! -f Cargo.lock ]]; then
  echo 'DIAGNOSTIC ONLY: generating candidate Cargo.lock (must be reviewed and committed).'
  cargo generate-lockfile || { echo 'FAIL: Cargo.lock resolution'; exit 1; }
else
  echo 'Existing Cargo.lock found; preserving it.'
fi
python3 scripts/quality/test-async-imap-transport-bridge.py || exit 1
python3 scripts/quality/imap-proto-single-version-gate.py --audit || exit 1
result=0
for step in fmt core_check check test clippy; do
  case "$step" in
    fmt) args=(fmt --all -- --check) ;;
    core_check) args=(check -p tcs-core --all-targets --features async-imap-migration --locked) ;;
    check) args=(check --workspace --all-targets --locked) ;;
    test) args=(test --workspace --all-targets --locked) ;;
    clippy) args=(clippy --workspace --all-targets --locked -- -D warnings) ;;
  esac
  echo "=== DIAGNOSTIC: cargo ${args[*]} ==="
  cargo "${args[@]}" || { code=$?; echo "FAIL: $step returned $code"; result=1; }
done
echo 'Diagnostic results are not migration acceptance. The legacy backend and protocol tests remain pending.'
exit "$result"
