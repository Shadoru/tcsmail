#!/usr/bin/env python3
"""Run all restored historical IMAP contracts on Windows/macOS/Linux."""
from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[2]
source=(root/'scripts/quality/run-imap-012-full-evaluation.sh').read_text(encoding="utf-8")
part=source.split('for test in \\\n',1)
# This script deliberately lists targets through parsing the documented shell gate.
if len(part)!=2:
    # Portable fallback: split without depending on platform-specific newlines.
    part=source.split('for test in ',1)
assert len(part)==2,'Migration gate list unavailable'
items=part[1].split('\ndo\n',1)[0]
paths=[line.strip().rstrip('\\').strip() for line in items.splitlines() if line.strip().rstrip('\\').strip().endswith('.py')]
assert len(paths)==29, f'expected 29 historical gates, got {len(paths)}'
for test in paths:
    print('TEST',test,flush=True)
    subprocess.run([sys.executable,str(root/test)],cwd=root,check=True)
print(f'PASS: {len(paths)} historical IMAP gates')
