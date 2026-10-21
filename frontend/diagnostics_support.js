// Privacy-first incident handling: only categorized app events; no raw error text.
import {invoke,modal,toast,esc} from './lib.js';
const SUPPORT='tcsmail@thecreativesolver.com';
let sending=false;
export function registerClientDiagnostics(){
 window.addEventListener('error',()=>invoke('diagnostics_record_client',{kind:'javascript_error'}).catch(()=>{}));
 window.addEventListener('unhandledrejection',()=>invoke('diagnostics_record_client',{kind:'javascript_rejection'}).catch(()=>{}));
}
export async function logPolicy(){
 const value=await invoke('get_setting_value',{key:'diagnostics.send_policy'}).catch(()=>null);
 return ['ask','always','never'].includes(value)?value:'ask';
}
export async function saveLogPolicy(value){
 if(!['ask','always','never'].includes(value))throw new Error('Política de diagnóstico inválida');
 return invoke('set_setting',{req:{key:'diagnostics.send_policy',value}});
}
function supportEmail(report){
 return `mailto:${SUPPORT}?subject=${encodeURIComponent('[TCS Mail] Relatório de incidente')}&body=${encodeURIComponent(report)}`;
}
async function sendReport(report,boot,{automatic=false}={}){
 if(sending)return false;
 sending=true;
 try{
  const account=boot?.default_account_id||boot?.accounts?.[0]?.id;
  // Try the application's existing authenticated outbound queue, without attaching files.
  if(account){
   const id=await invoke('queue_send',{req:{accountId:Number(account),identityId:null,customFromName:null,customFromEmail:null,replyTo:null,draftId:'',to:SUPPORT,cc:'',bcc:'',subject:'[TCS Mail] Relatório técnico de incidente',textBody:report,htmlBody:'',inReplyTo:null,references:null,requestReadReceipt:false,sendAtTs:null,undoSeconds:0,followUpTs:null,followUpNote:null}});
   await invoke('process_outbound').catch(()=>{});
   toast(`Relatório enfileirado (${String(id).slice(0,8)}). O envio NÃO foi confirmado; confira Envios.`);
   return true;
  }
  if(automatic)return false;
  await invoke('open_external_url',{url:supportEmail(report)});
  toast('Relatório aberto no programa de e-mail padrão. Revise e envie.');
  return true;
 }catch(error){
  if(!automatic){try{await navigator.clipboard.writeText(report);toast('Não foi possível enviar automaticamente. Texto copiado; envie para '+SUPPORT)}catch{toast('Falha ao preparar relatório; tente novamente em Diagnóstico.')}}
  return false;
 }finally{sending=false}
}
export async function showIncidentIfNeeded(boot){
 const incident=await invoke('diagnostics_incident_report').catch(()=>null);
 if(!incident?.pending)return;
 const policy=await logPolicy();
 if(policy==='never')return;
 if(policy==='always'){
  if(await sendReport(incident.report,boot,{automatic:true}))await invoke('diagnostics_acknowledge_incident').catch(()=>{});
  else toast('Falha ao enviar diagnóstico automaticamente. Consulte Configurações → Diagnóstico.');
  return;
 }
 const d=modal('O TCS Mail foi encerrado inesperadamente?',`<p>A sessão anterior não foi encerrada normalmente. Isso também pode acontecer após queda de energia ou desligamento forçado.</p><p>O relatório contém versão, sistema e categorias de eventos. Não contém conteúdo de mensagens, senhas ou tokens.</p><pre class="tcsIncidentPreview">${esc(incident.report)}</pre><label class="settingsToggle"><input id="neverAskAgain" type="checkbox"> Não perguntar novamente (ao clicar em Enviar, ativar envio automático)</label><footer class="modalActions"><button id="incidentLater">Agora não</button><button id="incidentNever">Nunca enviar</button><button class="primary" id="incidentSend">Enviar diagnóstico</button></footer>`,{wide:true,resizable:true,persistKey:'incident'});
 d.root.querySelector('#incidentLater').onclick=()=>{d.close()};
 d.root.querySelector('#incidentNever').onclick=async()=>{await saveLogPolicy('never');await invoke('diagnostics_acknowledge_incident');d.close()};
 d.root.querySelector('#incidentSend').onclick=async()=>{
  const btn=d.root.querySelector('#incidentSend');btn.disabled=true;
  const wantsAlways=d.root.querySelector('#neverAskAgain').checked;
  if(wantsAlways){try{await saveLogPolicy('always')}catch(e){toast('Não foi possível salvar a preferência de envio: '+String(e));btn.disabled=false;return}}
  const success=await sendReport(incident.report,boot);
  if(success){await invoke('diagnostics_acknowledge_incident');d.close()}
  else btn.disabled=false;
 };
}
export async function renderDiagnosticsSupport(panel,boot){
 const incident=await invoke('diagnostics_incident_report');const policy=await logPolicy();
 const holder=document.createElement('section');holder.className='tcsSupportLogs';
 holder.innerHTML=`<h3>Relatórios de falhas e suporte</h3><p>Os relatórios utilizam somente versão, sistema e categorias de eventos. Nunca incluem senhas, tokens ou o conteúdo de mensagens. Destinatário: ${SUPPORT}.</p><label class="field"><span>Após encerramento inesperado</span><select id="diagnosticSendPolicy"><option value="ask">Sempre perguntar (padrão)</option><option value="always">Sempre enviar automaticamente</option><option value="never">Nunca enviar</option></select></label><p class="dim">O envio automático só funciona quando há uma conta configurada capaz de enviar. Caso contrário, o relatório permanece local.</p><label class="field"><span>Últimos eventos (texto simples)</span><textarea id="diagnosticReportText" readonly rows="9"></textarea></label><div class="inlineForm"><button id="diagCopySupport">Copiar relatório</button><button id="diagPrepareSupport" class="primary">Enviar relatório</button></div><div id="diagReportResult" role="status"></div>`;
 panel.append(holder);holder.querySelector('#diagnosticSendPolicy').value=policy;holder.querySelector('#diagnosticReportText').value=incident.report;
 holder.querySelector('#diagnosticSendPolicy').onchange=async e=>{try{await saveLogPolicy(e.target.value);holder.querySelector('#diagReportResult').textContent='Preferência salva.'}catch(err){holder.querySelector('#diagReportResult').textContent=String(err)}};
 holder.querySelector('#diagCopySupport').onclick=async()=>{await navigator.clipboard.writeText(incident.report);toast('Relatório técnico copiado.')};
 holder.querySelector('#diagPrepareSupport').onclick=async()=>{const result=await sendReport(incident.report,boot);holder.querySelector('#diagReportResult').textContent=result?'Mensagem preparada ou enfileirada, NÃO necessariamente entregue; confira Envios.':'Não foi possível preparar o envio. Copie o relatório.';if(result&&incident.pending)await invoke('diagnostics_acknowledge_incident').catch(()=>{})};
}
