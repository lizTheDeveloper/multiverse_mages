#!/usr/bin/env node
/*
 * Multiverse Mages — lobby server binary.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lobby } from '../dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const port = Number(process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : '8400');

const lobby = new Lobby({ uiRoot: path.join(ROOT, 'ui') });
lobby.listen(port);
