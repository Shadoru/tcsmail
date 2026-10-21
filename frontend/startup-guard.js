(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const languagePreference=(()=>{try{return localStorage.getItem('tcs.uiLanguage')||'system'}catch{return'system'}})();
  const effectiveLanguage=languagePreference==='system'?(String(navigator.language||'').toLowerCase().startsWith('pt')?'pt-BR':'en-US'):languagePreference;
  document.documentElement.lang=effectiveLanguage;
  const startupTranslations={
    'Carregando TCS Mail…':'Loading TCS Mail…',
    'Preparando suas mensagens e preferências.':'Preparing your messages and preferences.',
    'Ainda carregando. Isso pode levar alguns segundos na primeira abertura.':'Still loading. This may take a few seconds on first launch.',
    'O TCS Mail está demorando mais que o esperado':'TCS Mail is taking longer than expected',
    'Detalhes técnicos':'Technical details',
    'Tente aguardar mais alguns segundos. Se a tela não abrir, feche e execute tcs-mail-0.8 no terminal para obter o diagnóstico.':'Wait a few more seconds. If the window does not open, close it and run tcs-mail-0.8 in a terminal to get diagnostics.'
  };
  const startupTr=v=>effectiveLanguage==='en-US'?(startupTranslations[String(v)]||String(v)):String(v);
  const initialStartup=document.getElementById('tcsStartup');
  if(initialStartup&&effectiveLanguage==='en-US'){const strong=initialStartup.querySelector('strong'),span=initialStartup.querySelector(':scope > span');if(strong)strong.textContent=startupTr(strong.textContent.trim());if(span)span.textContent=startupTr(span.textContent.trim())}
  const nativeMode = new URLSearchParams(location.search).get('native');
  const nativeReady = () => nativeMode && (document.body.classList.contains('nativeMailWindow') || document.querySelector('[data-native-surface]'));
  let startupError = '';
  const startupNode = () => document.getElementById('tcsStartup');
  const appRendered = () => {
    const app=document.getElementById('app');
    return !!app && !startupNode() && app.childElementCount>0;
  };
  const rememberFailure = message => { startupError = String(message || startupError || 'Falha durante a inicialização.'); };
  window.addEventListener('error', event => rememberFailure(event?.error?.message || event?.message));
  window.addEventListener('unhandledrejection', event => rememberFailure(event?.reason?.message || event?.reason));
  // A tela de carregamento é intencionalmente neutra. Só exibimos diagnóstico se a
  // inicialização realmente permanecer travada por tempo suficiente para deixar de
  // ser um estado transitório normal de disco/WebView/IMAP.
  window.setTimeout(() => {
    if (appRendered() || nativeReady()) return;
    const startup=startupNode();
    if (!startup) return;
    startup.classList.add('startupDelayed');
    const text=startup.querySelector(':scope > span');
    if(text) text.textContent=startupTr('Ainda carregando. Isso pode levar alguns segundos na primeira abertura.');
  }, 4500);
  window.setTimeout(() => {
    if (appRendered() || nativeReady()) return;
    const app=document.getElementById('app');
    if(!app) return;
    app.innerHTML=`<main class="startupSurface startupProblem"><div class="startupMark"><img src="assets/tcs-mail-logo.png" alt="TCS Mail"></div><strong>${startupTr('O TCS Mail está demorando mais que o esperado')}</strong><span>${effectiveLanguage==='en-US'?'Wait a few more seconds. If the window does not open, close it and run ':'Tente aguardar mais alguns segundos. Se a tela não abrir, feche e execute '}<code>tcs-mail-0.8</code>${effectiveLanguage==='en-US'?' in a terminal to get diagnostics.':' no terminal para obter o diagnóstico.'}</span>${startupError?`<details><summary>${startupTr('Detalhes técnicos')}</summary><pre>${escapeHtml(startupError)}</pre></details>`:''}</main>`;
  }, 15000);
})();
