
const EMAIL_RE=/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function parseRecipientToken(raw){
  const value=String(raw||'').trim().replace(/^[,;]+|[,;]+$/g,'').trim();
  if(!value)return null;
  const m=value.match(/^(?:"?([^"<]+?)"?\s*)?<\s*([^<>]+@[^<>]+)\s*>$/);
  if(m){
    const email=m[2].trim();
    if(!EMAIL_RE.test(email))return null;
    return {name:String(m[1]||'').trim(),email};
  }
  if(EMAIL_RE.test(value))return {name:'',email:value};
  return null;
}
export function formatRecipient(r){
  const name=String(r?.name||'').trim(),email=String(r?.email||'').trim();
  return name&&name.toLowerCase()!==email.toLowerCase()?`${name} <${email}>`:email;
}
export function parseRecipientList(raw){
  const parts=String(raw||'').split(/[;,]\s*/).map(x=>x.trim()).filter(Boolean);
  const out=[];
  for(const part of parts){
    const item=parseRecipientToken(part);
    if(item&&!out.some(x=>x.email.toLowerCase()===item.email.toLowerCase()))out.push(item);
  }
  return out;
}
export function recipientListValue(items){return (items||[]).map(formatRecipient).join(', ')}
export function recipientEmails(items){return (items||[]).map(x=>String(x.email||'').trim()).filter(Boolean)}
export function validRecipientCount(items){return recipientEmails(items).length}
export function mergeRecipient(items,item){
  if(!item?.email)return items||[];
  const clean=(items||[]).filter(x=>x.email.toLowerCase()!==item.email.toLowerCase());
  return [...clean,item];
}
