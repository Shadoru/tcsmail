#!/usr/bin/env node
// Source-based behavioral regression: no dependencies and no account needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const main=fs.readFileSync(new URL('frontend/main.js',root),'utf8');
const sql=fs.readFileSync(new URL('crates/tcs-core/src/store.rs',root),'utf8');
const backend=fs.readFileSync(new URL('src-tauri/src/lib.rs',root),'utf8');
const asyncMail=fs.readFileSync(new URL('crates/tcs-core/src/async_mail.rs',root),'utf8');
const css=fs.readFileSync(new URL('frontend/styles.css',root),'utf8');
const client=fs.readFileSync(new URL('vendor/async-imap-0.12.0/src/client.rs',root),'utf8');
const idle=fs.readFileSync(new URL('vendor/async-imap-0.12.0/src/extensions/idle.rs',root),'utf8');
function section(start,end){const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a,{start,end});return main.slice(a,b)}
const code=section('const folderSyncJobs=new Map();','async function sync(){')+'\n'+section('async function syncTargetsForFolder(folder){','async function enterFolder(folder){');
const events=[], messages=[], state={view:'mail',folder:'__SENT',account:null};
const replies=[];let loads=0;
const roles={1:{sent:'[Gmail]/Sent Mail',drafts:'[Gmail]/Drafts'},2:{sent:'Sent',drafts:'Drafts'}};
const counters=new Map();
const ctx={state,status:()=>{},toast:s=>messages.push(s),loadMessages:async()=>{loads++},
 activeAccountIds:()=>[1,2],invoke:async(cmd,arg)=>{
   events.push([cmd,arg]);
   if(cmd==='list_folder_tree')return [{name:roles[arg.accountId].sent,special_use:'sent'}];
   if(cmd==='folder_roles')return roles[arg.accountId];
   const key=`${arg.accountId}:${arg.folder}:${cmd}`;
   const count=(counters.get(key)||0)+1;counters.set(key,count);
   if(cmd==='sync_recent')return {fetched:count===1?300:22,backfill_complete:false};
   if(cmd==='sync_backfill')return {fetched:count===1?500:44,backfill_complete:count>1};
   throw new Error('Unexpected invoke '+cmd);
 }};
vm.runInNewContext(code+'\nglobalThis.functions={syncTargetsForFolder,syncFolderHistory}',ctx);
const {syncTargetsForFolder,syncFolderHistory}=ctx.functions;
const sent=await syncTargetsForFolder('__SENT');
assert.deepEqual(Array.from(sent,v=>({accountId:v.accountId,folder:v.folder})),[{accountId:1,folder:'[Gmail]/Sent Mail'},{accountId:2,folder:'Sent'}]);
assert.equal(events.filter(x=>x[0]==='list_folder_tree').length,2,'unopened accounts must update special-use');
assert(!events.some(x=>x[1]?.folder==='INBOX'),'never silently map sent to INBOX');
const direct=await syncTargetsForFolder('[Gmail]/Sent Mail');
assert.equal(direct.length,2);
const specialUnknown=await syncTargetsForFolder('__STARRED');assert.equal(specialUnknown.length,0);
const result=await syncFolderHistory(sent[0],{manual:false});
assert.equal(result.added,322);
assert.equal(result.older,544);
assert.equal(result.complete,true);
assert.equal(loads,4,'refresh after each completed remote page');
assert.equal(counters.get('1:[Gmail]/Sent Mail:sync_recent'),2);
assert.equal(counters.get('1:[Gmail]/Sent Mail:sync_backfill'),2);
assert(main.includes("m.to_text||'(destinatário não informado)'"),'Sent must display recipient');
assert(sql.includes('m.references_text,length(m.body_text),m.to_text FROM messages m'),'recipient included in list SQL');
assert(backend.includes('special_folders_from_tree(tree)'),'persist SPECIAL-USE before UI roles');
assert(asyncMail.includes('Some("sent") => roles.sent = Some(f.name.clone())'),'use server special flag');
assert(css.includes('var(--side-text) 15%,var(--side)'),'selected folder must use theme sidebar colors');
assert(css.includes('html[data-theme="system"]{\n  --side-text:#eef1f4;'),'system dark text fix');
assert(!client.includes('    unsafe_pinned!(') && !idle.includes('    unsafe_pinned!('),'no deprecated pin macro invocations');
assert(client.includes('Pin::new(&mut self.get_mut().conn)'),'pin replacement is explicit and safe');
assert(idle.includes('Pin::new(&mut self.get_mut().session)'),'IDLE safe projection');
console.log('PASS: SPECIAL-USE Gmail + contas unificadas + 2 lotes recentes + 2 lotes históricos + lista Enviados + CSS temas + projeções seguras');
