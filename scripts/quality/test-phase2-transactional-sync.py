#!/usr/bin/env python3
"""Structural regression assertions; not a substitute for Rust tests."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
db = (root / 'crates/tcs-core/src/db.rs').read_text(encoding="utf-8")
store = (root / 'crates/tcs-core/src/store.rs').read_text(encoding="utf-8")
engine = (root / 'crates/tcs-core/src/sync_engine.rs').read_text(encoding="utf-8")
assert 'pub(crate) fn upsert_message_in_tx' in db
assert 'Self::upsert_message_in_tx(&tx, m)?;' in db
assert 'Database::upsert_message_in_tx(&tx, message)' in store
assert 'tx.commit().map_err(|e| e.to_string())' in store
assert engine.count('commit_guarded_sync_batch(') >= 2
assert engine.count('commit_guarded_sync_batch(') >= 2
assert 'if let Some(expected) = expected_checkpoint' in store
assert 'Checkpoint local mudou durante a sincronização' in store
assert 'Mensagens locais sem UIDVALIDITY' in store
assert 'if reset { write_store.reset_uid_mapping_preserve_messages(' not in engine
assert 'if reset_uid_mapping {' in store
assert store.index('if reset_uid_mapping {') < store.index('for message in messages {') < store.index('tx.commit().map_err(|e| e.to_string())', store.index('if reset_uid_mapping {'))
assert 'for m in &messages { db.upsert_message(m)' not in engine
for name in ('sync_batch_commits_rows_and_checkpoint_together', 'sync_batch_rolls_back_all_rows_fts_and_cursor_on_sqlite_failure', 'sync_batch_rejects_cross_account_before_any_write'):
    assert name in store
print('PASS: structural transaction contracts (Rust execution pending)')
