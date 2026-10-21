import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../../frontend/main.js',import.meta.url),'utf8');
const old="if(sidebar&&shelf.parentElement!==sidebar){const settings=sidebar.querySelector('#settingsBtn');if(settings)sidebar.insertBefore(shelf,settings);else sidebar.append(shelf)}";
const m=src.match(/if\(sidebar&&shelf\.parentElement!==sidebar\)\{[\s\S]*?\n \}/);
assert.ok(m,'workspace shelf placement found');
function run(code,nested){
 const sidebar={append(s){s.parentElement=this},insertBefore(s,ref){if(ref!==null&&ref.parentElement!==this){const e=new Error('The object can not be found here.');e.name='NotFoundError';throw e}s.parentElement=this},querySelector(){return settings}};
 const settings={parentElement:nested?{}:sidebar};const shelf={parentElement:null};
 new Function('sidebar','shelf',code)(sidebar,shelf);
 assert.equal(shelf.parentElement,sidebar);
}
assert.throws(()=>run(old,true),e=>e.name==='NotFoundError');
for (const nested of [false,true])run(m[0],nested);
console.log('R11-FIX1 DOM: old nested path reproduces NotFoundError; fixed normal and columns paths PASS');
