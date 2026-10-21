
function escHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function enhanceSelect(select){
 if(!select||select.dataset.tcsEnhanced==='1'||select.multiple||select.size>1||select.closest('.selectShell'))return;
 select.dataset.tcsEnhanced='1';
 const shell=document.createElement('div');shell.className='selectShell';
 select.parentNode.insertBefore(shell,select);shell.append(select);
 select.classList.add('nativeSelectSource');
 const button=document.createElement('button');button.type='button';button.className='selectButton';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
 const popup=document.createElement('div');popup.className='selectPopup hidden';popup.setAttribute('role','listbox');
 shell.append(button,popup);
 let active=-1;
 const enabledOptions=()=>[...select.options].filter(o=>!o.disabled);
 const refresh=()=>{
   const opt=select.selectedOptions?.[0]||select.options[select.selectedIndex]||select.options[0];
   button.innerHTML=`<span>${escHtml(opt?.textContent||'')}</span><i>▾</i>`;
   button.disabled=select.disabled;
   popup.innerHTML=enabledOptions().map((o,i)=>`<button type="button" role="option" aria-selected="${o.selected}" data-select-i="${i}" class="${o.selected?'active':''}">${escHtml(o.textContent)}</button>`).join('');
   active=Math.max(0,enabledOptions().findIndex(o=>o.selected));
 };
 const close=()=>{popup.classList.add('hidden');button.setAttribute('aria-expanded','false')};
 const open=()=>{refresh();popup.classList.remove('hidden');button.setAttribute('aria-expanded','true');popup.querySelector(`[data-select-i="${active}"]`)?.scrollIntoView({block:'nearest'})};
 const choose=i=>{const opts=enabledOptions(),opt=opts[i];if(!opt)return;select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close();button.focus()};
 button.onclick=()=>popup.classList.contains('hidden')?open():close();
 button.onkeydown=e=>{
   const opts=enabledOptions();if(!opts.length)return;
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(popup.classList.contains('hidden'))open();active=Math.max(0,Math.min(opts.length-1,active+(e.key==='ArrowDown'?1:-1)));popup.querySelectorAll('[data-select-i]').forEach((x,i)=>x.classList.toggle('keyboardActive',i===active));popup.querySelector(`[data-select-i="${active}"]`)?.scrollIntoView({block:'nearest'})}
   else if((e.key==='Enter'||e.key===' ')&&!popup.classList.contains('hidden')){e.preventDefault();choose(active)}
   else if(e.key==='Escape'){e.preventDefault();close()}
   else if(e.key==='Home'){e.preventDefault();active=0}
   else if(e.key==='End'){e.preventDefault();active=opts.length-1}
 };
 popup.onclick=e=>{const item=e.target.closest('[data-select-i]');if(!item)return;e.preventDefault();e.stopPropagation();choose(Number(item.dataset.selectI))};
 select.addEventListener('change',refresh);
 select.addEventListener('tcs-select-refresh',refresh);
 document.addEventListener('pointerdown',e=>{if(!shell.contains(e.target))close()});
 refresh()
}

export function enhanceSelects(root=document){
 root.querySelectorAll?.('select:not([data-native-select])').forEach(enhanceSelect)
}
export function installControlEnhancer(){
 enhanceSelects(document);
 const observer=new MutationObserver(records=>{
   for(const record of records)for(const node of record.addedNodes){
     if(node.nodeType!==1)continue;
     if(node.matches?.('select:not([data-native-select])'))enhanceSelect(node);
     enhanceSelects(node)
   }
 });
 observer.observe(document.body,{childList:true,subtree:true});
 window.addEventListener('tcs-theme-changed',()=>document.querySelectorAll('select[data-tcs-enhanced="1"]').forEach(s=>s.dispatchEvent(new Event('tcs-select-refresh'))));
 return observer
}
