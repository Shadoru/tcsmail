
export function execEditorCommand(_editor,_command,_value=null){
  // WebKit's legacy editing-command API is intentionally not used.
  // Callers fall back to Range/DOM operations implemented by the Composer.
  return false;
}
export function selectedCell(editor){
  const sel=globalThis.getSelection?.();if(!sel||!sel.rangeCount)return null;
  let node=sel.getRangeAt(0).commonAncestorContainer;
  if(node?.nodeType!==1)node=node?.parentElement;
  const cell=node?.closest?.('td,th');
  return cell&&editor.contains(cell)?cell:null;
}
export function insertTableAtSelection(editor,rows=2,cols=2){
  const table=document.createElement('table');table.className='composeTable';
  const body=document.createElement('tbody');table.append(body);
  for(let r=0;r<Math.max(1,rows);r++){
    const tr=document.createElement('tr');body.append(tr);
    for(let c=0;c<Math.max(1,cols);c++){
      const td=document.createElement('td');td.append(document.createElement('br'));tr.append(td);
    }
  }
  const sel=globalThis.getSelection?.();
  if(sel?.rangeCount){
    const range=sel.getRangeAt(0);
    if(editor.contains(range.commonAncestorContainer)){range.deleteContents();range.insertNode(table)}
    else editor.append(table);
  }else editor.append(table);
  table.querySelector('td')?.focus?.();
  return table;
}
export function tableAddRow(cell,after=true){
  const row=cell?.parentElement;if(!row)return null;
  const table=row.closest('table');if(!table)return null;
  const tr=document.createElement('tr');
  const count=[...row.cells].reduce((n,c)=>n+(c.colSpan||1),0);
  for(let i=0;i<count;i++){const td=document.createElement('td');td.append(document.createElement('br'));tr.append(td)}
  after?row.after(tr):row.before(tr);return tr;
}
export function tableDeleteRow(cell){
  const row=cell?.parentElement,table=row?.closest('table');if(!row||!table)return;
  if(table.rows.length<=1){table.remove();return}
  row.remove();
}
export function tableAddColumn(cell,after=true){
  const row=cell?.parentElement,table=row?.closest('table');if(!row||!table)return;
  const index=[...row.cells].indexOf(cell)+(after?1:0);
  for(const tr of table.rows){const td=document.createElement('td');td.append(document.createElement('br'));tr.insertBefore(td,tr.cells[index]||null)}
}
export function tableDeleteColumn(cell){
  const row=cell?.parentElement,table=row?.closest('table');if(!row||!table)return;
  const index=[...row.cells].indexOf(cell);if(index<0)return;
  if(row.cells.length<=1){table.remove();return}
  for(const tr of table.rows)tr.cells[index]?.remove();
}
export function tableMergeRight(cell){
  const next=cell?.nextElementSibling;if(!cell||!next||!['TD','TH'].includes(next.tagName))return false;
  cell.colSpan=(cell.colSpan||1)+(next.colSpan||1);
  while(next.firstChild)cell.append(next.firstChild);next.remove();return true;
}
export function tableMergeDown(cell){
  const row=cell?.parentElement,table=row?.closest('table');if(!row||!table)return false;
  const rowIndex=[...table.rows].indexOf(row),col=[...row.cells].indexOf(cell);
  const below=table.rows[rowIndex+1]?.cells[col];if(!below)return false;
  cell.rowSpan=(cell.rowSpan||1)+(below.rowSpan||1);
  while(below.firstChild)cell.append(below.firstChild);below.remove();return true;
}
export function tableSetAlign(cell,align){
  if(cell)cell.style.textAlign=['left','center','right'].includes(align)?align:'left';
}
export function tableTabNavigate(editor,cell,backward=false){
  const cells=[...editor.querySelectorAll('td,th')],index=cells.indexOf(cell);if(index<0)return null;
  let target=cells[index+(backward?-1:1)];
  if(!target&&!backward){const row=tableAddRow(cell,true);target=row?.cells?.[0]||null}
  if(!target)return null;
  const range=document.createRange();range.selectNodeContents(target);range.collapse(true);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(range);return target;
}
export function stripUnsafePaste(html){
  const tpl=document.createElement('template');
  tpl.innerHTML=String(html||'');
  tpl.content.querySelectorAll('script,style,iframe,object,embed,form,input,button,meta,link,svg,math,base').forEach(n=>n.remove());
  // Paste is untrusted. Keep ordinary HTML formatting but reject active content and
  // dangerous URL schemes (including character/entity/whitespace obfuscation).
  const safeUrl=(raw,attr)=>{
    const value=String(raw||'').trim();
    const compact=value.replace(/[\u0000-\u0020\u007f]+/g,'').toLowerCase();
    if(!compact||compact.startsWith('#')||compact.startsWith('/')&&!compact.startsWith('//'))return true;
    if(compact.startsWith('//'))return false;
    if(attr==='href')return /^(https?:|mailto:|tel:|cid:)/.test(compact);
    return /^(https:|cid:|data:image\/(?:png|jpeg|gif|webp);base64,)/.test(compact);
  };
  tpl.content.querySelectorAll('*').forEach(el=>{
    [...el.attributes].forEach(a=>{
      const n=a.name.toLowerCase();
      if(n.startsWith('on')||['srcdoc','formaction','action','xlink:href','srcset'].includes(n)
        ||(['href','src','background','poster'].includes(n)&&!safeUrl(a.value,n))){
        el.removeAttribute(a.name);
      }
    });
  });
  return tpl.innerHTML;
}
