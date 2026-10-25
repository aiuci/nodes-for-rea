// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// A part is displayable only beneath its uniquely recorded parent, with a
// successful retained quote that explicitly names it. Strings are not new nodes.
export function recordedParts(state,record){
  const mechanisms=state.mechanismInventory?.mechanisms||[],rows=state.messages.flatMap(m=>m.features||[]),out=[];
  for(const id of record.row.mechanismIds||[]){const mechanism=mechanisms.find(m=>m.id===id&&m.role!=='positioning');if(!mechanism||rows.filter(row=>row.mechanismIds?.includes(id)).length!==1)continue;
    for(const part of mechanism.parts||[]){if(typeof part!=='string'||part.trim().length<4||out.some(item=>item.name.toLowerCase()===part.toLowerCase()))continue;
      const ref=mechanism.references?.find(ref=>ref.quote?.toLowerCase().includes(part.toLowerCase())&&state.evidence.some(e=>e.id===ref.evidenceId&&e.evidenceStatus!=='inspection-failed'&&e.text?.includes(ref.quote)));
      if(ref)out.push({name:part,quote:ref.quote,evidenceId:ref.evidenceId,parent:record.id});
    }
  }
  return out;
}
