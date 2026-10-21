#!/usr/bin/env node
// No downloads, no browser or user data: structural regression guards for h3.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../frontend/main.js', import.meta.url),'utf8');
const composer=readFileSync(new URL('../frontend/composer.js', import.meta.url),'utf8');
const startup=readFileSync(new URL('../frontend/startup-guard.js', import.meta.url),'utf8');
const html=readFileSync(new URL('../frontend/index.html', import.meta.url),'utf8');
assert(!main.includes('<div id="inlineComposerHost" class="inlineComposerHost"></div>'), 'Nested composer host in message reader');
assert(main.includes("pane.querySelector(':scope > #inlineComposerHost')"), 'Host lookup must be direct-child scoped');
assert(main.includes("pane.querySelectorAll('#reader #inlineComposerHost')"), 'Legacy duplicates must be handled');
assert(main.includes("document.querySelector('.mailWorkspace .reader > #inlineComposerHost')"), 'Parking must use a direct child');
assert(main.includes('panel.contains(controller?.root)'), 'Missing editor mounting guard');
assert(composer.includes('embeddedHost:options.inlineHost||null'), 'Inline modal must mount in supplied host');
assert(startup.includes("startup.querySelector(':scope > span')"), 'Delayed startup must not mutate spinner');
assert(startup.includes("initialStartup.querySelector(':scope > span')"), 'Startup localization must not mutate spinner');
assert(html.includes('class="startupMessage"'), 'Startup message should be outside spinner');
console.log('PASS: UI contracts — unique composer host, scoped insertion, visible editor guard and inert startup spinner');

assert(main.includes('const composerTabs=new Map()'), 'Missing multi-tab manager');
assert(main.includes('composerTabs.has(draftId)'), 'Missing draft identity check');
assert(main.includes('!composerTabs.has(draftId)'), 'Reattachment must reject same draft, not other open tabs');
assert(main.includes('entry.controller?.requestClose?.()'), 'Tab close must respect cancel/save/discard');
assert(composer.includes('data-tcs-id'), 'Multiple composers must isolate DOM IDs');
assert(composer.includes('options.onClosed?.(draftId)'), 'Composer close must remove its tab');
assert(composer.includes('options.onSubjectChange?.(title)'), 'Tab title must follow subject');
assert(!main.includes('let inlineComposer=null'), 'Single-composer guard must be removed');
console.log('PASS: h3 multi-compose tab contracts');
