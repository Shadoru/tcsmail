#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v cargo >/dev/null 2>&1 || { echo 'ERRO: cargo ausente; não é possível normalizar os fontes.' >&2; exit 1; }
if ! cargo fmt --version >/dev/null 2>&1; then
  if command -v rustup >/dev/null 2>&1; then
    rustup component add rustfmt >/dev/null
  else
    echo 'ERRO: rustfmt indisponível; instale o componente rustfmt.' >&2
    exit 1
  fi
fi
echo '== Normalizando código Rust com rustfmt =='
cargo fmt --all
