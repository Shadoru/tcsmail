#!/usr/bin/env python3
"""Adversarial tests of isolated, never-in-place SQLite recovery."""
import importlib.util
import json
import sqlite3
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'backup-upgrade-databases.py'
spec = importlib.util.spec_from_file_location('tcs_backup', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp)
    src, backups = base/'source', base/'snapshots'
    src.mkdir(); backups.mkdir()
    with sqlite3.connect(src/'mail.db') as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE letters(body TEXT)')
        db.execute('INSERT INTO letters VALUES (?)', ('important',))
        db.commit()
    mod.snapshot(src, backups)
    restored = base/'isolated-copy'
    mod.restore_to_new_directory(backups, restored)
    with sqlite3.connect(restored/'mail.db') as db:
        assert db.execute('SELECT body FROM letters').fetchone() == ('important',)
    assert (src/'mail.db').exists()
    try:
        mod.restore_to_new_directory(backups, restored)
        raise AssertionError('overwriting a restore must fail')
    except FileExistsError:
        pass
    linked = base/'linked-target'
    linked.symlink_to(src, target_is_directory=True)
    try:
        mod.restore_to_new_directory(backups, linked)
        raise AssertionError('symlink target must fail')
    except FileExistsError:
        pass
    bad = base/'bad'
    manifest = backups/'snapshot-manifest.json'
    old = manifest.read_text()
    data = json.loads(old); data['schema'] = True
    manifest.write_text(json.dumps(data))
    try:
        mod.restore_to_new_directory(backups, bad)
        raise AssertionError('boolean schema must fail')
    except ValueError:
        pass
    assert not bad.exists()
    manifest.write_text(old)
    with (backups/'mail.db').open('ab') as f:
        f.write(b'tamper')
    try:
        mod.restore_to_new_directory(backups, base/'tampered')
        raise AssertionError('tampered snapshot must fail')
    except ValueError:
        pass
    assert not (base/'tampered').exists()
print('PASS: isolated restore, WAL data, overwrite/symlink/tamper/schema protection')
