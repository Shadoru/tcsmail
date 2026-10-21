#!/usr/bin/env node
// Zero-network source contracts. Functional browser and native tests remain separate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const main=read('../frontend/main.js'),composer=read('../frontend/composer.js');
const views=read('../frontend/views.js'),native=read('../frontend/native_window.js');
const rust=read('../src-tauri/src/lib.rs'),css=read('../frontend/styles.css');
const expect=(source,fragments,label)=>{for(const t of fragments)assert(source.includes(t),`${label}: ausente ${t}`)};
expect(main,['get_message_cached','get_message\',{id}', 'state.openRequestSeq', 'state.listRequestSeq','requestSeq!==state.listRequestSeq','state.current?.id','readerHydrationError','tcs-composer-ready','composerTabDetach','entry.controller.detachToWindow()','tcs.doubleClickBehavior'], 'Leitura e navegação');
expect(composer,["$('#cSubject',root).addEventListener('keydown'",'editor.focus({preventScroll:true})','refreshSubjectTitle()','root.setAttribute(\'aria-busy\',\'true\')','detachToWindow','data-tcs-id','terminalizing','await saveChain.catch(()=>{})','await remoteChain.catch(()=>{})'], 'Compositor');
expect(native,['tcs-composer-ready','data-tcs-id="editor"','tcs-reattach-response'], 'Janela independente');
expect(views,['doubleClickBehavior','Nome exibido','Nome da caixa','m.display_name||a.email'], 'Configurações e contas');
expect(rust,['async fn get_message_cached','get_message_cached,','name: base.as_ref()','sender_label=db.get_setting','primary_sender = db.get_setting','identity.meta'], 'Rust/OAuth/remetente');
expect(css,['user-select:none','user-select:text','.composerTabDetach','.readerPinnedTab','var(--accent)'], 'Tema e navegação');
assert(!rust.includes('name: if identity.name.trim().is_empty()'), 'OAuth poderia renomear caixa personalizada');
assert(!composer.includes('name:accountMeta.display_name||account?.name'), 'Nome local indevidamente usado como remetente');
console.log('PASS: contratos h4 — leitura, concorrência, remetente, teclado, abas, janela, temas');
