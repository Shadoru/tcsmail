#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v cargo >/dev/null 2>&1; then
  echo "ERRO: cargo não encontrado." >&2
  exit 2
fi

echo "== Dependências IMAP =="
cargo tree -p tcs-core -i imap-proto || true
echo
echo "== Future incompatibility report =="
# Cargo only has a report after a build/test that emitted a report id.
if ! cargo report future-incompatibilities; then
  echo "Nenhum relatório armazenado ou o Cargo atual não disponibilizou relatório."
fi
