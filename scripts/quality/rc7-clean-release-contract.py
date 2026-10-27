#!/usr/bin/env python3
"""Release-source hygiene gate. No build claims: validates current files only."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
allowed_root = {'AGENTS.md', 'README.md', 'LICENSE'}
strays = sorted(p.name for p in root.iterdir() if p.is_file() and
                p.suffix.lower() in {'.md', '.txt', '.json'} and p.name not in allowed_root)
assert not strays, f'obsolete root documentation/manifests: {strays}'

readme = (root/'README.md').read_text(encoding='utf-8')
for relative in re.findall(r'\]\(([^)#]+)(?:#[^)]+)?\)', readme):
    if '://' not in relative:
        assert (root/relative).exists(), f'dead README reference: {relative}'
assert '0.8.2-rc8' in readme
assert '0.8.2-rc6' not in readme

workflow = (root/'.github/workflows/tcsmail-homologacao.yml').read_text(encoding='utf-8')
for tool, rel in re.findall(r'(?m)^\s*(python|node)\s+(scripts/[\w./-]+\.(?:mjs|py))\s*$', workflow):
    assert (root/rel).is_file(), f'CI job invokes missing {tool} gate: {rel}'

first = (root/'frontend/first_run.js').read_text(encoding='utf-8')
assert 'resolveFirstRunStep(' in first and 'canFinishFirstRun(connected)' in first
assert 'rememberPreferences();step=next' in first

# Prevent prior MSI version regression in the Windows local package manager.
manager = root.parent/'GERENCIADOR/central-windows.ps1'
if manager.is_file():
    text = manager.read_text(encoding='utf-8')
    assert r'0\.8\.207' in text and r'0\.8\.205' not in text

print('PASS: minimal release docs, README links, workflow targets and onboarding/Windows packaging invariants')
