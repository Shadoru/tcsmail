const isMac=()=>/Mac|iPhone|iPad/.test(navigator.platform||'');
const locale=()=>String(localStorage.getItem('tcs.effectiveLocale')||navigator.language||'pt-BR').toLowerCase().startsWith('pt')?'pt':'en';
export const SHORTCUTS={
 newMessage:{default:'Ctrl+N',scope:'global',pt:'Nova mensagem',en:'New message'},
 commandCenter:{default:'Ctrl+Alt+K',scope:'global',pt:'Central de comandos',en:'Command Center'},
 settings:{default:'Ctrl+,',scope:'global',pt:'Configurações',en:'Settings'},
 search:{default:'Ctrl+E',aliases:['F3'],scope:'mail',pt:'Pesquisar',en:'Search'},
 advancedSearch:{default:'Ctrl+Shift+F',scope:'mail',pt:'Pesquisa avançada',en:'Advanced search'},
 savedSearches:{default:'Ctrl+Shift+P',scope:'mail',pt:'Pesquisas salvas',en:'Search folders'},
 openMessage:{default:'Ctrl+O',scope:'mail',pt:'Abrir mensagem',en:'Open message'},
 inbox:{default:'Ctrl+Shift+I',scope:'global',pt:'Caixa de entrada',en:'Inbox'},
 outbox:{default:'Ctrl+Shift+O',scope:'global',pt:'Caixa de saída',en:'Outbox'},
 contacts:{default:'Ctrl+Shift+B',scope:'global',pt:'Contatos',en:'Address book'},
 sync:{default:'Ctrl+M',aliases:['F9'],scope:'mail',pt:'Sincronizar',en:'Send/Receive'},
 reply:{default:'Ctrl+R',scope:'mail',pt:'Responder',en:'Reply'},
 replyAll:{default:'Ctrl+Shift+R',scope:'mail',pt:'Responder a todos',en:'Reply all'},
 forward:{default:'Ctrl+F',scope:'mail',pt:'Encaminhar',en:'Forward'},
 forwardAttachment:{default:'Ctrl+Alt+F',scope:'mail',pt:'Encaminhar como anexo',en:'Forward as attachment'},
 markRead:{default:'Ctrl+Q',scope:'mail',pt:'Marcar como lida',en:'Mark as read'},
 markUnread:{default:'Ctrl+U',scope:'mail',pt:'Marcar como não lida',en:'Mark as unread'},
 move:{default:'Ctrl+Shift+V',scope:'mail',pt:'Mover para pasta',en:'Move to folder'},
 flag:{default:'Insert',scope:'mail',pt:'Sinalizar',en:'Flag'},
 followUp:{default:'Ctrl+Shift+G',scope:'mail',pt:'Acompanhamento',en:'Follow up'},
 print:{default:'Ctrl+P',scope:'mail',pt:'Imprimir',en:'Print'},
 properties:{default:'Alt+Enter',scope:'mail',pt:'Propriedades da mensagem',en:'Message properties'},
 notSpam:{default:'Ctrl+Alt+J',scope:'mail',pt:'Não é spam',en:'Not junk'},
 bold:{default:'Ctrl+B',scope:'composer',pt:'Negrito',en:'Bold'},
 italic:{default:'Ctrl+I',scope:'composer',pt:'Itálico',en:'Italic'},
 underline:{default:'Ctrl+Shift+U',scope:'composer',pt:'Sublinhado',en:'Underline'},
 link:{default:'Ctrl+K',scope:'composer',pt:'Inserir link',en:'Insert link'},
 undo:{default:'Ctrl+Z',scope:'composer',pt:'Desfazer',en:'Undo'},
 redo:{default:'Ctrl+Y',scope:'composer',pt:'Refazer',en:'Redo'},
 saveDraft:{default:'Ctrl+S',scope:'composer',pt:'Salvar rascunho',en:'Save draft'},
 send:{default:'Ctrl+Enter',scope:'composer',pt:'Enviar',en:'Send'},
};
export const shortcutSettingKey=action=>({newMessage:'shortcuts.new_message',commandCenter:'shortcuts.command_center',settings:'shortcuts.settings'}[action]||`shortcuts.${action.replace(/[A-Z]/g,m=>'_'+m.toLowerCase())}`);
const normalize=s=>String(s||'').replace(/\s+/g,'').replace(/Cmd|Command/ig,'Ctrl').toLowerCase();
export function chordFromEvent(e){const p=[];if(e.ctrlKey||e.metaKey)p.push('Ctrl');if(e.altKey)p.push('Alt');if(e.shiftKey)p.push('Shift');let k=e.key;if(k===' ')k='Space';if(k.length===1)k=k.toUpperCase();if(['Control','Shift','Alt','Meta'].includes(k))return'';p.push(k);return p.join('+')}
export function bindings(action,settings={}){const d=SHORTCUTS[action];if(!d)return[];if(action==='bold')return[d.default];const legacy={newMessage:'shortcutNew',commandCenter:'shortcutCommand',settings:'shortcutSettings'};const custom=settings.shortcuts?.[action]||settings[`shortcut_${action}`]||settings[`shortcut${action[0].toUpperCase()}${action.slice(1)}`]||(legacy[action]?settings[legacy[action]]:null);return [custom||d.default,...(d.aliases||[]),...(locale()==='pt'?(d.aliasesPt||[]):(d.aliasesEn||[]))].filter(Boolean)}
export function matches(e,action,settings={}){const got=normalize(chordFromEvent(e));return bindings(action,settings).some(x=>normalize(x)===got)}
export function displayChord(chord){if(!isMac())return String(chord).replace(/\+/g,' + ');return String(chord).replace(/Ctrl/g,'⌘').replace(/Alt/g,'⌥').replace(/Shift/g,'⇧').replace(/\+/g,' ')}
export function label(action){const d=SHORTCUTS[action];return d?.[locale()]||d?.en||action}
export function tooltip(action,settings={}){const b=bindings(action,settings).map(displayChord);return `${label(action)}${b.length?` (${b.join(' / ')})`:''}`}
export function validateShortcutMap(map){const seen=new Map(),conflicts=[];for(const [action,chord] of Object.entries(map)){const d=SHORTCUTS[action];if(!d||!chord)continue;const key=`${d.scope}:${normalize(chord)}`;if(seen.has(key))conflicts.push([seen.get(key),action,chord]);else seen.set(key,action)}return conflicts}
