#!/usr/bin/env python3
"""Exercise production terminal SQL against stale worker state transitions."""
from pathlib import Path
import re,sqlite3
root=Path(__file__).resolve().parents[2]
s=(root/'crates/tcs-core/src/operations.rs').read_text(encoding="utf-8")
statements=re.findall(r'"(UPDATE pending_operations SET [^"\n]+)"',s)
success=next(x for x in statements if "state='done'" in x)
failure=next(x for x in statements if 'state=?2' in x and 'last_error=?4' in x)
checks=0
for old in ('running','needs_review','done','queued','retry_wait','failed','cancelled'):
 for terminal in ('success','failure'):
  db=sqlite3.connect(':memory:')
  db.execute('CREATE TABLE pending_operations(op_id TEXT PRIMARY KEY,state TEXT,updated_ts INTEGER,next_attempt_ts INTEGER,last_error TEXT)')
  db.execute('INSERT INTO pending_operations VALUES(?,?,?,?,?)',('op',old,10,0,'keep'))
  if terminal=='success':
   n=db.execute(success,{'1':'op','2':500}).rowcount
  else:
   n=db.execute(failure,{'1':'op','2':'needs_review','3':0,'4':'remote uncertain','5':500}).rowcount
  state,ts,last=db.execute('SELECT state,updated_ts,last_error FROM pending_operations').fetchone()
  if old=='running':
   assert n==1 and ts==500 and state==('done' if terminal=='success' else 'needs_review')
  else:
   assert n==0 and (state,ts,last)==(old,10,'keep'),(old,terminal,state,ts,last)
  checks+=1
# A completed operation must not be able to erase quarantine after timeout.
for mutant in [success.replace(" AND state='running'",''),failure.replace(" AND state='running'",'')]:
 assert mutant not in (success,failure)
 db=sqlite3.connect(':memory:')
 db.execute('CREATE TABLE pending_operations(op_id TEXT PRIMARY KEY,state TEXT,updated_ts INTEGER,next_attempt_ts INTEGER,last_error TEXT)')
 db.execute('INSERT INTO pending_operations VALUES(?,?,?,?,?)',('op','needs_review',10,0,'quarantined'))
 if "state='done'" in mutant:
  assert db.execute(mutant,{'1':'op','2':500}).rowcount==1
 else:
  assert db.execute(mutant,{'1':'op','2':'failed','3':0,'4':'overwritten','5':500}).rowcount==1
 checks+=1
assert 'if completed != 1' in s and 'if finalized != 1' in s
checks+=2
print(f'PASS: late-worker terminal transition guards: {checks}/{checks}, including 2 destructive mutations')
