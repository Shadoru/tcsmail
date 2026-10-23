#!/usr/bin/env python3
"""Contracts on actual async queue code, resilient to rustfmt layout changes."""
from pathlib import Path
import re

src = (Path(__file__).resolve().parents[2] / 'crates/tcs-core/src/operations.rs').read_text(encoding="utf-8")
compact = re.sub(r'\s+', '', src)
remote = compact.split('fnremote_async_mutation(', 1)[1].split('implOperationQueue', 1)[0]
flags = compact.split('"flags"=>{', 1)[1].split('"delete"=>{', 1)[0]
move = compact.split('"move"=>{', 1)[1].split('_=>returnErr(', 1)[0]
delete = compact.split('"delete"=>{', 1)[1].split('"move"=>{', 1)[0]

# Accept both forms of fully-qualified function call; reject a sequence-based
# mutation, a missing error propagation, or local deletion before remote work.
def remote_call(body, method):
    return bool(re.search(r'(?:crate::)?async_mail::' + method + r'\(&mutsession,&identity\.folder,identity\.uid,', body))

def ordered_remote_before_delete(branch, destination):
    # rustfmt may add a trailing comma to a multiline Rust function call.
    # Require propagation of the Result (?) before the destructive local SQL.
    escaped = re.escape(destination)
    pattern = (
        r'remote_async_mutation\(&account,&password,&self\.store,mid,'
        r'captured\.as_ref\(\)\.ok_or\(IDENTITY_ERROR\)\?,RemoteMutation\{'
        r'seen:None,starred:None,destination:Some\(' + escaped + r'\),?\},?\)\?'
    )
    match = re.search(pattern, branch)
    local = re.search(r'remove_message_if_current\(', branch)
    return bool(match and local and match.end() < local.start())

checks = {
    'async queue independent of migration feature': '#[cfg(feature="async-imap-migration")]' not in compact and '#[cfg(not(feature="async-imap-migration"))]' not in compact,
    'dedicated Tokio runtime': 'tokio::runtime::Builder::new_current_thread()' in compact,
    'no nested block_on on caller': 'std::thread::scope(' in compact and 'scope.spawn(' in compact,
    'account serialization': 'acquire_account_operation(account.id)' in remote,
    'encrypted authentication': 'async_mail::login_secure(account,credential)' in remote,
    'remote UID move': remote_call(remote, 'move_uid_if_epoch'),
    'remote UID flags': remote_call(remote, 'set_message_flags_uid_if_epoch'),
    'remote operation bounded': 'Duration::from_secs(90)' in remote,
    'logout bounded': 'Duration::from_secs(5),session.logout()' in remote,
    'logout attempted on IMAP error': remote.index('session.logout()') < remote.rfind('result?'),
    'move linked to production': compact.count('remote_async_mutation(&account,&password,&self.store,mid,') >= 3,
    'permanent deletion uses async UIDPLUS': 'remote_async_permanent_delete(' in delete and 'mail::delete_permanently(' not in delete,
    'move error before local deletion': ordered_remote_before_delete(move, 'target'),
    'trash error before local deletion': ordered_remote_before_delete(delete, '&trash'),
    'destructive failures quarantined': '"needs_review"' in src,
    'late worker guard': "AND state='running'" in src,
    'no synchronous queue fallback': re.search(r'(?<!async_)mail::(?:move_message|delete_permanently|set_seen|set_starred)\(', compact) is None,
    'local-only flags skip OAuth': flags.index('ifseen.is_some()||starred.is_some(){') < flags.index('mail_auth_secret(&account)') and flags.index('db.set_message_flags(') > flags.index('mail_auth_secret(&account)'),
    'move target validated before OAuth': move.index('target.trim().is_empty()') < move.index('mail_auth_secret(&account)'),
    'trash target validated before OAuth': delete.index('trash.trim().is_empty()') < delete.index('mail_auth_secret(&account)'),
    'trash cannot equal source': 'trash==message.folder' in delete,
}
for label, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ': ' + label)
assert all(checks.values()), 'Async queue production contract failed'

# Adversarial tests: each must invalidate its corresponding assertion.
mutants = {
    'flags downgraded to sequence API': (remote.replace('set_message_flags_uid_if_epoch', 'set_message_flags'), lambda x: remote_call(x, 'set_message_flags_uid_if_epoch')),
    'move downgraded to sequence API': (remote.replace('move_uid_if_epoch', 'move'), lambda x: remote_call(x, 'move_uid_if_epoch')),
    'move error ignored': (re.sub(r'Some\(target\),?\},?\)\?', 'Some(target),});', move, count=1), lambda x: ordered_remote_before_delete(x, 'target')),
    'trash error ignored': (re.sub(r'Some\(&trash\),?\},?\)\?', 'Some(&trash),});', delete, count=1), lambda x: ordered_remote_before_delete(x, '&trash')),
    'remote move after local deletion': ('remove_message_if_current(' + move.replace('remove_message_if_current(', ''), lambda x: ordered_remote_before_delete(x, 'target')),
}
for label, (mutant, predicate) in mutants.items():
    original = remote if label.startswith(('flags downgraded', 'move downgraded')) else delete if label.startswith('trash') else move
    assert mutant != original, 'Mutation did not change source: ' + label
    if predicate(mutant):
        raise AssertionError('Unsafe mutation not rejected: ' + label)
    print('PASS: mutation rejected: ' + label)
print(f'QUEUE_ASYNC_CONTRACTS={len(checks)} PASS={sum(checks.values())} MUTATIONS={len(mutants)}')

# Simulate both rustfmt layouts in the exact production branches: contract
# must remain stable when a trailing comma is added to a multiline call.
for name, body, target in [('move', move, 'target'), ('trash', delete, '&trash')]:
    variant = re.sub(r'Some\(' + re.escape(target) + r'\),?\},?\)\?',
                     'Some(' + target + '),},)?', body, count=1)
    if not ordered_remote_before_delete(variant, target):
        raise AssertionError('rustfmt trailing-comma regression: ' + name)
    if ordered_remote_before_delete(re.sub(r'Some\(' + re.escape(target) + r'\),?\},?\)\?',
                                           'Some(' + target + '),},)', variant, count=1), target):
        raise AssertionError('missing error propagation tolerated: ' + name)
print('PASS: both rustfmt trailing-comma variants and both missing-? mutations')
