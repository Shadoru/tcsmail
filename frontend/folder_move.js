// SPDX-License-Identifier: MPL-2.0
// Presentation-only mailbox naming. Never use decoded text for IMAP commands.
export function decodeMailboxLabel(raw) {
  return String(raw ?? '').replace(/&([A-Za-z0-9+,]*)-/g, (whole, block) => {
    if (!block) return '&';
    try {
      const b64 = block.replace(/,/g, '/') + '='.repeat((4 - block.length % 4) % 4);
      const binary = atob(b64);
      if (!binary.length || binary.length % 2) return whole;
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const value = new TextDecoder('utf-16be', {fatal: true}).decode(bytes);
      return /[\u0000-\u001f\u007f]/.test(value) ? whole : value;
    } catch { return whole; }
  });
}
export function moveFolderChoices(tree) {
  const nodes = Array.isArray(tree) ? tree.filter(x=>x && typeof x.name==='string' && x.name) : [];
  const byName = new Map(nodes.map(f=>[f.name,f]));
  const labelFor = (f, seen=new Set()) => {
    if (seen.has(f.name)) return decodeMailboxLabel(f.name);
    const here=decodeMailboxLabel(f.display_name||f.name);
    if (!f.parent || !byName.has(f.parent)) {
      if (!f.parent && f.delimiter && f.name.includes(f.delimiter))
        return f.name.split(f.delimiter).map(decodeMailboxLabel).join(' / ');
      return f.parent ? decodeMailboxLabel(f.parent) + ' / ' + here : here;
    }
    seen.add(f.name);
    return labelFor(byName.get(f.parent), seen) + ' / ' + here;
  };
  const choices=nodes.filter(f=>f.selectable!==false).map(f=>({value:f.name,label:labelFor(f)}));
  if (!choices.some(f=>f.value.toUpperCase()==='INBOX'))choices.unshift({value:'INBOX',label:'Caixa de entrada'});
  // Names are case-sensitive except INBOX. Do not case-fold arbitrary IMAP mailbox IDs.
  const unique=new Map(choices.map(x=>[x.value,x]));
  return [...unique.values()].sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}));
}
export function validateMoveSelection(rows, target, choices, {sourceFolder=null}={}) {
  if (!rows.length || rows.some(m=>!m || m.local_draft || !Number.isSafeInteger(Number(m.id))))
    return 'Selecione mensagens do servidor para mover.';
  if (new Set(rows.map(m=>m.account_id)).size!==1)
    return 'Só é possível mover mensagens da mesma conta.';
  if (!choices.some(f=>f.value===target))return 'A pasta de destino não está disponível.';
  if (sourceFolder && rows.every(m=>m.folder===target || (sourceFolder===target && !m.folder)))
    return 'As mensagens já estão nesta pasta.';
  return null;
}
