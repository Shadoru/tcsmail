#!/usr/bin/env python3
"""Prevent regression to destructive/non-diagnostic RPM extraction."""
from pathlib import Path
p=Path(__file__).with_name('rc2-presentation-verify.py').read_text(encoding='utf-8')
assert "['cpio','-idmu'" in p
assert "check''s_payload" not in p
assert 'checks_payload(files, rpm=True)' in p
assert 'rpm2cpio=' in p and 'cpio stderr=' in p
print('PASS: RPM extraction and payload assertions retained')
