// Production functions, synthetic IPC and a controlled clock. No real account,
// browser, credentials, network, compilation or timing benchmark is used here.
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const main=fs.readFileSync(new URL('../../frontend/main.js',import.meta.url),'utf8');
const composer=fs.readFileSync(new URL('../../frontend/composer.js',import.meta.url),'utf8');
test('the complete modified frontend sources parse, including shell markup',()=>{
 for(const source of [main,composer])new vm.Script(source.replace(/^import .+$/gm,'').replace(/^export /gm,''));
});
function production(source,name){
 const pattern=new RegExp(`(?:async )?function ${name}\\(`),start=source.search(pattern);
 assert.ok(start>=0,`Missing production function ${name}`);
 for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)){
  const candidate=source.slice(start,end+1);
  try{new vm.Script(`(${candidate})`);return candidate}catch(error){if(!(error instanceof SyntaxError))throw error}
 }
 throw new Error(`Cannot parse ${name}`);
}
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no});return {promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function folderHarness(invoke){
 const state={account:1,folder:'INBOX',view:'mail',boot:{accounts:[{id:1}]},folderTree:[],folders:[],roles:{},items:[],listRequestSeq:0,openRequestSeq:0,selected:new Set(),groupAccountIds:new Set()};
 const notices=[],events=[];
 const context=vm.createContext({state,invoke,toast:v=>notices.push(v),showError:e=>{throw e},
  loadMessages:async()=>events.push('local'),refreshFolderSidebar:()=>events.push('sidebar'),
  cancelPreviewReadTimer(){},persistNavigationState:async()=>{},renderShell:()=>events.push('shell'),enterFolder:async()=>events.push('local')});
 vm.runInContext('let folderRefreshSeq=0;let folderNavigationSeq=0;const folderSnapshots=new Map();'+
  ['refreshFolders','initializeMailList','selectAccountFolder'].map(n=>production(main,n)).join('\n'),context);
 return {context,state,notices,events,refresh:context.refreshFolders,initialize:context.initializeMailList,select:context.selectAccountFolder};
}
test('local messages paint before delayed LIST and persisted roles are requested afterward',async()=>{
 const list=deferred(),calls=[];
 const h=folderHarness(async(cmd,args)=>{calls.push([cmd,args]);if(cmd==='list_folder_tree')return list.promise;return {sent:'Provider/Sent'}});
 await h.initialize();
 assert.deepEqual(h.events,['local']);assert.equal(calls.length,1);assert.equal(calls[0][0],'list_folder_tree');
 list.resolve([{name:'Provider/Sent'}]);await flush();
 assert.deepEqual(calls.map(x=>x[0]),['list_folder_tree','folder_roles']);
 assert.equal(h.state.roles.sent,'Provider/Sent');assert.deepEqual(h.events,['local','sidebar']);
});
test('offline LIST leaves local messages and selection intact and reports a recoverable error',async()=>{
 const h=folderHarness(async()=>{throw new Error('synthetic offline')});h.state.selected.add(41);h.state.current={id:41};
 await h.initialize();await flush();
 assert.deepEqual(h.events,['local']);assert.deepEqual([...h.state.selected],[41]);assert.equal(h.state.current.id,41);
 assert.equal(h.notices.length,1);assert.match(h.notices[0],/preservad|anteriores/);
});
test('superseded A -> B -> A LIST responses cannot overwrite the latest tree or request stale roles',async()=>{
 const requests=[],calls=[];
 const h=folderHarness((cmd,args)=>{calls.push([cmd,args]);if(cmd==='folder_roles')return Promise.resolve({sent:'latest'});const d=deferred();requests.push(d);return d.promise});
 const first=h.refresh();h.state.account=2;const second=h.refresh();h.state.account=1;const latest=h.refresh();
 requests[2].resolve([{name:'latest'}]);assert.equal(await latest,true);
 requests[0].resolve([{name:'old-A'}]);requests[1].resolve([{name:'old-B'}]);
 assert.equal(await first,false);assert.equal(await second,false);assert.equal(h.state.folders[0],'latest');
 assert.equal(calls.filter(x=>x[0]==='folder_roles').length,1);
});
test('roles already in flight are also checked against the request epoch',async()=>{
 const oldRoles=deferred();let roleCalls=0;
 const h=folderHarness(async cmd=>cmd==='list_folder_tree'?[{name:'INBOX'}]:(++roleCalls===1?oldRoles.promise:{sent:'new'}));
 const old=h.refresh();await flush();const current=h.refresh();assert.equal(await current,true);
 oldRoles.resolve({sent:'stale'});assert.equal(await old,false);assert.equal(h.state.roles.sent,'new');
});
test('stale failures and switches to unified scope do not produce notices or stale navigation',async()=>{
 const list=deferred();const h=folderHarness(()=>list.promise);const first=h.refresh();
 h.state.account=null;assert.equal(await h.refresh(),false);list.reject(new Error('old account offline'));
 assert.equal(await first,false);assert.equal(h.notices.length,0);assert.equal(h.state.folders.length,0);
});
test('account selection paints locally before LIST and invalidates the previous request immediately',async()=>{
 const requests=[];const h=folderHarness(cmd=>{if(cmd==='folder_roles')return Promise.resolve({});const d=deferred();requests.push(d);return d.promise});
 const stale=h.refresh();await h.select(2);assert.deepEqual(h.events,['local']);assert.equal(h.state.account,2);
 requests[0].resolve([{name:'wrong'}]);assert.equal(await stale,false);assert.equal(h.state.folders.length,0);
 requests[1].resolve([{name:'correct'}]);await flush();assert.equal(h.state.folders[0],'correct');
});
test('the production init paints the shell and local page without awaiting remote discovery',async()=>{
 const remote=deferred(),events=[],calls=[];
 const h=folderHarness(async cmd=>{
  calls.push(cmd);
  if(cmd==='bootstrap')return {accounts:[{id:1}],default_account_id:1,settings:{navigationStyle:'tree'}};
  if(cmd==='list_saved_searches')return [];
  if(cmd==='list_folder_tree')return remote.promise;
  if(cmd==='folder_roles')return {};
 });
 Object.assign(h.context,{
  registerClientDiagnostics(){},installControlEnhancer(){},initI18n(){},installI18nObserver(){},needsFirstRun:()=>false,
  getLocale:()=>'pt-BR',localStorage:{getItem:()=>null},normalizeNavMode:x=>x,normalizeGroups:()=>[],normalizeFolderRefs:()=>[],safeJson:()=>({}),
  setTheme(){},setDensity(){},renderShell:()=>events.push('shell'),loadMessages:async()=>events.push('local'),
  refreshLocalDrafts:async()=>{},refreshUnreadCounts:async()=>{},restoreWorkspaceReaders:async()=>{},recoverLocalDrafts:async()=>{},
  globalKeys(){},refreshShortcutTooltips(){},document:{body:{},addEventListener(){}},window:{addEventListener(){}},setTimeout:()=>0
 });
 vm.runInContext(production(main,'init'),h.context);await h.context.init();
 assert.deepEqual(events,['shell','local']);assert.ok(calls.includes('list_folder_tree'));assert.ok(!calls.includes('folder_roles'));
 remote.resolve([]);await flush();
});
test('sidebar refresh does not remount the live list, reader or composer',()=>{
 const pane={scrollTop:29},sidebar={scrollTop:53,innerHTML:'old',querySelector:()=>pane};let writes=0;
 const state={current:{id:12},items:[{id:12}],selected:new Set([12])},items=state.items,current=state.current;
 const context=vm.createContext({state,$:q=>{assert.equal(q,'.sidebar');return sidebar},sidebarContentHtml:()=>{writes++;return 'updated'},wireShell(){},ensureSidebarTooltips(){},updateUnreadCountDom(){},updateDraftCountDom(){}});
 vm.runInContext(`(${production(main,'refreshFolderSidebar')})()`,context);
 assert.equal(writes,1);assert.equal(sidebar.innerHTML,'updated');assert.equal(sidebar.scrollTop,53);assert.equal(pane.scrollTop,29);
 assert.equal(state.items,items);assert.equal(state.current,current);assert.deepEqual([...state.selected],[12]);
});
function fontHarness(invoke){
 const context=vm.createContext({invoke});vm.runInContext('let systemFontsPromise=null;'+production(composer,'cachedSystemFonts'),context);
 return context.cachedSystemFonts;
}
test('simultaneous composers share one font request and reuse its normalized result',async()=>{
 const response=deferred();let calls=0;const fonts=fontHarness(()=>{calls++;return response.promise});
 const first=fonts(),second=fonts();assert.equal(first,second);await flush();assert.equal(calls,1);
 response.resolve(['Arial',' Arial ','',null,'Sans']);assert.deepEqual(Array.from(await first),['Arial','Sans']);
 assert.equal(fonts(),first);assert.equal(calls,1);
});
test('font failure has a nonrejecting fallback and clears the cached promise for retry',async()=>{
 let calls=0;const fonts=fontHarness(()=>++calls===1?Promise.reject(new Error('synthetic font failure')):Promise.resolve(['Recovered']));
 const first=fonts(),second=fonts();assert.equal(first,second);
 assert.deepEqual(Array.from(await first),['Sans','Serif','Monospace']);
 assert.deepEqual(Array.from(await fonts()),['Recovered']);assert.equal(calls,2);
});
test('invalid font responses and synchronous IPC errors do not poison the cache',async()=>{
 let calls=0;const fonts=fontHarness(()=>{calls++;if(calls===1)throw new Error('IPC unavailable');return calls===2?[]:['Valid']});
 assert.equal((await fonts())[0],'Sans');assert.equal((await fonts())[0],'Sans');assert.equal((await fonts())[0],'Valid');assert.equal(calls,3);
});
test('independent preferences overlap while account overrides and per-key fallbacks remain intact',async()=>{
 const requests=[];const context=vm.createContext({invoke:(cmd,{key})=>{assert.equal(cmd,'get_setting_value');const d=deferred();requests.push({key,...d});return d.promise}});
 vm.runInContext(production(composer,'loadComposerPreferences'),context);
 const pending=context.loadComposerPreferences(9,{composeFont:'BootFont',composeSize:'12',composeUndo:'20',composeSpellcheck:true});
 assert.equal(requests.length,18);assert.ok(requests.every(r=>r.key.startsWith('account.9.')));
 for(const r of [...requests]){
  if(r.key.endsWith('default_font'))r.reject(new Error('one lookup unavailable'));
  else if(r.key.endsWith('spellcheck'))r.resolve('false');
  else if(r.key.endsWith('safety_external')||r.key.endsWith('.recovery'))r.resolve('false');
  else r.resolve(null);
 }
 await flush();
 const globals=requests.filter(r=>!r.key.startsWith('account.'));
 assert.ok(!globals.some(r=>r.key==='composition.safety_external'||r.key==='composition.recovery'));
 for(const r of globals){if(r.key.endsWith('safety_internal_domains'))r.resolve('EXAMPLE.test; local.test');else r.reject(new Error('global unavailable'))}
 const prefs=await pending;
 assert.equal(prefs.composePrefs.font,'BootFont');assert.equal(prefs.composePrefs.size,'12');assert.equal(prefs.composePrefs.spell,false);
 assert.equal(prefs.safety.external,false);assert.equal(prefs.safety.attachment,true);assert.equal(prefs.r13.recovery,false);assert.equal(prefs.r13.confirmDiscard,true);
 assert.deepEqual(Array.from(prefs.safety.internalDomains),['example.test','local.test']);
});
function surfaceHarness(values={}){
 const calls=[],state={account:1,view:'mail',boot:{default_account_id:1,accounts:[{id:1}]}};
 const context=vm.createContext({state,ctx:{},window:{},document:{querySelector:()=>({})},
  invoke:async(cmd,{key})=>{calls.push(key);const value=values[key];if(value instanceof Error)throw value;return value??null},
  openInlineComposer:async seed=>({surface:'inline',seed}),openNativeComposer:async(ctx,seed)=>({surface:'window',seed}),refreshLocalDrafts:async()=>{},showError:e=>{throw e}
 });
 vm.runInContext([production(main,'currentComposerSurface'),production(main,'openComposer')].join('\n'),context);
 return {context,state,calls};
}
test('C12 account surface overrides the global setting for both inline and window',async()=>{
 for(const [own,global] of [['inline','window'],['window','inline']]){
  const h=surfaceHarness({'account.1.composition.reply_surface':own,'composition.reply_surface':global});
  assert.equal(await h.context.currentComposerSurface(1),own);assert.deepEqual(h.calls,['account.1.composition.reply_surface']);
 }
});
test('C12 absent, invalid or failed account settings fall back per activation',async()=>{
 for(const own of [null,'invalid',new Error('synthetic key unavailable')]){
  const h=surfaceHarness({'account.1.composition.reply_surface':own,'composition.reply_surface':'window'});
  assert.equal(await h.context.currentComposerSurface(1),'window');assert.equal(h.calls[1],'composition.reply_surface');
 }
 const h=surfaceHarness();assert.equal(await h.context.currentComposerSurface(1),'inline');
});
test('C12 account is captured before awaiting preferences; explicit detach bypasses them',async()=>{
 const h=surfaceHarness(),setting=deferred();h.context.invoke=()=>setting.promise;
 const pending=h.context.openComposer({},{});h.state.account=2;setting.resolve('inline');
 const opened=await pending;assert.equal(opened.seed.accountId,1);assert.equal(opened.surface,'inline');
 let calls=0;h.context.invoke=()=>{calls++;throw new Error('Must not query for explicit detach')};
 const detached=await h.context.openComposer({},{accountId:2,__forceWindow:true});
 assert.equal(detached.surface,'window');assert.equal(detached.seed.accountId,2);assert.equal(calls,0);
});
function estimateClock(){
 let now=0,next=0;const timers=new Map();
 const context=vm.createContext({setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(production(composer,'deferComposerEstimate'),context);
 return {schedule:context.deferComposerEstimate,timers,tick(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn()}}};
}
test('typing bursts coalesce the estimate and read the last content after the debounce',()=>{
 const clock=estimateClock();let text='initial',reads=0,result='';const schedule=clock.schedule(()=>{reads++;result=text});
 for(let i=0;i<30;i++){text=`revision ${i}`;schedule();clock.tick(3)}
 assert.equal(reads,0);assert.equal(clock.timers.size,1);clock.tick(180);
 assert.equal(reads,1);assert.equal(result,'revision 29');assert.equal(clock.timers.size,0);
});
test('closing one composer cancels only its pending estimate',()=>{
 const clock=estimateClock();let first=0,second=0;const a=clock.schedule(()=>first++),b=clock.schedule(()=>second++);
 a();b();a.cancel();clock.tick(200);assert.equal(first,0);assert.equal(second,1);
 assert.match(composer,/onClose:\(\)=>\{scheduleWordCount\?\.cancel\(\)/);
});
function threadHarness(items){
 const state={items,threaded:true,collapsedThreads:new Set(),selected:new Set(),folder:'INBOX',account:1,density:'comfortable'};
 const context=vm.createContext({state});vm.runInContext(['threadRoot','countThreads','threadCount','displayedRows'].map(n=>production(main,n)).join('\n'),context);
 return {state,context};
}
test('thread counts include loaded members, isolate accounts and follow append/removal without stale cache',()=>{
 const items=[{id:1,account_id:1,message_id:'<root>',date_ts:1},{id:2,account_id:1,references_text:'<root> <child>',date_ts:3},{id:3,account_id:2,message_id:'<root>',date_ts:2},{id:4,account_id:1,date_ts:4}];
 const {state,context:c}=threadHarness(items);let counts=c.countThreads(items);
 assert.equal(c.threadCount(items[0],counts),2);assert.equal(c.threadCount(items[2],counts),1);assert.equal(c.threadCount(items[3],counts),1);
 state.collapsedThreads.add('1:<root>');assert.deepEqual(Array.from(c.displayedRows(),r=>r.id),[2,3,4]);
 items.push({id:5,account_id:1,in_reply_to:'<root>',date_ts:5});counts=c.countThreads(items);assert.equal(c.threadCount(items[0],counts),3);
 items.splice(1,1);counts=c.countThreads(items);assert.equal(c.threadCount(items[0],counts),2);
});
test('virtual rendering uses precalculated counts instead of rescanning all messages per visible row',()=>{
 const items=Array.from({length:2000},(_,i)=>({id:i+1,account_id:1,message_id:`<${i%20}>`,date_ts:i,subject:'Synthetic'}));
 const {state,context:c}=threadHarness(items),viewport={scrollTop:0,clientHeight:600},rows={style:{},innerHTML:''},spacer={style:{}};
 Object.assign(c,{esc,fmtDate:()=>'',icon:()=>'',folderName:()=>'',smartCategory:()=>'',draftStatusLabel:()=>'',updateBatch(){},$$:()=>[],$:q=>({'#rowsViewport':viewport,'#rows':rows,'#rowsSpacer':spacer}[q])});
 vm.runInContext(['rowHeight','messageRowHtml','renderVirtualRows'].map(n=>production(main,n)).join('\n')+'\nlet roots=0;const originalRoot=threadRoot;threadRoot=m=>{roots++;return originalRoot(m)};',c);
 c.renderVirtualRows();assert.match(rows.innerHTML,/>100 ▾<\/button>/);assert.equal(spacer.style.height,'176000px');
 assert.ok(vm.runInContext('roots',c)<items.length*3,'Per-row full scans must not return');
});
test('quoted HTML delegates to the fragment sanitizer and text-only quotes remain escaped',()=>{
 const calls=[],context=vm.createContext({sanitizeComposerHtml:raw=>{calls.push(raw);return '<b>safe</b>'},esc});
 vm.runInContext(production(main,'originalMessageHtml'),context);
 assert.equal(context.originalMessageHtml({body_html:'<b>quote</b><img src="https://synthetic.invalid/pixel">'}),'<b>safe</b>');
 assert.equal(calls.length,1);assert.equal(context.originalMessageHtml({body_text:'<unsafe>\ntext'}),'&lt;unsafe&gt;<br>text');
});
test('initial composer HTML is sanitized before the live editor assignment',()=>{
 const statement=composer.match(/if\(seed\.htmlBody\)editor\.innerHTML=sanitizeComposerHtml\(seed\.htmlBody\);/)?.[0];assert.ok(statement);
 const seed={htmlBody:'<img src="https://synthetic.invalid/pixel">'},editor={innerHTML:''},calls=[];
 vm.runInNewContext(statement,{seed,editor,sanitizeComposerHtml:raw=>{calls.push(raw);return '<img src="cid:approved">'}});
 assert.equal(calls[0],seed.htmlBody);assert.equal(editor.innerHTML,'<img src="cid:approved">');
});
test('preview sanitizes real HTML before opening the modal and inserting the fragment',()=>{
 const line=composer.split('\n').find(l=>l.includes("$('#composePreviewBtn',root).onclick="));assert.ok(line);
 const events=[],button={},box={innerHTML:''},root={},context=vm.createContext({root,esc,
  $:selector=>selector==='#composePreviewBtn'?button:{value:'Synthetic'},recipientFields:{to:{commit:()=>''}},
  serializableHtml:()=>'<b>format</b><img src="https://synthetic.invalid/pixel">',
  sanitizeComposerHtml:()=>{events.push('sanitize');return '<b>format</b><img src="cid:approved">'},
  modal:()=>{events.push('modal');return {root:{querySelector:()=>box}}}
 });
 vm.runInContext(line,context);button.onclick();assert.deepEqual(events,['sanitize','modal']);assert.equal(box.innerHTML,'<b>format</b><img src="cid:approved">');
});
