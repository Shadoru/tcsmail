import {tr} from './i18n.js';
import {invoke} from './lib.js';

export function draftPayloadFromSeed(seed={}){
  return JSON.stringify({
    to:seed.to||'',cc:seed.cc||'',bcc:seed.bcc||'',subject:seed.subject||'',
    html:seed.htmlBody||'',text:seed.textBody||'',identityId:seed.identityId??null,
    customFromName:seed.customFromName||'',customFromEmail:seed.customFromEmail||'',
    requestReadReceipt:!!seed.requestReadReceipt,followEnabled:!!seed.followEnabled,
    followAt:seed.followAt||'',scheduleEnabled:!!seed.scheduleEnabled,sendAt:seed.sendAt||'',
    undoSeconds:Number(seed.undoSeconds)||10,ccVisible:!!(seed.ccVisible||seed.cc),
    bccVisible:!!(seed.bccVisible||seed.bcc),signatureId:seed.signatureId??null,
    noSignature:!!seed.noSignature,inReplyTo:seed.inReplyTo||null,references:seed.references||null,
    attachMessageId:seed.attachMessageId??null,sourceMessageId:seed.sourceMessageId??null,
    composeFormat:seed.composeFormat||'',_freshNative:true
  });
}

// The call succeeds only after the independent webview has mounted the actual editor.
// A failed window must never cause deletion of a local draft or its attachments.
export async function openNativeComposer(ctx,seed={},options={}){
  const accountId=seed.accountId??ctx?.state?.account??ctx?.state?.boot?.default_account_id??ctx?.state?.boot?.accounts?.[0]?.id;
  if(!accountId)throw new Error(tr('Cadastre uma conta antes de redigir.'));
  const draftId=seed.draftId||crypto.randomUUID();
  if(!seed.draftId)await invoke('save_local_draft',{id:draftId,accountId,draftJson:draftPayloadFromSeed(seed)});
  const eventApi=window.__TAURI__?.event;
  if(!eventApi?.listen||!eventApi?.emit)throw new Error('Eventos nativos Tauri indisponíveis. O rascunho está preservado.');
  let finished=false,unlistenReady=null,unlistenFailed=null,timer=null;
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});
  const accept=()=>{if(!finished){finished=true;resolveReady(draftId)}};
  const fail=message=>{if(!finished){finished=true;rejectReady(new Error(String(message||'A janela não respondeu.')))}};
  try {
    // Register before launching, otherwise a fast window can emit ready too early.
    unlistenReady=await eventApi.listen('tcs-composer-ready',event=>{
      if(String(event?.payload?.draftId)===String(draftId))accept();
    });
    unlistenFailed=await eventApi.listen('tcs-composer-failed',event=>{
      if(String(event?.payload?.draftId)===String(draftId))fail(event?.payload?.message);
    });
    const maxWait=Math.max(50,Math.min(60000,Number(options.readyTimeoutMs)||20000));
    timer=setTimeout(()=>fail('O editor da janela independente não confirmou a inicialização dentro do prazo.'),maxWait);
    await invoke('open_mail_window',{kind:'composer',key:String(draftId),title:seed.subject?.trim()||tr('Nova mensagem')});
    // Also handles an existing, already mounted window whose initial ready event has passed.
    await eventApi.emit('tcs-composer-probe',{draftId:String(draftId)}).catch(()=>{});
    return await ready;
  } catch(error) {
    // The data is durable even if the window is missing, late or rejected by the OS.
    if(!finished){finished=true;rejectReady(error);ready.catch(()=>{});}
    throw error;
  } finally {
    if(timer!==null)clearTimeout(timer);
    unlistenReady?.();unlistenFailed?.();
  }
}

export async function openNativeReader(id,title=tr('Mensagem')){
  return invoke('open_mail_window',{kind:'reader',key:String(id),title:title?.trim()||tr('Mensagem')});
}
