// Actual settings module with a synthetic DOM and IPC. No mail, keys or network.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source=fs.readFileSync('frontend/ai_settings.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
class Element {
  constructor(tag='div',attrs='') {
    this.tagName=tag.toUpperCase();this.value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';
    this.type=attrs.match(/\btype="([^"]*)"/)?.[1]||'';this.checked=/\bchecked\b/.test(attrs);
    this.disabled=false;this.open=false;this.isConnected=true;this.dataset={};this.events={};this.attrs={};this.controls={};this.buttons=[];
  }
  set innerHTML(html) {
    this.html=html;
    if(this.tagName==='SELECT') {this.value=html.match(/<option\b[^>]*\bvalue="([^"]*)"/)?.[1]||'';return;}
    for(const match of html.matchAll(/<([a-z]\w*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
      const el=new Element(match[1],match[2]);this.controls[match[3]]=el;
      if(el.tagName==='BUTTON')this.buttons.push(el);
    }
    for(const match of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi))this.controls[match[1]].innerHTML=match[2];
    this.services=[...html.matchAll(/<button\b[^>]*\bdata-service="([^"]+)"[^>]*>/g)].map(m=>{const b=new Element('button');b.dataset.service=m[1];this.buttons.push(b);return b;});
  }
  get innerHTML(){return this.html||'';}
  querySelector(selector){return this.controls[selector.slice(1)]||null;}
  querySelectorAll(selector){return selector==='button'?this.buttons:selector==='[data-service]'?this.services||[]:[];}
  setAttribute(name,value){this.attrs[name]=value;}
  removeAttribute(name){delete this.attrs[name];}
  hasAttribute(name){return name in this.attrs;}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  async emit(name){for(const fn of this.events[name]||[])await fn({target:this});}
}
async function harness({enabled=false,roles=false}={}) {
  const provider={id:'synthetic-provider',name:'Synthetic connection',kind:'openai',endpoint:'https://synthetic.invalid',enabled:true,chat_timeout_secs:30};
  const config={enabled,rag_enabled:false,advanced:{provider_id:provider.id,model:'gpt-synthetic'},fast:{provider_id:provider.id,model:roles?'gpt-fast-synthetic':'gpt-synthetic'},embedding:{provider_id:provider.id,model:''},analysis_scope:'none',preanalyze_received:false,shadow_mode:true};
  const calls=[],fail=new Set();let panel;
  const runtime={console,crypto:{randomUUID:()=> 'new-synthetic-provider'},
    document:{createElement:()=>new Element()},
    esc:s=>String(s??''),tr:s=>s,field:(name,control)=>control,
    moveFolderChoices:()=>[],confirmDialog:async()=>true,
    invoke:async(command,args={})=>{
      calls.push([command,clone(args)]);
      if(fail.has(command))throw Error('synthetic IPC failure');
      if(command==='ai_get_runtime_config')return clone(config);
      if(command==='ai_providers')return [clone(provider)];
      if(command==='ai_save_provider'){Object.assign(provider,args.provider);return null;}
      if(command==='ai_list_models')return ['gpt-synthetic'];
      if(command==='get_setting_value')return 'true';
      if(['ai_rag_sources','ai_collections','list_folder_tree'].includes(command))return [];
      return null;
    },
  };
  const context=vm.createContext(runtime);
  const code=source.replace(/^import .*;\s*$/gm,'').replace(/\bexport (?=(?:async )?function)/g,'');
  vm.runInContext(code,context);
  await context.renderAiSettings({replaceChildren:p=>{panel=p;}},{state:{boot:{accounts:[],settings:{}}}});
  return {panel,$:id=>panel.controls[id],calls,fail,provider,config};
}

test('opening and testing never save, activate, authorize, read mail or include email data',async()=>{
  const h=await harness();
  await h.$('aiTest').onclick();
  const tested=h.calls.filter(([c])=>c==='ai_test_provider');
  assert.deepEqual(tested,[['ai_test_provider',{providerId:'synthetic-provider',model:'gpt-synthetic'}]]);
  assert.equal(h.calls.filter(([c])=>/^ai_save_|^ai_update_|get_message/.test(c)).length,0);
  assert.equal(h.$('aien').checked,false);
});
test('failed test cannot activate a newly configured AI',async()=>{
  const h=await harness();h.fail.add('ai_test_provider');
  await h.$('aiTest').onclick();h.$('aien').checked=true;await h.$('aiSave').onclick();
  assert.equal(h.calls.filter(([c])=>c==='ai_save_runtime_config').length,0);
});
test('closing the role disclosure preserves an explicitly selected fast model',async()=>{
  const h=await harness({roles:true});
  h.$('aiRoleDetails').open=false;
  await h.$('aiSave').onclick();
  assert.equal(h.calls.find(([c])=>c==='ai_save_runtime_config')[1].req.fast.model,'gpt-fast-synthetic');
});
test('RAG collections, search and index actions retain real command wiring',async()=>{
  const h=await harness();
  h.$('ragCollectionName').value='Synthetic collection';h.$('ragCollectionScope').value='*';
  await h.$('ragCollectionAdd').onclick();
  h.$('ragQuery').value='synthetic query';await h.$('ragSearch').onclick();
  await h.$('ragStatus').onclick();await h.$('ragReindex').onclick();
  assert.deepEqual(h.calls.find(([c])=>c==='ai_add_collection')[1],{name:'Synthetic collection',accountScope:'*'});
  assert.deepEqual(h.calls.find(([c])=>c==='ai_rag_search')[1],{query:'synthetic query'});
  assert.ok(h.calls.some(([c])=>c==='ai_rag_status'));
  assert.ok(h.calls.some(([c])=>c==='ai_rag_reindex'));
});
test('saving changed provider transport with the same ID requires a fresh test',async()=>{
  const h=await harness({enabled:true});
  h.$('aiEndpoint').value='https://changed-synthetic.invalid';await h.$('aiEndpoint').emit('input');
  await h.$('aiConnect').onclick();
  assert.equal(h.calls.filter(([c])=>c==='ai_save_provider').length,1);
  await h.$('aiSave').onclick();
  assert.equal(h.calls.filter(([c])=>c==='ai_save_runtime_config').length,0,'Changed connection must not inherit a preexisting model binding test exemption');
});
test('privacy update failure leaves AI disabled instead of active under the old policy',async()=>{
  const h=await harness({enabled:true});h.fail.add('ai_update_privacy_policy');
  h.$('aiScope').value='per_message';
  await h.$('aiSave').onclick();
  const writes=h.calls.filter(([c])=>c==='ai_save_runtime_config');
  assert.ok(writes.length>0);
  assert.equal(writes.at(-1)[1].req.enabled,false,'Fail closed until privacy policy is committed');
});
