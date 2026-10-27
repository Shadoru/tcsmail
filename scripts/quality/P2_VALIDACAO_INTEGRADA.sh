#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
LOGDIR="${TCS_P2_LOGDIR:-$ROOT/p2-validation-results}"
mkdir -p "$LOGDIR"
exec > >(tee "$LOGDIR/execution.log") 2>&1
printf 'SOURCE_ROOT=%s\n' "$ROOT"
command -v cargo >/dev/null || { echo 'BLOCKED: cargo unavailable'; exit 20; }
command -v rustc >/dev/null || { echo 'BLOCKED: rustc unavailable'; exit 20; }
# Stage 1: Cargo is authoritative for resolution, do not invent/edit lockfile.
echo '== Cargo lockfile refresh =='
cargo generate-lockfile
echo '== exact dependency graph =='
cargo tree --workspace --prefix none > "$LOGDIR/dependency-tree.txt"
python3 - <<'PY2'
from pathlib import Path
import tomllib,sys
lock=tomllib.loads(Path('Cargo.lock').read_text())
pkgs=lock['package']
versions=lambda n:[p['version'] for p in pkgs if p['name']==n]
for n in ('imap','imap-proto','async-imap'): print(n, versions(n))
valid=not versions('imap') and versions('imap-proto')==['0.17.0'] and versions('async-imap')==['0.12.0']
if not valid: sys.exit('BLOCKED: dependency graph does not meet P2 requirements')
PY2
python3 scripts/quality/test-p2-no-legacy-transport.py
# Run core explicitly before wider workspace.
cargo fmt --all -- --check
cargo check -p tcs-core --all-targets --all-features --locked
cargo test -p tcs-core --all-features --locked
cargo check --workspace --all-targets --all-features --locked
cargo test --workspace --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
# Static contracts may need modernization after legacy removal, never silently ignore failures.
python3 scripts/quality/async-imap-complete-acceptance.py
python3 scripts/quality/imap-proto-single-version-gate.py
printf 'RUST_STATIC_GATES_PASS=true\n' | tee "$LOGDIR/status.txt"
echo 'INTEGRATION AND GUI HOMOLOGATION STILL REQUIRED - not full phase approval'
