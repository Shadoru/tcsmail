import fs from 'node:fs';
import assert from 'node:assert/strict';
import {FIRST_RUN_THEMES,needsFirstRun,resolveFirstRunStep,canFinishFirstRun} from '../../frontend/first_run.js';
import {validateOutgoingTimes} from '../../frontend/send_safety.js';
import {GUIDES} from '../../frontend/help_center.js';
assert.ok(GUIDES['pt-BR'][0][3].some(s=>s.includes('preferências ainda não salvas')));
assert.ok(GUIDES['en-US'][0][3].some(s=>s.includes('unsaved preferences')));
import {validateMoveSelection,moveFolderChoices} from '../../frontend/folder_move.js';
const read=path=>fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const ui=read('frontend/main.js'), onboard=read('frontend/first_run.js'), views=read('frontend/views.js');
const composer=read('frontend/composer.js'), controls=read('frontend/ui_controls.js');
const help=read('frontend/help_center.js'), workflow=read('.github/workflows/tcsmail-homologacao.yml');
assert.deepEqual(FIRST_RUN_THEMES.map(x=>x[0]),['system','light','dark','focus','ocean','graphite']);
assert.match(views,/FIRST_RUN_THEMES\.map/);
assert.match(ui,/if\(needsFirstRun\(state\.boot\)\)/);
assert.match(onboard,/autodiscover_account/);
assert.match(onboard,/google_oauth_connect/);
assert.match(onboard,/microsoft_oauth_connect/);
assert.match(onboard,/existingAccountId:null/);
assert.match(onboard,/id="firstRunNotifyMail" checked/);
assert.match(onboard,/value="inline"/);
assert.match(onboard,/localStorage\.removeItem\(KEY\)/);
assert.doesNotMatch(onboard,/localStorage\.setItem\([^)]*password/i);
assert.match(help,/Configurar na primeira abertura/);
assert.match(help,/Set up on first launch/);
assert.match(workflow,/rc7-first-run-regression\.mjs/);
assert.match(controls,/const openSelectShells = new Set\(\)/);
assert.match(controls,/document\.addEventListener\('pointerdown'/);
assert.match(controls,/new MutationObserver\(\(\)=>refresh\(\)\)/);
assert.match(ui,/restoreWorkspaceReaders\(\)\.catch/);
assert.doesNotMatch(ui,/localStorage\.removeItem\('tcs\.workspace\.readers'\)/);
assert.match(views,/History is loaded on demand/);
assert.doesNotMatch(views,/invoke\('sync_backfill',\{accountId:r\.account_id,folder:'INBOX'\}\)/);
assert.match(views,/if\(!v\.id\)location\.reload\(\)/);
assert.match(views,/Conta adicionada com configuração automática\.\'\);location\.reload\(\)/);
assert.match(composer,/validateOutgoingTimes/);
assert.match(workflow,/linux-x64[\s\S]*windows-x64[\s\S]*macos-intel[\s\S]*macos-arm64/);
assert.equal(validateOutgoingTimes({scheduleEnabled:true,sendAt:null,nowSeconds:100}), 'Escolha uma data e horário futuros para o envio agendado.');
assert.equal(validateOutgoingTimes({scheduleEnabled:true,sendAt:99,nowSeconds:100}), 'Escolha uma data e horário futuros para o envio agendado.');
assert.equal(validateOutgoingTimes({scheduleEnabled:true,sendAt:101,nowSeconds:100}), null);
assert.equal(validateOutgoingTimes({followEnabled:true,followAt:null,nowSeconds:100}), 'Escolha data e horário futuros para o follow-up.');
assert.equal(validateOutgoingTimes({followEnabled:true,followAt:99,nowSeconds:100}), 'Escolha data e horário futuros para o follow-up.');
assert.equal(validateOutgoingTimes({followEnabled:true,followAt:101,nowSeconds:100}), null);
assert.equal(validateOutgoingTimes({nowSeconds:100}),null);
const choices=moveFolderChoices([{name:'INBOX',display_name:'Inbox',selectable:true}]);
for(const id of [0,-1,-10,'',null])assert.match(validateMoveSelection([{id,account_id:1,folder:'Sent'}],'INBOX',choices),/servidor/);
assert.equal(validateMoveSelection([{id:7,account_id:1,folder:'Sent'}],'INBOX',choices),null);
// Distinguish UI flow from OS-native system keychain and actual IMAP protocol tests.
console.log('PASS: RC7 first-run two steps, shared appearance themes, OAuth/password discovery, safety fixes, regressions and CI wiring');

// Interrupted onboarding cannot skip account configuration or persist unsafe state.
assert.equal(resolveFirstRunStep('2',0),1);
assert.equal(resolveFirstRunStep('2',1),2);
assert.equal(resolveFirstRunStep('1',1),1);
assert.equal(canFinishFirstRun([]),false);
assert.equal(canFinishFirstRun([{id:1}]),true);
assert.equal(canFinishFirstRun(null),false);
assert.match(onboard,/await invoke\('list_accounts_full'\)/);
assert.match(onboard,/if\(!canFinishFirstRun\(connected\)\)/);
assert.match(onboard,/rememberPreferences\(\);step=next/);
assert.match(onboard,/app\.querySelector\('#firstRunComposer'\)\.value=preferences\.composer/);

// Malformed entries cannot satisfy the minimum persisted account invariant.
assert.equal(canFinishFirstRun([{}]),false);
assert.equal(canFinishFirstRun([{id:-1}]),false);
assert.equal(canFinishFirstRun([{id:0}]),false);
assert.match(onboard,/const fallback=Array\.isArray\(boot\?\.accounts\)\?boot\.accounts:\[\]/);
assert.match(onboard,/localStorage\.setItem\(KEY,'1'\);localStorage\.setItem\(STEP,'2'\)/);

// Three factual benefit cards and six clickable theme previews in PT-BR and EN-US.
for(const text of ['Contas em um só lugar','Dados armazenados localmente','IA somente se você quiser','All your accounts in one place','Data stored locally','AI only if you want it'])assert.ok(onboard.includes(text));
assert.match(onboard,/themePreviewCards\(\)/);
assert.match(onboard,/data-theme-choice/);
assert.match(onboard,/syncThemePreview\(\)/);
const css=read('frontend/styles.css');
for(const [theme,colors] of Object.entries({
 light:['#e4e8ed','#f4f6f8','#ffffff'],
 dark:['#1d2125','#181c20','#15181b'],
 focus:['#17243b','#f2f5f9','#ffffff'],
 ocean:['#083c5a','#eaf5fa','#ffffff'],
 graphite:['#293039','#eef0f2','#ffffff']
})){
  const rule=css.match(new RegExp('\\.firstRunThemePreview\\[data-preview-theme="'+theme+'"\\]\\{([^}]+)\\}'));
  assert.ok(rule,'Missing preview for '+theme);
  for(const color of colors)assert.ok(rule[1].includes(color),'Palette mismatch '+theme+' '+color);
}
