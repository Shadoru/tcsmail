// SPDX-License-Identifier: MPL-2.0
// Presentation only: raw mailbox names remain the IDs for IMAP and persistence.
// Keep in sync with display_mailbox_name in crates/tcs-core/src/async_mail.rs.
export function decodeMailboxLabel(raw) {
  const input=String(raw??'');
  let result='',offset=0,start;
  while ((start=input.indexOf('&',offset))!==-1) {
    result+=input.slice(offset,start);
    const end=input.indexOf('-',start+1);
    if (end===-1) return result+input.slice(start);
    const block=input.slice(start+1,end);
    let value=input.slice(start,end+1);
    if (!block) value='&';
    else {
      try {
        const encoded=block.replaceAll(',','/');
        const padded=encoded+'='.repeat((4-encoded.length%4)%4);
        const binary=atob(padded);
        // atob alone accepts whitespace and nonzero trailing bits; Rust does not.
        if (binary.length && binary.length%2===0 && btoa(binary)===padded) {
          const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
          // Preserve a literal BOM, matching String::from_utf16 on the backend.
          const text=new TextDecoder('utf-16be',{fatal:true,ignoreBOM:true}).decode(bytes);
          if (!/[\u0000-\u001f\u007f-\u009f]/.test(text)) value=text;
        }
      } catch { /* Preserve malformed base64 and unpaired UTF-16 surrogates. */ }
    }
    result+=value;
    offset=end+1;
  }
  return result+input.slice(offset);
}

export function folderDisplayLabel(folder) {
  // display_name is already decoded by Rust. Literal &...- text is valid here.
  if (typeof folder?.display_name==='string' && folder.display_name) return folder.display_name;
  const raw=String(folder?.name??'');
  const delimiter=folder?.delimiter;
  const leaf=delimiter?raw.slice(raw.lastIndexOf(delimiter)+delimiter.length):raw;
  return decodeMailboxLabel(delimiter && raw.includes(delimiter)?leaf:raw);
}

export function folderReferenceLabel(ref) {
  const raw=String(ref?.folder??'');
  // Older favorites may have saved the raw ID as their label. Other saved labels
  // came from display_name and must not be decoded a second time.
  return ref?.label && ref.label!==raw?String(ref.label):decodeMailboxLabel(raw);
}
