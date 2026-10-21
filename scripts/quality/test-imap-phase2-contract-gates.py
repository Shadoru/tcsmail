#!/usr/bin/env python3
"""Regression checks for the candidate-specific static guard, not a protocol test."""
import pathlib, subprocess, sys, tomllib
root=pathlib.Path(__file__).resolve().parents[2]
p=root/'scripts/quality/async-imap-runtime-contract.py'
t=p.read_text()
assert "'Pinned async-imap 0.12.0'" in t
assert 'Pinned async-imap 0.11.3' not in t
m=tomllib.loads((root/'crates/tcs-core/Cargo.toml').read_text())
assert m['dependencies']['async-imap']['version']=='=0.12.0'
for name in ('async-imap-runtime-contract.py','test-async-imap-transport-bridge.py'):
    run=subprocess.run([sys.executable,str(root/'scripts/quality'/name)],cwd=root,capture_output=True,text=True)
    assert run.returncode == 0,(name,run.stdout,run.stderr)
    print('PASS',name)
lock=tomllib.loads((root/'Cargo.lock').read_text())
versions=sorted(p['version'] for p in lock['package'] if p['name']=='imap-proto')
assert versions == ['0.17.0'], f'Unexpected imap-proto versions: {versions}'
assert not any(p['name']=='imap' for p in lock['package']), 'Legacy imap remains in lock'
print('PASS: sole imap-proto 0.17.0; legacy imap absent')
