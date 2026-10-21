#!/usr/bin/env python3
from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
a=(root/'crates/tcs-core/src/async_mail.rs').read_text()
t=(root/'src-tauri/src/lib.rs').read_text()
signature = re.search(
    r"pub\s+async\s+fn\s+list_folder_tree\s*\(\s*session\s*:\s*&mut\s+SecureSession\s*,?\s*\)",
    a,
)
assert signature is not None, 'async folder tree function not found'
body = a[signature.end():].split('fn folder_special_use(', 1)[0]
for token in ('.list(None, Some("*"))','.lsub(None, Some("*"))','try_collect','subscribed.contains','special_use: folder_special_use','selectable','delimiter','parent','display_name'):
    assert token in body,token
tauri_signature = re.search(r"async\s+fn\s+list_folder_tree\s*\(\s*account_id\s*:\s*i64", t)
assert tauri_signature is not None, 'Tauri folder tree command not found'
cmd=t[tauri_signature.end():].split('#[tauri::command]',1)[0]
assert 'tcs_core::async_mail::list_folder_tree(&mut session)' in cmd
assert 'acquire_account_operation(account.id)' in cmd
assert 'tcs_core::mail::list_folder_tree(&a,&p)' not in cmd
assert 'session.logout().await' in cmd
print('PASS: folder-tree async routing and shape inspected statically (does not prove Rust compilation or server semantics)')
