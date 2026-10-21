
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const nav=await import(pathToFileURL(path.join(root,'frontend/nav_modes.js')).href);
const accounts=[{id:1,name:'Pessoal'},{id:2,name:'Trabalho'},{id:3,name:'Projeto'}];

assert.deepEqual(nav.NAV_MODES,['tree','unified','groups','favorites','columns','tabs']);
for(const mode of nav.NAV_MODES)assert.equal(nav.normalizeNavMode(mode),mode);
assert.equal(nav.normalizeNavMode('invalid'),'tree');

const groups=nav.normalizeGroups([
 {id:'g1',name:'Pessoal',accountIds:[1,1,99]},
 {id:'g2',name:'Trabalho',accountIds:[2,3]}
],accounts);
assert.deepEqual(groups[0].accountIds,[1]);
assert.deepEqual(nav.groupAccountIds(groups,'g2'),[2,3]);

let refs=[];
refs=nav.toggleFolderRef(refs,1,'INBOX/Pessoal','Pessoal');
assert.equal(nav.isFavorite(refs,1,'INBOX/Pessoal'),true);
refs=nav.toggleFolderRef(refs,1,'INBOX/Pessoal','Pessoal');
assert.equal(refs.length,0);

const hidden=[{accountId:1,folder:'INBOX/Antiga'}];
const tree=[
 {name:'INBOX',subscribed:true},
 {name:'INBOX/Pessoal',subscribed:true},
 {name:'INBOX/Antiga',subscribed:true},
 {name:'Arquivo externo',subscribed:false}
];
assert.deepEqual(
 nav.visibleFolders(tree,{accountId:1,hidden,subscribedOnly:false}).map(x=>x.name),
 ['INBOX','INBOX/Pessoal','Arquivo externo']
);
assert.deepEqual(
 nav.visibleFolders(tree,{accountId:1,hidden,subscribedOnly:true}).map(x=>x.name),
 ['INBOX','INBOX/Pessoal']
);

const main=fs.readFileSync(path.join(root,'frontend/main.js'),'utf8');
const views=fs.readFileSync(path.join(root,'frontend/views.js'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/styles.css'),'utf8');
for(const marker of [
 'function treeSidebarHtml()',
 'function unifiedSidebarHtml()',
 'function groupsSidebarHtml()',
 'function favoritesSidebarHtml()',
 'function columnsSidebarHtml()',
 'function tabsSidebarHtml()',
 'function navigationSidebarHtml()',
 'openNavigationGroupsManager',
 'openFolderOrganizer',
 'data-folder-toggle',
 'appearance.navigation_groups',
 'appearance.folder_favorites',
 'appearance.hidden_folders',
 'appearance.subscribed_only'
]) assert.ok(main.includes(marker),`main.js sem ${marker}`);

for(const mode of nav.NAV_MODES)assert.ok(views.includes(`value="${mode}"`),`Configurações sem modo ${mode}`);
assert.ok(views.includes("kind==='folders'"),'Configurações sem página Pastas');
assert.ok(css.includes('.navMode-columns'),'CSS sem layout de múltiplas colunas');
assert.ok(css.includes('.navTabs'),'CSS sem modo de abas');
assert.ok(main.includes('openWorkspaceManager'),'Workspace sem gerenciador dedicado');

console.log('NAVIGATION MODES CONTRACT: PASS');
