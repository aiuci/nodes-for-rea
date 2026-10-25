// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {createRequire} = require('node:module');

function dependencyEntry(root, name, relative) {
  const requireFromApp = createRequire(path.join(root, 'package.json'));
  for (const directory of requireFromApp.resolve.paths(name) || []) {
    const entry = path.join(directory, name, relative);
    if (fs.existsSync(entry)) return entry;
  }
  return '';
}

function distributionPaths(appRoot, {env = process.env, platform = process.platform, home = os.homedir()} = {}) {
  const portable = fs.existsSync(path.join(appRoot, 'portable.json'));
  const npm = !portable && fs.existsSync(path.join(appRoot, 'npm-release.json'));
  const portableRoot = portable ? path.resolve(appRoot, '../..') : appRoot;
  const userBase = platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'Nodes for REA')
    : platform === 'darwin' ? path.join(home, 'Library/Application Support/Nodes for REA')
    : path.join(env.XDG_DATA_HOME || path.join(home, '.local/share'), 'nodes-for-rea');
  const base = npm ? userBase : portableRoot;
  const dataRoot = env.INVESTIGATOR_DATA || path.join(base, portable ? 'Data/investigations' : npm ? 'investigations' : 'data');
  const settingsRoot = env.INVESTIGATOR_DATA ? path.join(dataRoot, '.settings') : path.join(base, portable ? 'Data' : 'settings');
  const profileRoot = env.INVESTIGATOR_DATA ? path.join(dataRoot, '.electron-profile') : path.join(base, portable ? 'Data/profile' : npm ? 'profile' : 'candidate-profile');
  return {appRoot, portable, npm, distributed: portable || npm, portableRoot, dataRoot, settingsRoot, profileRoot};
}

module.exports = {distributionPaths, dependencyEntry};
