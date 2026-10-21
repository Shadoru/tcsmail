
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const drafts=await import(pathToFileURL(path.join(root,'frontend/drafts.js')).href);
const {WorkspaceModel}=await import(pathToFileURL(path.join(root,'frontend/workspace.js')).href);

const records=[
 {id:'a',account_id:1,draft_json:JSON.stringify({subject:'A',text:'alpha',to:'x@example.com'}),dirty:true,updated_ts:30},
 {id:'b',account_id:1,draft_json:JSON.stringify({subject:'B',text:'beta'}),dirty:false,server_uid:55,updated_ts:20},
 {id:'c',account_id:2,draft_json:JSON.stringify({subject:'C',text:'gamma'}),dirty:true,updated_ts:10},
];
assert.equal(drafts.localDraftsForScope(records,{navigationMode:'tree',account:1}).length,2);
assert.equal(drafts.localDraftsForScope(records,{navigationMode:'tree',account:2}).length,1);
assert.equal(drafts.localDraftsForScope(records,{navigationMode:'unified',accountIds:[1,2]}).length,3);
assert.equal(drafts.localDraftsForScope(records,{navigationMode:'unified',accountIds:[2]}).length,1);
assert.equal(drafts.filterLocalDrafts(records,'subject:A').length,1);
assert.equal(drafts.filterLocalDrafts(records,'alpha').length,1);
assert.equal(drafts.filterLocalDrafts(records,'is:unread').length,0);

const seed=drafts.draftSeed({...records[0],draft_json:JSON.stringify({
 to:'to@example.com',cc:'cc@example.com',bcc:'bcc@example.com',
 subject:'Persistido',html:'<b>Corpo</b>',text:'Corpo',identityId:7,
 requestReadReceipt:true,followEnabled:true,followAt:'2026-10-07T08:00',
 scheduleEnabled:true,sendAt:'2026-10-07T09:00',undoSeconds:20,ccVisible:true,bccVisible:true
})});
assert.equal(seed.draftId,'a');
assert.equal(seed.subject,'Persistido');
assert.equal(seed.identityId,7);
assert.equal(seed.requestReadReceipt,true);
assert.equal(seed.followEnabled,true);
assert.equal(seed.scheduleEnabled,true);
assert.equal(seed.undoSeconds,20);
assert.equal(seed.ccVisible,true);
assert.equal(seed.bccVisible,true);

const remote=[
 {id:11,account_id:1,uid:55,subject:'B',snippet:'beta',date_ts:19},
 {id:12,account_id:1,subject:'Servidor',snippet:'somente remoto',date_ts:18},
];
const merged=drafts.mergeDraftRows(remote,records.filter(r=>r.account_id===1),[{id:1,name:'Conta'}]);
assert.equal(merged.filter(x=>x.local_draft).length,2);
assert.equal(merged.some(x=>x.id===11),false,'cópia IMAP sincronizada deve ser reconciliada');
assert.equal(merged.some(x=>x.id===12),true,'draft remoto sem equivalente local deve permanecer');
assert.equal(merged[0].local_draft_id,'a');

const ws=new WorkspaceModel();
let emissions=0;
const unsub=ws.subscribe(()=>emissions++);
ws.register({key:'reader:1',type:'reader',title:'Mensagem 1'});
ws.register({key:'reader:2',type:'reader',title:'Mensagem 2'});
ws.register({key:'composer:d1',type:'composer',title:'Nova mensagem'});
ws.register({key:'composer:d2',type:'composer',title:'Segunda mensagem'});
assert.equal(ws.snapshot().length,4);
ws.minimize('reader:1');
assert.equal(ws.get('reader:1').minimized,true);
ws.restore('reader:1');
assert.equal(ws.get('reader:1').minimized,false);
ws.update('composer:d1',{title:'Assunto alterado'});
assert.equal(ws.get('composer:d1').title,'Assunto alterado');
ws.remove('reader:2');
assert.equal(ws.snapshot().length,3);
assert.ok(emissions>=7);
unsub();

const main=fs.readFileSync(path.join(root,'frontend/main.js'),'utf8');
const composer=fs.readFileSync(path.join(root,'frontend/composer.js'),'utf8');
const rust=fs.readFileSync(path.join(root,'src-tauri/src/lib.rs'),'utf8');
const lib=fs.readFileSync(path.join(root,'frontend/lib.js'),'utf8');
assert.ok(lib.includes('overlayRootGlobal'),'work windows must live outside the main shell');

for(const marker of [
 'mergeDraftRows(page.items,locals,state.boot.accounts)',
 'openLocalDraft(item.local_draft_id)',
 'previewLocalDraft(item.local_draft_id)',
 'openNativeReader(id',
 'openNativeComposer(ctx,seed)',
 "['ArrowDown','ArrowUp','Home','End','PageUp','PageDown']"
]) assert.ok(main.includes(marker),`main.js sem ${marker}`);
assert.equal(main.includes('localDraftsInline'),false,'rascunhos locais não podem depender de fluxo separado');

for(const marker of [
 "list_draft_attachments",
 "options.nativeWindow",
        "choiceDialog('Deseja salvar esta mensagem em Rascunhos antes de fechar?'",
 "followEnabled",
 "scheduleEnabled",
 "ccVisible",
 "bccVisible"
]) assert.ok(composer.includes(marker),`composer.js sem ${marker}`);

assert.match(rust,/\bdirty\s*:\s*bool\b/,'LocalDraftView precisa expor dirty');
assert.ok(rust.includes('list_draft_attachments'),'backend precisa restaurar anexos do draft');

console.log('CONSOLIDATION PHASE 2 CONTRACT: PASS');
