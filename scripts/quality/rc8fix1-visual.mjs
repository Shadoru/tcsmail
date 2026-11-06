// Renderer integration test. It does not claim native WebView2/WKWebView certification.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), out=process.env.TCS_VISUAL_OUTPUT||'/tmp/tcs-rc8fix1-visual';
const {chromium}=await import(process.env.TCS_PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(await readFile(file))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.env.TCS_CHROME?{executablePath:process.env.TCS_CHROME}:{});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir(out,{recursive:true});const checks=[];
try{
 const url=`http://127.0.0.1:${server.address().port}/tests/ui/rc8fix1-settings.html`;
 await page.goto(url);await page.waitForSelector('body[data-ready=true]');
 // Quote/editor fragments lose iframe CSP: exercise the actual sanitizer in DOM.
 const tracking=[];await page.route('**/synthetic-pixel*',route=>{tracking.push(route.request().url());return route.abort()});
 const safe=await page.evaluate(async()=>{
  const {sanitizeComposerHtml}=await import('/frontend/lib.js');
  const pixel=location.origin+'/synthetic-pixel';
  const dirty=`<div background="${pixel}" style="background-image:image-set(url('${pixel}'));color:rgb(255, 0, 0)"><strong>Segurança</strong><img src="${pixel}"><img src="//127.0.0.1/synthetic-pixel"><svg><image href="${pixel}"/></svg><span style="font-weight:bold">Texto</span><img src="cid:synthetic"><a href="https://example.invalid">link</a></div>`;
  const clean=sanitizeComposerHtml(dirty),host=document.createElement('div');host.id='synthetic-preview';host.innerHTML=clean;document.body.append(host);
  return {clean,bold:!!host.querySelector('strong'),color:host.querySelector('div').style.color,cid:host.querySelector('img[src^="cid:"]')?.getAttribute('src')};
 });
 await page.waitForTimeout(150);assert.deepEqual(tracking,[],'Editor/preview must not load tracking pixels');
 assert.ok(safe.bold&&safe.color&&safe.cid==='cid:synthetic','Keep formatting and inline CID');
 assert.doesNotMatch(safe.clean,/background=|image-set|src="(?:https?:|\/\/)|<svg/i);
 await page.locator('#synthetic-preview').evaluate(el=>el.remove());

 // The original screenshot failure, preserving the server-side ID.
 await page.selectOption('#aiScope','mailbox');
 assert.equal(await page.locator('#aiMailboxFolder option[value="00 - Seguran&AOc-a e Contas"]').textContent(),'00 - Segurança e Contas');
 await page.locator('#aiMailboxAdd').click();
 assert.match(await page.locator('#aiMailboxList').textContent(),/00 - Segurança e Contas/);
 // A test must not persist settings or widen authorization.
 await page.locator('#aiTest').click();await page.waitForFunction(()=>window.fixtureCalls.some(([c])=>c==='ai_test_provider'));
 assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(([c])=>['ai_save_runtime_config','ai_update_privacy_policy'].includes(c)).length),0);
 // A failed test must not silently enable AI.
 await page.evaluate(()=>{window.failCommand='ai_test_provider'});await page.locator('#aiTest').click();
 await page.waitForFunction(()=>!document.querySelector('.aiSettingsPage').hasAttribute('aria-busy'));
 assert.equal(await page.locator('#aien').isChecked(),false);
 await page.locator('#aien').check();await page.locator('#aiSave').click();
 await page.waitForFunction(()=>!document.querySelector('.aiSettingsPage').hasAttribute('aria-busy'));
 assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(([c])=>c==='ai_save_runtime_config').length),0,'Failed test must block enabling');
 await page.evaluate(()=>{window.failCommand=null});
 await page.locator('#aiTest').click();await page.waitForFunction(()=>!document.querySelector('.aiSettingsPage').hasAttribute('aria-busy'));
 await page.selectOption('#aiScope','none');await page.locator('#aiSave').click();await page.waitForFunction(()=>!document.querySelector('.aiSettingsPage').hasAttribute('aria-busy'));
 const saved=await page.evaluate(()=>window.fixtureCalls.filter(([c])=>c==='ai_save_runtime_config').at(-1)[1].req);
 assert.equal(saved.enabled,true);assert.equal(saved.analysis_scope,'none');assert.deepEqual(saved.fast,saved.advanced);
 await page.selectOption('#aiScope','all');await page.locator('#aiSave').click();await page.locator('#dialogCancel').click();await page.waitForFunction(()=>!document.querySelector('.aiSettingsPage').hasAttribute('aria-busy'));
 assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(([c])=>c==='ai_save_runtime_config').length),2,'Cancelled broad consent must not save');
 for(const lang of ['pt-BR','en-US']) {
  await page.goto(url+'?lang='+lang);await page.waitForSelector('body[data-ready=true]');
  for(const size of [[960,620],[1280,720],[1920,1080]]) {
   await page.setViewportSize({width:size[0],height:size[1]});
   for(const theme of ['light','dark','system-light','system-dark','focus','ocean','graphite']) {
    await page.emulateMedia({colorScheme:theme==='system-dark'?'dark':'light'});
    await page.evaluate(t=>document.documentElement.dataset.theme=t.startsWith('system')?'system':t,theme);
    for(const kind of ['general','appearance','accounts','inbox','composition','signatures','templates','identities','folders','sync','rules','searches','privacy','spam','notifications','ai','shortcuts','calendarPrefs','contactsPrefs','importexport','diagnostics','advanced','about','help']) {
     await page.evaluate(k=>window.openFixture(k),kind);
     const failures=await page.evaluate(()=>{const host=document.querySelector('#settingsPanel');return [host,...host.querySelectorAll('input:not([type=checkbox]):not(.nativeSelectSource),textarea,.selectShell,.settingsRow,.aiSetupCard,.inlineForm')].filter(el=>el.getClientRects().length&&el.offsetWidth>0&&el.scrollWidth>el.clientWidth+3).map(el=>({id:el.id,cls:el.className,width:el.clientWidth,scroll:el.scrollWidth}));});
     assert.deepEqual(failures,[],JSON.stringify({kind,lang,size,theme,failures}));
     assert.equal(await page.locator('.readerError').count(),0,kind+' failed to render');
     if(['ai','composition','importexport','appearance'].includes(kind)) {
      await page.locator('#settingsPanel details').evaluateAll(els=>els.forEach(el=>el.open=true));
      assert.equal(await page.locator('#settingsPanel').evaluate(el=>el.scrollWidth<=el.clientWidth+3),true,'expanded '+kind);
      const buttons=page.locator('#settingsPanel .selectButton:visible');
      if(await buttons.count()) {
       await buttons.last().click();
       const popup=page.locator('.selectPopup.tcsFloatingPopup');
       const bounds=await popup.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size[0]+1&&bounds.y+bounds.height<=size[1]+1,JSON.stringify({kind,theme,size,bounds}));
       assert.equal(await popup.evaluate(el=>el.scrollWidth<=el.clientWidth+3),true,'popup text overflow');
       await page.keyboard.press('Escape');
      }
     }
     checks.push({lang,size,theme,kind});
    }
   }
  }
 }
 await page.goto(url+'?lang=pt-BR');await page.waitForSelector('body[data-ready=true]');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:out+'/ia.png'});
 await writeFile(out+'/results.json',JSON.stringify({checks:checks.length,errors,coverage:checks},null,2));assert.deepEqual(errors,[]);
 console.log(`PASS ${checks.length} settings/theme/size/language renders; Unicode raw/display; test does not save.`);
} finally {await browser.close();await new Promise(r=>server.close(r))}
