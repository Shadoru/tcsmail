#!/usr/bin/env bash
set -Eeuo pipefail
missing=(); need_cmd(){ command -v "$1" >/dev/null 2>&1 || missing+=("cmd:$1"); }; need_pkg(){ dpkg -s "$1" >/dev/null 2>&1 || missing+=("pkg:$1"); }
for c in cargo rustc python3 pkg-config; do need_cmd "$c"; done
if command -v dpkg >/dev/null 2>&1; then for p in build-essential libssl-dev libwebkit2gtk-4.1-dev librsvg2-dev libxdo-dev libsecret-tools libnotify-bin; do need_pkg "$p"; done; fi
if ((${#missing[@]})); then printf 'Dependências ausentes:\n'; printf '  %s\n' "${missing[@]}"; exit 2; fi
echo 'OK: dependências necessárias encontradas.'
