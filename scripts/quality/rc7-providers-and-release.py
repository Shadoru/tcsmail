#!/usr/bin/env python3
"""Static cross-platform regression invariants. Not a native test substitute."""
from pathlib import Path
import json, re, sys
root=Path(__file__).resolve().parents[2]
conf=json.loads((root/'src-tauri/tauri.conf.json').read_text(encoding="utf-8"))
assert conf['version']=='0.8.2-rc7'
assert conf['identifier']=='com.thecreativesolver.TCSMail'
assert conf['bundle']['windows']['wix']['version']=='0.8.207'
rpm=conf['bundle']['linux']['rpm']['files']
assert not any('/apps/tcs-mail.png' in path for path in rpm)
work=(root/'.github/workflows/tcsmail-homologacao.yml').read_text(encoding="utf-8")
assert '0.rc7.1' in work and '--bundles rpm' in work
assert 'cargo fmt --all -- --check' in work
assert 'cargo test --locked --workspace' in work
assert 'tcsmail-package-guard.py --bundles' in work
assert 'rc7-providers-and-release.py' in work
lib=(root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
assert re.search(r'\.sync_recent_async\s*\(\s*account_id\s*,\s*&\s*folder_for_sync\s*,\s*100\s*,?\s*\)', lib, re.S), 'Recent-page Rust call missing'
assert re.search(r'\breconcile_folder_async\s*\(\s*account_id\s*,\s*&\s*folder\s*,?\s*\)\s*\.await\b', lib, re.S), 'Awaited reconciliation missing'
assert 'CREATE_NO_WINDOW' in lib
asyncmail=(root/'crates/tcs-core/src/async_mail.rs').read_text(encoding="utf-8")
assert 'display_mailbox_name' in asyncmail
assert 'name: full.clone(),' in asyncmail and 'display_name,' in asyncmail
assert 'UID SEARCH returned UID zero' in asyncmail
assert 'Incomplete IMAP FETCH batch; cursor must not advance' in asyncmail
assert 'UIDVALIDITY' in (root/'crates/tcs-core/src/sync_engine.rs').read_text(encoding="utf-8")
js=(root/'frontend/main.js').read_text(encoding="utf-8")
assert 'for(let n=0;manual&&n<historyLimit&&active();n++)' in js
assert 'recentLimit=manual?10:1' in js
assert 'folderInitialSyncKey' in js
assert 'Promise.allSettled(targets.map(t=>syncFolderHistory' in js
assert (root/'AGENTS.md').is_file()
print('PASS: RC7 source contract (all providers, UID/epoch, packagers, UI)')
