#!/usr/bin/env python3
"""Structural regression guard, not a substitute for Rust/server integration tests."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]
src = (root / 'src-tauri/src/lib.rs').read_text(encoding="utf-8")
head = src.index('async fn attach_message_as_eml(')
end = src.index('\n#[tauri::command]', head)
fn = src[head:end]
checks = {
 'async UID reading': 'tcs_core::async_mail::read_raw_by_uid' in fn,
 'no legacy UID reading': 'tcs_core::mail::fetch_raw_message_by_uid' not in fn,
 'secure session': 'tcs_core::async_mail::login_secure' in fn,
 'serialized per-account': 'acquire_account_operation(account.id)' in fn,
 'logout attempted': 'session.logout().await' in fn,
 'preserve FETCH error': 'fetched?' in fn,
 'file path safeguarded': 'Uuid::parse_str(&draft_id).is_err()' in fn,
 'filesystem on blocking executor': fn.count('spawn_blocking') >= 2,
 'atomic DB and file cleanup': 'std::fs::remove_file(&path)' in fn,
 'binary content preserved': 'std::fs::write(&path, &raw)' in fn,
 'existing Tauri result type': 'Result<AttachmentHandleView, String>' in fn,
}
for label, good in checks.items():
 print(('PASS' if good else 'FAIL') + ': ' + label)
assert all(checks.values()), 'EML asynchronous routing contract failed'
