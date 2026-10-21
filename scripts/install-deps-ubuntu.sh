#!/usr/bin/env bash
set -Eeuo pipefail
echo 'As dependências são instaladas automaticamente por ./scripts/install.sh.'
exec "$(cd "$(dirname "$0")" && pwd)/install.sh"
