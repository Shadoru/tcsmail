import {tr,dateLocale} from './i18n.js';
export const invoke=(cmd,args={})=>window.__TAURI__.core.invoke(cmd,args);
export const $=(q,root=document)=>root.querySelector(q);
export const $$=(q,root=document)=>[...root.querySelectorAll(q)];
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmtDate=ts=>ts?new Intl.DateTimeFormat(dateLocale(),{dateStyle:'short',timeStyle:'short'}).format(new Date(ts*1000)):'';
export const fmtDay=ts=>ts?new Intl.DateTimeFormat(dateLocale(),{weekday:'short',day:'2-digit',month:'short'}).format(new Date(ts*1000)):'';
export const formatBytes=n=>{if(!n)return '0 B';const u=['B','KB','MB','GB'];let i=0,v=n;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toFixed(i?1:0)} ${u[i]}`};
export const debounce=(fn,ms=250)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};
export function toast(msg,actionLabel,action){const old=$('.toast');if(old)old.remove();const t=document.createElement('div');t.className='toast';msg=tr(msg);actionLabel=actionLabel?tr(actionLabel):actionLabel;t.innerHTML=`<span>${esc(msg)}</span>${actionLabel?`<button>${esc(actionLabel)}</button>`:''}`;document.body.append(t);if(actionLabel)$('button',t).onclick=async()=>{try{await action?.()}finally{t.remove()}};setTimeout(()=>t.remove(),6000)}
export function modal(title,html,{wide=false,onClose=null,beforeClose=null,closeOnBackdrop=false,resizable=false,persistKey=null,embedded=false,embeddedHost=null}={}){
 let host=embeddedHost||$('#overlayRootGlobal');
 if(!host){host=document.createElement('div');host.id='overlayRootGlobal';document.body.append(host)}
 if(embedded&&(!embeddedHost||!embeddedHost.isConnected))throw new Error('Painel de composição indisponível');
 const previous=document.activeElement;
 const layer=document.createElement('div');
 const depth=host.children.length;
 layer.className=embedded?'modalLayer embeddedModalLayer':'modalLayer';
 if(!embedded)layer.style.zIndex=String(20+depth*2);
 title=tr(title);
 layer.innerHTML=`<div class="overlay"><section class="modal ${wide?'wide':''} ${resizable?'resizable':''}" role="dialog" aria-modal="${embedded?'false':'true'}"><header><strong>${esc(title)}</strong><button class="icon closeModal" aria-label="Fechar">×</button></header><div class="modalBody">${html}</div>${resizable?'<div class="modalResizeHandle" role="separator" aria-label="Redimensionar janela" title="Arraste para redimensionar"></div>':''}</section></div>`;
 host.append(layer);
 const overlay=$('.overlay',layer),box=$('.modal',layer);
 let sizeObserver=null;if(resizable&&!embedded&&persistKey){try{const saved=JSON.parse(localStorage.getItem(`tcs.modal.${persistKey}`)||'null');if(saved?.w)box.style.width=`${Math.min(saved.w,window.innerWidth*.96)}px`;if(saved?.h)box.style.height=`${Math.min(saved.h,window.innerHeight*.94)}px`;sizeObserver=new ResizeObserver(()=>{const r=box.getBoundingClientRect();if(r.width>0&&r.height>0)localStorage.setItem(`tcs.modal.${persistKey}`,JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}))});sizeObserver.observe(box)}catch{}}
 if(resizable&&!embedded){const handle=$('.modalResizeHandle',box);handle?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();handle.setPointerCapture?.(e.pointerId);const start=box.getBoundingClientRect(),sx=e.clientX,sy=e.clientY;const move=ev=>{const maxW=window.innerWidth*.96,maxH=window.innerHeight*.94;box.style.width=`${Math.max(520,Math.min(maxW,start.width+ev.clientX-sx))}px`;box.style.height=`${Math.max(380,Math.min(maxH,start.height+ev.clientY-sy))}px`};const up=ev=>{handle.releasePointerCapture?.(ev.pointerId);handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up)};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up)})}
 let closed=false,closing=false;
 const focusables=()=>$$('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',box).filter(x=>!x.hidden&&x.offsetParent!==null);
 const close=()=>{if(closed)return;closed=true;sizeObserver?.disconnect();document.removeEventListener('keydown',key,true);onClose?.();layer.remove();previous?.focus?.()};
 const requestClose=async()=>{if(closed||closing)return;closing=true;try{if(beforeClose&&await beforeClose()===false)return;close()}finally{closing=false}};
 const key=e=>{if(embedded)return;if(layer.dataset.minimized==='1'||host.lastElementChild!==layer)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();requestClose();return}if(e.key==='Tab'){const f=focusables();if(!f.length){e.preventDefault();box.focus();return}const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 $('.closeModal',layer).onclick=requestClose;
 overlay.onmousedown=e=>{if(closeOnBackdrop&&e.target===overlay)requestClose()};
 box.tabIndex=-1;document.addEventListener('keydown',key,true);if(!embedded)(focusables()[0]||box).focus();
 const minimize=()=>{if(closed)return;layer.dataset.minimized='1';layer.hidden=true};
 const restore=()=>{if(closed)return;layer.dataset.minimized='0';layer.hidden=false;host.append(layer);(focusables()[0]||box).focus()};
 return{root:layer,box,close,requestClose,minimize,restore,isClosed:()=>closed};
}

export function confirmDialog(message,{title='Confirmar',confirmLabel='Confirmar',danger=false}={}){return new Promise(resolve=>{let settled=false;const v=modal(title,`<p class="dialogMessage">${esc(message)}</p><footer class="modalActions"><button id="dialogCancel">Cancelar</button><button id="dialogConfirm" class="${danger?'dangerButton':'primary'}">${esc(confirmLabel)}</button></footer>`,{beforeClose:()=>{if(!settled){settled=true;resolve(false)}return true}});$('#dialogCancel',v.root).onclick=()=>{if(!settled){settled=true;resolve(false)}v.close()};$('#dialogConfirm',v.root).onclick=()=>{if(!settled){settled=true;resolve(true)}v.close()}})}
export function choiceDialog(message,{title='Confirmar',choices=[]}={}){return new Promise(resolve=>{let settled=false;const buttons=choices.map((c,i)=>`<button data-choice="${i}" class="${c.danger?'dangerButton':c.primary?'primary':''}">${esc(c.label)}</button>`).join('');const v=modal(title,`<p class="dialogMessage">${esc(message)}</p><footer class="modalActions choiceDialogActions">${buttons}</footer>`,{wide:choices.length>4,beforeClose:()=>{if(!settled){settled=true;resolve(null)}return true}});$$('[data-choice]',v.root).forEach(b=>b.onclick=()=>{if(!settled){settled=true;resolve(choices[Number(b.dataset.choice)]?.value??null)}v.close()})})}
export function promptDialog(message,value='',{title='Informar',confirmLabel='OK'}={}){return new Promise(resolve=>{let settled=false;const v=modal(title,`<label class="field"><span>${esc(message)}</span><input id="dialogInput" value="${esc(value)}"></label><footer class="modalActions"><button id="dialogCancel">Cancelar</button><button id="dialogConfirm" class="primary">${esc(confirmLabel)}</button></footer>`,{beforeClose:()=>{if(!settled){settled=true;resolve(null)}return true}});const input=$('#dialogInput',v.root);$('#dialogCancel',v.root).onclick=()=>{if(!settled){settled=true;resolve(null)}v.close()};$('#dialogConfirm',v.root).onclick=()=>{if(!settled){settled=true;resolve(input.value)}v.close()};input.addEventListener('keydown',e=>{if(e.key==='Enter')$('#dialogConfirm',v.root).click()});input.focus();input.select()})}
export function field(label,control,help=''){return `<label class="field"><span>${esc(tr(label))}</span>${control}${help?`<small>${esc(tr(help))}</small>`:''}</label>`}
export function sanitizeEmailHtml(raw,{allowRemote=false}={}){const doc=new DOMParser().parseFromString(raw||'','text/html');const blocked=new Set(['SCRIPT','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','META','BASE','LINK','STYLE','SVG','MATH','VIDEO','AUDIO','SOURCE','PORTAL']);const walker=document.createTreeWalker(doc.body,NodeFilter.SHOW_ELEMENT);const remove=[];while(walker.nextNode()){const el=walker.currentNode;if(blocked.has(el.tagName)){remove.push(el);continue}for(const a of [...el.attributes]){const n=a.name.toLowerCase(),v=a.value.trim();const lower=v.toLowerCase();if(n.startsWith('on')||['srcset','srcdoc','formaction','poster','ping'].includes(n)||(n==='style'&&/url\s*\(/i.test(v))||((n==='href'||n==='src'||n==='xlink:href'||n==='background')&&(lower.startsWith('javascript:')||lower.startsWith('vbscript:')||lower.startsWith('file:')||lower.startsWith('data:text/html'))))el.removeAttribute(a.name);}if(el.tagName==='IMG'){let src=el.getAttribute('src')||'';if(/^\/\//.test(src)){src=`https:${src}`;el.setAttribute('src',src)}el.setAttribute('referrerpolicy','no-referrer');el.setAttribute('loading','lazy');el.setAttribute('decoding','async');if(/^https?:/i.test(src)&&!allowRemote){el.setAttribute('data-remote-src',src);el.removeAttribute('src');el.alt=el.alt||tr('[imagem remota bloqueada]');}}if(el.tagName==='A'){const href=el.getAttribute('href')||'';if(href&&!/^(https?:|mailto:|#)/i.test(href))el.removeAttribute('href');el.removeAttribute('target');el.setAttribute('rel','noopener noreferrer');el.setAttribute('referrerpolicy','no-referrer');}}remove.forEach(x=>x.remove());const csp=allowRemote?"default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';":"default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';";return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{font:15px system-ui,sans-serif;line-height:1.55;margin:0;color:#202124;background:white;overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:12px;color:#555}pre{white-space:pre-wrap}table{max-width:100%;border-collapse:collapse}td,th{overflow-wrap:anywhere}</style>${doc.body.innerHTML}`;}
export function toLocalInput(ts){if(!ts)return'';const d=new Date(ts*1000),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
export function fromLocalInput(v){if(!v)return null;const d=new Date(v);return Number.isFinite(d.getTime())?Math.floor(d.getTime()/1000):null}


export async function emailHtmlForDisplay(message,{allowRemote=false}={}){
  let raw=String(message?.body_html||'');
  const attachments=Array.isArray(message?.attachments)?message.attachments:[];
  const inline=attachments.filter(a=>String(a?.content_id||'').trim()&&/^image\//i.test(String(a?.mime_type||'')));
  if(inline.length&&/cid:/i.test(raw)){
    const previews=await Promise.all(inline.map(async a=>{
      try{return [String(a.content_id).replace(/^<|>$/g,''),await invoke('received_inline_image_preview',{messageId:message.id,index:Number(a.index)})]}catch{return [String(a.content_id).replace(/^<|>$/g,''),'']}
    }));
    const doc=new DOMParser().parseFromString(raw,'text/html');
    for(const img of doc.querySelectorAll('img[src]')){
      const src=String(img.getAttribute('src')||'');if(!/^cid:/i.test(src))continue;
      const cid=decodeURIComponent(src.slice(4)).replace(/^<|>$/g,'');
      const hit=previews.find(([key,data])=>key===cid&&data);if(hit)img.setAttribute('src',hit[1]);
    }
    raw=doc.body.innerHTML;
  }
  return sanitizeEmailHtml(raw,{allowRemote});
}
