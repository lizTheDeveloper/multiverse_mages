/*
 * Multiverse Mages — the lobby's resource caps cannot be configured away.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { referenceContent } from '@mm/scenario';
import { manualClock } from '@mm/server';

import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';
import { Lobby, type LobbyOptions } from '../../src/lobby.js';

const doc = frameDocument(referenceContent(), 'limits');
const make = (opts: Partial<LobbyOptions>): Lobby => new Lobby({ doc, clock: manualClock(0), quiet: true, ...opts });
const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/lobby.mjs');

describe('Lobby limits', () => {
  it('accepts the defaults and in-range values (positive control)', () => {
    expect(() => make({})).not.toThrow();
    expect(() => make({ maxUniverses: 1, bubbleSize: 2, evictAfterMs: 0 })).not.toThrow();
    expect(() => make({ maxUniverses: 1024, bubbleSize: 16 })).not.toThrow();
  });

  it.each([
    ['maxUniverses', Number.NaN],
    ['maxUniverses', Number.POSITIVE_INFINITY],
    ['maxUniverses', 0],
    ['maxUniverses', 1025],
    ['maxUniverses', 2.5],
    ['bubbleSize', 1],
    ['bubbleSize', 17],
    ['bubbleSize', Number.NaN],
    ['evictAfterMs', -1],
    ['evictAfterMs', Number.NaN],
  ])('throws on %s = %s rather than clamping', (name, value) => {
    expect(() => make({ [name]: value })).toThrow(RangeError);
  });

  it.each([
    ['--max-universes', 'foo'],
    ['--max-universes', '0'],
    ['--max-universes', '1e9'],
    ['--tick-ms', '0'],
    ['--tick-ms', '-5'],
    ['--tick-ms', '49'],
    ['--bubble-size', '1'],
    ['--bubble-size', '17'],
    ['--port', '70000'],
    ['--port', 'eighty'],
  ])('the bin refuses %s %s and exits non-zero', (flag, value) => {
    const r = spawnSync(process.execPath, [BIN, flag, value], { encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(flag);
  });
});
