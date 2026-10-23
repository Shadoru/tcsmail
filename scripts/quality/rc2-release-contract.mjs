import fs from 'node:fs';
import assert from 'node:assert/strict';
import {filterLocalDrafts,mergeDraftRows} from '../../frontend/drafts.js';
const cfg=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
assert.equal(cfg.version,'0.8.2-rc5');
assert.equal(cfg.bundle.category,'Productivity');
assert.equal(cfg.identifier,'com.thecreativesolver.TCSMail');
assert.ok(cfg.bundle.shortDescription.includes('e-mail'));
for(const icon of cfg.bundle.icon) assert.ok(fs.existsSync('src-tauri/'+icon),`Missing icon: ${icon}`);
const rec=[{id:'r1',account_id:1,draft_json:JSON.stringify({subject:'Rascunho de teste',text:'Mensagem original'}),dirty:true,updated_ts:1}];
assert.equal(filterLocalDrafts(rec,'tcs-sort:date:desc').length,1);
assert.equal(filterLocalDrafts(rec,'Rascunho tcs-sort:date:desc').length,1);
assert.equal(filterLocalDrafts(rec,'nada tcs-sort:date:desc').length,0);
const synced=[{...rec[0],dirty:false,server_uid:42}];
const remote=[{account_id:1,uid:42,subject:'A'}, {account_id:1,uid:43,subject:'Rascunho de teste'}];
const merged=mergeDraftRows(remote,synced,[{id:1,email:'exemplo@dominio.com'}]);
assert.equal(merged.filter(x=>!x.local_draft).length,1,'Only known remote UID must be hidden');
assert.equal(merged.find(x=>!x.local_draft).uid,43);

for (const filepath of ['src-tauri/Cargo.toml','crates/tcs-core/Cargo.toml','crates/tcs-ai-core/Cargo.toml','Cargo.lock']){
 assert.ok(fs.readFileSync(filepath,'utf8').includes('0.8.2-rc5'),`${filepath}: wrong release version`);
}
const meta=fs.readFileSync('src-tauri/resources/com.thecreativesolver.TCSMail.metainfo.xml','utf8');
assert.match(meta,/<name>TCS Mail<\/name>/);assert.match(meta,/thecreativesolver.com\/mail/);
for(const f of ['deb','rpm']) assert.ok(cfg.bundle.linux?.[f]?.files?.['/usr/share/metainfo/com.thecreativesolver.TCSMail.metainfo.xml']);
console.log('PASS: version/identifier/metadata/icons, local sort search, UID-only deduplication');
