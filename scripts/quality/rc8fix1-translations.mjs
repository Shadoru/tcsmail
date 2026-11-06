// Extract literal AI UI calls, then execute the actual English translator.
// Does not translate provider IDs, endpoints, model IDs, folder IDs or user text.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync('frontend/'+name,'utf8');
const source=read('ai_settings.js');
const dictionary=read('rc8fix1_en.js').replace(/\bexport /g,'');
const i18n=read('i18n.js').replace(/^import .*;\s*$/gm,'').replace(/\bexport /g,'');
const context=vm.createContext({localStorage:{getItem:()=>null,setItem:()=>{}},document:{documentElement:{},body:null},navigator:{languages:['en-US'],language:'en-US'},console});
vm.runInContext(dictionary+'\n'+i18n+'\ninitI18n("en-US");',context);
const keys=[...new Set([...source.matchAll(/\b(?:tx|label|status|confirmDialog|tr)\(('(?:\\.|[^'\\])*')/g)].map(match=>vm.runInNewContext(match[1])))];
const portuguese=/[áàâãéêíóôõúç]|\b(?:Salvar|Remover|Conta|Pasta|Nome|Modelo|Conexão|Testar|Ativar|Apagar|Consultar|Usar|Quando|Arquivo|Coleção|Somente|Todas|Informe|Verifique|Escolha|Limpar|Ignorar|Nenhum|Nenhuma|Endereço)\b/i;
const missing=keys.filter(key=>portuguese.test(key)&&context.tr(key)===key);
assert.deepEqual(missing,[],'Literal AI interface strings missing English translations');
assert.equal(context.tr('synthetic-model-id-2026'),'synthetic-model-id-2026');
assert.equal(context.tr('00 - Seguran&AOc-a e Contas'),'00 - Seguran&AOc-a e Contas');
assert.equal(context.tr('https://synthetic.invalid/v1'),'https://synthetic.invalid/v1');
console.log(`PASS: ${keys.length} extracted AI UI literals checked through the actual English translator; protocol IDs remain unchanged`);
