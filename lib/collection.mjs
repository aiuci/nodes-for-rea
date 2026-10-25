// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Source identity, provenance, and kept features. Pure functions also used by the renderer.
import {inventoryRecord,inventoryRecords} from './discovery-inventory.mjs';
export function productsFor(state){
  const products=[];
  for(const target of state.targets||[]){
    let id,name;
    if(target.kind==='website'){
      const url=new URL(target.locator),host=url.hostname.replace(/^www\./,'');
      const repo=['github.com','gitlab.com','bitbucket.org'].includes(host)?url.pathname.split('/').filter(Boolean).slice(0,2).join('/'):'';
      id=`web:${host}${repo?'/'+repo:''}`;name=repo||host;
    }else{id=`folder:${(target.root||target.locator).replaceAll('\\','/').replace(/\/$/,'').toLowerCase()}`;name=(target.root||target.locator).split(/[\\/]/).filter(Boolean).at(-1);}
    // Privacy copies may retain a stable source identity without its path.
    if(/^private-source:[a-f0-9]{24}$/.test(target.portableSourceId||''))id=target.portableSourceId;
    const existing=products.find(product=>product.id===id);
    if(existing){existing.locators.push(target.locator);continue;}
    const saved=state.products?.find(product=>product.id===id);
    products.push({id,name:saved?.name||name,locators:[target.locator],kind:target.kind});
  }
  if(products.length===1&&!state.products?.length){const map=state.messages?.findLast(message=>message.features?.length);if(map?.title)products[0].name=map.title;}
  return products;
}
export function productForEvidence(state,evidence){
  const products=productsFor(state);
  if(evidence.productId)return products.find(product=>product.id===evidence.productId);
  // A confirmed installed-app recovery keeps the supplied folder as locator,
  // while REA records the selected executable. Match its exact saved identity;
  // never infer ownership from another product's neighbouring directory.
  const owners=(state.targets||[]).filter(target=>target.kind==='artifact'&&[target,target.inspectionTarget].filter(Boolean).some(component=>component.identity?.sha256&&evidence.targetIdentity?.sha256===component.identity.sha256&&evidence.targetIdentity?.path===component.identity.path&&evidence.locator===component.root));
  if(owners.length===1){const owner=owners[0],id=owner.portableSourceId||`folder:${(owner.root||owner.locator).replaceAll('\\','/').replace(/\/$/,'').toLowerCase()}`;return products.find(product=>product.id===id);}
  return products.filter(product=>product.locators.some(locator=>{
    if(product.kind==='website'){
      try{const target=new URL(locator),source=new URL(evidence.locator),host=target.hostname.replace(/^www\./,'');if(source.hostname!==host&&source.hostname!==`www.${host}`&&!source.hostname.endsWith(`.${host}`))return false;
        if(!/^web:(github\.com|gitlab\.com|bitbucket\.org)\//.test(product.id))return true;const root='/'+product.id.split('/').slice(1).join('/');return source.pathname===root||source.pathname.startsWith(root+'/');
      }catch{return false;}
    }
    const root=locator.replaceAll('\\','/').replace(/\/$/,'').toLowerCase(),file=evidence.locator.replaceAll('\\','/').toLowerCase();return file===root||file.startsWith(root+'/');
  })).sort((a,b)=>b.id.length-a.id.length)[0];
}
export function originsFor(state,message,row){
  if(row.origins?.length)return row.origins;
  const origins=[];
  for(const index of row.claimIndexes||[]){const claim=message.claims?.[index],source=state.evidence.find(source=>source.id===claim?.evidenceId),product=source&&productForEvidence(state,source);if(!product)continue;
    let origin=origins.find(origin=>origin.productId===product.id);if(!origin){origin={productId:product.id,description:claim.text,claimIndexes:[]};origins.push(origin);}origin.claimIndexes.push(index);
  }
  return origins;
}
export function originErrors(answer,state){
  if(productsFor(state).length<2)return [];
  const errors=[],known=new Set(productsFor(state).map(product=>product.id));
  const supplied=answer.products||[];
  if(new Set(supplied.map(product=>product.id)).size!==supplied.length)errors.push('Product identities must be unique.');
  for(const id of known)if(!supplied.some(product=>product.id===id))errors.push(`Include source product ${id}, even if its inspection is incomplete.`);
  for(const product of supplied)if(!known.has(product.id))errors.push(`Unknown product ${product.id}.`);
  for(const row of answer.features||[]){
    const origins=row.origins||[];if(!origins.length&&row.claimIndexes?.length)errors.push(`Identify where ${row.name} was found.`);
    if(new Set(origins.map(origin=>origin.productId)).size!==origins.length)errors.push(`One variant per product is required for ${row.name}.`);
    const represented=new Set();
    for(const origin of origins){
      if(!known.has(origin.productId)||!origin.claimIndexes?.length){errors.push(`Unsupported source variant for ${row.name}.`);continue;}
      for(const index of origin.claimIndexes){const claim=answer.claims?.[index],source=state.evidence.find(source=>source.id===claim?.evidenceId);represented.add(index);
        if(!row.claimIndexes?.includes(index)||!source||productForEvidence(state,source)?.id!==origin.productId||claim.quoteOrigin==='inspection-limit')errors.push(`Source attribution does not support ${row.name} in ${origin.productId}.`);
      }
    }
    for(const index of row.claimIndexes||[])if(!represented.has(index))errors.push(`An evidence claim for ${row.name} has no product attribution.`);
  }
  return errors;
}
export const keptKey=row=>row.name.trim().toLowerCase();
const sourceRecord=source=>({id:source.id,kind:source.kind,locator:source.locator,title:source.title,capturedAt:source.capturedAt,sha256:source.sha256,operation:source.operation,parameters:source.parameters,reaEvidenceId:source.reaEvidenceId,targetIdentity:source.targetIdentity,analysisProfile:source.analysisProfile,locations:source.locations,evidenceStatus:source.evidenceStatus,applicability:source.applicability,limitations:source.limitations||[]});
function evidenceFor(state,claims){const ids=new Set(claims.map(claim=>claim.evidenceId));return state.evidence.filter(source=>ids.has(source.id)).map(sourceRecord);}
export function keepFeature(state,messageId,featureName,keep){
  if(typeof keep!=='boolean')throw new Error('Choose whether to keep this feature.');
  const entry=inventoryRecord(state,{messageId,featureName});
  if(!entry)throw new Error('That feature is not in the saved map.');
  const {message,row}=entry;
  state.keptFeatures||=[];const key=keptKey(row),matches=feature=>(feature.key||keptKey(feature))===key,existing=state.keptFeatures.find(matches);
  // Keep inactive records out of existing collection consumers/exports. The
  // original record is moved, not rebuilt, so checkpoints and extension fields
  // survive repeated removal, reopening and restoration without duplicate copies.
  if(!keep){
    if(existing){state.removedKeptFeatures=[...(state.removedKeptFeatures||[]).filter(feature=>!matches(feature)),...state.keptFeatures.filter(matches)];state.keptFeatures=state.keptFeatures.filter(feature=>!matches(feature));}
    return;
  }
  if(existing)return; // Idempotent retry must not rewrite an already saved choice.
  const removed=(state.removedKeptFeatures||[]).filter(matches);
  if(removed.length){state.keptFeatures.push(...removed);state.removedKeptFeatures=state.removedKeptFeatures.filter(feature=>!matches(feature));return;}
  const claims=(row.claimIndexes||[]).map(index=>message.claims[index]);
  for(const claim of claims){const source=state.evidence.find(source=>source.id===claim.evidenceId);if(!source?.text.includes(claim.quote)||!claim.quote?.trim())throw new Error('This feature lacks retained source evidence.');}
  const products=message.products?.length?message.products:productsFor(state),now=new Date().toISOString();
  const mechanisms=(message.mechanismInventory?.mechanisms||[]).filter(mechanism=>row.mechanismIds?.includes(mechanism.id));
  const record={key,name:row.name,displayLabel:row.displayLabel||row.name,displayQuestion:row.displayQuestion||row.investigate,sourceMessageId:message.id,
    origins:originsFor(state,message,row).map(origin=>({productId:origin.productId,description:origin.description,productName:products.find(product=>product.id===origin.productId)?.name||origin.productId,claims:origin.claimIndexes.map(index=>message.claims[index])})),
    claims,evidence:evidenceFor(state,[...claims,...mechanisms.flatMap(mechanism=>mechanism.references||[])]),mechanisms,caveat:message.caveat,openQuestions:message.openQuestions||[],keptAt:existing?.keptAt||now,updatedAt:now,checkpoints:existing?.checkpoints||[]};
  state.keptFeatures=state.keptFeatures.filter(feature=>feature.key!==key);state.keptFeatures.push(record);state.collectionCreatedAt||=now;
}
export function updateKeptProgress(state,answer){
  const feature=state.keptFeatures?.find(feature=>feature.key===state.selection?.featureName?.trim().toLowerCase());if(!feature||!answer.findings?.length)return;
  (feature.checkpoints||=[]).push({messageId:answer.id,createdAt:answer.createdAt,request:state.messages.findLast(message=>message.role==='user')?.text,findings:answer.findings,claims:answer.claims,evidence:evidenceFor(state,answer.claims),caveat:answer.caveat,openQuestions:answer.openQuestions||[]});feature.updatedAt=answer.createdAt;
}
export function featureCollection(state){return {format:'rea-feature-collection',version:1,project:{id:state.id,title:state.title,request:state.messages.find(message=>message.role==='user')?.text||'',understanding:state.understanding,openQuestions:state.openQuestions||[]},products:productsFor(state),features:state.keptFeatures||[],createdAt:state.collectionCreatedAt||state.createdAt,updatedAt:state.updatedAt};}
export function collectionIntent(state,text){
  const normalized=text.trim().replace(/[.!]+$/,'');let keep=true,subject;
  const match=normalized.match(/^keep\s+(.+?)(?:\s+for (?:my|our) app)?$/i)||normalized.match(/^save\s+(this feature|that feature)(?:\s+for (?:my|our) app)?$/i);
  const remove=normalized.match(/^remove\s+(.+?)\s+from (?:my|our) app$/i);
  if(remove){keep=false;subject=remove[1];}else if(match)subject=match[1];else return null;
  const selected=inventoryRecord(state,state.selection||{});
  if(/^(this|that)( feature)?$/i.test(subject))return selected?{messageId:selected.message.id,featureName:selected.row.name,keep}:{clarification:'Select a feature, or name the feature you want to keep.'};
  const record=inventoryRecords(state).find(({row})=>[row.name,row.displayLabel].filter(Boolean).some(name=>name.toLowerCase()===subject.toLowerCase()));
  return record?{messageId:record.message.id,featureName:record.row.name,keep}:null;
}
