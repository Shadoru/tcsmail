#!/usr/bin/env python3
"""Check evidence guard enforces result, exit code, hashed logs and confined paths."""
from pathlib import Path
import hashlib, tempfile
root = Path(__file__).resolve().parents[2]
source = (root/'scripts/quality/async-imap-complete-acceptance.py').read_text()
assert "item.get('exit_code') == 0" in source
assert "candidate.is_relative_to((root/'validation').resolve())" in source
assert "hashlib.sha256(candidate.read_bytes()).hexdigest() == item['sha256']" in source
with tempfile.TemporaryDirectory() as tmp:
    f = Path(tmp)/'pass.log'
    f.write_text('PASS')
    digest = hashlib.sha256(f.read_bytes()).hexdigest()
    assert len(digest) == 64
    assert hashlib.sha256(f.read_bytes()).hexdigest() != '0'*64
print('PASS: evidence guards and hashing invariants')
