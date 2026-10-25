// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// This filters suggestions for the main product, not explicit file inspection.
// Support binaries remain on disk and can still be selected deliberately.
export function supportingExecutable(name){return /(?:^|[-_. ])(?:unins\d*|uninstall|installer|setup|updater|crashpad|crashreport|helper|vc_?redist(?:ributable)?|dotnet[-_. ]?(?:runtime|hosting)|dxsetup|diagnostic(?:s)?)(?:[-_. ]|$)/i.test(name)||/^(?:QtWebEngineProcess|WerFault)\.exe$/i.test(name);}


export function prerequisiteExecutable(name){return /(?:^|[-_. ])(?:unins\d*|uninstall|installer|setup|vc_?redist(?:ributable)?|dotnet[-_. ]?(?:runtime|hosting)|dxsetup)(?:[-_. ]|$)/i.test(name);}
const filename=value=>String(value||'').split(/[\\/]/).filter(Boolean).at(-1)||'';
const productKey=value=>String(value||'').replace(/\.(?:exe|dll)$/i,'').replace(/\b(?:20\d{2}|v\d+(?:\.\d+)*)\b/gi,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const relatedComponent=c=>supportingExecutable(filename(c.path))||/^(?:commandline|render|c4dpy|c4d[_ -]?commandline)\.exe$/i.test(filename(c.path))||/(?:^|[-_. ])(?:crash(?:report(?:er)?|pad)?|command[-_ ]?line|cli|console|renderer|render[-_ ]?(?:server|client)|team[-_ ]?render|server|service|proxy|worker|bridge|python interpreter)(?:[-_. ]|$)/i.test(filename(c.path)+' '+(c.description||''));
// Presentation advice only: it never selects, launches or rewrites a target.
export function rankApplicationCandidates(candidates,{locator='',partial=false}={}){
  const folderName=filename(locator).replace(/\b(?:20\d{2}|v\d+(?:\.\d+)*)\b/gi,''),words=folderName.split(/[^a-z0-9]+/i).filter(Boolean),folder=productKey(folderName),folderKeys=new Set(words.map((_,i)=>productKey(words.slice(i).join(' '))));
  // Keep the known file-manager/console/helper family ordered even when the
  // chooser has no folder metadata (or the folder has a version suffix).
  const sevenZipFamily=candidates.length>0&&candidates.filter(c=>!supportingExecutable(filename(c.path))).every(c=>/^(?:7z(?:FM|G)?\.exe|7z\.dll)$/i.test(filename(c.path)));
  const rows=candidates.map(candidate=>{
    const sevenZip=(folder==='7zip'||sevenZipFamily)&&/^7z(?:FM|G)?\.exe$/i.test(filename(candidate.path)),gui=sevenZip&&/^7zFM\.exe$/i.test(filename(candidate.path)),console=sevenZip&&!gui;const related=console||relatedComponent(candidate),sources=candidate.sources||[],registered=!!candidate.installed||sources.some(s=>['Windows installation record','Start menu shortcut'].includes(s));
    const stem=productKey(filename(candidate.path)),matches=stem.length>=4&&folder.length>=stem.length&&folderKeys.has(stem);
    const product=productKey(candidate.name),metadataMatch=folder.length>=4&&product.length>=4&&folderKeys.has(product);
    const launchEvidence=registered&&!/registered installation folder and product name match/i.test(candidate.reason||'');const signals=[];if(gui)signals.push('The 7zFM filename identifies the 7-Zip file manager; this is filename-based guidance, not inspection evidence.');if(registered)signals.push(sources.includes('Start menu shortcut')?'A Start menu shortcut points to this file.':'Windows installation metadata points to this file.');if(matches)signals.push('Its filename matches the selected application folder.');if(metadataMatch)signals.push('Its product metadata matches the selected folder; other components may share that name.');
    return {...candidate,recommended:false,choiceRole:related?'related':launchEvidence||matches||gui?'main':'other',choiceReason:related?'Its filename or description identifies a supporting application or tool. You can still inspect it.':signals.join(' ')||'No reliable main-application signal was found. Review the filename and location.',choiceScore:related?-1:(gui?100:0)+(registered?80:0)+(matches?60:0)+(metadataMatch?10:0)};
  });
  const registered=rows.filter(c=>c.choiceRole!=='related'&&(c.installed||(c.sources||[]).some(source=>['Windows installation record','Start menu shortcut'].includes(source))));
  rows.sort((a,b)=>b.choiceScore-a.choiceScore||filename(a.path).localeCompare(filename(b.path))||a.path.localeCompare(b.path));
  if(!partial&&registered.length<=1&&rows[0]?.choiceRole==='main'&&rows[0].choiceScore>=(rows[1]?.choiceScore??-1)+1)rows[0].recommended=true;
  return rows;
}
