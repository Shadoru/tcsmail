// SPDX-License-Identifier: MPL-2.0
import {invoke, esc, field, confirmDialog} from './lib.js';
import {tr} from './i18n.js';
import {moveFolderChoices} from './folder_move.js';

const SERVICES = [
  ['openai','OpenAI','GPT',''],
  ['anthropic','Claude','Anthropic',''],
  ['gemini','Gemini','Google',''],
  ['openai_compatible','Servidor local','Ollama / compatível','http://127.0.0.1:11434'],
  ['custom','Outro serviço','Compatível com OpenAI','']
];
const options = items => items.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
export function modelChoices(ids, kind) {
  // Preserve returned IDs verbatim. A list is not evidence of cost or model quality.
  return [...new Set(ids)].filter(id=>typeof id==='string' && id &&
    (kind==='openai' ? /^(gpt-|o\d)/.test(id) && !/audio|realtime|transcrib|image|tts/.test(id) :
      kind==='gemini' ? /^gemini-/.test(id) && !/embedding|image|tts|live/.test(id) : true)).sort();
}
export async function renderAiSettings(container,ctx) {
  const p=document.createElement('div');
  p.className='aiSettingsPage';container.replaceChildren(p);
  const [cfg, initialProviders] = await Promise.all([invoke('ai_get_runtime_config'),invoke('ai_providers')]);
  if(!p.isConnected)return;
  let providers=initialProviders, selected=providers.find(x=>x.id===cfg.advanced?.provider_id)||providers[0];
  let current=selected?{...selected}:null, discovered=[], tested='', busy=false, mailboxEpoch=0, connectionDirty=false;
  const retestConnections=new Set();
  let mailboxes=[];
  try {mailboxes=JSON.parse(ctx.state.boot.settings.aiAuthorizedMailboxes||'[]')} catch { /* legacy empty preference */ }
  if(!Array.isArray(mailboxes))mailboxes=[];
  const $=id=>p.querySelector('#'+id);
  const tx=s=>esc(tr(s));
  const label=(name,control,help='')=>field(name,control,help);
  p.innerHTML=`<h2>${tx('Inteligência artificial')}</h2>
    <p class="settingsPanelIntro">${tx('Escreva, resuma e traduza quando precisar. A IA é opcional.')}</p>
    <label class="settingsToggle"><input id="aien" type="checkbox"> ${tx('Usar inteligência artificial')}</label>
    <p class="privacyRisk">${tx('Serviços online recebem o texto autorizado fora deste computador. Nenhum e-mail será enviado automaticamente.')}</p>
    <section class="aiSetupCard"><h3>${tx('1. Conecte um serviço')}</h3>
      <div class="aiServiceGrid">${SERVICES.map(([kind,name,hint])=>`<button type="button" class="aiServiceCard" data-service="${kind}" aria-pressed="false"><strong>${esc(name)}</strong><small>${tx(hint)}</small></button>`).join('')}</div>
      ${label('Conexões salvas','<select id="aiConnection"></select>')}
      <div id="aiConnectionEditor">
      ${label('Nome da conexão','<input id="aiName" autocomplete="off" maxlength="100">')}
      <div class="aiSecretRow">${label('Chave de API','<input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Deixe vazio para manter a chave salva">','A chave fica no cofre de credenciais do sistema.')}<button type="button" id="aiShowKey" aria-pressed="false">${tx('Mostrar chave')}</button></div>
      <p class="dim">${tx('Assinaturas de aplicativos de chat e acesso à API têm cobrança e credenciais próprias. Consulte seu serviço para criar uma chave de API.')}</p>
      <details class="settingsDetails" id="aiNetworkDetails"><summary>${tx('Endereço e opções da conexão')}</summary>
        ${label('Tipo de serviço','<select id="aiKind">'+options([['openai','OpenAI'],['anthropic','Anthropic / Claude'],['gemini','Google / Gemini'],['openai_compatible','Servidor compatível com OpenAI'],['custom','Outro compatível com OpenAI'],['azure_openai','Azure OpenAI'],['aws_bedrock','Bedrock via gateway'],['vertex_ai','Vertex via gateway']])+'</select>')}
        ${label('Endereço do serviço','<input id="aiEndpoint" type="url" placeholder="Padrão do serviço">')}
        ${label('Versão da API (Azure)','<input id="aiApiVersion">')}
        ${label('Tempo limite (segundos)','<input id="aiTimeout" type="number" min="30" max="1800" value="600">')}
      </details>
      <div class="settingsActionRow"><button id="aiConnect">${tx('Salvar conexão e buscar modelos')}</button><button id="aiDeleteConnection">${tx('Remover conexão')}</button></div>
      </div>
    </section>
    <section class="aiSetupCard"><h3>${tx('2. Escolha um modelo')}</h3>
      ${label('Modelo para escrever e resumir','<select id="aiModelChoice"></select>')}
      <details class="settingsDetails" id="aiManualModel"><summary>${tx('Informar ID de modelo manualmente')}</summary>${label('ID do modelo','<input id="aiModel" autocomplete="off" placeholder="ID fornecido pelo serviço">')}</details><p id="aiModelHelp" class="dim"></p>
      <div class="settingsActionRow"><button id="aiTest">${tx('Testar conexão')}</button><span class="dim">${tx('Envia apenas uma frase de teste; pode consumir créditos da API.')}</span></div>
      <details class="settingsDetails" id="aiRoleDetails"><summary>${tx('Usar modelos diferentes por tarefa')}</summary>
        <label class="settingsToggle"><input type="checkbox" id="aiUseRoles"> ${tx('Personalizar modelos por tarefa')}</label>
        <p>${tx('Opcional: preserve uma conexão ou modelo diferente para tarefas rápidas e busca em documentos.')}</p>
        ${label('Conexão para tarefas rápidas','<select id="aiFastProvider"></select>')}${label('Modelo rápido','<input id="aiFast">')}
        ${label('Conexão para busca em documentos','<select id="aiEmbedProvider"></select>')}${label('Modelo de embeddings','<input id="aiEmbed">')}
      </details>
    </section>
    <section class="aiSetupCard"><h3>${tx('3. Controle o acesso aos e-mails')}</h3>
      ${label('Quando permitir análise','<select id="aiScope">'+options([['none',tr('Somente quando eu autorizar uma mensagem')],['per_message',tr('Perguntar a cada mensagem')],['mailbox',tr('Usar apenas caixas autorizadas')],['all',tr('Todas as contas (acesso amplo)')]])+'</select>')}
      <div id="aiMailboxScope"><div class="inlineForm">${label('Conta','<select id="aiMailboxAccount" data-i18n-skip>'+options(ctx.state.boot.accounts.map(a=>[a.id,a.name||a.email]))+'</select>')}${label('Pasta','<select id="aiMailboxFolder" data-i18n-skip></select>')}<button id="aiMailboxAdd">${tx('Autorizar caixa')}</button></div><div id="aiMailboxList"></div></div>
      <label class="settingsToggle"><input type="checkbox" id="aiPreanalyze"> ${tx('Analisar em segundo plano somente conteúdo já autorizado')}</label>
    </section>
    <details class="settingsDetails"><summary>${tx('Documentos e busca de contexto (RAG)')}</summary>
      <label class="settingsToggle"><input id="ragEnabled" type="checkbox"> ${tx('Buscar contexto em documentos locais')}</label>
      <p>${tx('Ative apenas se precisar de documentos de apoio. Exige um modelo de embeddings compatível. Trechos encontrados podem ser enviados ao serviço de IA escolhido.')}</p>
      <div class="inlineForm">${label('Arquivo ou pasta local','<input id="ragSource">')}${label('Coleção','<input id="ragCollection" value="Geral">')}${label('Conta ou * para todas','<input id="ragScope" value="*">')}<button id="ragAdd">${tx('Adicionar fonte')}</button></div>
      <div id="ragSources"></div><div class="settingsActionRow"><button id="ragReindex">${tx('Atualizar índice')}</button><button id="ragClear">${tx('Apagar índice derivado')}</button><button id="aiHistoryClear">${tx('Apagar histórico de IA')}</button></div>
      <details class="settingsDetails"><summary>${tx('Coleções e pesquisa nos documentos')}</summary>
        <div class="inlineForm">${label('Nova coleção','<input id="ragCollectionName">')}${label('Conta ou * para todas','<input id="ragCollectionScope" value="*">')}<button id="ragCollectionAdd">${tx('Adicionar coleção')}</button></div>
        <div id="ragCollections"></div>
        <div class="inlineForm">${label('Pesquisar evidências','<input id="ragQuery">')}<button id="ragSearch">${tx('Pesquisar')}</button><button id="ragStatus">${tx('Status')}</button></div>
        <pre id="ragResults" data-i18n-skip></pre>
      </details>
    </details>
    <details class="settingsDetails"><summary>${tx('Preparação do texto')}</summary>
      <label class="settingsToggle"><input id="aiIgnoreImages" type="checkbox"> ${tx('Ignorar referências de imagens (padrão)')}</label>
      <label class="settingsToggle"><input id="aiCleanNoise" type="checkbox"> ${tx('Limpar links de rastreamento e ruído textual')}</label>
      <p>${tx('Nesta versão a IA recebe somente texto. Alterar estas opções não habilita análise de imagens.')}</p>
    </details>
    <div id="aiStatus" class="diagnosticResult" role="status" aria-live="polite">${tx('Configure a conexão e teste antes de ativar.')}</div>
    <footer class="settingsStickyActions"><button id="aiSave" class="primary">${tx('Salvar configuração de IA')}</button><span id="aiSaved"></span></footer>`;
  $('aien').checked=cfg.enabled; $('ragEnabled').checked=cfg.rag_enabled;
  $('aiScope').value=cfg.analysis_scope||'none'; $('aiPreanalyze').checked=cfg.preanalyze_received;
  $('aiFast').value=cfg.fast?.model||''; $('aiEmbed').value=cfg.embedding?.model||'';
  const status=(message,ok=false)=>{if(!p.isConnected)return;$('aiStatus').textContent=tr(message);$('aiStatus').className='diagnosticResult '+(ok?'ok':'');};
  // Keep network work serialized, and expose failures without provider URLs or secrets.
  const run=fn=>async()=>{if(busy)return;busy=true;p.setAttribute('aria-busy','true');const controls=[...p.querySelectorAll('button,input,select,textarea')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);try{await fn()}catch{status('Não foi possível concluir. Confira a chave, o modelo e a conexão.')}finally{busy=false;if(p.isConnected){p.removeAttribute('aria-busy');controls.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled})}}};
  const fillProviders=()=>{
    const choices=options(providers.map(x=>[x.id,x.name]));
    for(const id of ['aiConnection','aiFastProvider','aiEmbedProvider']){const before=$(id).value;$(id).innerHTML=choices;$(id).value=providers.some(x=>x.id===before)?before:(providers[0]?.id||'')}
  };
  const updateService=provider=>{
    current={...provider}; tested='';discovered=[];connectionDirty=false;
    $('aiName').value=current.name; $('aiKind').value=current.kind;$('aiEndpoint').value=current.endpoint||'';$('aiTimeout').value=current.chat_timeout_secs||600;$('aiApiVersion').value=current.api_version||'';
    $('aiKey').value='';$('aiKey').type='password';$('aiShowKey').setAttribute('aria-pressed','false');$('aiShowKey').textContent=tr('Mostrar chave');
    $('aiConnection').value=providers.some(x=>x.id===current.id)?current.id:'';
    p.querySelectorAll('[data-service]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.service===current.kind)));
    $('aiNetworkDetails').open=['custom','openai_compatible','azure_openai','aws_bedrock','vertex_ai'].includes(current.kind);
    $('aiModel').value=current.id===cfg.advanced?.provider_id?cfg.advanced.model:'';
    $('aiModelChoice').innerHTML=options([['',tr('Escolha um modelo')],...($('aiModel').value?[[$('aiModel').value,$('aiModel').value]]:[])]);$('aiModelChoice').value=$('aiModel').value;
    $('aiModelHelp').textContent=tr('Busque os modelos disponíveis usando a conexão acima.');
  };
  fillProviders();
  $('aiFastProvider').value=cfg.fast?.provider_id||providers[0]?.id||'';
  $('aiEmbedProvider').value=cfg.embedding?.provider_id||providers[0]?.id||'';
  updateService(selected||{id:'',name:'OpenAI',kind:'openai',endpoint:''});
  // If an older setup used two chat models, preserve it by opening the override.
  $('aiRoleDetails').open=!!cfg.fast?.model&&(cfg.fast.model!==cfg.advanced?.model||cfg.fast.provider_id!==cfg.advanced?.provider_id);
  $('aiUseRoles').checked=$('aiRoleDetails').open;
  p.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{
    const [kind,name,,endpoint]=SERVICES.find(s=>s[0]===b.dataset.service);
    updateService(providers.find(x=>x.kind===kind)||{id:'',name,kind,endpoint});
  });
  $('aiConnection').onchange=()=>{const hit=providers.find(x=>x.id===$('aiConnection').value);if(hit)updateService(hit)};
  for(const id of ['aiName','aiKind','aiEndpoint','aiKey','aiApiVersion','aiTimeout'])$(id).addEventListener('input',()=>{connectionDirty=true;tested=''});
  $('aiModelChoice').onchange=()=>{$('aiModel').value=$('aiModelChoice').value;tested=''};
  $('aiModel').oninput=()=>{$('aiModelChoice').value='';tested=''};
  $('aiShowKey').onclick=()=>{const show=$('aiKey').type==='password';$('aiKey').type=show?'text':'password';$('aiShowKey').textContent=tr(show?'Ocultar chave':'Mostrar chave');$('aiShowKey').setAttribute('aria-pressed',String(show))};
  $('aiConnect').onclick=run(async()=>{
    if(!current)throw Error('connection');
    const kind=$('aiKind').value, endpoint=$('aiEndpoint').value.trim();
    if(['custom','azure_openai','aws_bedrock','vertex_ai','openai_compatible'].includes(kind)&&!endpoint){status('Informe o endereço do serviço.');return}
    if(!current.id&&!$('aiKey').value.trim()&&!['openai_compatible'].includes(kind)){status('Informe a chave de API para conectar.');return}
    const provider={...current,id:current.id||crypto.randomUUID(),name:$('aiName').value.trim()||kind,kind,endpoint,enabled:true,api_version:$('aiApiVersion').value.trim(),project:current.project||'',region:current.region||'',chat_timeout_secs:Math.max(30,Math.min(1800,Number($('aiTimeout').value)||600))};
    await invoke('ai_save_provider',{provider,secret:$('aiKey').value.trim()||null});
    $('aiKey').value='';current=provider;connectionDirty=false;retestConnections.add(provider.id);tested='';
    providers=await invoke('ai_providers');fillProviders();$('aiConnection').value=provider.id;
    status('Conexão salva. Consultando modelos…');
    const ids=await invoke('ai_list_models',{providerId:provider.id});
    if(!p.isConnected)return;
    discovered=modelChoices(ids,kind);const previous=$('aiModel').value;const choices=[...new Set([...discovered,...(previous?[previous]:[])])];$('aiModelChoice').innerHTML=options([['',tr('Escolha um modelo')],...choices.map(id=>[id,id])]);$('aiModelChoice').value=previous;$('aiManualModel').open=!discovered.length;
    $('aiModelHelp').textContent=tr(discovered.length?'Escolha um modelo disponível. A lista não informa preços; consulte seu serviço.':'Este serviço não listou modelos. Informe o ID disponibilizado por ele.');
    tested='';status('Conexão salva. Escolha o modelo e execute o teste.',true);
  });
  const binding=()=>({provider_id:current?.id||'',model:$('aiModel').value.trim()});
  $('aiTest').onclick=run(async()=>{tested='';const b=binding();if(connectionDirty||!providers.some(x=>x.id===b.provider_id)||!b.model){status('Salve a conexão e escolha um modelo antes de testar.');return}status('Testando com uma frase sem dados de e-mail…');await invoke('ai_test_provider',{providerId:b.provider_id,model:b.model});tested=JSON.stringify(b);status('Teste concluído. O modelo respondeu; você pode salvar a configuração.',true)});
  $('aiDeleteConnection').onclick=run(async()=>{if(!current?.id)return;if(!await confirmDialog('Remover esta conexão e a chave salva? Se estiver em uso, primeiro salve outra conexão ou desative e remova os modelos vinculados.',{danger:true,confirmLabel:'Remover'}))return;await invoke('ai_delete_provider',{id:current.id});providers=await invoke('ai_providers');fillProviders();updateService(providers[0]||{id:'',name:'OpenAI',kind:'openai',endpoint:''});status('Conexão removida.',true)});
  const refreshMailboxes=()=>{$('aiMailboxScope').hidden=$('aiScope').value!=='mailbox';$('aiMailboxList').innerHTML=mailboxes.map((x,i)=>{const account=ctx.state.boot.accounts.find(a=>Number(a.id)===Number(x.accountId));const choice=moveFolderChoices([{name:x.folder}])[0];return `<div class="settingsRow"><span>${esc(account?.name||account?.email||String(x.accountId))} · ${esc(moveFolderChoices([{name:x.folder}]).find(c=>c.value===x.folder)?.label||choice?.label||x.folder)}</span><button data-mailbox-remove="${i}">${tx('Remover')}</button></div>`}).join('');p.querySelectorAll('[data-mailbox-remove]').forEach(b=>b.onclick=()=>{mailboxes.splice(Number(b.dataset.mailboxRemove),1);refreshMailboxes()})};
  const loadFolders=async()=>{const epoch=++mailboxEpoch,accountId=Number($('aiMailboxAccount').value);$('aiMailboxAdd').disabled=true;try{const tree=accountId?await invoke('list_folder_tree',{accountId}):[];if(epoch!==mailboxEpoch||!p.isConnected)return;$('aiMailboxFolder').innerHTML=options(moveFolderChoices(tree).map(x=>[x.value,x.label]));$('aiMailboxAdd').disabled=!accountId}catch{if(epoch===mailboxEpoch&&p.isConnected)status('Não foi possível carregar as pastas desta conta.')}};
  $('aiMailboxAccount').onchange=loadFolders;$('aiScope').onchange=refreshMailboxes;
  $('aiMailboxAdd').onclick=()=>{const accountId=Number($('aiMailboxAccount').value),folder=$('aiMailboxFolder').value;if(!accountId||!folder)return;if(!mailboxes.some(x=>Number(x.accountId)===accountId&&x.folder===folder))mailboxes.push({accountId,folder});refreshMailboxes()};
  refreshMailboxes();await loadFolders();
  for(const [id,key] of [['aiIgnoreImages','ai.content.ignore_images'],['aiCleanNoise','ai.content.clean_noise']]){const value=await invoke('get_setting_value',{key});if(!p.isConnected)return;$(id).checked=value!=='false'}
  const sources=async()=>{const result=await invoke('ai_rag_sources');if(!p.isConnected)return;const items=Array.isArray(result)?result:result.items||[];$('ragSources').innerHTML=items.map(x=>`<div class="settingsRow"><span>${esc(x.source||'')}<small>${esc(x.last_error?'Verifique esta fonte':'')}</small></span><button data-source-remove="${esc(x.id)}">${tx('Remover')}</button></div>`).join('');p.querySelectorAll('[data-source-remove]').forEach(b=>b.onclick=run(async()=>{if(await confirmDialog('Remover esta fonte?')){await invoke('ai_rag_delete_source',{sourceId:b.dataset.sourceRemove});await sources()}}))};
  $('ragAdd').onclick=run(async()=>{const source=$('ragSource').value.trim();if(!source)return;await invoke('ai_rag_add_source',{source,collection:$('ragCollection').value.trim()||'Geral',accountScope:$('ragScope').value.trim()||'*'});$('ragSource').value='';await sources();status('Fonte adicionada.',true)});
  $('ragReindex').onclick=run(async()=>{await invoke('ai_rag_reindex');await sources();status('Índice atualizado.',true)});
  for(const [id,command,prompt] of [['ragClear','ai_rag_clear_index','Apagar somente o índice derivado?'],['aiHistoryClear','ai_clear_history','Apagar histórico local de análises e sugestões?']])$(id).onclick=run(async()=>{if(await confirmDialog(prompt,{danger:true,confirmLabel:'Apagar'})){await invoke(command);status('Operação concluída.',true)}});
  await sources();
  if(!p.isConnected)return;
  const collections=async()=>{const result=await invoke('ai_collections');if(!p.isConnected)return;const items=Array.isArray(result)?result:result.items||[];$('ragCollections').innerHTML=items.map(x=>`<div class="settingsRow"><span data-i18n-skip>${esc(x.name)}<small>${esc(x.account_scope||'*')}</small></span><button data-collection-remove="${esc(x.id)}">${tx('Remover')}</button></div>`).join('');p.querySelectorAll('[data-collection-remove]').forEach(b=>b.onclick=run(async()=>{if(await confirmDialog('Remover coleção?',{danger:true,confirmLabel:'Remover'})){await invoke('ai_delete_collection',{id:b.dataset.collectionRemove});await collections();await sources()}}))};
  $('ragCollectionAdd').onclick=run(async()=>{const name=$('ragCollectionName').value.trim();if(!name)return;await invoke('ai_add_collection',{name,accountScope:$('ragCollectionScope').value.trim()||'*'});$('ragCollectionName').value='';await collections();status('Coleção adicionada.',true)});
  $('ragSearch').onclick=run(async()=>{const query=$('ragQuery').value.trim();if(!query)return;const result=await invoke('ai_rag_search',{query});if(p.isConnected)$('ragResults').textContent=JSON.stringify(result,null,2)});
  $('ragStatus').onclick=run(async()=>{const result=await invoke('ai_rag_status');if(p.isConnected)$('ragResults').textContent=JSON.stringify(result,null,2)});
  await collections();if(!p.isConnected)return;
  $('aiSave').onclick=run(async()=>{
    const main=binding(),enabled=$('aien').checked,scope=$('aiScope').value;
    if(connectionDirty){status('Salve as alterações da conexão antes de continuar.');return}
    if(enabled&&(!main.model||!main.provider_id)){status('Conecte um serviço e escolha um modelo para ativar a IA.');return}
    if(enabled&&tested!==JSON.stringify(main)&&!(cfg.enabled&&!retestConnections.has(main.provider_id)&&JSON.stringify(main)===JSON.stringify(cfg.advanced))){status('Teste o modelo escolhido antes de ativar a IA.');return}
    if(scope==='all'&&cfg.analysis_scope!=='all'&&!await confirmDialog('Permitir que a IA acesse e-mails de todas as contas? Serviços remotos recebem conteúdo fora deste computador.',{confirmLabel:'Permitir todas as contas'}))return;
    const custom=$('aiUseRoles').checked;
    const request={...cfg,enabled,fast:custom?{provider_id:$('aiFastProvider').value,model:$('aiFast').value.trim()}:main,advanced:main,embedding:{provider_id:$('aiEmbedProvider').value,model:$('aiEmbed').value.trim()},rag_enabled:$('ragEnabled').checked,analysis_scope:scope,preanalyze_received:$('aiPreanalyze').checked,shadow_mode:true};
    if(request.rag_enabled&&!request.embedding.model){status('Escolha um modelo de embeddings nas opções por tarefa para usar documentos.');return}
    // Commit activation last: an interrupted privacy update must leave AI off.
    await invoke('ai_save_runtime_config',{req:{...request,enabled:false}});
    cfg.enabled=false;ctx.state.boot.settings.aiEnabled=false;$('aien').checked=false;
    await invoke('ai_update_privacy_policy',{mode:scope,mailboxes,preanalyze:request.preanalyze_received});
    for(const [id,key] of [['aiIgnoreImages','ai.content.ignore_images'],['aiCleanNoise','ai.content.clean_noise']])await invoke('set_setting',{req:{key,value:String($(id).checked)}});
    if(enabled)await invoke('ai_save_runtime_config',{req:request});
    $('aien').checked=enabled;
    Object.assign(cfg,request);Object.assign(ctx.state.boot.settings,{aiEnabled:enabled,ragEnabled:request.rag_enabled,aiAnalysisScope:scope,aiPreanalyzeReceived:request.preanalyze_received,aiAuthorizedMailboxes:JSON.stringify(mailboxes)});
    $('aiSaved').textContent=tr('Salvo.');status('Configuração de IA salva.',true);
  });
}
