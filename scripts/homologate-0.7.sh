#!/usr/bin/env bash
set -Eeuo pipefail
echo 'Aviso: a linha atual é 0.8; encaminhando para homologate-0.8.sh.' >&2
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/homologate-0.8.sh" "$@"
