import assert from 'node:assert/strict';
import {decodeMailboxLabel,moveFolderChoices,validateMoveSelection} from '../../frontend/folder_move.js';

// No network, credentials, GUI toolkit, or vendor-specific folder semantics.
assert.equal(decodeMailboxLabel('00 - Seguran&AOc-a'), '00 - Segurança');
assert.equal(decodeMailboxLabel('02 - Jur&AO0-dico'), '02 - Jurídico');
assert.equal(decodeMailboxLabel('R&-D'), 'R&D');
assert.equal(decodeMailboxLabel('Ação'), 'Ação');
assert.equal(decodeMailboxLabel('&garbage'), '&garbage');
assert.equal(decodeMailboxLabel('&////-'), '&////-');
const folders=[
  {name:'INBOX',display_name:'Caixa de entrada',selectable:true},
  {name:'Work',display_name:'Work',selectable:true},
  {name:'Work/00 - Seguran&AOc-a',parent:'Work',delimiter:'/',display_name:'00 - Segurança',selectable:true},
  {name:'&- Trabalho',display_name:'& Trabalho',selectable:true},
  {name:'02 - Jur&AO0-dico',display_name:'02 - Jurídico',selectable:true},
  {name:'[Gmail]',display_name:'[Gmail]',selectable:false},
  {name:'[Gmail]/All Mail',parent:'[Gmail]',display_name:'Todos os e-mails',selectable:true},
];
const choices=moveFolderChoices(folders);
assert.equal(choices.find(x=>x.value==='Work/00 - Seguran&AOc-a')?.label,'Work / 00 - Segurança');
assert.equal(choices.find(x=>x.value==='[Gmail]/All Mail')?.label,'[Gmail] / Todos os e-mails');
assert.equal(choices.find(x=>x.value==='02 - Jur&AO0-dico')?.label,'02 - Jurídico');
assert(!choices.some(x=>x.value==='[Gmail]'));
const one=[{id:42,account_id:1,folder:'INBOX'}];
assert.equal(validateMoveSelection(one,'Work/00 - Seguran&AOc-a',choices),null);
assert.match(validateMoveSelection(one,'[Gmail]',choices),/destino/);
assert.match(validateMoveSelection([{id:42,account_id:1},{id:43,account_id:2}],'INBOX',choices),/mesma conta/);
assert.match(validateMoveSelection([{id:42,account_id:1,local_draft:true}],'INBOX',choices),/servidor/);
assert.match(validateMoveSelection(one,'INBOX',choices,{sourceFolder:'INBOX'}),/já estão/);
assert.equal(choices.find(x=>x.label==='Work / 00 - Segurança')?.value, 'Work/00 - Seguran&AOc-a');
console.log('PASS: RC7 IMAP raw IDs/display, nested folders, move restrictions, Gmail/MS/generic-compatible');
