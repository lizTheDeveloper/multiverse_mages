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
 * 3. **A prototype forgets the theme entirely.** Without the stylesheet it
 *    renders in whatever it happens to declare locally and ignores the toggle.
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

  it('is used by every prototype, for tokens and for the control', () => {
    for (const dir of prototypes()) {
      const html = readFileSync(`${UI}${dir}/index.html`, 'utf8');
      expect(html, `ui/${dir}/ does not link shared/theme.css`).toContain('shared/theme.css');
      expect(html, `ui/${dir}/ does not mount the theme control`).toContain('shared/theme.js');
    }
  });

  it('leaves no prototype referencing a token nothing declares', () => {
    const themeTokens = declared(THEME);
    for (const dir of prototypes()) {
      const html = readFileSync(`${UI}${dir}/index.html`, 'utf8');
      const used = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/gu)].map((m) => m[1] ?? ''));
      const own = declared(html);
      const undefinedTokens = [...used].filter(
        (t) => !themeTokens.has(t) && !own.has(t) && !LOCAL_OK.has(t),
      );
      expect(
        undefinedTokens,
        `ui/${dir}/ uses ${undefinedTokens.join(', ')}, which nothing declares — ` +
          'an undeclared var() is silently invalid and the element just inherits',
      ).toEqual([]);
    }
  });
});
