#!/usr/bin/env python3
"""Phase 2: production-SQL queue state matrix, invariants and adversarial checks.

Does not claim IMAP server integration; executes the CAS SQL extracted from Rust.
"""
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT/'crates/tcs-core/src/operations.rs').read_text()
match = re.search(r'let\s+claimed\s*=\s*c\.execute\s*\(\s*"([^"]+)"',source)
assert match, 'production claim SQL missing'
claim_sql = match.group(1)
results=[]
def check(name, condition):
    results.append((name, bool(condition)))
    print(('PASS' if condition else 'FAIL')+': '+name)

def database():
    db=sqlite3.connect(':memory:')
    db.execute('CREATE TABLE pending_operations(op_id TEXT PRIMARY KEY, account_id INTEGER NOT NULL, message_id INTEGER, kind TEXT, payload_json TEXT, state TEXT, created_ts INTEGER, updated_ts INTEGER, next_attempt_ts INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT)')
    return db

def insert(db, opid, state, next_ts=0, attempts=0, account=1):
    db.execute('INSERT INTO pending_operations(op_id,account_id,state,next_attempt_ts,attempts,created_ts) VALUES(?,?,?,?,?,1)',(opid,account,state,next_ts,attempts))

def claim(db,opid,now):
    return db.execute(claim_sql,{'1':opid,'2':now}).rowcount

check('CAS uses keyed op_id', 'WHERE op_id=?1' in claim_sql)
check('CAS increments attempts in same UPDATE', 'attempts=attempts+1' in claim_sql)
check('CAS changes state to running', "state='running'" in claim_sql)
check('CAS checks due timestamp', 'next_attempt_ts<=?2' in claim_sql)
check('CAS restricts eligible states', "state IN ('queued','retry_wait')" in claim_sql)
check('claim failure aborts before remote work',bool(re.search(r'if\s+claimed\s*==\s*0\s*\{\s*return\s+Ok\s*\(\s*None\s*\)\s*;\s*\}',source)))
check('destructive errors require review',bool(re.search(r'kind\s*==\s*"move"\s*\|\|\s*kind\s*==\s*"delete"\s*\{\s*"needs_review"',source)))
check('retries restricted to flags',bool(re.search(r'let\s+retryable\s*=\s*kind\s*==\s*"flags"\s*&&\s*attempts\s*<\s*5',source)))
# Check each current async branch independently and require identity-guarded local deletion.
move_branch = source.split('\"move\" => {', 1)[1].split('\n                _ =>', 1)[0]
delete_branch = source.split('\"delete\" => {', 1)[1].split('\n                \"move\" =>', 1)[0]
check('remote move before guarded local deletion',
      'remote_async_mutation(' in move_branch
      and move_branch.index('remote_async_mutation(') < move_branch.index('.remove_message_if_current(')
      and 'captured.as_ref().ok_or(IDENTITY_ERROR)?' in move_branch)
check('remote delete before guarded local deletion',
      'remote_async_permanent_delete(' in delete_branch
      and 'remote_async_mutation(' in delete_branch
      and max(delete_branch.index('remote_async_permanent_delete('), delete_branch.index('remote_async_mutation(')) < delete_branch.index('.remove_message_if_current(')
      and 'captured.as_ref().ok_or(IDENTITY_ERROR)?' in delete_branch)

for state in ('queued','retry_wait','running','done','failed','needs_review','cancelled','', 'QUEUED'):
    for next_ts,now in ((0,100),(100,100),(101,100)):
        with database() as db:
            insert(db,'one',state,next_ts,3)
            hit=claim(db,'one',now)
            eligible=state in ('queued','retry_wait') and next_ts<=now
            row=db.execute('SELECT state,attempts,updated_ts FROM pending_operations WHERE op_id=?',('one',)).fetchone()
            check(f'state={state!r} due={next_ts<=now} CAS eligibility',hit==int(eligible))
            check(f'state={state!r} due={next_ts<=now} state persistence',row[0]==('running' if eligible else state))
            check(f'state={state!r} due={next_ts<=now} attempt atomicity',row[1]==(4 if eligible else 3))
            check(f'state={state!r} due={next_ts<=now} timestamp persistence',row[2]==(now if eligible else None))

with database() as db:
    insert(db,'alpha','queued',0,0,1)
    insert(db,'beta','queued',0,0,2)
    check('unknown operation does not claim',claim(db,'absent',100)==0)
    check('operation alpha claimed',claim(db,'alpha',100)==1)
    check('alpha cannot be claimed twice',claim(db,'alpha',100)==0)
    check('other account operation remains claimable',claim(db,'beta',100)==1)
    check('operation beta cannot be claimed twice',claim(db,'beta',100)==0)
    check('other account attempts independent',db.execute('SELECT attempts FROM pending_operations WHERE op_id=?',('beta',)).fetchone()[0]==1)
    check('original account attempts independent',db.execute('SELECT attempts FROM pending_operations WHERE op_id=?',('alpha',)).fetchone()[0]==1)

# Negative tests run mutations against the same concrete state scenarios.
unsafe_sql = {
    'drops state precondition':claim_sql.replace(" AND state IN ('queued','retry_wait')",''),
    'drops due-time precondition':claim_sql.replace(' AND next_attempt_ts<=?2',''),
    'drops operation id precondition':claim_sql.replace('op_id=?1 AND ','1=1 AND '),
    'drops running transition':claim_sql.replace("state='running'", "state='queued'"),
    'drops attempt increment':claim_sql.replace('attempts=attempts+1','attempts=attempts'),
}
for name,mutated_sql in unsafe_sql.items():
    assert mutated_sql != claim_sql, f'inert mutation: {name}'
    with database() as db:
        scenario_state,scenario_due = ('done',0) if name=='drops state precondition' else ('queued',200) if name=='drops due-time precondition' else ('queued',0)
        insert(db,'target',scenario_state,scenario_due,0)
        insert(db,'other','queued',0,0)
        try:
            db.execute(mutated_sql,{'1':'target','2':100})
            altered=db.execute('SELECT op_id,state,attempts FROM pending_operations ORDER BY op_id').fetchall()
        except sqlite3.Error:
            altered=[]
        # A bad SQL change must break a concrete invariant relative to original SQL.
        with database() as reference:
            insert(reference,'target',scenario_state,scenario_due,0)
            insert(reference,'other','queued',0,0)
            reference.execute(claim_sql,{'1':'target','2':100})
            expected=reference.execute('SELECT op_id,state,attempts FROM pending_operations ORDER BY op_id').fetchall()
        check('negative mutation rejected: '+name, altered!=expected)

# Future recovery: explicit regression markers, not green until semantics exist.
check('running operations excluded from automatic replay', 'running' not in re.search(r"WHERE state IN \(([^)]*)\) AND next_attempt_ts",source).group(1))
check('review operations excluded from automatic replay', 'needs_review' not in re.search(r"WHERE state IN \(([^)]*)\) AND next_attempt_ts",source).group(1))

failed=[name for name,ok in results if not ok]
print(f'QUEUE_MATRIX_CHECKS={len(results)} PASS={len(results)-len(failed)} FAIL={len(failed)}')
if failed:
    raise SystemExit(1)
