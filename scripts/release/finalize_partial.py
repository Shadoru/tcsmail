#!/usr/bin/env python3
"""Assemble selected-platform artifacts for detached GPG signing (no draft release)."""
import hashlib
import json
import os
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'_partial_inputs'
OUT=ROOT/'_partial_signed'
SELECTED={
    'tcsmail-linux': (os.getenv('BUILD_LINUX')=='true' or os.getenv('BUILD_APPIMAGE')=='true'),
    'tcsmail-windows': os.getenv('BUILD_WINDOWS')=='true',
    'tcsmail-mac-intel': os.getenv('BUILD_MAC_INTEL')=='true',
    'tcsmail-mac-arm': os.getenv('BUILD_MAC_ARM')=='true',
}
EXTS={
    'tcsmail-linux': ['.deb','.rpm'] if os.getenv('BUILD_LINUX')=='true' else [],
    'tcsmail-windows': ['.exe','.msi'],
    'tcsmail-mac-intel': ['.app.zip','.dmg'],
    'tcsmail-mac-arm': ['.app.zip','.dmg'],
}
if os.getenv('BUILD_APPIMAGE')=='true':
    EXTS['tcsmail-linux'].append('.AppImage')


def main():
    if OUT.exists():
        raise SystemExit('FALHA: artefatos parciais anteriores não serão sobrescritos.')
    OUT.mkdir()
    collected=[]
    for bucket,selected in SELECTED.items():
        folder=SOURCE/bucket
        if not selected:
            if folder.exists():
                raise SystemExit(f'FALHA: job desmarcado gerou artefatos inesperados: {bucket}')
            continue
        status=folder/'build-status.json'
        if not status.is_file():
            raise SystemExit(f'FALHA: status ausente para {bucket}')
        report=json.loads(status.read_text('utf-8'))
        files=sorted(x for x in folder.iterdir() if x.is_file() and x!=status)
        extensions=EXTS[bucket]
        if len(files)!=len(extensions) or sorted(x.name for x in files)!=sorted(report.get('installers',[])):
            raise SystemExit(f'FALHA: contagem/manifesto divergentes: {bucket}')
        for ext in extensions:
            if sum(x.name.lower().endswith(ext.lower()) for x in files)!=1:
                raise SystemExit(f'FALHA: formato obrigatório ausente/duplicado: {bucket} {ext}')
        for file in files:
            dest=OUT/file.name
            if dest.exists() or file.is_symlink() or file.stat().st_size<32768:
                raise SystemExit(f'FALHA: pacote inválido/repetido: {file}')
            shutil.copy2(file,dest)
            collected.append(dest)
    if not collected:
        raise SystemExit('FALHA: nenhuma plataforma selecionada.')
    lines=[]
    for file in sorted(collected):
        with file.open('rb') as stream:
            digest=hashlib.file_digest(stream,'sha256').hexdigest()
        lines.append(f'{digest}  {file.name}')
    (OUT/'SHA256SUMS').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    (OUT/'LEIA_ANTES.txt').write_text(
        'TCS Mail 0.8.3 | compilação parcial de INSTALADORES. Aplicativo não alterado.\n'
        'Assinaturas GPG destacadas verificáveis; NÃO é release completa.\n'
        'Consulte os respectivos jobs para verificar assinatura nativa, IMAP e OAuth.\n',encoding='utf-8')
    print(f'Aprovado: {len(collected)} instaladores selecionados para assinatura GPG.')


if __name__=='__main__':
    main()
