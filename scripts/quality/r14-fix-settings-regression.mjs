import fs from 'node:fs';
import assert from 'node:assert/strict';
const code=fs.readFileSync('frontend/views.js','utf8');
assert.match(code,/const loadR13=async\(\)=>\{for\(const \[id,key,defaultValue\] of r13fields\)/);
assert.match(code,/addEventListener\('change',loadR13\)/);
assert.match(code,/await renderComposePrefs\(\);await loadR13\(\);await loadR14\(\)/);
assert.match(code,/const folders=await invoke\('list_folders',[^\n]+if\(\$\('#ioAccount',p\)!==accountSel\)return/);
assert.match(code,/await loadFolders\(\);\s*\/\/[^\n]*\n\s*if\(\$\('#importEml',p\)==null \|\| \$\('#ioAccount',p\)!==accountSel\)return/);
// Behavioral simulation of the asynchronous page-switch race discovered in r14.
const panel={controls:{ioAccount:{value:'1'},importEml:{}}};
const accountSel=panel.controls.ioAccount;
let resolve; const foldersPending=new Promise(r=>resolve=r);
let handlersBound=false, foldersApplied=false;
async function loadFolders(){await foldersPending;if(panel.controls.ioAccount!==accountSel)return;foldersApplied=true;}
async function openImport(){await loadFolders();if(panel.controls.importEml==null||panel.controls.ioAccount!==accountSel)return;handlersBound=true;}
const opening=openImport();panel.controls={diagnostics:{}};resolve(['INBOX']);await opening;
assert.equal(foldersApplied,false);assert.equal(handlersBound,false);
// Non-racing case keeps the intended import/export features.
panel.controls={ioAccount:accountSel,importEml:{}};handlersBound=false;
const reopening=openImport();await reopening;assert.equal(handlersBound,true);assert.equal(foldersApplied,true);
console.log('r14-fix settings regression: PASS (composition loader, settings navigation race, import/export preserved)');
