#!/usr/bin/env node
/*
 * Multiverse Mages — audition manifest builder.
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
 * Lists what is in `assets/candidates/` so the audition page can load takes by
 * URL instead of through a native folder picker.
 *
 * The picker was the original design and it fails in this repository for two
 * reasons that only appear at real scale: worktrees live under `.claude/`,
 * which macOS hides from every file dialog, and a one-asset-at-a-time view with
 * no jump is unusable once there are two hundred assets. Serving a manifest
 * removes both, and removes the untested `webkitdirectory` path with them.
 */

import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const ROOT = 'assets/candidates';
if (!existsSync(ROOT)) {
  console.error(`no ${ROOT} directory — generate some candidates first`);
  process.exit(1);
}

const assets = readdirSync(ROOT)
  .filter((name) => statSync(`${ROOT}/${name}`).isDirectory())
  .map((id) => ({
    id,
    takes: readdirSync(`${ROOT}/${id}`)
      .filter((f) => /\.(mp3|wav|ogg)$/u.test(f))
      .sort((a, b) => a.localeCompare(b)),
  }))
  .filter((a) => a.takes.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(`${ROOT}/manifest.json`, `${JSON.stringify({ assets }, null, 2)}\n`);
console.log(
  `manifest: ${assets.length} assets, ${assets.reduce((n, a) => n + a.takes.length, 0)} takes`,
);
