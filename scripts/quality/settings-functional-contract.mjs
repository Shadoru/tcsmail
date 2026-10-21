import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const src=fs.readFileSync(path.join(root,'frontend/views.js'),'utf8');

const implemented=['general','appearance','accounts','inbox','composition','folders','sync','signatures','templates','identities','spam','rules','searches','calendarPrefs','contactsPrefs','notifications','ai','privacy','shortcuts','importexport','diagnostics','advanced','about'];
for(const kind of implemented)assert.ok(src.includes(`if(kind==='${kind}')`),`Página de Configurações sem implementação ${kind}`);
const topLevel=['general','appearance','accounts','inbox','composition','folders','rules','searches','privacy','calendarPrefs','contactsPrefs','notifications','ai','shortcuts','importexport','diagnostics','about'];
for(const kind of topLevel)assert.ok(src.includes(`['${kind}'`),`Navegação de Configurações sem ${kind}`);
assert.ok(topLevel.length<=18,`Configurações possuem ${topLevel.length} entradas de primeiro nível`);
assert.ok(src.includes("signatures:'composition',templates:'composition',identities:'composition'"),'Composição não agrupa assinaturas/templates/identidades');
assert.ok(src.includes("sync:'folders'")&&src.includes("spam:'privacy'")&&src.includes("advanced:'diagnostics'"),'Subáreas relacionadas não estão agrupadas');
assert.ok(src.includes("['composition','Editor'],['signatures','Assinaturas'],['templates','Templates'],['identities','Identidades e aliases']"),'Abas internas de Composição ausentes');
assert.ok(src.includes("['folders','Pastas'],['sync','Sincronização']"),'Pastas/Sincronização não estão lado a lado');
assert.ok(src.includes("['privacy','Privacidade'],['spam','Spam']"),'Privacidade/Spam não estão lado a lado');
assert.ok(src.includes("['diagnostics','Diagnóstico'],['advanced','Avançado']"),'Diagnóstico/Avançado não estão lado a lado');
assert.ok(src.includes("await page(initial)"),'Configurações não carregam a página inicial');
console.log('SETTINGS FUNCTIONAL CONTRACT: PASS');
