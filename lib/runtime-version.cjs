// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Include executable source only: saved investigations and profile changes are normal.
function fingerprint(root) {
  const hash = createHash('sha256');
  function visit(relative) {
    const target = path.join(root, relative);
    if (fs.statSync(target).isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) visit(path.join(relative, name));
    } else {
      hash.update(relative.replaceAll('\\', '/'));
      hash.update(fs.readFileSync(target));
    }
  }
  for (const relative of ['main.cjs', 'preload.cjs', 'lib', 'ui']) visit(relative);
  return hash.digest('hex');
}

function runtimeVersion(root) {
  const loaded = fingerprint(root);
  let changed = false;
  return {
    changed() {
      // A partial update must also prevent mixed old/new code from running.
      try { changed ||= fingerprint(root) !== loaded; } catch { changed = true; }
      return changed;
    },
    assertCurrent() {
      if (this.changed()) throw new Error('An app update is ready. Use Restart to update before running another investigation. Your saved investigations are kept.');
    }
  };
}
module.exports = { runtimeVersion };
