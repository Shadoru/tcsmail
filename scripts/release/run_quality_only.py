#!/usr/bin/env python3
"""Execute known TCS Mail 0.8.3 quality gates, never the all-platform build orchestrator.

The historical scripts/build-0.8.3.py also builds distributables. Running it in
each selected GitHub matrix job defeats the user's format/OS checkboxes.
"""
from pathlib import Path
import argparse
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
QUALITY = ROOT/'scripts/quality'
EXACT = (
    'rc7-branding-gate.py',
    'rc8-linux-rpm-regression.py',
    'test_rc7_microsoft_connect_and_branding.py',
    'tcsmail-package-guard.py',
    'test_tcsmail_package_guard.py',
    'test_utf8_ci_sources.py',
)
PREFIXES = ('v083-utf8', 'v083-regression')
ESSENTIAL = ('test_tcsmail_package_guard.py','test_utf8_ci_sources.py')


def run(root=ROOT):
    folder=root/'scripts/quality'
    if not folder.is_dir():
        raise SystemExit('FALHA: scripts/quality ausente. Não substituirei testes por compilação indiscriminada.')
    missing=[name for name in ESSENTIAL if not (folder/name).is_file()]
    if not any(folder.glob('v083-utf8*.py')):
        missing.append('v083-utf8*.py (regressão histórica Windows)')
    if missing:
        raise SystemExit('FALHA: quality gates históricos obrigatórios ausentes: '+', '.join(missing)+'. Revise a fonte atual antes da release.')
    chosen = [folder/name for name in EXACT if (folder/name).is_file()]
    chosen.extend(sorted(path for path in folder.glob('*.py')
                         if path.name.startswith(PREFIXES) and path not in chosen))
    if len(chosen)<3:
        raise SystemExit('FALHA: gates canônicos insuficientes; revise a fonte antes de liberar instaladores.')
    for path in chosen:
        cmd=[sys.executable,str(path)]
        if path.name == 'tcsmail-package-guard.py':
            cmd.append('--source')
        print('QUALITY RUN:',path.relative_to(root),flush=True)
        subprocess.run(cmd,cwd=root,check=True)
    print('QUALITY OK:',len(chosen),'gates sem chamar scripts/build-0.8.3.py')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=ROOT)
    run(parser.parse_args().root.resolve())
