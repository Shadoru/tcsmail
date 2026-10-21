import assert from 'node:assert/strict'
describe('Navegação real',()=>{
  before(async()=>{if(!(await $('#settingsNav').isExisting())){await $('#settingsBtn').click()}await $('[data-set="appearance"]').click();await $('#navigationStyle').waitForExist()})
  for(const mode of ['tree','unified','groups','favorites','columns','tabs']){
    it(`aplica ${mode}`,async()=>{
      await browser.execute((m)=>{const s=document.querySelector('#navigationStyle');s.value=m;s.dispatchEvent(new Event('change',{bubbles:true}))},mode)
      await browser.pause(300);assert.ok(await $(`.appShell.navMode-${mode}`).isExisting(),`modo ${mode} não aplicado`)
    })
  }
})
