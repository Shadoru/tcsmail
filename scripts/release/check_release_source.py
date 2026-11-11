#!/usr/bin/env python3
"""Accept signed INSTALLER revision tags; application version MUST remain exactly 0.8.3."""
import json
import hashlib
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAG = os.getenv('RELEASE_TAG', '')
if not re.fullmatch(r'installers-0\.8\.3-r[1-9][0-9]*', TAG):
    raise SystemExit(f'FALHA: tag inválida: {TAG!r}')
base = '0.8.3'  # fixed application version; installer revision is separate
conf = ROOT / 'src-tauri' / 'tauri.conf.json'
if not conf.is_file():
    raise SystemExit('FALHA: tauri.conf.json ausente')
version = str(json.loads(conf.read_text('utf-8')).get('version',''))
if version != base:
    raise SystemExit(f'FALHA: aplicativo deve ser 0.8.3, mas tauri.conf.json informa {version!r}; tag {TAG} é somente dos instaladores')
for f in ('src-tauri/Cargo.toml', 'src-tauri/icons/icon.png',
          'scripts/build-0.8.3.py', 'scripts/release/prepare_branding.py'):
    if not (ROOT/f).is_file():
        raise SystemExit(f'FALHA: arquivo indispensável ausente: {f}')
locks=[name for name in ('Cargo.lock','src-tauri/Cargo.lock') if (ROOT/name).is_file()]
if len(locks)!=1:
    raise SystemExit('FALHA: a tag precisa incluir um único Cargo.lock (raiz do workspace ou src-tauri).')
subprocess.run(['git','ls-files','--error-unmatch','--',locks[0]],cwd=ROOT,
               check=True,capture_output=True)
logo_hash = hashlib.sha256((ROOT/'src-tauri/icons/icon.png').read_bytes()).hexdigest()
if logo_hash != 'ae5d9f85330b3c650c87d92d4633dfe2454b4a0f7565783c9a361f895d6e8992':
    raise SystemExit('FALHA: ícone não corresponde ao original canônico TCS Mail 0.8.3; bloqueado')
# npm, pnpm, Yarn, Bun ou frontend estático: política compartilhada com o instalador.
subprocess.run(['python3',str(ROOT/'scripts/release/dependency_strategy.py'),
                'check','--root',str(ROOT)],check=True)
# A tag precisa estar assinada. Importar a chave pública embarcada antes de chamar git verify-tag.
key = ROOT / '.github' / 'keys' / 'tcs-mail-release-public.asc'
if not key.is_file():
    raise SystemExit('FALHA: chave pública da release ausente.')
allowed_primary_fpr = '1674F96ACE21F6A87434398ADD1974F061C5B37E'
inspection = subprocess.run(['gpg','--batch','--show-keys','--with-colons',str(key)],
                            check=True,capture_output=True,text=True).stdout
primary_fprs = [line.split(':')[9] for line in inspection.splitlines()
                if line.startswith('fpr:')]
public_keys = [line for line in inspection.splitlines() if line.startswith('pub:')]
if len(public_keys) != 1 or not primary_fprs or primary_fprs[0] != allowed_primary_fpr:
    raise SystemExit('FALHA: chave pública da release não é a chave canônica conhecida.')
subprocess.run(['gpg','--batch','--import',str(key)], check=True, stdout=subprocess.DEVNULL)
verified=subprocess.run(['git','verify-tag','--raw',TAG], cwd=ROOT, capture_output=True,text=True)
if verified.returncode:
    raise SystemExit('FALHA: assinatura da tag inválida: '+verified.stderr)
signatures = []
for line in (verified.stdout+'\n'+verified.stderr).splitlines():
    if '[GNUPG:] VALIDSIG ' in line:
        fields=line.split('[GNUPG:] VALIDSIG ',1)[1].split()
        signatures.append((fields[0].upper(),fields[9].upper() if len(fields)>=10 else ''))
if signatures != [('EB55887A1A9923E4D2FE4803B03A894B9F604781',allowed_primary_fpr)]:
    raise SystemExit('FALHA: tag não foi assinada EXCLUSIVAMENTE pela subchave GPG autorizada.')
trusted_sha=os.getenv('TCS_TRUSTED_SOURCE_SHA','').strip()
if trusted_sha:
    actual=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,check=True,capture_output=True,text=True).stdout.strip()
    if not re.fullmatch(r'[a-fA-F0-9]{40}',trusted_sha) or actual!=trusted_sha:
        raise SystemExit('FALHA: checkout divergente do SHA imutável validado pelo workflow.')
else:
    subprocess.run(['git','fetch','--no-tags','origin','main'], cwd=ROOT, check=True)
    check = subprocess.run(['git','merge-base','--is-ancestor','HEAD','FETCH_HEAD'], cwd=ROOT)
    if check.returncode != 0:
        raise SystemExit('FALHA: tag não consta do histórico de origin/main.')
print('Tag assinada aprovada, origem main verificada e versão Tauri correspondente:', TAG)
