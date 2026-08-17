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

import { MagicGrid, heldNodes } from '@mm/rules-magic';
import { referenceContent } from '@mm/scenario';

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
  /**
   * §4.4's academy projection — every college, its roster, its shelf, the
   * lessons in it, and the cells the ruleset permits. The whole of what
   * `ui/university/` is drawn from, and none of it is in §4.1.
   */
  readonly academy: {
    readonly universities: Readonly<Record<string, Dossier>>;
    readonly mages: Readonly<Record<string, { readonly handle: number; readonly speciesId: number }>>;
    readonly permittedCells: readonly number[];
    readonly unaffiliated: number;
  };
  readonly status: string;
}

interface Dossier {
  readonly college: {
    readonly handle: number;
    readonly capacity: number;
    readonly buildProgress: number;
    readonly hasLibrary: boolean;
    readonly libraryNodes: number;
    readonly affiliatedMages: number;
    readonly staffCohorts: number;
  };
  readonly roster: readonly { readonly handle: number; readonly nodeIds: readonly number[] }[];
  readonly shelf: readonly {
    readonly nodeId: number;
    readonly copies: number;
    readonly bestMastery: number;
  }[];
  readonly teaching: readonly {
    readonly teacher: number;
    readonly student: number;
    readonly nodeId: number;
    readonly progress: number;
    readonly teacherHere: boolean;
    readonly studentHere: boolean;
  }[];
  readonly staffHeadcount: number;
}

/** One row of {@link collegeFrontier}'s four lists. */
interface FrontierRow {
  readonly nodeId: number;
  readonly by: readonly number[];
  readonly missing?: readonly number[];
}

interface Frontier {
  readonly reachable: readonly FrontierRow[];
  readonly blockedByAxis: readonly FrontierRow[];
  readonly blockedByPrerequisite: readonly FrontierRow[];
  readonly blockedByDepth: readonly FrontierRow[];
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
    readonly species: readonly { readonly id: string; readonly speciesId: number; readonly depthCeiling: number }[];
    readonly actionCosts: Readonly<Record<string, number>>;
    readonly candidateSlots: Readonly<Record<string, number>>;
    /** §2.3's research graph — the header field `ui/university/` is drawn from. */
    readonly nodes: readonly {
      readonly nodeId: number;
      readonly id: string;
      readonly name: string;
      readonly cellId: number;
      readonly tier: number;
      readonly prerequisites: readonly number[];
    }[];
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

/**
 * `ui/shared/session.js`'s own frontier arithmetic, imported rather than
 * transcribed.
 *
 * A test that reimplemented `collegeFrontier` could agree with itself while
 * both had drifted from the page — the same argument the header of this file
 * makes about re-running the recorder rather than re-writing its loop. The
 * import is dynamic and by path because `ui/` is deliberately a build-free set
 * of static files with no package of its own; the shape is declared above so
 * nothing here is `any`.
 */
const uiSession = (await import(
  /*
   * A **literal** specifier, and it has to be. `module-boundaries.test.ts`
   * reports any `import()` whose specifier it cannot read as a §5 violation
   * rather than skipping it — *"an import that cannot be proven safe is
   * reported rather than assumed safe"* — and a path built from `ROOT` at
   * runtime is exactly that shape. So the path is written out, and the
   * suppression below is for TypeScript rather than for the boundary check:
   * `ui/` is deliberately build-free, has no package and no declarations, and
   * sits outside every `rootDir`. The shape is declared on the cast, so nothing
   * past this line is untyped.
   */
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/shared/session.js'
)) as unknown as {
  collegeFrontier: (
    content: Recording['content'],
    dossier: Dossier,
    academy: { mage: (h: number) => unknown; permittedCells: ReadonlySet<number> },
  ) => Frontier;
};

describe("the recording's research graph, against the grid that owns it", () => {
  /**
   * The runtime grid, built from the same content the recorder published from.
   *
   * This is the positive control the graph assertion needs. "Every prerequisite
   * resolves to a shipped node" would pass against an empty list; comparing to
   * `prerequisitesOf` cannot, because a recorder that emitted nothing would
   * disagree with 292 real edges.
   */
  const grid = MagicGrid.from(referenceContent().registry);

  it('publishes exactly the edges `MagicGrid.prerequisitesOf` holds', () => {
    let edges = 0;
    let crossing = 0;
    for (const node of recording.content.nodes) {
      const expected = [...grid.prerequisitesOf(node.nodeId)].sort((a, b) => a - b);
      const actual = [...node.prerequisites].sort((a, b) => a - b);
      expect(actual, `node ${node.id} ships the wrong prerequisites`).toEqual(expected);
      edges += actual.length;
      for (const prerequisite of actual) {
        // The reserved null in a prerequisite list would read to a client as a
        // requirement nothing can satisfy — a node quietly unreachable forever.
        expect(prerequisite, `node ${node.id} names the reserved null`).toBeGreaterThan(0);
        const source = recording.content.nodes.find((n) => n.nodeId === prerequisite);
        expect(source, `node ${node.id} names node ${String(prerequisite)}, which is not shipped`).toBeDefined();
        // §2.3's loader guarantee, restated where a client can rely on it: a
        // prerequisite is never deeper than the node it gates, so a frontier
        // walk cannot cycle.
        expect(source?.tier ?? 0).toBeLessThanOrEqual(node.tier);
        if ((source?.cellId ?? 0) !== node.cellId) crossing += 1;
      }
    }
    // Measured on this content set. Written as a floor rather than a literal
    // because content is authored and a new node is not a regression — what is
    // a regression is the graph arriving empty, which is what every "is it
    // present" assertion above would happily accept.
    expect(edges).toBeGreaterThanOrEqual(292);
    expect(crossing).toBeGreaterThanOrEqual(36);
  });

  it('permits only cells `permits()` permits, and only ones content populates', () => {
    const populated = new Set(recording.content.nodes.map((n) => n.cellId));
    for (const [i, frame] of recording.frames.entries()) {
      for (const cellId of frame.academy.permittedCells) {
        expect(populated.has(cellId), `frame ${String(i)} permits empty cell ${String(cellId)}`).toBe(
          true,
        );
      }
    }
  });

  /**
   * The one that matters: **is the page's reachable frontier the frontier the
   * rules would give?**
   *
   * `collegeFrontier` is set arithmetic in a browser file, and set arithmetic
   * that is confidently wrong is exactly the shape this repository keeps
   * finding. So every row it calls reachable is put back through
   * `MagicGrid.prerequisiteStatus` — the function
   * `CoordinatingKnowledgeGateway.researchFrontier` itself consults — against
   * that mage's own holdings, and the converse is checked too: a node the rules
   * would admit and the page dropped is the failure nobody would ever notice.
   */
  it('calls reachable exactly what `prerequisiteStatus` calls satisfied', () => {
    const depthOf = new Map(recording.content.species.map((x) => [x.speciesId, x.depthCeiling]));
    let checkedRows = 0;
    for (const [i, frame] of recording.frames.entries()) {
      const academy = {
        mage: (handle: number) => frame.academy.mages[String(handle)],
        permittedCells: new Set(frame.academy.permittedCells),
      };
      for (const dossier of Object.values(frame.academy.universities)) {
        const frontier = uiSession.collegeFrontier(recording.content, dossier, academy);
        const held = new Map(dossier.roster.map((r) => [r.handle, new Set(r.nodeIds)]));

        for (const row of frontier.reachable) {
          checkedRows += 1;
          const node = recording.content.nodes.find((n) => n.nodeId === row.nodeId);
          expect(node, `frame ${String(i)}: reachable node ${String(row.nodeId)} is not content`).toBeDefined();
          expect(academy.permittedCells.has(node?.cellId ?? 0)).toBe(true);
          for (const handle of row.by) {
            const mine = held.get(handle) ?? new Set<number>();
            expect(mine.has(row.nodeId), `${String(handle)} already holds ${String(row.nodeId)}`).toBe(
              false,
            );
            const status = grid.prerequisiteStatus(row.nodeId, heldNodes(mine));
            expect(
              status.satisfied,
              `frame ${String(i)}: the page offers node ${String(row.nodeId)} to mage ` +
                `${String(handle)}, who is missing ${status.missing.join(', ')}`,
            ).toBe(true);
            const species = frame.academy.mages[String(handle)]?.speciesId ?? 0;
            expect(node?.tier ?? 0).toBeLessThanOrEqual(depthOf.get(species) ?? 7);
          }
        }

        // The converse. Without it the assertion above passes on an empty
        // frontier, which is the failure mode this repository names in
        // CLAUDE.md: a checker that answers about the wrong input.
        for (const entry of dossier.roster) {
          const mine = new Set(entry.nodeIds);
          const species = frame.academy.mages[String(entry.handle)]?.speciesId ?? 0;
          const ceiling = depthOf.get(species) ?? 7;
          const offered = new Set(
            frontier.reachable.filter((r) => r.by.includes(entry.handle)).map((r) => r.nodeId),
          );
          for (const node of recording.content.nodes) {
            if (mine.has(node.nodeId)) continue;
            if (!academy.permittedCells.has(node.cellId)) continue;
            if (node.tier > ceiling) continue;
            if (!grid.prerequisiteStatus(node.nodeId, heldNodes(mine)).satisfied) continue;
            expect(
              offered.has(node.nodeId),
              `frame ${String(i)}: the rules admit node ${node.id} for mage ` +
                `${String(entry.handle)} and the page does not offer it`,
            ).toBe(true);
          }
        }
      }
    }
    // A positive control on the loop itself: a run whose colleges were empty
    // would satisfy every assertion above without checking anything.
    expect(checkedRows, 'no reachable row was ever checked').toBeGreaterThan(0);
  });
});

describe("the recording's academy projection", () => {
  it('gives every frame a college, its roster, its shelf and the permitted cells', () => {
    for (const [i, frame] of recording.frames.entries()) {
      const academy = frame.academy;
      expect(academy, `frame ${String(i)} carries no academy`).toBeDefined();
      expect(Array.isArray(academy.permittedCells)).toBe(true);
      expect(typeof academy.unaffiliated).toBe('number');
      for (const dossier of Object.values(academy.universities)) {
        // The roster is the join §4.1 cannot express, so the count on the
        // summary and the list beside it must agree — they come from two passes
        // over the mage store and a page prints both.
        expect(
          dossier.roster.length,
          `frame ${String(i)}: college #${String(dossier.college.handle)} lists ` +
            `${String(dossier.roster.length)} on a roster of ${String(dossier.college.affiliatedMages)}`,
        ).toBe(dossier.college.affiliatedMages);
        // Every roster mage is in the per-handle table. A row pointing at a
        // table that does not hold it draws a blank line, which reads as a mage
        // about whom nothing is known rather than as a lost lookup.
        for (const entry of dossier.roster) {
          expect(academy.mages[String(entry.handle)]).toBeDefined();
        }
        // `libraryNodes` on the summary is the distinct count; `shelf` is the
        // list it was made from. Two derivations of one fact, and a page shows
        // the number at the head and the list underneath.
        expect(dossier.shelf.length).toBe(dossier.college.libraryNodes);
        for (const entry of dossier.shelf) expect(entry.copies).toBeGreaterThan(0);
        // A teaching row belongs to a pair, and this list is the join that
        // places it. At least one party must be here or the row would not be on
        // this college's screen at all.
        for (const lesson of dossier.teaching) {
          expect(lesson.teacherHere || lesson.studentHere).toBe(true);
          expect(academy.mages[String(lesson.teacher)]).toBeDefined();
          expect(academy.mages[String(lesson.student)]).toBeDefined();
        }
      }
    }
  });

  it('never leaves a college with a library it cannot describe', () => {
    // `hasLibrary` false and a non-empty shelf would mean the shelf was
    // attributed to a library that is not this one — the join going wrong in
    // the direction that still renders.
    for (const [i, frame] of recording.frames.entries()) {
      for (const dossier of Object.values(frame.academy.universities)) {
        if (!dossier.college.hasLibrary) {
          expect(dossier.shelf, `frame ${String(i)} shelves books in no library`).toEqual([]);
        }
      }
    }
  });
});
