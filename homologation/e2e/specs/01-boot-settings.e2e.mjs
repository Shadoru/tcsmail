import assert from 'node:assert/strict'
describe('TCS Mail real Tauri/WebKitGTK',()=>{
  it('abre sem tela branca e renderiza os três painéis',async()=>{
    const app=await $('.appShell');await app.waitForDisplayed();
    assert.ok(await $('.sidebar').isDisplayed());assert.ok(await $('#contentMain').isDisplayed());
    const html=await $('#app').getHTML(false);assert.ok(html.length>500,'#app quase vazio');
    assert.ok(!(await $('body').getText()).includes('não conseguiu iniciar a interface'))
  })
  it('abre todas as páginas de Configurações e persiste tema',async()=>{
    await $('#settingsBtn').click();await $('#settingsNav').waitForDisplayed();
    const buttons=await $$('#settingsNav [data-set]');assert.ok(buttons.length>=20)
    for(const b of buttons){const key=await b.getAttribute('data-set');await b.click();await $('#settingsPanel h2').waitForDisplayed();assert.ok((await $('#settingsPanel h2').getText()).trim(),`sem título em ${key}`)}
    const appearance=await $('[data-set="appearance"]');await appearance.click();await $('#theme').waitForExist();
    await browser.execute(()=>{const s=document.querySelector('#theme');s.value='ocean';s.dispatchEvent(new Event('change',{bubbles:true}))});
    await browser.pause(250);assert.equal(await $('html').getAttribute('data-theme'),'ocean')
  })
})
