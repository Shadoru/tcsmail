#!/usr/bin/env bash
set -Eeuo pipefail
PURGE=0
[[ "${1:-}" == "--purge-data" ]] && PURGE=1
say(){ printf '\n== %s ==\n' "$*"; }
say "Desinstalando somente TCS Mail 0.6.2 (GTK)"
# Stop/remove legacy background units only.
for unit in tcs-mail-background.timer tcs-mail-background.service tcs-mail-idle.service; do systemctl --user disable --now "$unit" >/dev/null 2>&1 || true; rm -f "$HOME/.config/systemd/user/$unit"; done
systemctl --user daemon-reload >/dev/null 2>&1 || true
# Remove legacy launchers/binaries. Never remove 0.7 names.
rm -f "$HOME/.local/bin/tcs-mail" "$HOME/.local/bin/tcs-mail.previous"
rm -f "$HOME/.local/share/applications/com.thecreativesolver.TCSMail.desktop"
rm -f "$HOME/.local/share/applications/tcs-mail.desktop"
for sz in 32x32 48x48 64x64 128x128 256x256 512x512 scalable; do rm -f "$HOME/.local/share/icons/hicolor/$sz/apps/com.thecreativesolver.TCSMail.png" "$HOME/.local/share/icons/hicolor/$sz/apps/tcs-mail.png"; done
update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
if ((PURGE)); then
  echo "ATENÇÃO: --purge-data solicitado."
  read -r -p "Digite APAGAR para remover também dados/configurações 0.6.2: " ans
  if [[ "$ans" == "APAGAR" ]]; then rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/tcs-mail" "${XDG_CONFIG_HOME:-$HOME/.config}/tcs-mail"; else echo "Dados preservados."; fi
else
  echo "Dados, banco, contas e credenciais foram PRESERVADOS. Para apagá-los explicitamente: $0 --purge-data"
fi
echo "TCS Mail 0.6.2 GTK removido. TCS Mail 0.8 não foi alterado."
