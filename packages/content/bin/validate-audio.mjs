#!/usr/bin/env node
/*
 * Multiverse Mages — audio content validation entry point.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A shell over `runAudioValidation`, which is where the logic lives so that the
 * unit tests can exercise it without a build step. Run `npm run typecheck`
 * (which is `tsc --build`) before this, or `npm run verify`, which orders them.
 */

import process from 'node:process';

import { runAudioValidation } from '../dist/audio-cli.js';

process.exitCode = runAudioValidation(process.argv.slice(2));
