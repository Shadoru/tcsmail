
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const main=fs.readFileSync(path.join(root,'frontend/main.js'),'utf8');
const rust=fs.readFileSync(path.join(root,'src-tauri/src/lib.rs'),'utf8');
for(const marker of [
 'folderExpansion:{}','folderExpansionKey','folderIsExpanded','toggleFolderExpansion',
 "persistNavigationState('expansion')",'data-folder-toggle'
])assert.ok(main.includes(marker),`Expansão persistente sem ${marker}`);
assert.ok(rust.includes('appearance.folder_expansion'),'Snapshot não preserva expansão');
console.log('FOLDER EXPANSION CONTRACT: PASS');
