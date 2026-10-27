#!/usr/bin/env python3
"""Release gate: validate machine-readable evidence; never manufacture PASS."""
from pathlib import Path
import json, subprocess, sys, hashlib
root=Path(__file__).resolve().parents[2]
checks=[]
def check(name,ok,why):
    checks.append((name,ok,why))
gate=subprocess.run([sys.executable,str(root/'scripts/quality/async-imap-migration-gate.py')],capture_output=True,text=True)
check('legacy-dependencies-and-imports',gate.returncode==0,gate.stdout.strip())
lock=root/'Cargo.lock'
check('dependency-lockfile',lock.is_file() and lock.stat().st_size>100,'Cargo.lock must be generated and verified with Cargo')
proof=root/'validation/async-imap-compatibility-results.json'
if proof.exists():
    try:
        evidence=json.loads(proof.read_text(encoding="utf-8"))
    except (ValueError,OSError):
        evidence={}
else:
    evidence={}
for name in ('cargo_fmt','cargo_check','cargo_test','cargo_clippy','debug_build','release_build','imap_mock_integration','imap_tls_auth','imap_oauth2','imap_folder_operations','imap_message_operations','imap_sync_reconnect','tauri_ipc_regression','frontend_regression','data_upgrade_regression'):
    item=evidence.get(name,{})
    # Evidence is necessary but cannot replace executing the actual commands.
    # Absolute paths and traversal must not be able to import external logs.
    valid = False
    if isinstance(item, dict) and item.get('result') == 'PASS' and item.get('exit_code') == 0 and isinstance(item.get('log'), str) and isinstance(item.get('sha256'), str):
        candidate = (root / item['log']).resolve()
        if candidate.is_relative_to((root/'validation').resolve()) and candidate.is_file() and candidate.stat().st_size > 0:
            valid = hashlib.sha256(candidate.read_bytes()).hexdigest() == item['sha256']
    check(name, valid, 'requires executed exit_code=0 and sha256-verified nonempty log confined to validation/; review test authenticity')
for name,passed,reason in checks:
    print(('PASS' if passed else 'FAIL')+': '+name+(' — '+reason if not passed else ''))
print(f'GATE: {sum(p for _,p,_ in checks)}/{len(checks)} checks')
sys.exit(0 if all(p for _,p,_ in checks) else 1)
