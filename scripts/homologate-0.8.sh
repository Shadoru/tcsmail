#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
OUT="${TCS_HOMO_OUTPUT_DIR:-$ROOT/homologation-output/$RUN_ID}"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/tcs-mail-homologation-${RUN_ID}.XXXXXX")"
cleanup(){ rm -rf "$SANDBOX"; }
trap cleanup EXIT
mkdir -p "$OUT"
# Official run is performed on a disposable copy. The release candidate itself remains immutable.
tar -C "$ROOT" --exclude='./target' --exclude='./homologation-output' --exclude='./homologation/e2e/node_modules' --exclude='./.git' -cf - . | tar -C "$SANDBOX" -xf -
export TCS_HOMO_ORIGINAL_ROOT="$ROOT"
export TCS_HOMO_OUTPUT_DIR="$OUT"
python3 "$SANDBOX/homologation/run.py" "$@"
echo "Relatório: $OUT/homologation-result.json"
