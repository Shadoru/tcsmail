// Small synthetic DOM/IPC boundary for exercising the production modules.
// No browser, server, mail database, credentials or application process is used.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const clone=value=>JSON.parse(JSON.stringify(value));
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
export async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}

export class Element {
  constructor(tag='div',attrs='') {
    this.tagName=tag.toUpperCase();this.attrs={};this.dataset={};this.children=[];this.events={};
    this.isConnected=true;this.disabled=/\bdisabled\b/.test(attrs);this.checked=/\bchecked\b/.test(attrs);
    this.value='';this.textContent='';this.style={};this.scrollTop=0;
    for(const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g))this.setAttribute(m[1],m[2]);
    const classes=new Set((this.attrs.class||'').split(/\s+/).filter(Boolean));
    this.classList={contains:c=>classes.has(c),add:(...cs)=>cs.forEach(c=>classes.add(c)),remove:(...cs)=>cs.forEach(c=>classes.delete(c)),toggle:(c,on)=>{const yes=on??!classes.has(c);yes?classes.add(c):classes.delete(c);return yes;}};
  }
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='value')this.value=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  disconnect(){this.isConnected=false;this.children.forEach(c=>c.disconnect());}
  set innerHTML(html){
    this.children.forEach(c=>c.disconnect());this.html=String(html);this.children=[];
    for(const m of this.html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi))this.children.push(new Element(m[1],m[2]));
    for(const m of this.html.matchAll(/<(select|button)\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi)){
      const el=this.querySelector('#'+m[3]);if(!el)continue;
      el.textContent=m[4].replace(/<[^>]*>/g,'');
      if(m[1].toLowerCase()==='select')el.value=m[4].match(/<option\b[^>]*value="([^"]*)"[^>]*selected/)?.[1]??m[4].match(/<option\b[^>]*value="([^"]*)"/)?.[1]??'';
    }
  }
  get innerHTML(){return this.html||'';}
  append(...els){this.children.push(...els);}
  prepend(...els){this.children.unshift(...els);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){
    const match=el=>selector.startsWith('#')?el.attrs.id===selector.slice(1):selector.startsWith('.')?el.classList.contains(selector.slice(1)):selector.startsWith('[')?el.attrs[selector.match(/^\[([^\]=]+)/)?.[1]]!==undefined&&(!selector.endsWith(':checked')||el.checked):el.tagName.toLowerCase()===selector;
    return this.children.flatMap(el=>[...(match(el)?[el]:[]),...el.querySelectorAll(selector)]);
  }
  addEventListener(type,handler){(this.events[type]??=[]).push(handler);}
  async emit(type){if(this.disabled||!this.isConnected)return;const e={type,target:this,stopPropagation(){},preventDefault(){}};await this['on'+type]?.(e);for(const fn of this.events[type]||[])await fn(e);}
  dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e);return true;}
}

export function moduleHarness(file,extras={}) {
  const document=new Element('document');document.body=new Element('body');document.children.push(document.body);
  document.createElement=tag=>new Element(tag);
  document.body.innerHTML='<div id="app"></div><div id="contentMain"></div>';
  const calls=[],toasts=[],modals=[],prompts=[],composers=[],events=[];
  let confirm=async()=>true;
  const runtime={console,document,crypto:{randomUUID:()=> 'synthetic-id'},
    window:{addEventListener:(type,fn)=>events.push([type,fn]),dispatchEvent:()=>{},__TAURI__:{window:{getCurrentWindow:()=>null}}},
    Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    $:(q,root=document)=>root.querySelector(q),$$:(q,root=document)=>root.querySelectorAll(q),
    esc:s=>String(s??''),fmtDate:()=> 'synthetic date',fmtDay:()=> 'synthetic day',formatBytes:String,
    icon:()=>'',tr:s=>s,getLocale:()=> 'pt-BR',field:(label,control)=>control,decodeMailboxLabel:s=>s,
    toast:message=>toasts.push(String(message)),confirmDialog:async(...args)=>{prompts.push(args);return confirm(...args);},
    modal:(title,html)=>{const root=new Element();root.innerHTML='<div class="modalBody"></div>'+html;document.body.children.push(root);const dialog={title,root,box:root,close:()=>root.disconnect()};modals.push(dialog);return dialog;},
    invoke:async(command,args={})=>{calls.push([command,clone(args)]);return null;},
    emailHtmlForDisplay:async(m,{allowRemote})=>`safe:${m.body_html}:${allowRemote}`,
    sanitizeComposerHtml:()=> '<p>sanitized synthetic quote</p>',
    openNativeComposer:async(...args)=>composers.push(clone(args)),
    fromLocalInput:()=>null,attachReaderFind:()=>({open(){}}),
    ...extras,
  };
  const sourceRoot=process.env.TCS_083_SOURCE_ROOT||process.cwd();
  const source=fs.readFileSync(path.join(sourceRoot,file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/\bexport (?=(?:async )?function)/g,'');
  const context=vm.createContext(runtime);vm.runInContext(source,context,{filename:file});
  return {context,document,calls,toasts,modals,prompts,composers,events,setConfirm:fn=>{confirm=fn;},$:id=>document.querySelector('#'+id)};
}
