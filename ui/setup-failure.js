// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
// Resolve elements at failure time: a live progress snapshot may have replaced
// every row and feedback node since the action started.
export function settleSetupFailure(root,error,{render=renderUserError}={}){
 const canceled=/abort|cancel/i.test(error.message),message=String(error.message).replace(/^Error invoking remote method '[^']+': Error: /,''),feedback=root.querySelector('.setup-repair-feedback');
 if(feedback)render(feedback,error,{context:'setup',message:'Your application selection, saved request and draft are kept. Review the reported setup step before trying again.',action:{label:'Retry setup check',run:()=>document.getElementById('setup-test-rea')?.click()}});
 const row=root.querySelector('.setup-checklist li:is([data-state="Checking"],[data-state="Downloading"],[data-state="Downloaded"],[data-state="Installing"],[data-state="Installed"])');
 if(row){row.dataset.state=canceled?'Canceled':'Failed';const status=row.querySelector('.setup-row-status'),icon=row.querySelector('.setup-check-icon'),progress=row.querySelector('progress');if(status)status.textContent=row.dataset.state;if(icon)icon.textContent=canceled?'·':'!';if(progress)progress.hidden=true;}
 return {canceled,canceledRow:row?.dataset.check};
}
