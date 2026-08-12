/*
 * Multiverse Mages — the prototype index links to prototypes that exist.
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
 * A front door that points at a missing page is worse than no front door: it
 * tells a reader the thing exists and then wastes their time proving it does
 * not. That is not hypothetical — a proposed `ui/README.md` change advertised
 * `ui/index.html` on a branch where the file had never been committed, so the
 * instruction it added led to a 404.
 *
 * Two directions, because both fail silently. A link with no prototype behind
 * it is a broken promise; a prototype with no link is invisible, which is how
 * an entire species of bark went unauditioned for a day in the audio work.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const UI = new URL('../../../../ui/', import.meta.url).pathname;

const links = (): readonly string[] =>
  [...readFileSync(`${UI}index.html`, 'utf8').matchAll(/href="([^"]+)"/gu)].map((m) => m[1] ?? '');

const prototypes = (): readonly string[] =>
  readdirSync(UI).filter((entry) => statSync(`${UI}${entry}`).isDirectory());

describe('the prototype index', () => {
  it('links only to prototypes that exist', () => {
    for (const href of links()) {
      expect(existsSync(`${UI}${href}index.html`), `${href} has no index.html`).toBe(true);
    }
  });

  it('links to every prototype', () => {
    const linked = new Set(links());
    for (const dir of prototypes()) {
      expect(linked.has(`${dir}/`), `ui/${dir}/ is not linked from the index`).toBe(true);
    }
  });

  it('links somewhere at all', () => {
    // Guards the two assertions above from passing vacuously if the index is
    // ever emptied or its markup changes shape.
    expect(links().length).toBeGreaterThanOrEqual(prototypes().length);
  });
});
