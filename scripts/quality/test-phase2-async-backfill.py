#!/usr/bin/env python3
"""Focused source contracts; compilation and server semantics must be tested separately."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
a=(root/'crates/tcs-core/src/async_mail.rs').read_text(encoding="utf-8")
s=(root/'crates/tcs-core/src/sync_engine.rs').read_text(encoding="utf-8")
u=(root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
method=a.split('pub async fn sync_folder_before<T>(',1)[1].split('\n#[cfg(test)]',1)[0]
worker=s.split('pub async fn backfill_async(',1)[1].split(' pub fn reconcile_folder(',1)[0]
# Read the whole Tauri command body, not its first source line: rustfmt may
# move the async invocation onto another line without changing behavior.
def command_body(source, signature):
    start = source.index(signature)
    opening = source.index('{', start)
    depth = 0
    for end in range(opening, len(source)):
        if source[end] == '{':
            depth += 1
        elif source[end] == '}':
            depth -= 1
            if depth == 0:
                return source[opening:end + 1]
    raise AssertionError('Unclosed Tauri command body')
route=command_body(u, 'async fn sync_backfill(')
checks={
 'UID search strictly before cursor':'before_uid - 1' in method and 'uid_search(' in method,
 'folder/limit guarded':'checked_folder(folder)?' in method and 'limit == 0' in method,
 'no UID zero':'found.contains(&0)' in method,
 'bounded descending page':'sort_unstable_by' in method and '.take(limit)' in method,
 'UID FETCH not sequence FETCH':bool(re.search(r'\bsession\s*\.\s*uid_fetch\s*\(',method)) and not re.search(r'\bsession\s*\.\s*fetch\s*\(',method),
 'missing fetched UID fails':'received != expected' in method,
 'header-only FETCH requires MIME structure':'BODY.PEEK[HEADER] BODYSTRUCTURE' in method and 'item.bodystructure()' in method and 'item.header()' in method and 'BODY.PEEK[]' not in method,
 'unparseable header fails':'summary_from_raw(' in method and 'ok_or_else' in method,
 'account serialized before checkpoint':'acquire_account_operation' in worker and worker.index('acquire_account_operation') < worker.index('sync_state('),
 'secret off Tokio executor':'spawn_blocking' in worker and 'mail_auth_secret' in worker,
 'network bounded':'from_secs(120)' in worker and 'sync_folder_before' in worker,
 'logout bounded':'session.logout()' in worker and 'from_secs(8)' in worker,
 'UIDVALIDITY mismatch stops commit':'validity != current_validity' in worker and 'return Err(' in worker,
 'missing UIDVALIDITY cannot advance established checkpoint':bool(re.search(r'if\s+validity\.is_some\(\)\s*&&\s*validity\s*!=\s*current_validity',worker)),
 'checkpoint updated only after full remote response':worker.index('sync_folder_before') < worker.rindex('commit_guarded_sync_batch('),
 'commit off Tokio executor':bool(re.search(r'tokio::task::spawn_blocking\s*\(\s*move\s*\|\|\s*\{[^}]*\bcommit_guarded_sync_batch\s*\(',worker,re.S)),
 'Tauri uses async backfill':bool(re.search(r'\be\s*\.\s*backfill_async\s*\(\s*account_id\s*,\s*&folder\s*,\s*500\s*\)\s*\.\s*await',route, re.S)),
 'Tauri never uses legacy backfill':'e.backfill(account_id' not in route,
}
for name,ok in checks.items(): print(('PASS' if ok else 'FAIL')+': '+name)
assert all(checks.values()),'Async backfill contracts failed'
for label,mutated,predicate in [
 ('cursor accidentally includes boundary',method.replace('before_uid - 1','before_uid'),lambda x:'before_uid - 1' in x),
 ('UID FETCH downgraded',re.sub(r'session\s*\.\s*uid_fetch\s*\(','session.fetch(',method,count=1),lambda x:bool(re.search(r'\bsession\s*\.\s*uid_fetch\s*\(',x))),
 ('incomplete FETCH accepted',method.replace('received != expected','false'),lambda x:'received != expected' in x),
 ('Tauri route downgraded',re.sub(r'\be\s*\.\s*backfill_async\s*\(','e.backfill(',route,count=1),lambda x:bool(re.search(r'\be\s*\.\s*backfill_async\s*\(',x))),
]:
 assert mutated != (method if label not in ('Tauri route downgraded',) else route)
 assert not predicate(mutated)
 print('PASS: adversarial mutation rejected:',label)
print(f'ASYNC_BACKFILL_CONTRACTS={len(checks)} PASS={sum(checks.values())} MUTATIONS=4')

# The commit-specific guard must reject a commit shifted outside spawn_blocking.
assert bool(re.search(r'tokio::task::spawn_blocking\s*\(\s*move\s*\|\|\s*\{[^}]*\bcommit_guarded_sync_batch\s*\(',worker,re.S))
no_blocking_commit=re.sub(r'tokio::task::spawn_blocking\s*\(\s*move\s*\|\|\s*\{\s*store\.commit_guarded_sync_batch', 'store.commit_guarded_sync_batch',worker)
assert no_blocking_commit != worker and not bool(re.search(r'tokio::task::spawn_blocking\s*\(\s*move\s*\|\|\s*\{[^}]*\bcommit_guarded_sync_batch\s*\(',no_blocking_commit,re.S))
print('PASS: adversarial mutation rejected: SQLite commit removed from blocking executor')

# rustfmt may put the body on its own line; the extraction must still see it.
original='async fn sync_backfill(account_id:i64,folder:String) { e.backfill_async(account_id,&folder,500).await }'
formatted='async fn sync_backfill(\n  account_id: i64,\n  folder: String,\n) {\n  e.backfill_async(account_id, &folder, 500).await\n}'
for variant in (original, formatted):
    extracted=command_body(variant,'async fn sync_backfill(')
    assert re.search(r'\be\s*\.\s*backfill_async\s*\(\s*account_id\s*,\s*&folder\s*,\s*500\s*\)\s*\.\s*await',extracted,re.S)
    assert 'e.backfill(' not in extracted
print('PASS: Tauri function extraction survives multiline rustfmt')

# A server omitting UIDVALIDITY must not override a previously established
# mapping. Exercise the exact three-state guard independently.
def rejects_mismatch(stored, remote):
    return stored is not None and stored != remote
assert not rejects_mismatch(None,None)
assert not rejects_mismatch(None,42)
assert not rejects_mismatch(42,42)
assert rejects_mismatch(42,43)
assert rejects_mismatch(42,None)
unsafe_guard=re.sub(r'validity\.is_some\(\)\s*&&\s*validity\s*!=\s*current_validity', 'validity.is_some() && current_validity.is_some() && validity != current_validity',worker,count=1)
assert unsafe_guard != worker
assert not re.search(r'if\s+validity\.is_some\(\)\s*&&\s*validity\s*!=\s*current_validity',unsafe_guard)
print('PASS: established UIDVALIDITY rejects omission and adversarial downgrade')
