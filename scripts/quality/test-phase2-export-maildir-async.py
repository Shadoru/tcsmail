#!/usr/bin/env python3
"""Static negative/positive routing assertions; Rust compilation is separate."""
from pathlib import Path
s = Path('src-tauri/src/lib.rs').read_text(encoding="utf-8")
export=s.split('async fn export_message_eml(',1)[1].split('/// Import raw RFC822',1)[0]
maildir=s.split('async fn import_maildir(',1)[1].split('async fn export_folder_mbox(',1)[0]
checks={
 'export uses async UID peek': 'async_mail::read_raw_by_uid' in export,
 'export avoids legacy fetch': 'mail::fetch_raw_message_by_uid' not in export,
 'export serializes by account': 'acquire_account_operation' in export,
 'export attempts logout': 'session.logout().await' in export,
 'export preserves RFC822 bytes': 'std::fs::write(path, raw)' in export,
 'export handles dialog off runtime': 'spawn_blocking' in export,
 'Maildir shares append helper': 'append_imported_messages(account, password, folder, messages).await' in maildir,
 'Maildir no legacy append': 'mail::append_raw_message' not in maildir,
 'Maildir refuses symlinks': 'entry.file_type()' in maildir and 'kind.is_file()' in maildir,
 'Maildir covers cur and new': '["cur", "new"]' in maildir,
}
for key,value in checks.items(): print(('PASS' if value else 'FAIL')+': '+key)
assert all(checks.values()),'static route regression'
