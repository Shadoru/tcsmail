import fs from 'node:fs';
import assert from 'node:assert/strict';
const main=fs.readFileSync('frontend/main.js','utf8');
const composer=fs.readFileSync('frontend/composer.js','utf8');
const native=fs.readFileSync('frontend/native_window.js','utf8');
const css=fs.readFileSync('frontend/styles.css','utf8');
assert.match(main,/accepted:restored/);
assert.match(main,/const restored=await attachExistingDraft\(draftId\)/);
assert.doesNotMatch(main,/setTimeout\(\(\)=>attachExistingDraft/);
assert.match(main,/sidebar\.insertBefore\(shelf,settings\)/);
assert.match(css,/workspaceShelf,.appShell\.compact~.workspaceShelf\{position:static!important/);
assert.match(css,/inlineComposerLayer \.composerFooter\{position:relative!important/);
assert.match(composer,/id="returnToReaderPanel"[^>]*data-reattach-panel/);
assert.match(native,/querySelectorAll\('\[data-reattach-panel\]'\)/);
assert.match(composer,/tcsImageResizeGrip/);
assert.match(composer,/await reconcileInlineAttachments\(\);await invoke\('save_local_draft'/);
assert.match(composer,/await reconcileInlineAttachments\(\)\}catch\(e\)/);
// Exercise the actual reconciliation body using a DOM simulation.
const begin=composer.indexOf(' const reconcileInlineAttachments=async()=>{');
const end=composer.indexOf('\n const renderAttachments=',begin);
assert(begin>0&&end>begin);
const impl=composer.slice(begin,end);
async function checkScenario(items,images,expectedRemoved){
 let attachments=items.map(x=>({...x}));
 const removed=[];
 const editor={querySelectorAll:()=>images.map(x=>({dataset:x.dataset||{},getAttribute:k=>k==='src'?x.src:''}))};
 const invoke=async(_name,params)=>{removed.push(params.handleId)};
 const renderAttachments=()=>{};
 const runner=new Function('editor','invoke','renderAttachments','initial',`let attachments=initial;let reconciling=false;${impl};return async()=>{await reconcileInlineAttachments();return attachments;}`);
 const result=await runner(editor,invoke,renderAttachments,attachments)();
 assert.deepEqual(removed,expectedRemoved);return result;
}
await checkScenario([{id:'a',content_id:'one'},{id:'b',content_id:''}],[{src:'cid:one'}],[]);
await checkScenario([{id:'a',content_id:'one'},{id:'b',content_id:''}],[],['a']);
await checkScenario([{id:'a',content_id:'one'},{id:'b',content_id:'two'}],[{src:'data:image/png;base64,123',dataset:{handleId:'a',inlineCid:'one'}}],['b']);
await checkScenario([{id:'a',content_id:'ONE'}],[{src:'cid:<ONE>'}],[]);
console.log('R11 image/attachment lifecycle + transfer + layout: PASS');
