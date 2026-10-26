// SPDX-License-Identifier: MPL-2.0
// Account onboarding is independent of mailbox synchronization and never stores passwords in localStorage.
import {invoke,esc} from './lib.js';
import {getLocale} from './i18n.js';

export const FIRST_RUN_THEMES = Object.freeze([
  ['system','Sistema','System'],['light','Claro','Light'],['dark','Escuro','Dark'],
  ['focus','Focus','Focus'],['ocean','Ocean','Ocean'],['graphite','Graphite','Graphite']
]);
const KEY='tcs.firstRun.pending';
const STEP='tcs.firstRun.step';
const isEmail=value=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value||'').trim());
// A persisted step must never bypass account setup after an interrupted onboarding.
export function resolveFirstRunStep(persistedStep,accountCount){
  return persistedStep==='2' && Number(accountCount)>0 ? 2 : 1;
}
export function canFinishFirstRun(accounts){
  return Array.isArray(accounts)&&accounts.some(a=>a&&Number.isSafeInteger(Number(a.id))&&Number(a.id)>0);
}
export function needsFirstRun(boot){return !boot?.accounts?.length||localStorage.getItem(KEY)==='1';}
export async function renderFirstRun({boot,onDone}){
  const app=document.querySelector('#app');
  const en=getLocale()==='en-US';
  const t=(pt,english)=>en?english:pt;
  localStorage.setItem(KEY,'1');
  let step=resolveFirstRunStep(localStorage.getItem(STEP),boot?.accounts?.length||0);
  // Keep unsaved choices on back/next navigation; only persist after Finish.
  const preferences={theme:FIRST_RUN_THEMES.some(x=>x[0]===boot?.settings?.theme)?boot.settings.theme:'system',
    composer:'inline',notifyMail:true,notifyCalendar:true,notifyTasks:true};
  let busy=false, cancelOAuth=null;
  function rememberPreferences(){
    if(step!==2)return;
    const value=id=>app.querySelector('#'+id);
    if(value('firstRunTheme'))preferences.theme=value('firstRunTheme').value;
    if(value('firstRunComposer'))preferences.composer=value('firstRunComposer').value;
    for(const [field,id] of [['notifyMail','firstRunNotifyMail'],['notifyCalendar','firstRunNotifyCalendar'],['notifyTasks','firstRunNotifyTasks']]){
      if(value(id))preferences[field]=value(id).checked;
    }
  }
  const accounts=async()=>{
    const fallback=Array.isArray(boot?.accounts)?boot.accounts:[];
    try{
      const rows=await invoke('list_accounts_full');
      return Array.isArray(rows)?rows:fallback;
    }catch{return fallback;}
  };
  const msg=(value,bad=false)=>{const target=app.querySelector('#firstRunStatus');if(target){target.textContent=String(value||'');target.dataset.error=bad?'1':'0';}};
  const goStep=next=>{rememberPreferences();step=next;localStorage.setItem(STEP,String(next));draw().catch(e=>msg(e,true));};
  function actionsBusy(value){busy=value;app.querySelectorAll('.firstRun button, .firstRun input, .firstRun select').forEach(el=>el.disabled=value)}
  async function connectEmail(email){
    if(!isEmail(email))return msg(t('Informe um e-mail válido.','Enter a valid email address.'),true);
    actionsBusy(true);msg(t('Identificando o provedor…','Discovering provider…'));
    try{
      const d=await invoke('autodiscover_account',{email});
      if(d.auth_method==='oauth2'){
        const provider=d.auth_provider;
        if(!['google','microsoft'].includes(provider))throw new Error(t('O provedor exige OAuth ainda não suportado; não será solicitada senha básica.','The provider requires unsupported OAuth; a basic password will not be requested.'));
        const command=provider==='google'?'google_oauth_connect':'microsoft_oauth_connect';
        const cancellation=provider==='google'?'google_oauth_cancel':'microsoft_oauth_cancel';
        const attemptId=(crypto.randomUUID?.()||`${Date.now()}`).replace(/[^A-Za-z0-9_-]/g,'').slice(0,128);
        cancelOAuth=()=>invoke(cancellation,{attemptId}).catch(()=>{});
        msg(t('Autorize no navegador. Não feche o TCS Mail.','Authorize in your browser. Keep TCS Mail open.'));
        const result=await invoke(command,{existingAccountId:null,attemptId,emailHint:email});
        cancelOAuth=null;
        if(result?.account_id)invoke('sync_recent',{accountId:result.account_id,folder:'INBOX'}).catch(()=>{});
        msg(t('Conta conectada. Você pode adicionar outra conta ou continuar.','Account connected. Add another account or continue.'));
        await draw();
        return;
      }
      const pane=app.querySelector('#firstRunPassword');
      if(!pane)return;
      pane.hidden=false;
      pane.dataset.discovery=JSON.stringify({email,d});
      pane.querySelector('#firstRunAccountName').value=email.split('@')[0];
      pane.querySelector('#firstRunPasswordInput').value='';
      pane.querySelector('#firstRunPasswordInput').focus();
      msg(t('Configuração detectada. Informe a senha de aplicativo.','Configuration discovered. Enter your app password.'));
    }catch(error){msg(t('A descoberta não foi concluída: ','Discovery failed: ')+String(error),true);app.querySelector('#firstRunManual').hidden=false;}
    finally{actionsBusy(false)}
  }
  async function savePassword(){
    const pane=app.querySelector('#firstRunPassword');const p=JSON.parse(pane.dataset.discovery||'null');if(!p)return;
    const password=pane.querySelector('#firstRunPasswordInput').value;
    if(!password)return msg(t('Informe uma senha de aplicativo.','Enter an app password.'),true);
    const d=p.d;actionsBusy(true);
    try{
      await invoke('save_account',{req:{id:0,name:pane.querySelector('#firstRunAccountName').value.trim()||p.email,email:p.email,imapHost:d.imap_host,imapPort:Number(d.imap_port),smtpHost:d.smtp_host,smtpPort:Number(d.smtp_port),username:d.username||p.email,useTls:true,imapSecurity:d.imap_security,smtpSecurity:d.smtp_security,color:'#3584e4',password}});
      pane.querySelector('#firstRunPasswordInput').value='';
      await draw();
      msg(t('Conta adicionada.','Account added.'));
    }catch(error){msg(error,true)}finally{actionsBusy(false)}
  }
  async function saveManual(){
    const email=app.querySelector('#firstRunEmail')?.value.trim().toLowerCase();
    const host=app.querySelector('#firstRunManual');
    const v=id=>host.querySelector(`#${id}`)?.value.trim();
    const imapPort=Number(v('firstRunImapPort')),smtpPort=Number(v('firstRunSmtpPort'));
    if(!isEmail(email)||!v('firstRunImapHost')||!v('firstRunSmtpHost')||!v('firstRunManualPassword')||!Number.isInteger(imapPort)||imapPort<1||imapPort>65535||!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535)return msg(t('Revise e-mail, servidores, portas e senha.','Check email, hosts, ports and password.'),true);
    actionsBusy(true);
    try{
      await invoke('save_account',{req:{id:0,name:email.split('@')[0],email,imapHost:v('firstRunImapHost'),imapPort,smtpHost:v('firstRunSmtpHost'),smtpPort,username:v('firstRunUsername')||email,useTls:true,imapSecurity:v('firstRunImapSecurity'),smtpSecurity:v('firstRunSmtpSecurity'),color:'#3584e4',password:v('firstRunManualPassword')}});
      host.querySelector('#firstRunManualPassword').value='';await draw();msg(t('Conta adicionada com configuração manual.','Account added with manual configuration.'));
    }catch(error){msg(error,true)}finally{actionsBusy(false)}
  }
  async function finish(){
    if(busy)return;
    // Recheck the persisted accounts, not just a disabled button or localStorage.
    let connected;
    try{connected=await invoke('list_accounts_full');}
    catch(error){return msg(t('Não foi possível confirmar as contas: ','Could not verify connected accounts: ')+String(error),true);}
    if(!canFinishFirstRun(connected)){
      goStep(1);
      return msg(t('Conecte ao menos uma conta antes de concluir.','Connect at least one account before finishing.'),true);
    }
    rememberPreferences();
    actionsBusy(true);
    try{
      const prefs=[['appearance.theme',preferences.theme],['composition.reply_surface',preferences.composer],['notifications.new_mail',String(preferences.notifyMail)],['notifications.calendar',String(preferences.notifyCalendar)],['notifications.tasks',String(preferences.notifyTasks)]];
      for(const [key,value] of prefs)await invoke('set_setting',{req:{key,value}});
      localStorage.removeItem(KEY);localStorage.removeItem(STEP);
      try{await onDone();}
      catch(error){
        // A failed UI hand-off must not cause a later restart to skip onboarding.
        localStorage.setItem(KEY,'1');localStorage.setItem(STEP,'2');
        throw error;
      }
    }catch(error){msg(t('Não foi possível salvar todas as preferências: ','Could not save all preferences: ')+String(error),true)}finally{actionsBusy(false)}
  }
  function themePreviewCards(){
    return `<div class="firstRunThemeGrid" role="group" aria-label="${t('Prévias dos seis temas','Preview all six themes')}">${FIRST_RUN_THEMES.map(([value,pt,enText])=>`<button type="button" class="firstRunThemeCard" data-theme-choice="${value}" aria-pressed="false"><span class="firstRunThemePreview" data-preview-theme="${value}" aria-hidden="true"><i></i><b></b><em></em></span><span>${en?enText:pt}</span></button>`).join('')}</div>`;
  }
  function benefitCards(){
    const benefits=[
      [t('Contas em um só lugar','All your accounts in one place'),t('Acesse contas IMAP, Google e Microsoft na mesma interface.','Access IMAP, Google and Microsoft accounts in one interface.')],
      [t('Dados armazenados localmente','Data stored locally'),t('O TCS mantém seus dados de trabalho no dispositivo; seu provedor continua hospedando os e-mails e o cofre do sistema protege as credenciais.','TCS keeps working data on your device; your provider still hosts email and the system keychain protects credentials.')],
      [t('IA somente se você quiser','AI only if you want it'),t('A IA é opcional, configurável e não é necessária para ler e enviar mensagens.','AI is optional and configurable; reading and sending mail do not require it.')]
    ];
    return `<div class="firstRunBenefits">${benefits.map(([title,description])=>`<div class="firstRunBenefit"><strong>${title}</strong><p>${description}</p></div>`).join('')}</div>`;
  }
  async function draw(){
    const connected=await accounts();
    app.innerHTML=`<main class="firstRun" aria-labelledby="firstRunTitle"><div class="firstRunCard"><header><img src="assets/tcs-mail-logo.png" width="44" alt=""><div><h1 id="firstRunTitle">${t('Configurar TCS Mail','Set up TCS Mail')}</h1><p>${t('Etapa','Step')} ${step} ${t('de','of')} 2</p></div></header><nav class="firstRunSteps" aria-label="${t('Etapas de configuração','Setup steps')}"><span class="${step===1?'active':''}">${t('1. Contas','1. Accounts')}</span><span class="${step===2?'active':''}">${t('2. Preferências','2. Preferences')}</span></nav>
    ${step===1?`<section><h2>${t('Seu e-mail, suas escolhas','Your email, your choices')}</h2><p>${t('Cliente local, sem serviço intermediário obrigatório. Contas IMAP, Google e Microsoft com configuração automática e IA opcional.','Local email client without a required relay. IMAP, Google and Microsoft autodiscovery, optional AI.')}</p>${benefitCards()}<label for="firstRunEmail">${t('Endereço de e-mail','Email address')}</label><div class="firstRunInline"><input id="firstRunEmail" type="email" autocomplete="email" placeholder="voce@exemplo.com"><button id="firstRunConnect" class="primary">${t('Detectar e conectar','Discover and connect')}</button></div><div id="firstRunPassword" hidden><label for="firstRunAccountName">${t('Nome da conta','Account name')}</label><input id="firstRunAccountName"><label for="firstRunPasswordInput">${t('Senha / senha de aplicativo','Password / app password')}</label><input id="firstRunPasswordInput" type="password" autocomplete="current-password"><button id="firstRunPasswordSave">${t('Salvar conta','Save account')}</button></div><details id="firstRunManual"><summary>${t('Configuração manual IMAP/SMTP','Manual IMAP/SMTP configuration')}</summary><div class="firstRunGrid"><label>IMAP <input id="firstRunImapHost" autocomplete="off" placeholder="imap.exemplo.com"></label><label>${t('Porta IMAP','IMAP port')} <input id="firstRunImapPort" type="number" value="993" min="1" max="65535"></label><label>${t('Segurança IMAP','IMAP security')} <select id="firstRunImapSecurity"><option value="tls">TLS</option><option value="starttls">STARTTLS</option></select></label><label>SMTP <input id="firstRunSmtpHost" autocomplete="off" placeholder="smtp.exemplo.com"></label><label>${t('Porta SMTP','SMTP port')} <input id="firstRunSmtpPort" type="number" value="587" min="1" max="65535"></label><label>${t('Segurança SMTP','SMTP security')} <select id="firstRunSmtpSecurity"><option value="starttls">STARTTLS</option><option value="tls">TLS</option></select></label><label>${t('Usuário (opcional)','Username (optional)')} <input id="firstRunUsername"></label><label>${t('Senha de aplicativo','App password')} <input id="firstRunManualPassword" type="password"></label></div><button id="firstRunManualSave">${t('Conectar manualmente','Connect manually')}</button></details><details><summary>${t('Restaurar uma instalação anterior','Restore a previous installation')}</summary><p>${t('Preserve os arquivos de perfil e o cofre de credenciais do sistema. A restauração automática de backup ainda depende de um importador transacional; não substitua o banco de dados enquanto o aplicativo estiver aberto.','Keep your profile files and system keychain. Automatic backup restoration requires a transactional importer; do not replace the database while the app is open.')}</p></details><h3>${t('Contas conectadas','Connected accounts')}</h3><ul>${connected.length?connected.map(a=>`<li>${esc(a.email)}</li>`).join(''):`<li>${t('Nenhuma conta ainda','No account yet')}</li>`}</ul><footer><button id="firstRunNext" class="primary" ${connected.length?'':'disabled'}>${t('Continuar para preferências','Continue to preferences')}</button></footer></section>`:`<section><h2>${t('Preferências iniciais','Initial preferences')}</h2><p>${t('As mesmas opções de aparência disponíveis nas Configurações. Você poderá alterá-las depois.','The same appearance choices available in Settings. You can change them later.')}</p><label for="firstRunTheme">${t('Tema','Theme')}</label><select id="firstRunTheme">${FIRST_RUN_THEMES.map(([value,pt,enText])=>`<option value="${value}">${en?enText:pt}</option>`).join('')}</select>${themePreviewCards()}<label for="firstRunComposer">${t('Compositor padrão','Default composer surface')}</label><select id="firstRunComposer"><option value="inline">${t('Integrado ao painel de leitura','Integrated in reader panel')}</option><option value="window">${t('Janela independente','Separate window')}</option></select><fieldset><legend>${t('Notificações','Notifications')}</legend><label><input type="checkbox" id="firstRunNotifyMail" checked> ${t('Novas mensagens','New messages')}</label><label><input type="checkbox" id="firstRunNotifyCalendar" checked> ${t('Agenda e lembretes','Calendar and reminders')}</label><label><input type="checkbox" id="firstRunNotifyTasks" checked> ${t('Tarefas','Tasks')}</label></fieldset><footer><button id="firstRunPrevious">${t('Voltar às contas','Back to accounts')}</button><button id="firstRunFinish" class="primary">${t('Concluir e abrir TCS Mail','Finish and open TCS Mail')}</button></footer></section>`}<p id="firstRunStatus" role="status" aria-live="polite"></p></div></main>`;
    if(step===1){
      app.querySelector('#firstRunConnect').onclick=()=>connectEmail(app.querySelector('#firstRunEmail').value.trim().toLowerCase());
      app.querySelector('#firstRunEmail').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();app.querySelector('#firstRunConnect').click()}};
      app.querySelector('#firstRunPasswordSave').onclick=savePassword;
      app.querySelector('#firstRunManualSave').onclick=saveManual;
      app.querySelector('#firstRunNext').onclick=()=>goStep(2);
      if(connected.length===0)app.querySelector('#firstRunEmail').focus();
    }else{
      app.querySelector('#firstRunTheme').value=preferences.theme;
      app.querySelector('#firstRunComposer').value=preferences.composer;
      for(const [field,id] of [['notifyMail','firstRunNotifyMail'],['notifyCalendar','firstRunNotifyCalendar'],['notifyTasks','firstRunNotifyTasks']]){
        app.querySelector('#'+id).checked=preferences[field];
      }
      const themeSelect=app.querySelector('#firstRunTheme');
      const syncThemePreview=()=>app.querySelectorAll('[data-theme-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.themeChoice===themeSelect.value)));
      themeSelect.addEventListener('change',e=>{document.documentElement.dataset.theme=e.target.value;rememberPreferences();syncThemePreview()});
      app.querySelectorAll('[data-theme-choice]').forEach(el=>el.addEventListener('click',()=>{themeSelect.value=el.dataset.themeChoice;themeSelect.dispatchEvent(new Event('change',{bubbles:true}))}));
      syncThemePreview();
      app.querySelector('#firstRunComposer').addEventListener('change',rememberPreferences);
      for(const id of ['firstRunNotifyMail','firstRunNotifyCalendar','firstRunNotifyTasks']){
        app.querySelector('#'+id).addEventListener('change',rememberPreferences);
      }
      app.querySelector('#firstRunPrevious').onclick=()=>goStep(1);
      app.querySelector('#firstRunFinish').onclick=finish;
    }
  }
  window.addEventListener('beforeunload',()=>cancelOAuth?.(),{once:true});
  await draw();
}
