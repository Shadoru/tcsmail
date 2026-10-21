import assert from 'node:assert/strict'
describe('Reader, workspace e draft local',()=>{
  before(async()=>{for(const x of await $$('.modalLayer .closeModal')){try{await x.click()}catch{}}await browser.pause(150);await browser.execute(()=>{const s=document.querySelector('#navigationStyle');if(s){s.value='tree';s.dispatchEvent(new Event('change',{bubbles:true}))}});await browser.pause(300)})
  it('abre Reader e minimiza no workspace',async()=>{
    const row=await $('.row[data-id="101"]');await row.waitForDisplayed();await row.click();await $('#reader h1').waitForDisplayed();
    await $('#readerMinimize').click();await $('#workspaceShelf').waitForDisplayed();assert.ok((await $$('#workspaceShelf .workspaceChip')).length>=1)
  })
  it('salva, fecha e reabre draft local',async()=>{
    await $('#newMail').click();await $('.composerNative').waitForDisplayed();
    await browser.execute(()=>{const to=document.querySelector('#cTo');to.value='dest@example.test';to.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));const s=document.querySelector('#cSubject');s.value='HOMO-DRAFT-WDIO';s.dispatchEvent(new Event('input',{bubbles:true}));const e=document.querySelector('#editor');e.textContent='Conteúdo persistente WDIO';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('blur',{bubbles:true}))});
    await browser.pause(800);await $('.composerNative').parentElement?.click?.();
    const close=await $('.modalLayer:last-child .closeModal');await close.click();await browser.pause(500);
    const drafts=await $('[data-folder="Drafts"]');await drafts.click();await browser.pause(500);
    const local=await $('.localDraftRow');await local.waitForDisplayed();await local.click();await $('.composerNative').waitForDisplayed();assert.equal(await $('#cSubject').getValue(),'HOMO-DRAFT-WDIO')
  })
})
