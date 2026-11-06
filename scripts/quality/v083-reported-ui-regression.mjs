import fs from 'node:fs';
import assert from 'node:assert/strict';

const main=fs.readFileSync('frontend/main.js','utf8');
const views=fs.readFileSync('frontend/views.js','utf8');
assert.match(main,/const newMailButtons=\$\$\('\[id="newMail"\],button\[aria-label="Nova mensagem"\]'\)/);
assert.match(main,/newMailButtons\.forEach\(button=>button\.addEventListener\('click',e=>\{e\.preventDefault\(\);openComposer\(ctx,/);
assert.match(main,/openComposer\(ctx,\{accountId:state\.account\|\|activeAccountIds\(\)\[0\]\|\|state\.boot\.accounts\[0\]\?\.id\}\)\.catch\(showError\)/);
assert.match(main,/\$\('#batchDelete'\)\?\.remove\(\)/);
for (const provider of ['google','microsoft']) {
  assert.match(views,new RegExp(`${provider}_oauth_connect`));
  assert.match(views,new RegExp(`Abrindo o navegador e aguardando autorização ${provider==='google'?'do Google':'da Microsoft'}`));
}
assert.match(views,/var progressTimer/);
assert.match(views,/setTimeout\(\(\)=>location\.reload\(\),500\)/);
console.log('PASS: 0.8.3 reported UI regressions covered for compose, OAuth and list-column actions');
