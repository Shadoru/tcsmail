import {openSettings} from '../../frontend/views.js';
import {installControlEnhancer} from '../../frontend/ui_controls.js';
import {initI18n,installI18nObserver} from '../../frontend/i18n.js';
const original=window.__TAURI__.core.invoke;
const provider={id:'synthetic',name:'Conexão de demonstração com nome longo e acentuação',kind:'openai',endpoint:'',enabled:true,api_version:'',project:'',region:'',chat_timeout_secs:30};
const config={enabled:false,rag_enabled:false,fast:{provider_id:provider.id,model:'gpt-test'},advanced:{provider_id:provider.id,model:'gpt-test'},embedding:{provider_id:provider.id,model:''},analysis_scope:'none',preanalyze_received:false,shadow_mode:true};
window.fixtureCalls=[];
window.__TAURI__.core.invoke=async(cmd,args={})=>{
 window.fixtureCalls.push([cmd,args]);
 if(window.failCommand===cmd)throw Error('synthetic failure');
 if(cmd==='ai_get_runtime_config')return structuredClone(config);
 if(cmd==='ai_providers')return [structuredClone(provider)];
 if(cmd==='ai_save_provider'){Object.assign(provider,args.provider);return null}
 if(cmd==='ai_save_runtime_config'){Object.assign(config,args.req);return null}
 if(cmd==='ai_test_provider')return null;
 if(cmd==='ai_list_models')return ['gpt-test','gpt-another','text-embedding-test'];
 if(cmd==='list_folder_tree')return [{name:'00 - Seguran&AOc-a e Contas',display_name:'00 - Segurança e Contas',selectable:true,delimiter:'/'}];
 if(cmd==='list_folders')return ['INBOX','00 - Seguran&AOc-a e Contas'];
 return original(cmd,args);
};
const boot=await window.__TAURI__.core.invoke('bootstrap');
Object.assign(boot,{version:'0.8.2-rc8-fix1',platform:'test renderer'});
boot.accounts[0].name='Conta de demonstração com nome muito longo · Segurança e Gestão';
const ctx={state:{boot,account:1,folder:'INBOX',navigationMode:'tree'},persistNavigationState:async()=>{},setTheme:()=>{},setDensity:()=>{},setCompact:async()=>{},openFolderOrganizer:()=>{},openNavigationGroupsManager:()=>{},setNavigationMode:async()=>{},goView:()=>{},openComposer:()=>{}};
initI18n(new URLSearchParams(location.search).get('lang')||'pt-BR');installI18nObserver();installControlEnhancer();
window.openFixture=async(kind='general')=>{document.querySelectorAll('.modalLayer').forEach(el=>el.remove());await openSettings(ctx,kind)};
await window.openFixture(new URLSearchParams(location.search).get('page')||'ai');
document.body.dataset.ready='true';
