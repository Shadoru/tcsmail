#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "$(uname -s)" == "Darwin" ]] || { echo "ERRO: execute este script no macOS." >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "ERRO: Rust/Cargo ausente. Instale Rust e Xcode Command Line Tools." >&2; exit 1; }
command -v xcode-select >/dev/null 2>&1 && xcode-select -p >/dev/null 2>&1 || { echo "ERRO: Xcode Command Line Tools ausente (xcode-select --install)." >&2; exit 1; }
rustup component add rustfmt clippy >/dev/null 2>&1 || true
./scripts/validate-0.8.sh
./scripts/prepare-source.sh
./scripts/rust-gates.sh
if ! cargo tauri --version >/dev/null 2>&1; then cargo install tauri-cli --version '^2' --locked; fi
cargo tauri build
printf '\nBundle macOS gerado em src-tauri/target/release/bundle/ (app/dmg).\n'
