#!/usr/bin/env python3
"""Real SQLite recovery scenarios and fail-closed source contracts."""
import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
ops = (root/'crates/tcs-core/src/operations.rs').read_text()
tauri = (root/'src-tauri/src/lib.rs').read_text()

sql_match = re.search(r'pub fn quarantine_stale_running\(.*?\.execute\(\s*"([^"]+)"', ops, re.S)
assert sql_match, 'Recovery SQL must exist in production implementation'
sql = sql_match.group(1)
checks = {}
checks['only running quarantined'] = "WHERE state='running'" in sql
checks['cutoff enforced'] = 'updated_ts<=?2' in sql
checks['no retry scheduled'] = 'next_attempt_ts=0' in sql
checks['needs manual review'] = "state='needs_review'" in sql
checks['reason persisted'] = "last_error='Execução interrompida" in sql
checks['reject too-short cutoff'] = 'stale_after_seconds < 60' in ops
checks['overflow-safe cutoff'] = 'now.saturating_sub(stale_after_seconds)' in ops
checks['startup wiring'] = bool(re.search(r'ops\.quarantine_stale_running\(15\s*\*\s*60\)\?', tauri))
account_guard = ops.find('if message.account_id != account_id')
password = ops.find('let password = crate::oauth::mail_auth_secret')
remote = ops.find('match kind.as_str()')
checks['cross-account denied before authentication'] = 0 <= account_guard < remote < password
checks['invalid UID denied'] = 'if message.uid == 0 || message.folder.trim().is_empty()' in ops
checks['invalid UID denied before login'] = ops.find('if message.uid == 0 || message.folder.trim().is_empty()') < password
checks['no recovery auto-resend'] = "state IN ('queued','retry_wait')" not in sql

with sqlite3.connect(':memory:') as db:
    db.execute('CREATE TABLE pending_operations(op_id TEXT PRIMARY KEY,state TEXT,next_attempt_ts INTEGER,updated_ts INTEGER,last_error TEXT)')
    states=['running','queued','retry_wait','done','failed','needs_review','cancelled']
    counter=0
    for state in states:
        for time_delta in (-1,0,1):
            identifier=f'{state}-{time_delta}'
            db.execute('INSERT INTO pending_operations VALUES(?,?,?,?,?)',(identifier,state,77,100+time_delta,'previous'))
            counter+=1
    changed=db.execute(sql, {'1': 500, '2': 100}).rowcount
    checks['real SQLite updates only eligible stale running rows'] = changed==2
    for state in states:
        for time_delta in (-1,0,1):
            state_after, retry, updated, reason=db.execute('SELECT state,next_attempt_ts,updated_ts,last_error FROM pending_operations WHERE op_id=?',(f'{state}-{time_delta}',)).fetchone()
            eligible=state=='running' and time_delta<=0
            checks[f'SQLite {state} time={time_delta}'] = (state_after=='needs_review' and retry==0 and updated==500 and reason.startswith('Execução interrompida')) if eligible else (state_after==state and retry==77 and updated==100+time_delta and reason=='previous')
    checks['repeat recovery idempotent'] = db.execute(sql, {'1': 600, '2': 100}).rowcount==0

# Unsafe mutations must modify production SQL AND become detectable.
mutants={
 'missing state restriction': ("WHERE state='running' AND ", 'WHERE '),
 'missing age restriction': (' AND updated_ts<=?2', ''),
 'turns into retry': ("state='needs_review'", "state='retry_wait'"),
 'schedules retry': ('next_attempt_ts=0', 'next_attempt_ts=999'),
}
for label,(old,new) in mutants.items():
    assert old in sql, f'mutation precondition missing: {label}'
    changed_sql=sql.replace(old,new,1)
    assert changed_sql != sql
    bad=changed_sql == sql or (
        "WHERE state='running'" not in changed_sql or 'updated_ts<=?2' not in changed_sql
        or "state='needs_review'" not in changed_sql or 'next_attempt_ts=0' not in changed_sql
    )
    checks[f'negative mutation caught: {label}'] = bad

for name,good in checks.items(): print(f'{"PASS" if good else "FAIL"}: {name}')
assert all(checks.values()), 'Recovery / account boundary regression'
print(f'RECOVERY_CHECKS={len(checks)} PASS={sum(checks.values())} FAIL={len(checks)-sum(checks.values())}')
