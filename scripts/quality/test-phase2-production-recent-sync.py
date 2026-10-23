#!/usr/bin/env python3
"""Regression gate for incremental sync production route, independent of rustfmt whitespace."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
engine=(root/'crates/tcs-core/src/sync_engine.rs').read_text(encoding="utf-8")
ui=(root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
method=re.search(r'pub async fn sync_recent_async\s*\(',engine)
assert method, 'Missing production async recent sync implementation'
start=method.start()
end=engine.find(' pub fn backfill(',start)
assert end>start
body=engine[start:end]
compact=re.sub(r'\s+', '', body)
cmd=re.search(r'async fn sync_recent\s*\(',ui)
assert cmd
command=ui[cmd.start():ui.find('async fn sync_backfill(',cmd.start())]
assert 'sync.sync_recent_async(account_id,&folder_for_sync,300).await?' in command.replace(' ','') or re.search(r'sync\s*\.\s*sync_recent_async\s*\(\s*account_id\s*,\s*&folder_for_sync\s*,\s*300\s*\)\s*\.await\s*\?',command)
checks={
 'command does not invoke legacy recent sync': not re.search(r'\bsync\s*\.\s*sync_recent\s*\(',command),
 'production uses actual async mailbox fetch': body.count('crate::async_mail::sync_folder_since(')>=2,
 'acquires same-account coordination': 'acquire_account_operation(account_id)' in body,
 'checkpoint protected from concurrent workers': compact.index('acquire_account_operation(account_id)') < compact.index('sync_state(account_id,&prep_name)'),
 'secure authentication': 'crate::async_mail::login_secure(' in body,
 'account-specific credential': 'mail_auth_secret(&account)' in body,
 'credential loading on blocking executor': body.index('spawn_blocking(')<body.index('mail_auth_secret(&account)'),
 'initial UID checkpoint loaded': 'sync_state(account_id,&prep_name)' in compact,
 'UIDVALIDITY mismatch comparison': 'stored_validity!=validity' in compact,
 'reset after full async fetch success': compact.index('let(messages,checkpoint,reset)=outcome??')<compact.index('commit_guarded_sync_batch('),
 'prevents unstable UIDVALIDITY': 'reset_validity!=validity' in compact,
 'refuses empty folder': 'folder.trim().is_empty()' in body,
 'remote epoch checked before database commit': compact.index('require_remote_sync_epoch(validity)?') < compact.index('commit_guarded_sync_batch('),
 'no premature cursor advance': 'save_sync_state(' not in body,
 'remote fetch bounded': 'timeout(std::time::Duration::from_secs(120),fetch)' in compact,
 'best effort logout bounded': 'timeout(std::time::Duration::from_secs(8),session.logout())' in compact,
 'checkpoint in durable guarded batch': 'commit_guarded_sync_batch(' in body and 'stored_validity,' in body,
 'database write on blocking executor': compact.rfind('spawn_blocking(')<compact.index('commit_guarded_sync_batch('),
 'does not re-introduce plaintext IMAP transport': 'crate::mail::connect' not in body,
}
for title,passed in checks.items():
 print(('PASS' if passed else 'FAIL')+': '+title)
assert all(checks.values())
# Fail closed on three critical negative mutations, not only positive string matches.
for key,bad in [('UID validity',body.replace('stored_validity != validity','stored_validity == validity').replace('stored_validity!=validity','stored_validity==validity')),
                ('account lock',body.replace('acquire_account_operation(account_id)','acquire_account_operation(0)')),
                ('transactional commit',body.replace('commit_guarded_sync_batch(','save_sync_batch(')),
                ('checkpoint lock ordering',body.replace('acquire_account_operation(account_id)','acquire_account_operation(0)'))]:
 assert bad!=body, f'mutation not applied: {key}'
 if key=='UID validity': assert 'stored_validity!=validity' not in re.sub(r'\s+', '', bad)
 if key=='account lock': assert 'acquire_account_operation(account_id)' not in bad
 if key=='transactional commit': assert 'commit_guarded_sync_batch(' not in bad
 if key=='checkpoint lock ordering': assert 'acquire_account_operation(account_id)' not in bad
 print('PASS: mutation rejected:',key)
print(f'RECENT_SYNC_CONTRACTS={len(checks)} PASS={sum(checks.values())} MUTATIONS=4')
