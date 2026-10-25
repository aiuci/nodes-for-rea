// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// A basename only: leave destination selection and replacement confirmation to Save As.
export function graphExportFilename(title) {
  let name = typeof title === 'string' ? title : '';
  name = name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/gu, ' ').trim().replace(/[. ]+$/u, '')
    .replace(/(?:\.json)+$/iu, '').replace(/[. ]+$/u, '');
  // Bound the basename without splitting a Unicode code point.
  name = Array.from(name).slice(0, 80).join('').replace(/[. ]+$/u, '') || 'Investigation';
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name)) name = `_${name}`;
  return `${name}-graph.json`;
}
