import {attachReaderFind} from './reader_find.js';
import {registerClientDiagnostics,showIncidentIfNeeded} from './diagnostics_support.js';
import {workspaceHtml,bindAiWorkspace} from './ai_workspace.js';
import {invoke,$,$$,esc,fmtDate,formatBytes,debounce,toast,modal,sanitizeEmailHtml,emailHtmlForDisplay,fromLocalInput,confirmDialog,promptDialog} from './lib.js';
import {openNativeComposer,openNativeReader} from './native_windows.js';
import {nativeWindowRoute} from './native_route.js';
import {openComposer as openComposerSurface} from './composer.js';
import {renderTasks,renderCalendar,renderContacts,renderFollowUps,renderOutbound,openSettings} from './views.js';
import {icon} from './icons.js';
import {matches as shortcutMatches,tooltip as shortcutTooltip,SHORTCUTS} from './shortcuts.js';
import {draftSeed,draftRow,localDraftsForScope,filterLocalDrafts,mergeDraftRows} from './drafts.js';
import {WorkspaceModel} from './workspace.js';
import {NAV_MODES,normalizeNavMode,safeJson,normalizeGroups,normalizeFolderRefs,folderRefKey,isHidden,isFavorite,toggleFolderRef,groupAccountIds,visibleFolders} from './nav_modes.js';
import {installControlEnhancer} from './ui_controls.js';
import {initI18n,installI18nObserver,tr,getLocale} from './i18n.js';

const app=$('#app');
const state={boot:null,account:null,folder:'INBOX',roles:{},folders:[],folderTree:[],page:null,items:[],selected:new Set(),current:null,search:'',readFilter:'all',quickFilter:'all',sortBy:localStorage.getItem('tcs.h01.sort')||'date',sortDir:localStorage.getItem('tcs.h01.dir')||'desc',threaded:localStorage.getItem('tcs.h01.threads')==='1',collapsedThreads:new Set(),view:'mail',compact:false,theme:'system',density:'comfortable',rowHeight:88,listWidth:390,focusId:null,selectionAnchor:null,localDrafts:[],readTimer:null,openRequestSeq:0,listRequestSeq:0,navigationMode:'tree',unifiedAccounts:new Set(),navigationGroups:[],activeGroupId:null,groupAccountIds:new Set(),folderFavorites:[],hiddenFolders:[],subscribedOnly:false,folderExpansion:{},savedSearches:[],navigationTab:'accounts',navAccountWidth:150,columnsFolderCollapsed:false,unreadCounts:{},workspace:new WorkspaceModel()};
const ctx={state,openSettings:(k)=>openSettings(ctx,k),setCompact,setTheme,setDensity,setNavigationMode,openComposer:(seed)=>openComposer(ctx,seed),goView:(v)=>goView(v),goMail:(f)=>goMail(f),workspaceRegister,workspaceUpdate,workspaceMinimize,workspaceRestore,workspaceRemove,refreshLocalDrafts,persistNavigationState,openFolderOrganizer,openNavigationGroupsManager};
// Determine the destination at click time instead of relying on a stale UI cache.
// An explicit detach request always wins; errors preserve existing drafts.
async function currentComposerSurface(accountId) {
  const globalSetting=await invoke('get_setting_value',{key:'composition.reply_surface'}).catch(()=>null);
  return globalSetting==='window'?'window':'inline';
}
async function openComposer(_ctx,seed={}) {
 if(window.__TCS_BROWSER_HARNESS__)return openComposerSurface(ctx,seed);
 const destination=seed.__forceWindow===true?'window':await currentComposerSurface(seed.accountId??state.account);
 if(destination==='inline'){
  if(state.view!=='mail')goView('mail');
  // The reader workspace must be mounted before inserting an editor tab.
  if(!document.querySelector('.mailWorkspace .reader'))renderShell();
  return openInlineComposer(seed);
 }
 try {
  const draftId=await openNativeComposer(ctx,seed);
  await refreshLocalDrafts();
  return draftId;
 } catch(error) {
  showError(`Não foi possível abrir o Composer em janela independente: ${error}. O rascunho local foi preservado.`);
  return null;
 }
}
const composerTabs=new Map();
let activeReaderTab='read';
async function openResponseComposer(seed){
 return openComposer(ctx,seed);
}
const tabDomId=id=>'tcs-compose-tab-'+Array.from(new TextEncoder().encode(String(id)),b=>b.toString(16).padStart(2,'0')).join('');
function readTabTitle(){return String(state.current?.subject||state.items.find(x=>x.id===state.focusId)?.subject||'Leitura').trim()||'Leitura'}
function ensureReaderTabs(){
 const pane=document.querySelector('.mailWorkspace .reader');if(!pane)return null;
 let tabs=pane.querySelector(':scope > #readerTabs');
 if(!tabs){
  tabs=document.createElement('div');tabs.id='readerTabs';tabs.className='readerTabs multiReaderTabs';
  tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Leitura e mensagens em composição');
  const pinned=document.createElement('button');pinned.type='button';pinned.id='readerReadTab';pinned.className='readerPinnedTab';
  pinned.setAttribute('role','tab');pinned.setAttribute('aria-controls','reader');
  pinned.innerHTML='<svg class="pinnedReadIcon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><span class="readerPinLabel"></span>';
  pinned.addEventListener('click',()=>switchReaderTab('read'));
  tabs.append(pinned);
  const scroller=document.createElement('div');scroller.id='composerTabStrip';scroller.className='composerTabStrip';tabs.append(scroller);
  const all=document.createElement('button');all.type='button';all.id='composerTabMenu';all.className='composerTabMenu';
  all.title='Localizar uma aba';all.setAttribute('aria-label','Localizar uma aba');all.setAttribute('aria-expanded','false');all.textContent='▾';all.hidden=true;
  const picker=document.createElement('div');picker.id='composerTabPicker';picker.className='composerTabPicker';picker.hidden=true;
  all.addEventListener('click',()=>{picker.hidden=!picker.hidden;all.setAttribute('aria-expanded',String(!picker.hidden))});
  tabs.append(all,picker);
  tabs.addEventListener('focusout',e=>{if(!tabs.contains(e.relatedTarget)){picker.hidden=true;all.setAttribute('aria-expanded','false')}});
  tabs.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    const available=[...tabs.querySelectorAll('[role="tab"]')];const index=available.indexOf(document.activeElement);
    if(index<0)return;e.preventDefault();
    let next=e.key==='Home'?0:e.key==='End'?available.length-1:(index+(e.key==='ArrowRight'?1:-1)+available.length)%available.length;
    available[next]?.focus();switchReaderTab(available[next]?.dataset.draftId||'read');
  });
  pane.prepend(tabs);
 }
 let host=pane.querySelector(':scope > #inlineComposerHost');
 if(!host){host=document.querySelector('#tcsComposerParking > #inlineComposerHost');if(!host){host=document.createElement('div');host.id='inlineComposerHost';host.className='inlineComposerHost'}pane.append(host)}
 pane.querySelectorAll('#reader #inlineComposerHost').forEach(duplicate=>{if(duplicate!==host&&!duplicate.children.length)duplicate.remove()});
 syncReaderTabs();return host;
}
function refreshComposerTabButtons(pane){
 const strip=pane.querySelector('#composerTabStrip');if(!strip)return;
 const shown=new Set();
 for(const entry of composerTabs.values()){
  const id=tabDomId(entry.draftId);shown.add(id);
  let wrap=strip.querySelector(`[data-tab-wrapper="${id}"]`);
  if(!wrap){
   wrap=document.createElement('div');wrap.className='composerTabWrapper';wrap.dataset.tabWrapper=id;
   const tab=document.createElement('button');tab.type='button';tab.id=id;tab.setAttribute('role','tab');
   tab.dataset.draftId=entry.draftId;tab.setAttribute('aria-controls',entry.panel.id);tab.className='composerDraftTab';
   tab.onclick=()=>switchReaderTab(entry.draftId);
   const close=document.createElement('button');close.type='button';close.className='composerTabClose';close.textContent='×';
   close.title='Fechar composição';close.setAttribute('aria-label','Fechar '+(entry.title||'Nova mensagem'));
   close.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();entry.controller?.requestClose?.()});
   const detach=document.createElement('button');detach.type='button';detach.className='composerTabDetach';
   detach.title='Abrir em janela independente';detach.setAttribute('aria-label','Abrir composição em janela independente');
   detach.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="8" width="13" height="13" rx="2"/><path d="M12 4h8v8M20 4l-9 9"/></svg>';
   detach.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();if(detach.disabled||!entry.controller)return;detach.disabled=true;try{await entry.controller.detachToWindow()}catch(error){showError(error)}finally{detach.disabled=false}});
   wrap.append(tab,detach,close);strip.append(wrap);
  }
  const tab=wrap.querySelector('[role="tab"]');tab.textContent=entry.title||'Nova mensagem';
  tab.title=entry.title||'Nova mensagem';tab.setAttribute('aria-label',entry.title||'Nova mensagem');
  wrap.querySelector('.composerTabClose').setAttribute('aria-label','Fechar '+(entry.title||'Nova mensagem'));
 }
 for(const node of [...strip.children])if(!shown.has(node.dataset.tabWrapper))node.remove();
 const menu=pane.querySelector('#composerTabMenu'),picker=pane.querySelector('#composerTabPicker');
 if(menu)menu.hidden=composerTabs.size<3;
 if(picker){picker.replaceChildren();for(const entry of composerTabs.values()){
   const item=document.createElement('button');item.type='button';item.textContent=entry.title||'Nova mensagem';item.title=entry.title||'Nova mensagem';
   item.addEventListener('click',()=>{picker.hidden=true;menu?.setAttribute('aria-expanded','false');switchReaderTab(entry.draftId)});
   picker.append(item);
 }if(composerTabs.size<3)picker.hidden=true;}
}
function syncReaderTabs(){
 const pane=document.querySelector('.mailWorkspace .reader');if(!pane)return;
 if(activeReaderTab!=='read'&&!composerTabs.has(activeReaderTab))activeReaderTab='read';
 const read=pane.querySelector('#reader'),empty=pane.querySelector('#readerEmpty');
 if(read){read.setAttribute('role','tabpanel');read.setAttribute('aria-labelledby','readerReadTab')}
 const host=pane.querySelector(':scope > #inlineComposerHost');
 if(read)read.hidden=activeReaderTab!=='read';
 if(empty)empty.hidden=activeReaderTab!=='read'||!!state.current;
 if(host)host.hidden=activeReaderTab==='read';
 for(const entry of composerTabs.values())if(entry.panel)entry.panel.hidden=activeReaderTab!==entry.draftId;
 refreshComposerTabButtons(pane);
 const readButton=pane.querySelector('#readerReadTab');if(readButton){
  readButton.querySelector('.readerPinLabel').textContent=readTabTitle();readButton.title=readTabTitle();
  readButton.classList.toggle('active',activeReaderTab==='read');
  readButton.setAttribute('aria-selected',String(activeReaderTab==='read'));
  readButton.tabIndex=activeReaderTab==='read'?0:-1;
 }
 for(const entry of composerTabs.values()){
  const btn=pane.querySelector('#'+tabDomId(entry.draftId));if(!btn)continue;
  const active=activeReaderTab===entry.draftId;
  btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;
 }
}
function switchReaderTab(key){
 activeReaderTab=key==='compose'?[...composerTabs.keys()].at(-1)||'read':String(key||'read');
 syncReaderTabs();
 if(activeReaderTab!=='read')document.getElementById(tabDomId(activeReaderTab))?.scrollIntoView?.({block:'nearest',inline:'nearest'});
}
function parkReaderComposer(){
 const host=document.querySelector('.mailWorkspace .reader > #inlineComposerHost');
 if(host){let parking=document.querySelector('#tcsComposerParking');if(!parking){parking=document.createElement('div');parking.id='tcsComposerParking';parking.hidden=true;document.body.append(parking)}parking.append(host)}
}
function restoreReaderComposer(){if(!ensureReaderTabs())return;syncReaderTabs()}
function unregisterComposerTab(draftId){
 const entry=composerTabs.get(draftId);if(!entry)return;
 composerTabs.delete(draftId);
 entry.panel?.remove();
 if(activeReaderTab===draftId)activeReaderTab='read';
 syncReaderTabs();
}
async function openInlineComposer(seed={}){
 const draftId=String(seed.draftId||crypto.randomUUID());
 if(composerTabs.has(draftId)){
  const existing=composerTabs.get(draftId);
  switchReaderTab(draftId);return existing.controller||null;
 }
 const host=ensureReaderTabs();if(!host){toast('Painel de leitura indisponível.');return null}
 const panel=document.createElement('div');panel.className='composerTabPanel';panel.id='compose-panel-'+Array.from(new TextEncoder().encode(draftId),b=>b.toString(16).padStart(2,'0')).join('');
 panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tabDomId(draftId));
 panel.hidden=true;host.append(panel);
 const title=String(seed.subject||'Nova mensagem').trim()||'Nova mensagem';
 const entry={draftId,title,panel,controller:null,pending:true};composerTabs.set(draftId,entry);
 panel.innerHTML='<div class="inlineComposerLoading" role="status">Preparando o editor…</div>';
 switchReaderTab(draftId);
 try{
  const controller=await openComposerSurface(ctx,{...seed,draftId},{
   inlineHost:panel,
   openDetached:async id=>{
    // openNativeComposer resolves only after the destination editor confirms readiness.
    await openNativeComposer(ctx,{draftId:id,accountId:seed.accountId||state.account});
   },
   openAccountComposer:async(accountId,draft)=>openInlineComposer({...draft,accountId}),
   onSubjectChange:subject=>{entry.title=String(subject||'Nova mensagem').trim()||'Nova mensagem';syncReaderTabs()},
   onClosed:()=>unregisterComposerTab(draftId)
  });
  if(!panel.contains(controller?.root)||!panel.querySelector('[data-tcs-id="editor"]'))throw Error('Editor não montado na aba.');
  entry.controller=controller;entry.pending=false;
  panel.querySelector(':scope > .inlineComposerLoading')?.remove();
  syncReaderTabs();return controller;
 }catch(error){
  // Do not delete or overwrite a persisted draft if initialization failed.
  entry.controller?.close?.();unregisterComposerTab(draftId);showError(error);return null;
 }
}
async function attachExistingDraft(draftId){
 const key=String(draftId);
 // Never bind two live editors to one draft; refuse a conflicting reattachment.
 if(composerTabs.has(key))return false;
 if(state.view!=='mail'||!document.querySelector('.mailWorkspace .reader'))return false;
 const records=await invoke('list_local_drafts');const record=records.find(r=>String(r.id)===key);
 if(!record){toast('Rascunho indisponível para reanexar.');return false}
 const controller=await openInlineComposer(draftSeed(record));
 return !!controller&&!controller.isClosed()&&controller.draftId===key;
}
async function init(){registerClientDiagnostics();installControlEnhancer();state.boot=await invoke('bootstrap');initI18n(state.boot.settings.uiLanguage||'system');installI18nObserver(document.body);invoke('set_setting',{req:{key:'ui.effective_language',value:getLocale()}}).catch(()=>{});state.navigationMode=normalizeNavMode(state.boot.settings.navigationStyle||localStorage.getItem('tcs.navigationStyle')||'tree');const savedUnified=String(state.boot.settings.unifiedAccounts||localStorage.getItem('tcs.unifiedAccounts')||'').split(',').map(Number).filter(id=>Number.isFinite(id)&&id>0&&state.boot.accounts.some(a=>a.id===id));state.unifiedAccounts=new Set(savedUnified.length?savedUnified:state.boot.accounts.map(a=>a.id));state.navigationGroups=normalizeGroups(safeJson(state.boot.settings.navigationGroups,'[]'),state.boot.accounts);state.folderFavorites=normalizeFolderRefs(safeJson(state.boot.settings.folderFavorites,'[]'));state.hiddenFolders=normalizeFolderRefs(safeJson(state.boot.settings.hiddenFolders,'[]'));state.subscribedOnly=state.boot.settings.subscribedOnly===true;state.folderExpansion=safeJson(state.boot.settings.folderExpansion,'{}')||{};state.navigationTab=['accounts','folders','views'].includes(state.boot.settings.navigationTab)?state.boot.settings.navigationTab:'accounts';state.navAccountWidth=Math.max(110,Math.min(240,Number(state.boot.settings.navAccountWidth)||150));state.account=['unified','groups'].includes(state.navigationMode)?null:(state.boot.default_account_id||state.boot.accounts[0]?.id||null);state.compact=!!state.boot.settings.sidebarCompact;state.theme=state.boot.settings.theme||'system';state.density=state.boot.settings.density||'comfortable';state.listWidth=Math.max(280,Math.min(760,Number(state.boot.settings.listWidth)||390));state.columnsFolderCollapsed=localStorage.getItem('tcs.columnsFolderCollapsed')==='1';state.savedSearches=await invoke('list_saved_searches').catch(()=>[]);setTheme(state.theme,false);setDensity(state.density,false);await refreshFolders();renderShell();setTimeout(()=>showIncidentIfNeeded(state.boot).catch(console.warn),400);const auxiliaryInit=Promise.allSettled([refreshLocalDrafts(),refreshUnreadCounts()]);if(state.account!==null||state.boot.accounts.length)await loadMessages();auxiliaryInit.catch(()=>{});localStorage.removeItem('tcs.workspace.readers');if(state.boot.compose_uri)openMailto(state.boot.compose_uri);if(state.boot.open_message_id)openMessage(Number(state.boot.open_message_id));recoverLocalDrafts().catch(()=>{});window.addEventListener('keydown',globalKeys);window.addEventListener('tcs-shortcuts-changed',refreshShortcutTooltips);window.addEventListener('tcs-account-updated',e=>{const d=e.detail||{};const a=state.boot.accounts.find(x=>Number(x.id)===Number(d.id));if(a)Object.assign(a,d);renderShell();});window.addEventListener('tcs-saved-searches-changed',async()=>{state.savedSearches=await invoke('list_saved_searches').catch(()=>[]);renderShell()});document.addEventListener('contextmenu',e=>{if(e.defaultPrevented)return;const t=e.target;if(t?.closest?.('input,textarea,[contenteditable="true"],.row,#newMail,.contextMenu'))return;e.preventDefault()});window.addEventListener('resize',()=>{if($('.mailWorkspace')){applyMailListWidth(state.listWidth);renderVirtualRows()}});window.__TAURI__?.event?.listen?.('open-mailto',e=>{if(e?.payload)openMailto(String(e.payload))}).catch?.(()=>{});window.__TAURI__?.event?.listen?.('open-message',e=>{if(e?.payload)openMessage(Number(e.payload))}).catch?.(()=>{});window.__TAURI__?.event?.listen?.('tcs-reattach-composer',async e=>{
 const payload=e?.payload||{},requestId=String(payload.requestId||''),draftId=String(payload.draftId||'');
 if(!requestId||!draftId)return;
 const free=state.view==='mail'&&!!document.querySelector('.mailWorkspace .reader')&&!composerTabs.has(draftId);
 // Acknowledge only after the draft is actually restored; never close the original prematurely.
 if(!window.__tcsReattaching)window.__tcsReattaching=new Set();
 const pending=window.__tcsReattaching;
 if(!free||[...pending].some(x=>x===draftId)){await window.__TAURI__.event.emit('tcs-reattach-response',{requestId,accepted:false});return}
 pending.add(draftId);
 try{
   const restored=await attachExistingDraft(draftId);
   await window.__TAURI__.event.emit('tcs-reattach-response',{requestId,accepted:restored});
 }catch(error){showError(error);await window.__TAURI__.event.emit('tcs-reattach-response',{requestId,accepted:false})}
 finally{pending.delete(draftId)}
}).catch?.(()=>{});window.__TAURI__?.event?.listen?.('drafts-changed',async()=>{await refreshLocalDrafts();if(state.view==='mail'&&(state.folder===folderName('drafts')||state.folder==='__DRAFTS'))await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true})}).catch?.(()=>{})}


async function refreshLocalDrafts(){
 state.localDrafts=await invoke('list_local_drafts').catch(()=>[]);
 updateDraftCountDom();
 return state.localDrafts;
}
async function refreshUnreadCounts(){
 const pairs=await Promise.all(state.boot.accounts.map(async a=>[a.id,await invoke('folder_unread_counts',{accountId:a.id}).catch(()=>({}))]));
 const next={};for(const [accountId,counts] of pairs)for(const [folder,count] of Object.entries(counts||{}))next[folderRefKey(accountId,folder)]=Number(count)||0;state.unreadCounts=next;updateUnreadCountDom();return next
}
function unreadCount(accountId,folder){return Number(state.unreadCounts[folderRefKey(accountId,folder)]||0)}
function unreadCountForAccounts(accountIds,folder){return (accountIds||[]).reduce((sum,id)=>sum+unreadCount(id,folder),0)}
function unreadBadge(count){count=Number(count)||0;return count>0?`<span class="unreadBadge" title="${count} mensagem(ns) não lida(s)">${count>999?'999+':count}</span>`:''}
function updateUnreadCountDom(){document.querySelectorAll('[data-unread-account][data-unread-folder]').forEach(el=>{const count=unreadCount(Number(el.dataset.unreadAccount),el.dataset.unreadFolder);el.innerHTML=unreadBadge(count)});document.querySelectorAll('[data-unread-unified]').forEach(el=>{const count=unreadCountForAccounts(activeAccountIds(),el.dataset.unreadUnified);el.innerHTML=unreadBadge(count)})}
function updateDraftCountDom(){
 const count=currentLocalDraftCount();
 const label=count?`Rascunhos · ${count} ${count===1?'local':'locais'}`:'Rascunhos';
 $$('[data-folder], [data-unified-folder]').forEach(b=>{const f=b.dataset.folder||b.dataset.unifiedFolder;if(f===folderName('drafts')||f==='__DRAFTS'){const title=$('b',b);if(title)title.textContent=label}});
}
function scopedLocalDrafts(){
 return localDraftsForScope(state.localDrafts,{navigationMode:state.navigationMode,account:state.account,accountIds:activeAccountIds()});
}
function currentLocalDraftCount(){return scopedLocalDrafts().length}

function persistWorkspaceReaders(){try{const readers=state.workspace.snapshot().filter(x=>x.type==='reader').map(x=>({id:x.messageId,title:x.title,minimized:true}));localStorage.setItem('tcs.workspace.readers',JSON.stringify(readers))}catch{}}
async function restoreWorkspaceReaders(){let saved=[];try{saved=JSON.parse(localStorage.getItem('tcs.workspace.readers')||'[]')}catch{}for(const item of saved.slice(0,12)){const id=Number(item?.id);if(Number.isFinite(id)&&id>0)await openMessageFocused(id,{startMinimized:true})}}
function workspaceRegister(item){
 const current=state.workspace.get(item.key);
 if(current?.modal&&!current.modal.isClosed?.()){
   current.modal.restore?.();state.workspace.restore(item.key);renderWorkspaceShelf();return current;
 }
 state.workspace.register(item);persistWorkspaceReaders();renderWorkspaceShelf();return item;
}
function workspaceUpdate(key,patch){state.workspace.update(key,patch);persistWorkspaceReaders();renderWorkspaceShelf()}
function workspaceMinimize(key){const item=state.workspace.get(key);item?.modal?.minimize?.();state.workspace.minimize(key);persistWorkspaceReaders();renderWorkspaceShelf()}
function workspaceRestore(key){const item=state.workspace.get(key);item?.modal?.restore?.();state.workspace.restore(key);persistWorkspaceReaders();renderWorkspaceShelf()}
function workspaceRemove(key,{close=false}={}){const item=state.workspace.get(key);if(close){if(item?.modal?.requestClose){item.modal.requestClose();return}item?.modal?.close?.()}state.workspace.remove(key);persistWorkspaceReaders();renderWorkspaceShelf()}

function openWorkspaceManager(){
 const items=state.workspace.snapshot();
 const {root,close}=modal('Área de trabalho',`<div class="workspaceManager"><div class="settingsTitle"><div><h2>E-mails em trabalho</h2><p class="settingsPanelIntro">Readers e mensagens em composição ficam numa camada independente da tela principal. Minimize, restaure ou feche cada item sem perder os demais.</p></div></div>${items.map(item=>`<article class="workspaceManagerRow"><span class="workType">${item.type==='composer'?'✎':'✉'}</span><div><b>${esc(item.title||'(sem assunto)')}</b><small>${item.type==='composer'?'Composição':'Leitura'} · ${item.minimized?'minimizado':'aberto'}</small></div><div><button data-manager-restore="${esc(item.key)}">Restaurar</button><button data-manager-min="${esc(item.key)}">Minimizar</button><button data-manager-close="${esc(item.key)}" class="dangerAction">Fechar</button></div></article>`).join('')||'<p>Nenhum e-mail está em trabalho no momento.</p>'}</div><footer class="modalActions"><button id="workspaceMinAll">Minimizar todos</button><button id="workspaceDone" class="primary">Concluir</button></footer>`,{wide:true,resizable:true,persistKey:'workspace-manager'});
 $$('[data-manager-restore]',root).forEach(b=>b.onclick=()=>workspaceRestore(b.dataset.managerRestore));
 $$('[data-manager-min]',root).forEach(b=>b.onclick=()=>workspaceMinimize(b.dataset.managerMin));
 $$('[data-manager-close]',root).forEach(b=>b.onclick=()=>workspaceRemove(b.dataset.managerClose,{close:true}));
 $('#workspaceMinAll',root).onclick=()=>{for(const item of state.workspace.snapshot())workspaceMinimize(item.key);close()};
 $('#workspaceDone',root).onclick=close
}
function renderWorkspaceShelf(){
 // Draft composers live in native windows or reader tabs, never a third workspace UI.
 const shelf=document.querySelector('#workspaceShelf');
 if(shelf)shelf.remove();
}

async function refreshFolders(){
 if(!state.account){state.folders=[];state.folderTree=[];state.roles={};return}
 const accountId=state.account;
 try{
  // LIST/LSUB discovers roles and stores them before the second call. A parallel
  // folder_roles call can read stale Gmail Sent mapping from a prior session.
  const tree=await invoke('list_folder_tree',{accountId});
  const roles=await invoke('folder_roles',{accountId});
  if(state.account!==accountId)return;
  state.folderTree=tree||[];
  state.folders=state.folderTree.map(f=>f.name);
  state.roles=roles||{};
 }catch(e){
  // A transient Gmail timeout is not permission to forget persisted roles.
  if(state.account===accountId){const detail=String(e||'');const authFail=/AUTHENTICATIONFAILED|authentication failed|invalid credentials|invalid_grant/i.test(detail);toast(authFail?'Autenticação IMAP recusada. Confira a conta em Configurações > Contas e use Reconectar para renovar a autorização. As mensagens locais foram preservadas.':'Pastas IMAP indisponíveis no momento; usando dados anteriores. '+detail)};
 }
}
function folderName(kind){return state.roles[kind]||({sent:'Sent',drafts:'Drafts',archive:'Archive',junk:'Junk',trash:'Trash'})[kind]}
function navItems(){return [['INBOX','Caixa de entrada','inbox'],['__STARRED','Com estrela','star'],[folderName('sent'),'Enviados','sent'],[folderName('drafts'),'Rascunhos','draft'],[folderName('archive'),'Arquivo','archive'],[folderName('junk'),'Spam','spam'],[folderName('trash'),'Lixeira','trash']]}

function activeAccountIds(){
 if(state.navigationMode==='unified'){
   if(state.account&&state.boot.accounts.some(a=>a.id===state.account))return [state.account];
   return [...state.unifiedAccounts].filter(id=>state.boot.accounts.some(a=>a.id===id))
 }
 if(state.navigationMode==='groups'&&state.activeGroupId){
   return [...state.groupAccountIds].filter(id=>state.boot.accounts.some(a=>a.id===id))
 }
 return state.account?[state.account]:state.boot.accounts.map(a=>a.id)
}
function accountLabel(a){return esc(a.name||a.email)}
function folderExpansionKey(folder,accountId=state.account){return folderRefKey(accountId||0,folder)}
function folderIsExpanded(folder,accountId=state.account){
 const key=folderExpansionKey(folder,accountId);
 if(Object.prototype.hasOwnProperty.call(state.folderExpansion,key))return !!state.folderExpansion[key];
 return folder==='INBOX'
}
async function toggleFolderExpansion(folder,accountId=state.account){
 const key=folderExpansionKey(folder,accountId);
 state.folderExpansion[key]=!folderIsExpanded(folder,accountId);
 await persistNavigationState('expansion');
 renderShell()
}
function navFolderTree(){
 return visibleFolders(state.folderTree,{accountId:state.account,hidden:state.hiddenFolders,subscribedOnly:state.subscribedOnly})
}
function folderChildren(parent){
 const visible=navFolderTree();
 // Provider SPECIAL-USE folders are already exposed as first-class shortcuts;
 // do not duplicate [Gmail]/All Mail (\\All), Sent, Trash etc. in the tree.
 const special=new Set(['sent','drafts','archive','junk','trash'].map(folderName).filter(Boolean).map(f=>f.toLowerCase()));
 return visible.filter(f=>(f.parent||'').toLowerCase()===(parent||'').toLowerCase()&&!special.has(f.name.toLowerCase()))
}
function folderNodeHtml(node,depth=0){
 const kids=folderChildren(node.name),disabled=!node.selectable,active=state.view==='mail'&&state.folder===node.name,expanded=folderIsExpanded(node.name);
 return `<div class="folderNode depth${Math.min(depth,6)}">
   <div class="folderNodeLine">
    ${kids.length?`<button class="folderTwisty" data-folder-toggle="${esc(node.name)}" title="${expanded?'Recolher':'Expandir'}">${expanded?'▾':'▸'}</button>`:'<span class="folderTwisty spacer">•</span>'}
    <button class="navItem small folderMain ${active?'active':''} ${disabled?'disabled':''}" ${disabled?'disabled':''} data-folder="${esc(node.name)}" data-folder-context="${esc(node.name)}" title="${esc(node.name)}">
      <b>${esc(node.display_name||node.name)}</b><span class="unreadCountSlot" data-unread-account="${state.account}" data-unread-folder="${esc(node.name)}">${unreadBadge(unreadCount(state.account,node.name))}</span>${node.subscribed?'':'<i title="Pasta não inscrita">○</i>'}${isFavorite(state.folderFavorites,state.account,node.name)?'<i title="Favorita">★</i>':''}
    </button>
   </div>
   ${kids.length&&expanded?`<div class="folderChildren">${kids.map(k=>folderNodeHtml(k,depth+1)).join('')}</div>`:''}
 </div>`
}
function inboxTreeHtml(){
 const kids=folderChildren('INBOX'),expanded=folderIsExpanded('INBOX');
 return `<div class="folderNode">
   <div class="folderNodeLine">
    ${kids.length?`<button class="folderTwisty" data-folder-toggle="INBOX">${expanded?'▾':'▸'}</button>`:'<span class="folderTwisty spacer">•</span>'}
    <button class="navItem small folderMain ${state.folder==='INBOX'?'active':''}" data-folder="INBOX" data-folder-context="INBOX" title="Caixa de entrada"><b>Caixa de entrada</b><span class="unreadCountSlot" data-unread-account="${state.account}" data-unread-folder="INBOX">${unreadBadge(unreadCount(state.account,'INBOX'))}</span></button>
   </div>
   ${kids.length&&expanded?`<div class="folderChildren">${kids.map(n=>folderNodeHtml(n,1)).join('')}</div>`:''}
 </div>`
}

function accountTreeHtml(){
 const account=state.boot.accounts.find(a=>a.id===state.account);if(!account)return'';
 const visible=navFolderTree();
 const sent=folderName('sent'),drafts=folderName('drafts'),archive=folderName('archive'),junk=folderName('junk'),trash=folderName('trash');
 const specialNames=new Set([sent,drafts,archive,junk,trash].filter(Boolean).map(x=>x.toLowerCase()));
 const roots=visible.filter(f=>!f.parent&&f.name.toLowerCase()!=='inbox'&&!specialNames.has(f.name.toLowerCase()));
 const optional=[
   [archive,'archive','Arquivo'],
   [junk,'spam','Spam'],
   [trash,'trash','Lixeira']
 ].filter(([folder])=>folder&&!isHidden(state.hiddenFolders,state.account,folder));
 const optionalActive=optional.some(([folder])=>state.folder===folder);
 return `<div class="accountFolderTree">${inboxTreeHtml()}
 <button class="navItem small ${state.folder===sent?'active':''}" data-folder="${esc(sent)}" data-folder-context="${esc(sent)}"><span>${icon('sent','Enviados')}</span><b>Enviados</b><span class="unreadCountSlot" data-unread-account="${state.account}" data-unread-folder="${esc(sent)}">${unreadBadge(unreadCount(state.account,sent))}</span></button>
 <button class="navItem small ${state.folder===drafts?'active':''}" data-folder="${esc(drafts)}" data-folder-context="${esc(drafts)}"><span>${icon('draft','Rascunhos')}</span><b>Rascunhos${currentLocalDraftCount()?` · ${currentLocalDraftCount()} ${currentLocalDraftCount()===1?'local':'locais'}`:''}</b><span class="unreadCountSlot" data-unread-account="${state.account}" data-unread-folder="${esc(drafts)}">${unreadBadge(unreadCount(state.account,drafts))}</span></button>
 ${(optional.length||roots.length)?`<details class="moreFolders" ${roots.some(r=>state.folder===r.name)||optionalActive?'open':''}><summary>Mais pastas</summary><div class="folderChildren">
   ${optional.map(([folder,ico,label])=>`<button class="navItem small ${state.folder===folder?'active':''}" data-folder="${esc(folder)}" data-folder-context="${esc(folder)}"><span>${icon(ico,label)}</span><b>${label}</b><span class="unreadCountSlot" data-unread-account="${state.account}" data-unread-folder="${esc(folder)}">${unreadBadge(unreadCount(state.account,folder))}</span></button>`).join('')}
   ${roots.map(r=>folderNodeHtml(r,1)).join('')}
 </div></details>`:''}</div>`
}
function treeSidebarHtml(){return `<section class="sidebarSection"><button class="navItem ${!state.account&&state.folder==='INBOX'?'active':''}" data-unified-inbox="1" title="Todas as contas"><span>${icon('inbox','Caixa unificada')}</span><b>Caixa unificada</b></button><button class="navItem ${state.folder==='__STARRED'?'active':''}" data-folder="__STARRED"><span>${icon('star','Favoritos')}</span><b>Com estrela</b></button></section><section class="sidebarSection accountsSection"><div class="sectionLabel">CONTAS</div>${state.boot.accounts.map(a=>`<div class="accountTree"><button class="navItem accountNode ${state.account===a.id?'expanded':''}" data-account-tree="${a.id}" title="${accountLabel(a)}"><span>${state.account===a.id?'▾':'▸'}</span><b>${accountLabel(a)}</b></button>${state.account===a.id?accountTreeHtml():''}</div>`).join('')}</section>`}
function unifiedSidebarHtml(){const ids=[...state.unifiedAccounts].filter(id=>state.boot.accounts.some(a=>a.id===id));return `<section class="sidebarSection"><div class="sectionLabel">CAIXA UNIFICADA</div>${[['INBOX','Caixa de entrada','inbox'],['__STARRED','Com estrela','star'],['__SENT','Enviados','sent'],['__DRAFTS',currentLocalDraftCount()?`Rascunhos · ${currentLocalDraftCount()} ${currentLocalDraftCount()===1?'local':'locais'}`:'Rascunhos','draft']].map(([f,n,i])=>`<button class="navItem ${state.account===null&&state.folder===f?'active':''}" data-unified-folder="${esc(f)}" title="${esc(n)}"><span>${icon(i,n)}</span><b>${esc(n)}</b>${f==='INBOX'?`<span class="unreadCountSlot" data-unread-unified="INBOX">${unreadBadge(unreadCountForAccounts(ids,'INBOX'))}</span>`:''}</button>`).join('')}</section><section class="sidebarSection unifiedAccounts"><div class="sectionLabel">CONTAS FILTRADAS · ${ids.length}</div>${state.boot.accounts.map(a=>`<label class="accountFilter"><input type="checkbox" data-unified-account="${a.id}" ${state.unifiedAccounts.has(a.id)?'checked':''}><span>${accountLabel(a)}</span></label>`).join('')}</section><section class="sidebarSection"><div class="sectionLabel">CONTAS</div>${state.boot.accounts.map(a=>`<button class="navItem ${state.account===a.id?'active':''}" data-account-tree="${a.id}"><span>${state.account===a.id?'•':'▸'}</span><b>${accountLabel(a)}</b></button>`).join('')}</section>`}
function groupsSidebarHtml(){
 const groups=state.navigationGroups;
 const assigned=new Set(groups.flatMap(g=>g.accountIds));
 const ungrouped=state.boot.accounts.filter(a=>!assigned.has(Number(a.id)));
 const rendered=groups.length?groups.map(g=>`<div class="accountGroup"><button class="navItem groupInbox ${state.activeGroupId===g.id&&state.folder==='INBOX'?'active':''}" data-group-inbox="${esc(g.id)}"><span>▦</span><b>${esc(g.name)}</b><small>${g.accountIds.length}</small></button><div class="groupAccounts">${g.accountIds.map(id=>state.boot.accounts.find(a=>a.id===id)).filter(Boolean).map(a=>`<button class="navItem small" data-account-tree="${a.id}"><span>•</span><b>${accountLabel(a)}</b></button>`).join('')}</div></div>`).join(''):`<button class="navItem" data-group-all="1"><span>▦</span><b>Todas as contas</b></button>`;
 return `<section class="sidebarSection"><div class="sectionLabel sectionWithAction">GRUPOS <button id="manageGroups" class="mini" title="Gerenciar grupos">Editar</button></div>${rendered}${ungrouped.length?`<div class="sectionLabel">SEM GRUPO</div>${ungrouped.map(a=>`<button class="navItem small" data-account-tree="${a.id}"><span>•</span><b>${accountLabel(a)}</b></button>`).join('')}`:''}</section>`
}
function favoritesSidebarHtml(){
 const favs=state.folderFavorites.map(f=>({...f,account:state.boot.accounts.find(a=>a.id===f.accountId)})).filter(x=>x.account);
 return `<section class="sidebarSection"><div class="sectionLabel sectionWithAction">FAVORITOS <button id="organizeFolders" class="mini">Organizar</button></div>${favs.length?favs.map(f=>`<button class="navItem ${state.account===f.accountId&&state.folder===f.folder?'active':''}" data-favorite-account="${f.accountId}" data-favorite-folder="${esc(f.folder)}"><span>★</span><b>${esc(f.label||f.folder)}</b><span class="unreadCountSlot" data-unread-account="${f.accountId}" data-unread-folder="${esc(f.folder)}">${unreadBadge(unreadCount(f.accountId,f.folder))}</span><small>${accountLabel(f.account)}</small></button>`).join(''):'<p class="sidebarHint">Clique com o botão direito numa pasta para adicioná-la.</p>'}</section><section class="sidebarSection"><div class="sectionLabel">CONTAS E PASTAS</div>${state.boot.accounts.map(a=>`<div class="accountTree"><button class="navItem accountNode ${state.account===a.id?'expanded':''}" data-account-tree="${a.id}"><span>${state.account===a.id?'▾':'▸'}</span><b>${accountLabel(a)}</b></button>${state.account===a.id?accountTreeHtml():''}</div>`).join('')}</section>`
}
function columnsSidebarHtml(){
 return `<section class="columnsFolderPane"><div class="columnsComposeSlot"><button class="primary composeBtn columnsComposeBtn" id="newMail" title="${shortcutTooltip('newMessage',state.boot.settings)}"><span>${icon('compose','Nova mensagem')}</span><b>Nova mensagem</b></button></div><div class="columnsFolderHead"><span>Pastas</span><div class="columnsFolderHeadActions"><button id="collapseColumnsFolders" class="columnsFolderCollapse" title="Recolher coluna de pastas" aria-label="Recolher coluna de pastas">${icon('chevronLeft','Recolher coluna de pastas')}</button><button id="organizeFolders" class="columnsFolderMenu" title="Organizar pastas" aria-label="Organizar pastas">${icon('more','Organizar pastas')}</button></div></div><section class="navFolderColumn">${state.account?accountTreeHtml():`<button class="navItem ${state.folder==='INBOX'?'active':''}" data-unified-folder="INBOX" title="Caixa de entrada"><span>${icon('inbox','Caixa de entrada')}</span><b>Caixa de entrada</b></button><button class="navItem ${state.folder==='__STARRED'?'active':''}" data-unified-folder="__STARRED" title="Com estrela"><span>${icon('star','Com estrela')}</span><b>Com estrela</b></button><button class="navItem ${state.folder==='__SENT'?'active':''}" data-unified-folder="__SENT" title="Enviados"><span>${icon('sent','Enviados')}</span><b>Enviados</b></button><button class="navItem ${state.folder==='__DRAFTS'?'active':''}" data-unified-folder="__DRAFTS" title="Rascunhos"><span>${icon('draft','Rascunhos')}</span><b>Rascunhos</b></button>`}</section></section>`
}
function columnRailAccountGlyph(account){
 const source=String(account?.name||account?.email||'@').trim();const first=(source.match(/[\p{L}\p{N}]/u)||['@'])[0].toLocaleUpperCase();
 return `<span class="columnRailAvatar" aria-hidden="true">${esc(first)}</span>`
}
function columnsRailHtml(){
 return `<div class="columnsRail" aria-label="Navegação principal"><div class="columnsRailBrand" title="TCS Mail"><img src="assets/tcs-mail-logo.png" alt="TCS Mail"></div><button id="columnsFolderToggle" class="columnsRailFolderToggle ${state.columnsFolderCollapsed?'':'active'}" title="${state.columnsFolderCollapsed?'Expandir':'Recolher'} coluna de pastas" aria-label="${state.columnsFolderCollapsed?'Expandir':'Recolher'} coluna de pastas"><span>${icon('folders','Pastas')}</span></button><div class="columnsRailAccounts" aria-label="Contas"><button class="columnRailButton ${state.account===null?'active':''}" data-unified-inbox="1" title="Todas as contas" aria-label="Todas as contas"><span>${icon('inbox','Todas as contas')}</span></button>${state.boot.accounts.map(a=>`<button class="columnRailButton ${state.account===a.id?'active':''}" data-account-tree="${a.id}" title="${accountLabel(a)}" aria-label="${accountLabel(a)}">${columnRailAccountGlyph(a)}</button>`).join('')}</div><button class="columnRailButton" id="newMail" title="Nova mensagem" aria-label="Nova mensagem"><span>${icon('compose','Nova mensagem')}</span></button><div class="columnsRailGrow"></div><nav class="columnsRailNav" aria-label="Aplicativos"><button class="columnRailButton ${['calendar','tasks'].includes(state.view)?'active':''}" data-view="calendar" title="Calendário" aria-label="Calendário"><span>${icon('calendar','Calendário')}</span></button><button class="columnRailButton ${state.view==='contacts'?'active':''}" data-view="contacts" title="Contatos" aria-label="Contatos"><span>${icon('contacts','Contatos')}</span></button><button class="columnRailButton ${state.view==='followups'?'active':''}" data-view="followups" title="Follow-ups" aria-label="Follow-ups"><span>${icon('follow','Follow-ups')}</span></button><button class="columnRailButton ${state.view==='outbound'?'active':''}" data-view="outbound" title="Envios" aria-label="Envios"><span>${icon('outbox','Envios')}</span></button></nav><button class="columnRailButton" id="settingsBtn" title="${shortcutTooltip('settings',state.boot.settings)}" aria-label="Configurações"><span>${icon('settings','Configurações')}</span></button></div>`
}
function tabsSidebarHtml(){
 const tab=state.navigationTab;
 const accounts=`<section class="sidebarSection"><div class="sectionLabel">CONTAS</div><button class="navItem ${state.account===null?'active':''}" data-unified-inbox="1"><span>▦</span><b>Todas as contas</b></button>${state.boot.accounts.map(a=>`<button class="navItem ${state.account===a.id?'active':''}" data-account-tree="${a.id}"><span>•</span><b>${accountLabel(a)}</b></button>`).join('')}</section>`;
 const folders=`<section class="sidebarSection"><div class="sectionLabel sectionWithAction">PASTAS <button id="organizeFolders" class="mini">Organizar</button></div>${state.account?accountTreeHtml():'<p class="sidebarHint">Escolha uma conta na aba Contas para navegar pela árvore completa.</p>'}</section>`;
 const views=`<section class="sidebarSection"><div class="sectionLabel">VISÕES</div><button class="navItem" data-smart-view="INBOX"><span>▦</span><b>Caixa de entrada</b></button><button class="navItem" data-smart-search="is:unread"><span>●</span><b>Não lidas</b></button><button class="navItem" data-smart-view="__STARRED"><span>★</span><b>Com estrela</b></button><button class="navItem" data-smart-view="__SENT"><span>↗</span><b>Enviados</b></button><button class="navItem" data-smart-view="__DRAFTS"><span>✎</span><b>Rascunhos</b></button></section>`;
 return `<div class="navTabs"><button data-nav-tab="accounts" class="${tab==='accounts'?'active':''}">Contas</button><button data-nav-tab="folders" class="${tab==='folders'?'active':''}">Pastas</button><button data-nav-tab="views" class="${tab==='views'?'active':''}">Visões</button></div>${tab==='accounts'?accounts:tab==='folders'?folders:views}`
}
function savedSearchesSidebarHtml(){return state.savedSearches?.length?`<section class="sidebarSection savedSearchesNav"><div class="sectionLabel">PESQUISAS SALVAS</div>${state.savedSearches.map(s=>`<button class="navItem small ${state.view==='mail'&&state.search===s.query?'active':''}" data-saved-search="${s.id}" title="${esc(s.query)}"><span>⌕</span><b>${esc(s.name)}</b></button>`).join('')}</section>`:''}
function navigationSidebarHtml(){
 switch(state.navigationMode){
   case'unified':return unifiedSidebarHtml();
   case'groups':return groupsSidebarHtml();
   case'favorites':return favoritesSidebarHtml();
   case'columns':return columnsSidebarHtml();
   case'tabs':return tabsSidebarHtml();
   default:return treeSidebarHtml();
 }
}
function renderShell(){parkReaderComposer();const columns=state.navigationMode==='columns';app.innerHTML=`<div class="appShell ${state.compact&&!columns?'compact':''} navMode-${state.navigationMode} ${columns&&state.columnsFolderCollapsed?'columnsFoldersCollapsed':''}"><aside class="sidebar ${columns?'columnsSidebar':''}">${columns?`${columnsRailHtml()}${columnsSidebarHtml()}${savedSearchesSidebarHtml()}`:`<div class="brand"><img src="assets/tcs-mail-logo.png" alt="TCS Mail"><strong>TCS Mail</strong><button id="compactBtn" class="icon" title="${state.compact?'Expandir':'Recolher'} barra">☰</button></div><button id="compactAccountBtn" class="navItem compactAccountBtn" title="Trocar conta"><span>◎</span><b>Conta</b></button><button class="primary composeBtn" id="newMail" title="${shortcutTooltip('newMessage',state.boot.settings)}"><span>${icon('compose','Nova mensagem')}</span><b>Nova mensagem</b></button>${navigationSidebarHtml()}${savedSearchesSidebarHtml()}<nav class="mainNav"><div class="navSep"></div><button class="navItem ${['calendar','tasks'].includes(state.view)?'active':''}" data-view="calendar"><span>${icon('calendar','Calendário')}</span><b>Calendário</b></button><button class="navItem ${state.view==='contacts'?'active':''}" data-view="contacts"><span>${icon('contacts','Contatos')}</span><b>Contatos</b></button><button class="navItem ${state.view==='followups'?'active':''}" data-view="followups"><span>${icon('follow','Follow-ups')}</span><b>Follow-ups</b></button><button class="navItem ${state.view==='outbound'?'active':''}" data-view="outbound"><span>${icon('outbox','Envios')}</span><b>Envios</b></button></nav><div class="grow"></div><button class="navItem" id="settingsBtn" title="${shortcutTooltip('settings',state.boot.settings)}"><span>${icon('settings','Configurações')}</span><b>Configurações</b></button>`}</aside><div id="contentMain" class="contentMain"></div></div>`;wireShell();ensureSidebarTooltips();updateUnreadCountDom();renderView();restoreReaderComposer()}
function ensureSidebarTooltips(){document.querySelectorAll('.sidebar button,.sidebar summary').forEach(el=>{if(el.title?.trim())return;const label=(el.querySelector('b')?.textContent||el.textContent||'').replace(/\s+/g,' ').trim();if(label)el.title=label})}
function customFoldersHtml(){return''}

function wireShell(){
 $('#compactBtn')?.addEventListener('click',()=>setCompact(!state.compact));const toggleColumnsFolders=()=>{state.columnsFolderCollapsed=!state.columnsFolderCollapsed;localStorage.setItem('tcs.columnsFolderCollapsed',state.columnsFolderCollapsed?'1':'0');renderShell()};$('#collapseColumnsFolders')?.addEventListener('click',toggleColumnsFolders);$('#columnsFolderToggle')?.addEventListener('click',toggleColumnsFolders);
 $('#compactAccountBtn')?.addEventListener('click',()=>{const {root,close}=modal('Escolher conta',`<div class="commandList"><button data-account="">Todas as contas</button>${state.boot.accounts.map(a=>`<button data-account="${a.id}">${accountLabel(a)}</button>`).join('')}</div>`);$$('[data-account]',root).forEach(b=>b.onclick=async()=>{state.activeGroupId=null;state.groupAccountIds.clear();state.account=b.dataset.account?Number(b.dataset.account):null;if(state.account)await refreshFolders();else{state.folders=[];state.folderTree=[];state.roles={}}close();renderShell();if(state.view==='mail')enterFolder('INBOX')})});
 $('#newMail')?.addEventListener('click',()=>openComposer(ctx,{accountId:state.account||activeAccountIds()[0]||state.boot.accounts[0]?.id}));
 if($('#newMail'))$('#newMail').oncontextmenu=e=>{e.preventDefault();openNewMenu()};

 $$('[data-folder]').forEach(b=>b.onclick=()=>enterFolder(b.dataset.folder));
 $$('[data-folder-toggle]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleFolderExpansion(b.dataset.folderToggle)});
 $$('[data-folder-context]').forEach(b=>b.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();openFolderContextMenu(e.clientX,e.clientY,state.account,b.dataset.folderContext)});
 $$('[data-unified-folder]').forEach(b=>b.onclick=()=>{state.account=null;state.activeGroupId=null;state.groupAccountIds.clear();enterFolder(b.dataset.unifiedFolder)});
 $('[data-unified-inbox]')?.addEventListener('click',()=>{state.account=null;state.activeGroupId=null;state.groupAccountIds.clear();enterFolder('INBOX')});
 $$('[data-account-tree]').forEach(b=>b.onclick=async()=>{state.activeGroupId=null;state.groupAccountIds.clear();state.account=Number(b.dataset.accountTree);state.selected.clear();state.focusId=null;state.selectionAnchor=null;await refreshFolders();if(state.navigationMode==='tabs')state.navigationTab='folders';await persistNavigationState('tab');renderShell();if(state.view==='mail')enterFolder('INBOX')});

 $$('[data-unified-account]').forEach(cb=>cb.onchange=async()=>{const id=Number(cb.dataset.unifiedAccount);if(cb.checked)state.unifiedAccounts.add(id);else state.unifiedAccounts.delete(id);if(!state.unifiedAccounts.size){state.unifiedAccounts.add(id);cb.checked=true;return toast('Mantenha ao menos uma conta na Caixa unificada.')}const value=[...state.unifiedAccounts].join(',');localStorage.setItem('tcs.unifiedAccounts',value);await invoke('set_setting',{req:{key:'mail.unified_accounts',value}}).catch(()=>{});if(state.view==='mail')await loadMessages(null,false,{preserveScroll:false,preserveCurrent:false})});

 $$('[data-group-inbox]').forEach(b=>b.onclick=async()=>{const gid=b.dataset.groupInbox;state.activeGroupId=gid;state.groupAccountIds=new Set(groupAccountIds(state.navigationGroups,gid));state.account=null;state.folder='INBOX';state.folders=[];state.folderTree=[];state.roles={};renderShell();if(state.view==='mail')await loadMessages(null,false,{preserveScroll:false,preserveCurrent:false})});
 $('[data-group-all]')?.addEventListener('click',async()=>{state.activeGroupId='__all';state.groupAccountIds=new Set(state.boot.accounts.map(a=>a.id));state.account=null;state.folder='INBOX';renderShell();if(state.view==='mail')await loadMessages()});
 $('#manageGroups')?.addEventListener('click',openNavigationGroupsManager);

 $$('[data-favorite-folder]').forEach(b=>b.onclick=async()=>{const accountId=Number(b.dataset.favoriteAccount),folder=b.dataset.favoriteFolder;state.activeGroupId=null;state.groupAccountIds.clear();state.account=accountId;await refreshFolders();renderShell();await enterFolder(folder)});
 $('#organizeFolders')?.addEventListener('click',openFolderOrganizer);

 $$('[data-nav-tab]').forEach(b=>b.onclick=async()=>{state.navigationTab=b.dataset.navTab;await persistNavigationState('tab');renderShell()});
 $$('[data-smart-view]').forEach(b=>b.onclick=()=>{state.account=null;state.activeGroupId=null;state.groupAccountIds.clear();state.search='';enterFolder(b.dataset.smartView)});
 $$('[data-smart-search]').forEach(b=>b.onclick=async()=>{state.account=null;state.activeGroupId=null;state.groupAccountIds.clear();state.search=b.dataset.smartSearch;state.folder='INBOX';renderShell();await loadMessages(null,false,{preserveScroll:false,preserveCurrent:false})});
 $$('[data-saved-search]').forEach(b=>b.onclick=async()=>{const item=state.savedSearches.find(x=>Number(x.id)===Number(b.dataset.savedSearch));if(!item)return;state.view='mail';state.search=item.query;state.folder='INBOX';renderShell();await loadMessages(null,false,{preserveScroll:false,preserveCurrent:false})});

 const navSplit=$('#navColSplitter');if(navSplit){navSplit.onpointerdown=e=>{e.preventDefault();navSplit.setPointerCapture?.(e.pointerId);const host=navSplit.closest('.navColumns');const start=e.clientX,startW=state.navAccountWidth;const move=ev=>{state.navAccountWidth=Math.max(110,Math.min(240,startW+ev.clientX-start));host?.style.setProperty('--nav-account-w',`${state.navAccountWidth}px`)};const up=async ev=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);state.boot.settings.navAccountWidth=String(Math.round(state.navAccountWidth));await invoke('set_setting',{req:{key:'appearance.nav_account_column_width',value:state.boot.settings.navAccountWidth}}).catch(()=>{})};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)};}
 $$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;renderShell()});
 $('#settingsBtn')?.addEventListener('click',()=>openSettings(ctx))
}
function refreshShortcutTooltips(){
 const map=[['#newMail','newMessage'],['#settingsBtn','settings'],['[data-folder="INBOX"]','inbox'],['[data-view="outbound"]','outbox'],['[data-view="contacts"]','contacts']];
 for(const [sel,action] of map){const el=$(sel);if(el)el.title=shortcutTooltip(action,state.boot.settings)}
 if(state.view==='mail'&&state.current)renderReader(state.current);
}
function openNewMenu(){const {root,close}=modal('Criar novo',`<div class="commandList"><button data-new="mail">Nova mensagem</button><button data-new="task">Nova tarefa</button><button data-new="event">Novo evento</button><button data-new="meeting">Agendar reunião</button></div>`);$$('[data-new]',root).forEach(b=>b.onclick=()=>{const kind=b.dataset.new;close();if(kind==='mail')openComposer(ctx,{accountId:state.account||state.boot.accounts[0]?.id});else if(kind==='task'){state.view='tasks';renderShell();setTimeout(()=>document.querySelector('#newTask')?.click(),0)}else{state.view='calendar';renderShell();setTimeout(()=>document.querySelector(kind==='meeting'?'#meeting':'#newEvent')?.click(),0)}})}
function renderView(){const host=$('#contentMain');if(!host)return;if(state.view==='mail')renderMailView();else if(state.view==='calendar')renderCalendar(ctx);else if(state.view==='tasks')renderTasks(ctx);else if(state.view==='contacts')renderContacts(ctx);else if(state.view==='followups')renderFollowUps(ctx);else if(state.view==='outbound')renderOutbound(ctx)}

function renderMailView(){
 parkReaderComposer();
 const trash=folderName('trash');
 $('#contentMain').innerHTML=`<div class="mailWorkspace" style="--mail-list-w:${state.listWidth}px"><main class="mailList"><header class="mailToolbar"><div class="searchWrap" data-fullvalue="${esc(state.search)}"><input id="search" aria-label="Pesquisar mensagens" title="${shortcutTooltip('search',state.boot.settings)}" placeholder="Pesquisar mensagens" value="${esc(state.search)}"><button id="savedSearchBtn" class="icon" title="${shortcutTooltip('savedSearches',state.boot.settings)}">${icon("search","Pesquisas salvas")}</button></div><div class="mailFilter segmented" role="group" aria-label="Filtrar leitura"><button data-read-filter="all" class="${state.readFilter==='all'?'active':''}" title="Todas as mensagens" aria-label="Todas as mensagens">${icon("filterAll","Todas")}<span class="readingLabel">Todas</span></button><button data-read-filter="unread" class="${state.readFilter==='unread'?'active':''}" title="Não lidas" aria-label="Não lidas">${icon("filterUnread","Não lidas")}<span class="readingLabel">Não lidas</span></button><button data-read-filter="read" class="${state.readFilter==='read'?'active':''}" title="Lidas" aria-label="Lidas">${icon("filterRead","Lidas")}<span class="readingLabel">Lidas</span></button></div><div class="mailQuickFilter segmented" role="group" aria-label="Filtro rápido"><button data-quick-filter="all" class="${state.quickFilter==='all'?'active':''}" title="Sem filtro adicional" aria-label="Sem filtro adicional">${icon("filterAll","Sem filtro adicional")}</button><button data-quick-filter="starred" class="${state.quickFilter==='starred'?'active':''}" title="Somente favoritos" aria-label="Somente favoritos">${icon("star","Favoritos")}</button><button data-quick-filter="attachment" class="${state.quickFilter==='attachment'?'active':''}" title="Somente com anexos" aria-label="Somente com anexos">${icon("paperclip","Anexos")}</button><button data-quick-filter="priority" class="${state.quickFilter==='priority'?'active':''}" title="Somente prioridade" aria-label="Somente prioridade">${icon("pin","Prioridade")}</button><button data-quick-filter="spam" class="${state.quickFilter==='spam'?'active':''}" title="Somente spam" aria-label="Somente spam">${icon("spam","Spam")}</button></div><div class="h01Order" role="group" aria-label="Ordenação e conversações"><label class="h01SortLabel" title="Classificar mensagens">${icon("sort","Classificar")}</label><select id="h01Sort" aria-label="Classificar mensagens" title="Classificar mensagens"><option value="date" ${state.sortBy==='date'?'selected':''}>Data</option><option value="sender" ${state.sortBy==='sender'?'selected':''}>De</option><option value="recipient" ${state.sortBy==='recipient'?'selected':''}>Para</option><option value="subject" ${state.sortBy==='subject'?'selected':''}>Assunto</option><option value="size" ${state.sortBy==='size'?'selected':''}>Tamanho</option></select><button id="h01Dir" class="icon" title="Inverter ordem crescente ou decrescente" aria-label="Inverter ordem crescente ou decrescente">${icon(state.sortDir==='asc'?'up':'down',"Ordem")}</button><button id="h01Threads" class="icon ${state.threaded?'active':''}" title="Agrupar mensagens carregadas por conversação" aria-label="Agrupar por conversação" aria-pressed="${state.threaded}">${icon("threads","Conversações")}</button></div><div class="mailGlobalActions"><button id="sync" class="toolbarAction" title="${shortcutTooltip('sync',state.boot.settings)}">${icon("sync","Sincronizar")}<span>Sincronizar</span></button><button id="folderMenu" class="toolbarAction" title="Gerenciar pastas">${icon("folder","Pastas")}<span>Pastas</span></button><button id="mailOverflow" class="toolbarAction icon" title="Mais opções">${icon("more","Mais opções")}</button>${state.folder===trash?`<button id="emptyTrash" title="Esvaziar lixeira">${icon('trash','Esvaziar lixeira')}<span>Esvaziar</span></button>`:''}</div></header><div id="mailStatusLine"><span id="status"></span><span id="batchCount" aria-live="polite"></span></div><div id="rowsViewport" class="rowsViewport" tabindex="0" role="listbox" aria-multiselectable="true"><div id="rowsSpacer"></div><div id="rows"></div></div></main><div id="mailSplitter" class="mailSplitter" role="separator" aria-orientation="vertical" tabindex="0"></div><section class="reader"><div id="readerEmpty"><div class="readerEmptyInner"><b>Selecione uma mensagem</b><span>O conteúdo será exibido aqui com segurança.</span></div></div><div id="reader"></div></section></div>`;
 wireMail();if(state.items.length)renderVirtualRows();if(state.current)renderReader(state.current);restoreReaderComposer()
}
function wireMail(){
 const search=$('#search'),searchWrap=search?.closest('.searchWrap');if(search&&searchWrap){const updateSearchHint=()=>searchWrap.dataset.fullvalue=search.value;search.addEventListener('input',updateSearchHint);search.addEventListener('focus',updateSearchHint);updateSearchHint()}$('#search').oninput=debounce(e=>{state.search=e.target.value;loadMessages(null,false,{preserveScroll:false,preserveCurrent:true})},250);
 $('#sync').onclick=sync;
 $('#rowsViewport').onscroll=()=>{renderVirtualRows();maybeLoadMore()};
 $('#rowsViewport').addEventListener('keydown',onListKey);$('#rowsViewport').oncontextmenu=e=>{if(!e.target.closest('.row'))e.preventDefault()};
 $('#savedSearchBtn').onclick=openSavedSearches;$('#folderMenu').onclick=openFolderManager;$$('[data-read-filter]').forEach(b=>b.onclick=()=>{state.readFilter=b.dataset.readFilter;loadMessages(null,false,{preserveScroll:false,preserveCurrent:true,preserveSelection:true});renderMailView()});$$('[data-quick-filter]').forEach(b=>b.onclick=()=>{state.quickFilter=b.dataset.quickFilter;loadMessages(null,false,{preserveScroll:false,preserveCurrent:true,preserveSelection:true});renderMailView()});$('#mailOverflow').onclick=e=>openMailToolbarMenu(e.currentTarget);
 $('#emptyTrash')?.addEventListener('click',async()=>{const accounts=activeAccountIds();if(!accounts.length)return toast('Nenhuma conta selecionada.');const scope=accounts.length===1?'desta Lixeira':`das Lixeiras de ${accounts.length} contas`;if(await confirmDialog(`Excluir definitivamente todas as mensagens ${scope}?`,{danger:true,confirmLabel:'Excluir definitivamente'})){let n=0,failed=0;for(const accountId of accounts){try{n+=await invoke('empty_trash',{accountId})}catch{failed++}}toast(`${n} mensagem(ns) excluída(s).${failed?` ${failed} conta(s) falharam.`:''}`);state.current=null;state.selected.clear();loadMessages(null,false,{preserveScroll:false,preserveCurrent:false})}});
 $$('[data-batch]').forEach(b=>b.onclick=()=>batchAction(b.dataset.batch));
 const sort=$('#h01Sort');if(sort)sort.onchange=()=>{state.sortBy=sort.value;localStorage.setItem('tcs.h01.sort',sort.value);loadMessages(null,false,{preserveScroll:false})};const dir=$('#h01Dir');if(dir)dir.onclick=()=>{state.sortDir=state.sortDir==='asc'?'desc':'asc';localStorage.setItem('tcs.h01.dir',state.sortDir);loadMessages(null,false,{preserveScroll:false});renderMailView()};const threads=$('#h01Threads');if(threads)threads.onclick=()=>{state.threaded=!state.threaded;localStorage.setItem('tcs.h01.threads',state.threaded?'1':'0');renderMailView()};
 wireMailSplitter()
}
function openMailToolbarMenu(anchor){removeContextMenu();const r=anchor.getBoundingClientRect();const menu=document.createElement('div');menu.className='contextMenu';menu.style.left=`${Math.max(8,r.right-230)}px`;menu.style.top=`${r.bottom+4}px`;menu.innerHTML=`<button data-tm="folders">Gerenciar pastas</button><button data-tm="sync">${esc(shortcutTooltip('sync',state.boot.settings))}</button><button data-tm="advanced">Pesquisa avançada</button>`;document.body.append(menu);$$('[data-tm]',menu).forEach(b=>b.onclick=()=>{const a=b.dataset.tm;removeContextMenu();if(a==='folders')openFolderManager();else if(a==='sync')sync();else{$('#search')?.focus();if($('#search')&&!$('#search').value)$('#search').placeholder='from:cliente subject:"contrato anual" is:unread has:attachment after:2026-01-01'}});setTimeout(()=>document.addEventListener('pointerdown',removeContextMenu,{once:true}),0)}
function clampMailListWidth(value){const workspace=$('.mailWorkspace');const shellWidth=workspace?.clientWidth||Math.max(600,window.innerWidth-(state.compact?72:236));const min=280,readerMin=320,splitter=6;const max=Math.max(min,Math.min(760,shellWidth-readerMin-splitter));return Math.max(min,Math.min(max,Number(value)||390))}
function applyMailListWidth(value){state.listWidth=clampMailListWidth(value);const w=$('.mailWorkspace');if(w)w.style.setProperty('--mail-list-w',`${Math.round(state.listWidth)}px`);return state.listWidth}
function wireMailSplitter(){const split=$('#mailSplitter');if(!split)return;applyMailListWidth(state.listWidth);let startX=0,startW=state.listWidth;const move=e=>{applyMailListWidth(startW+(e.clientX-startX));renderVirtualRows()};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);invoke('set_setting',{req:{key:'appearance.message_list_width',value:String(Math.round(state.listWidth))}}).catch(()=>{})};split.onpointerdown=e=>{startX=e.clientX;startW=state.listWidth;split.setPointerCapture?.(e.pointerId);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)};split.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();applyMailListWidth(state.listWidth+(e.key==='ArrowRight'?20:-20));renderVirtualRows();invoke('set_setting',{req:{key:'appearance.message_list_width',value:String(Math.round(state.listWidth))}}).catch(()=>{})}}
function queryFolder(){if(state.folder==='__STARRED')return {folder:null,starredOnly:true};return {folder:state.folder,starredOnly:false}}
async function loadMessages(cursor=null,append=false,opts={}){
 if(append){if(state.pagingInFlight)return;state.pagingInFlight=true}
 if(state.view!=='mail'){if(append)state.pagingInFlight=false;return}
 const requestSeq=++state.listRequestSeq;
 const vp=$('#rowsViewport');const oldScroll=vp?.scrollTop||0;const currentId=state.current?.id||null;
 status('Carregando…');
 try{
  const q=queryFolder();const filterToken=state.readFilter==='unread'?'is:unread':state.readFilter==='read'?'is:read':'';const quickToken={starred:'is:starred',attachment:'has:attachment',priority:'is:priority',spam:'is:spam'}[state.quickFilter]||'';const effectiveSearch=[state.search,filterToken,quickToken,`tcs-sort:${state.sortBy}:${state.sortDir}`].filter(Boolean).join(' ').trim();const scopedIds=activeAccountIds();if(state.account==null&&!scopedIds.length){if(requestSeq!==state.listRequestSeq)return;state.items=[];state.page={items:[],next_cursor:null,total:0};state.selected.clear();state.current=null;renderVirtualRows(false);status('0 mensagem(ns)');return}const req={accountId:state.account??null,accountIds:state.account?null:scopedIds,folder:q.folder,search:effectiveSearch||null,cursor,limit:100,starredOnly:q.starredOnly};
  const page=await invoke('list_messages',{req});
  if(requestSeq!==state.listRequestSeq||state.view!=='mail')return;
  const draftsView=state.folder===folderName('drafts')||state.folder==='__DRAFTS';
  let pageItems=page.items;
  if(draftsView){
    await refreshLocalDrafts();
    if(requestSeq!==state.listRequestSeq||state.view!=='mail')return;
    const locals=filterLocalDrafts(scopedLocalDrafts(),effectiveSearch);
    const merged=mergeDraftRows(page.items,locals,state.boot.accounts);
    const remoteAfterReconcile=merged.filter(x=>!x.local_draft);
    const dedupedOnPage=Math.max(0,page.items.length-remoteAfterReconcile.length);
    pageItems=append?remoteAfterReconcile:merged;
    if(!append)page.total=Math.max(0,Number(page.total||0)+locals.length-dedupedOnPage);
  }
  if(append)state.items.push(...pageItems);else{state.items=pageItems;if(!opts.preserveSelection)state.selected.clear();if(!opts.preserveCurrent&&currentId&&!state.items.some(x=>x.id===currentId))state.current=null}
  state.page=page;if(state.focusId&&!state.items.some(x=>x.id===state.focusId))state.focusId=null;
  renderVirtualRows(false);if(vp&&opts.preserveScroll!==false)vp.scrollTop=Math.min(oldScroll,Math.max(0,state.items.length*rowHeight()-vp.clientHeight));
  const initialSync = state.folderInitialSyncKey===`${state.account}\u0000${state.folder}`;
  status(initialSync && !page.total ? 'Sincronizando primeira página IMAP…' : `${page.total} mensagem(ns)`);
  refreshUnreadCounts().catch(()=>{});
 }catch(e){if(requestSeq===state.listRequestSeq)showError(e)}finally{if(append)state.pagingInFlight=false}
}
function rowHeight(){return state.density==='compact'?66:state.density==='spacious'?108:88}
function smartCategory(m){return m.smart_category||'Mensagem'}

function draftStatusLabel(m){
 if(!m?.local_draft)return'';
 return m.local_draft_dirty?'Local · sincronização pendente':'Sincronizado';
}
function messageRowHtml(m,h){
 const groupCount=state.threaded?threadCount(m):0;
 const local=!!m.local_draft;
 const isSentRow=!local&&(state.folder==='__SENT'||(state.account===m.account_id&&m.folder===folderName('sent')));
 const senderLabel=(isSentRow||state.sortBy==='recipient')?`Para: ${m.to_text||'(destinatário não informado)'}`:(m.from_name||m.from_email);
 return `<article class="row ${local?'localDraftRow':''} ${m.unread?'unread':''} ${state.selected.has(m.id)?'selected':''} ${state.focusId===m.id?'focused':''} ${state.current?.id===m.id?'current':''}" style="height:${h}px" data-id="${m.id}" role="option" aria-selected="${state.selected.has(m.id)}" tabindex="-1">
 <input class="rowCheck" type="checkbox" data-check="${m.id}" ${state.selected.has(m.id)?'checked':''} aria-label="Selecionar ${local?'rascunho':'mensagem'}">
 <div class="rowText"><div class="rowTop"><span class="sender" title="${esc(senderLabel)}">${esc(local?(state.sortBy==='recipient'?`Para: ${m.to_text||'(destinatário não informado)'}`:'Rascunho'):senderLabel)}</span><time>${fmtDate(m.date_ts)}</time></div>
 <div class="subject" title="${esc(m.subject||'(sem assunto)')}">${m.priority?'<span class="priorityMark">!</span> ':''}${esc(m.subject||'(sem assunto)')}${groupCount>1?` <button type="button" class="h01ThreadCount" data-thread="${esc(threadRoot(m))}" title="Expandir/recolher conversação carregada" aria-label="Expandir ou recolher conversação">${groupCount} ${state.collapsedThreads.has(threadRoot(m))?'▸':'▾'}</button>`:''}${state.folder==='__SMART'?` <span class="smartBadge">${esc(smartCategory(m))}</span>`:''}</div>
 <div class="snippet">${esc(m.snippet||'')}</div></div>
 <div class="rowBadges" aria-hidden="true">${local?`<span class="draftSyncBadge ${m.local_draft_dirty?'pending':'synced'}">${esc(draftStatusLabel(m))}</span>`:`${m.starred?'★':''}${m.pinned?'●':''}${m.has_attachments?`<span class="attachmentBadge" title="Contém anexos">${icon('paperclip','Anexo')}</span>`:''}`}</div></article>`;
}
function threadRoot(m){
  const ids=[...(String(m.references_text||'').match(/<[^<>\s]+>/g)||[])];
  const first=ids[0]||String(m.in_reply_to||'').trim()||String(m.message_id||'').trim();
  return first?`${m.account_id}:${first.toLowerCase()}`:`isolated:${m.id}`;
}
function threadCount(m){const key=threadRoot(m);return state.items.filter(x=>threadRoot(x)===key).length}
function displayedRows(){if(!state.threaded)return state.items;const groups=new Map();for(const item of state.items){const key=threadRoot(item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}return [...groups.entries()].flatMap(([key,group])=>{group.sort((a,b)=>b.date_ts-a.date_ts);return state.collapsedThreads.has(key)?group.slice(0,1):group})}
function renderVirtualRows(reset=false){
 const vp=$('#rowsViewport'),rows=$('#rows'),sp=$('#rowsSpacer');if(!vp||!rows)return;
 const h=rowHeight(),shown=displayedRows();state.rowHeight=h;if(reset)vp.scrollTop=0;sp.style.height=`${shown.length*h}px`;
 const start=Math.max(0,Math.floor(vp.scrollTop/h)-5),count=Math.ceil((vp.clientHeight||600)/h)+10,end=Math.min(shown.length,start+count);
 rows.style.transform=`translateY(${start*h}px)`;
 rows.innerHTML=shown.slice(start,end).map(m=>messageRowHtml(m,h)).join('');
 $$('.row',rows).forEach(r=>{
  const id=Number(r.dataset.id);
  const item=state.items.find(x=>x.id===id);
  r.onmousedown=e=>{if(e.button===0&&!e.target.closest('input,button'))$('#rowsViewport')?.focus({preventScroll:true})};r.onclick=e=>{const toggle=e.target.closest('[data-thread]');if(toggle){e.stopPropagation();const key=toggle.dataset.thread;if(state.collapsedThreads.has(key))state.collapsedThreads.delete(key);else state.collapsedThreads.add(key);renderVirtualRows();return}item?.local_draft?handleLocalDraftClick(e,item):handleRowClick(e,id)};
  r.ondblclick=e=>{e.preventDefault();e.stopPropagation();if(item?.local_draft)return openLocalDraft(item.local_draft_id);return localStorage.getItem('tcs.doubleClickBehavior')==='preview'?openMessage(id):openMessageFocused(id)};
  r.oncontextmenu=e=>{e.preventDefault();if(item?.local_draft){if(!state.selected.has(item.id)){state.selected.clear();state.selected.add(item.id);state.focusId=item.id;renderVirtualRows()}openLocalDraftContextMenu(e.clientX,e.clientY,item);return}if(!state.selected.has(id)){state.selected.clear();state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows()}openMessageContextMenu(e.clientX,e.clientY,id)};
 });
 $$('[data-check]',rows).forEach(c=>c.onclick=e=>{e.stopPropagation();handleSelectionClick(Number(c.dataset.check),e,{checkbox:true})});
 updateBatch()
}
function updateBatch(){const b=$('#batchCount');if(!b)return;b.textContent=state.selected.size?(state.selected.size===1?'1 selecionada':`${state.selected.size} selecionadas`):''}
async function batchAction(action){
 if(!state.selected.size)return;
 const selected=state.items.filter(x=>state.selected.has(x.id));
 const locals=selected.filter(x=>x.local_draft),remote=selected.filter(x=>!x.local_draft);
 if(locals.length && action!=='delete'){
  toast('Esta ação só se aplica a mensagens no servidor. Para rascunhos locais, use Excluir.');
  return;
 }
 if(action==='read'||action==='unread'){
  if(remote.length)await setBulkFlags(remote.map(x=>x.id),{unread:action==='unread'});
  return;
 }
 if(action==='spam'&&state.boot.settings.spamConfirm!==false&&!await confirmDialog(`Marcar ${remote.length} mensagem(ns) como Spam?`))return;
 let actual=action;
 if(action==='delete'){
  const permanent=state.folder===folderName('trash');
  const description=locals.length?`${locals.length} rascunho(s) local(is) e ${remote.length} mensagem(ns)`: `${remote.length} mensagem(ns)`;
  if(!await confirmDialog(permanent?`Excluir definitivamente ${description}? Esta ação não pode ser desfeita.`:`Excluir ${description}? Rascunhos locais serão descartados definitivamente.`,{danger:true}))return;
  actual=permanent?'delete_permanent':'delete';
 }
 for(const item of selected){
  try{
   if(item.local_draft)await invoke('delete_local_draft',{id:item.local_draft_id});
   else await invoke('message_action',{req:{id:item.id,action:actual,target:null}});
  }catch(e){showError(e);break}
 }
 state.selected.clear();await refreshLocalDrafts();await loadMessages();
}

function previewReadDelay(){const policy=String(state.boot?.settings?.previewReadPolicy||'never');return ['1000','3000','5000'].includes(policy)?Number(policy):null}
function cancelPreviewReadTimer(){if(state.readTimer){clearTimeout(state.readTimer);state.readTimer=null}}
function schedulePreviewRead(id,m){cancelPreviewReadTimer();if(!m?.unread)return;const delay=previewReadDelay();if(delay==null)return;state.readTimer=setTimeout(()=>{state.readTimer=null;if(state.current?.id!==id)return;applyUnreadLocally([id],false);invoke('set_flags',{req:{id,unread:false,starred:null,pinned:null,priority:null}}).then(()=>refreshUnreadCounts()).catch(()=>loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true}))},delay)}
async function markOpenedMessageRead(id){const item=state.items.find(x=>Number(x.id)===Number(id));if(item&&!item.unread)return;applyUnreadLocally([id],false);try{await invoke('set_flags',{req:{id,unread:false,starred:null,pinned:null,priority:null}});refreshUnreadCounts().catch(()=>{})}catch(e){await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true});throw e}}
async function openMessage(id){
 switchReaderTab('read');const requestSeq=++state.openRequestSeq;
 const isCurrent=()=>requestSeq===state.openRequestSeq&&state.view==='mail'&&Number(state.focusId)===Number(id);
 try{
  status('Abrindo mensagem…');state.focusId=id;state.current=null;syncReaderTabs();cancelPreviewReadTimer();
  const cached=state.items.find(x=>x.id===id),reader=$('#reader'),empty=$('#readerEmpty');
  if(empty)empty.hidden=true;
  if(reader)reader.innerHTML=`<div class="readerLoading" role="status"><strong>${esc(cached?.subject||'Abrindo mensagem…')}</strong><span>Consultando o conteúdo local…</span></div>`;
  // A local-first query must never be held hostage by IMAP or image permissions.
  let m=await invoke('get_message_cached',{id});if(!isCurrent())return;
  if(!m)throw new Error('Mensagem não encontrada no armazenamento local.');
  const missingBody=!String(m.body_text||'').trim()&&!String(m.body_html||'').trim();
  m.remote_images_allowed=false;m.remote_domain_allowed=false;
  state.current=m;syncReaderTabs();renderVirtualRows();renderReader(m);schedulePreviewRead(id,m);
  status(missingBody?'Conteúdo ainda não baixado; buscando no servidor…':`${state.page?.total||0} mensagem(ns)`);
  // Policies may be slow (disk/settings) and are deliberately not awaited before painting text.
  Promise.all([invoke('remote_images_allowed',{sender:m.from_email||''}).catch(()=>false),invoke('remote_images_domain_allowed',{sender:m.from_email||''}).catch(()=>false)]).then(([sender,domain])=>{
   if(!isCurrent()||Number(state.current?.id)!==Number(id))return;
   const currentDetail=state.current;
   currentDetail.remote_images_allowed=!!sender;currentDetail.remote_domain_allowed=!!domain;
   // Auto-fetch images only after explicit stored authorization; never load remote
   // images while the policy is unresolved.
   if((sender||domain)&&$('#bodyHost')?.dataset.mode!=='text'&&$('#bodyHost')?.dataset.mode!=='manual')showSanitizedHtml(currentDetail,true).catch(console.warn);
  }).catch(console.warn);
  if(missingBody){
   // The legacy get_message performs hydration; keep it off the first-render path.
   invoke('get_message',{id}).then(fresh=>{
    if(!isCurrent()||state.current!==m||!fresh)return;
    fresh.remote_images_allowed=state.current.remote_images_allowed;fresh.remote_domain_allowed=state.current.remote_domain_allowed;
    if(!String(fresh.body_text||'').trim()&&!String(fresh.body_html||'').trim()){
     status('Corpo indisponível · confira a conexão ou tente novamente');
     const host=$('#bodyHost');if(host){const notice=document.createElement('div');notice.className='readerHydrationError';notice.setAttribute('role','status');notice.textContent='O conteúdo ainda não está disponível no servidor ou no cache. ';const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.onclick=()=>openMessage(id);notice.append(retry);host.prepend(notice)}
     return;
    }
    state.current=fresh;renderReader(fresh);status(`${state.page?.total||0} mensagem(ns)`);
   }).catch(error=>{
    if(!isCurrent()||state.current!==m)return;
    status('Conteúdo indisponível offline · use Tentar novamente');
    const host=$('#bodyHost');if(host){const notice=document.createElement('div');notice.className='readerHydrationError';notice.setAttribute('role','status');notice.textContent='Não foi possível baixar o conteúdo: '+String(error);const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar novamente';retry.onclick=()=>openMessage(id);notice.append(retry);host.prepend(notice)}
   });
  }
 }catch(e){if(!isCurrent())return;const reader=$('#reader');if(reader)reader.innerHTML=`<div class="readerError"><strong>Não foi possível abrir a mensagem.</strong><p>${esc(String(e))}</p><button id="readerRetry" class="primary">Tentar novamente</button></div>`;$('#readerRetry')?.addEventListener('click',()=>openMessage(id));showError(e)}
}

function unfoldRawHeaders(raw){
 const head=String(raw||'').split(/\r?\n\r?\n/,1)[0]||'';const out={};let current='';
 for(const line of head.split(/\r?\n/)){
  if(/^[ \t]/.test(line)&&current){out[current][out[current].length-1]+=' '+line.trim();continue}
  const ix=line.indexOf(':');if(ix<=0)continue;current=line.slice(0,ix).trim().toLowerCase();(out[current]??=[]).push(line.slice(ix+1).trim())
 }
 return out
}
function headerFirst(headers,name){return (headers[String(name).toLowerCase()]||[])[0]||''}
function authResultValue(raw,key){const m=String(raw||'').match(new RegExp(`(?:^|[;\\s])${key}=([a-z0-9_-]+)`,`i`));return m?m[1].toLowerCase():'unknown'}
function normalizeSenderEmail(value){return String(value||'').trim().toLowerCase()}
function trustedSenders(){try{return new Set(JSON.parse(state.boot?.settings?.trustedSenders||'[]').map(normalizeSenderEmail).filter(Boolean))}catch{return new Set()}}
async function persistTrustedSenders(set){const value=JSON.stringify([...set].sort());state.boot.settings.trustedSenders=value;await invoke('set_setting',{req:{key:'privacy.trusted_senders',value}})}
function extractUnsubscribeTargets(headers){const raw=(headers['list-unsubscribe']||[]).join(',');const targets=[];for(const m of raw.matchAll(/<([^>]+)>/g)){const u=m[1].trim();if(/^(https?:|mailto:)/i.test(u))targets.push(u)}return targets.length?targets:raw.split(',').map(x=>x.trim()).filter(x=>/^(https?:|mailto:)/i.test(x))}
async function rawHeadersForMessage(m){const raw=await invoke('get_raw_source',{messageId:m.id});return {raw,headers:unfoldRawHeaders(raw)}}
async function openMessageSecurity(m){
 try{
  const {headers}=await rawHeadersForMessage(m);const auth=[...(headers['authentication-results']||[]),...(headers['arc-authentication-results']||[])].join(' ; ');const spf=authResultValue(auth,'spf'),dkim=authResultValue(auth,'dkim'),dmarc=authResultValue(auth,'dmarc');const replyTo=headerFirst(headers,'reply-to');const returnPath=headerFirst(headers,'return-path');const unsubscribe=extractUnsubscribeTargets(headers);const trusted=trustedSenders().has(normalizeSenderEmail(m.from_email));
  const status=(v)=>v==='pass'?'✓ PASS':v==='fail'?'⚠ FAIL':v==='softfail'?'⚠ SOFTFAIL':v==='neutral'?'• NEUTRAL':v==='none'?'— NONE':'? não informado';
  const warnings=[];if(['fail','softfail'].includes(spf))warnings.push('SPF não passou segundo o servidor receptor.');if(dkim==='fail')warnings.push('DKIM falhou segundo o servidor receptor.');if(dmarc==='fail')warnings.push('DMARC falhou segundo o servidor receptor.');if(replyTo&&m.from_email&&!replyTo.toLowerCase().includes(normalizeSenderEmail(m.from_email)))warnings.push('O Reply-To difere do remetente visível; confirme antes de responder.');
  modal('Segurança da mensagem',`<p class="dim">Os resultados abaixo são os cabeçalhos de autenticação registrados pelo servidor que recebeu a mensagem; o TCS não substitui a validação criptográfica do servidor.</p><div class="propertyGrid"><b>SPF</b><span>${esc(status(spf))}</span><b>DKIM</b><span>${esc(status(dkim))}</span><b>DMARC</b><span>${esc(status(dmarc))}</span><b>Remetente</b><span>${esc(m.from_email||'—')}</span><b>Reply-To</b><span>${esc(replyTo||'—')}</span><b>Return-Path</b><span>${esc(returnPath||'—')}</span><b>Remetente confiável</b><span>${trusted?'Sim':'Não'}</span><b>List-Unsubscribe</b><span>${unsubscribe.length?'Disponível':'Não informado'}</span></div>${warnings.length?`<div class="securityWarnings"><strong>Atenção</strong><ul>${warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'<p class="securityOk">Nenhum alerta evidente foi encontrado nesses cabeçalhos.</p>'}`,{wide:true,resizable:true,persistKey:'message-security'})
 }catch(e){showError(e)}
}
async function blockMessageSender(m,{phishing=false}={}){
 const sender=normalizeSenderEmail(m.from_email);if(!sender)return toast('Não foi possível identificar o remetente.');
 const label=phishing?'Denunciar phishing e bloquear este remetente?':'Bloquear este remetente?';if(!await confirmDialog(`${label}\n\nNovas mensagens de ${sender} serão tratadas como spam.`,{danger:phishing,confirmLabel:phishing?'Denunciar e bloquear':'Bloquear'}))return;
 try{await invoke('save_rule',{req:{id:0,name:`${phishing?'Phishing':'Bloquear'} · ${sender}`,enabled:true,field:'from',pattern:sender,action:'spam',action_value:''}});await invoke('message_action',{req:{id:m.id,action:'spam',target:null}});toast(phishing?'Phishing marcado e remetente bloqueado.':'Remetente bloqueado.');loadMessages()}catch(e){showError(e)}
}
async function trustMessageSender(m){const sender=normalizeSenderEmail(m.from_email);if(!sender)return;const set=trustedSenders();set.add(sender);try{await persistTrustedSenders(set);toast(`${sender} foi adicionado aos remetentes confiáveis.`)}catch(e){showError(e)}}
async function unsubscribeMessage(m){try{const {headers}=await rawHeadersForMessage(m),targets=extractUnsubscribeTargets(headers);if(!targets.length)return toast('Esta mensagem não informa um método padrão de cancelamento de inscrição.');const preferred=targets.find(x=>/^https:/i.test(x))||targets[0];if(!await confirmDialog(`Abrir o cancelamento de inscrição informado pelo remetente?\n\n${preferred}`,{confirmLabel:'Abrir'}))return;await invoke('open_external_url',{url:preferred})}catch(e){showError(e)}}
function speakMessage(m){if(!('speechSynthesis'in window))return toast('A leitura em voz alta não está disponível neste sistema.');window.speechSynthesis.cancel();const text=[m.subject,m.from_name||m.from_email,m.body_text].filter(Boolean).join('. ');const u=new SpeechSynthesisUtterance(text);u.lang=getLocale();window.speechSynthesis.speak(u);toast('Leitura em voz alta iniciada.')}
async function translateMessage(m){if(!state.boot.settings.aiEnabled)return toast('Ative a IA em Configurações → IA e RAG para traduzir mensagens.');if(!await ensureAiAuthorization(m))return;const current=getLocale(),target=current==='pt-BR'?'en-US':'pt-BR',label=target==='pt-BR'?'Português (Brasil)':'English (United States)';if(!await confirmDialog(`Traduzir esta mensagem para ${label}?\n\nA tradução usa o provider/modelo de IA configurado e respeita a autorização de privacidade da mensagem.`,{confirmLabel:'Traduzir'}))return;try{const r=await invoke('ai_translate_message',{id:m.id,targetLanguage:target});modal(`Tradução · ${label}`,`<div class="translatedMessage"><p class="dim">Tradução gerada pelo modelo configurado. Revise antes de reutilizar o conteúdo.</p><pre class="body">${esc(r?.translated_text||'')}</pre></div>`,{wide:true,resizable:true,persistKey:'message-translation'})}catch(e){showError(friendlyAiError(e))}}
async function previewAttachment(m,index){try{const p=await invoke('preview_received_attachment',{messageId:m.id,index});if(p?.kind==='image'){modal(`Visualizar anexo · ${p.filename||''}`,`<div class="attachmentPreview imagePreview"><img src="${esc(p.data||'')}" alt="${esc(p.filename||'Anexo')}"></div>`,{wide:true,resizable:true,persistKey:'attachment-preview'});return}if(p?.kind==='text'){modal(`Visualizar anexo · ${p.filename||''}`,`<div class="attachmentPreview textPreview"><pre>${esc(p.text||'')}</pre></div>`,{wide:true,resizable:true,persistKey:'attachment-preview'});return}toast('Pré-visualização não disponível para este anexo.')}catch(e){showError(e)}}

function renderReader(m){const el=$('#reader');if(!el)return;const pane=el.closest('.reader');if(pane)pane.scrollTop=0;$('#readerEmpty').hidden=true;if(!m){el.innerHTML='<div class="readerEmptyInner"><b>Mensagem indisponível</b><span>Ela pode ter sido removida ou movida.</span></div>';return}const hasHtml=!!m.body_html?.trim(),trash=folderName('trash'),junk=folderName('junk'),inTrash=m.folder===trash,inJunk=m.folder===junk;el.innerHTML=`<header class="readerHead"><h1>${esc(m.subject||'(sem assunto)')}</h1><div class="readerIdentity"><div class="senderAvatar">${esc((m.from_name||m.from_email||'?').trim().charAt(0).toUpperCase())}</div><div class="readerMeta"><div><strong>${esc(m.from_name||m.from_email)}</strong> <span>&lt;${esc(m.from_email)}&gt;</span></div><div class="readerMetaLine">${fmtDate(m.date_ts)} · Para ${esc(m.to_text)}${m.cc_text?` · Cc ${esc(m.cc_text)}`:''}</div></div></div><div class="readerActions"><div class="readerPrimary"><button id="reply" class="readerActionIcon primaryAction" title="${shortcutTooltip('reply',state.boot.settings)}" aria-label="Responder">${icon('reply','Responder')}</button><button id="replyAll" class="readerActionIcon" title="${shortcutTooltip('replyAll',state.boot.settings)}" aria-label="Responder a todos">${icon('replyAll','Responder a todos')}</button><button id="forward" class="readerActionIcon" title="${shortcutTooltip('forward',state.boot.settings)}" aria-label="Encaminhar">${icon('forward','Encaminhar')}</button><button id="archiveQuick" class="readerActionIcon" title="Arquivar" aria-label="Arquivar">${icon('archive','Arquivar')}</button><button id="moveQuick" class="readerActionIcon" title="Mover para outra pasta" aria-label="Mover">${icon('move','Mover')}</button><button id="findInMessage" class="readerActionIcon" title="Localizar nesta mensagem" aria-label="Localizar">${icon('find','Localizar')}</button><button id="deleteQuick" class="readerActionIcon dangerAction" title="Excluir mensagem" aria-label="Excluir">${icon('delete','Excluir')}</button><button id="aiAssist" class="readerActionIcon aiAssistBtn" title="Assistência por IA" aria-label="Assistência por IA">${icon('smart','Assistência por IA')}</button></div><div class="readerSecondary">${hasHtml?`<div class="readerModeInline" role="group" aria-label="Modo de visualização"><button id="showText" class="readerActionIcon" title="Exibir somente texto" aria-label="Texto">${icon('text','Texto')}</button><button id="showHtml" class="readerActionIcon" title="Exibir HTML seguro, sem imagens remotas" aria-label="HTML seguro">${icon('html','HTML seguro')}</button><button id="showHtmlRemote" class="readerActionIcon" title="Exibir HTML com imagens remotas" aria-label="HTML com imagens">${icon('images','HTML com imagens')}</button></div>`:''}<div class="readerNav"><button id="readerPopout" class="readerActionIcon" title="Abrir em nova janela" aria-label="Abrir em nova janela">${icon('popout','Abrir em nova janela')}</button></div><button id="star" class="readerActionIcon ${m.starred?'active':''}" title="${m.starred?'Remover dos favoritos':'Favoritar'}" aria-label="${m.starred?'Remover dos favoritos':'Favoritar'}">${icon(m.starred?'starFilled':'star',m.starred?'Remover dos favoritos':'Favoritar')}</button><button id="readerMore" class="readerActionIcon" title="Mais ações" aria-label="Mais ações">${icon("more","Mais ações")}</button></div></div><div id="readerMoreMenu" class="readerMoreMenu hidden"><button id="forwardEml" title="${shortcutTooltip('forwardAttachment',state.boot.settings)}">Encaminhar como .eml</button><button id="rawSource">Ver fonte</button><button id="thread">Ver conversa</button>${inTrash?'<button id="restore">Restaurar</button>':'<button id="archive">Arquivar</button><button id="doneMessage">Concluir</button>'}<button id="move" title="${shortcutTooltip('move',state.boot.settings)}">Mover…</button>${inJunk?`<button id="notSpam" title="${shortcutTooltip('notSpam',state.boot.settings)}">Não é spam</button>`:'<button id="spam">Marcar como spam</button>'}<button id="unread" title="${shortcutTooltip(m.unread?'markRead':'markUnread',state.boot.settings)}">${m.unread?'Marcar como lida':'Marcar como não lida'}</button><button id="followMessage" title="${shortcutTooltip('followUp',state.boot.settings)}">Acompanhamento…</button><button id="snooze">Adiar…</button><button id="aside">Separar</button><button id="taskFrom">Criar tarefa</button><button id="eventFrom">Criar evento</button><button id="pin">${m.pinned?'Desafixar':'Fixar'}</button><button id="priority">${m.priority?'Prioridade normal':'Marcar prioridade'}</button><button id="messageSecurity">Segurança da mensagem…</button><button id="trustSender">Confiar neste remetente</button><button id="blockSender">Bloquear remetente</button><button id="reportPhishing">Denunciar phishing</button><button id="unsubscribeMessage">Cancelar inscrição…</button><button id="readAloud">Ler em voz alta</button><button id="translateMessage">Traduzir mensagem…</button><button id="printMsg" title="${shortcutTooltip('print',state.boot.settings)}">Imprimir</button><button id="exportEml">Exportar .eml</button><button id="trash" class="dangerAction">${inTrash?'Excluir definitivamente':'Excluir'}</button></div>${hasHtml&&(!m.remote_images_allowed||!m.remote_domain_allowed)?`<div class="readerMode">${m.remote_images_allowed?'':'<button id="alwaysRemote">Sempre carregar imagens deste remetente</button>'}${m.remote_domain_allowed?'':'<button id="alwaysRemoteDomain">Sempre carregar imagens deste domínio</button>'}</div>`:''}</header><div id="bodyHost"><pre class="body">${esc(m.body_text||'(corpo ainda não disponível)')}</pre></div>${m.calendar_ics?.trim()?'<div class="inviteBar"><strong>Convite de calendário</strong><button data-rsvp="ACCEPTED">Aceitar</button><button data-rsvp="TENTATIVE">Talvez</button><button data-rsvp="DECLINED">Recusar</button></div>':''}${m.attachments?.length?`<div class="attachments"><strong>Anexos:</strong><button id="saveAllAttachments" class="readerActionIcon" title="Salvar todos os anexos" aria-label="Salvar todos os anexos">${icon('download','Salvar todos')}</button>${m.attachments.map(a=>`<span class="attachmentActions ${isRiskyAttachment(a.filename)?'risky':''}"><span>${esc(a.filename)} · ${formatBytes(a.size_hint||0)}</span><button data-preview-ai="${a.index}" title="Visualizar anexo" aria-label="Visualizar anexo">${icon('find','Visualizar')}</button><button data-open-ai="${a.index}" title="Abrir anexo" aria-label="Abrir anexo">${icon('popout','Abrir')}</button><button data-save-ai="${a.index}" title="Salvar anexo" aria-label="Salvar anexo">${icon('download','Salvar')}</button></span>`).join('')}</div>`:''}`;$('#reply').onclick=()=>reply(m,false);$('#replyAll').onclick=()=>reply(m,true);$('#readerPopout')?.addEventListener('click',()=>openMessageFocused(m.id));$('#archiveQuick').onclick=()=>invoke('message_action',{req:{id:m.id,action:'archive',target:null}}).then(()=>loadMessages());$('#moveQuick').onclick=()=>moveDialog(m);$('#deleteQuick').onclick=()=>bulkDirect([m.id],inTrash?'delete_permanent':'delete');$('#findInMessage').onclick=()=>findInCurrentMessage(m);$('#forward').onclick=()=>openResponseComposer(forwardSeed(m));$('#forwardEml').onclick=()=>openComposer(ctx,{accountId:m.account_id,subject:/^(fwd?|enc):/i.test(m.subject)?m.subject:`Fwd: ${m.subject}`,attachMessageId:m.id});$('#rawSource').onclick=async()=>{try{const raw=await invoke('get_raw_source',{messageId:m.id});const v=modal('Fonte da mensagem',`<textarea class="rawSource" readonly>${esc(raw)}</textarea>`,{wide:true});v.box.classList.add('sourceModal')}catch(e){showError(e)}};$('#thread').onclick=()=>openThread(m);$('#archive')?.addEventListener('click',()=>act(m.id,'archive'));$('#doneMessage')?.addEventListener('click',()=>act(m.id,'done'));$('#restore')?.addEventListener('click',()=>act(m.id,'restore'));$('#move').onclick=()=>moveDialog(m);$('#spam')?.addEventListener('click',async()=>{if(state.boot.settings.spamConfirm!==false&&!await confirmDialog('Marcar esta mensagem como Spam?'))return;act(m.id,'spam')});$('#notSpam')?.addEventListener('click',()=>act(m.id,'restore'));$('#unread').onclick=async()=>{await invoke('set_flags',{req:{id:m.id,unread:!m.unread,starred:null,pinned:null,priority:null}});m.unread=!m.unread;renderReader(m);loadMessages(null,false,{preserveCurrent:true,preserveSelection:true})};$('#followMessage').onclick=()=>followUpDialog(m,false);$('#snooze').onclick=()=>snoozeDialog(m);$('#aside').onclick=async()=>{await invoke('set_aside',{req:{id:m.id,on:true}});toast('Mensagem separada.');loadMessages()};$('#taskFrom').onclick=()=>taskFromMessage(m);$('#eventFrom').onclick=()=>eventFromMessage(m);$('#star').onclick=()=>toggleFlag(m,'starred');$('#readerMore').onclick=e=>{e.stopPropagation();$('#readerMoreMenu').classList.toggle('hidden')};$('#aiAssist')?.addEventListener('click',()=>openAiAssist(m));/* AI is never invoked merely by opening a message. */$('#pin').onclick=()=>toggleFlag(m,'pinned');$('#priority').onclick=()=>toggleFlag(m,'priority');$('#messageSecurity').onclick=()=>openMessageSecurity(m);$('#trustSender').onclick=()=>trustMessageSender(m);$('#blockSender').onclick=()=>blockMessageSender(m);$('#reportPhishing').onclick=()=>blockMessageSender(m,{phishing:true});$('#unsubscribeMessage').onclick=()=>unsubscribeMessage(m);$('#readAloud').onclick=()=>speakMessage(m);$('#translateMessage').onclick=()=>translateMessage(m);$('#printMsg').onclick=()=>printWithTarget('message');$('#exportEml').onclick=async()=>{try{await invoke('export_message_eml',{id:m.id});toast('Mensagem exportada.')}catch(e){showError(e)}};$('#trash').onclick=()=>deleteOne(m);$('#showText')?.addEventListener('click',()=>{const body=$('#bodyHost');body.dataset.htmlRequest=String((Number(body.dataset.htmlRequest)||0)+1);body.dataset.mode='text';body.innerHTML=`<pre class="body">${esc(m.body_text)}</pre>`;setReaderModeActive('showText')});$('#showHtml')?.addEventListener('click',()=>{$('#bodyHost').dataset.mode='manual';showSanitizedHtml(m,false);setReaderModeActive('showHtml')});$('#showHtmlRemote')?.addEventListener('click',async()=>{if(m.remote_images_allowed||m.remote_domain_allowed||await confirmDialog('Carregar imagens remotas pode informar ao remetente que você abriu a mensagem. Continuar?')){showSanitizedHtml(m,true);setReaderModeActive('showHtmlRemote')}});$('#alwaysRemote')?.addEventListener('click',async()=>{if(await confirmDialog(`Sempre carregar imagens remotas de ${m.from_email}?`)){await invoke('allow_remote_images_for_sender',{sender:m.from_email||''});m.remote_images_allowed=true;showSanitizedHtml(m,true);toast('Imagens remotas autorizadas para este remetente.')}});$('#alwaysRemoteDomain')?.addEventListener('click',async()=>{const domain=(m.from_email||'').split('@')[1]||'';if(domain&&await confirmDialog(`Sempre carregar imagens remotas do domínio ${domain}?`)){await invoke('allow_remote_images_for_domain',{sender:m.from_email||''});m.remote_domain_allowed=true;showSanitizedHtml(m,true);toast(`Imagens remotas autorizadas para ${domain}.`)}});$$('[data-preview-ai]').forEach(b=>b.onclick=()=>previewAttachment(m,Number(b.dataset.previewAi)));$$('[data-save-ai]').forEach(b=>b.onclick=()=>invoke('save_received_attachment',{messageId:m.id,index:Number(b.dataset.saveAi)}).catch(showError));$$('[data-open-ai]').forEach(b=>b.onclick=async()=>{const idx=Number(b.dataset.openAi),a=m.attachments?.find(x=>x.index===idx);if(a&&isRiskyAttachment(a.filename)&&!await confirmDialog(`O anexo ${a.filename} pode executar conteúdo ou alterar o sistema. Abrir mesmo assim?`,{danger:true,confirmLabel:'Abrir'}))return;invoke('open_received_attachment',{messageId:m.id,index:idx}).catch(showError)});$('#saveAllAttachments')?.addEventListener('click',async()=>{const n=await invoke('save_all_received_attachments',{messageId:m.id});toast(`${n} anexo(s) salvo(s).`)});if(hasHtml){const remote=!!(m.remote_images_allowed||m.remote_domain_allowed);showSanitizedHtml(m,remote);setReaderModeActive(remote?'showHtmlRemote':'showHtml')}$$('[data-rsvp]').forEach(b=>b.onclick=async()=>{try{await invoke('respond_calendar_invite',{messageId:m.id,partstat:b.dataset.rsvp});toast('Resposta ao convite enviada e Agenda atualizada.')}catch(e){showError(e)}})}
function adjacentRegularMessage(id,delta){const index=state.items.findIndex(x=>x.id===id);if(index<0)return null;let i=index+delta;while(i>=0&&i<state.items.length){if(!state.items[i].local_draft)return state.items[i];i+=delta}return null}
function openAdjacentMessage(id,delta){const next=adjacentRegularMessage(id,delta);if(!next)return;state.selected.clear();state.selected.add(next.id);state.selectionAnchor=next.id;state.focusId=next.id;openMessage(next.id);const row=document.querySelector(`.row[data-id="${next.id}"]`);row?.scrollIntoView({block:'nearest'})}
function isRiskyAttachment(name){return /\.(?:exe|com|bat|cmd|msi|ps1|vbs|js|jse|wsf|wsh|scr|pif|reg|app|dmg|pkg|deb|rpm|sh|desktop|jar)$/i.test(String(name||''))}
function setReaderModeActive(id){['showText','showHtml','showHtmlRemote'].forEach(x=>document.getElementById(x)?.classList.toggle('active',x===id))}
async function showSanitizedHtml(m,allowRemote){const host=$('#bodyHost');if(!host)return;const request=String((Number(host.dataset.htmlRequest)||0)+1);host.dataset.htmlRequest=request;const src=await emailHtmlForDisplay(m,{allowRemote});if(state.current!==m||host!==$('#bodyHost')||host.dataset.htmlRequest!==request)return;const frame=document.createElement('iframe');frame.className='mailFrame';frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('referrerpolicy','no-referrer');frame.srcdoc=src;frame.setAttribute('scrolling','no');frame.onload=()=>{const doc=frame.contentDocument;if(!doc)return;
  // Single vertical scroll belongs to #bodyHost. Scripts are forbidden in srcdoc;
  // resize from the parent after the HTML and inline images establish their sizes.
  const resize=()=>{if(!frame.isConnected)return;const h=Math.max(320,doc.documentElement?.scrollHeight||0,doc.body?.scrollHeight||0)+20;frame.style.height=`${Math.min(32000,h)}px`;frame.style.overflow=h>32000?'auto':'hidden'};
  resize();doc.querySelectorAll('img').forEach(img=>{if(!img.complete){img.addEventListener('load',resize,{once:true});img.addEventListener('error',resize,{once:true})}});
  doc.addEventListener('click',async e=>{const a=e.target.closest?.('a[href]');if(!a)return;e.preventDefault();const href=a.getAttribute('href')||'';if(!/^(https?:|mailto:)/i.test(href))return;let warning='';try{const visible=(a.textContent||'').trim();if(/^https?:/i.test(visible)){const vd=new URL(visible).hostname,hd=new URL(href).hostname;if(vd&&hd&&vd!==hd)warning=`\n\nAtenção: o texto mostra ${vd}, mas o link abre ${hd}.`;}}catch{}if(await confirmDialog(`Abrir este link fora do TCS Mail?\n\n${href}${warning}`)){await invoke('open_external_url',{url:href}).catch(showError)}})};host.replaceChildren(frame);frame.addEventListener('load',()=>host.__tcsFinder?.refresh(),{once:true})}


function printWithTarget(target='message'){
 document.body.dataset.printTarget=target;
 const clear=()=>{delete document.body.dataset.printTarget;window.removeEventListener('afterprint',clear)};
 window.addEventListener('afterprint',clear,{once:true});
 window.print();
 setTimeout(clear,1500)
}
async function openThread(m){
 try{
  const items=await invoke('thread_messages',{id:m.id});
  if(!items.length)return toast('Nenhuma conversa relacionada encontrada.');
  const sorted=[...items].sort((a,b)=>Number(a.date_ts||0)-Number(b.date_ts||0));
  const {root}=modal(`Conversa · ${sorted.length} mensagem${sorted.length===1?'':'s'}`,`<div class="threadPrintBar"><button id="printThread">Imprimir conversa</button></div><div class="threadView">${sorted.map((x,i)=>`<details class="threadMessage" data-thread-message="${x.id}" ${x.id===m.id||i===sorted.length-1?'open':''}><summary><span class="threadMessageHead"><b>${esc(x.from_name||x.from_email)}</b><small>${esc(x.from_email||'')}${x.to_text?` → ${esc(x.to_text)}`:''}</small></span><time>${fmtDate(x.date_ts)}</time></summary><div class="threadMessageBody"><div class="threadMessageActions"><button data-thread-reply="${x.id}">Responder</button><button data-thread-reply-all="${x.id}">Responder a todos</button><button data-thread-forward="${x.id}">Encaminhar</button><button data-thread-open="${x.id}">Abrir separadamente</button><button data-thread-copy="${x.id}">Copiar Message-ID</button>${x.attachments?.length?`<button data-thread-save="${x.id}">Salvar anexos (${x.attachments.length})</button>`:''}</div><div class="threadMessageText">${esc(x.body_text||x.snippet||'(sem conteúdo de texto)')}</div>${x.attachments?.length?`<div class="threadAttachments">${x.attachments.map(a=>`<span>📎 ${esc(a.filename)} · ${formatBytes(a.size_hint||0)}</span>`).join('')}</div>`:''}</div></details>`).join('')}</div>`,{wide:true,resizable:true,persistKey:`thread-${m.id}`});
  $('#printThread',root).onclick=()=>printWithTarget('thread');
  const byId=id=>sorted.find(x=>x.id===Number(id));
  $$('[data-thread-reply]',root).forEach(b=>b.onclick=()=>{const x=byId(b.dataset.threadReply);if(x)reply(x,false)});
  $$('[data-thread-reply-all]',root).forEach(b=>b.onclick=()=>{const x=byId(b.dataset.threadReplyAll);if(x)reply(x,true)});
  $$('[data-thread-forward]',root).forEach(b=>b.onclick=()=>{const x=byId(b.dataset.threadForward);if(x)openComposer(ctx,{accountId:x.account_id,subject:/^(fwd?|enc):/i.test(x.subject)?x.subject:`Fwd: ${x.subject}`,textBody:`

${tr('---------- Mensagem encaminhada ----------')}
${tr('De:')} ${x.from_name||x.from_email} <${x.from_email}>
${tr('Para:')} ${x.to_text}
${tr('Assunto:')} ${x.subject}

${x.body_text||''}`})});
  $$('[data-thread-open]',root).forEach(b=>b.onclick=()=>openMessageFocused(Number(b.dataset.threadOpen)));
  $$('[data-thread-copy]',root).forEach(b=>b.onclick=async()=>{const x=byId(b.dataset.threadCopy),value=x?.message_id||String(x?.id||'');try{await navigator.clipboard.writeText(value);toast('Message-ID copiado.')}catch{toast(value)}});
  $$('[data-thread-save]',root).forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.threadSave);try{const n=await invoke('save_all_received_attachments',{messageId:id});toast(`${n} anexo(s) salvo(s).`)}catch(e){showError(e)}});
  root.querySelector(`[data-thread-message="${m.id}"]`)?.scrollIntoView({block:'center'})
 }catch(e){showError(e)}
}
function findInCurrentMessage(m){const host=$('#bodyHost');if(!host)return; if(!host.__tcsFinder)host.__tcsFinder=attachReaderFind(host);host.__tcsFinder.open();}

function openMessageProperties(m){modal('Propriedades da mensagem',`<div class="propertyGrid"><b>Message-ID</b><code>${esc(m.message_id||'—')}</code><b>Conta</b><span>${m.account_id}</span><b>Pasta</b><span>${esc(m.folder)}</span><b>UID</b><span>${m.uid}</span><b>De</b><span>${esc(m.from_email)}</span><b>Para</b><span>${esc(m.to_text)}</span><b>Data</b><span>${fmtDate(m.date_ts)}</span></div>`,{wide:true,resizable:true})}
async function preAnalyzeMessage(m){const b=$('#aiAssist');if(!b)return;try{const a=await invoke('ai_authorization_status',{id:m.id});if(!a.allowed)return;const r=await invoke('ai_analyze_message',{id:m.id});const n=Array.isArray(r?.sources)?r.sources.length:0;b.dataset.aiSources=String(n);b.title=n?`${n} fonte(s) interna(s) relevante(s) encontrada(s). Clique para usar a IA.`:'Assistência por IA (nenhuma fonte interna relevante encontrada)'}catch{}}
async function ensureAiAuthorization(m){
 const st=await invoke('ai_authorization_status',{id:m.id});
 if(st.allowed)return true;
 const shortRisk='A análise por IA pode expor conteúdo do e-mail, da conversa e trechos relacionados ao modelo configurado. Se o modelo for remoto, os dados podem sair deste dispositivo; modelos locais permanecem na estação, mas ainda processam o conteúdo.';
 if(st.mode==='per_message'&&st.notice_suppressed){
  if(!await confirmDialog('Autorizar a IA a analisar somente este e-mail?',{confirmLabel:'Autorizar'}))return false;
  const next=await invoke('ai_apply_authorization_choice',{id:m.id,choice:'message',suppressNotice:true});
  return !!next.allowed;
 }
 const {root,close}=modal('Autorização de IA',`<p><b>Nenhum conteúdo será analisado sem sua autorização.</b></p>${st.notice_suppressed?'':`<p class="privacyRisk">${esc(shortRisk)}</p>`}<fieldset class="aiConsentChoices"><legend>Autorizar:</legend><label><input type="radio" name="aiConsentChoice" value="message" checked> somente este e-mail</label><label><input type="radio" name="aiConsentChoice" value="mailbox"> todos os e-mails desta caixa</label><label><input type="radio" name="aiConsentChoice" value="all"> todos os e-mails de todas as contas</label></fieldset><label class="settingsToggle"><input id="aiConsentSuppress" type="checkbox" ${st.notice_suppressed?'checked':''}> Não exibir mais esta mensagem de riscos</label><footer class="modalActions"><button id="aiConsentCancel">Agora não</button><button id="aiConsentApply" class="primary">Autorizar</button></footer>`,{wide:true});
 return await new Promise(resolve=>{
  $('#aiConsentCancel',root).onclick=()=>{close();resolve(false)};
  $('#aiConsentApply',root).onclick=async()=>{const choice=root.querySelector('input[name="aiConsentChoice"]:checked')?.value||'message';try{const next=await invoke('ai_apply_authorization_choice',{id:m.id,choice,suppressNotice:$('#aiConsentSuppress',root).checked});close();state.boot.settings.aiAnalysisScope=next.mode;state.boot.settings.aiConsentNoticeSuppressed=$('#aiConsentSuppress',root)?.checked||false;resolve(!!next.allowed)}catch(e){toast(String(e));resolve(false)}};
 });
}

function friendlyAiError(error){
 const text=String(error||'');
 if(/AI_CONSENT_REQUIRED/i.test(text))return 'Este e-mail ainda não foi autorizado para análise por IA.';
 if(/AI_CONSENT_REQUIRED|403|unauthorized/i.test(text))return 'A política de privacidade não autorizou esta mensagem para IA. Revise Configurações → IA e RAG.';
 if(/Failed to connect|Connection refused|Could not connect|timed out|timeout/i.test(text))return 'O provider de IA está indisponível. O cliente de e-mail continua funcionando normalmente.';
 if(/provider|llama-swap|model|modelo/i.test(text))return `O provider/modelo configurado não está disponível. ${text}`;
 return `Recurso de IA indisponível no momento. O restante do TCS Mail continua operacional. ${text}`;
}
function aiSourceTitle(item,index){return item?.title||item?.source_title||item?.path||item?.source||item?.document||`Fonte ${index+1}`}
function aiSourceText(item){return String(item?.text||item?.content||item?.snippet||item?.chunk||'').trim()}
function renderAiSources(items,{empty='Nenhuma evidência interna relevante foi encontrada.'}={}){if(!Array.isArray(items)||!items.length)return `<p class="aiEmpty">${esc(empty)}</p>`;return items.map((item,i)=>`<article class="aiSourceCard"><small>${esc(aiSourceTitle(item,i))}</small><div>${esc(aiSourceText(item)||'Evidência localizada sem prévia textual.')}</div></article>`).join('')}
function renderAiAnalysis(result){const summary=String(result?.summary||'').trim();const sources=Array.isArray(result?.sources)?result.sources:[];return `<section><h3>Resumo</h3>${summary?`<p>${esc(summary).replace(/\n/g,'<br>')}</p>`:'<p class="aiEmpty">O modelo não retornou um resumo textual.</p>'}</section><section><h3>Contexto encontrado</h3>${renderAiSources(sources)}</section>`}
function renderAiRag(result){const items=Array.isArray(result?.items)?result.items:[];return `<section><h3>Evidências encontradas no RAG</h3><p class="dim">${items.length?`${items.length} resultado(s) potencialmente relevante(s).`:'Nenhum trecho relevante foi localizado.'}</p>${renderAiSources(items,{empty:'Nenhum trecho do RAG correspondeu suficientemente a esta mensagem.'})}</section>`}
function renderAiReply(result){const reply=String(result?.suggested_reply||'').trim(),sources=Array.isArray(result?.sources)?result.sources:[],warnings=Array.isArray(result?.warnings)?result.warnings:[];return `<section><h3>Sugestão de resposta</h3>${reply?`<p>${esc(reply).replace(/\n/g,'<br>')}</p>`:'<p class="aiEmpty">Nenhuma sugestão foi gerada.</p>'}</section>${warnings.length?`<section><h3>Atenção</h3><ul>${warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}${sources.length?`<details><summary>Contexto usado (${sources.length})</summary>${renderAiSources(sources)}</details>`:''}`}
async function openAiAssist(m){
 if(!await ensureAiAuthorization(m))return;
 const a=await invoke('get_ai_settings').catch(()=>({enabled:false,rag_enabled:false}));
 if(!a.enabled){openSettings(ctx,'ai');toast('Configure e teste a IA antes de utilizar.');return}
 const comparisonOriginal=await invoke('ai_reader_original',{id:m.id});
 const v=modal('Assistente de IA',workspaceHtml('reader',{ragEnabled:!!a.rag_enabled}),{wide:true,resizable:true,persistKey:'ai-workspace-reader'});
 bindAiWorkspace(v.root,{mode:'reader',sourceText:()=>comparisonOriginal,settings:()=>openSettings(ctx,'ai'),apply:async text=>{const c=await invoke('reply_context',{id:m.id,replyAll:false});const htmlBody=`${esc(text).replace(/\n/g,'<br>')}<br><br><div class="replyIntro">${esc(tr('Em'))} ${esc(fmtDate(m.date_ts))}, ${esc(m.from_name||m.from_email)} ${esc(tr('escreveu:'))}</div><blockquote data-original-message="1">${originalMessageHtml(m)}</blockquote>`;v.close();openResponseComposer({accountId:m.account_id,to:c.to,cc:c.cc,subject:/^re:/i.test(m.subject)?m.subject:`Re: ${m.subject}`,textBody:text,htmlBody,composeFormat:'html',sourceMessageId:m.id,inReplyTo:c.in_reply_to,references:c.references})},run:async({action,guidance,tone,length,language,variation=0,signal})=>{
  const requestId=crypto.randomUUID();
  const cancel=()=>{invoke('ai_cancel_generation',{requestId}).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  const cancellable=(command,args)=>invoke(command,{...args,requestId},{signal});
  try{
  const detailed=[variation>0?`Crie uma versão alternativa ${variation+1}, com formulação diferente mas mesma intenção.`:'',guidance,tone==='formal'?'Use tom formal.':tone==='casual'?'Use tom casual.':'',length==='short'?'Seja breve.':length==='long'?'Seja detalhado.':''].filter(Boolean).join(' ');
  if(action==='reply'){const r=await cancellable('ai_suggest_reply',{id:m.id,guidance:detailed||null},{signal});return r?.suggested_reply||''}
  if(action==='rag'){const q=`${m.subject}\n${m.body_text||''}\n${detailed}`.slice(0,12000);const r=await cancellable('ai_rag_search',{query:q},{signal});return (r?.items||[]).map((x,i)=>`${i+1}. ${aiSourceTitle(x,i)}\n${aiSourceText(x)}`).join('\n\n')||'Nenhum resultado encontrado.'}
  if(['summary','explain','information','translate'].includes(action)){const r=await cancellable('ai_reader_operation',{id:m.id,operation:action,options:{language,length,guidance:detailed||null,variation,requestId}},{signal});return r?.text||'';}
  throw new Error('Operação de IA não suportada.');
  }finally{signal?.removeEventListener('abort',cancel)}
 }});
}
function originalMessageHtml(m){if(!m.body_html?.trim())return esc(m.body_text||'').replace(/\n/g,'<br>');const safe=sanitizeEmailHtml(m.body_html,{allowRemote:true}),doc=new DOMParser().parseFromString(safe,'text/html');return doc.body.innerHTML}
function forwardSeed(m){const subject=/^(fwd?|enc):/i.test(m.subject)?m.subject:`Fwd: ${m.subject}`;const text=`\n\n${tr('---------- Mensagem encaminhada ----------')}\n${tr('De:')} ${m.from_name||m.from_email} <${m.from_email}>\n${tr('Para:')} ${m.to_text}\n${m.cc_text?`${tr('Cc:')} ${m.cc_text}\n`:''}${tr('Assunto:')} ${m.subject}\n\n${m.body_text||''}`;const htmlBody=`<br><br><div data-original-message="1"><div><b>${esc(tr('---------- Mensagem encaminhada ----------'))}</b></div><div><b>${esc(tr('De:'))}</b> ${esc(m.from_name||m.from_email)} &lt;${esc(m.from_email)}&gt;</div><div><b>${esc(tr('Para:'))}</b> ${esc(m.to_text||'')}</div>${m.cc_text?`<div><b>${esc(tr('Cc:'))}</b> ${esc(m.cc_text)}</div>`:''}<div><b>${esc(tr('Assunto:'))}</b> ${esc(m.subject||'')}</div><br>${originalMessageHtml(m)}</div>`;return {accountId:m.account_id,subject,textBody:text,htmlBody,composeFormat:'html',sourceMessageId:m.id}}
async function reply(m,all){const c=await invoke('reply_context',{id:m.id,replyAll:all});if(c.warning)toast(c.warning);const text=`\n\n${tr('Em')} ${fmtDate(m.date_ts)}, ${m.from_name||m.from_email} ${tr('escreveu:')}\n> ${(m.body_text||'').replace(/\n/g,'\n> ')}`;const htmlBody=`<br><br><div class="replyIntro">${esc(tr('Em'))} ${esc(fmtDate(m.date_ts))}, ${esc(m.from_name||m.from_email)} ${esc(tr('escreveu:'))}</div><blockquote data-original-message="1">${originalMessageHtml(m)}</blockquote>`;return openResponseComposer({accountId:m.account_id,to:c.to,cc:c.cc,subject:/^re:/i.test(m.subject)?m.subject:`Re: ${m.subject}`,textBody:text,htmlBody,composeFormat:'html',sourceMessageId:m.id,inReplyTo:c.in_reply_to,references:c.references})}
async function toggleFlag(m,key){await invoke('set_flags',{req:{id:m.id,starred:key==='starred'?!m.starred:null,pinned:key==='pinned'?!m.pinned:null,priority:key==='priority'?!m.priority:null,unread:null}});await loadMessages();await openMessage(m.id)}
async function act(id,action,target=null){const fallback=state.current?.id===id?(adjacentRegularMessage(id,1)||adjacentRegularMessage(id,-1)):null;try{await invoke('message_action',{req:{id,action,target}});state.current=null;state.selected.delete(id);await loadMessages(null,false,{preserveScroll:true,preserveCurrent:false});if(fallback&&state.items.some(x=>x.id===fallback.id))await openMessage(fallback.id)}catch(e){showError(e)}}
async function deleteOne(m){const permanent=state.folder===folderName('trash');if(permanent&&!await confirmDialog('Excluir definitivamente? Esta ação não pode ser desfeita.',{danger:true,confirmLabel:'Excluir definitivamente'}))return;act(m.id,permanent?'delete_permanent':'delete')}
async function moveDialog(m){const folders=state.account===m.account_id&&state.folders.length?state.folders:await invoke('list_folders',{accountId:m.account_id});const {root,close}=modal('Mover mensagem',`<label class="field"><span>Destino</span><select id="moveTarget">${folders.map(f=>`<option>${esc(f)}</option>`).join('')}</select></label><footer class="modalActions"><button id="doMove" class="primary">Mover</button></footer>`);$('#doMove',root).onclick=async()=>{await act(m.id,'move',$('#moveTarget',root).value);close()}}
async function moveManyDialog(ids){const rows=ids.map(id=>state.items.find(x=>x.id===id)).filter(Boolean);const accounts=[...new Set(rows.map(x=>x.account_id))];if(accounts.length!==1)return toast('Para mover várias mensagens de uma vez, selecione mensagens da mesma conta.');const accountId=accounts[0];const folders=state.account===accountId&&state.folders.length?state.folders:await invoke('list_folders',{accountId});const {root,close}=modal(`Mover ${ids.length} mensagem(ns)`,`<label class="field"><span>Destino</span><select id="moveTargetMany">${folders.map(f=>`<option>${esc(f)}</option>`).join('')}</select></label><footer class="modalActions"><button id="doMoveMany" class="primary">Mover</button></footer>`);$('#doMoveMany',root).onclick=async()=>{const target=$('#moveTargetMany',root).value;for(const id of ids)await invoke('message_action',{req:{id,action:'move',target}});close();state.selected.clear();state.current=null;await loadMessages(null,false,{preserveScroll:true})}}
function followUpDialog(m,quick=false){const defaultTs=Math.floor(Date.now()/1000)+(quick?8*3600:86400);const {root,close}=modal('Acompanhamento',`<p class="dim">Crie um lembrete local para esta conversa.</p><label class="field"><span>Lembrar em</span><input id="followMessageAt" type="datetime-local" value="${new Date(defaultTs*1000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></label><label class="field"><span>Nota</span><input id="followMessageNote" placeholder="Acompanhar resposta"></label><footer class="modalActions"><button id="followMessageSave" class="primary">Salvar acompanhamento</button></footer>`);$('#followMessageSave',root).onclick=async()=>{const due=fromLocalInput($('#followMessageAt',root).value);if(!due)return;await invoke('add_message_follow_up',{messageId:m.id,dueTs:due,note:$('#followMessageNote',root).value});close();toast('Acompanhamento criado.')}}
function snoozeDialog(m){const {root,close}=modal('Adiar mensagem',`<label class="field"><span>Voltar em</span><input id="snoozeAt" type="datetime-local"></label><footer class="modalActions"><button id="doSnooze" class="primary">Adiar</button></footer>`);const d=new Date(Date.now()+86400000);$('#snoozeAt',root).value=d.toISOString().slice(0,16);$('#doSnooze',root).onclick=async()=>{const ts=fromLocalInput($('#snoozeAt',root).value);await invoke('snooze',{req:{id:m.id,until_ts:ts}});close();toast('Mensagem adiada.');loadMessages()}}
async function taskFromMessage(m){const due=Math.floor(Date.now()/1000)+86400;try{await invoke('create_task_from_message',{messageId:m.id,dueTs:due});toast('Tarefa criada a partir da mensagem.');state.view='tasks';renderShell()}catch(e){showError(e)}}
async function eventFromMessage(m){const start=Math.floor(Date.now()/1000)+3600,end=start+3600;try{await invoke('create_event_from_message',{messageId:m.id,startTs:start,endTs:end});toast('Evento criado a partir da mensagem.');state.view='calendar';renderShell()}catch(e){showError(e)}}
// One resumable session per account+folder. Keep sync incremental: never
// advance a UID cursor by jumping to the newest remote UID after a partial FETCH.
const folderSyncJobs=new Map();
async function syncFolderHistory(target,{manual=false,scope=null}={}){
 const key=`${target.accountId}\u0000${target.folder}`;
 if(folderSyncJobs.has(key)){
  if(!manual)return folderSyncJobs.get(key);
  // A manual request must not silently reuse an interrupted view-scoped job.
  await folderSyncJobs.get(key).catch(()=>{});
 }
 const work=(async()=>{
  let added=0,older=0,complete=false;
  const active=()=>!scope|| (state.view==='mail'&&state.folder===scope.folder&&state.account===scope.account);
  // RC5: one foreground-sized sync page on entry; the rest is explicit/retomável.
  // Applies to Gmail, Microsoft Exchange Online and all standard IMAP providers.
  const recentLimit=manual?10:1,historyLimit=manual?10:0;
  // catch up from an old incremental checkpoint even for a busy Sent mailbox
  for(let n=0;n<recentLimit&&active();n++){
   const r=await invoke('sync_recent',target);added+=Number(r?.fetched||0);
   if(active()&&r?.fetched){await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true})}
   if(Number(r?.fetched||0)<100)break;
   if(manual&&n===recentLimit-1)toast('Sincronização recente parcial: execute sincronizar para continuar.');
  }
  // RC5: automatic entry must not start a 500-message historical FETCH.
  // Backfill is a manual action; its guarded checkpoints remain unchanged.
  for(let n=0;manual&&n<historyLimit&&active();n++){
   const r=await invoke('sync_backfill',target);
   older+=Number(r?.fetched||0);complete=!!r?.backfill_complete;
   if(active()&&r?.fetched){await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true})}
   if(complete)break;
   if(!r?.fetched)break; // avoid a pathological empty-page loop
  }
  if(active()&&(added||older))status(`Sincronizados ${added} recentes e ${older} antigos${complete?' · histórico concluído':' · histórico em andamento'}`);
  return {added,older,complete};
 })();
 folderSyncJobs.set(key,work);
 try{return await work}finally{if(folderSyncJobs.get(key)===work)folderSyncJobs.delete(key)}
}
async function sync(){
 try{
  const targets=await syncTargetsForFolder(state.folder);
  if(!targets.length)return toast('Esta visualização reúne mensagens de várias pastas. Selecione a pasta desejada para sincronizá-la.');
  status(`Sincronizando ${targets.length} pasta(s) IMAP…`);
  const results=await Promise.allSettled(targets.map(t=>syncFolderHistory(t,{manual:true})));
  const errors=results.filter(r=>r.status==='rejected');
  await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true});
  if(errors.length)toast(`${errors.length} pasta(s) não sincronizada(s): ${String(errors[0].reason)}`);
 }catch(e){showError(e)}
}
async function onListKey(e){
 if(['input','textarea','select'].includes(document.activeElement?.tagName?.toLowerCase())||document.activeElement?.isContentEditable)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();state.items.forEach(x=>state.selected.add(x.id));if(state.items.length){state.selectionAnchor=state.items[0].id;state.focusId=state.items[0].id}renderVirtualRows();return}
 const activeId=state.focusId||state.current?.id||state.items[0]?.id;
 if(shortcutMatches(e,'markRead',state.boot.settings)){e.preventDefault();e.stopPropagation();const ids=activeMailIds();if(ids.length)await setBulkFlags(ids,{unread:false});return}
 if(shortcutMatches(e,'markUnread',state.boot.settings)){e.preventDefault();e.stopPropagation();const ids=activeMailIds();if(ids.length)await setBulkFlags(ids,{unread:true});return}
 if((e.key==='Delete')&&activeId){
  e.preventDefault();const ids=state.selected.size?[...state.selected]:[activeId];
  const selected=state.items.filter(x=>ids.includes(x.id));
  const locals=selected.filter(x=>x.local_draft),remote=selected.filter(x=>!x.local_draft);
  const permanent=e.shiftKey||state.folder===folderName('trash');
  if(!await confirmDialog(`Excluir ${locals.length} rascunho(s) local(is) e ${remote.length} mensagem(ns)${permanent?' definitivamente':''}?`,{danger:true,confirmLabel:'Excluir'}))return;
  for(const item of selected){try{
   if(item.local_draft)await invoke('delete_local_draft',{id:item.local_draft_id});
   else await invoke('message_action',{req:{id:item.id,action:permanent?'delete_permanent':'delete',target:null}});
  }catch(error){showError(error);break}}
  state.selected.clear();await refreshLocalDrafts();await loadMessages();return;
 }

 if(['ArrowDown','ArrowUp'].includes(e.key)&&state.items.length){e.preventDefault();let ix=state.items.findIndex(x=>x.id===activeId);if(ix<0)ix=e.key==='ArrowDown'?-1:state.items.length;ix=Math.max(0,Math.min(state.items.length-1,ix+(e.key==='ArrowDown'?1:-1)));const id=state.items[ix].id;if(e.shiftKey){if(state.selectionAnchor==null)state.selectionAnchor=activeId||id;selectRange(id);openItemById(id)}else if(e.ctrlKey||e.metaKey){state.focusId=id;state.selectionAnchor=id;renderVirtualRows()}else{state.selected.clear();state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows();openItemById(id)}ensureRowVisible(ix);return}
 if(['Home','End','PageUp','PageDown'].includes(e.key)&&state.items.length){e.preventDefault();let ix=state.items.findIndex(x=>x.id===activeId);if(e.key==='Home')ix=0;else if(e.key==='End')ix=state.items.length-1;else{const page=Math.max(1,Math.floor(($('#rowsViewport')?.clientHeight||600)/rowHeight()));ix=Math.max(0,Math.min(state.items.length-1,(ix<0?0:ix)+(e.key==='PageDown'?page:-page)))}const id=state.items[ix].id;if(e.shiftKey){if(state.selectionAnchor==null)state.selectionAnchor=activeId||id;selectRange(id);openItemById(id)}else if(e.ctrlKey||e.metaKey){state.focusId=id;state.selectionAnchor=id;renderVirtualRows()}else{state.selected.clear();state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows();openItemById(id)}ensureRowVisible(ix);return}
 if((e.ctrlKey||e.metaKey)&&(e.key===' '||e.key==='Spacebar')&&activeId){e.preventDefault();toggleSelection(activeId);return}
 if(e.key==='Enter'&&activeId){e.preventDefault();openItemById(activeId)}
}
async function syncTargetsForFolder(folder){
 const ids=activeAccountIds();
 const special={__SENT:['sent','Sent'],__DRAFTS:['drafts','Drafts'],__ARCHIVE:['archive','Archive'],__JUNK:['junk','Junk'],__TRASH:['trash','Trash']}[folder];
 if(!special)return folder.startsWith('__')?[]:ids.map(accountId=>({accountId,folder}));
 const results=await Promise.allSettled(ids.map(async accountId=>{
  // In unified views even unopened accounts need one authoritative LIST; the
  // Rust command persists SPECIAL-USE before folder_roles is fetched.
  if(state.account!==accountId)await invoke('list_folder_tree',{accountId});
  const roles=await invoke('folder_roles',{accountId});
  const remote=roles?.[special[0]];
  if(!remote)throw new Error(`Pasta ${special[0]} não identificada na conta ${accountId}; confira a exposição IMAP da pasta no provedor.`);
  return {accountId,folder:remote};
 }));
 const failed=results.filter(r=>r.status==='rejected');
 for(const f of failed)toast('Falha ao localizar uma pasta especial: '+String(f.reason));
 return results.filter(r=>r.status==='fulfilled').map(r=>r.value);
}
async function enterFolder(folder){
 state.view='mail';state.folder=folder;state.selected.clear();state.focusId=null;state.selectionAnchor=null;
 const scope={folder,account:state.account};
 const key=`${scope.account}\u0000${scope.folder}`;
 state.folderInitialSyncKey=key;
 const started=performance.now();
 // Preserve the tree's scroll position when a folder is selected; it is not
 // an instruction to reset the navigation to the top or to collapse parents.
 const sidebarBefore=document.querySelector('.sidebar');
 const folderBefore=document.querySelector('.columnsFolderPane');
 const sidebarScroll=sidebarBefore?.scrollTop??null;
 const folderScroll=folderBefore?.scrollTop??null;
 renderShell();
 if(sidebarScroll!==null&&document.querySelector('.sidebar'))document.querySelector('.sidebar').scrollTop=sidebarScroll;
 if(folderScroll!==null&&document.querySelector('.columnsFolderPane'))document.querySelector('.columnsFolderPane').scrollTop=folderScroll;
 await loadMessages(null,false,{preserveScroll:false,preserveCurrent:false});
 try{
  const targets=await syncTargetsForFolder(folder);
  if(state.view!=='mail'||state.folder!==folder||state.account!==scope.account)return;
  // Responsive-first: do not block navigation for other folders or stale views.
  // A bounded initial fetch handles Gmail, Microsoft and ordinary IMAP alike.
  Promise.allSettled(targets.map(t=>syncFolderHistory(t,{scope}))).then(results=>{
   if(state.view!=='mail'||state.folder!==folder||state.account!==scope.account)return;
   for(const failure of results.filter(r=>r.status==='rejected'))
    toast(`Falha na sincronização IMAP: ${String(failure.reason)}`);
   // Keep diagnostics categorical: no addresses, folder names or message data.
   console.info('TCS mail first sync elapsed (ms):',Math.round(performance.now()-started));
  }).finally(()=>{
   if(state.folderInitialSyncKey!==key)return;
   state.folderInitialSyncKey=null;
   if(state.view==='mail'&&state.folder===folder&&state.account===scope.account){
    if(!state.items.length)status('Nenhuma mensagem local nesta visualização · use Atualizar para continuar a consulta IMAP');
    else status(`${state.page?.total??state.items.length} mensagem(ns)`);
   }
  });
 }catch(e){
  if(state.folderInitialSyncKey===key)state.folderInitialSyncKey=null;
  toast('Não foi possível identificar a pasta IMAP: '+String(e));
 }
}
function selectRange(id,{additive=false}={}){const anchor=state.selectionAnchor??state.focusId??id;const a=state.items.findIndex(x=>x.id===anchor),b=state.items.findIndex(x=>x.id===id);if(!additive)state.selected.clear();if(a<0||b<0){state.selected.add(id)}else{for(let i=Math.min(a,b);i<=Math.max(a,b);i++){state.selected.add(state.items[i].id)}}state.focusId=id;renderVirtualRows()}
function toggleSelection(id){if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows()}
function handleSelectionClick(id,e,{checkbox=false}={}){if(e.shiftKey){selectRange(id);return}if(e.ctrlKey||e.metaKey||checkbox){if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows();return}state.selected.clear();state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows()}
function handleRowClick(e,id){if(e.shiftKey||e.ctrlKey||e.metaKey){handleSelectionClick(id,e);return}state.selected.clear();state.selected.add(id);state.focusId=id;state.selectionAnchor=id;renderVirtualRows();$('#rowsViewport')?.focus({preventScroll:true});openMessage(id)}
function ensureRowVisible(ix){const vp=$('#rowsViewport');if(!vp)return;const top=ix*rowHeight(),bottom=top+rowHeight();if(top<vp.scrollTop)vp.scrollTop=top;else if(bottom>vp.scrollTop+vp.clientHeight)vp.scrollTop=bottom-vp.clientHeight}
async function bulkDirect(ids,action){const currentId=state.current?.id||null;const fallback=currentId&&ids.includes(currentId)?(adjacentRegularMessage(currentId,1)||adjacentRegularMessage(currentId,-1)):null;for(const id of ids){try{await invoke('message_action',{req:{id,action,target:null}})}catch(e){showError(e);break}}state.selected.clear();state.current=null;await loadMessages(null,false,{preserveScroll:true,preserveCurrent:false});if(fallback&&state.items.some(x=>x.id===fallback.id))await openMessage(fallback.id)}
function maybeLoadMore(){const vp=$('#rowsViewport');if(!vp||!state.page?.next_cursor)return;if(vp.scrollTop+vp.clientHeight>=vp.scrollHeight-160)loadMessages(state.page.next_cursor,true,{preserveScroll:true,preserveCurrent:true,preserveSelection:true})}
function openMessageContextMenu(x,y,id){
 removeContextMenu();
 const menu=document.createElement('div');menu.className='contextMenu';menu.style.left=`${Math.min(x,window.innerWidth-250)}px`;menu.style.top=`${Math.max(8,Math.min(y,window.innerHeight-560))}px`;
 const m=state.items.find(item=>item.id===id);const ids=state.selected.size?[...state.selected]:[id];const single=ids.length===1;
 const actions=[
  ['Abrir',()=>openMessage(id),true],['Abrir em visualização ampliada',()=>openMessageFocused(id),single],
  ['Responder',()=>openMessage(id).then(()=>state.current&&reply(state.current,false)),single],['Responder a todos',()=>openMessage(id).then(()=>state.current&&reply(state.current,true)),single],['Encaminhar',()=>openMessage(id).then(()=>state.current&&$('#forward')?.click()),single],
  ['Marcar como lida',()=>setBulkFlags(ids,{unread:false}),true],['Marcar como não lida',()=>setBulkFlags(ids,{unread:true}),true],
  [m?.starred?'Remover dos favoritos':'Favoritar',()=>setBulkFlags(ids,{starred:!m?.starred}),true],[m?.pinned?'Desafixar':'Fixar',()=>setBulkFlags(ids,{pinned:!m?.pinned}),true],[m?.priority?'Prioridade normal':'Marcar prioridade',()=>setBulkFlags(ids,{priority:!m?.priority}),true],
  ['Arquivar',()=>bulkDirect(ids,'archive'),true],['Concluir',()=>bulkDirect(ids,'done'),true],['Mover…',()=>moveManyDialog(ids),true],['Marcar como spam',()=>bulkDirect(ids,'spam'),true],['Adiar…',()=>openMessage(id).then(()=>state.current&&snoozeDialog(state.current)),single],['Acompanhamento…',()=>openMessage(id).then(()=>state.current&&followUpDialog(state.current,false)),single],['Separar',()=>Promise.allSettled(ids.map(messageId=>invoke('set_aside',{req:{id:messageId,on:true}}))).then(()=>loadMessages(null,false,{preserveScroll:true})),true],
  ['Criar tarefa',()=>openMessage(id).then(()=>state.current&&taskFromMessage(state.current)),single],['Criar evento',()=>openMessage(id).then(()=>state.current&&eventFromMessage(state.current)),single],['Exportar .eml',()=>invoke('export_message_eml',{id}),single],
  [state.folder===folderName('trash')?'Excluir definitivamente':'Excluir',()=>bulkDirect(ids,state.folder===folderName('trash')?'delete_permanent':'delete'),true]
 ].filter(a=>a[2]);
 const shortcutMap={'Abrir':'openMessage','Responder':'reply','Responder a todos':'replyAll','Encaminhar':'forward','Marcar como lida':'markRead','Marcar como não lida':'markUnread','Mover…':'move','Imprimir':'print','Encaminhar como .eml':'forwardAttachment','Não é spam':'notSpam','Acompanhamento…':'followUp'};menu.innerHTML=actions.map((a,i)=>{const sc=shortcutMap[a[0]];return `<button data-cm="${i}" ${/Excluir definitivamente/.test(a[0])?'class="dangerAction"':''}><span>${esc(a[0])}</span>${sc?`<kbd>${esc(shortcutTooltip(sc,state.boot.settings).replace(/^.*\((.*)\)$/,'$1'))}</kbd>`:''}</button>`}).join('');
 document.body.append(menu);$$('[data-cm]',menu).forEach(b=>b.onclick=()=>{const fn=actions[Number(b.dataset.cm)][1];removeContextMenu();fn()});setTimeout(()=>document.addEventListener('pointerdown',removeContextMenu,{once:true}),0)
}
function applyUnreadLocally(ids,unread){const set=new Set(ids.map(Number));for(const item of state.items){if(set.has(Number(item.id)))item.unread=!!unread}if(state.current&&set.has(Number(state.current.id)))state.current.unread=!!unread;renderVirtualRows();if(state.current&&set.has(Number(state.current.id)))renderReader(state.current)}
async function setBulkFlags(ids,changes){ids=[...new Set(ids.map(Number))];const hasUnread=changes.unread!==undefined&&changes.unread!==null;if(hasUnread)applyUnreadLocally(ids,changes.unread);const results=await Promise.allSettled(ids.map(id=>invoke('set_flags',{req:{id,unread:changes.unread??null,starred:changes.starred??null,pinned:changes.pinned??null,priority:changes.priority??null}})));if(results.some(r=>r.status==='rejected')){await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true,preserveSelection:true});showError('Uma ou mais mensagens não puderam ser atualizadas.')}else{refreshUnreadCounts().catch(()=>{})}}
function openBatchContextMenu(anchor){const r=anchor.getBoundingClientRect();openMessageContextMenu(r.left,r.bottom,state.focusId||[...state.selected][0])}
function removeContextMenu(e){if(e?.target?.closest?.('.contextMenu'))return;document.querySelector('.contextMenu')?.remove()}
async function openMessageFocused(id,{startMinimized=false}={}){
 const cached=state.items.find(x=>Number(x.id)===Number(id));
 try{cancelPreviewReadTimer();await markOpenedMessageRead(id);await openNativeReader(id,cached?.subject||'Mensagem');if(startMinimized)toast('A mensagem foi aberta em uma janela separada; use o GNOME para minimizá-la.')}catch(e){showError(e)}
}

function status(s){const e=$('#status');if(e)e.textContent=s}function showError(e){console.error(e);toast(`Erro: ${String(e)}`)}
async function openSavedSearches(){const items=await invoke('list_saved_searches');const {root,close}=modal('Pesquisas salvas',`${items.map(s=>`<button class="savedSearch" data-q="${esc(s.query)}"><b>${esc(s.name)}</b><small>${esc(s.query)}</small></button>`).join('')||'<p>Nenhuma pesquisa salva.</p>'}<hr><input id="ssName" placeholder="Nome"><input id="ssQuery" value="${esc(state.search)}" placeholder="Consulta"><button id="ssSave">Salvar atual</button>`);$$('.savedSearch',root).forEach(b=>b.onclick=()=>{state.search=b.dataset.q;close();loadMessages();renderMailView()});$('#ssSave',root).onclick=async()=>{await invoke('save_saved_search',{req:{name:$('#ssName',root).value,query:$('#ssQuery',root).value}});close()}}
async function openFolderManager(){
 if(!state.account)return toast('Escolha uma conta específica.');
 const tree=await invoke('list_folder_tree',{accountId:state.account});
 const byName=Object.fromEntries(tree.map(x=>[x.name,x]));
 const defaultDelimiter=tree.map(x=>x.delimiter).find(x=>x)||'/';
 const options=['<option value="">Raiz da conta</option>',...tree.filter(x=>x.selectable).map(x=>`<option value="${esc(x.name)}">${esc(x.name==='INBOX'?'Caixa de entrada (INBOX)':x.name)}</option>`)].join('');
 const {root,close}=modal('Pastas',`<div class="settingsTitle"><div><h2>Pastas IMAP</h2><p class="settingsPanelIntro">Crie pastas na raiz ou como subpastas. O TCS usa automaticamente o separador hierárquico informado pelo servidor.</p></div></div>${tree.map((f,i)=>`<div class="settingsRow"><span><b>${esc(f.display_name||f.name)}</b><small>${esc(f.name)}${f.subscribed?' · assinada':''}${!f.selectable?' · somente agrupador':''}</small></span><div><button data-fr="${i}">Renomear</button><button data-fu="${i}">Assinar</button><button data-fun="${i}">Cancelar assinatura</button><button data-fd="${i}">Excluir</button></div></div>`).join('')}<div class="folderCreateBox">${field('Criar dentro de',`<select id="folderParent">${options}</select>`)}${field('Nome da nova pasta','<input id="newFolder" placeholder="Ex.: Pessoal">')}<button id="createFolder" class="primary">Criar pasta</button></div>`);
 const parent=$('#folderParent',root);
 if(state.folder&&tree.some(x=>x.name===state.folder))parent.value=state.folder;
 else if(tree.some(x=>x.name==='INBOX'))parent.value='INBOX';
 $('#createFolder',root).onclick=async()=>{const leaf=$('#newFolder',root).value.trim();if(!leaf)return toast('Informe o nome da pasta.');const parentName=parent.value;const delimiter=(parentName?byName[parentName]?.delimiter:null)||defaultDelimiter||'/';if(delimiter&&leaf.includes(delimiter))return toast(`Use apenas o nome da nova pasta; o TCS adicionará "${delimiter}" automaticamente.`);const full=parentName?`${parentName}${delimiter}${leaf}`:leaf;try{await invoke('create_folder',{accountId:state.account,folder:full});await refreshFolders();close();renderShell();toast(`Pasta criada: ${full}`)}catch(e){toast(String(e))}};
 $$('[data-fr]',root).forEach(b=>b.onclick=async()=>{const oldName=tree[Number(b.dataset.fr)].name,newName=await promptDialog('Novo nome:',oldName,{title:'Renomear pasta'});if(newName&&newName!==oldName){await invoke('rename_folder',{accountId:state.account,oldName,newName});await refreshFolders();close();renderShell()}});
 $$('[data-fd]',root).forEach(b=>b.onclick=async()=>{const f=tree[Number(b.dataset.fd)].name;if(await confirmDialog(`Excluir a pasta ${f}?`,{danger:true,confirmLabel:'Excluir'})){await invoke('delete_folder',{accountId:state.account,folder:f});await refreshFolders();close();renderShell()}});
 $$('[data-fu]',root).forEach(b=>b.onclick=async()=>{const f=tree[Number(b.dataset.fu)].name;await invoke('set_folder_subscription',{accountId:state.account,folder:f,subscribed:true});toast('Pasta assinada.')});
 $$('[data-fun]',root).forEach(b=>b.onclick=async()=>{const f=tree[Number(b.dataset.fun)].name;await invoke('set_folder_subscription',{accountId:state.account,folder:f,subscribed:false});toast('Assinatura da pasta cancelada.')})
}
function activeMailIds(){const id=state.focusId||state.current?.id;const ids=state.selected.size?[...state.selected]:(id?[id]:[]);return ids.filter(mid=>!state.items.find(x=>x.id===mid)?.local_draft)}

async function openItemById(id,{focused=false}={}){
 const item=state.items.find(x=>x.id===id);
 if(item?.local_draft){if(focused)await openLocalDraft(item.local_draft_id);else await previewLocalDraft(item.local_draft_id);return}
 if(focused)await openMessageFocused(id);else await openMessage(id)
}
async function globalKeys(e){
 if(e.defaultPrevented)return;
 const tag=document.activeElement?.tagName?.toLowerCase(),editing=['input','textarea','select'].includes(tag)||document.activeElement?.isContentEditable;
 if(shortcutMatches(e,'settings',state.boot.settings)){e.preventDefault();openSettings(ctx);return}
 if(shortcutMatches(e,'commandCenter',state.boot.settings)){e.preventDefault();openCommandCenter();return}
 if(!editing&&shortcutMatches(e,'newMessage',state.boot.settings)){e.preventDefault();openComposer(ctx,{});return}
 if(editing){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r')e.preventDefault();return}
 if(shortcutMatches(e,'inbox',state.boot.settings)){e.preventDefault();goMail('INBOX');return}
 if(shortcutMatches(e,'outbox',state.boot.settings)){e.preventDefault();goView('outbound');return}
 if(shortcutMatches(e,'contacts',state.boot.settings)){e.preventDefault();goView('contacts');return}
 if(state.view!=='mail')return;
 if(['ArrowDown','ArrowUp','Home','End','PageUp','PageDown'].includes(e.key)){await onListKey(e);return}
 const ids=activeMailIds(),id=ids[0];
 if(shortcutMatches(e,'search',state.boot.settings)){e.preventDefault();$('#search')?.focus();return}
 if(shortcutMatches(e,'advancedSearch',state.boot.settings)){e.preventDefault();$('#search')?.focus();if($('#search')&&!$('#search').value)$('#search').placeholder='from:cliente subject:"contrato anual" is:unread has:attachment after:2026-01-01';return}
 if(shortcutMatches(e,'savedSearches',state.boot.settings)){e.preventDefault();openSavedSearches();return}
 if(shortcutMatches(e,'sync',state.boot.settings)){e.preventDefault();sync();return}
 if(!id)return;
 if(shortcutMatches(e,'openMessage',state.boot.settings)){e.preventDefault();openItemById(id,{focused:true});return}
 if(shortcutMatches(e,'markRead',state.boot.settings)){e.preventDefault();setBulkFlags(ids,{unread:false});return}
 if(shortcutMatches(e,'markUnread',state.boot.settings)){e.preventDefault();setBulkFlags(ids,{unread:true});return}
 if(shortcutMatches(e,'reply',state.boot.settings)){e.preventDefault();await openMessage(id);if(state.current)reply(state.current,false);return}
 if(shortcutMatches(e,'replyAll',state.boot.settings)){e.preventDefault();await openMessage(id);if(state.current)reply(state.current,true);return}
 if(shortcutMatches(e,'forward',state.boot.settings)){e.preventDefault();await openMessage(id);$('#forward')?.click();return}
 if(shortcutMatches(e,'forwardAttachment',state.boot.settings)){e.preventDefault();await openMessage(id);$('#forwardEml')?.click();return}
 if(shortcutMatches(e,'move',state.boot.settings)){e.preventDefault();await openMessage(id);if(state.current)moveDialog(state.current);return}
 if(shortcutMatches(e,'flag',state.boot.settings)){e.preventDefault();await openMessage(id);if(state.current)toggleFlag(state.current,'starred');return}
 if(shortcutMatches(e,'followUp',state.boot.settings)){e.preventDefault();await openMessage(id);if(state.current)followUpDialog(state.current,false);return}
 if(shortcutMatches(e,'print',state.boot.settings)){e.preventDefault();await openMessage(id);window.print();return}
 if(shortcutMatches(e,'properties',state.boot.settings)){e.preventDefault();await openMessage(id);if(state.current)openMessageProperties(state.current);return}
 if(shortcutMatches(e,'notSpam',state.boot.settings)&&state.folder===folderName('junk')){e.preventDefault();bulkDirect(ids,'restore');return}
 if(e.key==='Escape'&&!$('#overlayRootGlobal')?.innerHTML)return;
}
function openCommandCenter(){const actions=[['Nova mensagem',()=>openComposer(ctx,{})],['Caixa de entrada',()=>goMail('INBOX')],['Abrir Calendário',()=>goView('calendar')],['Nova tarefa',()=>{goView('tasks');setTimeout(()=>document.querySelector('#newTask')?.click(),0)}],['Novo evento',()=>{goView('calendar');setTimeout(()=>document.querySelector('#newEvent')?.click(),0)}],['Contatos',()=>goView('contacts')],['Follow-ups',()=>goView('followups')],['Envios',()=>goView('outbound')],['Configurações',()=>openSettings(ctx)]];const {root,close}=modal('Command Center',`<input id="cmdSearch" class="bigSearch" placeholder="Digite uma ação…"><div id="cmdItems">${actions.map((a,i)=>`<button data-cmd="${i}">${a[0]}</button>`).join('')}</div>`);$$('[data-cmd]',root).forEach(b=>b.onclick=()=>{close();actions[Number(b.dataset.cmd)][1]()});$('#cmdSearch',root).oninput=e=>$$('[data-cmd]',root).forEach((b,i)=>b.hidden=!actions[i][0].toLowerCase().includes(e.target.value.toLowerCase()));$('#cmdSearch',root).focus()}
function goMail(f){enterFolder(f)}function goView(v){state.listRequestSeq++;state.openRequestSeq++;state.view=v;renderShell()}

async function persistNavigationState(kind='all'){
 const jobs=[];
 if(kind==='all'||kind==='groups'){state.boot.settings.navigationGroups=JSON.stringify(state.navigationGroups);jobs.push(invoke('set_setting',{req:{key:'appearance.navigation_groups',value:state.boot.settings.navigationGroups}}))}
 if(kind==='all'||kind==='favorites'){state.boot.settings.folderFavorites=JSON.stringify(state.folderFavorites);jobs.push(invoke('set_setting',{req:{key:'appearance.folder_favorites',value:state.boot.settings.folderFavorites}}))}
 if(kind==='all'||kind==='hidden'){state.boot.settings.hiddenFolders=JSON.stringify(state.hiddenFolders);jobs.push(invoke('set_setting',{req:{key:'appearance.hidden_folders',value:state.boot.settings.hiddenFolders}}))}
 if(kind==='all'||kind==='subscribed'){state.boot.settings.subscribedOnly=state.subscribedOnly;jobs.push(invoke('set_setting',{req:{key:'appearance.subscribed_only',value:String(state.subscribedOnly)}}))}
 if(kind==='all'||kind==='expansion'){state.boot.settings.folderExpansion=JSON.stringify(state.folderExpansion);jobs.push(invoke('set_setting',{req:{key:'appearance.folder_expansion',value:state.boot.settings.folderExpansion}}))}
 if(kind==='all'||kind==='tab'){state.boot.settings.navigationTab=state.navigationTab;jobs.push(invoke('set_setting',{req:{key:'appearance.navigation_tab',value:state.navigationTab}}))}
 await Promise.allSettled(jobs)
}
function newGroupId(){return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}
function openNavigationGroupsManager(){
 let draft=state.navigationGroups.map(g=>({id:g.id,name:g.name,accountIds:[...g.accountIds]}));
 const draw=()=>{
   const {root,close}=modal('Grupos de contas',`<div class="settingsTitle"><div><h2>Grupos de contas</h2><p class="settingsPanelIntro">Cada grupo pode exibir uma Caixa de entrada combinada apenas das contas escolhidas.</p></div><button id="groupAdd" class="primary">Novo grupo</button></div><div id="groupRows">${draft.map((g,i)=>`<section class="groupEditor" data-group-edit="${i}"><div class="groupEditorHead"><input data-group-name="${i}" value="${esc(g.name)}" placeholder="Nome do grupo"><button data-group-delete="${i}" class="dangerAction">Excluir</button></div><div class="groupAccountChecks">${state.boot.accounts.map(a=>`<label><input type="checkbox" data-group-account="${i}:${a.id}" ${g.accountIds.includes(a.id)?'checked':''}> ${accountLabel(a)}</label>`).join('')}</div></section>`).join('')||'<p>Nenhum grupo criado. Você pode continuar usando as contas individualmente.</p>'}</div><footer class="modalActions"><button id="groupCancel">Cancelar</button><button id="groupSave" class="primary">Salvar grupos</button></footer>`,{wide:true,resizable:true,persistKey:'account-groups'});
   $('#groupAdd',root).onclick=()=>{draft.push({id:newGroupId(),name:`Grupo ${draft.length+1}`,accountIds:[]});close();draw()};
   $$('[data-group-delete]',root).forEach(b=>b.onclick=()=>{draft.splice(Number(b.dataset.groupDelete),1);close();draw()});
   $('#groupCancel',root).onclick=close;
   $('#groupSave',root).onclick=async()=>{
     $$('[data-group-name]',root).forEach(input=>{const i=Number(input.dataset.groupName);draft[i].name=input.value.trim()});
     draft.forEach((g,i)=>{g.accountIds=$$(`[data-group-account^="${i}:"]`,root).filter(x=>x.checked).map(x=>Number(x.dataset.groupAccount.split(':')[1]))});
     const names=new Set();for(const g of draft){if(!g.name)return toast('Todos os grupos precisam de nome.');const key=g.name.toLowerCase();if(names.has(key))return toast('Os nomes dos grupos precisam ser diferentes.');names.add(key)}
     state.navigationGroups=normalizeGroups(draft,state.boot.accounts);await persistNavigationState('groups');close();renderShell();toast('Grupos salvos.')
   }
 };
 draw()
}
function openFolderContextMenu(x,y,accountId,folder){
 if(!accountId||!folder)return;
 removeContextMenu();
 const favorite=isFavorite(state.folderFavorites,accountId,folder),hidden=isHidden(state.hiddenFolders,accountId,folder);
 const node=state.folderTree.find(f=>f.name===folder),subscribed=node?.subscribed!==false;
 const protectedFolders=new Set(['INBOX',folderName('sent'),folderName('drafts')].filter(Boolean));
 const hideAllowed=!protectedFolders.has(folder);
 const menu=document.createElement('div');menu.className='contextMenu';menu.style.left=`${Math.min(x,window.innerWidth-270)}px`;menu.style.top=`${Math.max(8,Math.min(y,window.innerHeight-330))}px`;
 menu.innerHTML=`<button id="folderFavorite">${favorite?'Remover dos favoritos':'Adicionar aos favoritos'}</button>${hideAllowed?`<button id="folderHide">${hidden?'Mostrar na navegação':'Ocultar da navegação'}</button>`:''}${node?`<button id="folderSubscription">${subscribed?'Cancelar assinatura IMAP':'Assinar pasta IMAP'}</button>`:''}<button id="folderManage">Organizar pastas…</button>`;
 document.body.append(menu);
 $('#folderFavorite',menu).onclick=async()=>{state.folderFavorites=toggleFolderRef(state.folderFavorites,accountId,folder,node?.display_name||folder);await persistNavigationState('favorites');removeContextMenu();renderShell()};
 $('#folderHide',menu)?.addEventListener('click',async()=>{state.hiddenFolders=toggleFolderRef(state.hiddenFolders,accountId,folder,node?.display_name||folder);await persistNavigationState('hidden');removeContextMenu();renderShell()});
 $('#folderSubscription',menu)?.addEventListener('click',async()=>{removeContextMenu();await invoke('set_folder_subscription',{accountId,folder,subscribed:!subscribed});await refreshFolders();renderShell();toast(!subscribed?'Pasta assinada.':'Assinatura da pasta cancelada.')});
 $('#folderManage',menu).onclick=()=>{removeContextMenu();openFolderOrganizer()};
 setTimeout(()=>document.addEventListener('pointerdown',removeContextMenu,{once:true}),0)
}
function openFolderOrganizer(){
 const account=state.boot.accounts.find(a=>a.id===state.account);
 const favorites=state.folderFavorites.map((f,i)=>({...f,i,account:state.boot.accounts.find(a=>a.id===f.accountId)})).filter(x=>x.account);
 const hidden=state.hiddenFolders.map((f,i)=>({...f,i,account:state.boot.accounts.find(a=>a.id===f.accountId)})).filter(x=>x.account);
 const tree=account?state.folderTree:[];
 const {root,close}=modal('Organizar pastas',`<div class="folderOrganizer">
 <h2>Organização da navegação</h2><label class="settingsToggle"><input id="onlySubscribed" type="checkbox" ${state.subscribedOnly?'checked':''}> Mostrar somente pastas IMAP inscritas</label>
 <h3>Favoritos</h3>${favorites.length?favorites.map(f=>`<div class="settingsRow"><span><b>${esc(f.label||f.folder)}</b><small>${accountLabel(f.account)} · ${esc(f.folder)}</small></span><div><button data-fav-up="${f.i}" title="Mover para cima">↑</button><button data-fav-down="${f.i}" title="Mover para baixo">↓</button><button data-fav-remove="${f.i}">Remover</button></div></div>`).join(''):'<p class="dim">Nenhuma pasta favorita.</p>'}
 <h3>Ocultas</h3>${hidden.length?hidden.map(f=>`<div class="settingsRow"><span><b>${esc(f.label||f.folder)}</b><small>${accountLabel(f.account)} · ${esc(f.folder)}</small></span><button data-hidden-remove="${f.i}">Mostrar novamente</button></div>`).join(''):'<p class="dim">Nenhuma pasta oculta.</p>'}
 ${account?`<h3>${accountLabel(account)} — pastas do servidor</h3>${tree.map((f,i)=>`<div class="settingsRow"><span><b>${esc(f.display_name||f.name)}</b><small>${esc(f.name)}${f.subscribed?' · inscrita':' · não inscrita'}</small></span><div><button data-org-fav="${i}">${isFavorite(state.folderFavorites,account.id,f.name)?'★ Favorita':'☆ Favoritar'}</button><button data-org-hide="${i}">${isHidden(state.hiddenFolders,account.id,f.name)?'Mostrar':'Ocultar'}</button><button data-org-sub="${i}">${f.subscribed?'Cancelar inscrição':'Assinar'}</button></div></div>`).join('')}`:'<p class="settingsPanelIntro">Selecione uma conta para administrar inscrições das pastas do servidor.</p>'}
 </div><footer class="modalActions"><button id="folderOrganizerClose" class="primary">Concluir</button></footer>`,{wide:true,resizable:true,persistKey:'folder-organizer'});
 $('#onlySubscribed',root).onchange=async e=>{state.subscribedOnly=e.target.checked;await persistNavigationState('subscribed');renderShell()};
 $$('[data-fav-up]',root).forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.favUp);if(i<=0)return;[state.folderFavorites[i-1],state.folderFavorites[i]]=[state.folderFavorites[i],state.folderFavorites[i-1]];await persistNavigationState('favorites');close();renderShell();openFolderOrganizer()});
 $$('[data-fav-down]',root).forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.favDown);if(i>=state.folderFavorites.length-1)return;[state.folderFavorites[i+1],state.folderFavorites[i]]=[state.folderFavorites[i],state.folderFavorites[i+1]];await persistNavigationState('favorites');close();renderShell();openFolderOrganizer()});
 $$('[data-fav-remove]',root).forEach(b=>b.onclick=async()=>{state.folderFavorites.splice(Number(b.dataset.favRemove),1);await persistNavigationState('favorites');close();renderShell();openFolderOrganizer()});
 $$('[data-hidden-remove]',root).forEach(b=>b.onclick=async()=>{state.hiddenFolders.splice(Number(b.dataset.hiddenRemove),1);await persistNavigationState('hidden');close();renderShell();openFolderOrganizer()});
 $$('[data-org-fav]',root).forEach(b=>b.onclick=async()=>{const f=tree[Number(b.dataset.orgFav)];state.folderFavorites=toggleFolderRef(state.folderFavorites,account.id,f.name,f.display_name||f.name);await persistNavigationState('favorites');close();renderShell();openFolderOrganizer()});
 $$('[data-org-hide]',root).forEach(b=>b.onclick=async()=>{const f=tree[Number(b.dataset.orgHide)];state.hiddenFolders=toggleFolderRef(state.hiddenFolders,account.id,f.name,f.display_name||f.name);await persistNavigationState('hidden');close();renderShell();openFolderOrganizer()});
 $$('[data-org-sub]',root).forEach(b=>b.onclick=async()=>{const f=tree[Number(b.dataset.orgSub)];await invoke('set_folder_subscription',{accountId:account.id,folder:f.name,subscribed:!f.subscribed});await refreshFolders();close();renderShell();openFolderOrganizer()});
 $('#folderOrganizerClose',root).onclick=close
}

async function setNavigationMode(mode,persist=true){
 mode=normalizeNavMode(mode);if(state.navigationMode===mode){renderShell();return}
 state.navigationMode=mode;state.selected.clear();state.focusId=null;state.selectionAnchor=null;state.current=null;state.activeGroupId=null;state.groupAccountIds.clear();
 if(mode==='unified'){state.account=null;state.folder='INBOX';state.folders=[];state.folderTree=[];state.roles={}}
 else if(mode==='groups'){state.account=null;state.folder='INBOX';state.folders=[];state.folderTree=[];state.roles={};if(state.navigationGroups.length){state.activeGroupId=state.navigationGroups[0].id;state.groupAccountIds=new Set(state.navigationGroups[0].accountIds)}else{state.activeGroupId='__all';state.groupAccountIds=new Set(state.boot.accounts.map(a=>a.id))}}
 else{state.account=state.account||state.boot.default_account_id||state.boot.accounts[0]?.id||null;state.folder='INBOX';state.roles={};state.folders=[];state.folderTree=[];}
 state.boot.settings.navigationStyle=mode;localStorage.setItem('tcs.navigationStyle',mode);renderShell();if(persist)await invoke('set_setting',{req:{key:'appearance.navigation_style',value:mode}}).catch(e=>toast('Não foi possível salvar o estilo de navegação: '+String(e)));if(!['unified','groups'].includes(mode))await refreshFolders().then(()=>renderShell()).catch(e=>toast('Não foi possível atualizar as pastas: '+String(e)));if(state.view==='mail')await loadMessages(null,false,{preserveScroll:false,preserveCurrent:false})
}
async function setCompact(v,persist=true){state.compact=v;if(persist)await invoke('set_setting',{req:{key:'appearance.sidebar_compact',value:String(v)}}).catch(()=>{});renderShell()}
function setTheme(v,persist=true){state.theme=v;document.documentElement.dataset.theme=v;window.dispatchEvent(new Event('tcs-theme-changed'));window.__TAURI__?.event?.emit?.('appearance-changed',{theme:v,density:state.density,composerTheme:state.boot.settings.composerTheme||'global'}).catch?.(()=>{});if(persist)invoke('set_setting',{req:{key:'appearance.theme',value:v}}).catch(()=>{})}
function setDensity(v,persist=true){const vp=$('#rowsViewport');const oldH=rowHeight();const anchorIndex=vp?Math.floor(vp.scrollTop/oldH):0;state.density=v;document.documentElement.dataset.density=v;window.__TAURI__?.event?.emit?.('appearance-changed',{theme:state.theme,density:v,composerTheme:state.boot.settings.composerTheme||'global'}).catch?.(()=>{});if(persist)invoke('set_setting',{req:{key:'appearance.message_density',value:v}}).catch(()=>{});renderVirtualRows();if(vp)vp.scrollTop=anchorIndex*rowHeight()}
async function recoverLocalDrafts(){await refreshLocalDrafts();const drafts=scopedLocalDrafts();if(!drafts.length)return;if(state.folder===folderName('drafts')||state.folder==='__DRAFTS')await loadMessages(null,false,{preserveScroll:true,preserveCurrent:true});}

async function previewLocalDraft(id){
 const record=state.localDrafts.find(d=>String(d.id)===String(id))||(await invoke('list_local_drafts').catch(()=>[])).find(d=>String(d.id)===String(id));
 if(!record){toast('Este rascunho não está mais disponível.');await refreshLocalDrafts();return}
 const seed=draftSeed(record);state.current=null;state.focusId=state.items.find(x=>x.local_draft&&String(x.local_draft_id)===String(id))?.id??state.focusId;
 const empty=$('#readerEmpty'),reader=$('#reader');if(empty)empty.hidden=true;if(!reader)return;
 reader.innerHTML=`<article class="draftPreview"><header class="readerHead"><div class="draftPreviewLabel">Rascunho</div><h1>${esc(seed.subject||'(sem assunto)')}</h1><div class="readerMetaLine">Para ${esc(seed.to||'—')}${seed.cc?` · Cc ${esc(seed.cc)}`:''}</div><div class="readerActions"><div class="readerPrimary"><button id="draftContinue" class="primaryAction">Continuar editando</button><button id="draftDiscardPreview" class="dangerAction">Descartar</button></div></div></header><div id="draftPreviewBody">${seed.htmlBody?`<iframe class="mailFrame draftPreviewFrame" sandbox="allow-popups" referrerpolicy="no-referrer"></iframe>`:`<pre class="body">${esc(seed.textBody||'(rascunho vazio)')}</pre>`}</div></article>`;
 const draftFrame=$('iframe',reader);if(draftFrame)draftFrame.srcdoc=sanitizeEmailHtml(seed.htmlBody,{allowRemote:false});
 $('#draftContinue',reader).onclick=()=>openLocalDraft(id);
 $('#draftDiscardPreview',reader).onclick=async()=>{if(!await confirmDialog('Descartar este rascunho?',{danger:true,confirmLabel:'Descartar'}))return;await invoke('delete_local_draft',{id});await refreshLocalDrafts();state.current=null;reader.innerHTML='';if(empty)empty.hidden=false;await loadMessages(null,false,{preserveScroll:true,preserveCurrent:false})};
 renderVirtualRows();$('#rowsViewport')?.focus({preventScroll:true});
}
function handleLocalDraftClick(e,item){if(e.shiftKey||e.ctrlKey||e.metaKey){handleSelectionClick(item.id,e);return}state.selected.clear();state.selected.add(item.id);state.focusId=item.id;state.selectionAnchor=item.id;renderVirtualRows();$('#rowsViewport')?.focus({preventScroll:true});previewLocalDraft(item.local_draft_id)}

async function openLocalDraft(id){
 const record=state.localDrafts.find(d=>String(d.id)===String(id))||(await invoke('list_local_drafts').catch(()=>[])).find(d=>String(d.id)===String(id));
 if(!record){toast('Este rascunho não está mais disponível.');await refreshLocalDrafts();return}
 openComposer(ctx,draftSeed(record));
}
function openLocalDraftContextMenu(x,y,item){
 removeContextMenu();
 const menu=document.createElement('div');menu.className='contextMenu';menu.style.left=`${Math.min(x,window.innerWidth-260)}px`;menu.style.top=`${Math.max(8,Math.min(y,window.innerHeight-260))}px`;
 menu.innerHTML=`<button id="draftOpen">Abrir rascunho</button><button id="draftSync">Sincronizar agora</button><button id="draftDiscard" class="dangerAction">Descartar</button>`;
 document.body.append(menu);
 $('#draftOpen',menu).onclick=()=>{removeContextMenu();openLocalDraft(item.local_draft_id)};
 $('#draftSync',menu).onclick=async()=>{removeContextMenu();try{await invoke('sync_local_draft',{id:item.local_draft_id});await refreshLocalDrafts();await loadMessages(null,false,{preserveScroll:true});toast('Rascunho sincronizado.')}catch(e){showError(e)}};
 $('#draftDiscard',menu).onclick=async()=>{removeContextMenu();if(!await confirmDialog('Descartar este rascunho local e sua cópia sincronizada?',{danger:true,confirmLabel:'Descartar'}))return;await invoke('delete_local_draft',{id:item.local_draft_id});await refreshLocalDrafts();renderShell();await loadMessages();};
 setTimeout(()=>document.addEventListener('pointerdown',removeContextMenu,{once:true}),0)
}
function openMailto(raw){try{const u=new URL(raw);openComposer(ctx,{to:decodeURIComponent(u.pathname||''),cc:u.searchParams.get('cc')||'',subject:u.searchParams.get('subject')||'',textBody:u.searchParams.get('body')||''})}catch(e){showError(`mailto inválido: ${e}`)}}

const nativeMode=nativeWindowRoute(location.search,window.__TAURI__?.window?.getCurrentWindow?.()?.label)?.kind;
if(nativeMode)import('./native_window.js').then(m=>m.initNativeWindow()).catch(showError);else init().catch(showError);
