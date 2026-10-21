#!/usr/bin/env bash
# TCS Mail 0.8.2-h6-ms-oauth-rc1 full-source Linux installer: transactionally preserve personal data.
set -Eeuo pipefail
export PYTHONDONTWRITEBYTECODE=1
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ "$ROOT" == "$HOME/Projetos/tcs-mail-0.8.2-h6-ms-oauth-rc1" ]] || { echo 'BLOQUEADO: use ~/Projetos/tcs-mail-0.8.2-h6-ms-oauth-rc1'; exit 2; }
[[ ! -L "$ROOT" ]] || { echo 'BLOQUEADO: raiz simbólica'; exit 2; }
[[ "$(uname -s)" == Linux ]] || { echo 'Este script instala no Linux; fontes incluem configuração macOS/Windows'; exit 2; }
for cmd in python3 sha256sum cargo rustc node; do command -v "$cmd" >/dev/null || { echo "BLOQUEADO: falta $cmd"; exit 2; }; done
# H5: old background systemd units can start at login even with no GUI.
# Stop only known TCS units before the process guard. Never terminate manually opened user applications.
printf '\n=== Desativando inicialização automática do TCS Mail (Linux) ===\n'
if command -v systemctl >/dev/null 2>&1; then
 # Exact prefix match only; include 0.7 units missed by earlier installers.
 mapfile -t old_tcs_units < <(
  { systemctl --user list-unit-files --all --no-legend --no-pager 2>/dev/null || true;
    systemctl --user list-units --all --no-legend --no-pager 2>/dev/null || true; } |
  awk '$1 ~ /^tcs[-._]?mail.*\.(service|timer)$/ {print $1}' | sort -u
 )
 for unit in "${old_tcs_units[@]}"; do
  systemctl --user disable --now "$unit" >/dev/null 2>&1 || echo "AVISO: rever unidade TCS: $unit"
 done
fi
# Reversibly disable only clearly identified TCS desktop autostart entries.
python3 - <<'PYAUTOSTART'
from pathlib import Path
import re
home=Path.home()
folder=home/'.config'/'autostart'
if folder.is_dir() and not folder.is_symlink():
 for p in folder.glob('*.desktop'):
  if p.is_symlink() or not p.is_file(): continue
  raw=p.read_text(errors='replace')
  # Never touch unrelated desktop entries containing only a stray description.
  lines=raw.splitlines()
  match=any(re.match(r'^Exec=.*(?:=|/|\s)tcs-mail(?:\s|$)',line,re.I) for line in lines)
  named=any(line.strip().lower()=='name=tcs mail' for line in lines)
  if not (match or named):continue
  target=p.with_name(p.name+'.disabled')
  if target.exists() or target.is_symlink():
   print('AVISO: entrada TCS de autostart requer revisão manual:',p)
  else:
   p.rename(target)
   print('PASS: autostart TCS desativado (reversível):',p.name)
PYAUTOSTART
if pgrep -u "$(id -u)" -x tcs-mail >/dev/null 2>&1; then
 echo 'BLOQUEADO: TCS Mail continua em execução; feche as janelas ou use Sair no tray.'
 pgrep -a -u "$(id -u)" -x tcs-mail || true
 exit 2
fi
cd "$ROOT"
python3 - "$ROOT" <<'PYVERIFY'
import hashlib,json,sys,re
from pathlib import Path
root=Path(sys.argv[1]); data=json.loads((root/'H6MS_SHA256.json').read_text())
assert isinstance(data,dict) and len(data)>100, 'Manifesto inesperado'
for name,digest in data.items():
 p=root/name
 if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
  raise SystemExit('BLOQUEADO: divergência de fonte: '+name)
for p in list((root/'crates').rglob('*.rs'))+list((root/'src-tauri').rglob('*.rs')):
 for x in re.findall(r'include_(?:str|bytes)!\(\s*"([^"]+)"',p.read_text(errors='replace')):
  if not (p.parent/x).is_file(): raise SystemExit('BLOQUEADO: include ausente: '+str(p)+': '+x)
print(f'PASS: {len(data)} arquivos verificados, includes presentes')
PYVERIFY
printf '\n=== Dependências IMAP ===\n'
python3 - <<'PYLOCK'
import tomllib
with open('Cargo.lock','rb') as f: packages=tomllib.load(f)['package']
a=[p['version'] for p in packages if p['name']=='async-imap']; b=[p['version'] for p in packages if p['name']=='imap-proto']; old=[p for p in packages if p['name']=='imap']
assert a==['0.12.0'] and b==['0.17.0'] and not old,(a,b,old)
print('PASS: async-imap 0.12.0; imap-proto 0.17.0 exclusivo; sem imap legado')
PYLOCK
printf '\n=== Verificando JavaScript ===\n'
while IFS= read -r -d '' f; do node --check "$f"; done < <(find frontend -type f -name '*.js' -print0)
node scripts/verify-ui-contract.mjs
node scripts/verify-h4-contract.mjs
node scripts/verify-h5-contract.mjs
node scripts/verify-ms-oauth.mjs
node scripts/quality/h5-imapfix2-sync-contract.mjs
python3 scripts/quality/h5-imapfix2-theme-contrast.py
python3 scripts/quality/verify-imap-epoch-routes.py
# Historical migration gates restored and reconciled to the completed migration.
python3 scripts/quality/test-target-imap-policy.py
python3 scripts/quality/test-imap-proto-single-version-gate.py
python3 scripts/quality/test-phase2-folder-tree-migration.py
python3 scripts/quality/test-phase2-eml-async-route.py
python3 scripts/quality/test-phase2-export-maildir-async.py
python3 scripts/quality/test-phase2-reply-context-async.py
python3 scripts/quality/test-phase2-mbox-export-async.py
python3 scripts/quality/async-imap-migration-gate-test.py
python3 scripts/quality/async-imap-evidence-guard-test.py
python3 scripts/quality/phase2-backup-adversarial-test.py
python3 scripts/quality/phase2-restore-isolation-test.py
python3 scripts/quality/async-imap-runtime-contract.py
python3 scripts/quality/test-async-imap-transport-bridge.py
python3 scripts/quality/test-imap-phase2-contract-gates.py
python3 scripts/quality/test-phase2-async-mutations.py
python3 scripts/quality/test-phase2-operation-queue-safety.py
python3 scripts/quality/test-phase2-queue-matrix-expanded.py
python3 scripts/quality/test-phase2-stale-recovery-and-account-isolation.py
python3 scripts/quality/test-phase2-targeted-queue.py
python3 scripts/quality/test-phase2-late-worker-finalization.py
python3 scripts/quality/test-phase2-queue-async-production.py
python3 scripts/quality/test-phase2-uidplus-permanent-delete.py
python3 scripts/quality/test-phase2-production-recent-sync.py
python3 scripts/quality/test-phase2-async-backfill.py
python3 scripts/quality/test-phase2-background-async-routes.py
python3 scripts/quality/test-phase2-async-reconcile-safety.py
python3 scripts/quality/test-phase2-transactional-sync.py
python3 scripts/quality/imap-proto-single-version-gate.py
python3 scripts/quality/async-imap-migration-gate.py
python3 scripts/h4-source-audit.py
# Run only legacy contracts demonstrated to pass on both h3 and h4.
for test in consolidation-phase2 folder-expansion-contract multiwindow-reader-draft-contract navigation-modes r11-fix2-transfer-contract r12-composer-contract r14-fix-settings-regression r14-safety-contract r7-ai-workspace-behavior recipient-thread-reader-contract settings-functional-contract; do
 node "scripts/quality/${test}.mjs"
done
# Formatting is checked but NEVER mutates the canonical source or weakens its hash manifest.
if cargo fmt --all -- --check > /dev/null 2>&1; then echo 'PASS: formatação Rust'; else echo 'AVISO: diferenças de formatação Rust (não altera fonte; compilação/testes continuam obrigatórios)'; fi
export CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0
# keep one target location, avoid clearing preexisting cached builds.
# Prefer a shared cache. If absent, reuse the most recent trustworthy build cache
# in place until compilation succeeds; do not duplicate gigabytes of target files.
if [[ -d "$HOME/Projetos/.tcs-mail-cargo-target" && ! -L "$HOME/Projetos/.tcs-mail-cargo-target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/.tcs-mail-cargo-target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h5-imapfix1/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h5-imapfix1/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h5-imapfix1/target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h4-fix1/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h4-fix1/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h4-fix1/target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h4/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h4/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h4/target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h3-multitabs/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h3-multitabs/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h3-multitabs/target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h3-tabs-restaurado/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h3-tabs-restaurado/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h3-tabs-restaurado/target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h3-tabs-stable/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h3-tabs-stable/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h3-tabs-stable/target"
elif [[ -d "$HOME/Projetos/tcs-mail-0.8.2-h2/target" && ! -L "$HOME/Projetos/tcs-mail-0.8.2-h2/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/tcs-mail-0.8.2-h2/target"
elif [[ -d "$HOME/Projetos/TCS-Mail/target" && ! -L "$HOME/Projetos/TCS-Mail/target" ]]; then
 export CARGO_TARGET_DIR="$HOME/Projetos/TCS-Mail/target"
else
 export CARGO_TARGET_DIR="$ROOT/target"
fi
printf 'Cache de compilação: %s\n' "$CARGO_TARGET_DIR"
FREE_KB="$(df -Pk "$HOME/Projetos" | awk 'END{print $4}')"
if ((FREE_KB < 6*1024*1024)); then echo 'BLOQUEADO: menos de 6 GiB livres; não iniciar compilação'; exit 2; fi
printf '\n=== Testes Rust (obrigatórios) ===\n'
cargo test --locked --workspace --lib -j 2
printf '\n=== Verificação Rust/Tauri ===\n'
cargo check --locked --workspace --all-targets -j 2
printf '\n=== Compilação de distribuição Linux ===\n'
cargo build --release --locked -p tcs-mail --bin tcs-mail -j 2
BIN="$CARGO_TARGET_DIR/release/tcs-mail"
[[ -x "$BIN" ]] || { echo 'BLOQUEADO: executável ausente'; exit 3; }
TARGET="$HOME/.local/bin/tcs-mail"
mkdir -p -- "$HOME/.local/bin" "$HOME/.local/share/applications"
TEMP="$(mktemp "$HOME/.local/bin/.tcs-mail-h6-ms-oauth-rc1-XXXXXXXX")"
trap 'rm -f -- "$TEMP"' EXIT
install -m 755 "$BIN" "$TEMP"
# Atomic replacement; existing user databases, settings, credentials, auth are not touched.
mv -f -- "$TEMP" "$TARGET"
# Desktop launcher: use the existing blue-icon launcher when present, do not create duplicates.
# Do not delete system launchers or customized desktop entries.
APPDIR="$HOME/.local/share/applications"
python3 - "$APPDIR" "$TARGET" <<'PYLAUNCH'
from pathlib import Path
import sys
appdir=Path(sys.argv[1]); exe=sys.argv[2]
entries=[]
for p in appdir.glob('*.desktop'):
    if p.is_symlink() or not p.is_file(): continue
    text=p.read_text(errors='replace')
    if any(line.strip()=='Name=TCS Mail' for line in text.splitlines()):
        entries.append((p,text))
# Prefer existing app launcher that explicitly includes an icon.
blue=[(p,t) for p,t in entries if any(line.startswith('Icon=') and line[5:].strip() for line in t.splitlines())]
if blue:
    primary,text=blue[0]
    lines=text.splitlines()
    lines=[('Exec='+exe+' %u') if line.startswith('Exec=') else line for line in lines]
    primary.write_text('\n'.join(lines)+'\n')
    print('PASS: launcher existente com ícone preservado:',primary.name)
else:
    print('AVISO: nenhum launcher com ícone identificado; não criar duplicata sem ícone.')
# Remove only known obsolete launcher generated by h1, never unrelated user launchers.
obsolete=appdir/'com.thecreativesolver.TCSMail-h1.desktop'
if obsolete.is_file() and not obsolete.is_symlink() and obsolete not in [p for p,_ in blue]:
    contents=obsolete.read_text(errors='replace')
    if 'Comment=Cliente de e-mail TCS Mail (0.8.2-h1)' in contents and 'Icon=' not in contents:
        obsolete.unlink()
        print('PASS: launcher redundante da h1 removido')
PYLAUNCH
printf '\nPASS: TCS Mail 0.8.2-h6-ms-oauth-rc1 instalado\nExecutável: %s\n' "$TARGET"
sha256sum "$TARGET"
df -h "$HOME/Projetos"

# If the release used the prior source tree for Cargo target, move (not copy) its
# generated cache to a shared project location without wasting disk space.
SHARED_TARGET="$HOME/Projetos/.tcs-mail-cargo-target"
if [[ ( "$CARGO_TARGET_DIR" == "$HOME/Projetos/tcs-mail-0.8.2-h5-imapfix1/target" || "$CARGO_TARGET_DIR" == "$HOME/Projetos/tcs-mail-0.8.2-h4-fix1/target" || "$CARGO_TARGET_DIR" == "$HOME/Projetos/tcs-mail-0.8.2-h4/target" || "$CARGO_TARGET_DIR" == "$HOME/Projetos/tcs-mail-0.8.2-h3-multitabs/target" ) && ! -e "$SHARED_TARGET" && ! -L "$SHARED_TARGET" ]]; then
 if mv -- "$CARGO_TARGET_DIR" "$SHARED_TARGET"; then
  echo "PASS: cache compartilhado preservado em $SHARED_TARGET (sem duplicação)"
 else
  echo 'AVISO: não foi possível centralizar o cache; instalação permanece válida.'
 fi
fi
printf '\nAVISO: fontes anteriores preservadas; somente faça limpeza após homologação da revisão no Ubuntu.\n'
