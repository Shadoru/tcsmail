#!/usr/bin/env python3
"""Phase 2 queue: structural guards plus real SQLite compare-and-set exercise.

Fail closed when safety-critical patterns disappear. Tests are invariant to rustfmt.
"""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[2]
code = (root / 'crates/tcs-core/src/operations.rs').read_text(encoding="utf-8")


def validate(source):
    claim = re.search(r'let\s+claimed\s*=\s*c\.execute\s*\(\s*"([^"]+)"', source)
    claim_sql = claim.group(1) if claim else ''
    cas = bool(re.search(r"UPDATE pending_operations SET state='running'.*attempts=attempts\+1.*WHERE op_id=\?1 AND state IN \('queued','retry_wait'\) AND next_attempt_ts<=\?2",claim_sql))
    guard = bool(re.search(r'if\s+claimed\s*==\s*0\s*\{\s*return\s+Ok\s*\(\s*None\s*\)\s*;\s*\}',source))
    retry = bool(re.search(r'let\s+retryable\s*=\s*kind\s*==\s*"flags"\s*&&\s*attempts\s*<\s*5\s*&&\s*!review_required\s*;',source)) and 'let review_required = e == IDENTITY_ERROR' in source
    quarantine = bool(re.search(r'else\s+if\s+review_required\s*\|\|\s*kind\s*==\s*"move"\s*\|\|\s*kind\s*==\s*"delete"\s*\{\s*"needs_review"\s*\}',source))
    success = "state='done'" in source
    branch = source[source.index('"move" => {'):]
    remote_before_local = 'remote_async_mutation(' in branch and 'remove_message_if_current(' in branch and branch.index('remote_async_mutation(')<branch.index('remove_message_if_current(')
    return {
        'compare-and-set claim': cas,
        'claim not assumed': guard,
        'unknown MOVE never blindly retried': retry,
        'ambiguous destructive operations quarantined': quarantine,
        'existing SQLite commit on success preserved': success,
        'remote action precedes local deletion': remote_before_local,
    }, claim_sql

checks, sql = validate(code)
# Test the exact SQL statement in the production source, not a recreated approximation.
with sqlite3.connect(':memory:') as db:
    db.execute('CREATE TABLE pending_operations(op_id TEXT PRIMARY KEY,state TEXT,next_attempt_ts INTEGER,attempts INTEGER DEFAULT 0,updated_ts INTEGER)')
    db.execute("INSERT INTO pending_operations(op_id,state,next_attempt_ts,attempts) VALUES('x','queued',0,0)")
    checks['first claimant wins'] = bool(sql) and db.execute(sql, {'1': 'x', '2': 100}).rowcount == 1
    checks['second claimant rejected'] = bool(sql) and db.execute(sql, {'1': 'x', '2': 100}).rowcount == 0
    checks['attempt increments only once'] = db.execute("SELECT attempts FROM pending_operations WHERE op_id='x'").fetchone()[0] == 1

for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL') + ': ' + name)
assert all(checks.values()), 'Queue safety invariant failed'

# Adversarial negative tests: each missing guard must cause rejection.
mutations = {
    'claim without state compare': code.replace("AND state IN ('queued','retry_wait') AND next_attempt_ts<=?2", 'AND next_attempt_ts<=?2', 1),
    'skip claim verification': re.sub(r'if\s+claimed\s*==\s*0\s*\{\s*return\s+Ok\s*\(\s*None\s*\)\s*;\s*\}', '', code, count=1),
    'blindly retry MOVE': re.sub(r'kind\s*==\s*"flags"\s*&&\s*attempts\s*<\s*5', 'attempts < 5',code,count=1),
    'remove manual review': code.replace('"needs_review"', '"retry_wait"',1),
}
for label, mutated in mutations.items():
    assert mutated != code, f'adversarial mutation did not change source: {label}'
    altered, _ = validate(mutated)
    assert not all(altered.values()), f'unsafe mutation not rejected: {label}'
print('PASS: 4 unsafe mutations rejected')
print('PASS: 9 queue guards and SQLite claim exercise')
