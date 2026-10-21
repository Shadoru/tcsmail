#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v cargo >/dev/null 2>&1 || { echo 'ERRO: cargo ausente'; exit 1; }
command -v rustc >/dev/null 2>&1 || { echo 'ERRO: rustc ausente'; exit 1; }
LOG_DIR="${TCS_RUST_LOG_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/tcs-mail}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/install-rust-gates.log"
: > "$LOG"
run_gate(){
  local title="$1"; shift
  echo "== $title =="
  if "$@" 2>&1 | tee -a "$LOG"; then
    echo "PASS"
  else
    local rc=${PIPESTATUS[0]}
    echo "ERRO: $title falhou. Saída relevante acima; log completo: $LOG" >&2
    return "$rc"
  fi
}
run_gate 'Gate Rust 1/5: cargo fmt --check' cargo fmt --all -- --check
run_gate 'Gate Rust 2/5: cargo check' cargo check --workspace --all-targets
run_gate 'Gate Rust 3/5: cargo test' cargo test --workspace --all-targets
run_gate 'Gate Rust 4/5: cargo clippy -D warnings' cargo clippy --workspace --all-targets -- -D warnings
run_gate 'Gate Rust 5/5: build release' cargo build -p tcs-mail --release
# O Cargo pode emitir avisos de compatibilidade futura de dependências transitivas.
# Eles ficam disponíveis para Diagnóstico sem poluir a instalação bem-sucedida.
if cargo report future-incompatibilities >"$LOG_DIR/rust-future-incompatibilities.log" 2>&1; then :; else true; fi
echo 'RUST GATES: PASS'
echo "Log técnico: $LOG"
