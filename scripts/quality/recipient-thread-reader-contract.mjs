
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const r=await import(pathToFileURL(path.join(root,'frontend/recipients.js')).href);

assert.deepEqual(r.parseRecipientToken('Ana <ana@example.com>'),{name:'Ana',email:'ana@example.com'});
assert.deepEqual(r.parseRecipientToken('bob@example.org'),{name:'',email:'bob@example.org'});
assert.equal(r.parseRecipientToken('não-é-email'),null);
const list=r.parseRecipientList('Ana <ana@example.com>, bob@example.org; ana@example.com');
assert.equal(list.length,2);
assert.equal(r.recipientListValue(list),'Ana <ana@example.com>, bob@example.org');
assert.deepEqual(r.recipientEmails(list),['ana@example.com','bob@example.org']);
assert.equal(r.validRecipientCount(list),2);

const composer=fs.readFileSync(path.join(root,'frontend/composer.js'),'utf8');
const main=fs.readFileSync(path.join(root,'frontend/main.js'),'utf8');
const rust=fs.readFileSync(path.join(root,'src-tauri/src/lib.rs'),'utf8');

for(const marker of [
 'installRecipientField','recipientChips','recipient_suggestions',
 "e.key==='Backspace'","clipboardData","aria-expanded"
])assert.ok(composer.includes(marker),`Composer sem ${marker}`);

const rustCompact=rust.replace(/\s+/g,'');
for(const marker of [
 'struct RecipientSuggestion','async fn recipient_suggestions',
 'recent_recipient','source:"history"'
])assert.ok(rustCompact.includes(marker.replace(/\s+/g,'')),`Backend de autocomplete sem ${marker}`);

for(const marker of [
 'threadMessageActions','data-thread-reply-all','data-thread-forward',
 'data-thread-open','data-thread-copy','data-thread-save',
 'adjacentRegularMessage','readerEmptyInner'
])assert.ok(main.includes(marker),`Thread/Reader sem ${marker}`);

console.log('RECIPIENT / THREAD / READER CONTRACT: PASS');
