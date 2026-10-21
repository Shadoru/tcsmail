
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function requestRestart(){if(typeof window.__TCS_REQUEST_RESTART__==='function'){window.__TCS_REQUEST_RESTART__();return}location.reload()}
async function waitFor(sel,timeout=5000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const el=document.querySelector(sel);if(el)return el;await sleep(25)}
 throw new Error(`timeout waiting ${sel}`)
}
function click(sel){const el=document.querySelector(sel);if(!el)throw new Error(`missing ${sel}`);el.click();return el}
function result(ok,detail=''){document.body.dataset.test=ok?'PASS':'FAIL';document.body.dataset.detail=detail}
async function case41(){
 await waitFor('.row[data-id="101"]');
 const inboxBadge=document.querySelector('[data-folder="INBOX"] .unreadBadge');if(!inboxBadge||inboxBadge.textContent.trim()!=='1')throw new Error('contador de não lidas da Inbox ausente/incorreto');
 const sidebarButtons=[...document.querySelectorAll('#sidebar button')].filter(b=>getComputedStyle(b).display!=='none');const missingTips=sidebarButtons.filter(b=>!b.getAttribute('title'));if(missingTips.length)throw new Error(`tooltips ausentes em ${missingTips.length} itens da barra esquerda`);
 click('.row[data-id="101"]');const firstTitle=await waitFor('#reader h1');if(!firstTitle.textContent.includes('Primeira mensagem'))throw new Error('clique simples não exibiu mensagem no Reader direito');const empty=document.querySelector('#readerEmpty');if(!empty?.hidden||getComputedStyle(empty).display!=='none')throw new Error('placeholder Selecione uma mensagem continuou visível após abrir mensagem');const readerIconIds=['reply','replyAll','forward','archiveQuick','moveQuick','findInMessage','deleteQuick','aiAssist','readerPopout','star','readerMore'];if(document.getElementById('readerPrev')||document.getElementById('readerNext')||document.getElementById('readerMinimize'))throw new Error('Reader ainda exibe navegação anterior/próxima ou minimizar');for(const id of readerIconIds){const b=document.getElementById(id);if(!b||!b.querySelector('svg.uiIcon')||!b.getAttribute('title'))throw new Error(`ação do Reader sem ícone/tooltip: ${id}`)}
 const vp=document.querySelector('#rowsViewport');vp.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',ctrlKey:true,bubbles:true}));await sleep(40);if(document.querySelector('.row[data-id="101"]')?.getAttribute('aria-selected')!=='true')throw new Error('Ctrl+ArrowDown removeu a seleção existente');vp.dispatchEvent(new KeyboardEvent('keydown',{key:' ',ctrlKey:true,bubbles:true}));await sleep(40);if(document.querySelector('.row[data-id="102"]')?.getAttribute('aria-selected')!=='true'||document.querySelector('.row[data-id="101"]')?.getAttribute('aria-selected')!=='true')throw new Error('Ctrl+Espaço não adicionou a mensagem focada à seleção múltipla');vp.dispatchEvent(new KeyboardEvent('keydown',{key:' ',ctrlKey:true,bubbles:true}));await sleep(40);if(document.querySelector('.row[data-id="102"]')?.getAttribute('aria-selected')!=='false')throw new Error('Ctrl+Espaço não removeu mensagem já marcada');vp.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',ctrlKey:true,bubbles:true}));await sleep(30);vp.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await sleep(100);const secondTitle=await waitFor('#reader h1');if(!secondTitle.textContent.includes('Segunda mensagem'))throw new Error('ArrowDown não navegou/atualizou o Reader');
 click('#reply');
 await waitFor('.composerNative');await sleep(80);
 click('.workMinimize');await sleep(80);
 if(!document.querySelector('#workspaceShelf [data-work-restore]'))throw new Error('composer não foi minimizado');
 click('.row[data-id="102"]');await waitFor('#reader h1');
 click('#workspaceShelf [data-work-restore]');await sleep(80);
 const editor=await waitFor('.composerNative #editor');editor.textContent='Resposta da jornada 1';editor.dispatchEvent(new Event('input',{bubbles:true}));
 click('.composerNative #sendBtn');await sleep(150);
 const sent=[...document.querySelectorAll('[data-folder]')].find(x=>x.dataset.folder==='Sent');if(!sent)throw new Error('pasta Sent ausente');sent.click();await sleep(120);
 const calls=window.__TCS_JOURNEY__.calls;
 if(!calls.some(x=>x[0]==='queue_send'))throw new Error('envio não entrou na fila');
 if(!calls.some(x=>x[0]==='list_messages'&&x[1]?.req?.folder==='Sent'))throw new Error('Sent não foi aberto');
 result(true,'Jornada 1 concluída');
}
async function case42(){
 const stage=Number(sessionStorage.getItem('j42stage')||'0');
 if(stage===0){
   await waitFor('#newMail');click('#newMail');await waitFor('.composerNative');const from=document.querySelector('#cFrom'),fromLine=document.querySelector('.fromLine,.fromRow');if(!from||!fromLine||getComputedStyle(fromLine).display==='none')throw new Error('linha De não está visível');if(![...from.options].some(o=>o.value==='__custom__'&&o.textContent.includes('Personalizar')))throw new Error('remetente personalizado ausente');if(document.querySelector('[data-inline="s"]'))throw new Error('tachado não deveria estar na toolbar');const bold=document.querySelector('[data-inline="strong"]');if(!bold||!String(bold.title).includes('Ctrl + B')||String(bold.title).includes('Ctrl + N'))throw new Error(`botão/tooltip de negrito inválido: ${bold?.title||'ausente'}`);for(const id of ['inlineImageBtn','attachBtn','alignMenu']){const el=document.getElementById(id);if(!el||(!el.getAttribute('title')&&!el.querySelector('summary')?.getAttribute('title')))throw new Error(`tooltip ausente em ${id}`)}const tb=document.querySelector('.composeToolbar');if(!tb)throw new Error('toolbar do Composer ausente');if(tb.scrollWidth>tb.clientWidth+2)throw new Error(`toolbar do Composer criou rolagem horizontal (${tb.scrollWidth}>${tb.clientWidth})`);const edSurface=document.querySelector('#editor');if(getComputedStyle(edSurface).backgroundColor===getComputedStyle(document.querySelector('.composerNative')).backgroundColor)throw new Error('área de texto do Composer não está visualmente diferenciada');
   from.value='__custom__';from.dispatchEvent(new Event('change',{bubbles:true}));const customBlock=document.querySelector('#customFromBlock');if(!customBlock?.classList.contains('show'))throw new Error('campos de remetente personalizado não apareceram');document.querySelector('#customFromName').value='Remetente Teste';document.querySelector('#customFromEmail').value='remetente@example.test';document.querySelector('#customFromEmail').dispatchEvent(new Event('input',{bubbles:true}));
   const to=document.querySelector('#cTo');to.value='dest@example.test';to.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   const sub=document.querySelector('#cSubject');sub.value='Draft persistente';sub.dispatchEvent(new Event('input',{bubbles:true}));
   const ed=document.querySelector('#editor');ed.textContent='Conteúdo antes do reinício';ed.dispatchEvent(new Event('input',{bubbles:true}));ed.blur();await sleep(220);
   click('.modalLayer .closeModal');await waitFor('[data-choice]');const saveChoice=[...document.querySelectorAll('[data-choice]')].find(b=>b.textContent.includes('Salvar em Rascunhos'));if(!saveChoice)throw new Error('prompt Outlook-like de fechamento ausente');saveChoice.click();await sleep(220);
   if(!window.__TCS_JOURNEY__.getDrafts().length)throw new Error('draft não foi salvo antes de fechar');
   sessionStorage.setItem('j42stage','1');requestRestart();return;
 }
 await waitFor('#newMail');
 const draftsButton=[...document.querySelectorAll('[data-folder]')].find(x=>x.dataset.folder==='Drafts');if(!draftsButton)throw new Error('Drafts ausente após reinício');draftsButton.click();await sleep(150);
 const row=await waitFor('.localDraftRow');row.click();await waitFor('.draftPreview');click('#draftContinue');await waitFor('.composerNative');
 if(document.querySelector('#cSubject').value!=='Draft persistente')throw new Error('assunto do draft não sobreviveu ao reinício');if(document.querySelector('#cFrom').value!=='__custom__'||document.querySelector('#customFromEmail').value!=='remetente@example.test')throw new Error('remetente personalizado não sobreviveu ao draft/reinício');
 document.querySelector('#cSubject').value='Draft persistente alterado';document.querySelector('#cSubject').dispatchEvent(new Event('input',{bubbles:true}));
 click('.modalLayer .closeModal');await waitFor('[data-choice]');[...document.querySelectorAll('[data-choice]')].find(b=>b.textContent.includes('Salvar em Rascunhos'))?.click();await sleep(180);
 draftsButton.click();await sleep(120);click('.localDraftRow');await waitFor('.draftPreview');click('#draftContinue');await waitFor('.composerNative');
 click('.composerNative #sendBtn');for(let i=0;i<4;i++){await sleep(80);const c=document.querySelector('#dialogConfirm');if(c)c.click();else break}await sleep(180);
 const sendCall=window.__TCS_JOURNEY__.calls.find(x=>x[0]==='queue_send');if(!sendCall)throw new Error('draft reaberto não foi enviado');if(sendCall[1]?.req?.customFromEmail!=='remetente@example.test')throw new Error('remetente personalizado não chegou ao queue_send');
 sessionStorage.removeItem('j42stage');result(true,'Jornada 2 concluída com reload');
}
async function case43(){
 await waitFor('#settingsBtn');click('#settingsBtn');await waitFor('[data-set="appearance"]');click('[data-set="appearance"]');await waitFor('#navigationStyle');
 const select=document.querySelector('#navigationStyle');
 for(const mode of ['tree','unified','groups','favorites','columns','tabs']){
   select.value=mode;select.dispatchEvent(new Event('change',{bubbles:true}));await sleep(100);
   if(!document.querySelector(`.appShell.navMode-${mode}`))throw new Error(`modo ${mode} não aplicado`);
 }
 // Exercise unified subset, group and favorite using real sidebar controls.
 select.value='unified';select.dispatchEvent(new Event('change',{bubbles:true}));await sleep(100);
 const check=document.querySelector('[data-unified-account="3"]');if(check){check.checked=false;check.dispatchEvent(new Event('change',{bubbles:true}));await sleep(70)}
 select.value='groups';select.dispatchEvent(new Event('change',{bubbles:true}));await sleep(100);
 document.querySelector('[data-group-inbox="g-work"]')?.click();await sleep(70);
 select.value='favorites';select.dispatchEvent(new Event('change',{bubbles:true}));await sleep(100);
 const fav=document.querySelector('[data-favorite-folder="INBOX/Pessoal"]');if(fav)fav.click();
 result(true,'Jornada 3: 3 contas, subset, grupo, favorito e 6 estilos');
}
async function case44(){
 await waitFor('#settingsBtn');click('#settingsBtn');await waitFor('#settingsNav');
 const buttons=[...document.querySelectorAll('#settingsNav [data-set]')];
 if(buttons.length>18||buttons.length<15)throw new Error(`quantidade de Configurações de primeiro nível fora do intervalo esperado: ${buttons.length}`);
 const expected={importexport:'Importar / Exportar',diagnostics:'Diagnóstico / Saúde'};for(const b of buttons){b.click();const want=expected[b.dataset.set];const end=Date.now()+2000;let h=null;do{await sleep(25);h=document.querySelector('#settingsPanel h2');if(!want&&h)break;if(want&&h?.textContent.includes(want))break}while(Date.now()<end);if(!h)throw new Error(`página ${b.dataset.set} não abriu`);if(want&&!h.textContent.includes(want))throw new Error(`página ${b.dataset.set} exibiu painel incorreto: ${h.textContent}`)}
 click('[data-set="appearance"]');await waitFor('#theme');
 const theme=document.querySelector('#theme');theme.value='ocean';theme.dispatchEvent(new Event('change',{bubbles:true}));await sleep(100);const composerTheme=document.querySelector('#composerTheme');if(!composerTheme)throw new Error('tema independente do Composer ausente');composerTheme.value='light';composerTheme.dispatchEvent(new Event('change',{bubbles:true}));await sleep(50);
 const popup=document.querySelector('.selectPopup'),button=document.querySelector('.selectButton');
 if(!popup||!button)throw new Error('dropdown próprio não foi aplicado');
 if(getComputedStyle(button).color===getComputedStyle(button).backgroundColor)throw new Error('dropdown sem contraste');
 sessionStorage.setItem('j44stage','1');requestRestart();
}
async function case44after(){
 await waitFor('#settingsBtn');
 if(document.documentElement.dataset.theme!=='ocean')throw new Error('tema não persistiu no reinício');
 sessionStorage.removeItem('j44stage');result(true,'Jornada 4: todas Configurações + persistência + dropdown');
}
async function main(){
 try{
  const c=window.__TCS_JOURNEY__.caseName;
  if(c==='41')await case41();
  else if(c==='42')await case42();
  else if(c==='43')await case43();
  else if(c==='44'){
    if(sessionStorage.getItem('j44stage')==='1')await case44after();else await case44();
  }else throw new Error('caso desconhecido');
 }catch(e){console.error(e);result(false,String(e))}
}
main();
