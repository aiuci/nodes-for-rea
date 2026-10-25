// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import distribution from './distribution.cjs';
export const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const {portable,npm:npmMode,portableRoot,dataRoot,settingsRoot}=distribution.distributionPaths(appRoot);
