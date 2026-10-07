/*
 * Multiverse Mages — the image copies every workspace manifest.
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
 * The Dockerfile copies `packages/<name>/package.json` one line per workspace
 * before `npm ci`, so the install layer caches. A workspace added without its
 * line makes `npm ci` refuse the lock file (`Missing: @mm/<name> from lock
 * file`) — and nothing in CI builds the image, so the first to find out is the
 * deploy. A stale line is the reverse: `COPY` fails on a path that is gone.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../../', import.meta.url).pathname;

const workspaces = (): string[] =>
  readdirSync(`${ROOT}packages`, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${ROOT}packages/${d.name}/package.json`))
    .map((d) => d.name)
    .sort();

const copied = (): string[] =>
  [...readFileSync(`${ROOT}Dockerfile`, 'utf8').matchAll(/^COPY packages\/([^/\s]+)\/package\.json /gmu)]
    .map((m) => m[1] ?? '')
    .sort();

describe('Dockerfile workspace manifests', () => {
  it('finds manifests at all (positive control)', () => {
    expect(copied()).toContain('sim-core');
    expect(workspaces()).toContain('sim-core');
  });

  it('copies exactly the workspaces that exist', () => {
    expect(copied()).toEqual(workspaces());
  });
});
