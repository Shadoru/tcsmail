#!/usr/bin/env bash
# Execute from any directory. Does not read, remove or modify personal mail data.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
mkdir -p reports/phase2
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="reports/phase2/compile-${STAMP}.log"
exec > >(tee "$LOG") 2>&1
printf 'TCS Mail phase2 compile gate UTC: %s\n' "$STAMP"
if ! command -v cargo >/dev/null 2>&1; then
  echo 'BLOCKED: cargo unavailable. Install pinned Rust 1.99.0 and retry; no PASS.'
  exit 3
fi
if ! command -v rustc >/dev/null 2>&1; then
  echo 'BLOCKED: rustc unavailable; no PASS.'
  exit 3
fi
cargo --version; rustc --version
if [[ ! -f Cargo.lock ]]; then
  echo 'BLOCKED: Cargo.lock missing. Run cargo generate-lockfile in an online trusted environment, review and commit it; no PASS.'
  exit 3
fi
python3 scripts/quality/test-async-imap-transport-bridge.py || exit 1
status=0
run_gate() {
  echo "===== RUNNING: $* ====="
  "$@" || { result=$?; echo "FAIL ($result): $*"; status=1; }
}
run_gate cargo fmt --all -- --check
run_gate cargo check -p tcs-core --all-targets --features async-imap-migration --locked
run_gate cargo check --workspace --all-targets --locked
run_gate cargo test --workspace --all-targets --locked
run_gate cargo clippy --workspace --all-targets --locked -- -D warnings
run_gate python3 scripts/quality/imap-proto-single-version-gate.py
run_gate python3 scripts/quality/async-imap-migration-gate.py
if [[ "$status" -ne 0 ]]; then echo 'FAIL: phase2 gate incomplete, do not advance to phase3'; exit 1; fi
echo 'PASS: local Rust gate only; protocol, Tauri bundles and acceptance matrix still required.'
