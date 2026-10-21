#!/usr/bin/env bash
set -Eeuo pipefail

say(){ printf '\n== %s ==\n' "$*"; }
HOME_DIR="${HOME:?HOME não definido}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME_DIR/.local/share}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME_DIR/.config}"
FORCE_PURGE=0
[[ "${1:-}" == "--force" ]] && FORCE_PURGE=1
LEGACY_DB="$XDG_DATA_HOME/com.thecreativesolver.TCSMail/agent/agent.db"
AI_DB="$XDG_DATA_HOME/tcs-mail-0.8/ai.db"

# Evita apagar conhecimento legado antes da migração integrada. --force é deliberadamente explícito.
if [[ -f "$LEGACY_DB" && $FORCE_PURGE -eq 0 ]]; then
  if [[ ! -f "$AI_DB" ]]; then
    echo "ERRO: ai.db do TCS Mail 0.8 ainda não existe. Instale/inicialize a 0.8 antes de apagar o Agent." >&2
    exit 2
  fi
  if ! python3 - "$AI_DB" "$LEGACY_DB" <<'PYCHK'
import sqlite3,sys
ai,legacy=sys.argv[1:3]
c=sqlite3.connect(ai)
key=f"python-agent:{legacy}"
ok=c.execute("SELECT 1 FROM ai_migration_log WHERE key=?",(key,)).fetchone() is not None
raise SystemExit(0 if ok else 1)
PYCHK
  then
    echo "ERRO: dados do Agent ainda não constam como migrados para a IA Rust integrada." >&2
    echo "Execute novamente o instalador da 0.8 ou use --force somente se quiser descartar esses dados." >&2
    exit 2
  fi
fi

say "Parando TCS Agent / Mail Agent legado"
if command -v systemctl >/dev/null 2>&1; then
  for unit in \
    tcs-mail-agent.service tcs-mail-agent.timer \
    mail-agent.service mail-agent.timer mail-agent-rag.service mail-agent-rag.timer; do
    systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
    rm -f "$XDG_CONFIG_HOME/systemd/user/$unit"
  done
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  systemctl --user reset-failed >/dev/null 2>&1 || true
fi

pkill -f 'tcs_mail_agent\.server' >/dev/null 2>&1 || true
pkill -f '(^|/)(tcs-mail-agent|mail-agent)( |$)' >/dev/null 2>&1 || true

say "Removendo executáveis e runtime Python legados"
rm -f "$HOME_DIR/.local/bin/tcs-mail-agent" \
      "$HOME_DIR/.local/bin/tcs-mail-agent-token" \
      "$HOME_DIR/.local/bin/mail-agent" \
      "$HOME_DIR/.local/bin/mail-agent-token"
rm -rf "$HOME_DIR/.local/lib/tcs-mail/mail-agent-python" \
       "$HOME_DIR/.local/lib/tcs-mail-agent" \
       "$HOME_DIR/.local/lib/mail-agent"

say "Removendo dados, índices, tokens e caches do Agent legado"
rm -rf "$XDG_DATA_HOME/com.thecreativesolver.TCSMail/agent" \
       "$XDG_DATA_HOME/tcs-mail-agent" \
       "$XDG_DATA_HOME/mail-agent" \
       "$HOME_DIR/.cache/tcs-mail-agent" \
       "$HOME_DIR/.cache/mail-agent" \
       "$XDG_CONFIG_HOME/tcs-mail-agent" \
       "$XDG_CONFIG_HOME/mail-agent"

# SecretStore 0.7 gravava o token com application=tcs-mail/account=mail-agent-token.
if command -v secret-tool >/dev/null 2>&1; then
  secret-tool clear application tcs-mail account mail-agent-token >/dev/null 2>&1 || true
fi

# Apaga cópias de código-fonte somente quando elas se identificam como TCS/Mail Agent.
for src in "$HOME_DIR/Projetos/tcs-mail-agent" "$HOME_DIR/Projetos/mail-agent"; do
  [[ -d "$src" ]] || continue
  if grep -RIlqE 'TCS Mail Agent|tcs_mail_agent|com\.thecreativesolver\.TCSMail' "$src" 2>/dev/null; then
    rm -rf "$src"
  fi
done

say "Verificação final"
left=0
for p in \
  "$HOME_DIR/.local/bin/tcs-mail-agent" \
  "$HOME_DIR/.local/bin/tcs-mail-agent-token" \
  "$HOME_DIR/.local/lib/tcs-mail/mail-agent-python" \
  "$XDG_DATA_HOME/com.thecreativesolver.TCSMail/agent"; do
  if [[ -e "$p" ]]; then echo "AINDA EXISTE: $p" >&2; left=1; fi
done
if pgrep -f 'tcs_mail_agent\.server' >/dev/null 2>&1; then echo "AINDA HÁ PROCESSO tcs_mail_agent.server" >&2; left=1; fi
if ((left)); then echo "PURGE TCS AGENT: FALHOU" >&2; exit 1; fi

echo "PURGE TCS AGENT: OK"
echo "O TCS Mail 0.8 usa IA integrada em Rust; este script não remove o TCS Mail, mail.db, ai.db nem credenciais IMAP/SMTP."
