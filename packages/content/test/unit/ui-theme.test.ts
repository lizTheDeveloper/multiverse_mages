/*
 * Multiverse Mages — the prototype theme holds together in both themes.
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
 * Three ways the two-theme setup breaks without anyone seeing it, all found the
 * hard way while building it.
 *
 * 1. **The two dark blocks drift.** Dark is declared twice — once under
 *    `@media (prefers-color-scheme: dark)` for viewers on system default, and
 *    once under `:root[data-theme="dark"]` so an explicit toggle wins. CSS has
 *    no way to share them, so adding a token to one and not the other is a
 *    single missed edit. The symptom is the worst kind: the page is correct
 *    when the OS is dark and wrong when the user *chooses* dark, because the
 *    missing tokens fall back to their light values on a dark ground. Seven
 *    tokens did exactly that, and the page still rendered.
 *
 * 2. **A prototype references a token nothing defines.** `var(--theirs)` with
 *    no declaration does not throw and does not warn; the property is simply
 *    invalid and the element inherits, which usually looks *almost* right.
 *
 * 3. **A page forgets the theme entirely.** Without the stylesheet it renders
 *    in whatever it happens to declare locally and ignores the toggle.
 *
 * All three are checked against **every page under `ui/`, not every
 * directory** — see `pages()`. That distinction was the bug: `ui/index.html`
 * is a file, so it sat outside this sweep and carried text at 2.70:1 for as
 * long as it existed.
 *
 * These read the files rather than a model of them, which is why they catch
 * cases they were not written for — see docs/design/interface-findings.md §8.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const UI = new URL('../../../../ui/', import.meta.url).pathname;
const THEME = readFileSync(`${UI}shared/theme.css`, 'utf8');

/** Token names declared inside one CSS block. */
const declared = (block: string): ReadonlySet<string> =>
  new Set([...block.matchAll(/(--[a-z0-9-]+)\s*:/gu)].map((m) => m[1] ?? ''));

const blockAfter = (marker: string): string => {
  const start = THEME.indexOf(marker);
  if (start < 0) throw new Error(`theme.css has no block matching ${marker}`);
  const open = THEME.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < THEME.length; i += 1) {
    if (THEME[i] === '{') depth += 1;
    else if (THEME[i] === '}') {
      depth -= 1;
      if (depth === 0) return THEME.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated block for ${marker}`);
};

const prototypes = (): readonly string[] =>
  readdirSync(UI).filter(
    (entry) => entry !== 'shared' && statSync(`${UI}${entry}`).isDirectory(),
  );

/**
 * Every page these assertions apply to, as `{ path, html }`.
 *
 * **`prototypes()` above answers about directories, and the front door is a
 * file.** `ui/index.html` used to be the prototype index — a real page with a
 * palette, headings and a footer — and it sat outside this sweep entirely, so
 * the gap was found the way gaps like this are always found: by opening it and
 * measuring. Its `--faint` was carrying the lede, every section heading, every
 * card path and the footer at **2.70:1 on vellum and 3.91:1 on ink**, and
 * nothing here could have said so, because nothing here looked at the file.
 *
 * The front door is now a redirect stub, so it is exempt from the stylesheet
 * and control assertions (`NO_SHARED_STYLESHEET`, `NO_THEME_CONTROL` below) —
 * it hands the reader to `app/` before any theme would matter. It stays in the
 * sweep itself, so the token assertion still runs over it and the exemption
 * list is still held to pages that actually exist. It is held to the one
 * assertion that survives a redirect — that the page it points at exists — by
 * `ui-index.test.ts`.
 *
 * The path rather than the directory name is what gets reported, so a failure
 * on a prototype reads as `ui/<dir>/index.html` and not as `ui//`.
 */
const pages = (): readonly { readonly path: string; readonly html: string }[] => [
  ...prototypes().map((dir) => ({
    path: `ui/${dir}/index.html`,
    html: readFileSync(`${UI}${dir}/index.html`, 'utf8'),
  })),
  { path: 'ui/index.html', html: readFileSync(`${UI}index.html`, 'utf8') },
];

/**
 * Pages that legitimately do not link `shared/theme.css`.
 *
 * Exactly one, and the exemption is narrow on purpose: the front door,
 * `ui/index.html`, is a redirect stub rather than a page — it hands the reader
 * to `app/` before any styling would matter, so it loads no stylesheet. It is
 * exempt from the control assertion for the same reason (`NO_THEME_CONTROL`).
 *
 * There is also a mechanical reason it cannot load the stylesheet:
 * `ui-index.test.ts` reads *every* `href` on that page and asserts an
 * `index.html` behind it, so a `<link rel="stylesheet" href="shared/theme.css">`
 * there fails that suite.
 *
 * Listed by path rather than by a convention, so that exempting a second page
 * is a deliberate edit here with a reason next to it — an unexplained exemption
 * is how a real gap gets normalised.
 */
const NO_SHARED_STYLESHEET = new Set(['ui/index.html']);

/**
 * Pages that legitimately do not mount the shared theme control.
 *
 * The same redirect stub: `ui/index.html` exists to hand the reader to `app/`,
 * not to be themed, so it mounts no `shared/theme.js` control either. Kept as
 * its own set rather than folding into `NO_SHARED_STYLESHEET` because a page
 * that skips the stylesheet could still mount the control, and the two
 * exemptions do not have to move together.
 */
const NO_THEME_CONTROL = new Set(['ui/index.html']);

/** Names a page may set itself: per-element geometry, not colour. */
const LOCAL_OK = new Set([
  '--drop', '--from', '--len', '--at', '--c', '--w', '--h', '--x', '--depth', '--ghost',
]);

describe('the prototype theme', () => {
  it('declares the same tokens in both dark blocks', () => {
    const media = declared(blockAfter('@media (prefers-color-scheme: dark)'));
    const toggle = declared(blockAfter(':root[data-theme="dark"]'));
    const onlyMedia = [...media].filter((t) => !toggle.has(t));
    const onlyToggle = [...toggle].filter((t) => !media.has(t));
    expect(
      onlyMedia,
      `declared for a dark OS but not for the dark toggle: ${onlyMedia.join(', ')} — ` +
        'these fall back to their light values when a viewer chooses dark',
    ).toEqual([]);
    expect(onlyToggle, `declared for the dark toggle only: ${onlyToggle.join(', ')}`).toEqual([]);
  });

  it('defines a light value for every token the dark blocks define', () => {
    const light = declared(blockAfter('/* ============================================================ LIGHT'));
    const dark = declared(blockAfter(':root[data-theme="dark"]'));
    const missing = [...dark].filter((t) => !light.has(t));
    expect(
      missing,
      `no light value for ${missing.join(', ')} — a token defined only inside a ` +
        'dark block does not apply in the unstamped light state',
    ).toEqual([]);
  });

  it('is used by every page, for tokens and for the control', () => {
    for (const { path, html } of pages()) {
      if (!NO_SHARED_STYLESHEET.has(path)) {
        expect(html, `${path} does not link shared/theme.css`).toContain('shared/theme.css');
      }
      if (!NO_THEME_CONTROL.has(path)) {
        expect(html, `${path} does not mount the theme control`).toContain('shared/theme.js');
      }
    }
  });

  it('holds the exemption lists to pages that actually exist', () => {
    // A stale exemption is a silent hole: rename the file and the entry stops
    // matching anything, which reads as "nothing is exempt" and is not.
    const known = new Set(pages().map((p) => p.path));
    for (const path of [...NO_SHARED_STYLESHEET, ...NO_THEME_CONTROL]) {
      expect(known.has(path), `${path} is exempted but is not a page this sweep visits`).toBe(true);
    }
  });

  it('leaves no page referencing a token nothing declares', () => {
    const themeTokens = declared(THEME);
    for (const { path, html } of pages()) {
      const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/gu)].map((m) => m[1] ?? ''));
      const own = declared(html);
      const undefinedTokens = [...used].filter(
        (t) => !themeTokens.has(t) && !own.has(t) && !LOCAL_OK.has(t),
      );
      expect(
        undefinedTokens,
        `${path} uses ${undefinedTokens.join(', ')}, which nothing declares — ` +
          'an undeclared var() is silently invalid and the element just inherits',
      ).toEqual([]);
    }
  });
});
