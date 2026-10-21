
(()=>{
 window.__TCS_BROWSER_HARNESS__=true;
 const qs=new URLSearchParams(location.search),caseName=window.__JOURNEY_CASE_OVERRIDE||qs.get('case')||'41';
 const K='tcs-journey-state-'+caseName;
 const persisted=JSON.parse(localStorage.getItem(K)||'{}');
 const now=Math.floor(Date.now()/1000);
 const accounts=[1,2,3].map(id=>({id,name:['Pessoal','Trabalho','Projeto'][id-1],email:['me@example.test','work@example.test','project@example.test'][id-1],imap_host:'imap.example.test',imap_port:993,smtp_host:'smtp.example.test',smtp_port:587,username:['me@example.test','work@example.test','project@example.test'][id-1],imap_security:'tls',smtp_security:'starttls',auth_method:'password',color:['#3584e4','#33a06f','#8b5cf6'][id-1]}));
 const defaults={
   sidebarCompact:false,theme:persisted.theme||'light',composerTheme:'global',density:'comfortable',listWidth:'390',navigationStyle:persisted.navigationStyle||'tree',
   unifiedAccounts:'1,2,3',navigationGroups:JSON.stringify([{id:'g-work',name:'Trabalho e Projeto',accountIds:[2,3]}]),
   folderFavorites:JSON.stringify([{accountId:1,folder:'INBOX/Pessoal',label:'Pessoal'}]),hiddenFolders:'[]',subscribedOnly:false,folderExpansion:'{}',navigationTab:'accounts',navAccountWidth:'150',
   smartInbox:true,spamConfirm:true,autoMarkRead:true,readDelayMs:'0',previewReadPolicy:'never',composeUndo:'5',composeFont:'Sans',composeSize:'11',composeSpellcheck:true,requestReceiptDefault:false,
   background:false,notificationsNewMail:true,notificationsCalendar:true,notificationsTasks:true,privacyRemoteImages:'ask',privacyBlockTracking:true,
   aiEnabled:true,aiValidated:true,ragEnabled:true,aiPreanalyzeReceived:false,aiAnalysisScope:'per_message',aiAuthorizedMailboxes:'[]',aiConsentNoticeSuppressed:false,
   calendarWorkDays:'1,2,3,4,5',calendarWorkStart:'09:00',calendarWorkEnd:'18:00',calendarMeetingBuffer:'15',calendarSuggestionStep:'15',calendarSuggestionHorizon:'14'
 };
 const settings={...defaults,...(persisted.settings||{})};
 let drafts=persisted.drafts||[];
 if(caseName==='native'&&!drafts.length){drafts=[{id:'native-test',account_id:1,draft_json:JSON.stringify({to:'alice@example.test',cc:'',bcc:'',subject:'Rascunho nativo',html:'<p>Corpo nativo</p>',text:'Corpo nativo',identityId:null,requestReadReceipt:false,followEnabled:false,followAt:'',scheduleEnabled:false,sendAt:'',undoSeconds:10,ccVisible:false,bccVisible:false,signatureId:null,noSignature:false,inReplyTo:null,references:null}),dirty:true,updated_ts:now}]}
 const messages=[
  {id:101,account_id:1,folder:'INBOX',uid:101,subject:'Primeira mensagem',from_name:'Alice',from_email:'alice@example.test',date_ts:now-60,snippet:'Mensagem um',unread:true,starred:false,pinned:false,priority:false,spam:false,has_attachments:false},
  {id:102,account_id:1,folder:'INBOX',uid:102,subject:'Segunda mensagem',from_name:'Bruno',from_email:'bruno@example.test',date_ts:now-30,snippet:'Mensagem dois',unread:false,starred:false,pinned:false,priority:false,spam:false,has_attachments:false},
  {id:201,account_id:1,folder:'Sent',uid:201,subject:'Resposta enviada',from_name:'Eu',from_email:'me@example.test',date_ts:now,snippet:'Resposta',unread:false,starred:false,pinned:false,priority:false,spam:false,has_attachments:false}
 ];
 const calls=[];
 function save(){localStorage.setItem(K,JSON.stringify({settings,drafts,theme:settings.theme,navigationStyle:settings.navigationStyle,calls}))}
 function detail(id){const m=messages.find(x=>x.id===Number(id));return m?{...m,to_text:'me@example.test',cc_text:'',body_text:`Corpo de ${m.subject}`,body_html:'',message_id:`<${m.id}@example.test>`,in_reply_to:'',references_text:'',attachments:[],calendar_ics:''}:null}
 const folders=['INBOX','INBOX/Pessoal','INBOX/Pessoal/Familia','Sent','Drafts','Archive','Junk','Trash'];
 const tree=folders.map(name=>({name,display_name:name.split('/').pop(),parent:name.includes('/')?name.split('/').slice(0,-1).join('/'):'',delimiter:'/',subscribed:true,selectable:true}));
 const roles={sent:'Sent',drafts:'Drafts',archive:'Archive',junk:'Junk',trash:'Trash'};
 const invoke=async(cmd,args={})=>{
  calls.push([cmd,JSON.parse(JSON.stringify(args||{}))]);save();
  switch(cmd){
   case'bootstrap':return {settings,accounts,default_account_id:1,compose_uri:null,open_message_id:null};
   case'list_folders':return folders;
   case'list_folder_tree':return tree;
   case'folder_unread_counts':return args.accountId===1?{INBOX:1}:{};
   case'list_accounts_full':return accounts;
   case'folder_roles':return roles;
   case'list_local_drafts':return drafts;
   case'list_messages':{
    const req=args.req||{},f=req.folder||'INBOX';let xs=messages.filter(m=>f==='*'||m.folder===f);
    if(req.accountId)xs=xs.filter(m=>m.account_id===Number(req.accountId));
    if(Array.isArray(req.accountIds)&&req.accountIds.length)xs=xs.filter(m=>req.accountIds.map(Number).includes(m.account_id));
    return {items:xs,next_cursor:null,total:xs.length}
   }
   case'get_message':return detail(args.id);
   case'remote_images_allowed':case'remote_images_domain_allowed':return false;
   case'reply_context':{const m=detail(args.id);return {to:m.from_email,cc:'',in_reply_to:m.message_id,references:m.message_id}}
   case'list_identities':case'list_signatures':case'list_templates':return [];
   case'list_system_fonts':return ['Sans','Serif','Monospace'];
   case'select_signature':return null;
   case'list_draft_attachments':return [];
   case'recipient_suggestions':return [];
   case'save_local_draft':{
      const i=drafts.findIndex(d=>d.id===args.id);const row={id:args.id,account_id:Number(args.accountId),draft_json:args.draftJson,dirty:true,updated_ts:now};
      if(i>=0)drafts[i]=row;else drafts.unshift(row);save();return null
   }
   case'sync_local_draft':{const d=drafts.find(x=>x.id===args.id);if(d)d.dirty=false;save();return null}
   case'delete_local_draft':drafts=drafts.filter(x=>x.id!==args.id);save();return null;
   case'queue_send':return 9001;
   case'close_mail_window':document.body.dataset.nativeClosed='1';return null;
   case'cancel_outbound':case'process_outbound':return null;
   case'set_flags':case'message_action':return null;
   case'save_account':{const req=args.req||{},id=Number(req.id)||Math.max(...accounts.map(a=>a.id))+1;let a=accounts.find(x=>x.id===id);if(!a){a={id};accounts.push(a)}Object.assign(a,{name:req.name,email:req.email,imap_host:req.imapHost,imap_port:req.imapPort,smtp_host:req.smtpHost,smtp_port:req.smtpPort,username:req.username,imap_security:req.imapSecurity,smtp_security:req.smtpSecurity,color:req.color||a.color||'#3584e4',auth_method:a.auth_method||'password'});return id;}
   case'get_setting_value':return settings[args.key]??null;
   case'set_setting':settings[({ 'appearance.theme':'theme','appearance.composer_theme':'composerTheme','appearance.navigation_style':'navigationStyle','mail.unified_accounts':'unifiedAccounts' })[args.req?.key]||args.req?.key]=args.req?.value;save();return null;
   case'set_background_enabled':settings.background=!!args.enabled;save();return null;
   case'list_saved_searches':case'list_rules':case'list_calendars':case'list_calendar_sources':case'list_tasks':case'list_contacts':case'list_contact_sources':case'list_follow_ups':case'list_outbound':return [];
   case'ai_runtime_probe':return {available:true,degraded:false,runtime:'rust-integrated',detail:'Runtime Rust integrado',providers:[{id:'local',name:'Local',kind:'openai_compatible',endpoint:'http://127.0.0.1:9292',enabled:true,api_version:'',project:'',region:''}],rag:{collections:1,sources:0,chunks:0},can_use_mail:true};
   case'get_ai_settings':return {enabled:true,endpoint:'http://127.0.0.1:9292',fast_model:'fast',advanced_model:'advanced',embeddings_model:'embedding',rag_enabled:true};
   case'ai_get_runtime_config':return {enabled:true,rag_enabled:true,fast:{provider_id:'local',model:'fast'},advanced:{provider_id:'local',model:'advanced'},embedding:{provider_id:'local',model:'embedding'},analysis_scope:'none',preanalyze_received:false,shadow_mode:true};
   case'ai_providers':return [{id:'local',name:'Local',kind:'openai_compatible',endpoint:'http://127.0.0.1:9292',enabled:true,api_version:'',project:'',region:''}];
   case'ai_list_models':return ['fast','advanced','embedding'];
   case'ai_authorization_status':return {allowed:true,mode:'per_message',notice_suppressed:true,account_id:1,folder:'INBOX',reason:'test'};
   case'ai_rag_search':return {query:args.query,items:[]};
   case'ai_suggest_reply':return {suggested_reply:'Resposta sugerida',sources:[],warnings:[]};
   case'save_ai_settings':case'ai_update_privacy_policy':case'ai_save_runtime_config':case'ai_save_provider':case'ai_delete_provider':return null;
   case'ai_collections':case'ai_rag_sources':return [];
   case'ai_rag_status':return {runtime:'rust-integrated',collections:1,sources:0,chunks:0};
   case'ai_rag_reindex':return {ok:true,results:[]};
   case'ai_rag_clear_index':case'ai_clear_history':return {ok:true};
   case'ai_add_collection':case'ai_delete_collection':case'ai_rag_add_source':case'ai_rag_delete_source':return {ok:true};
   case'workspace_list':return [];
   default:
     if(cmd.startsWith('get_')||cmd.startsWith('diagnostics'))return {};
     return null;
  }
 };
 window.__TCS_JOURNEY__={caseName,calls,getDrafts:()=>drafts,getSettings:()=>settings,save};
 const listeners=new Map();
 const currentWindow={
   onCloseRequested:async cb=>{window.__TCS_NATIVE_CLOSE_HANDLER__=cb;return()=>{}},
   setTitle:async title=>{document.body.dataset.nativeTitle=String(title)},
   close:async()=>{document.body.dataset.nativeClosed='1'},
   destroy:async()=>{document.body.dataset.nativeDestroyed='1';document.body.dataset.nativeClosed='1'}
 };
 window.__TAURI__={core:{invoke},window:{getCurrentWindow:()=>currentWindow},event:{listen:async(name,cb)=>{const xs=listeners.get(name)||[];xs.push(cb);listeners.set(name,xs);return()=>listeners.set(name,(listeners.get(name)||[]).filter(x=>x!==cb))},emit:async(name,payload)=>{for(const cb of listeners.get(name)||[])await cb({payload})}}};
})();
