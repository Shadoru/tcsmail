#!/usr/bin/env python3
"""Validate the production MBOX async route and test that every guard is necessary.

Whitespace and rustfmt brace layout must not affect the missing-message guard.
This is a structural check, not a replacement for IMAP integration testing.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'src-tauri/src/lib.rs').read_text(encoding="utf-8")
manifest = (ROOT / 'src-tauri/Cargo.toml').read_text(encoding="utf-8")
runner = (ROOT / 'scripts/quality/run-imap-012-full-evaluation.sh').read_text(encoding="utf-8")
start = source.index('async fn export_folder_mbox(')
end = source.index('\n\n#[tauri::command]', start)
route = source[start:end]

# Allow rustfmt's `|| { format!(...) }` as well as `|| format!(...)`.
# Match the guard adjacent to the specific failure message, not an unrelated
# ok_or_else (e.g. the database lookup or destination validation).
MISSING_GUARD = re.compile(
    r'\.\s*ok_or_else\s*\(\s*\|\|\s*(?:\{\s*)?format!\s*\(\s*"Mensagem\s+UID',
    re.S,
)


def expected_checks(src):
    return {
        'no sync backend fetch': 'tcs_core::mail::fetch_raw_message_by_uid' not in src,
        'async UID reading': 'tcs_core::async_mail::read_raw_by_uid_if_epoch(' in src,
        'single session acquired': src.count('login_secure(&account, &credential)') == 1,
        'operation lock': 'acquire_account_operation(account.id)' in src,
        'logout': 'session.logout().await' in src,
        'dialog off runtime': 'spawn_blocking(||' in src and 'save_file()' in src,
        'database work off runtime': bool(re.search(r'spawn_blocking\s*\(\s*move\s*\|\|', src)) and bool(re.search(r'db\s*\.\s*list_messages\s*\(', src)),
        'bounded memory per message': 'for message in messages {' in src and 'write_all(&raw)' in src,
        'no content collection': 'Vec<Vec<u8>>' not in src and 'all_raw' not in src,
        'preserve raw bytes': 'file.write_all(&raw)' in src,
        'partial output isolation': 'create_new(true)' in src and 'Uuid::new_v4()' in src,
        'rename only on success': src.index('file.sync_all()') < src.index('tokio::fs::rename('),
        'unlink temporary on error': 'if outcome.is_err()' in src and 'remove_file(&temporary)' in src,
        'no silent missing messages': bool(MISSING_GUARD.search(src)),
        'refuses symlink targets': 'metadata.file_type().is_symlink()' in src,
        'tokio fs features': all(f'"{feature}"' in manifest for feature in ('fs', 'io-util')),
        'epoch guard for MBOX': 'confirm_cached_folder_epoch(' in src and 'read_raw_by_uid_if_epoch(&mut session, &message.folder, message.uid, validity)' in src,
        'shared compilation cache': 'cargo check --locked --workspace --all-targets' in runner,
    }


def must_reject(label, mutant):
    if mutant == route:
        raise AssertionError(f'mutation did not change source: {label}')
    remaining = [name for name, ok in expected_checks(mutant).items() if not ok]
    if not remaining:
        raise AssertionError(f'unsafe mutation escaped every check: {label}')


def mutate_missing_guard(src):
    # Mutate the actual guard, regardless of rustfmt's optional closure braces.
    matches = list(MISSING_GUARD.finditer(src))
    if len(matches) != 1:
        raise AssertionError(f'expected exactly one missing-UID guard, found {len(matches)}')
    match = matches[0]
    snippet = src[match.start():match.end()]
    changed = re.sub(r'\bok_or_else\b', 'unwrap_or_else', snippet, count=1)
    return src[:match.start()] + changed + src[match.end():]


checks = expected_checks(route)
mutations = {
    'sync backend reintroduced': route.replace('tcs_core::async_mail::read_raw_by_uid_if_epoch(', 'tcs_core::mail::fetch_raw_message_by_uid(', 1),
    'logout removed': route.replace('session.logout().await', 'session.no_logout().await'),
    'unsafe overwrite': route.replace('create_new(true)', 'truncate(true)'),
    'missing message skipped': mutate_missing_guard(route),
    'symlink defense removed': route.replace('metadata.file_type().is_symlink()', 'false'),
    'remove on failure removed': route.replace('if outcome.is_err()', 'if false'),
}
for key, value in mutations.items():
    must_reject(key, value)

# Regression tests for rustfmt layout: both closure styles must be accepted,
# and removal of the error guard must be rejected in both.
for label, form in (
    ('simple closure', '.ok_or_else(|| format!("Mensagem UID'),
    ('block closure', '.ok_or_else(|| {\n    format!(\n        "Mensagem UID'),
):
    altered = MISSING_GUARD.sub(form, route, count=1)
    assert expected_checks(altered)['no silent missing messages'], label
    broken = mutate_missing_guard(altered)
    assert not expected_checks(broken)['no silent missing messages'], label

for key, value in checks.items():
    print(f'{"PASS" if value else "FAIL"}: {key}')
assert all(checks.values()), 'MBOX export static contract failed'
print(f'PASS: {len(checks)} contracts, {len(mutations)} adversarial mutations, 2 formatting variants')
