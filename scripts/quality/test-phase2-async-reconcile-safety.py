#!/usr/bin/env python3
"""Conservative guards for production async reconciliation. Not a live IMAP test."""
from pathlib import Path
import re
s=(Path(__file__).resolve().parents[2]/'crates/tcs-core/src/sync_engine.rs').read_text()
start=s.index('pub async fn reconcile_folder_async(')
end=s.index('pub fn hydrate_message(',start)
body=s[start:end]
c=re.sub(r'\s+', '', body)
checks={
 'account-scoped lock': 'acquire_account_operation(account_id)' in c,
 'lock precedes login': c.index('acquire_account_operation(account_id)')<c.index('login_secure('),
 'lock survives until database commit': c.index('acquire_account_operation(account_id)')<c.index('commit_guarded_reconcile('),
 'rejects empty mailbox': 'name.trim().is_empty()' in c,
 'authentication timed out': 'timeout(std::time::Duration::from_secs(45),crate::async_mail::login_secure(' in c,
 'fetch timed out': 'timeout(std::time::Duration::from_secs(120),crate::async_mail::fetch_folder_flag_state(' in c,
 'bounded logout even on error': 'timeout(std::time::Duration::from_secs(8),session.logout())' in c and c.index('session.logout()')<c.index('fetched?'),
 'remote errors propagated': 'let(remote,validity)=fetched?.map_err(' in c,
 'database uses blocking executor': c.index('spawn_blocking(')<c.index('commit_guarded_reconcile('),
 'UID validity guarded': 'reconcile_epoch_changed(stored_validity,validity)?' in c,
 'no plaintext IMAP fallback': 'crate::mail::connect' not in c,
}
for k,v in checks.items():print(('PASS' if v else 'FAIL')+': '+k)
assert all(checks.values())
for desc,needle,replacement in [
 ('drops account lock','acquire_account_operation(account_id)','acquire_account_operation(0)'),
 ('drops timeout','from_secs(120)','from_secs(0)'),
 ('drops UID guard','reconcile_epoch_changed(stored_validity,validity)?','false'),
 ('ignores fetch failure','fetched?.map_err(','fetched.map_err('),
]:
 assert needle in c
 mutant=c.replace(needle,replacement,1)
 assert mutant!=c and needle not in mutant,desc
 print('PASS: rejected adversarial mutation:',desc)
print(f'ASYNC_RECONCILE_CONTRACTS={len(checks)} PASS={sum(checks.values())} MUTATIONS=4')
