import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const oauth=read('crates/tcs-core/src/oauth.rs');
const backend=read('src-tauri/src/lib.rs');
const frontend=read('frontend/views.js');
const style=read('frontend/styles.css');
for (const marker of ['MICROSOFT_CLIENT_ID','MICROSOFT_IMAP_SCOPE','MICROSOFT_SMTP_SCOPE', 'build_microsoft_authorization','exchange_microsoft_code','valid_microsoft_access_token','verify_microsoft_scopes','store_microsoft_tokens','clear_microsoft_tokens'])
  assert.ok(oauth.includes(marker),`OAuth ausente: ${marker}`);
assert.match(oauth,/"google"\s*=>\s*valid_google_access_token/);
assert.match(oauth,/"microsoft"\s*=>\s*valid_microsoft_access_token/);
assert.ok(!oauth.slice(oauth.indexOf('pub fn build_microsoft_authorization'),oauth.indexOf('fn microsoft_token_error')).includes('client_secret'));
assert.match(oauth,/MICROSOFT_IMAP_SCOPE:.*IMAP\.AccessAsUser\.All/);
assert.match(oauth,/MICROSOFT_SMTP_SCOPE:.*SMTP\.Send/);
for (const command of ['microsoft_oauth_connect','microsoft_oauth_cancel','microsoft_oauth_status']) {
  assert.ok(backend.includes(`fn ${command}(`),`${command} handler ausente`);
  assert.ok(backend.includes(`            ${command},`),`${command} IPC ausente`);
  assert.ok(frontend.includes(`'${command}'`),`${command} UI ausente`);
}
assert.ok(backend.includes('tcs_core::async_mail::login_secure(&account, &tokens.access_token)'),'falta validação real antes de persistência');
assert.ok(backend.indexOf('login_secure(&account, &tokens.access_token)') < backend.indexOf('store_microsoft_tokens(&email, &tokens)'),'credencial gravada antes de autenticação');
assert.match(frontend,/d\.auth_provider==='microsoft'.*connectMicrosoft/);
assert.match(style,/\.accountAuthBadge\.microsoft/);
assert.ok(!oauth.includes('MICROSOFT_CLIENT_SECRET'));
const msClient = oauth.slice(oauth.indexOf('fn microsoft_http_client'), oauth.indexOf('fn microsoft_token_error'));
assert.match(msClient, /redirect\(reqwest::redirect::Policy::none\(\)\)/);
assert.match(oauth.slice(oauth.indexOf('pub fn exchange_microsoft_code'), oauth.indexOf('pub fn verify_microsoft_scopes')), /microsoft_http_client\(\)/);
console.log('PASS: contratos estáticos Microsoft OAuth, Google separado, provider autodetectado, verificação IMAP e tema');
