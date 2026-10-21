import assert from 'node:assert/strict';
import {bindAiWorkspace} from '../../frontend/ai_workspace.js';

class Elem {
  constructor(id=''){this.id=id;this.dataset={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.listeners={};this.children=[];this.parentElement={hidden:false};this.classList={toggle:()=>{}};}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]??[]).filter(x=>x!==fn)}
  click(){for(const fn of this.listeners.click??[])fn({target:this})}
  emit(type){for(const fn of this.listeners[type]??[])fn({target:this})}
  replaceChildren(...arr){this.children=arr}
  setAttribute(k,v){this[k]=v}
  focus(){}
  select(){}
}
const names=['#aiWorkGuidance','#aiWorkCustom','[data-ai-preview]','[data-ai-state]','[data-ai-apply]','[data-ai-variants]','#aiWorkTone','#aiWorkLength','#aiWorkLanguage','[data-ai-original]','[data-ai-refine]','[data-ai-title]','[data-ai-description]','[data-ai-tone-wrap]','[data-ai-length-wrap]','[data-ai-language-wrap]','[data-ai-prompt-wrap]','[data-ai-custom-wrap]','[data-ai-generate]','[data-ai-again]','[data-ai-compare]','[data-ai-copy]','[data-ai-settings]'];
const elems=new Map(names.map(n=>[n,new Elem(n)]));
const actions=['summary','explain','information','translate','reply'];
const buttons=actions.map(action=>{const e=new Elem();e.dataset.aiAction=action;return e});
const root={querySelector:s=>elems.get(s)??null,querySelectorAll:s=>s==='[data-ai-action]'?buttons:[]};
globalThis.document={createElement:()=>new Elem()};
const el=k=>elems.get(k);
const queue=[];let cancels=0,applies=0;
const run=({signal,...args})=>new Promise(resolve=>{
  const item={resolve,signal,args};queue.push(item);
  signal.addEventListener('abort',()=>cancels++);
});
const work=bindAiWorkspace(root,{mode:'reader',defaultAction:'summary',sourceText:()=> 'Assunto: Bolsa Mundial\n\nMensagem original para comparação.',run,apply:async()=>applies++});
const wait=()=>new Promise(resolve=>setImmediate(resolve));
// Cancel while generation pending; late resolution must not create previews.
el('[data-ai-generate]').click();
assert.equal(el('[data-ai-generate]').textContent,'Cancelar');
assert.equal(queue.length,1);
el('[data-ai-generate]').click();
assert.equal(cancels,1);
assert.equal(el('[data-ai-generate]').textContent,'Gerar resumo');
queue[0].resolve('RESUMO TARDIO');await wait();
assert.equal(el('[data-ai-preview]').value,'');
assert.match(el('[data-ai-state]').textContent,/cancelad/);
// A later generation succeeds.
el('[data-ai-generate]').click();queue[1].resolve('RESUMO APROVÁVEL');await wait();
assert.equal(el('[data-ai-preview]').value,'RESUMO APROVÁVEL');
assert.equal(applies,0);
// Original is available in comparison.
el('[data-ai-compare]').click();
assert.match(el('[data-ai-original]').textContent,/Mensagem original para comparação/);
// Switching actions and returning restores the previous preview.
buttons[1].click();el('[data-ai-generate]').click();queue[2].resolve('EXPLICAÇÃO');await wait();
buttons[0].click();
assert.equal(el('[data-ai-preview]').value,'RESUMO APROVÁVEL');
buttons[1].click();
assert.equal(el('[data-ai-preview]').value,'EXPLICAÇÃO');
console.log('PASS R7 workspace: cancel, late response suppression, new generation, preserved previews, original comparison');
