#!/usr/bin/env python3
"""Parse frontend JS as ESM on all OS; Node --check path can miss the import mode."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
files = sorted((root/'frontend').rglob('*.js'))
assert files, 'No frontend files found'
# Adversarial self-test: ensure this parser rejects syntactically invalid ESM.
negative = subprocess.run(['node', '--input-type=module', '--check'],input='export const invalid = ;\n',capture_output=True,text=True)
assert negative.returncode != 0, 'Syntax gate did not reject invalid module'
for path in files:
    source = path.read_text(encoding='utf-8')
    check = subprocess.run(['node','--input-type=module','--check'],input=source,capture_output=True,text=True)
    if check.returncode:
        raise SystemExit(f'INVALID ESM: {path.relative_to(root)}\n{check.stderr}')
print(f'PASS: {len(files)} frontend JavaScript files parsed as ESM; invalid fixture rejected')
