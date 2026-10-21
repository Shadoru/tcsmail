
export const NAV_MODES=['tree','unified','groups','favorites','columns','tabs'];

export function normalizeNavMode(value){
  return NAV_MODES.includes(String(value))?String(value):'tree';
}
export function safeJson(raw,fallback){
  try{
    const value=JSON.parse(String(raw||''));
    return value==null?fallback:value;
  }catch{return fallback}
}
export function normalizeGroups(raw,accounts=[]){
  const ids=new Set(accounts.map(a=>Number(a.id)));
  const src=Array.isArray(raw)?raw:[];
  const out=[];
  for(const item of src){
    const name=String(item?.name||'').trim();
    if(!name)continue;
    const accountIds=[...new Set((item.accountIds||[]).map(Number).filter(id=>ids.has(id)))];
    out.push({id:String(item.id||cryptoSafeId(name)),name,accountIds});
  }
  return out;
}
function cryptoSafeId(seed){
  let h=2166136261;
  for(const c of String(seed)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return `g-${(h>>>0).toString(16)}`;
}
export function normalizeFolderRefs(raw){
  const out=[];
  for(const x of Array.isArray(raw)?raw:[]){
    const accountId=Number(x?.accountId);
    const folder=String(x?.folder||'').trim();
    if(accountId>0&&folder&&!out.some(v=>v.accountId===accountId&&v.folder===folder)){
      out.push({accountId,folder,label:String(x?.label||'').trim()});
    }
  }
  return out;
}
export function folderRefKey(accountId,folder){return `${Number(accountId)}\u0000${String(folder)}`}
export function isHidden(hidden,accountId,folder){
  return normalizeFolderRefs(hidden).some(x=>x.accountId===Number(accountId)&&x.folder===String(folder));
}
export function isFavorite(favorites,accountId,folder){
  return normalizeFolderRefs(favorites).some(x=>x.accountId===Number(accountId)&&x.folder===String(folder));
}
export function toggleFolderRef(list,accountId,folder,label=''){
  const clean=normalizeFolderRefs(list);
  const ix=clean.findIndex(x=>x.accountId===Number(accountId)&&x.folder===String(folder));
  if(ix>=0)clean.splice(ix,1);
  else clean.push({accountId:Number(accountId),folder:String(folder),label:String(label||'')});
  return clean;
}
export function groupAccountIds(groups,groupId){
  const group=(Array.isArray(groups)?groups:[]).find(g=>String(g?.id)===String(groupId));
  return [...new Set((group?.accountIds||[]).map(Number).filter(id=>Number.isFinite(id)&&id>0))];
}
export function visibleFolders(tree,{accountId,hidden=[],subscribedOnly=false}={}){
  return (tree||[]).filter(f=>{
    if(isHidden(hidden,accountId,f.name))return false;
    if(subscribedOnly&&!f.subscribed)return false;
    return true;
  });
}
