import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {decodeMailboxLabel,moveFolderChoices} from '../../frontend/folder_move.js';
import {folderDisplayLabel,folderReferenceLabel} from '../../frontend/folder_labels.js';

// Synthetic names only. These tests never invoke Tauri, IMAP, or a user database.
const raw='00 - Seguran&AOc-a e Contas';
const display='00 - Segurança e Contas';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source=name=>fs.readFileSync(new URL(`../../frontend/${name}`,import.meta.url),'utf8');
const shifted=text=>'&'+Buffer.from(text,'utf16le').swap16().toString('base64').replaceAll('/',',').replace(/=+$/,'')+'-';
function assertOption(html,value,label) {
  const option=[...html.matchAll(/<option\b([^>]*)>(.*?)<\/option>/gs)]
    .find(match=>match[1].match(/\bvalue="([^"]*)"/)?.[1]===esc(value));
  assert.ok(option,`Missing raw option value: ${value}`);
  assert.equal(option[2],esc(label));
  return option[1];
}

test('screenshot name and Unicode planes decode once',()=>{
  assert.equal(decodeMailboxLabel(raw),display);
  for(const text of ['Ação','日本語','台北','😀','𝄞','\uFEFF','\uFFFE','e\u0301'])
    assert.equal(decodeMailboxLabel(shifted(text)),text,JSON.stringify(text));
  assert.equal(decodeMailboxLabel('Literal &-AOc-'),'Literal &AOc-');
  assert.equal(decodeMailboxLabel('R&-D &- Testes'),'R&D & Testes');
  assert.equal(decodeMailboxLabel('Ação & sem hífen'),'Ação & sem hífen');
});

test('malformed fragments, controls, and noncanonical base64 stay visible unchanged',()=>{
  for(const value of ['&garbage','&bad&AOc-','&AOf-','&AAA-','&AB8-','&AH8-','&AIA-','&AIE-','&AJ8-',
    '&2AA-','&3AA-','&AA-','&A-','&AO c-','&AOc==-'])
    assert.equal(decodeMailboxLabel(value),value,value);
  assert.equal(decodeMailboxLabel('&bad&AOc- &AO0-'),'&bad&AOc- í');
  // Match the Rust decoder's compatibility with standard base64 and padding.
  assert.equal(decodeMailboxLabel('&AOc=-'),'ç');
  assert.equal(decodeMailboxLabel('&//4-'),'\uFFFE');
});

test('move choices trust backend display_name without double decoding literals',()=>{
  const tree=[
    {name:'Root',display_name:'Raiz',selectable:false},
    {name:'Root/'+raw,parent:'Root',delimiter:'/',display_name:display},
    {name:'Literal &-AOc-',display_name:'Literal &AOc-'},
    {name:'Literal &--',display_name:'Literal &-'},
  ];
  const before=JSON.stringify(tree),choices=moveFolderChoices(tree);
  assert.equal(choices.find(x=>x.value==='Root/'+raw)?.label,'Raiz / '+display);
  assert.equal(choices.find(x=>x.value==='Literal &-AOc-')?.label,'Literal &AOc-');
  assert.equal(choices.find(x=>x.value==='Literal &--')?.label,'Literal &-');
  assert.equal(JSON.stringify(tree),before,'display must not mutate protocol data');
});

test('import/export renders decoded option labels and retains the raw selected folder',async()=>{
  const code=source('views.js');
  const body=code.match(/const loadFolders=async\(\)=>\{[^\n]+(?=;\s*\n)/)?.[0];
  assert.ok(body,'import/export folder loader must be available');
  const accountSel={value:'7'},events=[],folderSel={dispatchEvent:e=>events.push(e.type)};
  const ctx={state:{account:7,folder:raw}},p={};
  const calls=[];
  const sandbox={accountSel,folderSel,ctx,p,esc,decodeMailboxLabel,Event,
    $:()=>accountSel,invoke:async(cmd,args)=>{calls.push([cmd,args]);return ['INBOX',raw,'Literal &-AOc-'];}};
  await vm.runInNewContext(body+';loadFolders()',sandbox);
  assert.match(assertOption(folderSel.innerHTML,raw,display),/\bdata-i18n-skip\b/);
  assertOption(folderSel.innerHTML,'Literal &-AOc-','Literal &AOc-');
  assert.equal(folderSel.value,raw);
  const argsCode=code.match(/const args=\(\)=>\(\{accountId:Number\(accountSel.value\),folder:folderSel.value\|\|'INBOX'\}\)/)?.[0];
  assert.ok(argsCode);
  assert.equal(vm.runInNewContext(argsCode+';args()',sandbox).folder,raw);
  assert.deepEqual(structuredClone(calls),[['list_folders',{accountId:7}]]);
  assert.deepEqual(events,['tcs-select-refresh']);
});

test('folder and persisted reference labels distinguish raw IDs from decoded literals',()=>{
  assert.equal(folderDisplayLabel({name:raw}),display);
  assert.equal(folderDisplayLabel({name:'Root.'+raw,delimiter:'.'}),display);
  assert.equal(folderDisplayLabel({name:'Root::'+raw,delimiter:'::'}),display);
  assert.equal(folderDisplayLabel({name:raw,display_name:'Nome personalizado'}),'Nome personalizado');
  assert.equal(folderDisplayLabel({name:'Literal &-AOc-',display_name:'Literal &AOc-'}),'Literal &AOc-');
  assert.equal(folderDisplayLabel({name:raw,display_name:''}),display);
  assert.equal(folderDisplayLabel({name:'Root',delimiter:'::'}),'Root');
  assert.equal(folderDisplayLabel(null),'');
  assert.equal(folderReferenceLabel({folder:raw,label:raw}),display);
  assert.equal(folderReferenceLabel({folder:raw}),display);
  assert.equal(folderReferenceLabel({folder:'Literal &-AOc-',label:'Literal &AOc-'}),'Literal &AOc-');
  assert.equal(folderReferenceLabel({folder:raw,label:'Meu rótulo'}),'Meu rótulo');
});

test('hierarchy fallback keeps namespaces, literal ampersands, case, and raw ID collisions',()=>{
  const tree=[
    {name:'Root/'+raw,delimiter:'/'},
    {name:'Missing/Ancestor/'+raw,delimiter:'/'},
    {name:'Parent',display_name:'Pai',selectable:false},
    {name:'Parent.Literal &-AOc-',delimiter:'.',display_name:'Literal &AOc-'},
    {name:'Parent::'+raw,delimiter:'::'},
    {name:'A',parent:'B'},{name:'B',parent:'A'},
    {name:'Work'},{name:'work'},
    {name:'Ação'},{name:'A&AMA-&AOc-&AOM-o'},
  ];
  const choices=moveFolderChoices(tree),label=id=>choices.find(x=>x.value===id)?.label;
  assert.equal(label('Root/'+raw),'Root / '+display);
  assert.equal(label('Missing/Ancestor/'+raw),'Missing / Ancestor / '+display);
  assert.equal(label('Parent.Literal &-AOc-'),'Pai / Literal &AOc-');
  assert.equal(label('Parent::'+raw),'Pai / '+display);
  for(const id of ['Work','work','Ação','A&AMA-&AOc-&AOM-o'])assert.ok(choices.some(x=>x.value===id));
  assert.ok(label('A').length<100,'malformed cycles must terminate');
});

test('folder navigation labels decode but protocol data attributes remain raw',()=>{
  const code=source('main.js');
  const start=code.indexOf('function folderNodeHtml('),end=code.indexOf('function inboxTreeHtml(',start);
  assert.ok(start>=0&&end>start);
  const sandbox={esc,decodeMailboxLabel,folderDisplayLabel,
    state:{account:7,folder:raw,view:'mail'},folderChildren:()=>[],folderIsExpanded:()=>false,
    unreadBadge:()=>'',unreadCount:()=>0,isFavorite:()=>false};
  const node={name:raw,selectable:true,subscribed:true};
  sandbox.node=node;
  const html=vm.runInNewContext(code.slice(start,end)+';folderNodeHtml(node)',sandbox);
  assert.ok(html.includes(`<b data-i18n-skip>${display}</b>`));
  assert.ok(html.includes(`title="${display}"`));
  assert.ok(html.includes(`data-folder="${esc(raw)}"`));
  assert.ok(html.includes(`data-unread-folder="${esc(raw)}"`));
  assert.equal(node.name,raw);
});

test('folder management displays decoded paths while delete/create keep exact IDs',async()=>{
  const code=source('main.js');
  const start=code.indexOf('async function openFolderManager('),end=code.indexOf('function activeMailIds(',start);
  assert.ok(start>=0&&end>start);
  const tree=[
    {name:'Root',display_name:'Raiz',selectable:false},
    {name:'Root/'+raw,parent:'Root',delimiter:'/',display_name:display,selectable:true},
    {name:'Literal &-AOc-',display_name:'Literal &AOc-',selectable:true},
  ];
  const controls={'#folderParent':{},'#newFolder':{value:'Literal &AOc-'},'#createFolder':{}};
  const deletion={dataset:{fd:'1'}},calls=[],prompts=[],notices=[],dialogs=[];
  const sandbox={esc,decodeMailboxLabel,folderDisplayLabel,moveFolderChoices,tree,
    state:{account:7,folder:'Root/'+raw},$:id=>controls[id],
    $$:id=>id==='[data-fd]'?[deletion]:[],
    field:(label,html)=>html,modal:(title,html)=>{dialogs.push(html);return {root:{},close:()=>{}};},
    invoke:async(cmd,args)=>{calls.push([cmd,args]);return cmd==='list_folder_tree'?tree:undefined;},
    confirmDialog:async message=>{prompts.push(message);return true;},
    refreshFolders:async()=>{},renderShell:()=>{},toast:message=>notices.push(message)};
  await vm.runInNewContext(code.slice(start,end)+';openFolderManager()',sandbox);
  assert.match(assertOption(dialogs[0],'Root/'+raw,'Raiz / '+display),/\bdata-i18n-skip\b/);
  assertOption(dialogs[0],'Literal &-AOc-','Literal &AOc-');
  assert.equal(controls['#folderParent'].value,'Root/'+raw);
  await deletion.onclick();
  assert.equal(prompts[0],`Excluir a pasta Root/${display}?`);
  assert.equal(calls.find(([cmd])=>cmd==='delete_folder')[1].folder,'Root/'+raw);
  await controls['#createFolder'].onclick();
  assert.equal(calls.find(([cmd])=>cmd==='create_folder')[1].folder,'Root/'+raw+'/Literal &AOc-');
  assert.equal(notices[0],`Pasta criada: Root/${display}/Literal &AOc-`);
});

test('native move labels decode while message_action retains the exact raw destination',async()=>{
  const body=source('native_window.js').match(/const moveDialog=async\(\)=>\{[^\n]+/)?.[0];
  assert.ok(body);
  const controls={'#nativeMoveFolder':{value:raw},'#nativeMoveGo':{}},calls=[],dialogs=[];
  await vm.runInNewContext(body+';moveDialog()',{
    m:{id:42,account_id:7},esc,decodeMailboxLabel,$:id=>controls[id],
    invoke:async(command,args)=>{calls.push([command,args]);return [raw,'Composição'];},
    modal:(title,html)=>{dialogs.push(html);return {root:{},close:()=>{}};},closeReader:async()=>{},
  });
  assertOption(dialogs[0],raw,display);
  assert.match(dialogs[0],/<option[^>]*data-i18n-skip[^>]*>Composição<\/option>/);
  await controls['#nativeMoveGo'].onclick();
  const request=calls.find(([command])=>command==='message_action')[1].req;
  assert.equal(request.target,raw);
  assert.equal(request.action,'move');
});

test('move rule summary decodes only its label; editor and saved action_value remain raw',async()=>{
  const code=source('views.js'),start=code.indexOf("if(kind==='rules')"),end=code.indexOf("if(kind==='searches')",start);
  assert.ok(start>=0&&end>start);
  const items=[{id:1,name:'Synthetic rule',field:'from',pattern:'synthetic',action:'move',action_value:raw,enabled:true},
    {id:2,name:'Other action',field:'subject',pattern:'synthetic',action:'star',action_value:'&AOc-'}];
  const controls={},editButton={dataset:{re:'1'}},p={},calls=[];
  const $=id=>controls[id]??=( {value:'',checked:false} );
  await vm.runInNewContext('(async()=>{'+code.slice(start,end)+'})()',{
    kind:'rules',p,esc,decodeMailboxLabel,$,$$:id=>id==='[data-re]'?[editButton]:[],
    invoke:async(command,args)=>{calls.push([command,args]);return items;},
    field:(label,html)=>html,modal:()=>({root:{},close:()=>{}}),page:()=>{},
  });
  assert.ok(p.innerHTML.includes(`<span data-i18n-skip>${display}</span>`),p.innerHTML);
  assert.ok(p.innerHTML.includes('star &amp;AOc-'),'other action values must not be decoded');
  editButton.onclick();
  assert.equal(controls['#rv'].value,raw);
  await controls['#rs'].onclick();
  assert.equal(calls.find(([command])=>command==='save_rule')[1].req.action_value,raw);
  assert.equal(items[0].action_value,raw);
});

test('AI authorized mailbox list decodes raw IDs without changing saved references',()=>{
  const body=source('ai_settings.js').match(/const refreshMailboxes=\(\)=>\{[^\n]+/)?.[0];
  assert.ok(body);
  const mailboxes=[{accountId:7,folder:raw},{accountId:7,folder:'Literal &-AOc-'}];
  const before=JSON.stringify(mailboxes),controls={aiMailboxScope:{},aiScope:{value:'mailbox'},aiMailboxList:{}};
  vm.runInNewContext(body+';refreshMailboxes()',{
    mailboxes,moveFolderChoices,esc,tx:esc,ctx:{state:{boot:{accounts:[{id:7,name:'Synthetic'}]}}},
    p:{querySelectorAll:()=>[]},$:id=>controls[id],
  });
  assert.ok(controls.aiMailboxList.innerHTML.includes('Synthetic · '+display));
  assert.ok(controls.aiMailboxList.innerHTML.includes('Synthetic · Literal &amp;AOc-'));
  assert.equal(JSON.stringify(mailboxes),before);
});

// Execute the actual AI loader with synthetic controls and deferred responses.
// No provider request, server connection, or real settings render is performed.
function mailboxHarness() {
  const code=source('ai_settings.js');
  const loader=code.match(/const loadFolders=async\(\)=>\{[^\n]+/)?.[0];
  assert.ok(loader,'AI mailbox loader must be available');
  const controls={aiMailboxAccount:{value:'1'},aiMailboxFolder:{innerHTML:'initial'},aiMailboxAdd:{disabled:false}};
  const p={isConnected:true},pending=[],messages=[];
  const sandbox={p,moveFolderChoices,esc,$:id=>controls[id],status:message=>messages.push(message),
    options:vm.runInNewContext(code.match(/const options = [^\n]+/)[0]+';options',{esc}),
    invoke:(command,args)=>{
      assert.equal(command,'list_folder_tree');
      return new Promise((resolve,reject)=>pending.push({accountId:args.accountId,resolve,reject}));
    }};
  const load=vm.runInNewContext('let mailboxEpoch=0;'+loader+';loadFolders',sandbox);
  return {load,controls,p,pending,messages};
}

test('AI mailboxEpoch discards older account success and preserves current Unicode/raw options',async()=>{
  const h=mailboxHarness(),first=h.load();
  h.controls.aiMailboxAccount.value='2';
  const second=h.load();
  assert.equal(h.controls.aiMailboxAdd.disabled,true);
  assert.deepEqual(h.pending.map(x=>x.accountId),[1,2]);
  h.pending[1].resolve([{name:raw,display_name:display},{name:'Literal &-AOc-',display_name:'Literal &AOc-'}]);
  await second;
  const current=h.controls.aiMailboxFolder.innerHTML;
  assertOption(current,raw,display);
  assertOption(current,'Literal &-AOc-','Literal &AOc-');
  assert.equal(h.controls.aiMailboxAdd.disabled,false);
  h.pending[0].resolve([{name:'Old account'}]);
  await first;
  assert.equal(h.controls.aiMailboxFolder.innerHTML,current);
  assert.equal(h.controls.aiMailboxAdd.disabled,false);
});

test('AI mailboxEpoch discards older account failures after the current account succeeds',async()=>{
  const h=mailboxHarness(),first=h.load();
  h.controls.aiMailboxAccount.value='2';
  const second=h.load();
  h.pending[1].resolve([{name:raw}]);
  await second;
  const current=h.controls.aiMailboxFolder.innerHTML;
  h.pending[0].reject(new Error('synthetic old account failure'));
  await first;
  assert.equal(h.controls.aiMailboxFolder.innerHTML,current);
  assert.deepEqual(h.messages,[],'stale errors must not replace status for the current account');
});

test('AI mailbox responses cannot update a disconnected settings panel',async()=>{
  for(const failure of [false,true]) {
    const h=mailboxHarness(),loading=h.load();
    h.p.isConnected=false;
    if(failure)h.pending[0].reject(new Error('synthetic detached failure'));
    else h.pending[0].resolve([{name:raw}]);
    await loading;
    assert.equal(h.controls.aiMailboxFolder.innerHTML,'initial');
    assert.equal(h.controls.aiMailboxAdd.disabled,true);
    assert.deepEqual(h.messages,[]);
  }
});
