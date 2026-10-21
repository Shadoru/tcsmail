
export class WorkspaceModel{
  constructor(){this.items=new Map();this.listeners=new Set()}
  _emit(){for(const fn of this.listeners)fn(this.snapshot())}
  subscribe(fn){this.listeners.add(fn);fn(this.snapshot());return()=>this.listeners.delete(fn)}
  register(item){
    if(!item?.key)throw new Error('workspace item requires key');
    const prev=this.items.get(item.key)||{};
    this.items.set(item.key,{minimized:false,...prev,...item});
    this._emit();return this.items.get(item.key)
  }
  update(key,patch){const item=this.items.get(key);if(!item)return null;Object.assign(item,patch);this._emit();return item}
  minimize(key){return this.update(key,{minimized:true})}
  restore(key){return this.update(key,{minimized:false})}
  remove(key){const item=this.items.get(key);if(!item)return null;this.items.delete(key);this._emit();return item}
  get(key){return this.items.get(key)||null}
  snapshot(){return [...this.items.values()].map(x=>({...x}))}
}
