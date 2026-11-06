// Exercise the production action function with synthetic state and IPC failures.
// No browser, real messages, credential store or network is used.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync('frontend/main.js','utf8');
function actionSource() {
  const name=source.includes('async function executeSelectedAction(')?'executeSelectedAction':'bulkDirect';
  const start=source.indexOf(`async function ${name}(`);
  assert.ok(start>=0,'Missing production batch action function');
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)) {
    const candidate=source.slice(start,end+1);
    try {new vm.Script(`(${candidate})`);return candidate;} catch(error) {
      if(!(error instanceof SyntaxError))throw error;
    }
  }
  throw new Error('Could not parse production action function');
}
function harness({confirm=true,fail=[],items=[1,2,3].map(id=>({id,account_id:1,uid:id})),folder='INBOX',onInvoke}={}) {
  const calls=[],errors=[],prompts=[],loads=[],events=[];
  const state={selected:new Set(items.map(x=>x.id)),items,current:null,folder,account:1,view:'mail'};
  const context=vm.createContext({state,console,Set,Number,String,Array,Promise,Error,
    confirmDialog:async(...args)=>{prompts.push(args);return typeof confirm==='function'?confirm():confirm;},
    invoke:async(command,args)=>{calls.push({command,args});await onInvoke?.(state,calls);if(fail.includes(args.req?.id??args.id))throw new Error('synthetic failure');},
    showError:error=>errors.push(error),toast:()=>{},
    loadMessages:async(...args)=>loads.push(args),
    updateBatch:()=>{},folderName:()=>'Trash',refreshLocalDrafts:async()=>events.push('refreshDrafts'),
    cancelPreviewReadTimer:()=>events.push('cancelRead'),syncReaderTabs:()=>events.push('syncTabs'),
  });
  const action=new vm.Script(`(${actionSource()})`).runInContext(context);
  return {action,state,calls,errors,prompts,loads,events};
}
test('cancel preserves selection and releases the action lock',async()=>{
  const h=harness({confirm:false});await h.action([1,2,3],'delete');
  assert.equal(h.calls.length,0);assert.deepEqual([...h.state.selected],[1,2,3]);assert.equal(h.state.bulkActionInProgress,false);
});
test('partial failure continues the batch and preserves failures for retry through reload',async()=>{
  const h=harness({fail:[2]});await h.action([1,2,3],'delete');
  assert.deepEqual(h.calls.map(call=>call.args.req.id),[1,2,3]);
  assert.deepEqual([...h.state.selected],[2]);
  assert.equal(h.loads[0][2].preserveSelection,true);
});
test('successful batch clears the processed selection',async()=>{
  const h=harness();await h.action([1,2,3],'delete');assert.equal(h.calls.length,3);assert.equal(h.state.selected.size,0);
});
test('mixed local drafts and remote messages use their distinct commands and retry IDs',async()=>{
  const items=[{id:-7,local_draft:true,local_draft_id:'synthetic-draft'},{id:1,account_id:1},{id:2,account_id:1}];
  const h=harness({items,fail:['synthetic-draft']});await h.action([-7,1,2],'delete');
  assert.equal(h.calls[0].command,'delete_local_draft');assert.equal(h.calls[0].args.id,'synthetic-draft');
  assert.deepEqual(h.calls.slice(1).map(call=>call.args.req.id),[1,2]);assert.deepEqual([...h.state.selected],[-7]);
  assert.ok(h.prompts[0][0].includes('descartados definitivamente'));assert.ok(h.events.includes('refreshDrafts'));
});
test('permanent and trash deletions require explicit destructive confirmation',async()=>{
  for(const [folder,action] of [['INBOX','delete_permanent'],['Trash','delete'],['__TRASH','delete']]) {
    const h=harness({folder});await h.action([1,2,3],action);
    assert.equal(h.prompts[0][1].confirmLabel,'Excluir definitivamente');assert.equal(h.prompts[0][1].danger,true);
    assert.ok(h.calls.every(call=>call.args.req.action==='delete_permanent'));
  }
});
test('a local draft cannot accidentally use a server archive action',async()=>{
  const h=harness({items:[{id:-7,local_draft:true,local_draft_id:'synthetic-draft'}]});await h.action([-7],'archive');assert.equal(h.calls.length,0);
});
test('duplicate IDs mutate once; unknown and invalid IDs never reach IPC',async()=>{
  const h=harness();await h.action([1,1,0,42],'delete');assert.deepEqual(h.calls.map(c=>c.args.req.id),[1]);assert.deepEqual([...h.state.selected],[0,42]);
});
test('an overlapping action cannot submit a second confirmation or duplicate mutations',async()=>{
  let resolve;const h=harness({confirm:()=>new Promise(r=>{resolve=r;})});
  const first=h.action([1,2,3],'delete');await h.action([1,2,3],'delete');assert.equal(h.prompts.length,1);resolve(true);await first;assert.equal(h.calls.length,3);
});
test('navigation during confirmation aborts without mutating either folder',async()=>{
  let resolve;const h=harness({confirm:()=>new Promise(r=>{resolve=r;})});
  const pending=h.action([1,2,3],'delete');h.state.folder='Other';h.state.selected=new Set([99]);resolve(true);await pending;
  assert.equal(h.calls.length,0);assert.deepEqual([...h.state.selected],[99]);
});
test('navigation during IPC preserves the next folder selection and reader',async()=>{
  const h=harness({onInvoke:state=>{state.folder='Other';state.selected=new Set([99]);state.current={id:99};}});
  await h.action([1,2,3],'delete');assert.equal(h.calls.length,3);assert.deepEqual([...h.state.selected],[99]);assert.equal(h.state.current.id,99);assert.equal(h.loads.length,0);
});
