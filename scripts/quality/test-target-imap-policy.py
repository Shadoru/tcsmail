#!/usr/bin/env python3
"""After migration, legacy crates must be absent, not required."""
import pathlib, tomllib
root = pathlib.Path(__file__).resolve().parents[2]
core = tomllib.loads((root/'crates/tcs-core/Cargo.toml').read_text(encoding="utf-8"))['dependencies']
assert core['async-imap']['version'] == '=0.12.0'
assert core['async-imap']['features'] == ['runtime-tokio']
assert not core['async-imap'].get('optional', False)
assert 'imap' not in core and 'imap-proto' not in core, 'Legacy direct IMAP crate reintroduced'
lock = tomllib.loads((root/'Cargo.lock').read_text(encoding="utf-8"))['package']
assert [p['version'] for p in lock if p['name']=='async-imap']==['0.12.0']
assert [p['version'] for p in lock if p['name']=='imap-proto']==['0.17.0']
assert not [p for p in lock if p['name']=='imap']
print('PASS: IMAP production dependency policy (post-migration)')
