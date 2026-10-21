#!/usr/bin/env python3
"""Adversarial tests for the pre-upgrade SQLite snapshot verifier."""
import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

module = Path(__file__).resolve().parents[1] / 'backup-upgrade-databases.py'
spec = importlib.util.spec_from_file_location('backup_upgrade', module)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    src = root / 'source'; src.mkdir()
    dst = root / 'backups'; dst.mkdir()
    with sqlite3.connect(src / 'mail.db') as db:
        db.execute('CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT)')
        db.execute('INSERT INTO messages(body) VALUES (?)', ('preserve-me',))
    backup.snapshot(src, dst)
    base = json.loads((dst / 'snapshot-manifest.json').read_text())
    assert len(backup.verify(dst)) == 1
    # Payload must never affect files outside backup directory.
    for bad in ('../escape.db', '/tmp/outside.db', '..\\escape.db', '.hidden.db', 'nested/path.db'):
        payload = json.loads(json.dumps(base))
        payload['files'][0]['name'] = bad
        (dst / 'snapshot-manifest.json').write_text(json.dumps(payload))
        try:
            backup.verify(dst)
            raise AssertionError(f'accepted invalid name: {bad}')
        except ValueError:
            pass
    for bad_size in ('123', True, -1):
        payload = json.loads(json.dumps(base))
        payload['files'][0]['bytes'] = bad_size
        (dst / 'snapshot-manifest.json').write_text(json.dumps(payload))
        try:
            backup.verify(dst)
            raise AssertionError(f'accepted invalid size: {bad_size!r}')
        except ValueError:
            pass
    (dst / 'snapshot-manifest.json').write_text(json.dumps(base))
    assert len(backup.verify(dst)) == 1
    with sqlite3.connect(dst / 'mail.db') as copy:
        assert copy.execute('SELECT body FROM messages').fetchone() == ('preserve-me',)
    other = root / 'other'; other.mkdir()
    (other / 'mail.db').write_bytes(b'keep')
    symlink = root / 'symlink'; symlink.mkdir()
    (symlink / 'mail.db').symlink_to(other / 'mail.db')
    try:
        backup.snapshot(src, symlink)
        raise AssertionError('accepted symlink destination')
    except FileExistsError:
        pass
    assert (other / 'mail.db').read_bytes() == b'keep'
    try:
        backup.snapshot(src, src)
        raise AssertionError('accepted same-directory snapshot')
    except ValueError:
        pass
print('PHASE2 ADVERSARIAL BACKUP: PASS')
