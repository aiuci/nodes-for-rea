// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const modifiers=['ctrl','alt','shift','meta'];
export function matchesBinding(event,binding){
  if(event.key?.toLowerCase()!==binding.key.toLowerCase())return false;
  return modifiers.every(m=>binding[m]==='any'||!!event[m+'Key']===!!binding[m]);
}
export function bindingKeys(binding){
  const names={ctrl:'Ctrl',alt:'Alt',shift:'Shift',meta:'Meta'};
  const key={' ':'Space','Escape':'Esc','ArrowLeft':'←','ArrowRight':'→','ArrowUp':'↑','ArrowDown':'↓'}[binding.key]||binding.key.toUpperCase();
  return [...modifiers.filter(m=>binding[m]===true).map(m=>names[m]),key];
}
export function shortcutText(command){return command?.bindings?.length?bindingKeys(command.bindings[0]).join(' + '):'';}
export function createCommandRegistry(){
  const commands=new Map(),listeners=new Set();
  const changed=()=>listeners.forEach(fn=>fn());
  const validate=(id,bindings)=>{for(const other of commands.values())if(other.id!==id)for(const a of bindings)for(const b of other.bindings)if(a.key.toLowerCase()===b.key.toLowerCase()&&modifiers.every(m=>a[m]==='any'||b[m]==='any'||!!a[m]===!!b[m]))throw Error(`Shortcut collision: ${id} and ${other.id}`);};
  const registry={
    register(command){if(commands.has(command.id))throw Error(`Duplicate command: ${command.id}`);const entry={bindings:[],group:'Navigate',...command};validate(entry.id,entry.bindings);commands.set(entry.id,entry);changed();return ()=>{commands.delete(entry.id);changed();};},
    get(id){const c=commands.get(id);return c?{...c,bindings:c.bindings.map(b=>({...b})),enabled:c.enabled?!!c.enabled():true,checked:c.checked?!!c.checked():undefined}:null;},
    all(){return [...commands.keys()].map(id=>registry.get(id));},
    execute(id,event){const c=commands.get(id);if(!c||c.enabled&&!c.enabled())return false;return c.run(event);},
    dispatch(event){for(const c of commands.values())if(c.bindings.some(b=>matchesBinding(event,b))&&(!c.when||c.when(event))){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat||c.repeat)registry.execute(c.id,event);return true;}return false;},
    rebind(id,bindings){if(!commands.has(id))throw Error(`Unknown command: ${id}`);validate(id,bindings);commands.get(id).bindings=bindings.map(b=>({...b}));changed();},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
  };
  return registry;
}
