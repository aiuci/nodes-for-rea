// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createDialogConfirmation} from './dialog-confirmation.mjs';

export function createDeleteConfirmation(options){
 const prompt=createDialogConfirmation({...options,channel:'delete-confirmation',busyMessage:'Finish the open deletion confirmation first.'});
 return {confirm:items=>prompt.confirm({items:items.map(({title,shortId,savedAt})=>({title,shortId,savedAt}))})};
}
