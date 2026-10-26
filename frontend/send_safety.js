// TCS Mail r14. No network requests: deterministic local checks only.
const emailPattern=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u;
export function safeEmailDomain(email){return String(email||'').split('@').at(-1)?.toLowerCase()||''}
const normalizeDomains=xs=>new Set(xs.map(x=>String(x).trim().replace(/^@/,'').toLowerCase()).filter(Boolean));
export function inspectMessageSafety({text='',html='',attachmentCount=0,recipients=[],internalDomains=[],sender='',domainHints:checkDomainHints=false}={}){
 const invalidRecipients=recipients.filter(x=>!emailPattern.test(String(x||'').trim()));
 const internals=normalizeDomains(internalDomains);
 const externalRecipients=internals.size?recipients.filter(x=>emailPattern.test(x)&&!internals.has(safeEmailDomain(x))):[];
 const normalized=String(text).normalize('NFKC');
 const missingAttachment=Number(attachmentCount)===0&&/\b(?:segue[m]?\s+(?:em\s+)?anexo|anexo[s]?|anexad[oa]s?|attachment[s]?|attached|enclosed|documento\s+anexo)\b/iu.test(normalized)&&!/\b(?:sem\s+anexo|não\s+(?:há|tem|está)\s+anexo|not\s+attached|no\s+attachment)\b/iu.test(normalized);
 const domainHints=[];
 const knownTypos=new Map([['gmai.com','gmail.com'],['gmial.com','gmail.com'],['outlok.com','outlook.com'],['hotmial.com','hotmail.com']]);
 if(checkDomainHints)for(const recipient of recipients){const d=safeEmailDomain(recipient),suggested=knownTypos.get(d);if(suggested)domainHints.push(`${recipient} → ${suggested}`)}
 const suspiciousLinks=[];
 const links=String(html).match(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)||[];
 for(const attribute of links){const value=attribute.replace(/^.*?=[\s]*["']/,'').replace(/["']$/,'').trim();if(/^(?:javascript|vbscript|file|data):/iu.test(value))suspiciousLinks.push(value.slice(0,100));}
 // Avoid parsing or fetching remote URLs: no DNS, HEAD, GET, reputation API or token leaks.
 return {invalidRecipients,externalRecipients,missingAttachment,domainHints,suspiciousLinks};
}

// Pure scheduling validation shared by normal and independent composers. No implicit immediate sends.
export function validateOutgoingTimes({scheduleEnabled=false,sendAt=null,followEnabled=false,followAt=null,nowSeconds=Math.floor(Date.now()/1000)}={}){
 if(scheduleEnabled&&(!Number.isFinite(sendAt)||sendAt<=nowSeconds))return 'Escolha uma data e horário futuros para o envio agendado.';
 if(followEnabled&&(!Number.isFinite(followAt)||followAt<=nowSeconds))return 'Escolha data e horário futuros para o follow-up.';
 return null;
}
