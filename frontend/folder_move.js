// SPDX-License-Identifier: MPL-2.0
import {decodeMailboxLabel,folderDisplayLabel} from './folder_labels.js';
// Keep the existing import API for callers and the RC7 regression suite.
export {decodeMailboxLabel} from './folder_labels.js';
export function moveFolderChoices(tree) {
  const nodes = Array.isArray(tree) ? tree.filter(x=>x && typeof x.name==='string' && x.name) : [];
  const byName = new Map(nodes.map(f=>[f.name,f]));
  const labelFor = (f, seen=new Set()) => {
    if (seen.has(f.name)) return decodeMailboxLabel(f.name);
    const here=folderDisplayLabel(f);
    const split=f.delimiter?f.name.lastIndexOf(f.delimiter):-1;
    const parent=f.parent||(split>0?f.name.slice(0,split):null);
    if (!parent) return here;
    if (!byName.has(parent)) {
      const prefix=f.delimiter?parent.split(f.delimiter).map(decodeMailboxLabel).join(' / '):decodeMailboxLabel(parent);
      return prefix + ' / ' + here;
    }
    seen.add(f.name);
    return labelFor(byName.get(parent), seen) + ' / ' + here;
  };
  const choices=nodes.filter(f=>f.selectable!==false).map(f=>({value:f.name,label:labelFor(f)}));
  if (!choices.some(f=>f.value.toUpperCase()==='INBOX'))choices.unshift({value:'INBOX',label:'Caixa de entrada'});
  // Names are case-sensitive except INBOX. Do not case-fold arbitrary IMAP mailbox IDs.
  const unique=new Map(choices.map(x=>[x.value,x]));
  return [...unique.values()].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}));
}
export function validateMoveSelection(rows, target, choices, {sourceFolder=null}={}) {
  if (!rows.length || rows.some(m=>!m || m.local_draft || !Number.isSafeInteger(Number(m.id)) || Number(m.id)<=0))
    return 'Selecione mensagens do servidor para mover.';
  if (new Set(rows.map(m=>m.account_id)).size!==1)
    return 'Só é possível mover mensagens da mesma conta.';
  if (!choices.some(f=>f.value===target))return 'A pasta de destino não está disponível.';
  if (sourceFolder && rows.every(m=>m.folder===target || (sourceFolder===target && !m.folder)))
    return 'As mensagens já estão nesta pasta.';
  return null;
}
