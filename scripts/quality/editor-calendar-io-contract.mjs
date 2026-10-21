
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const composer=fs.readFileSync(path.join(root,'frontend/composer.js'),'utf8');
const rich=fs.readFileSync(path.join(root,'frontend/rich_editor.js'),'utf8');
const main=fs.readFileSync(path.join(root,'frontend/main.js'),'utf8');
const views=fs.readFileSync(path.join(root,'frontend/views.js'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/styles.css'),'utf8');
const rust=fs.readFileSync(path.join(root,'src-tauri/src/lib.rs'),'utf8');
const drafts=fs.readFileSync(path.join(root,'frontend/drafts.js'),'utf8');

// 28 - Rich text robustness
for(const marker of [
 'execEditorCommand','formatBlock','insertUnorderedList','insertOrderedList',
 'removeFormat','stripUnsafePaste',"editor.addEventListener('paste'",
 'beforeinput','undoBtn','redoBtn'
]) assert.ok(composer.includes(marker)||rich.includes(marker),`Rich text sem ${marker}`);

// 29 - WYSIWYG tables
for(const marker of [
 'tableAddRow','tableDeleteRow','tableAddColumn','tableDeleteColumn',
 'tableMergeRight','tableMergeDown','tableSetAlign','tableTabNavigate',
 'data-table-action="rowBefore"','data-table-action="deleteTable"'
]) assert.ok(composer.includes(marker)||rich.includes(marker),`Tabela WYSIWYG sem ${marker}`);

// 30 - Inline CID lifecycle
for(const marker of [
 'pick_inline_image','inline_image_preview','data-inline-cid','data-handle-id',
 'cid:${item.content_id}','remove_attachment'
]) assert.ok(composer.includes(marker),`Inline/CID sem ${marker}`);
assert.ok(composer.includes('editor.querySelectorAll(`img[data-handle-id='),'Remover anexo não remove imagem inline correspondente');

// 31 - Signatures
for(const marker of [
 'signatureSelect','Assinatura automática','Sem assinatura','select_signature',
 'manualSignatureId','data-signature','signatureId:','noSignature:'
]) assert.ok(composer.includes(marker),`Assinaturas incompletas: ${marker}`);
assert.ok(drafts.includes('signatureId:p.signatureId'),'Draft não preserva assinatura manual');
assert.ok(drafts.includes('noSignature:!!p.noSignature'),'Draft não preserva opção sem assinatura');

// 32 - Templates
for(const marker of [
 'templateInsert','templateReplace','templateSave','save_template',
 '<!--tcs-html-->','Salvar como template'
]) assert.ok(composer.includes(marker),`Templates incompletos: ${marker}`);

// 33 - Calendar consolidation
assert.ok(main.includes("['Abrir Calendário'"),'Command Center não consolida Calendário');
assert.ok(main.includes("['Nova tarefa'"),'Command Center sem Nova tarefa');
assert.ok(main.includes("['Novo evento'"),'Command Center sem Novo evento');
assert.ok(!main.includes("['Agenda',()=>goView('calendar')]"),'Command Center ainda expõe Agenda como módulo separado');
assert.ok(main.includes("<b>Calendário</b>"),'Sidebar sem item Calendário consolidado');

// 34 - Calendar/tasks + RRULE
assert.ok(views.includes("e.target.value!=='CUSTOM'"),'Campo RRULE bruto não depende de Personalizado');
assert.ok(views.includes('function validRRule'),'RRULE sem validação');
assert.ok(views.includes('finalRrule'),'Tarefas/Eventos não usam RRULE validada');
assert.ok(views.includes("$('#hubAgenda')"),'Hub Agenda/Tarefas ausente');
assert.ok(views.includes("$('#hubTasks')"),'Hub Agenda/Tarefas incompleto');

// 35 - Spellcheck
assert.ok(composer.includes('spellcheck="${composePrefs.spell'), 'Composer sem spellcheck configurável por conta/padrão global');
assert.ok(views.includes('spellcheckDefault'),'Configurações sem spellcheck');
assert.ok(rust.includes('composition.spellcheck'),'Snapshot backend sem spellcheck');

// 36 - Print
assert.ok(main.includes("printWithTarget('message')"),'Impressão da mensagem não isolada');
assert.ok(main.includes("printWithTarget('thread')"),'Impressão da conversa ausente');
assert.ok(css.includes('@media print'),'CSS de impressão ausente');
assert.ok(css.includes('data-print-target="message"'),'CSS de impressão da mensagem ausente');
assert.ok(css.includes('data-print-target="thread"'),'CSS de impressão da thread ausente');

// 37 - .eml import/export integrity
assert.ok(views.includes("invoke('import_eml'"),'UI sem importação EML');
assert.ok(main.includes("invoke('export_message_eml'"),'Reader sem exportação EML');
assert.ok(views.includes('RFC822'),'UI não documenta preservação RFC822');
assert.ok(views.includes("invoke('sync_recent',a)"),'Importação não solicita sincronização pós-APPEND');
const rustCompact=rust.replace(/\s+/g,'');
for(const marker of [
 'std::fs::read(path)','append_raw_message(&account, &password, &folder, &raw)',
 'fetch_raw_message_by_uid','std::fs::write(path, raw)'
]) assert.ok(rustCompact.includes(marker.replace(/\s+/g,'')),`Contrato RFC822 EML sem ${marker}`);

console.log('EDITOR / CALENDAR / IO CONTRACT: PASS');
