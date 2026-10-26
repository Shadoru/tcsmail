import {workspaceHtml,bindAiWorkspace,authorizeAiMessage} from './ai_workspace.js';
import {composerQuery,composerQueryAll,recipientNode} from './composer_lookup.js';
import {invoke,$,$$,esc,modal,formatBytes,fromLocalInput,toast,confirmDialog,promptDialog,choiceDialog} from './lib.js';
import {matches as shortcutMatches,tooltip as shortcutTooltip} from './shortcuts.js';
import {inspectMessageSafety, safeEmailDomain, validateOutgoingTimes} from './send_safety.js';
import {parseRecipientToken,parseRecipientList,formatRecipient,recipientListValue,recipientEmails,validRecipientCount,mergeRecipient} from './recipients.js';
import {execEditorCommand,selectedCell,insertTableAtSelection,tableAddRow,tableDeleteRow,tableAddColumn,tableDeleteColumn,tableMergeRight,tableMergeDown,tableSetAlign,tableTabNavigate,stripUnsafePaste} from './rich_editor.js';

function selectionIn(editor){const s=getSelection();if(!s||!s.rangeCount)return null;const r=s.getRangeAt(0);return editor.contains(r.commonAncestorContainer)?r:null}
function closestFormattingNode(editor,range,tag){let n=range.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;tag=tag.toLowerCase();while(n&&n!==editor){if(n.tagName?.toLowerCase()===tag)return n;n=n.parentElement}return null}
function unwrapNode(node){const p=node.parentNode;if(!p)return;while(node.firstChild)p.insertBefore(node.firstChild,node);node.remove()}
function wrapSelection(editor,tag,style={}){const r=selectionIn(editor);if(!r||r.collapsed)return;const el=document.createElement(tag);Object.assign(el.style,style);try{r.surroundContents(el)}catch{const frag=r.extractContents();el.append(frag);r.insertNode(el)}const s=getSelection();s.removeAllRanges();const nr=document.createRange();nr.selectNodeContents(el);s.addRange(nr)}
function toggleInline(editor,tag){const r=selectionIn(editor);if(!r||r.collapsed)return;const active=closestFormattingNode(editor,r,tag);if(active){const s=getSelection();const text=r.toString();unwrapNode(active);if(text){const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const idx=n.nodeValue.indexOf(text);if(idx>=0){const nr=document.createRange();nr.setStart(n,idx);nr.setEnd(n,idx+text.length);s.removeAllRanges();s.addRange(nr);break}}}return}wrapSelection(editor,tag)}
function insertNode(editor,node){const r=selectionIn(editor);if(!r){editor.append(node);return}r.deleteContents();r.insertNode(node);r.setStartAfter(node);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)}
function styleBlock(editor,styles){const r=selectionIn(editor);if(!r)return;let node=r.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;while(node&&node!==editor&&!/^(P|DIV|LI|BLOCKQUOTE|TD|H[1-6])$/.test(node.tagName))node=node.parentElement;if(!node||node===editor){const div=document.createElement('div');Object.assign(div.style,styles);if(r.collapsed){div.innerHTML='<br>';insertNode(editor,div)}else{const frag=r.extractContents();div.append(frag);r.insertNode(div)}}else Object.assign(node.style,styles)}

function cloneEditorRange(editor){const r=selectionIn(editor);return r?r.cloneRange():null}
function restoreEditorRange(editor,range){if(!range)return false;try{if(!editor.contains(range.commonAncestorContainer))return false;const s=getSelection();s.removeAllRanges();s.addRange(range.cloneRange());return true}catch{return false}}
function applyStyleToRange(editor,range,styles){
 if(!range||range.collapsed)return null;
 try{
  const work=range.cloneRange();
  if(!editor.contains(work.commonAncestorContainer))return null;
  const span=document.createElement('span');Object.assign(span.style,styles||{});
  const frag=work.extractContents();span.append(frag);work.insertNode(span);
  const nr=document.createRange();nr.selectNodeContents(span);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(nr);
  return nr.cloneRange();
 }catch{return null}
}
function formatBlockTag(editor,tag){const r=selectionIn(editor);if(!r)return;tag=String(tag||'p').toLowerCase();if(!['p','h1','h2','h3','pre'].includes(tag))tag='p';let node=r.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;while(node&&node!==editor&&!/^(P|DIV|H[1-6]|PRE|BLOCKQUOTE|LI)$/.test(node.tagName))node=node.parentElement;if(!node||node===editor){const block=document.createElement(tag);if(r.collapsed){block.append(document.createElement('br'));r.insertNode(block)}else{const frag=r.extractContents();block.append(frag);r.insertNode(block)}const nr=document.createRange();nr.selectNodeContents(block);nr.collapse(false);getSelection().removeAllRanges();getSelection().addRange(nr);return}if(node.tagName.toLowerCase()===tag)return;const replacement=document.createElement(tag);for(const a of [...node.attributes])if(a.name==='style'||a.name.startsWith('data-'))replacement.setAttribute(a.name,a.value);while(node.firstChild)replacement.append(node.firstChild);node.replaceWith(replacement);const nr=document.createRange();nr.selectNodeContents(replacement);nr.collapse(false);getSelection().removeAllRanges();getSelection().addRange(nr)}
function insertTabStop(editor){const r=selectionIn(editor);if(!r)return;const span=document.createElement('span');span.className='composeTabStop';span.dataset.tabStop='1';span.textContent='\u00a0\u00a0\u00a0\u00a0';r.deleteContents();r.insertNode(span);r.setStartAfter(span);r.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(r)}

function textVersion(editor){return (editor.innerText||'').replace(/\n{3,}/g,'\n\n').trim()}
function applySignature(editor,body){if(!body)return;const marker=editor.querySelector('[data-signature]');if(marker)marker.remove();const div=document.createElement('div');div.dataset.signature='1';div.className='signature';div.innerHTML=`<br><br>${esc(body).replace(/\n/g,'<br>')}`;editor.append(div)}

function toolbarIcon(name,label=''){
 const paths={
  bold:'<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/>',italic:'<path d="M9 4h7M8 20h7M13 4 10 20"/>',underline:'<path d="M7 4v7a5 5 0 0 0 10 0V4M5 21h14"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  align:'<path d="M4 6h16M4 10h11M4 14h16M4 18h9"/>',left:'<path d="M4 6h16M4 10h10M4 14h16M4 18h8"/>',center:'<path d="M4 6h16M7 10h10M4 14h16M8 18h8"/>',right:'<path d="M4 6h16M10 10h10M4 14h16M12 18h8"/>',justify:'<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',indent:'<path d="M9 6h11M9 12h11M9 18h11M4 9l3 3-3 3"/>',outdent:'<path d="M9 6h11M9 12h11M9 18h11M7 9l-3 3 3 3"/>',
  quote:'<path d="M7 17H4v-4c0-4 2-6 5-7v2c-2 1-2 2-2 4h2v5H7Zm10 0h-3v-4c0-4 2-6 5-7v2c-2 1-2 2-2 4h2v5h-2Z"/>',table:'<path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M15 5v14"/>',clear:'<path d="m7 15 6-9 5 4-6 9H7l-3-3 3-3M14 20h6"/>',undo:'<path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6"/>',redo:'<path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6"/>',
  image:'<path d="M4 5h16v14H4zM7 15l3-3 3 3 2-2 3 3M8 9h.01"/>',attach:'<path d="m9 12 5-5a3 3 0 1 1 4 4l-7 7a5 5 0 0 1-7-7l7-7"/>',smart:'<path d="M12 2l2.2 5.2L20 9l-5.8 1.8L12 16l-2.2-5.2L4 9l5.8-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',more:'<path d="M6 12h.01M12 12h.01M18 12h.01"/>'
 };
 return `<svg class="composeIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.more}</svg>${label?`<span class="srOnly">${esc(label)}</span>`:''}`
}


function installRecipientField(root,inputId,suggestId,seedValue=''){
 const input=recipientNode(root,inputId),box=recipientNode(root,suggestId);if(!input||!box)return null;
 const wrap=input.closest('.recipientInputWrap');const chips=document.createElement('div');chips.className='recipientChips';input.before(chips);
 let recipients=parseRecipientList(seedValue),items=[],active=-1,seq=0,timer=null;
 const emails=()=>new Set(recipientEmails(recipients).map(x=>x.toLowerCase()));
 const value=()=>recipientListValue(recipients);
 const notify=()=>input.dispatchEvent(new Event('recipientchange',{bubbles:true}));
 const renderChips=()=>{
   chips.innerHTML=recipients.map((r,i)=>`<button type="button" class="recipientChip" data-recipient-chip="${i}" title="Clique para editar"><span>${esc(r.name||r.email)}</span>${r.name?`<small>${esc(r.email)}</small>`:''}<i data-recipient-remove="${i}" aria-label="Remover">×</i></button>`).join('');
   $$('[data-recipient-remove]',chips).forEach(x=>x.onclick=e=>{e.preventDefault();e.stopPropagation();recipients.splice(Number(x.dataset.recipientRemove),1);renderChips();notify();input.focus()});
   $$('[data-recipient-chip]',chips).forEach(x=>x.onclick=e=>{if(e.target.closest('[data-recipient-remove]'))return;const i=Number(x.dataset.recipientChip),r=recipients.splice(i,1)[0];renderChips();input.value=formatRecipient(r);input.focus();input.setSelectionRange(input.value.length,input.value.length);notify()})
 };
 const hide=()=>{items=[];active=-1;box.classList.add('hidden');box.innerHTML='';input.setAttribute('aria-expanded','false')};
 const renderSuggestions=()=>{box.innerHTML=items.map((c,i)=>`<button type="button" role="option" aria-selected="${i===active}" data-recipient-index="${i}" class="${i===active?'active':''}"><span><b>${esc(c.name||c.email)}</b><small>${esc(c.email)}</small></span><em>${c.source==='contact'?'Contato':c.source==='recent_recipient'?'Recente':'Histórico'}</em></button>`).join('');box.classList.toggle('hidden',!items.length);input.setAttribute('aria-expanded',items.length?'true':'false');$$('[data-recipient-index]',box).forEach(b=>b.onmousedown=e=>{e.preventDefault();choose(Number(b.dataset.recipientIndex))})};
 const commitRaw=raw=>{
   const parts=String(raw??input.value).split(/[;,]\s*/).map(x=>x.trim()).filter(Boolean);
   let changed=false,invalid=[];
   for(const part of parts){const r=parseRecipientToken(part);if(r){recipients=mergeRecipient(recipients,r);changed=true}else invalid.push(part)}
   if(changed){input.value=invalid.join(', ');renderChips();notify()}
   return {changed,invalid}
 };
 const choose=i=>{const c=items[i];if(!c)return;recipients=mergeRecipient(recipients,{name:c.name||'',email:c.email});input.value='';renderChips();notify();hide();input.focus()};
 const querySuggestions=()=>{
   clearTimeout(timer);const query=input.value.trim();if(query.length<2||/[;,]$/.test(query)){hide();return}
   const my=++seq;timer=setTimeout(async()=>{
     let found=await invoke('recipient_suggestions',{query}).catch(()=>null);
     if(!Array.isArray(found))found=await invoke('list_contacts',{query}).catch(()=>[]);
     if(my!==seq)return;const used=emails();
     items=found.filter(c=>c.email&&!used.has(String(c.email).toLowerCase())).slice(0,10);active=items.length?0:-1;renderSuggestions()
   },120)
 };
 input.value='';input.setAttribute('aria-expanded','false');input.setAttribute('role','combobox');
 input.addEventListener('input',()=>{if(/[;,]\s*$/.test(input.value)){const raw=input.value.replace(/[;,]\s*$/,'');commitRaw(raw);input.value='';hide()}else querySuggestions()});
 input.addEventListener('paste',e=>{const raw=e.clipboardData?.getData('text')||'';if(!raw||(!raw.includes(',')&&!raw.includes(';')&&!raw.includes('\n')))return;e.preventDefault();commitRaw(raw.replace(/\n+/g,','));input.value='';hide()});
 input.addEventListener('keydown',e=>{
   if(!box.classList.contains('hidden')){
     if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(items.length-1,active+1);renderSuggestions();return}
     if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(0,active-1);renderSuggestions();return}
     if((e.key==='Enter'||e.key==='Tab')&&active>=0){if(e.key==='Enter'){e.preventDefault();choose(active)}else{const item=items[active];if(input.value.trim()===String(item?.email||'')||input.value.trim()===String(item?.name||''))choose(active);else commitRaw(input.value);hide()}return}
     if(e.key==='Escape'){e.preventDefault();hide();return}
   }
   if((e.key==='Enter'||e.key==='Tab'||e.key===','||e.key===';')&&input.value.trim()){
     const r=commitRaw(input.value);if(r.changed){if(e.key!=='Tab')e.preventDefault();input.value='';hide();return}
   }
   if(e.key==='Backspace'&&!input.value&&recipients.length){recipients.pop();renderChips();notify()}
 });
 input.addEventListener('blur',()=>setTimeout(()=>{if(input.value.trim())commitRaw(input.value);if(parseRecipientToken(input.value))input.value='';hide()},140));
 wrap?.addEventListener('click',e=>{if(e.target===wrap||e.target===chips)input.focus()});
 renderChips();
 return {value,emails:()=>recipientEmails(recipients),count:()=>validRecipientCount(recipients),commit:()=>{if(input.value.trim()){const r=commitRaw(input.value);if(r.changed)input.value=''}return value()},set(raw){recipients=parseRecipientList(raw);input.value='';renderChips();notify()},items:()=>recipients.map(x=>({...x}))}
}

export async function openComposer(ctx,seed={},options={}){
 // Scope control lookups to this draft, since several editors coexist in one WebView.
 // Real DOM IDs are unique; data-tcs-id preserves the template's local selector names.
 const $=(selector,scope=document)=>composerQuery(selector,scope,!!options.inlineHost);
 const $$=(selector,scope=document)=>composerQueryAll(selector,scope,!!options.inlineHost);
 let accountId=seed.accountId??ctx.state.account??ctx.state.boot.default_account_id??ctx.state.boot.accounts[0]?.id;
 if(!accountId){toast('Cadastre uma conta antes de redigir.');ctx.openSettings('accounts');return}
 const scoped=async(key,fallback)=>{const v=await invoke('get_setting_value',{key:`account.${accountId}.${key}`}).catch(()=>null);return v==null?fallback:v};
 const composePrefs={
   font:await scoped('composition.default_font',ctx.state.boot.settings.composeFont||'Sans'),
   size:await scoped('composition.default_font_size',ctx.state.boot.settings.composeSize||'11'),
   undo:await scoped('composition.undo_seconds',ctx.state.boot.settings.composeUndo||'10'),
   spell:(await scoped('composition.spellcheck',String(ctx.state.boot.settings.composeSpellcheck!==false)))==='true',
   receipt:(await scoped('composition.request_receipt',String(!!ctx.state.boot.settings.requestReceiptDefault)))==='true',
   format:await scoped('composition.default_format',ctx.state.boot.settings.composeFormat||'html')
 };
 const r13Pref=async(key,defaultValue)=>{const accountValue=await invoke('get_setting_value',{key:`account.${accountId}.composition.${key}`}).catch(()=>null);if(accountValue!=null)return accountValue;return await invoke('get_setting_value',{key:`composition.${key}`}).catch(()=>null)??defaultValue};
 const safetyPref=async(key,fallback)=>String(await r13Pref(key,fallback));
 const safety={attachment:(await safetyPref('safety_attachment','true'))==='true',external:(await safetyPref('safety_external','false'))==='true',internalDomains:(await safetyPref('safety_internal_domains','')).split(/[;,\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean),domainHints:(await safetyPref('safety_domain_hints','false'))==='true',replyAll:(await safetyPref('safety_reply_all','false'))==='true',localLinks:(await safetyPref('safety_local_links','true'))==='true',finalReview:(await safetyPref('safety_review','false'))==='true'};
 const r13={recovery:(await r13Pref('recovery','true'))==='true',history:(await r13Pref('version_history','false'))==='true',confirmDiscard:(await r13Pref('confirm_discard','true'))==='true',drag:(await r13Pref('drag_files','true'))==='true',paste:(await r13Pref('paste_images','true'))==='true'};
 const [idsAll,initialSigs,templatesAll,systemFonts]=await Promise.all([
   invoke('list_identities',{accountId}).catch(()=>[]),invoke('list_signatures',{accountId}).catch(()=>[]),invoke('list_templates').catch(()=>[]),invoke('list_system_fonts').catch(()=>[])
 ]);
 const identityMeta=async(id)=>{if(!id)return{};const raw=await invoke('get_setting_value',{key:`identity.${id}.meta`}).catch(()=>null);try{return raw?JSON.parse(raw):{}}catch{return{}}};
 const templates=[];for(const t of templatesAll){const raw=await invoke('get_setting_value',{key:`template.${t.id}.account_id`}).catch(()=>null);const aid=raw==null||raw===''?null:Number(raw);if(aid==null||aid===Number(accountId))templates.push({...t,_accountId:aid})}
 let sigs=initialSigs;
 const ids=[];for(const i of idsAll){const meta=await identityMeta(i.id);if(meta.enabled===false)continue;ids.push({...i,_meta:meta});}
 let account=ctx.state.boot.accounts.find(a=>a.id===accountId);
 const accountMetaRaw=await invoke('get_setting_value',{key:`account.${accountId}.identity.meta`}).catch(()=>null);let accountMeta={};try{accountMeta=accountMetaRaw?JSON.parse(accountMetaRaw):{}}catch{accountMeta={}}
 let senders=[{id:null,name:accountMeta.display_name||account?.email,email:account?.email,signatureId:accountMeta.signature_new_id||null,_meta:accountMeta},...ids.map(i=>({id:i.id,name:i.name,email:i.email,signatureId:i.signature_id,isDefault:i.is_default,_meta:i._meta||{}}))];const senderById=id=>senders.find(x=>String(x.id??'')===String(id??''))||senders[0];
 const draftId=seed.draftId||crypto.randomUUID();const existingWorkKey=`composer:${draftId}`;if(seed.draftId&&ctx.state.workspace?.get?.(existingWorkKey)){ctx.workspaceRestore?.(existingWorkKey);return}let dirty=false,attachments=[];let autoSaveTimer,remoteDraftTimer,saveSoonTimer=null,remoteSoonTimer=null,selectionHandler=null,shortcutHandler=null;let closeGuard=async()=>true;
 const accountChoicePrefix='__account__:';const extraAccounts=ctx.state.boot.accounts.filter(a=>Number(a.id)!==Number(accountId));
 const defaultIdentity=seed.identityId??ids.find(i=>i.is_default)?.id??null; const useCustomSender=!!seed.customFromEmail; const senderOptions=senders.map((s,i)=>`<option value="${s.id??''}" ${!useCustomSender&&defaultIdentity===s.id?'selected':''}>${esc(s.name)} &lt;${esc(s.email)}&gt;</option>`).join('')+extraAccounts.map(a=>`<option value="${accountChoicePrefix}${a.id}">Trocar para ${esc(a.name||a.email)} &lt;${esc(a.email)}&gt;</option>`).join('')+`<option value="__custom__" ${useCustomSender?'selected':''}>Personalizar o endereço do remetente…</option>`;
 const templateOptions=['<option value="">Template…</option>',...templates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`)].join('');
 const fontList=[...new Set(['Sans','Serif','Monospace',...systemFonts])];const fontOptions=fontList.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
 const workKey=`composer:${draftId}`;
 const {root,close,requestClose,minimize,restore,isClosed}=modal(seed.subject?'Mensagem':'Nova mensagem',`<div class="composerNative">
  <div class="composeTop">

   <div class="fromLine"><span class="fromLabel">De:</span><select id="cFrom" title="Escolher remetente ou personalizar o endereço">${senderOptions}</select><div id="customFromBlock" class="customFromInline customFromPopover ${useCustomSender?'show':''}" role="dialog" aria-label="Personalizar remetente"><div class="customFromHead"><strong>Personalizar remetente</strong><button type="button" id="customFromClose" title="Fechar" aria-label="Fechar">×</button></div><label class="customSenderName"><span>Nome exibido</span><input id="customFromName" value="${esc(seed.customFromName||'')}" placeholder="Nome do remetente" aria-label="Nome do remetente personalizado"><small>Alterar apenas o nome normalmente não afeta a autenticação do endereço.</small></label><label class="customSenderAddress"><span>Endereço de e-mail</span><input id="customFromEmail" type="email" value="${esc(seed.customFromEmail||'')}" placeholder="remetente@exemplo.com" aria-label="E-mail do remetente personalizado"><small><b>Atenção:</b> use somente um alias/identidade autorizado. Outro endereço pode ser recusado e afetar SPF/DKIM/DMARC.</small></label><div class="customFromActions"><button type="button" id="customFromSave" class="primary">Salvar</button></div></div></div>
   <label class="recipientRow"><span>Para</span><div class="recipientInputWrap"><input id="cTo" autocomplete="off" aria-autocomplete="list" aria-controls="cToSuggest" value="${esc(seed.to||'')}"><div id="cToSuggest" class="recipientSuggest hidden" role="listbox"></div></div><button class="mini" id="toggleCc">Cc</button><button class="mini" id="toggleBcc">Cco</button></label>
   <div id="ccBlock" class="collapse ${(seed.cc||seed.ccVisible)?'show':''}"><label class="recipientRow"><span>Cc</span><div class="recipientInputWrap"><input id="cCc" autocomplete="off" aria-autocomplete="list" aria-controls="cCcSuggest" value="${esc(seed.cc||'')}"><div id="cCcSuggest" class="recipientSuggest hidden" role="listbox"></div></div></label></div>
   <div id="bccBlock" class="collapse ${(seed.bcc||seed.bccVisible)?'show':''}"><label class="recipientRow"><span>Cco</span><div class="recipientInputWrap"><input id="cBcc" autocomplete="off" aria-autocomplete="list" aria-controls="cBccSuggest" value="${esc(seed.bcc||'')}"><div id="cBccSuggest" class="recipientSuggest hidden" role="listbox"></div></div></label></div>
   <label><span>Assunto</span><input id="cSubject" value="${esc(seed.subject||'')}"></label>
  </div>
  <div class="toolbar composeToolbar" role="toolbar" aria-label="Formatação e inserção">
   <button class="composeIconButton" data-inline="strong" title="${shortcutTooltip('bold',ctx.state.boot.settings)}" aria-label="Negrito"><span class="boldGlyph" aria-hidden="true">B</span></button>
   <button class="composeIconButton" data-inline="em" title="${shortcutTooltip('italic',ctx.state.boot.settings)}" aria-label="Itálico">${toolbarIcon('italic')}</button>
   <button class="composeIconButton" data-inline="u" title="${shortcutTooltip('underline',ctx.state.boot.settings)}" aria-label="Sublinhado">${toolbarIcon('underline')}</button>
   <select id="fontFamily" class="toolbarFont" title="Fonte" aria-label="Fonte">${fontOptions}</select><input id="fontSize" title="Tamanho da fonte em pontos" aria-label="Tamanho da fonte" type="number" min="8" max="72" value="${esc(composePrefs.size)}">
   <label class="colorTool" title="Cor do texto"><input id="fontColor" type="color" value="#202124" aria-label="Cor do texto"></label><label class="colorTool highlightTool" title="Cor de realce"><input id="highlight" type="color" value="#fff59d" aria-label="Cor de realce"></label>
   <select id="blockFormat" class="toolbarFormat" title="Formato do parágrafo" aria-label="Formato do parágrafo"><option value="p">Parágrafo</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option><option value="pre">Código</option></select>
   <details class="toolbarMenu" id="moreFormatMenu"><summary title="Mais formatação" aria-label="Mais formatação">${toolbarIcon('more')}</summary><div class="toolbarPopover"><button id="strikeBtn"><s>S</s><span>Tachado</span></button><button id="subBtn"><span>X₂</span><span>Subscrito</span></button><button id="supBtn"><span>X²</span><span>Sobrescrito</span></button></div></details>
   <button class="composeIconButton" id="linkBtn" title="${shortcutTooltip('link',ctx.state.boot.settings)}" aria-label="Inserir link">${toolbarIcon('link')}</button>
   <details class="toolbarMenu" id="alignMenu"><summary title="Alinhamento" aria-label="Alinhamento">${toolbarIcon('align')}</summary><div class="toolbarPopover alignPopover"><button id="alignLeft">${toolbarIcon('left')}<span>À esquerda</span></button><button id="alignCenter">${toolbarIcon('center')}<span>Centralizado</span></button><button id="alignRight">${toolbarIcon('right')}<span>À direita</span></button><button id="alignJustify">${toolbarIcon('justify')}<span>Justificado</span></button></div></details>
   <details class="toolbarMenu" id="listMenu"><summary title="Listas e recuo" aria-label="Listas e recuo">${toolbarIcon('list')}</summary><div class="toolbarPopover"><button id="ulBtn">${toolbarIcon('list')}<span>Lista com marcadores</span></button><button id="olBtn"><span class="numberListIcon">1.</span><span>Lista numerada</span></button><button id="indentBtn">${toolbarIcon('indent')}<span>Aumentar recuo</span></button><button id="outdentBtn">${toolbarIcon('outdent')}<span>Diminuir recuo</span></button></div></details>
   <button class="composeIconButton" id="quoteBtn" title="Citação" aria-label="Citação">${toolbarIcon('quote')}</button><details class="toolbarMenu tableMenu" id="tableMenu"><summary id="tableBtn" title="Inserir tabela" aria-label="Inserir tabela">${toolbarIcon('table')}</summary><div class="toolbarPopover tablePickerPopover"><div class="tablePickerHeader"><strong>Inserir tabela</strong><span id="tablePickerStatus">2 × 2</span></div><div id="tableGrid" class="tableGrid" role="grid" aria-label="Selecionar linhas e colunas"></div><div class="tableManual"><label>Linhas <input id="tableRows" type="number" min="1" max="20" value="2"></label><span>×</span><label>Colunas <input id="tableCols" type="number" min="1" max="12" value="2"></label><button id="insertTableManual" class="primary">Inserir</button></div></div></details><button class="composeIconButton" id="clearBtn" title="Limpar formatação" aria-label="Limpar formatação">${toolbarIcon('clear')}</button>
   <button class="composeIconButton" id="undoBtn" title="${shortcutTooltip('undo',ctx.state.boot.settings)}" aria-label="Desfazer">${toolbarIcon('undo')}</button><button class="composeIconButton" id="redoBtn" title="${shortcutTooltip('redo',ctx.state.boot.settings)}" aria-label="Refazer">${toolbarIcon('redo')}</button>
   <details class="toolbarMenu insertMenu"><summary title="Assinaturas e templates" aria-label="Assinaturas e templates">${toolbarIcon('more')}</summary><div class="toolbarPopover insertPopover"><label><span>Assinatura</span><select id="signatureSelect" title="Assinatura"><option value="auto">Assinatura automática</option><option value="none">Sem assinatura</option>${sigs.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label><span>Template</span><select id="templateSelect" title="Template">${templateOptions}</select></label><div class="toolbarPopoverActions"><button id="templateInsert">Inserir template</button><button id="templateReplace">Substituir corpo</button><button id="templateSave">Salvar como template</button></div></div></details>
   <button class="composeIconButton" id="inlineImageBtn" title="Inserir imagem no corpo" aria-label="Inserir imagem">${toolbarIcon('image')}</button><button class="composeIconButton" id="attachBtn" title="Anexar arquivo" aria-label="Anexar arquivo">${toolbarIcon('attach')}</button><button class="composeIconButton aiComposeButton" id="composeAiBtn" title="Assistência por IA" aria-label="Assistência por IA">${toolbarIcon('smart')}</button><select id="composeFormatMode" class="toolbarFormat" title="Formato da mensagem" aria-label="Formato da mensagem"><option value="html">HTML</option><option value="plain">Texto simples</option></select>
  </div>
  <div id="editor" contenteditable="true" spellcheck="${composePrefs.spell?'true':'false'}" autocapitalize="sentences" class="editor richEditor"></div><div id="selectionToolbar" class="selectionToolbar hidden" role="toolbar" aria-label="Formatação da seleção"><button data-mini="strong" title="Negrito"><b>B</b></button><button data-mini="em" title="Itálico"><i>I</i></button><button data-mini="u" title="Sublinhado"><u>U</u></button><button data-mini="strike" title="Tachado"><s>S</s></button><button data-mini-size="-1" title="Diminuir fonte">A−</button><button data-mini-size="1" title="Aumentar fonte">A+</button><label title="Cor do texto"><input id="miniColor" type="color" value="#202124" aria-label="Cor do texto"></label></div><div id="editorContextMenu" class="editorContextMenu hidden" role="menu"><button data-context="cut">Recortar</button><button data-context="copy">Copiar</button><button data-context="paste">Colar</button><hr><button data-context="bold">Negrito</button><button data-context="italic">Itálico</button><button data-context="underline">Sublinhado</button><button data-context="strike">Tachado</button><button data-context="link">Inserir link</button><button data-context="formatDialog">Formatar texto…</button><hr><button data-context="ul">Lista com marcadores</button><button data-context="ol">Lista numerada</button><button data-context="clear">Limpar formatação</button></div><div id="tableTools" class="tableTools hidden"><span>Tabela</span><button data-table-action="rowBefore">+ linha ↑</button><button data-table-action="rowAfter">+ linha ↓</button><button data-table-action="colBefore">+ coluna ←</button><button data-table-action="colAfter">+ coluna →</button><button data-table-action="mergeRight">Mesclar →</button><button data-table-action="mergeDown">Mesclar ↓</button><button data-table-action="alignLeft">←</button><button data-table-action="alignCenter">↔</button><button data-table-action="alignRight">→</button><button data-table-action="deleteRow">− linha</button><button data-table-action="deleteCol">− coluna</button><button data-table-action="deleteTable" class="dangerAction">Excluir tabela</button></div><div id="imageTools" class="imageTools hidden"><span>Imagem</span><button data-image-size="25">25%</button><button data-image-size="50">50%</button><button data-image-size="100">100%</button><button type="button" data-image-align="left">Esquerda</button><button type="button" data-image-align="center">Centro</button><button type="button" data-image-align="right">Direita</button><button type="button" id="imageAltBtn">Texto alternativo</button><button id="removeInlineImage" class="dangerAction">Remover</button><span class="imageSizeHint">Arraste o canto da imagem para redimensionar</span></div>
  <div class="composeUtilityBar" role="toolbar" aria-label="Ferramentas adicionais do editor">
   <button type="button" id="composeVersionsBtn" title="Consultar versões locais deste rascunho">Versões</button>
   <button type="button" id="composeFindBtn" title="Localizar e substituir texto">Localizar/substituir</button>
   <button type="button" id="composePreviewBtn" title="Pré-visualizar o texto e a formatação antes de enviar">Pré-visualizar</button>
   <button type="button" id="composeExpandBtn" title="Expandir ou recolher o editor" aria-pressed="false">Expandir editor</button>
   <button type="button" id="composeAiDataBtn" title="Inspecionar dados de composição antes de solicitar assistência por IA">Dados da IA</button>
   <span id="composeWordCount" aria-live="off" class="composeWordCount">0 palavras · 0 caracteres</span><span id="composeMessageSize" title="Estimativa do tamanho MIME incluindo anexos" class="composeWordCount"></span>
  </div>
  <div id="composeFindPanel" class="composeFindPanel hidden" role="search"><label>Localizar <input type="search" id="composeFindInput" autocomplete="off"></label><span id="composeFindStatus" role="status" aria-live="polite"></span><button type="button" id="composeFindPrev" aria-label="Ocorrência anterior" title="Anterior (Shift+Enter)">↑</button><button type="button" id="composeFindNext" aria-label="Próxima ocorrência" title="Próximo (Enter)">↓</button><button type="button" id="composeFindReplaceToggle">Substituir</button><span id="composeReplaceControls" class="composeFindReplaceControls hidden"><label>Por <input id="composeReplaceInput"></label><button type="button" id="composeReplaceOne">Substituir</button><button type="button" id="composeReplaceAll">Substituir todos</button></span><button type="button" id="composeFindClose" aria-label="Fechar pesquisa">×</button></div>
  <div id="attachmentList" class="attachmentList" aria-label="Anexos da mensagem"></div>
  <div class="sendOptions singleLine">
   <label><input id="receipt" type="checkbox" ${(seed.requestReadReceipt??composePrefs.receipt)?'checked':''}> Solicitar confirmação de leitura</label>
   <label><input id="follow" type="checkbox" ${seed.followEnabled?'checked':''}> Lembrar se não houver resposta até <input id="followAt" type="datetime-local" ${seed.followEnabled?'':'disabled'} value="${esc(seed.followAt||'')}"></label>
   <details class="sendOptionsDetails"><summary>Opções de envio</summary><div class="sendOptionsPopover"><label><input id="schedule" type="checkbox" ${seed.scheduleEnabled?'checked':''}> Enviar em <input id="sendAt" type="datetime-local" ${seed.scheduleEnabled?'':'disabled'} value="${esc(seed.sendAt||'')}"></label><label>Desfazer envio <select id="undoSeconds"><option value="5">5 s</option><option value="10">10 s</option><option value="20">20 s</option><option value="30">30 s</option></select></label></div></details>
  </div>
  <div id="composerError" class="error"></div>
  <footer class="composerFooter"><span id="draftStatus" role="status" aria-live="polite">Rascunho local</span><div class="composerFooterActions">${options.nativeWindow?`<button type="button" id="returnToReaderPanel" class="returnToReaderPanel" data-reattach-panel title="Mover esta edição para a terceira coluna do TCS Mail" aria-label="Mover para o painel de leitura"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16M16 9l-4 3 4 3"/></svg><span>Mover para o painel de leitura</span></button>`:''}<button id="discard">Descartar</button><button id="sendBtn" class="primary" title="${shortcutTooltip('send',ctx.state.boot.settings)}">Enviar</button></div></footer>
 </div>`,{wide:true,resizable:true,persistKey:options.nativeWindow?'composer-native':'composer',embedded:!!options.inlineHost,embeddedHost:options.inlineHost||null,closeOnBackdrop:false,beforeClose:()=>closeGuard(),onClose:()=>{resizeGrip?.remove();window.removeEventListener('scroll',positionGrip,true);window.removeEventListener('resize',positionGrip);clearInterval(autoSaveTimer);clearInterval(remoteDraftTimer);clearTimeout(saveSoonTimer);clearTimeout(remoteSoonTimer);if(selectionHandler)document.removeEventListener('selectionchange',selectionHandler);if(shortcutHandler)window.removeEventListener('tcs-shortcuts-changed',shortcutHandler);if(typeof toolbarOutsideHandler!=='undefined')document.removeEventListener('pointerdown',toolbarOutsideHandler);clearTimeout(toolbarLeaveTimer);clearFind();findOverlay.remove();window.removeEventListener('resize',paintMatches);window.removeEventListener('scroll',paintMatches,true);ctx.workspaceRemove?.(workKey);ctx.refreshLocalDrafts?.().then(()=>{if(ctx.state.folder===ctx.state.roles?.drafts||ctx.state.folder==='__DRAFTS')ctx.goMail?.(ctx.state.folder)}).catch(()=>{});options.onNativeClose?.();options.onClosed?.(draftId)}});
 // Assign globally unique IDs to all controls of embedded composers. This prevents
 // cross-draft lookups, label collisions and accidental keyboard focus transfers.
 if(options.inlineHost){
  const unique='tcs-'+Array.from(new TextEncoder().encode(String(draftId)),b=>b.toString(16).padStart(2,'0')).join('')+'-';
  for(const el of root.querySelectorAll('[id]')){
   const original=el.id;el.dataset.tcsId=original;el.id=unique+original;
  }
  for(const el of root.querySelectorAll('[for],[aria-controls],[aria-labelledby],[aria-describedby]')){
   for(const attr of ['for','aria-controls','aria-labelledby','aria-describedby']){
    const value=el.getAttribute(attr);if(!value)continue;
    el.setAttribute(attr,value.split(/\s+/).map(part=>root.querySelector(`[data-tcs-id="${part}"]`)?unique+part:part).join(' '));
   }
  }
 }
 if(options.inlineHost){
   const host=options.inlineHost;
   if(root.parentElement!==host)throw new Error('Compositor não está no painel de leitura');
   root.classList.add('inlineComposerLayer');
   root.setAttribute('data-inline-composer','true');
   // Keep the live editor and its attachment handles if the reader gets rerendered.
   const hostObserver=new MutationObserver(()=>{
     if(isClosed()){hostObserver.disconnect();return}
     if(host.isConnected)return;
     // A reader rerender must not silently convert an inline draft to a window.
     // Keep the editor parked invisibly until the reader pane is restored.
     const parking=document.querySelector('#tcsComposerParking');
     if(parking)parking.append(root);
     hostObserver.disconnect();
   });
   hostObserver.observe(document.body,{subtree:true,childList:true});
   const header=$('.modal > header',root);
   const detach=document.createElement('button');detach.type='button';detach.className='readerActionIcon';detach.title='Desanexar para janela independente';detach.setAttribute('aria-label','Desanexar compositor');detach.textContent='↗';
   detach.addEventListener('click',async()=>{try{await detachToWindow()}catch(e){$('#composerError',root).textContent=String(e)}});
   header?.insertBefore(detach,$('.closeModal',header));
 }
 if(options.nativeWindow){document.body.classList.add('nativeMailWindow','nativeComposerWindow');root.dataset.nativeSurface='composer'}

 if(!options.nativeWindow){
   const modalHeader=$('.modal > header',root);
   if(modalHeader&&!options.inlineHost){
     const min=document.createElement('button');min.type='button';min.className='icon workMinimize';min.title='Minimizar para a área de trabalho';min.textContent='—';
     min.onclick=()=>ctx.workspaceMinimize?.(workKey);
     modalHeader.insertBefore(min,$('.closeModal',modalHeader));
   }
   if(!options.inlineHost)ctx.workspaceRegister?.({key:workKey,type:'composer',title:seed.subject||'Nova mensagem',modal:{root,close,requestClose,minimize,restore,isClosed}});
 }
 shortcutHandler=()=>{const map=[['[data-inline="strong"]','bold'],['[data-inline="em"]','italic'],['[data-inline="u"]','underline'],['#linkBtn','link'],['#undoBtn','undo'],['#redoBtn','redo'],['#sendBtn','send']];for(const [sel,action] of map){const el=$(sel,root);if(el)el.title=shortcutTooltip(action,ctx.state.boot.settings)}};window.addEventListener('tcs-shortcuts-changed',shortcutHandler);
 const editor=$('#editor',root);editor.innerText=seed.textBody||'';editor.lang=(navigator.language||'pt-BR');let activeInlineImage=null;
 const resizeGrip=document.createElement('div');resizeGrip.className='tcsImageResizeGrip hidden';resizeGrip.setAttribute('aria-label','Arraste para redimensionar a imagem');resizeGrip.title='Arraste para redimensionar a imagem';document.body.append(resizeGrip);
 const positionGrip=()=>{if(!activeInlineImage||!activeInlineImage.isConnected||!root.isConnected||root.closest('.composerTabPanel[hidden]')){resizeGrip.classList.add('hidden');return}const r=activeInlineImage.getBoundingClientRect();resizeGrip.style.left=`${r.right-6}px`;resizeGrip.style.top=`${r.bottom-6}px`;resizeGrip.classList.remove('hidden')};
 let resizing=null;
 resizeGrip.addEventListener('pointerdown',e=>{if(!activeInlineImage)return;e.preventDefault();const r=activeInlineImage.getBoundingClientRect();resizing={image:activeInlineImage,startX:e.clientX,startWidth:r.width,ratio:r.height/Math.max(1,r.width)};resizeGrip.setPointerCapture(e.pointerId)});
 resizeGrip.addEventListener('pointermove',e=>{if(!resizing)return;const width=Math.max(32,Math.min(editor.getBoundingClientRect().width-24,resizing.startWidth+e.clientX-resizing.startX));resizing.image.style.width=`${Math.round(width)}px`;resizing.image.style.height='auto';positionGrip()});
 const finishResize=()=>{if(!resizing)return;resizing=null;positionGrip();markDirty()};resizeGrip.addEventListener('pointerup',finishResize);resizeGrip.addEventListener('pointercancel',finishResize);
 window.addEventListener('scroll',positionGrip,true);window.addEventListener('resize',positionGrip);

 const updateContextTools=()=>{
   const cell=selectedCell(editor),tableTools=$('#tableTools',root);
   tableTools?.classList.toggle('hidden',!cell);
   const sel=getSelection();let node=sel?.rangeCount?sel.getRangeAt(0).commonAncestorContainer:null;if(node?.nodeType!==1)node=node?.parentElement;const img=node?.closest?.('img.inlineComposeImage')||null;activeInlineImage=img&&editor.contains(img)?img:null;editor.querySelectorAll('.tcsImageSelected').forEach(x=>x.classList.remove('tcsImageSelected'));activeInlineImage?.classList.add('tcsImageSelected');$('#imageTools',root)?.classList.toggle('hidden',!activeInlineImage);positionGrip()
 };if(seed.restoredLocalDraft)$('#draftStatus',root).textContent=seed.draftDirty?'Rascunho salvo localmente · sincronização pendente':'Rascunho sincronizado';if(seed.htmlBody)editor.innerHTML=seed.htmlBody;
 const quotedCidImages=()=>[...editor.querySelectorAll('img[src]')].filter(img=>/^cid:/i.test(String(img.getAttribute('src')||'')));
 if(seed.sourceMessageId&&quotedCidImages().length){try{const imported=await invoke('import_received_inline_images',{messageId:Number(seed.sourceMessageId),draftId:String(draftId)});for(const item of imported||[]){const cid=String(item.content_id||'').replace(/^<|>$/g,'');if(!cid)continue;const preview=await invoke('inline_image_preview',{handleId:item.id}).catch(()=> '');if(!preview)continue;for(const img of quotedCidImages()){const raw=decodeURIComponent(String(img.getAttribute('src')||'').slice(4)).replace(/^<|>$/g,'');if(raw!==cid)continue;img.dataset.inlineCid=cid;img.dataset.handleId=item.id;img.classList.add('inlineComposeImage');img.setAttribute('src',preview)}}}catch(e){console.warn('Não foi possível preparar imagens inline da mensagem original:',e)}}
 const initialFormat=seed.composeFormat||(seed.inReplyTo?(seed.htmlBody?'html':'plain'):composePrefs.format);$('#composeFormatMode',root).value=initialFormat;editor.dataset.composeFormat=initialFormat;$('#fontFamily',root).value=composePrefs.font;$('#undoSeconds',root).value=String(seed.undoSeconds||composePrefs.undo);const recipientFields={to:installRecipientField(root,'cTo','cToSuggest',seed.to||''),cc:installRecipientField(root,'cCc','cCcSuggest',seed.cc||''),bcc:installRecipientField(root,'cBcc','cBccSuggest',seed.bcc||'')};
 const syncRemoteDraft=async()=>{if(terminalizing)return;remoteChain=remoteChain.catch(()=>{}).then(async()=>{if(terminalizing)return;try{await invoke('sync_local_draft',{id:draftId});$('#draftStatus',root).textContent='Rascunho sincronizado'}catch{$('#draftStatus',root).textContent='Rascunho salvo localmente · sincronização pendente'}finally{await ctx.refreshLocalDrafts?.()}});return remoteChain};const markDirty=()=>{if(terminalizing)return;changeSerial++;dirty=true;$('#draftStatus',root).textContent='Salvando…';clearTimeout(saveSoonTimer);if(r13.recovery)saveSoonTimer=setTimeout(async()=>{try{await saveDraft();clearTimeout(remoteSoonTimer);remoteSoonTimer=setTimeout(syncRemoteDraft,1800)}catch(e){console.warn('Não foi possível salvar automaticamente o rascunho:',e)}},350)};['input','change'].forEach(ev=>root.addEventListener(ev,e=>{if(e.target.closest('.composerNative'))markDirty()}));
 $('.composeToolbar',root)?.addEventListener('click',e=>{if(e.target.closest('button'))queueMicrotask(markDirty)});
 const toolbarMenus=$$('.toolbarMenu',root);let toolbarLeaveTimer=null;const closeToolbarMenus=except=>toolbarMenus.forEach(d=>{if(d!==except)d.open=false});const toolbarOutsideHandler=e=>{if(!e.target.closest('.toolbarMenu'))closeToolbarMenus(null)};toolbarMenus.forEach(d=>{d.addEventListener('toggle',()=>{if(d.open)closeToolbarMenus(d)});d.addEventListener('pointerenter',()=>clearTimeout(toolbarLeaveTimer));d.addEventListener('pointerleave',()=>{clearTimeout(toolbarLeaveTimer);toolbarLeaveTimer=setTimeout(()=>{d.open=false},180)});d.querySelector('.toolbarPopover')?.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('#insertTableManual'))setTimeout(()=>{d.open=false},0)})});document.addEventListener('pointerdown',toolbarOutsideHandler);
 const serializableHtml=()=>{const clone=editor.cloneNode(true);clone.querySelectorAll('.tcsImageSelected').forEach(el=>el.classList.remove('tcsImageSelected'));clone.querySelectorAll('img[data-inline-cid]').forEach(img=>{img.setAttribute('src',`cid:${img.dataset.inlineCid}`);img.removeAttribute('data-handle-id');img.removeAttribute('data-inline-cid');img.classList.remove('inlineComposeImage','tcsImageSelected')});return clone.innerHTML};const snapshot=()=>JSON.stringify({to:recipientFields.to.commit(),cc:recipientFields.cc.commit(),bcc:recipientFields.bcc.commit(),subject:$('#cSubject',root).value,html:serializableHtml(),text:textVersion(editor),identityId:$('#cFrom',root)?.value==='__custom__'?null:($('#cFrom',root)?.value||null),customFromName:$('#customFromName',root)?.value.trim()||'',customFromEmail:$('#customFromEmail',root)?.value.trim()||'',requestReadReceipt:$('#receipt',root).checked,followEnabled:$('#follow',root).checked,followAt:$('#followAt',root).value||'',scheduleEnabled:$('#schedule',root).checked,sendAt:$('#sendAt',root).value||'',undoSeconds:Number($('#undoSeconds',root).value)||10,ccVisible:$('#ccBlock',root).classList.contains('show'),bccVisible:$('#bccBlock',root).classList.contains('show'),signatureId:signatureSelect.value!=='auto'&&signatureSelect.value!=='none'?Number(signatureSelect.value):null,noSignature:signatureSelect.value==='none',inReplyTo:seed.inReplyTo||null,references:seed.references||null,sourceMessageId:seed.sourceMessageId||null,composeFormat:$('#composeFormatMode',root).value});
 // R12: independent inspection actions do not alter the draft or its CID attachments.
 const updateWordCount=()=>{const t=textVersion(editor).trim();const words=t?(t.match(/\S+/gu)||[]).length:0;const badge=$('#composeWordCount',root);if(badge)badge.textContent=`${words} palavras · ${t.length} caracteres`;const mimeSize=new Blob([serializableHtml()]).size+attachments.reduce((total,a)=>total+Math.ceil(Number(a.size||0)*4/3)+1024,0)+4096;const sizeBadge=$('#composeMessageSize',root);if(sizeBadge)sizeBadge.textContent=`≈ ${(mimeSize/1024/1024).toFixed(2)} MiB`};
 editor.addEventListener('input',updateWordCount);updateWordCount();
 const findPanel=$('#composeFindPanel',root),findInput=$('#composeFindInput',root),replaceInput=$('#composeReplaceInput',root),findStatus=$('#composeFindStatus',root);
 const findPrevButton=$('#composeFindPrev',root),findReplaceControls=$('#composeReplaceControls',root);
 const highlightSupported=Boolean(globalThis.CSS?.highlights&&globalThis.Highlight);
 const findUid='tcs-find-'+crypto.randomUUID().replaceAll('-',''); // tcs-find-matches / tcs-find-active per composer
 const findHighlightKeys=[findUid,findUid+'-active'];
 if(highlightSupported){const style=document.createElement('style');style.textContent=`::highlight(${findHighlightKeys[0]}){background:#ffe062;color:#101820} ::highlight(${findHighlightKeys[1]}){background:#ff922e;color:#111;text-decoration:underline}`;document.head.append(style);}
 const findOverlay=document.createElement('div');findOverlay.className='tcsFindOverlay';findOverlay.setAttribute('aria-hidden','true');
 if(!highlightSupported){for(const stale of document.querySelectorAll('.tcsFindOverlay')){if(!stale.isConnected||!stale.hasChildNodes())stale.remove();}document.body.appendChild(findOverlay);}
 let findRangesCache=[],findIndex=-1,findFrame=0;
 // Build an index of visible text without inserting markup into the editable HTML.
 // Search can cross formatting boundaries such as <strong> inside a word.
 const findRanges=()=>{
   const query=findInput.value;if(!query)return[];
   const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,{acceptNode(node){
     const parent=node.parentElement;if(!parent||parent.closest('script,style,[contenteditable="false"]'))return NodeFilter.FILTER_REJECT;
     return NodeFilter.FILTER_ACCEPT;
   }});
   const segments=[];let text='',node;
   while((node=walker.nextNode())){const value=node.textContent||'';if(!value)continue;segments.push({node,start:text.length,end:text.length+value.length});text+=value;}
   const matches=[],haystack=text.toLocaleLowerCase(),needle=query.toLocaleLowerCase();if(!needle)return[];
   const boundary=offset=>{let low=0,high=segments.length-1;while(low<=high){const mid=(low+high)>>1,seg=segments[mid];if(offset<seg.start)high=mid-1;else if(offset>=seg.end)low=mid+1;else return {node:seg.node,offset:offset-seg.start};}return null};
   let from=0,at;while((at=haystack.indexOf(needle,from))>=0){const first=boundary(at),last=boundary(at+needle.length-1);if(first&&last){const range=document.createRange();range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset+1);matches.push(range);}from=at+Math.max(needle.length,1);}
   return matches;
 };
 // Split every match into text-node fragments: a DOM Range crossing a table
 // can otherwise paint whole cells or image blocks yellow rather than the letters.
 const textFragments=range=>{
   const pieces=[];let active=false;
   const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
   let node;
   while((node=walker.nextNode())){
     if(node===range.startContainer)active=true;
     if(!active)continue;
     const a=node===range.startContainer?range.startOffset:0;
     const b=node===range.endContainer?range.endOffset:(node.textContent||'').length;
     if(a<b){const part=document.createRange();part.setStart(node,a);part.setEnd(node,b);pieces.push(part)}
     if(node===range.endContainer)break;
   }
   return pieces;
 };
 const drawOverlay=()=>{if(highlightSupported||findPanel.classList.contains('hidden'))return;findOverlay.replaceChildren();
   const visible=editor.getBoundingClientRect();
   for(let i=0;i<findRangesCache.length;i++)for(const part of textFragments(findRangesCache[i]))for(const rect of part.getClientRects()){
     const left=Math.max(rect.left,visible.left),right=Math.min(rect.right,visible.right),top=Math.max(rect.top,visible.top),bottom=Math.min(rect.bottom,visible.bottom);
     if(right<=left||bottom<=top||bottom-top>Math.max(40,parseFloat(getComputedStyle(editor).lineHeight)||28)*2)continue;
     const mark=document.createElement('span');mark.className=i===findIndex?'tcsFindOverlayMatch current':'tcsFindOverlayMatch';
     Object.assign(mark.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});findOverlay.appendChild(mark);
   }
 };
 const paintMatches=()=>{
   if(highlightSupported){
     CSS.highlights.delete(findHighlightKeys[0]);CSS.highlights.delete(findHighlightKeys[1]);
     if(!findPanel.classList.contains('hidden')&&findRangesCache.length){
       CSS.highlights.set(findHighlightKeys[0],new Highlight(...findRangesCache.flatMap(textFragments)));
       if(findIndex>=0)CSS.highlights.set(findHighlightKeys[1],new Highlight(...textFragments(findRangesCache[findIndex])));
     }
   }else{cancelAnimationFrame(findFrame);findFrame=requestAnimationFrame(drawOverlay);}
 };
 const clearFind=()=>{findPanel.classList.add('hidden');findRangesCache=[];findIndex=-1;cancelAnimationFrame(findFrame);if(highlightSupported){CSS.highlights.delete(findHighlightKeys[0]);CSS.highlights.delete(findHighlightKeys[1])}findOverlay.replaceChildren()};
 const updateFind=(keepIndex=false)=>{const prior=findIndex;cancelAnimationFrame(findFrame);findOverlay.replaceChildren();if(highlightSupported){CSS.highlights.delete(findHighlightKeys[0]);CSS.highlights.delete(findHighlightKeys[1])}findRangesCache=findRanges();findIndex=findRangesCache.length?(keepIndex?Math.max(0,Math.min(prior,findRangesCache.length-1)):0):-1;
   findStatus.textContent=findRangesCache.length?`${findIndex+1} de ${findRangesCache.length}`:'Nenhuma ocorrência';paintMatches();};
 const scrollToMatch=range=>{
   if(!range)return;const rect=textFragments(range)[0]?.getBoundingClientRect();if(!rect)return;const area=editor.getBoundingClientRect();
   if(rect.top<area.top+16)editor.scrollTop-=area.top+16-rect.top;
   else if(rect.bottom>area.bottom-16)editor.scrollTop+=rect.bottom-(area.bottom-16);
   if(rect.left<area.left+12)editor.scrollLeft-=area.left+12-rect.left;
   else if(rect.right>area.right-12)editor.scrollLeft+=rect.right-(area.right-12);
   paintMatches();
 };
 const openFind=(replace=false)=>{findPanel.classList.remove('hidden');findReplaceControls.classList.toggle('hidden',!replace);updateFind();findInput.focus({preventScroll:true})};
 $('#composeFindBtn',root).onclick=()=>{if(findPanel.classList.contains('hidden'))openFind();else clearFind()};
 $('#composeFindClose',root).onclick=clearFind;
 const moveFind=step=>{if(!findRangesCache.length){updateFind();if(!findRangesCache.length)return;}findIndex=(findIndex+step+findRangesCache.length)%findRangesCache.length;findStatus.textContent=`${findIndex+1} de ${findRangesCache.length}`;paintMatches();scrollToMatch(findRangesCache[findIndex]);findInput.focus({preventScroll:true})};
 findInput.addEventListener('input',()=>{updateFind();scrollToMatch(findRangesCache[findIndex]);});
 findInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();moveFind(e.shiftKey?-1:1)}else if(e.key==='Escape'){e.preventDefault();clearFind()}});
 $('#composeFindNext',root).onclick=()=>moveFind(1);findPrevButton.onclick=()=>moveFind(-1);
 $('#composeFindReplaceToggle',root).onclick=()=>{findReplaceControls.classList.toggle('hidden');if(!findReplaceControls.classList.contains('hidden'))replaceInput.focus({preventScroll:true})};
 const replaceMatch=range=>{if(!range)return;range.deleteContents();range.insertNode(document.createTextNode(replaceInput.value));markDirty();updateWordCount()};
 $('#composeReplaceOne',root).onclick=()=>{if(findIndex<0)return;replaceMatch(findRangesCache[findIndex]);updateFind(true);scrollToMatch(findRangesCache[findIndex]);findInput.focus({preventScroll:true})};
 $('#composeReplaceAll',root).onclick=()=>{const ranges=[...findRangesCache];for(const range of ranges.reverse())replaceMatch(range);updateFind();findStatus.textContent=`${ranges.length} ocorrência(s) substituída(s)`;findInput.focus({preventScroll:true})};
 const findShortcut=e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&['f','h'].includes(e.key.toLowerCase())&&root.contains(document.activeElement)){
   e.preventDefault();e.stopPropagation();openFind(e.key.toLowerCase()==='h');
 }else if(e.key==='Escape'&&!findPanel.classList.contains('hidden')&&findPanel.contains(document.activeElement)){
   e.preventDefault();clearFind();
 }};
 root.addEventListener('keydown',findShortcut,true);
 editor.addEventListener('input',()=>{if(!findPanel.classList.contains('hidden'))updateFind(true)});
 editor.addEventListener('scroll',paintMatches,{passive:true});
 window.addEventListener('resize',paintMatches);
 window.addEventListener('scroll',paintMatches,true);
 $('#composeExpandBtn',root).onclick=()=>{const on=root.classList.toggle('composeExpanded');const b=$('#composeExpandBtn',root);b.setAttribute('aria-pressed',String(on));b.textContent=on?'Recolher editor':'Expandir editor'};
 $('#composePreviewBtn',root).onclick=()=>{const safe=serializableHtml();const preview=modal('Pré-visualização antes de enviar',`<div class="composePreviewMessage"><div><strong>Assunto:</strong> ${esc($('#cSubject',root).value||'(sem assunto)')}</div><div><strong>Para:</strong> ${esc(recipientFields.to.commit())}</div><hr><div class="composePreviewBody"></div></div>`,{wide:true});const box=preview?.root?.querySelector?.('.composePreviewBody');if(box){const doc=new DOMParser().parseFromString(safe,'text/html');doc.querySelectorAll('script,iframe,object,embed,form,style,link,meta,svg').forEach(n=>n.remove());doc.querySelectorAll('*').forEach(n=>{for(const a of [...n.attributes]){if(/^on/i.test(a.name)||a.name==='srcdoc'||(/^(href|src)$/i.test(a.name)&&/^(javascript:|https?:|data:)/i.test(a.value)))n.removeAttribute(a.name)}});box.innerHTML=doc.body.innerHTML}};
 $('#composeAiDataBtn',root).onclick=()=>{const text=textVersion(editor);modal('Dados disponíveis para assistência por IA',`<p>O conteúdo abaixo é uma prévia local do texto do compositor. O envio efetivo depende da operação de IA escolhida.</p><p><strong>Provedor e modelo:</strong> definidos nas configurações de IA.</p><textarea readonly class="composeAiDisclosure">${esc(text)}</textarea><p>Esta tela não substitui a confirmação de consentimento da ferramenta de IA.</p>`,{wide:true})};
 let saveChain=Promise.resolve(),changeSerial=0,terminalizing=false;
 let remoteChain=Promise.resolve();
 const saveDraft=async()=>{if(terminalizing)return saveChain;if(!dirty)return saveChain;const serial=changeSerial;
   const work=async()=>{if(terminalizing||!dirty)return;try{await reconcileInlineAttachments();await invoke('save_local_draft',{id:draftId,accountId,draftJson:snapshot()});keepRevision();if(changeSerial===serial)dirty=false;$('#draftStatus',root).textContent=dirty?'Salvando…':'Rascunho salvo localmente';await ctx.refreshLocalDrafts?.()}catch(e){$('#draftStatus',root).textContent='Falha ao salvar rascunho';throw e}};
   saveChain=saveChain.catch(()=>{}).then(work);return saveChain;
 };
 const revisionKey=`tcs-mail-r13-revisions:${draftId}`;
 const keepRevision=()=>{if(!r13.history)return;try{const previous=JSON.parse(localStorage.getItem(revisionKey)||'[]');const value=snapshot();if(previous.at(-1)?.draft===value)return;previous.push({at:Date.now(),draft:value});while(previous.length>10)previous.shift();localStorage.setItem(revisionKey,JSON.stringify(previous))}catch(e){console.warn('Histórico local indisponível:',e)}};
 $('#composeVersionsBtn',root).onclick=()=>{
    if(!r13.history){toast('Ative o histórico de versões em Configurações → Composição.');return}
    let versions=[];try{versions=JSON.parse(localStorage.getItem(revisionKey)||'[]')}catch{}
    if(!versions.length){toast('Ainda não há versões locais deste rascunho.');return}
    const dialog=modal('Versões locais do rascunho',`<div class="composeVersionList"><p>Somente o texto e o assunto podem ser restaurados. Anexos e destinatários atuais serão preservados.</p>${versions.map((v,i)=>`<button type="button" data-version="${i}">${esc(new Date(v.at).toLocaleString())}</button>`).join('')}<button type="button" data-clear-versions>Apagar histórico deste rascunho</button></div>`,{wide:false});
    dialog.root.querySelector('[data-clear-versions]')?.addEventListener('click',()=>{localStorage.removeItem(revisionKey);dialog.close();toast('Histórico apagado.')});
    dialog.root.querySelectorAll('[data-version]').forEach(b=>b.addEventListener('click',async()=>{const v=versions[Number(b.dataset.version)];let data;try{data=JSON.parse(v.draft)}catch{return}
      // Never resurrect CID images when their attachment handles no longer exist.
      const documentHtml=new DOMParser().parseFromString(String(data.html||''),'text/html');
      const available=new Set(attachments.filter(a=>a.content_id).map(a=>String(a.content_id).replace(/^<|>$/g,'').toLowerCase()));
      for(const img of documentHtml.querySelectorAll('img[src^="cid:"]')){const cid=String(img.getAttribute('src')).slice(4).replace(/^<|>$/g,'').toLowerCase();if(!available.has(cid)){toast('Esta versão usa imagens que já foram removidas; restauração bloqueada.');return}}
      if(!await confirmDialog('Restaurar o texto e o assunto desta versão? Os destinatários e anexos atuais serão preservados.',{confirmLabel:'Restaurar'}))return;
      editor.innerHTML=String(data.html||'');$('#cSubject',root).value=String(data.subject||'');refreshSubjectTitle();markDirty();updateWordCount();dialog.close();
    }));
 };
 const hasMeaningfulContent=()=>Boolean(recipientFields.to.value().trim()||recipientFields.cc.value().trim()||recipientFields.bcc.value().trim()||$('#cSubject',root).value.trim()||textVersion(editor)||attachments.length||seed.restoredLocalDraft);
 closeGuard=async()=>{try{if(!hasMeaningfulContent()){terminalizing=true;await saveChain.catch(()=>{});await remoteChain.catch(()=>{});await invoke('delete_local_draft',{id:draftId}).catch(()=>{});localStorage.removeItem(revisionKey);return true}const choice=await choiceDialog('Deseja salvar esta mensagem em Rascunhos antes de fechar?',{title:'Fechar mensagem',choices:[{label:'Cancelar',value:'cancel'},{label:'Descartar',value:'discard',danger:true},{label:'Salvar em Rascunhos',value:'save',primary:true}]});if(choice==='cancel'||choice==null)return false;if(choice==='discard'){terminalizing=true;clearTimeout(saveSoonTimer);clearTimeout(remoteSoonTimer);clearInterval(autoSaveTimer);clearInterval(remoteDraftTimer);await saveChain.catch(()=>{});await remoteChain.catch(()=>{});await invoke('delete_local_draft',{id:draftId}).catch(()=>{});localStorage.removeItem(revisionKey);return true}dirty=true;await saveDraft();await syncRemoteDraft().catch(()=>{});return true}catch(e){$('#composerError',root).textContent=String(e);return false}};
 if(r13.recovery){autoSaveTimer=setInterval(()=>saveDraft().catch(()=>{}),15000);remoteDraftTimer=setInterval(async()=>{try{await saveDraft();await syncRemoteDraft()}catch(e){console.warn('Falha na sincronização automática do rascunho:',e)}},30000)}
 const composeContext=seed.inReplyTo?'reply':'new';const selectedIdentity=Number($('#cFrom',root)?.value)||null;const signatureFor=async id=>{const sender=senderById(id),meta=sender?._meta||{},sid=composeContext==='reply'?(meta.signature_reply_id||sender?.signatureId):(meta.signature_new_id||sender?.signatureId);if(sid){const hit=sigs.find(x=>Number(x.id)===Number(sid));if(hit)return hit}return invoke('select_signature',{accountId,identityId:id,context:composeContext,language:navigator.language||null}).catch(()=>null)};let pref=await signatureFor(selectedIdentity);let manualSignatureId=seed.signatureId??null;const signatureSelect=$('#signatureSelect',root);if(manualSignatureId)signatureSelect.value=String(manualSignatureId);else signatureSelect.value=seed.noSignature?'none':'auto';if(pref&&!seed.noSignature&&!seed.restoredLocalDraft)applySignature(editor,pref.body);const initialSender=senderById(selectedIdentity);if(!seed.restoredLocalDraft&&!seed.htmlBody&&!seed.textBody&&initialSender?._meta?.auto_template&&initialSender._meta.default_template_id){const tpl=templates.find(t=>Number(t.id)===Number(initialSender._meta.default_template_id));if(tpl){if(tpl.subject&&!$('#cSubject',root).value)$('#cSubject',root).value=tpl.subject;editor.innerHTML=tpl.body||'';if(pref)applySignature(editor,pref.body)}};
 $$('#editor, #cTo, #cCc, #cBcc, #cSubject',root).forEach(el=>el.addEventListener('blur',saveDraft));
 $$('.recipientInputWrap',root).forEach(el=>el.addEventListener('recipientchange',()=>{markDirty();queueMicrotask(saveDraft)}));
 $('#cSubject',root).addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();editor.focus({preventScroll:true});}});
 const refreshSubjectTitle=()=>{const title=$('#cSubject',root).value.trim()||'Nova mensagem';ctx.workspaceUpdate?.(workKey,{title});options.onSubjectChange?.(title)};
 $('#cSubject',root).addEventListener('input',refreshSubjectTitle);
 refreshSubjectTitle();
 $('#toggleCc',root).onclick=()=>{const b=$('#ccBlock',root);b.classList.toggle('show');if(b.classList.contains('show'))$('#cCc',root).focus()};$('#toggleBcc',root).onclick=()=>{const b=$('#bccBlock',root);b.classList.toggle('show');if(b.classList.contains('show'))$('#cBcc',root).focus()};
 $$('[data-inline]',root).forEach(b=>b.onclick=()=>{const cmd={strong:'bold',em:'italic',u:'underline'}[b.dataset.inline];if(!execEditorCommand(editor,cmd))toggleInline(editor,b.dataset.inline);markDirty()});
 let preservedRange=null;const rememberSelection=()=>{const r=cloneEditorRange(editor);if(r)preservedRange=r};const restoreSelection=()=>restoreEditorRange(editor,preservedRange);const formatWithSelection=fn=>{restoreSelection();fn();rememberSelection();editor.focus({preventScroll:true});markDirty()};
 const toolbar=$('.composeToolbar',root);toolbar?.addEventListener('pointerdown',e=>{rememberSelection();if(e.target.closest('button,summary')&&!e.target.closest('input,select'))e.preventDefault()},true);
 const applyPreservedStyle=styles=>{if(!preservedRange)rememberSelection();const next=applyStyleToRange(editor,preservedRange,styles);if(next)preservedRange=next;restoreSelection();editor.focus({preventScroll:true});markDirty()};
 const fontCss=v=>{const name=String(v||'Sans').trim().replace(/["']/g,'');if(/^sans$/i.test(name))return 'Arial, Helvetica, sans-serif';if(/^serif$/i.test(name))return 'Georgia, "Times New Roman", serif';if(/^monospace$/i.test(name))return '"DejaVu Sans Mono", Consolas, monospace';return `"${name}", sans-serif`};
 editor.style.fontFamily=fontCss(composePrefs.font);editor.style.fontSize=`${Math.max(8,Math.min(72,Number(composePrefs.size)||11))}pt`;
 ['fontFamily','fontSize','fontColor','highlight','blockFormat'].forEach(id=>$('#'+id,root)?.addEventListener('pointerdown',rememberSelection,true));
 $('#fontFamily',root).onchange=e=>applyPreservedStyle({fontFamily:fontCss(e.target.value)});$('#fontSize',root).onchange=e=>applyPreservedStyle({fontSize:`${Math.max(8,Math.min(72,Number(e.target.value)||11))}pt`});$('#fontColor',root).oninput=e=>applyPreservedStyle({color:e.target.value});$('#highlight',root).oninput=e=>applyPreservedStyle({backgroundColor:e.target.value});
 $('#blockFormat',root).onchange=e=>formatWithSelection(()=>formatBlockTag(editor,e.target.value));
 $('#strikeBtn',root).onclick=()=>formatWithSelection(()=>toggleInline(editor,'s'));$('#subBtn',root).onclick=()=>formatWithSelection(()=>toggleInline(editor,'sub'));$('#supBtn',root).onclick=()=>formatWithSelection(()=>toggleInline(editor,'sup'));
 const mini=$('#selectionToolbar',root),contextMenu=$('#editorContextMenu',root);
 const hideSelectionUi=()=>{mini?.classList.add('hidden');contextMenu?.classList.add('hidden')};
 const showMiniToolbar=()=>{const r=selectionIn(editor);if(!r||r.collapsed||!r.toString().trim()){mini?.classList.add('hidden');return}preservedRange=r.cloneRange();const rect=r.getBoundingClientRect();if(!rect.width&&!rect.height)return;mini.classList.remove('hidden');const w=mini.offsetWidth||250,h=mini.offsetHeight||38;mini.style.left=`${Math.max(8,Math.min(window.innerWidth-w-8,rect.left+rect.width/2-w/2))}px`;mini.style.top=`${Math.max(8,rect.top-h-8)}px`};
 editor.addEventListener('mouseup',()=>setTimeout(showMiniToolbar,0));editor.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')||e.shiftKey)setTimeout(showMiniToolbar,0)});editor.addEventListener('blur',()=>setTimeout(()=>{if(!root.contains(document.activeElement))hideSelectionUi()},120));
 $$('[data-mini]',root).forEach(b=>b.onpointerdown=e=>{e.preventDefault();formatWithSelection(()=>toggleInline(editor,b.dataset.mini==='strike'?'s':b.dataset.mini));showMiniToolbar()});
 $$('[data-mini-size]',root).forEach(b=>b.onpointerdown=e=>{e.preventDefault();const delta=Number(b.dataset.miniSize);const next=Math.max(8,Math.min(72,(Number($('#fontSize',root).value)||11)+(delta>0?1:-1)));$('#fontSize',root).value=String(next);formatWithSelection(()=>wrapSelection(editor,'span',{fontSize:`${next}pt`}));showMiniToolbar()});
 $('#miniColor',root).addEventListener('pointerdown',rememberSelection);$('#miniColor',root).oninput=e=>{formatWithSelection(()=>wrapSelection(editor,'span',{color:e.target.value}));showMiniToolbar()};
 const openTextFormatDialog=()=>{
  if(!preservedRange||preservedRange.collapsed)return toast('Selecione o texto que deseja formatar.');
  const selectionSnapshot=preservedRange.cloneRange();
  const formatModal=modal('Formatar texto',`<div class="formatDialogGrid"><label>Fonte<select id="fmtFont">${fontOptions}</select></label><label>Tamanho (pt)<input id="fmtSize" type="number" min="8" max="72" value="${esc($('#fontSize',root).value||'11')}"></label><label>Cor<input id="fmtColor" type="color" value="${esc($('#fontColor',root).value||'#202124')}"></label><label>Realce<input id="fmtHighlight" type="color" value="${esc($('#highlight',root).value||'#fff59d')}"></label><label>Tipo<select id="fmtBlock"><option value="p">Parágrafo</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option><option value="pre">Código</option></select></label><label>Alinhamento<select id="fmtAlign"><option value="">Manter</option><option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option><option value="justify">Justificado</option></select></label></div><div class="formatDialogChecks"><label><input id="fmtBold" type="checkbox"> <b>Negrito</b></label><label><input id="fmtItalic" type="checkbox"> <i>Itálico</i></label><label><input id="fmtUnderline" type="checkbox"> <u>Sublinhado</u></label><label><input id="fmtStrike" type="checkbox"> <s>Tachado</s></label><label><input id="fmtSub" type="checkbox"> X₂</label><label><input id="fmtSup" type="checkbox"> X²</label></div><footer class="modalActions"><button id="fmtCancel">Cancelar</button><button id="fmtApply" class="primary">Aplicar</button></footer>`,{resizable:true,persistKey:'text-format'});
  $('#fmtFont',formatModal.root).value=$('#fontFamily',root).value||'Sans';$('#fmtBlock',formatModal.root).value=$('#blockFormat',root).value||'p';
  $('#fmtCancel',formatModal.root).onclick=formatModal.close;
  $('#fmtApply',formatModal.root).onclick=()=>{preservedRange=selectionSnapshot.cloneRange();restoreSelection();const family=$('#fmtFont',formatModal.root).value,size=Math.max(8,Math.min(72,Number($('#fmtSize',formatModal.root).value)||11)),color=$('#fmtColor',formatModal.root).value,highlight=$('#fmtHighlight',formatModal.root).value;let next=applyStyleToRange(editor,preservedRange,{fontFamily:fontCss(family),fontSize:`${size}pt`,color,backgroundColor:highlight});if(next)preservedRange=next;restoreSelection();formatBlockTag(editor,$('#fmtBlock',formatModal.root).value);const align=$('#fmtAlign',formatModal.root).value;if(align)styleBlock(editor,{textAlign:align});for(const [id,tag] of [['fmtBold','strong'],['fmtItalic','em'],['fmtUnderline','u'],['fmtStrike','s'],['fmtSub','sub'],['fmtSup','sup']])if($('#'+id,formatModal.root).checked)toggleInline(editor,tag);rememberSelection();formatModal.close();editor.focus({preventScroll:true});markDirty()};
 };
 editor.addEventListener('contextmenu',e=>{const r=selectionIn(editor);if(!r||r.collapsed||!r.toString().trim())return;e.preventDefault();preservedRange=r.cloneRange();mini.classList.add('hidden');contextMenu.classList.remove('hidden');const w=contextMenu.offsetWidth||210,h=contextMenu.offsetHeight||300;contextMenu.style.left=`${Math.max(8,Math.min(window.innerWidth-w-8,e.clientX))}px`;contextMenu.style.top=`${Math.max(8,Math.min(window.innerHeight-h-8,e.clientY))}px`});
 const copySelection=async cut=>{restoreSelection();const text=getSelection()?.toString()||'';if(!text)return;try{await navigator.clipboard.writeText(text);if(cut){const r=selectionIn(editor);r?.deleteContents();markDirty()}}catch{toast('Não foi possível acessar a área de transferência.')}};
 $$('[data-context]',root).forEach(b=>b.onmousedown=async e=>{e.preventDefault();const action=b.dataset.context;restoreSelection();if(action==='copy')await copySelection(false);else if(action==='cut')await copySelection(true);else if(action==='paste'){try{const text=await navigator.clipboard.readText();const r=selectionIn(editor);if(r){r.deleteContents();r.insertNode(document.createTextNode(text));markDirty()}}catch{toast('O sistema não permitiu colar pela área de transferência. Use Ctrl+V.')}}else if(action==='bold')toggleInline(editor,'strong');else if(action==='italic')toggleInline(editor,'em');else if(action==='underline')toggleInline(editor,'u');else if(action==='strike')toggleInline(editor,'s');else if(action==='link'){$('#linkBtn',root).click();contextMenu.classList.add('hidden');return}else if(action==='formatDialog'){contextMenu.classList.add('hidden');openTextFormatDialog();return}else if(action==='ul')insertList('ul','insertUnorderedList');else if(action==='ol')insertList('ol','insertOrderedList');else if(action==='clear'){$('#clearBtn',root).click();contextMenu.classList.add('hidden');return}if(!['copy'].includes(action))markDirty();contextMenu.classList.add('hidden');rememberSelection()});
 root.addEventListener('pointerdown',e=>{if(!e.target.closest('#editorContextMenu')&&!e.target.closest('#selectionToolbar')&&!e.target.closest('#editor'))contextMenu?.classList.add('hidden')});
 $('#linkBtn',root).onclick=async()=>{rememberSelection();const url=await promptDialog('URL do link:','https://',{title:'Inserir link'});if(url){if(!/^(https?:|mailto:)/i.test(url.trim())){toast('Use um endereço https://, http:// ou mailto: válido.');return}restoreSelection();const r=selectionIn(editor);const a=document.createElement('a');a.href=url;a.textContent=r&&!r.collapsed?r.toString():url;if(r&&!r.collapsed){r.deleteContents();r.insertNode(a);const nr=document.createRange();nr.selectNodeContents(a);getSelection().removeAllRanges();getSelection().addRange(nr)}else insertNode(editor,a);rememberSelection();markDirty()}};
 $('#alignLeft',root).onclick=()=>{if(!execEditorCommand(editor,'justifyLeft'))styleBlock(editor,{textAlign:'left'});markDirty()};$('#alignCenter',root).onclick=()=>{if(!execEditorCommand(editor,'justifyCenter'))styleBlock(editor,{textAlign:'center'});markDirty()};$('#alignRight',root).onclick=()=>{if(!execEditorCommand(editor,'justifyRight'))styleBlock(editor,{textAlign:'right'});markDirty()};$('#alignJustify',root).onclick=()=>{if(!execEditorCommand(editor,'justifyFull'))styleBlock(editor,{textAlign:'justify'});markDirty()};$('#indentBtn',root).onclick=()=>{if(!execEditorCommand(editor,'indent'))styleBlock(editor,{marginLeft:'2em'});markDirty()};$('#outdentBtn',root).onclick=()=>{if(!execEditorCommand(editor,'outdent'))styleBlock(editor,{marginLeft:'0'});markDirty()};
 const insertList=(tag,cmd)=>{if(execEditorCommand(editor,cmd)){markDirty();return}const list=document.createElement(tag),text=selectionIn(editor)?.toString()||'Item';for(const line of text.split(/\r?\n/).filter(Boolean)){const li=document.createElement('li');li.textContent=line;list.append(li)}if(!list.children.length){const li=document.createElement('li');li.textContent='Item';list.append(li)}insertNode(editor,list);markDirty()};$('#ulBtn',root).onclick=()=>insertList('ul','insertUnorderedList');$('#olBtn',root).onclick=()=>insertList('ol','insertOrderedList');$('#quoteBtn',root).onclick=()=>{if(!execEditorCommand(editor,'formatBlock','blockquote'))wrapSelection(editor,'blockquote');markDirty()};
 const tableGrid=$('#tableGrid',root),tableRows=$('#tableRows',root),tableCols=$('#tableCols',root),tableStatus=$('#tablePickerStatus',root),tableMenu=$('#tableMenu',root);
 const clampTable=(v,max)=>Math.max(1,Math.min(max,Number(v)||1));
 const highlightTableGrid=(rows,cols)=>{rows=clampTable(rows,10);cols=clampTable(cols,10);tableStatus.textContent=`${rows} × ${cols}`;$$('[data-table-cell]',tableGrid).forEach(cell=>cell.classList.toggle('active',Number(cell.dataset.row)<=rows&&Number(cell.dataset.col)<=cols))};
 for(let r=1;r<=10;r++)for(let c=1;c<=10;c++){const b=document.createElement('button');b.type='button';b.dataset.tableCell='1';b.dataset.row=String(r);b.dataset.col=String(c);b.title=`${r} linha(s) × ${c} coluna(s)`;b.setAttribute('aria-label',b.title);b.addEventListener('pointerenter',()=>{tableRows.value=String(r);tableCols.value=String(c);highlightTableGrid(r,c)});b.onclick=()=>{insertTableAtSelection(editor,r,c);tableMenu.open=false;markDirty();updateContextTools();editor.focus()};tableGrid.append(b)}
 const syncTableManual=()=>{const r=clampTable(tableRows.value,20),c=clampTable(tableCols.value,12);tableRows.value=String(r);tableCols.value=String(c);tableStatus.textContent=`${r} × ${c}`;highlightTableGrid(Math.min(r,10),Math.min(c,10));if(r>10||c>10)tableStatus.textContent=`${r} × ${c}`};
 tableRows.oninput=syncTableManual;tableCols.oninput=syncTableManual;$('#insertTableManual',root).onclick=()=>{const r=clampTable(tableRows.value,20),c=clampTable(tableCols.value,12);insertTableAtSelection(editor,r,c);tableMenu.open=false;markDirty();updateContextTools();editor.focus()};highlightTableGrid(2,2);
 // removeFormat: implemented with Range/DOM so the selection is preserved across toolbar focus.
 $('#clearBtn',root).onclick=()=>{restoreSelection();const r=selectionIn(editor);if(!r||r.collapsed)return;const text=document.createTextNode(r.toString());r.deleteContents();r.insertNode(text);const nr=document.createRange();nr.selectNodeContents(text);getSelection().removeAllRanges();getSelection().addRange(nr);rememberSelection();markDirty()};
 $$('[data-table-action]',root).forEach(b=>b.onclick=()=>{const cell=selectedCell(editor);if(!cell)return;const a=b.dataset.tableAction;if(a==='rowBefore')tableAddRow(cell,false);else if(a==='rowAfter')tableAddRow(cell,true);else if(a==='colBefore')tableAddColumn(cell,false);else if(a==='colAfter')tableAddColumn(cell,true);else if(a==='mergeRight')tableMergeRight(cell);else if(a==='mergeDown')tableMergeDown(cell);else if(a==='alignLeft')tableSetAlign(cell,'left');else if(a==='alignCenter')tableSetAlign(cell,'center');else if(a==='alignRight')tableSetAlign(cell,'right');else if(a==='deleteRow')tableDeleteRow(cell);else if(a==='deleteCol')tableDeleteColumn(cell);else if(a==='deleteTable')cell.closest('table')?.remove();markDirty();updateContextTools()});
 $$('[data-image-size]',root).forEach(b=>b.onclick=()=>{if(!activeInlineImage)return;activeInlineImage.style.width=`${Number(b.dataset.imageSize)}%`;activeInlineImage.style.height='auto';markDirty()});
 $('#removeInlineImage',root).onclick=async()=>{if(!activeInlineImage)return;const handle=activeInlineImage.dataset.handleId;activeInlineImage.remove();if(handle){await invoke('remove_attachment',{handleId:handle}).catch(()=>{});attachments=attachments.filter(a=>String(a.id)!==String(handle));renderAttachments()}activeInlineImage=null;updateContextTools();markDirty()};
 $$('[data-image-align]',root).forEach(button=>button.addEventListener('click',()=>{if(!activeInlineImage||!editor.contains(activeInlineImage))return;const align=button.dataset.imageAlign;activeInlineImage.style.display='block';activeInlineImage.style.marginLeft=align==='right'?'auto':align==='center'?'auto':'0';activeInlineImage.style.marginRight=align==='left'?'auto':align==='center'?'auto':'0';markDirty()}));
 $('#imageAltBtn',root).onclick=async()=>{if(!activeInlineImage||!editor.contains(activeInlineImage))return;const value=await promptDialog('Descreva a imagem para leitores de tela:',activeInlineImage.alt||'',{title:'Texto alternativo'});if(value!==null&&value!==undefined){activeInlineImage.alt=String(value);markDirty()}};
 editor.addEventListener('keyup',updateContextTools);editor.addEventListener('mouseup',updateContextTools);editor.addEventListener('click',e=>{if(e.target?.matches?.('img.inlineComposeImage')){activeInlineImage=e.target;editor.querySelectorAll('.tcsImageSelected').forEach(x=>x.classList.remove('tcsImageSelected'));activeInlineImage.classList.add('tcsImageSelected');$('#imageTools',root)?.classList.remove('hidden');positionGrip()}else updateContextTools()});
 editor.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const cell=selectedCell(editor);if(e.shiftKey&&!cell){e.preventDefault();$('#cSubject',root).focus({preventScroll:true});return}e.preventDefault();if(cell){tableTabNavigate(editor,cell,e.shiftKey);updateContextTools();markDirty();return}if(e.shiftKey){styleBlock(editor,{marginLeft:'0'});markDirty();return}insertTabStop(editor);markDirty()});
 editor.addEventListener('paste',e=>{const html=e.clipboardData?.getData('text/html');if(!html)return;e.preventDefault();const safe=stripUnsafePaste(html);if(!execEditorCommand(editor,'insertHTML',safe)){const r=selectionIn(editor);if(r){const f=r.createContextualFragment(safe);r.deleteContents();r.insertNode(f)}}markDirty()});
 let history=[],future=[];const remember=()=>{history.push(editor.innerHTML);if(history.length>50)history.shift();future=[]};editor.addEventListener('beforeinput',remember);$('#undoBtn',root).onclick=()=>{if(!history.length)return;future.push(editor.innerHTML);editor.innerHTML=history.pop();markDirty();updateWordCount()};$('#redoBtn',root).onclick=()=>{if(!future.length)return;history.push(editor.innerHTML);editor.innerHTML=future.pop();markDirty();updateWordCount()};
 const templateHtml=t=>String(t?.body||'').startsWith('<!--tcs-html-->')?String(t.body).slice('<!--tcs-html-->'.length):esc(t?.body||'').replace(/\n/g,'<br>');
 const selectedTemplate=()=>templates.find(x=>String(x.id)===$('#templateSelect',root).value)||null;
 $('#templateInsert',root).onclick=()=>{const t=selectedTemplate();if(!t)return toast('Escolha um template.');if(!$('#cSubject',root).value&&t.subject)$('#cSubject',root).value=t.subject;const box=document.createElement('div');box.innerHTML=templateHtml(t);const frag=document.createDocumentFragment();while(box.firstChild)frag.append(box.firstChild);insertNode(editor,frag);markDirty()};
 $('#templateReplace',root).onclick=async()=>{const t=selectedTemplate();if(!t)return toast('Escolha um template.');if((editor.innerText||'').trim()&&!await confirmDialog('Substituir o corpo atual pelo template selecionado?',{confirmLabel:'Substituir'}))return;$('#cSubject',root).value=t.subject||$('#cSubject',root).value;refreshSubjectTitle();const existingSig=editor.querySelector('[data-signature]')?.outerHTML||'';editor.innerHTML=templateHtml(t)+existingSig;markDirty()};
 $('#templateSave',root).onclick=async()=>{const name=await promptDialog('Nome do template:',$('#cSubject',root).value.trim()||'Novo template',{title:'Salvar como template'});if(!name)return;const clone=editor.cloneNode(true);clone.querySelector('[data-signature]')?.remove();const id=await invoke('save_template',{req:{id:0,name,subject:$('#cSubject',root).value,body:`<!--tcs-html-->${clone.innerHTML}`}});await invoke('set_setting',{req:{key:`template.${id}.account_id`,value:String(accountId)}});templates.push({id,name,subject:$('#cSubject',root).value,body:`<!--tcs-html-->${clone.innerHTML}`,_accountId:Number(accountId)});const opt=document.createElement('option');opt.value=String(id);opt.textContent=name;$('#templateSelect',root).append(opt);$('#templateSelect',root).value=String(id);$('#templateSelect',root).dispatchEvent(new Event('tcs-select-refresh'));toast('Template salvo.')};
 $('#templateSelect',root).onchange=()=>{};
 signatureSelect.onchange=async e=>{const choice=e.target.value;manualSignatureId=choice==='auto'||choice==='none'?null:Number(choice)||null;if(choice==='none'){editor.querySelector('[data-signature]')?.remove();markDirty();return}if(choice==='auto'){const id=Number($('#cFrom',root)?.value)||null;pref=await signatureFor(id);if(pref)applySignature(editor,pref.body);else editor.querySelector('[data-signature]')?.remove();markDirty();return}const sig=sigs.find(x=>String(x.id)===choice);if(sig){applySignature(editor,sig.body);markDirty()}};
 const syncCustomFromVisibility=()=>{$('#customFromBlock',root)?.classList.toggle('show',$('#cFrom',root)?.value==='__custom__')};syncCustomFromVisibility();
 const closeCustomFrom=()=>$('#customFromBlock',root)?.classList.remove('show');
 $('#customFromClose',root)?.addEventListener('click',closeCustomFrom);
 $('#customFromSave',root)?.addEventListener('click',async()=>{const email=$('#customFromEmail',root)?.value.trim()||'';if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ $('#composerError',root).textContent='Informe um endereço de remetente personalizado válido.';$('#customFromEmail',root)?.focus();return }markDirty();await saveDraft().catch(e=>{$('#composerError',root).textContent=String(e)});closeCustomFrom();toast('Remetente salvo no rascunho.');});
 root.addEventListener('pointerdown',e=>{const pop=$('#customFromBlock',root);if(!pop?.classList.contains('show'))return;if(e.target.closest('#customFromBlock')||e.target.closest('#cFrom')||e.target.closest('.fromLine>.selectShell'))return;pop.classList.remove('show')});
 $('#cFrom',root)?.addEventListener('change',async e=>{if(e.target.value.startsWith(accountChoicePrefix)){
   const nextId=Number(e.target.value.slice(accountChoicePrefix.length));const next=ctx.state.boot.accounts.find(a=>Number(a.id)===nextId);
   if(!next){e.target.value='';return}
   // Preserve the current composition rather than silently moving a draft between accounts.
   const confirmed=await confirmDialog(`Abrir uma nova composição usando ${next.email}? O rascunho atual será preservado nesta conta para evitar misturar credenciais, anexos ou identidades.`,{confirmLabel:'Abrir com outra conta'});
   e.target.value='';if(!confirmed)return;
   try{await reconcileInlineAttachments();await invoke('save_local_draft',{id:draftId,accountId,draftJson:snapshot()});if(!options.openAccountComposer)throw new Error('Troca entre contas indisponível nesta janela');await options.openAccountComposer(nextId,{to:recipientFields.to.commit(),cc:recipientFields.cc.commit(),bcc:recipientFields.bcc.commit(),subject:$('#cSubject',root).value,textBody:textVersion(editor),htmlBody:serializableHtml(),composeFormat:$('#composeFormatMode',root).value});toast('Novo compositor aberto; rascunho original preservado. Anexos precisam ser incluídos novamente.');}
   catch(err){$('#composerError',root).textContent=`Não foi possível trocar de conta: ${String(err)}`}
   return;
 }syncCustomFromVisibility();if(e.target.value==='__custom__')setTimeout(()=>$('#customFromName',root)?.focus(),0);const id=e.target.value==='__custom__'?null:(Number(e.target.value)||null);if(signatureSelect.value!=='auto'){markDirty();return}pref=await signatureFor(id);if(pref)applySignature(editor,pref.body);else editor.querySelector('[data-signature]')?.remove();markDirty()});

 // Reconcile CID handles against the editor DOM. Only inline handles are eligible;
 // regular file attachments must never be removed by deleting an image.
 let reconciling=false;
 const reconcileInlineAttachments=async()=>{
   if(reconciling)return;reconciling=true;
   try{
     const used=new Set([...editor.querySelectorAll('img')].flatMap(img=>{
       const vals=[];if(img.dataset.handleId)vals.push(`id:${img.dataset.handleId}`);
       if(img.dataset.inlineCid)vals.push(`cid:${img.dataset.inlineCid.replace(/^<|>$/g,'').toLowerCase()}`);
       const src=img.getAttribute('src')||'';if(/^cid:/i.test(src))vals.push(`cid:${src.slice(4).replace(/^<|>$/g,'').toLowerCase()}`);
       return vals;
     }));
     for(const a of [...attachments]){
       if(!a.content_id)continue;
       const cid=String(a.content_id).replace(/^<|>$/g,'').toLowerCase();
       if(used.has(`id:${a.id}`)||used.has(`cid:${cid}`))continue;
       await invoke('remove_attachment',{handleId:a.id});
       attachments=attachments.filter(x=>String(x.id)!==String(a.id));
     }
     renderAttachments();
   }finally{reconciling=false}
 };
 const renderAttachments=()=>{$('#attachmentList',root).innerHTML=attachments.map(a=>`<span class="chip">${esc(a.filename)} · ${formatBytes(a.size)}${a.content_id?' · inline':''} <button data-remove="${a.id}">×</button></span>`).join('');$$('[data-remove]',root).forEach(b=>b.onclick=async()=>{const id=b.dataset.remove;editor.querySelectorAll(`img[data-handle-id="${CSS.escape(String(id))}"]`).forEach(img=>img.remove());await invoke('remove_attachment',{handleId:id});attachments=attachments.filter(a=>String(a.id)!==String(id));renderAttachments();markDirty()})};
 if(seed.draftId){
   attachments=await invoke('list_draft_attachments',{draftId}).catch(()=>[]);
   for(const item of attachments.filter(a=>a.content_id)){
     const img=[...editor.querySelectorAll('img')].find(el=>String(el.getAttribute('src')||'')===`cid:${item.content_id}`);
     if(img){
       img.dataset.inlineCid=item.content_id;
       img.dataset.handleId=item.id;
       img.classList.add('inlineComposeImage');
       const preview=await invoke('inline_image_preview',{handleId:item.id}).catch(()=>'');
       if(preview)img.src=preview;
     }
   }
   renderAttachments();
 }

 if(seed.attachMessageId){try{attachments.push(await invoke('attach_message_as_eml',{messageId:seed.attachMessageId,draftId}));renderAttachments()}catch(e){$('#composerError',root).textContent=String(e)}}
 $('#inlineImageBtn',root).onclick=async()=>{try{const item=await invoke('pick_inline_image',{draftId});if(!item)return;attachments.push(item);const img=document.createElement('img');img.src=`cid:${item.content_id}`;img.dataset.inlineCid=item.content_id;img.dataset.handleId=item.id;img.alt=item.filename;img.className='inlineComposeImage';const preview=await invoke('inline_image_preview',{handleId:item.id}).catch(()=>'');if(preview)img.src=preview;insertNode(editor,img);renderAttachments();markDirty()}catch(e){$('#composerError',root).textContent=String(e)}};
 $('#attachBtn',root).onclick=async()=>{try{attachments.push(...await invoke('pick_attachments',{draftId}));const seen=new Set();attachments=attachments.filter(a=>!seen.has(`${a.filename}:${a.size}`)&&seen.add(`${a.filename}:${a.size}`));renderAttachments()}catch(e){$('#composerError',root).textContent=String(e)}};
 // Imported bytes are copied into the app-owned draft directory; never keep a transient browser URL.
 const storeDropped=async(file,inline=false)=>{if(!file||!file.size)return;if(file.size>8*1024*1024&&inline)throw Error('Imagem ultrapassa 8 MiB');if(file.size>25*1024*1024)throw Error('Arquivo ultrapassa 25 MiB');const bytes=new Uint8Array(await file.arrayBuffer());const chunk=0x4000;let binary='';for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));const item=await invoke('import_composer_file',{draftId,filename:file.name||'imagem.png',mimeType:file.type||'application/octet-stream',dataBase64:btoa(binary),inline});attachments.push(item);if(inline){const img=document.createElement('img');img.setAttribute('src',`cid:${item.content_id}`);img.dataset.inlineCid=item.content_id;img.dataset.handleId=item.id;img.alt=item.filename;img.className='inlineComposeImage';const preview=await invoke('inline_image_preview',{handleId:item.id}).catch(()=>'');if(preview)img.src=preview;insertNode(editor,img)}renderAttachments();markDirty();updateWordCount()};
 editor.addEventListener('paste',async e=>{if(!r13.paste)return;const images=[...(e.clipboardData?.files||[])].filter(f=>/^image\/(png|jpeg|gif|webp)$/.test(f.type));if(!images.length)return;e.preventDefault();for(const file of images){try{await storeDropped(file,true)}catch(err){$('#composerError',root).textContent=String(err)}}});
 const dragHost=$('.composerNative',root);dragHost.addEventListener('dragover',e=>{if(!r13.drag||!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy'});
 dragHost.addEventListener('drop',async e=>{if(!r13.drag||!e.dataTransfer?.files?.length)return;e.preventDefault();for(const file of e.dataTransfer.files){try{await storeDropped(file,false)}catch(err){$('#composerError',root).textContent=String(err)}}});
 $('#composeFormatMode',root).onchange=e=>{const plain=e.target.value==='plain';editor.dataset.composeFormat=e.target.value;$$('.composeToolbar button,.composeToolbar input[type="color"],.composeToolbar #fontFamily,.composeToolbar #fontSize,.composeToolbar #blockFormat',root).forEach(x=>{if(!x.closest('#composeAiBtn')&&x.id!=='composeFormatMode')x.disabled=plain});markDirty()};$('#composeFormatMode',root).dispatchEvent(new Event('change'));
 $('#composeAiBtn',root).onclick=async()=>{
  if(!ctx.state.boot.settings.aiEnabled){toast('Configure a IA em Configurações → IA e RAG.');ctx.openSettings?.('ai');return}
  if(seed.sourceMessageId&&!await authorizeAiMessage(Number(seed.sourceMessageId),{invoke,modal}))return;
  const selected=(preservedRange&&!preservedRange.collapsed&&editor.contains(preservedRange.commonAncestorContainer))?preservedRange.cloneRange():null;
  const selectedText=selected?.toString()?.trim()||'';
  const editableText=()=>{if(selected)return selected.toString().trim();const clone=editor.cloneNode(true);clone.querySelectorAll('[data-signature],[data-original-message]').forEach(x=>x.remove());return textVersion(clone)};
  const fragment=value=>{const f=document.createDocumentFragment();String(value||'').split('\n').forEach((line,i)=>{if(i)f.append(document.createElement('br'));f.append(document.createTextNode(line))});return f};
  const apply=value=>{if(selected){if(!editor.contains(selected.commonAncestorContainer)||selected.toString().trim()!==selectedText){throw new Error('A seleção mudou. Selecione novamente o trecho.')}const r=selected.cloneRange();r.deleteContents();r.insertNode(fragment(value));}else{const locked=new Set([...editor.childNodes].filter(n=>n.nodeType===1&&(n.matches('[data-signature],[data-original-message]')||n.querySelector('[data-signature],[data-original-message]'))));[...editor.childNodes].forEach(n=>{if(!locked.has(n))n.remove()});editor.insertBefore(fragment(value),editor.firstChild)}markDirty();v.close()};
  const v=modal('Assistente de IA',workspaceHtml('composer',{selection:selectedText}),{wide:true,resizable:true,persistKey:'ai-workspace-composer'});
  bindAiWorkspace(v.root,{mode:'composer',defaultAction:selectedText?'correct':editableText()?'correct':'generate',settings:()=>ctx.openSettings?.('ai'),sourceText:editableText,apply,run:async({action,guidance,tone,length,language,previous,refine,signal})=>{
    const selectedAction=({professional:'rewrite',formal:'rewrite',casual:'rewrite',concise:'rewrite',expand:'rewrite',translate:'rewrite',correct:'rewrite',generate:'rewrite'})[action]||action;
    const style=({professional:'professional',formal:'formal',casual:'casual',concise:'concise',expand:'professional',translate:'professional'})[action]||tone;
    const directives=[action==='correct'?'Corrija somente ortografia, gramática e pontuação, preservando significado e tom.':action==='concise'?'Encurte o texto mantendo as informações essenciais.':action==='expand'?'Amplie com clareza sem inventar fatos.':'',guidance,length==='short'?'Responda de forma breve.':length==='long'?'Forneça uma resposta detalhada.':'',action==='translate'?`Traduza para o idioma ${language||'pt-BR'}.`:'',refine&&previous?`Refine a seguinte versão, mantendo o sentido: ${previous}`:''].filter(Boolean).join(' ');
    const source=[refine&&previous?previous:(action==='generate'?guidance:editableText()),directives?`\n\nInstruções do usuário: ${directives}`:''].join('').trim();
    if(!source)throw new Error('Não há texto editável para esta operação.');
    const requestId=crypto.randomUUID();
    const cancel=()=>{invoke('ai_cancel_generation',{requestId}).catch(()=>{});};
    signal?.addEventListener('abort',cancel,{once:true});
    let r;
    try{r=await invoke('ai_compose_assist',{req:{text:source,action:selectedAction==='generate'&&!seed.sourceMessageId?'rewrite':selectedAction,style,sourceMessageId:seed.sourceMessageId||null},requestId},{signal});}
    finally{signal?.removeEventListener('abort',cancel)}
    return r?.text||'';
  }});
 };
 $('#follow',root).onchange=e=>$('#followAt',root).disabled=!e.target.checked;$('#schedule',root).onchange=e=>$('#sendAt',root).disabled=!e.target.checked;
 $('#discard',root).onclick=async()=>{if(r13.confirmDiscard&&hasMeaningfulContent()&&!await confirmDialog('Descartar este rascunho?',{danger:true,confirmLabel:'Descartar'}))return;terminalizing=true;clearTimeout(saveSoonTimer);clearTimeout(remoteSoonTimer);clearInterval(autoSaveTimer);clearInterval(remoteDraftTimer);await saveChain.catch(()=>{});await remoteChain.catch(()=>{});await invoke('delete_local_draft',{id:draftId}).catch(()=>{});close()};
 const sendFailureMessage=e=>{const raw=String(e||'Erro desconhecido');const clean=raw.replace(/(authorization|bearer|password|passwd|token|secret|client_secret|refresh_token)\s*[:=]\s*[^\s,;]+/gi,'$1=[oculto]').slice(0,320);if(/auth|oauth|login|credential|535|530/i.test(raw))return `Falha de autenticação: ${clean}`;if(/timeout|timed out|network|connect|dns|socket|connection/i.test(raw))return `Falha de conexão: ${clean}`;if(/recipient|address|destinat|invalid|550|551|553/i.test(raw))return `Problema de endereço/destinatário: ${clean}`;return `Falha ao preparar o envio: ${clean}`};
 let enqueueInProgress=false;
 $('#sendBtn',root).onclick=async()=>{if(enqueueInProgress)return;try{await reconcileInlineAttachments()}catch(e){$('#composerError',root).textContent=String(e);return}const customFrom=$('#cFrom',root)?.value==='__custom__';const customEmail=$('#customFromEmail',root)?.value.trim()||'';if(customFrom&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customEmail)){ $('#composerError',root).textContent='Informe um endereço de remetente personalizado válido.';return }if(customFrom&&customEmail.toLowerCase()!==String(account?.email||'').toLowerCase()&&!await confirmDialog('Você alterou o endereço de e-mail do remetente. O provedor pode recusar o envio e a autenticação SPF/DKIM/DMARC pode não corresponder. Continuar somente se este endereço for uma identidade/alias autorizado.',{confirmLabel:'Usar endereço autorizado'}))return;const to=recipientFields.to.commit().trim();if(!to){$('#composerError',root).textContent='Informe ao menos um destinatário.';return}const subject=$('#cSubject',root).value.trim();if(!subject&&!await confirmDialog('Enviar esta mensagem sem assunto?',{confirmLabel:'Enviar mesmo assim'}))return;const bodyNow=textVersion(editor);const cc=recipientFields.cc.commit().trim(),bcc=recipientFields.bcc.commit().trim();const allRecipients=[...recipientFields.to.emails(),...recipientFields.cc.emails(),...recipientFields.bcc.emails()];
 if(safety.replyAll&&seed.inReplyTo&&allRecipients.length>1&&!await confirmDialog(`Esta resposta será enviada a ${allRecipients.length} destinatários. Continuar?`,{confirmLabel:'Continuar'}))return;
 if(allRecipients.length>=10&&!bcc&&!await confirmDialog(`Há ${allRecipients.length} destinatários visíveis e nenhum Cco. Continuar?`,{confirmLabel:'Continuar'}))return;
 const audit=inspectMessageSafety({text:bodyNow,html:serializableHtml(),attachmentCount:attachments.length,recipients:allRecipients,internalDomains:safety.internalDomains, sender:account?.email||'',domainHints:safety.domainHints});
 if(audit.invalidRecipients.length){$('#composerError',root).textContent=`Destinatário inválido: ${audit.invalidRecipients.join(', ')}`;return}
 if(safety.attachment&&audit.missingAttachment&&!await confirmDialog('O texto parece mencionar anexos, mas nenhum arquivo está anexado. Enviar mesmo assim?',{confirmLabel:'Enviar sem anexo'}))return;
 if(safety.external&&safety.internalDomains.length&&audit.externalRecipients.length&&!await confirmDialog(`Destinatários externos aos domínios internos: ${audit.externalRecipients.join(', ')}. Continuar?`,{confirmLabel:'Continuar'}))return;
 if(safety.domainHints&&audit.domainHints.length&&!await confirmDialog(`Verifique os domínios: ${audit.domainHints.join('; ')}. Continuar?`,{confirmLabel:'Continuar'}))return;
 if(safety.localLinks&&audit.suspiciousLinks.length&&!await confirmDialog(`Foram encontrados ${audit.suspiciousLinks.length} link(s) que merecem revisão. Nenhum endereço foi acessado. Continuar?`,{confirmLabel:'Continuar'}))return;
 if(safety.finalReview&&!await confirmDialog(`Revisão final\nPara: ${to}\nAssunto: ${subject||'(sem assunto)'}\nAnexos: ${attachments.length}\n\nConfirmar o envio?`,{confirmLabel:'Confirmar envio'}))return;
 const sendAt=$('#schedule',root).checked?fromLocalInput($('#sendAt',root).value):null;const followAt=$('#follow',root).checked?fromLocalInput($('#followAt',root).value):null;const timeError=validateOutgoingTimes({scheduleEnabled:$('#schedule',root).checked,sendAt,followEnabled:$('#follow',root).checked,followAt});if(timeError){$('#composerError',root).textContent=timeError;return}try{if(enqueueInProgress)return;enqueueInProgress=true;$('#sendBtn',root).disabled=true;const sendHtml=editor.cloneNode(true);sendHtml.querySelectorAll('.tcsImageSelected').forEach(el=>el.classList.remove('tcsImageSelected'));sendHtml.querySelectorAll('img[data-inline-cid]').forEach(img=>{img.setAttribute('src',`cid:${img.dataset.inlineCid}`);img.removeAttribute('data-handle-id');img.removeAttribute('data-inline-cid');img.classList.remove('inlineComposeImage','tcsImageSelected')});const id=await invoke('queue_send',{req:{accountId,identityId:$('#cFrom',root)?.value==='__custom__'?null:(Number($('#cFrom',root)?.value)||null),customFromName:$('#customFromName',root)?.value.trim()||null,customFromEmail:$('#customFromEmail',root)?.value.trim()||null,replyTo:($('#cFrom',root)?.value==='__custom__'?null:(senderById(Number($('#cFrom',root)?.value)||null)?._meta?.reply_to||null)),draftId,to,cc, bcc,subject:$('#cSubject',root).value,textBody:textVersion(editor),htmlBody:$('#composeFormatMode',root).value==='plain'?'':sendHtml.innerHTML,inReplyTo:seed.inReplyTo||null,references:seed.references||null,requestReadReceipt:$('#receipt',root).checked,sendAtTs:sendAt,undoSeconds:Number($('#undoSeconds',root).value),followUpTs:followAt,followUpNote:''}});terminalizing=true;clearTimeout(saveSoonTimer);clearTimeout(remoteSoonTimer);clearInterval(autoSaveTimer);clearInterval(remoteDraftTimer);await saveChain.catch(()=>{});await remoteChain.catch(()=>{});await invoke('delete_local_draft',{id:draftId}).catch(()=>{});localStorage.removeItem(revisionKey);close();if(sendAt&&sendAt>Math.floor(Date.now()/1000)+30)toast('Mensagem agendada.');else{toast('Mensagem na fila de envio.','DESFAZER',()=>invoke('cancel_outbound',{id}));setTimeout(()=>invoke('process_outbound').catch(()=>{}),11000)}}catch(e){$('#composerError',root).textContent=sendFailureMessage(e);$('#sendBtn',root).disabled=false}finally{enqueueInProgress=false}};
 let detaching=false;
 const detachToWindow=async()=>{
   if(terminalizing||detaching||isClosed())return;
   if(!options.inlineHost||!options.openDetached)throw new Error('Este editor não está em uma aba integrada.');
   detaching=true;root.setAttribute('aria-busy','true');
   const previousPointerEvents=root.style.pointerEvents,wasInert=root.inert;root.style.pointerEvents='none';root.inert=true;
   try{
    // Block mutations in the old editor until the destination confirms mounting.
    clearTimeout(saveSoonTimer);clearTimeout(remoteSoonTimer);
    await saveChain.catch(()=>{});
    await reconcileInlineAttachments();
    await invoke('save_local_draft',{id:draftId,accountId,draftJson:snapshot()});
    await options.openDetached(draftId);
    terminalizing=true;options.onTransferred?.(draftId);close();
   }finally{
    detaching=false;root.inert=wasInert;root.style.pointerEvents=previousPointerEvents;root.removeAttribute('aria-busy');
   }
 };
 const updateActive=()=>{if(!root.isConnected||root.closest('.composerTabPanel[hidden]'))return;const r=selectionIn(editor);if(!r)return;let n=r.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;const tags=new Set();while(n&&n!==editor){tags.add(n.tagName?.toLowerCase());n=n.parentElement}$$('[data-inline]',root).forEach(b=>b.classList.toggle('active',tags.has(b.dataset.inline)))};selectionHandler=updateActive;document.addEventListener('selectionchange',selectionHandler);editor.addEventListener('keyup',updateActive);editor.addEventListener('mouseup',updateActive);
 root.addEventListener('keydown',async e=>{
  const inEditor=editor.contains(e.target)||e.target===editor;
  if(inEditor&&shortcutMatches(e,'bold',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();toggleInline(editor,'strong');markDirty();return}
  if(inEditor&&shortcutMatches(e,'italic',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();toggleInline(editor,'em');markDirty();return}
  if(inEditor&&shortcutMatches(e,'underline',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();toggleInline(editor,'u');markDirty();return}
  if(inEditor&&shortcutMatches(e,'link',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();$('#linkBtn',root).click();return}
  if(inEditor&&shortcutMatches(e,'undo',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();$('#undoBtn',root).click();return}
  if(inEditor&&shortcutMatches(e,'redo',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();$('#redoBtn',root).click();return}
  if(shortcutMatches(e,'saveDraft',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();dirty=true;await saveDraft();toast('Rascunho salvo.');return}
  if(shortcutMatches(e,'send',ctx.state.boot.settings)){e.preventDefault();e.stopPropagation();$('#sendBtn',root).click();return}
 },true);
 editor.focus();
 return {draftId,root,close,requestClose,isClosed,saveDraft,detachToWindow,saveSnapshot:async()=>{await saveChain.catch(()=>{});await reconcileInlineAttachments();await invoke('save_local_draft',{id:draftId,accountId,draftJson:snapshot()})}};
}
