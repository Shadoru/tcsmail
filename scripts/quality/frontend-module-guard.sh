#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

command -v node >/dev/null 2>&1 || {
  echo "ERRO: node não encontrado; impossível validar módulos ES do frontend." >&2
  exit 2
}

for file in frontend/*.js; do
  node --input-type=module --check < "$file"
done

echo "FRONTEND MODULE GUARD: PASS"
