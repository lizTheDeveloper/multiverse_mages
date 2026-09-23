/*
 * Multiverse Mages — the front door lands on a page that exists.
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
 * This file used to *be* the prototype index — the page that listed every
 * prototype — and the assertions here checked both directions: no link without
 * a prototype behind it, and no prototype without a link. When the game
 * consolidated into `ui/app/`, `ui/index.html` became a redirect stub instead,
 * so the thing to guard is different but the failure it guards against is not:
 * a redirect that points at a page that does not exist is the same 404, one
 * hop closer.
 *
 * Two directions, because both fail silently. The meta refresh and the visible
 * link can drift from each other, and both can point at a directory whose
 * `index.html` was deleted, renamed, or never committed.
 */

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const UI = new URL('../../../../ui/', import.meta.url).pathname;

const html = (): string => readFileSync(`${UI}index.html`, 'utf8');

/** The `url=` inside `<meta http-equiv="refresh" ...>`. */
const metaTarget = (): string | undefined => {
  const m = html().match(/<meta[^>]*http-equiv=["']refresh["'][^>]*url=([^"'\s>]+)/iu);
  return m ? m[1] : undefined;
};

/** Every `href` the stub offers a reader who ignores the meta refresh. */
const links = (): readonly string[] =>
  [...html().matchAll(/href="([^"]+)"/gu)].map((m) => m[1] ?? '');

/** `app/` → `app/`, so a bare name and a trailing-slash name both resolve. */
const resolvesToPage = (href: string): boolean => {
  const base = href.replace(/\/+$/, '');
  return existsSync(`${UI}${base}/index.html`);
};

describe('the front-door redirect', () => {
  it('redirects to a page that exists', () => {
    const target = metaTarget();
    expect(target, 'ui/index.html has no <meta http-equiv="refresh"> redirect').toBeTruthy();
    expect(
      resolvesToPage(target as string),
      `the redirect points at ${target}, which has no index.html`,
    ).toBe(true);
  });

  it('keeps the visible link in step with the meta refresh', () => {
    // A reader with JS or meta-refresh disabled still has to land somewhere
    // real. If the link and the refresh disagree, one of the two paths to the
    // game is broken, and the one that is not exercised is the one that rots.
    const target = metaTarget() as string;
    const norm = (s: string): string => s.replace(/\/+$/, '');
    for (const href of links()) {
      expect(norm(href), `visible link ${href} disagrees with the meta refresh ${target}`).toBe(
        norm(target),
      );
      expect(
        resolvesToPage(href),
        `the visible link ${href} has no index.html behind it`,
      ).toBe(true);
    }
  });

  it('offers at least one way to the game', () => {
    // Guards the two assertions above from passing vacuously if the stub is
    // ever emptied or its markup changes shape.
    expect(links().length).toBeGreaterThanOrEqual(1);
  });
});
