// Exercise the *actual* native_windows.js implementation under a minimal Tauri bridge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {nativeWindowRoute} from '../../frontend/native_route.js';

assert.deepEqual(nativeWindowRoute('?native=composer&key=q_1',''),{kind:'composer',key:'q_1'});
assert.deepEqual(nativeWindowRoute('', 'composer-random_uuid-1'),{kind:'composer',key:'random_uuid-1'});
assert.deepEqual(nativeWindowRoute('?native=reader&key=incorrect','composer-a'),{kind:'composer',key:'a'});
assert.equal(nativeWindowRoute('?native=bad&key=a','main'),null);
assert.equal(nativeWindowRoute('?native=composer&key=%2f..%2f','main'),null);

const source=fs.readFileSync('frontend/native_windows.js','utf8')
  .replace(/^import .*;\s*$/gm,'').replace(/export (async )?function /g,(_m,a)=>(a||'')+'function ');
const factory = new Function('invoke','tr','crypto','window','setTimeout','clearTimeout', `${source}\nreturn {openNativeComposer};`);

async function scenario(how,seed={}){
 const calls=[],listeners=new Map();
 const events={
  listen:async (type,fn)=>{const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);return ()=>listeners.set(type,(listeners.get(type)||[]).filter(f=>f!==fn));},
  emit:async(type,payload)=>{if(type==='tcs-composer-probe'&&how==='probe')await events.emit('tcs-composer-ready',payload);for(const fn of [...(listeners.get(type)||[])])await fn({payload});}
 };
 const invoke=async(cmd,args)=>{
  calls.push({cmd,args});
  if(cmd==='open_mail_window'){
   if(how==='open-fail')throw Error('Tauri não conseguiu criar a janela');
   if(how==='ready')await events.emit('tcs-composer-ready',{draftId:args.key});
   if(how==='failed')await events.emit('tcs-composer-failed',{draftId:args.key,message:'Falha de inicialização'});
  }
  return null;
 };
 const win={__TAURI__:{event:events}};
 const ctx={state:{account:9}};
 const {openNativeComposer}=factory(invoke,s=>s,{randomUUID:()=> 'uuid-123'},win,setTimeout,clearTimeout);
 let result=null,error=null;
 try{result=await openNativeComposer(ctx,seed,{readyTimeoutMs:55});}catch(e){error=String(e)}
 assert.equal((listeners.get('tcs-composer-ready')||[]).length,0,'ready listener leak');
 assert.equal((listeners.get('tcs-composer-failed')||[]).length,0,'failed listener leak');
 return {result,error,calls};
}
{
 const {result,calls}=await scenario('ready');assert.equal(result,'uuid-123');
 assert.deepEqual(calls.map(c=>c.cmd),['save_local_draft','open_mail_window']);
}
{
 const {result,calls}=await scenario('probe',{draftId:'existing'});assert.equal(result,'existing');
 assert.deepEqual(calls.map(c=>c.cmd),['open_mail_window']);
}
for(const [kind,message] of [['failed','Falha de inicialização'],['open-fail','Tauri não conseguiu criar'],['timeout','não confirmou']]){
 const {result,error,calls}=await scenario(kind);
 assert.equal(result,null);assert.match(error,new RegExp(message));
 assert.equal(calls[0].cmd,'save_local_draft');
 assert.ok(!calls.some(c=>c.cmd==='delete_local_draft'),'Never delete an unsent draft on failure');
}
const main=fs.readFileSync('frontend/main.js','utf8');
const native=fs.readFileSync('frontend/native_window.js','utf8');
const views=fs.readFileSync('frontend/views.js','utf8');
assert.match(main,/seed\.__forceWindow===true\?'window':await currentComposerSurface/);
assert.match(main,/nativeWindowRoute\(location\.search/);
assert.match(native,/tcs-composer-probe/);
assert.match(native,/tcs-composer-failed/);
assert.match(views,/id="openIndependentComposerTest"/);
assert.match(views,/ctx\.openComposer\(\{__forceWindow:true/);
console.log('PASS: native composer RC2: ready-before-return, reused window, failure, timeout, draft retained, navigation and test action.');
