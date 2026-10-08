/*
 * Multiverse Mages — the lobby publishes the document shape every ui/ page reads.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { createSession } from '@mm/agent-api';
import { referenceContent, referenceScenario } from '@mm/scenario';
import { frameDocument } from '../../../../scripts/lib/frame-document.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-frame-doc-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const keys = (o: object): string[] => Object.keys(o).sort();

describe('frameDocument', () => {
  it('builds the keys record-session.mjs builds, at every level a page reads', () => {
    const out = path.join(scratch, 'session.json');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'record-session.mjs'), '--ticks', '20', '--out', out], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const recorded = JSON.parse(readFileSync(out, 'utf8')) as {
      content: object;
      frames: object[];
    };

    const content = referenceContent();
    const session = createSession({ scenario: referenceScenario(content).scenario, strategyId: 't' });
    session.reset(7, { worldTickCap: 50 });
    const doc = frameDocument(content, 'test');
    const frame = doc.encodeFrame(session);
    const live = { ...doc.header({ seed: 7, cap: 50, session, frames: [frame], sandbox: null, sheet: null }), frames: [frame] };

    expect(keys(live)).toEqual(keys(recorded));
    expect(keys(live.content)).toEqual(expect.arrayContaining(keys(recorded.content)));
    // Frame 0 has no flow ledger (nothing has been stepped), and JSON drops an
    // undefined field, so compare against the recording's frame 0 as JSON.
    expect(keys(JSON.parse(JSON.stringify(live.frames[0])) as object)).toEqual(keys(recorded.frames[0]!));
    expect(live.provenance.recordedBy).toBe('test');
  }, 60_000);
});
