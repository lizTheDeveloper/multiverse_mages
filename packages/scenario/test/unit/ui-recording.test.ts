/*
 * Multiverse Mages — the committed session recording is a golden.
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
 * `ui/session.json` is a real `AgentSession` recorded over the reference
 * scenario, and the eleven prototypes read it instead of inventing numbers. It
 * is committed so a fresh clone can open them, which makes it exactly the kind
 * of generated artefact that rots in silence — the file keeps loading, the
 * prototypes keep rendering, and the universe they show stopped being this one
 * some commits ago.
 *
 * So it gets the treatment `CLAUDE.md` already gives golden replay fixtures:
 * regenerated only by explicit command, and a diff is a claim that behaviour
 * changed on purpose. `npm run ui:record` is that command. This test is what
 * turns the claim into something a reviewer can rely on.
 *
 * It runs the script rather than reimplementing its loop. A test that
 * reimplements the recorder can agree with the committed file while both have
 * drifted from `record-session.mjs`, which is the one comparison that matters.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OBSERVATION_LAYOUT_DIGEST, OBSERVATION_SCHEMA_VERSION } from '@mm/agent-api';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const COMMITTED = path.join(ROOT, 'ui', 'session.json');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-ui-recording-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Recording {
  readonly provenance: {
    readonly seed: number;
    readonly ticks: number;
    readonly tickCap: number;
    readonly observationSchemaVersion: number;
    readonly observationLayoutDigest: string;
    readonly snapshotHash: string;
  };
  readonly layout: readonly { readonly name: string; readonly size: number }[];
  readonly content: { readonly cells: readonly unknown[]; readonly actionCosts: unknown };
  readonly frames: readonly unknown[];
}

const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as Recording;

describe('ui/session.json', () => {
  it('was recorded against this layout, not an older one', () => {
    // The cheap half of the check, and the one whose failure message is
    // legible: a block moved or a saturation constant changed.
    expect(committed.provenance.observationLayoutDigest).toBe(OBSERVATION_LAYOUT_DIGEST);
    expect(committed.provenance.observationSchemaVersion).toBe(OBSERVATION_SCHEMA_VERSION);
  });

  it('is byte-for-byte what `npm run ui:record` produces today', () => {
    // The expensive half, and the one that catches a rules change. The digest
    // above is blind to behaviour: a balance tweak moves every number in the
    // file and does not touch the layout.
    const out = path.join(scratch, 'session.json');
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, 'scripts', 'record-session.mjs'),
        // The cap the recording was made with, not the number of frames in it.
        // They differ the first time a run ends early, and re-running with the
        // observed length would hand the session a different episode.
        '--ticks',
        String(committed.provenance.tickCap),
        '--seed',
        String(committed.provenance.seed),
        '--out',
        out,
      ],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
    );

    const fresh = JSON.parse(readFileSync(out, 'utf8')) as Recording;
    // Compared field by field rather than as one string, so a failure says
    // *what* moved instead of "two 1.1 MB strings differ".
    expect(fresh.provenance).toEqual(committed.provenance);
    expect(fresh.layout).toEqual(committed.layout);
    expect(fresh.content).toEqual(committed.content);
    expect(fresh.frames.length).toBe(committed.frames.length);
    expect(fresh.frames).toEqual(committed.frames);
  });

  it('carries what the prototypes read it for', () => {
    // Guards against a recording that is fresh and useless — every field here
    // is one some prototype under ui/ decodes by name.
    const names = committed.layout.map((b) => b.name);
    expect(names).toContain('resources');
    expect(names).toContain('ruleset');
    expect(names).toContain('knowledge');
    expect(names).toContain('mages');
    expect(names).toContain('clock');
    expect(committed.content.cells).toHaveLength(70);
    expect(Object.keys(committed.content.actionCosts as object).length).toBeGreaterThan(0);
    expect(committed.frames.length).toBeGreaterThan(1);
  });
});
