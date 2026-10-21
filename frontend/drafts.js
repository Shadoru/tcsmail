
export function stableDraftId(raw){
  const text=String(raw||'');
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  const n=(hash>>>0)%2000000000;
  return -(n+1);
}

export function parseDraftPayload(record){
  let payload={};
  try{payload=JSON.parse(record?.draft_json||'{}')||{}}catch{}
  return {
    id:String(record?.id||''),
    accountId:Number(record?.account_id)||0,
    dirty:Boolean(record?.dirty),
    updatedTs:Number(record?.updated_ts)||0,
    serverUid:record?.server_uid==null?null:Number(record.server_uid),
    payload
  };
}

export function draftSeed(record){
  const d=parseDraftPayload(record),p=d.payload||{};
  return {
    draftId:d.id,
    accountId:d.accountId,
    to:p.to||'',
    cc:p.cc||'',
    bcc:p.bcc||'',
    subject:p.subject||'',
    htmlBody:p.html||'',
    textBody:p.text||'',
    identityId:p.identityId??p.identity_id??null,
    customFromName:p.customFromName||p.custom_from_name||'',
    customFromEmail:p.customFromEmail||p.custom_from_email||'',
    requestReadReceipt:!!p.requestReadReceipt,
    followEnabled:!!p.followEnabled,
    followAt:p.followAt||'',
    scheduleEnabled:!!p.scheduleEnabled,
    sendAt:p.sendAt||'',
    undoSeconds:p.undoSeconds||null,
    ccVisible:!!(p.ccVisible||p.cc),
    bccVisible:!!(p.bccVisible||p.bcc),
    signatureId:p.signatureId??null,
    noSignature:!!p.noSignature,
    inReplyTo:p.inReplyTo||p.in_reply_to||null,
    references:p.references||null,
    attachMessageId:p.attachMessageId??null,
    sourceMessageId:p.sourceMessageId??p.source_message_id??null,
    composeFormat:p.composeFormat||p.compose_format||'',
    restoredLocalDraft:!p._freshNative,
    draftDirty:d.dirty
  };
}

export function draftRow(record,accounts=[]){
  const d=parseDraftPayload(record),p=d.payload||{};
  const account=accounts.find(a=>Number(a.id)===d.accountId)||{};
  const text=String(p.text||'').replace(/\s+/g,' ').trim();
  return {
    id:stableDraftId(d.id),
    local_draft:true,
    local_draft_id:d.id,
    local_draft_dirty:d.dirty,
    local_draft_server_uid:d.serverUid,
    account_id:d.accountId,
    folder:'__LOCAL_DRAFT__',
    uid:0,
    subject:p.subject||'(sem assunto)',
    from_name:account.name||account.email||'Rascunho',
    from_email:account.email||'',
    to_text:p.to||p.to_text||'',
    date_ts:d.updatedTs,
    snippet:text.slice(0,180),
    unread:false,
    starred:false,
    pinned:false,
    priority:false,
    spam:false,
    has_attachments:Boolean(record?.has_attachments),
    smart_category:'Rascunho'
  };
}

export function localDraftsForScope(records,{navigationMode='tree',account=null,accountIds=[]}={}){
  const ids=new Set((accountIds||[]).map(Number));
  return (records||[]).filter(r=>{
    const aid=Number(r.account_id);
    if(account!=null)return aid===Number(account);
    if(ids.size)return ids.has(aid);
    return true;
  });
}

function norm(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').trim()}

function tokens(raw){
 const out=[];let cur='',quote=false;
 for(const ch of String(raw||'')){if(ch==='"'){quote=!quote;continue}if(/\s/.test(ch)&&!quote){if(cur){out.push(cur);cur=''}}else cur+=ch}
 if(cur)out.push(cur);return out
}
export function filterLocalDrafts(records,query){
 const ts=tokens(query).filter(t=>!/^tcs-sort:/i.test(t));if(!ts.length)return records||[];
 return (records||[]).filter(record=>{
  const d=parseDraftPayload(record),p=d.payload||{};
  const hay=norm([p.subject,p.to,p.cc,p.bcc,p.text,String(p.html||'').replace(/<[^>]+>/g,' ')].join(' '));
  return ts.every(raw=>{
   const neg=raw.startsWith('-'),token=neg?raw.slice(1):raw;let ok=true;
   const [prefix,...rest]=token.split(':');const value=rest.join(':');
   if(rest.length){
    const needle=norm(value);
    if(prefix==='subject')ok=norm(p.subject).includes(needle);
    else if(prefix==='to')ok=norm(p.to).includes(needle);
    else if(prefix==='cc')ok=norm(p.cc).includes(needle);
    else if(prefix==='bcc')ok=norm(p.bcc).includes(needle);
    else if(prefix==='has'&&value==='attachment')ok=Boolean(record.has_attachments);
    else if(prefix==='is'&&(value==='read'||value==='unread'))ok=false;
    else ok=hay.includes(norm(token));
   }else ok=hay.includes(norm(token));
   return neg?!ok:ok
  })
 })
}
export function mergeDraftRows(remoteRows,localRecords,accounts=[]){
  const locals=(localRecords||[]).map(r=>draftRow(r,accounts));
  // Only a verified (account, UID) pair identifies a remote draft.
  // Fuzzy subject/snippet matching can hide unrelated drafts.
  const known=new Set(locals.filter(r=>!r.local_draft_dirty && r.local_draft_server_uid!=null)
    .map(r=>`${r.account_id}:${r.local_draft_server_uid}`));
  const filtered=(remoteRows||[]).filter(r=>!known.has(`${r.account_id}:${r.uid}`));
  return [...locals,...filtered].sort((a,b)=>Number(b.date_ts||0)-Number(a.date_ts||0));
}
