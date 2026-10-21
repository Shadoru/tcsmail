#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
./scripts/validate-0.8.sh
./scripts/prepare-source.sh
./scripts/rust-gates.sh
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/tcs-mail-0.8-test"; mkdir -p "$DATA"; export TCS_MAIL_DATA_DIR="$DATA"
OLD="${XDG_DATA_HOME:-$HOME/.local/share}/tcs-mail-0.7/mail.db"
if [[ ! -f "$DATA/mail.db" && -f "$OLD" ]]; then python3 scripts/clone-initial-db.py "$OLD" "$DATA/mail.db"; fi
exec target/release/tcs-mail "$@"
