/*
 * Multiverse Mages — the session recording is built, and this is what it must hold.
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
 * scenario, and the eleven prototypes read it instead of inventing numbers.
 *
 * ## It used to be committed, and this test used to pin it byte-for-byte
 *
 * That was the wrong shape, for the reason written up at the top of
 * `scripts/check-generated-artifacts.mjs`: a 1.1 MB generated JSON in version
 * control conflicts on every branch that moves a rule, and a conflict in it is
 * resolved by regenerating rather than by reading — so the merge is decided by
 * whoever ran the command last. The file is now **built and gitignored**, by
 * `npm run ui:record`, and `npm run check:generated` gates the two properties
 * that removal depends on: the recorder is deterministic (run twice, bytes
 * compared) and the artifact is not tracked.
 *
 * **The "committed recording is stale" failure mode is gone by construction,
 * not preserved.** There is no committed recording to go stale.
 *
 * ## So what is left for this test
 *
 * The half of the old file that was never about equality: *does a recording
 * carry what a prototype decodes out of it?* Every assertion below names a field
 * some page under `ui/` reads, and a recording that lost one draws an empty box
 * that reads as "nothing to report" rather than failing.
 *
 * It runs the script rather than reimplementing its loop, exactly as before. A
 * test that reimplements the recorder can agree with itself while both have
 * drifted from `record-session.mjs`, which is the one comparison that matters.
 *
 * ## One assertion deliberately deleted rather than repointed
 *
 * The old first case compared the recording's `observationLayoutDigest` to
 * `OBSERVATION_LAYOUT_DIGEST` imported from `@mm/agent-api`. Against a
 * *committed* file that was a real check — it caught a recording made before a
 * block moved. Against freshly generated output it is a tautology: the recorder
 * writes that same imported constant into the file microseconds earlier. A
 * retained tautology reads as coverage and is worse than an absence, so it is
 * gone rather than repointed. The staleness it guarded cannot happen to a file
 * that is regenerated on every read.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-ui-recording-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Frame {
  readonly obs: readonly number[];
  readonly sat: readonly number[];
  /**
   * `material-stock`'s three kinds, in fp — the one quantity `obs` structurally
   * cannot carry, because §4.1 sums them into the single `resources[39]` slot.
   */
  readonly stocks: {
    readonly food: number;
    readonly stone: number;
    readonly vellum: number;
  };
  readonly mask: readonly number[];
  readonly candidates: Readonly<Record<string, readonly { readonly params: readonly number[] }[]>>;
  /**
   * §4.4's candidate **descriptors** — what each slot is, beside what it
   * submits. `byAction` is aligned slot-for-slot with `candidates`, which is the
   * property the test below exists for: the parameter submitted is still a slot
   * index, so a descriptor list one entry out of step shows a player one mage
   * and blesses another, and nothing refuses it.
   */
  readonly candidateDetail: {
    readonly byAction: Readonly<Record<string, readonly { readonly kind: string; readonly handle?: number }[]>>;
    readonly mages: Readonly<Record<string, { readonly handle: number; readonly speciesId: number; readonly ageTicks: number }>>;
    readonly universities: Readonly<Record<string, { readonly handle: number }>>;
  };
  readonly status: string;
}

interface Recording {
  readonly provenance: {
    readonly seed: number;
    readonly ticks: number;
    readonly tickCap: number;
    readonly scenarioId: string;
    readonly observationSchemaVersion: number;
    readonly observationLayoutDigest: string;
    readonly actionSpaceSize: number;
    readonly snapshotHash: string;
    readonly recordedBy: string;
  };
  readonly layout: readonly { readonly name: string; readonly offset: number; readonly size: number }[];
  readonly actions: Readonly<Record<string, string>>;
  readonly content: {
    readonly cells: readonly { readonly cellId: number; readonly id: string }[];
    readonly species: readonly { readonly id: string }[];
    readonly actionCosts: Readonly<Record<string, number>>;
    readonly candidateSlots: Readonly<Record<string, number>>;
  };
  readonly frames: readonly Frame[];
}

/**
 * One recording, at the recorder's own defaults.
 *
 * The defaults rather than a smaller run on purpose: `npm run ui:record` with no
 * flags is what a person gets and what the prototypes are drawn against, so a
 * shorter episode here would test a file nobody opens. It costs about 0.8 s.
 */
const recording = ((): Recording => {
  const out = path.join(scratch, 'session.json');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'record-session.mjs'), '--out', out], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return JSON.parse(readFileSync(out, 'utf8')) as Recording;
})();

describe('the recording `npm run ui:record` produces', () => {
  it('carries what the prototypes read it for', () => {
    // Guards against a recording that is fresh and useless — every field here is
    // one some prototype under ui/ decodes by name.
    const names = recording.layout.map((b) => b.name);
    expect(names).toContain('resources');
    expect(names).toContain('ruleset');
    expect(names).toContain('knowledge');
    expect(names).toContain('mages');
    expect(names).toContain('clock');
    expect(recording.content.cells).toHaveLength(70);
    expect(recording.content.species).toHaveLength(6);
    expect(Object.keys(recording.content.actionCosts).length).toBeGreaterThan(0);
    expect(Object.keys(recording.content.candidateSlots).length).toBeGreaterThan(0);
    expect(Object.keys(recording.actions).length).toBeGreaterThan(0);
    expect(recording.frames.length).toBeGreaterThan(1);
  });

  it('lays its blocks out end to end, which is how a view finds a channel', () => {
    // `ui/shared/session.js` reads a channel as `blockByName.clock.offset + 2`.
    // A gap or an overlap between blocks does not make that throw — it makes it
    // return a *different channel's* number, and every prototype then prints a
    // plausible wrong figure. This is the property that would have to hold for
    // that arithmetic to mean anything, and nothing else in the suite states it.
    let next = 0;
    for (const block of recording.layout) {
      expect(block.offset, `${block.name} does not start where the previous block ended`).toBe(next);
      expect(block.size, `${block.name} is empty`).toBeGreaterThan(0);
      next += block.size;
    }
    expect(next, 'the blocks do not sum to the observation length').toBe(
      recording.frames[0]?.obs.length,
    );
  });

  it('gives every frame the full observation and the full mask', () => {
    // A short frame is the failure that reads as a rendering bug three pages
    // away. `mask` is per action and §4.2 fixes the action space, so its length
    // is a stated fact rather than an emergent one.
    const slots = recording.layout.reduce((n, b) => n + b.size, 0);
    for (const [i, frame] of recording.frames.entries()) {
      expect(frame.obs.length, `frame ${String(i)} has a short observation`).toBe(slots);
      expect(frame.mask.length, `frame ${String(i)} has a short mask`).toBe(
        recording.provenance.actionSpaceSize,
      );
      expect(['running', 'truncated', 'terminated']).toContain(frame.status);
      // `sat` names slots whose magnitude was lost to the ceiling. An index
      // outside the observation would make a view label the wrong channel
      // "128+", which is worse than not labelling it.
      for (const slot of frame.sat) expect(slot).toBeLessThan(slots);
    }
  });

  it('splits materials into the three stocks, and they sum to the slot they are summed into', () => {
    // The newest field this file exists to guard, and it is guarded the way the
    // header describes: `ui/play` reads `food`, `stone` and `vellum` by name and
    // prints the breakdown only when all three are finite numbers, falling back
    // to the summed total otherwise. A recorder that stopped emitting `stocks`
    // would not fail anything above — every page would quietly fall back and the
    // breakdown would just stop appearing, which is the silent degradation the
    // rest of these assertions exist to prevent.
    //
    // The sum is checked rather than only the presence, because agreement with
    // `resources[39]` is the whole claim: the sidecar comes from the §4.4 player
    // projection and the slot comes from the §4.1 encoder, and two paths reading
    // one component is exactly where they can drift apart. Checked on every
    // frame, since a divergence that begins mid-run is the kind a spot check at
    // tick 0 misses — at tick 0 all three stocks are equal and any two of them
    // could be swapped undetectably.
    const materials = recording.layout.find((b) => b.name === 'resources');
    expect(materials, 'the recording has no resources block').toBeDefined();
    const slot = (materials?.offset ?? 0) + 3;

    for (const [i, frame] of recording.frames.entries()) {
      const { food, stone, vellum } = frame.stocks;
      for (const [kind, value] of Object.entries({ food, stone, vellum })) {
        expect(Number.isFinite(value), `frame ${String(i)} has a non-finite ${kind}`).toBe(true);
        expect(value, `frame ${String(i)} has a negative ${kind}`).toBeGreaterThanOrEqual(0);
      }
      // Exact, not approximate. Both sides are fp integers and the slot's
      // normalization is a `ratio` over a power of two, so the recorder's
      // round-trip through the divisor is lossless below saturation — and no
      // frame of this run saturates that slot. An epsilon here would hide a
      // real one-kind drift behind a tolerance nobody chose.
      expect(frame.sat, `frame ${String(i)} saturated the materials slot`).not.toContain(slot);
      expect(food + stone + vellum, `frame ${String(i)}'s stocks do not sum to resources[39]`).toBe(
        frame.obs[slot],
      );
    }
  });

  it('describes every candidate slot, in the slot order the parameter is submitted in', () => {
    // The alignment invariant, on a real run rather than on a fixture. It is
    // worth checking here as well as in `agent-api` because this file is what a
    // *client* reads: `ui/play` and `ui/console` index the descriptor list by
    // the same integer they put in `params[0]`, and a row that described the
    // wrong slot would produce a legal, admitted action on the wrong subject —
    // no rejection, no counter, nothing to notice.
    for (const [i, frame] of recording.frames.entries()) {
      const detail = frame.candidateDetail;
      expect(Object.keys(detail.byAction).sort()).toEqual(Object.keys(frame.candidates).sort());
      for (const [action, slots] of Object.entries(frame.candidates)) {
        const rows = detail.byAction[action] ?? [];
        expect(rows.length, `frame ${String(i)}, action ${action}`).toBe(slots.length);
        slots.forEach((candidate, slot) => {
          const row = rows[slot];
          // Where a descriptor names a handle it must be *this* slot's handle.
          // The kinds that name none — `found-university`, `portal-target`, a
          // cell, a tradition, a species — carry no handle to compare, and
          // `mage-node` names the mage in `params[0]` exactly as bless does.
          if (row !== undefined && row.handle !== undefined) {
            expect(row.handle, `frame ${String(i)}, action ${action}, slot ${String(slot)}`).toBe(
              candidate.params[0],
            );
          }
        });
      }
      // Every mage a slot names is in the per-handle table, once. A slot
      // pointing at a table that does not hold it draws a blank row.
      for (const rows of Object.values(detail.byAction)) {
        for (const row of rows) {
          if (row.kind === 'mage' || row.kind === 'mage-role' || row.kind === 'mage-node') {
            expect(detail.mages[String(row.handle)], `frame ${String(i)} lost mage ${String(row.handle)}`).toBeDefined();
          }
        }
      }
    }
  });

  it('ran the whole episode it asked for, so the prototypes are not drawn against a collapse', () => {
    // `ticks` is what happened and `tickCap` is what was asked for; they part
    // company the first time a run ends early. The reference universe reaching
    // its cap is a real property of this scenario and not a tautology of the
    // recorder — a world that died at tick 40 would give every prototype a
    // 40-frame timeline and no obvious sign that is what happened.
    expect(recording.provenance.ticks).toBe(recording.provenance.tickCap);
    expect(recording.frames).toHaveLength(recording.provenance.tickCap + 1);
    expect(recording.frames.at(-1)?.status).not.toBe('running');
  });

  it('names one cell per id, so a view cannot silently resolve the wrong one', () => {
    // `session.js` builds `cellById` with `Object.fromEntries`, which keeps the
    // last of a duplicate pair without complaining.
    const ids = new Set(recording.content.cells.map((c) => c.cellId));
    expect(ids.size).toBe(recording.content.cells.length);
  });

  it('records the identity of the run it is, so a reader can trace it back', () => {
    expect(recording.provenance.recordedBy).toBe('scripts/record-session.mjs');
    expect(recording.provenance.scenarioId.length).toBeGreaterThan(0);
    expect(recording.provenance.seed).toBeGreaterThan(0);
    // The behaviour identity of the episode. It is not pinned to a literal here:
    // a rules change moves it, and the three balance gates plus the golden
    // replay fixtures are what state whether that change was intended. What
    // matters to a *reader of the file* is that it is present, because it is the
    // only thing in the payload that says which simulation produced it.
    expect(recording.provenance.snapshotHash).toMatch(/^[0-9a-f]{16}$/u);
    expect(recording.provenance.observationLayoutDigest).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('carries no wall-clock stamp, so it is a statement about the tree and not about today', () => {
    // The property `npm run check:generated` rests on: the recorder is a pure
    // function of the repository, so the file CI builds is the file you build.
    // The check would catch a timestamp as non-determinism; this catches it with
    // a message that says what was added and why it is not allowed.
    expect(JSON.stringify(recording.provenance)).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(Object.keys(recording.provenance)).not.toContain('generatedAt');
    expect(Object.keys(recording.provenance)).not.toContain('recordedAt');
  });
});
