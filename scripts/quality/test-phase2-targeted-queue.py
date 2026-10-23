#!/usr/bin/env python3
"""Production SQL based target-vs-FIFO regression matrix. No mailbox credentials."""
from pathlib import Path
import sqlite3,re
root=Path(__file__).resolve().parents[2]
core=(root/'crates/tcs-core/src/operations.rs').read_text(encoding="utf-8")
ui=(root/'src-tauri/src/lib.rs').read_text(encoding="utf-8")
select=re.search(r'"(SELECT op_id,account_id,message_id,kind,payload_json FROM pending_operations [^"\n]+)"',core)
assert select, 'cannot find production SELECT SQL'
sql=select.group(1)
assert "(?2 IS NULL OR op_id=?2)" in sql, 'target parameter missing'
assert "state IN ('queued','retry_wait')" in sql
assert 'next_attempt_ts<=?1' in sql
assert 'ORDER BY created_ts LIMIT 1' in sql
assert 'fn process_selected(&self, requested_id: Option<&str>)' in core
assert 'self.process_selected(None)' in core
assert 'self.process_selected(Some(operation_id))' in core
assert 'operation_id.is_empty()' in core
assert 'process_one_for(&flag)?;' in ui and 'process_one_for(&op)?;' in ui
assert 'if state.ops.process_one()?.is_none()' in ui, 'background FIFO changed'
assert 'q.process_one()?;' not in ui, 'interactive handler still steals FIFO'
assert 'state.ops.process_one()?;' not in ui, 'interactive handler still steals FIFO'
checks=12
for states in [('queued','queued'),('retry_wait','queued'),('queued','retry_wait'),('retry_wait','retry_wait')]:
 for due in (False, True):
  for target in (None,'new','old','absent'):
   db=sqlite3.connect(':memory:')
   db.execute('CREATE TABLE pending_operations(op_id TEXT,account_id INTEGER,message_id INTEGER,kind TEXT,payload_json TEXT,state TEXT,next_attempt_ts INTEGER,created_ts INTEGER)')
   db.executemany('INSERT INTO pending_operations VALUES(?,?,?,?,?,?,?,?)',[
    ('old',1,1,'flags','{}',states[0],0,1),
    ('new',2,2,'move','{}',states[1],0 if due else 200,2)])
   result=db.execute(sql,{"1":100,"2":target}).fetchone()
   expected=('old' if target is None else target)
   if target == 'absent' or target == 'new' and not due: expected='old' if target is None else None
   assert (result[0] if result else None)==expected,(states,due,target,result,expected)
   checks+=1
# Adversarial checks: each changed predicate must affect a concrete scenario.
def seeded(rows):
 db=sqlite3.connect(':memory:')
 db.execute('CREATE TABLE pending_operations(op_id TEXT,account_id INTEGER,message_id INTEGER,kind TEXT,payload_json TEXT,state TEXT,next_attempt_ts INTEGER,created_ts INTEGER)')
 db.executemany('INSERT INTO pending_operations VALUES(?,?,?,?,?,?,?,?)',[(ident,1,1,'flags','{}',state,due,seq) for ident,state,due,seq in rows])
 return db
mutant=sql.replace('(?2 IS NULL OR op_id=?2)','1=1')
assert mutant!=sql
with seeded([('old','queued',0,1),('new','queued',0,2)]) as db:
 assert db.execute(sql,{'1':100,'2':'new'}).fetchone()[0]=='new'
 assert db.execute(mutant,{'1':100,'2':'new'}).fetchone()[0]=='old'
checks+=1
mutant=sql.replace("state IN ('queued','retry_wait')","1=1")
assert mutant!=sql
with seeded([('old','running',0,1),('new','queued',0,2)]) as db:
 assert db.execute(sql,{'1':100,'2':None}).fetchone()[0]=='new'
 assert db.execute(mutant,{'1':100,'2':None}).fetchone()[0]=='old'
checks+=1
mutant=sql.replace('next_attempt_ts<=?1','1=1').replace('?2', ':target')
assert mutant!=sql
with seeded([('old','queued',300,1),('new','queued',0,2)]) as db:
 assert db.execute(sql,{'1':100,'2':None}).fetchone()[0]=='new'
 assert db.execute(mutant,{'target':None}).fetchone()[0]=='old'
checks+=1
print(f'PASS: targeted queue production SQL {checks} checks (including 3 mutation scenarios)')
