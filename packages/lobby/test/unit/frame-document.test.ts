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

  it('publishes the god report the ascension checklist reads, consistent with itself', () => {
    const content = referenceContent();
    const run = referenceScenario(content);
    const session = createSession({ scenario: run.scenario, strategyId: 't' });
    session.reset(7, { worldTickCap: 50 });
    const doc = frameDocument(content, 'test');
    // Frame 0 has no god report, and says so by omission rather than zeros.
    expect(doc.encodeFrame(session, { godReport: run.lastGodReport })).not.toHaveProperty('ascension');
    for (let i = 0; i < 30; i += 1) session.submit({ kind: 0, params: [] });
    const frame = doc.encodeFrame(session, { godReport: run.lastGodReport }) as {
      ascension: {
        nodesKnown: number;
        masteredCells: number;
        eraLossAllowance: number;
        summits: [number, number, number, number][];
        knownNodes: string;
      };
      founding: { grantsRemaining: number | null; unknownRoots: number };
    };
    const a = frame.ascension;
    let bits = 0;
    for (const ch of a.knownNodes) bits += [...parseInt(ch, 16).toString(2)].filter((b) => b === '1').length;
    expect(bits).toBe(a.nodesKnown);
    const copies = content.registry.godConstants.find((c) => c.record.id === 'ascension-summit-copies')!.record.value;
    expect(a.summits.filter(([, , holders, n]) => holders > 0 && n >= copies)).toHaveLength(a.masteredCells);
    expect(a.eraLossAllowance).toBeGreaterThanOrEqual(0);
    expect(frame.founding.unknownRoots).toBeGreaterThanOrEqual(0);
    // Without a report source the frame is exactly what it always was.
    expect(doc.encodeFrame(session)).not.toHaveProperty('ascension');
  });
});
