#!/usr/bin/env python3
"""Fail-closed UIDPLUS production routing guards (static, not live IMAP tests)."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
a = (root/'crates/tcs-core/src/async_mail.rs').read_text()
o = (root/'crates/tcs-core/src/operations.rs').read_text()


def function(source, name):
    match = re.search(r'(?:pub\s+)?(?:async\s+)?fn\s+'+re.escape(name)+r'(?:\s*<[^>]+>)?\s*\(', source)
    assert match, f'Missing {name}'
    start = source.index('{', match.end())
    depth = 0
    for index in range(start, len(source)):
        if source[index] == '{': depth += 1
        if source[index] == '}':
            depth -= 1
            if depth == 0: return source[start:index+1]
    raise AssertionError(f'Unbalanced body {name}')


def check(source_a, source_o):
    # Normalize formatting, including rustfmt trailing commas and line breaks.
    # Preserve punctuation and ? to detect missing error propagation.
    def normalized(code):
        return re.sub(r"\s+", "", code)

    body = normalized(function(source_a, 'delete_uid_permanently_impl'))
    guarded = normalized(function(source_a, 'delete_uid_permanently_if_epoch'))
    worker = normalized(function(source_o, 'remote_async_permanent_delete'))
    deleting = normalized(source_o[source_o.find('if permanent {'):source_o.find('} else {', source_o.find('if permanent {'))])
    checks = {
       'explicit uid validation': 'checked_uid(uid)?' in body,
       'folder validation': 'checked_folder(folder)?' in body,
       'UIDPLUS advertised': 'capabilities.has_str("UIDPLUS")' in body,
       'fail closed without UIDPLUS': body.find('if!capabilities.has_str') >= 0 and body.find('session.select(') >= 0 and body.find('if!capabilities.has_str') < body.find('session.select('),
       'select exact folder': 'session.select(folder).await' in body,
       'remote UID existence confirmation': 'session.uid_search(' in body and 'found.contains(&parsed_uid)' in body,
       'UID STORE only': 'session.uid_store(' in body and 'session.store(' not in body,
       'mark deleted by UID': re.search(r'\+FLAGS\.SILENT\([^)]*Deleted\)', body) is not None,
       'consume store stream': re.search(r'store\.try_collect\(\)\.await', body) is not None,
       'UID EXPUNGE only': re.search(r'session\.uid_expunge\(&uid,?\)\.await', body) is not None,
       'no broad expunge': re.search(r'(?<!uid_)expunge\(', body) is None,
       'consume expunge stream': re.search(r'expunged\.try_collect\(\)\.await', body) is not None,
       'validate before mutating': body.find('found.contains(&parsed_uid)') >= 0 and body.find('session.uid_store(') >= 0 and body.find('found.contains(&parsed_uid)') < body.find('session.uid_store('),
       'optional epoch checked before mutating': 'mailbox.uid_validity!=expected_validity' in body and body.find('mailbox.uid_validity!=expected_validity') < body.find('session.uid_store('),
       'guarded path requires nonzero epoch': 'expected_validity==0' in guarded and 'Some(expected_validity)' in guarded,
       'mark before expunge': body.find('session.uid_store(') >= 0 and body.find('session.uid_expunge(') >= 0 and body.find('session.uid_store(') < body.find('session.uid_expunge('),
       'dedicated async runtime': 'new_current_thread()' in worker,
       'account operation coordination': 'acquire_account_operation(account.id)' in worker,
       'secure login': 'login_secure(account,credential)' in worker,
       'remote timeout': 'from_secs(90)' in worker,
       'bounded logout': 'from_secs(5),session.logout()' in worker,
       'original failure preserved': 'result?.map_err' in worker,
       'queue routes permanent deletion to async': 'remote_async_permanent_delete(' in deleting,
       'no silent legacy deletion': 'mail::delete_permanently(' not in deleting,
       'local removal after remote success': 'remove_message_if_current(' in source_o and source_o.index('remote_async_permanent_delete(', source_o.find('if permanent {')) < source_o.index('remove_message_if_current(', source_o.find('if permanent {')),
       'uncertain destructive failure quarantined': 'kind == "move" || kind == "delete"' in source_o and '"needs_review"' in source_o,
    }
    return checks

checks = check(a, o)
for label, passed in checks.items(): print(('PASS' if passed else 'FAIL')+': '+label)
assert all(checks.values()), 'UIDPLUS guards failed'
# Mutations must demonstrably change the target Rust body, regardless of
# rustfmt whitespace or trailing commas; otherwise they are invalid evidence.
def replace_once_regex(source, expression, replacement, label):
    updated, count = re.subn(expression, replacement, source, count=1, flags=re.S)
    assert count == 1 and updated != source, f'Mutation not applied exactly once: {label}'
    return updated

mutations = {
    'broad expunge instead of UID': (replace_once_regex(a, r'session\s*\.\s*uid_expunge\s*\(\s*&uid\s*,?\s*\)\s*\.\s*await', 'session.expunge().await', 'broad expunge'), o),
    'remove capability guard': (replace_once_regex(a, r'if\s*!\s*capabilities\s*\.\s*has_str\s*\(\s*"UIDPLUS"\s*\)', 'if false', 'UIDPLUS capability'), o),
    'skip UID existence check': (replace_once_regex(a, r'if\s*!\s*found\s*\.\s*contains\s*\(\s*&parsed_uid\s*\)', 'if false', 'UID existence'), o),
    'skip selected UID store': (replace_once_regex(a, r'session\s*\.\s*uid_store\s*\(\s*&uid\s*,', 'session.store(&uid,', 'UID STORE'), o),
    'remove remote error propagation': (a, replace_once_regex(o, r'result\s*\?\s*\.\s*map_err\s*\(\s*\|e\|\s*e\s*\.\s*to_string\s*\(\s*\)\s*\)', 'Ok(())', 'error propagation')),
    'remove account coordination': (a, o.replace(function(o, 'remote_async_permanent_delete'), replace_once_regex(function(o, 'remote_async_permanent_delete'), r'acquire_account_operation\s*\(\s*account\s*\.\s*id\s*\)', 'acquire_account_operation(-1)', 'account isolation'), 1)),
}
for name, (mut_a, mut_o) in mutations.items():
    assert mut_a != a or mut_o != o, f'Mutation did not change code: {name}'
    assert not all(check(mut_a, mut_o).values()), f'Unsafe mutation evaded guards: {name}'
    print('PASS: mutation applied and rejected: '+name)
print(f'UIDPLUS_DELETE_CONTRACTS={len(checks)} PASS={sum(checks.values())} MUTATIONS={len(mutations)}')

# Explicitly exercise both rustfmt-compatible spellings: no comma vs comma.
for label, variant in [('single-line', 'session.uid_expunge(&uid).await'), ('trailing-comma', 'session.uid_expunge(\n    &uid,\n).await')]:
    candidate, matched = re.subn(r'session\s*\.\s*uid_expunge\s*\(\s*&uid\s*,?\s*\)\s*\.\s*await', lambda _match: variant, a, count=1, flags=re.S)
    assert matched == 1, f'Missing UID EXPUNGE for {label}'
    assert all(check(candidate,o).values()), f'Valid rustfmt form rejected: {label}'
    mutated = replace_once_regex(candidate, r'session\s*\.\s*uid_expunge\s*\(\s*&uid\s*,?\s*\)\s*\.\s*await', 'session.expunge().await', label+' unsafe')
    assert not all(check(mutated,o).values()), f'Broad EXPUNGE undetected: {label}'
    print(f'PASS: {label} recognized, unsafe broad EXPUNGE rejected')
