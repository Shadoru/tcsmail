// Local, read-only search in the rendered message. Never opens a modal.
// Search decorations are never copied to the draft or a sent message.
let serial=0;
export function attachReaderFind(host){
  const parent=host.parentElement;
  const bar=document.createElement('div');
  bar.className='tcsReaderFindBar hidden';bar.setAttribute('role','search');
  bar.innerHTML='<label>Localizar <input type="search" autocomplete="off" aria-label="Localizar na mensagem"></label><span class="tcsReaderFindCount" role="status"></span><button type="button" data-prev title="Anterior">↑</button><button type="button" data-next title="Próximo">↓</button><button type="button" data-close title="Fechar">×</button>';
  parent.insertBefore(bar,host);
  const input=bar.querySelector('input'),status=bar.querySelector('.tcsReaderFindCount');
  const key='tcs-reader-'+(++serial);let doc=null,ranges=[],active=-1,marks=[],highlightKeys=[];
  const messageBody=()=>{
    const frame=host.querySelector('iframe');
    try{return frame?.contentDocument?.body||host}catch{return host}
  };
  const clearMarks=()=>{
    if(doc){for(const name of highlightKeys)doc.defaultView?.CSS?.highlights?.delete(name);
      for(const mark of marks){if(!mark.isConnected)continue;const parent=mark.parentNode;mark.replaceWith(...mark.childNodes);parent?.normalize();}}
    highlightKeys=[];marks=[];ranges=[];active=-1;
  };
  const fragmentRanges=range=>{
    const pieces=[];const walk=doc.createTreeWalker(messageBody(),doc.defaultView?.NodeFilter?.SHOW_TEXT||4);let node,within=false;
    while((node=walk.nextNode())){
      if(node===range.startContainer)within=true;
      if(!within)continue;
      const a=node===range.startContainer?range.startOffset:0;
      const b=node===range.endContainer?range.endOffset:node.length;
      if(a<b){const part=doc.createRange();part.setStart(node,a);part.setEnd(node,b);pieces.push(part)}
      if(node===range.endContainer)break;
    }
    return pieces;
  };
  const draw=()=>{
    const css=doc?.defaultView?.CSS,Hi=doc?.defaultView?.Highlight;
    for(const name of highlightKeys)css?.highlights?.delete(name);highlightKeys=[];
    status.textContent=ranges.length?`${active+1} de ${ranges.length}`:(input.value?'Nenhuma ocorrência':'');
    if(!ranges.length)return;
    if(css?.highlights&&Hi){
      const styleId=key+'-style';if(!doc.getElementById(styleId)){
        const style=doc.createElement('style');style.id=styleId;
        style.textContent=`::highlight(${key}){background:#ffd740;color:#171717}::highlight(${key}-active){background:#ff8c20;color:#161616;text-decoration:underline}`;
        doc.head.append(style);
      }
      css.highlights.set(key,new Hi(...ranges.flatMap(fragmentRanges)));
      css.highlights.set(key+'-active',new Hi(...fragmentRanges(ranges[active])));
      highlightKeys=[key,key+'-active'];return;
    }
    // WebKit fallback: temporary marks in read-only rendered message only.
    if(!doc.getElementById(key+'-fallback-style')){const style=doc.createElement('style');style.id=key+'-fallback-style';style.textContent='mark[data-tcs-reader-find]{background:#ffd740!important;color:#171717!important}mark[data-tcs-reader-find].current{background:#ff8c20!important;color:#161616!important}';doc.head.append(style);}
    // Split matches into text-node fragments to avoid coloring table cells.
    if(!marks.length){const parts=ranges.map((r,index)=>fragmentRanges(r).map(piece=>({piece,index}))).flat();
      for(const {piece,index} of parts.reverse()){
        const mark=doc.createElement('mark');mark.dataset.tcsReaderFind=String(index);
        mark.className='tcsReaderFindMark';
        try{piece.surroundContents(mark);marks.push(mark)}catch{mark.remove()}
      }
    }
    for(const mark of marks)mark.classList.toggle('current',Number(mark.dataset.tcsReaderFind)===active);
  };
  const calculate=()=>{
    clearMarks();const q=input.value.trim();doc=messageBody().ownerDocument;
    if(!q){status.textContent='';return}
    const root=messageBody();const NF=doc.defaultView?.NodeFilter||NodeFilter;
    const walker=doc.createTreeWalker(root,NF.SHOW_TEXT,{acceptNode(node){return node.parentElement?.closest('script,style,noscript,[hidden],[aria-hidden="true"],.tcsReaderFindBar')?NF.FILTER_REJECT:NF.FILTER_ACCEPT}});
    let text='',segments=[],node;
    while((node=walker.nextNode())){if(!node.data)continue;segments.push({node,start:text.length,end:text.length+node.data.length});text+=node.data}
    const low=text.toLocaleLowerCase(),needle=q.toLocaleLowerCase();
    const point=x=>{let lo=0,hi=segments.length-1;while(lo<=hi){const mid=(lo+hi)>>1,s=segments[mid];if(x<s.start)hi=mid-1;else if(x>=s.end)lo=mid+1;else return {node:s.node,off:x-s.start}}return null};
    let offset=0,index;
    while((index=low.indexOf(needle,offset))!==-1){const a=point(index),b=point(index+q.length-1);
      if(a&&b){const range=doc.createRange();range.setStart(a.node,a.off);range.setEnd(b.node,b.off+1);ranges.push(range)}
      offset=index+Math.max(q.length,1);
    }
    active=ranges.length?0:-1;draw();
  };
  const navigate=direction=>{
    if(!ranges.length){calculate();if(!ranges.length)return}
    active=(active+direction+ranges.length)%ranges.length;draw();
    const match=marks.find(mark=>mark.isConnected&&Number(mark.dataset.tcsReaderFind)===active);
    const rect=match?.getBoundingClientRect()||fragmentRanges(ranges[active])[0]?.getBoundingClientRect();
    if(rect&&rect.width>0&&rect.height>0){
      const frame=host.querySelector('iframe');
      if(frame?.contentDocument===doc){frame.contentWindow?.scrollBy(0,rect.top-frame.contentWindow.innerHeight/2)}
      else{const container=host;const area=container.getBoundingClientRect();if(rect.top<area.top+20)container.scrollTop-=area.top+20-rect.top;else if(rect.bottom>area.bottom-20)container.scrollTop+=rect.bottom-(area.bottom-20)}
    }
    input.focus({preventScroll:true});
  };
  const close=()=>{clearMarks();bar.classList.add('hidden')};
  input.addEventListener('input',calculate);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();navigate(e.shiftKey?-1:1)}else if(e.key==='Escape'){e.preventDefault();close()}});
  bar.querySelector('[data-prev]').onclick=()=>navigate(-1);
  bar.querySelector('[data-next]').onclick=()=>navigate(1);
  bar.querySelector('[data-close]').onclick=close;
  return {open:()=>{bar.classList.remove('hidden');input.focus({preventScroll:true});calculate()},close,refresh:()=>{if(!bar.classList.contains('hidden'))calculate()}};
}
