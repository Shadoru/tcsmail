import assert from 'node:assert/strict';
import test from 'node:test';
import {moduleHarness,clone,deferred,flush} from './reader-config-083-harness.mjs';

async function reader({folder='INBOX',unread=false,html='<p>cached HTML</p>'}={}) {
  const detail=deferred(),roles=deferred(),permissions=deferred(),read=deferred();
  const cached={id:7,account_id:1,uid:42,folder,subject:'cached subject',from_email:'sender@synthetic.invalid',from_name:'Synthetic',body_text:'cached body',body_html:html,attachments:[],unread,starred:false,pinned:false,priority:false};
  const h=moduleHarness('frontend/native_window.js');
  let closed=0;h.context.window.__TAURI__.window.getCurrentWindow=()=>({destroy:async()=>{closed++;},onCloseRequested:fn=>{h.closeRequested=fn;}});
  h.context.invoke=async(command,args={})=>{
    h.calls.push([command,clone(args)]);
    if(command==='get_message_cached')return clone(cached);
    if(command==='get_message')return detail.promise;
    if(command==='folder_roles')return roles.promise;
    if(command==='remote_images_allowed'||command==='remote_images_domain_allowed')return permissions.promise;
    if(command==='set_flags'&&args.req.unread===false&&unread)return read.promise;
    if(command==='reply_context')return {to:'recipient@synthetic.invalid',cc:''};
    return null;
  };
  const started=h.context.initReader('7',{settings:{},accounts:[]});await flush();
  return Object.assign(h,{cached,detail,roles,permissions,read,started,closed:()=>closed,mutations:()=>h.calls.filter(([c])=>c==='message_action'),
    async settle(){roles.resolve({trash:'Deleted Items',junk:'Junk'});permissions.resolve(false);read.resolve();detail.resolve(clone(cached));await started;await flush();},
  });
}

test('P03 paints the cached subject and body before hydration, roles or marking-read finish',async()=>{
  const h=await reader({unread:true,html:''});
  assert.equal(h.calls[0][0],'get_message_cached');
  assert.match(h.$('app').innerHTML,/cached subject/);
  assert.match(h.$('app').innerHTML,/cached body/);
  assert.equal(h.$('nativeUnread').disabled,true);
  assert.equal(h.$('nativeDeleteQuick').disabled,true);
  await h.$('nativeDeleteQuick').emit('click');assert.equal(h.mutations().length,0);
  await h.settle();assert.equal(h.$('nativeUnread').disabled,false);
});

test('C07 both native delete buttons cancel permanent deletion without any mutation',async()=>{
  for(const button of ['nativeDeleteQuick','nativeTrash']){
    const h=await reader({folder:'Deleted Items'});await h.settle();h.setConfirm(async()=>false);
    await h.$(button).emit('click');
    assert.equal(h.prompts.length,1);assert.equal(h.prompts[0][1].danger,true);
    assert.equal(h.prompts[0][1].confirmLabel,'Excluir definitivamente');
    assert.equal(h.mutations().length,0);assert.equal(h.closed(),0);
  }
});

test('C07 confirmation submits one permanent delete; overlapping clicks cannot submit twice',async()=>{
  const h=await reader({folder:'Deleted Items'});await h.settle();const answer=deferred();h.setConfirm(()=>answer.promise);
  const first=h.$('nativeDeleteQuick').emit('click');await flush();await h.$('nativeTrash').emit('click');
  assert.equal(h.prompts.length,1);answer.resolve(true);await first;
  assert.deepEqual(h.mutations(),[['message_action',{req:{id:7,action:'delete_permanent',target:null}}]]);assert.equal(h.closed(),1);
});

test('ordinary deletion remains a move-to-trash action',async()=>{
  const h=await reader();await h.settle();await h.$('nativeDeleteQuick').emit('click');
  assert.equal(h.mutations()[0][1].req.action,'delete');assert.equal(h.prompts.length,0);
});

test('cancelling a confirmation after hydration re-enables both deletion buttons',async()=>{
  const h=await reader({folder:'Deleted Items'});h.roles.resolve({trash:'Deleted Items'});h.permissions.resolve(false);await flush();
  const answer=deferred();h.setConfirm(()=>answer.promise);const click=h.$('nativeDeleteQuick').emit('click');await flush();
  h.detail.resolve({...h.cached,body_text:'hydrated'});await h.started;await flush();assert.equal(h.$('nativeTrash').disabled,true);
  answer.resolve(false);await click;assert.equal(h.$('nativeTrash').disabled,false);assert.equal(h.$('nativeDeleteQuick').disabled,false);assert.equal(h.mutations().length,0);
});

test('C10 text, safe HTML and consented remote HTML buttons work after rerender',async()=>{
  const h=await reader();await h.settle();await h.$('nativeStar').emit('click');
  await h.$('nativeText').emit('click');assert.match(h.$('nativeReaderBody').innerHTML,/cached body/);
  await h.$('nativeHtml').emit('click');assert.match(h.$('nativeReaderBody').querySelector('iframe').srcdoc,/:false$/);
  await h.$('nativeHtmlRemote').emit('click');assert.match(h.$('nativeReaderBody').querySelector('iframe').srcdoc,/:true$/);
});

test('a late HTML preparation cannot replace a later text choice',async()=>{
  const h=await reader();await h.settle();const pending=deferred();h.context.emailHtmlForDisplay=()=>pending.promise;
  const html=h.$('nativeHtml').emit('click');await flush();await h.$('nativeText').emit('click');pending.resolve('stale HTML');await html;
  assert.equal(h.$('nativeReaderBody').querySelector('iframe'),null);assert.match(h.$('nativeReaderBody').innerHTML,/cached body/);
});

test('only the latest of two HTML preparations may paint',async()=>{
  const h=await reader();await h.settle();const pending=[];h.context.emailHtmlForDisplay=()=>{const d=deferred();pending.push(d);return d.promise;};
  const first=h.$('nativeHtml').emit('click');const second=h.$('nativeHtmlRemote').emit('click');await flush();
  pending[1].resolve('latest remote');await second;pending[0].resolve('stale safe');await first;
  assert.equal(h.$('nativeReaderBody').querySelector('iframe').srcdoc,'latest remote');
});

test('hydration preserves user flags and text mode instead of replaying old flags',async()=>{
  const h=await reader();h.roles.resolve({trash:'Deleted Items'});h.permissions.resolve(false);await flush();
  await h.$('nativeStar').emit('click');await h.$('nativeUnread').emit('click');await h.$('nativeText').emit('click');
  h.detail.resolve({...h.cached,body_text:'hydrated body',starred:false,unread:false});await h.started;await flush();
  assert.equal(h.$('nativeStar').classList.contains('active'),true);
  assert.equal(h.$('nativeUnread').textContent,'Marcar como lida');
  assert.match(h.$('nativeReaderBody').innerHTML,/hydrated body/);assert.equal(h.$('nativeReaderBody').querySelector('iframe'),null);
});

test('a mismatching IMAP identity is discarded and close invalidates all delayed UI writes',async()=>{
  const h=await reader();h.detail.resolve({...h.cached,uid:99,body_text:'wrong identity'});await flush();
  assert.doesNotMatch(h.$('nativeReaderBody').innerHTML,/wrong identity/);
  const before=h.$('app').innerHTML;h.closeRequested();h.roles.resolve({trash:'Deleted Items'});h.permissions.resolve(true);await h.started;await flush();
  assert.equal(h.$('app').innerHTML,before);assert.equal(h.mutations().length,0);
});

test('a delayed permission lookup cannot undo an explicit sender opt-in',async()=>{
  const h=await reader();await h.$('nativeAlwaysRemote').emit('click');await flush();
  h.permissions.resolve(false);h.roles.resolve({});h.detail.resolve(h.cached);await h.started;await flush();
  assert.match(h.$('nativeReaderBody').querySelector('iframe').srcdoc,/:true$/);
  assert.equal(h.$('nativeAlwaysRemote'),null);
});

test('role failure leaves cached reading available and deletion blocked',async()=>{
  const h=await reader();h.roles.reject(Error('synthetic role failure'));h.detail.reject(Error('synthetic offline'));h.permissions.resolve(false);await h.started;await flush();
  assert.match(h.$('app').innerHTML,/cached subject/);assert.equal(h.$('nativeTrash').disabled,true);
  assert.ok(h.toasts.some(t=>t.includes('identificar a pasta')));
});

test('native response and forward use the shared safe composer fragment',async()=>{
  const h=await reader({html:'<img src="https://synthetic.invalid/pixel">'});await h.settle();
  await h.$('nativeReply').emit('click');await h.$('nativeForward').emit('click');
  assert.equal(h.composers.length,2);
  for(const [,seed] of h.composers){assert.match(seed.htmlBody,/sanitized synthetic quote/);assert.doesNotMatch(seed.htmlBody,/synthetic.invalid\/pixel/);assert.equal(seed.accountId,1);}
});

async function settings(initial='composition',values={}) {
  const h=moduleHarness('frontend/views.js');h.values=new Map(Object.entries(values));h.delays=new Map();h.opened=[];
  h.context.invoke=async(command,args={})=>{
    h.calls.push([command,clone(args)]);
    if(command==='get_setting_value')return h.delays.has(args.key)?h.delays.get(args.key).promise:h.values.get(args.key)??null;
    if(command==='set_setting'){h.values.set(args.req.key,args.req.value);return null;}
    if(command==='list_folders')return ['INBOX'];if(command==='export_data_backup')return true;
    return [];
  };
  h.ctx={state:{account:1,folder:'INBOX',boot:{version:'synthetic',default_account_id:1,accounts:[{id:1,name:'A',email:'a@synthetic.invalid'},{id:2,name:'B',email:'b@synthetic.invalid'}],settings:{}}},openComposer:seed=>h.opened.push(clone(seed))};
  await h.context.openSettings(h.ctx,initial);return h;
}

test('C12 selecting account A writes only its reply surface override',async()=>{
  const h=await settings('composition',{'composition.reply_surface':'inline'});
  h.$('composeScope').value='1';await h.$('composeScope').emit('change');h.$('replySurfaceDefault').value='window';await h.$('replySurfaceDefault').emit('change');
  assert.equal(h.values.get('account.1.composition.reply_surface'),'window');assert.equal(h.values.get('composition.reply_surface'),'inline');
  h.$('composeScope').value='2';await h.$('composeScope').emit('change');assert.equal(h.$('replySurfaceDefault').value,'inline');
  h.$('composeScope').value='1';await h.$('composeScope').emit('change');assert.equal(h.$('replySurfaceDefault').value,'window');
});

test('the latest account selection wins even when the previous settings lookup is late',async()=>{
  const h=await settings('composition',{'composition.reply_surface':'inline','account.2.composition.reply_surface':'window'});
  const delayed=deferred();h.delays.set('account.1.composition.reply_surface',delayed);
  h.$('composeScope').value='1';const first=h.$('composeScope').emit('change');await flush();
  h.$('composeScope').value='2';await h.$('composeScope').emit('change');delayed.resolve('inline');await first;
  assert.equal(h.$('replySurfaceDefault').value,'window');
});

test('changing the global default updates fallback in the same dialog; test composer uses the selected account',async()=>{
  const h=await settings();h.$('replySurfaceDefault').value='window';await h.$('replySurfaceDefault').emit('change');
  h.$('composeScope').value='2';await h.$('composeScope').emit('change');assert.equal(h.$('replySurfaceDefault').value,'window');
  await h.$('openIndependentComposerTest').emit('click');assert.deepEqual(h.opened,[{__forceWindow:true,accountId:2}]);
});

test('the export UI and success message describe a mail database, its omissions and lack of automatic restore',async()=>{
  const h=await settings('importexport');
  assert.equal(h.$('exportBackup').textContent,'Exportar banco local de e-mails (sem senhas)');
  assert.match(h.$('settingsPanel').innerHTML,/ai\.db, anexos em arquivos nem a configuração completa de IA/);
  assert.match(h.$('settingsPanel').innerHTML,/Não há restauração automática/);
  await h.$('exportBackup').emit('click');assert.match(h.$('ioStatus').textContent,/Não há restauração automática/);assert.equal(h.toasts.at(-1),'Banco local de e-mails exportado.');
});

test('C11 saving and deleting contact groups both persist and reload without a shadowed function',async()=>{
  const h=moduleHarness('frontend/views.js');let groups=[[1,'Synthetic group',1]],loads=0;
  h.context.invoke=async(command,args={})=>{
    h.calls.push([command,clone(args)]);
    if(command==='list_contacts')return [{id:9,name:'Synthetic',email:'contact@synthetic.invalid'}];
    if(command==='list_contact_groups'){loads++;return clone(groups);}
    if(command==='contact_group_member_ids')return [9];
    if(command==='save_contact_group'){groups=[[1,args.name,1]];return 1;}
    if(command==='delete_contact_group'){groups=[];return null;}
    return null;
  };
  await h.context.renderContacts({});await h.$('contactGroups').emit('click');
  await h.modals.at(-1).root.querySelector('[data-ge]').emit('click');h.$('groupName').value='Renamed group';await h.$('groupSave').emit('click');
  assert.equal(loads,2);assert.equal(groups[0][1],'Renamed group');assert.equal(h.modals.at(-1).title,'Grupos de contatos');
  await h.modals.at(-1).root.querySelector('[data-gd]').emit('click');assert.equal(loads,3);assert.equal(groups.length,0);
  assert.deepEqual(h.calls.find(([c])=>c==='set_contact_group_members')[1],{groupId:1,contactIds:[9]});
});
