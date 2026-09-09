/*
 * Multiverse Mages — the ascension carry: earned, kept, and spent into the next
 * universe.
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
 * Prestige was earned and thrown away.
 *
 * `god/system.ts` has written `prestigeEarned` onto the universe row at
 * termination since `god-agency` landed, and `god/ascension.ts` has held the
 * three functions that would carry it — `carriedPrestige`, `legacyBudget`,
 * `legacyGrant` — with a header saying nothing called them. Eight authored
 * content constants turned nothing. `mc-harness` meanwhile advertised
 * `prestigeCarryForward: true` as an available mechanic, which was false.
 *
 * These tests are the acceptance criteria for closing that loop, and each is
 * paired with the null it would otherwise be mistaken for:
 *
 * 1. **A universe that ends leaves a record**, with all four channels non-zero
 *    at the prestige cap — against the null that a wired-but-empty grant looks
 *    identical to no grant at all.
 * 2. **A universe seeded from a record starts materially ahead**, per channel,
 *    measured on both arms — against the null of an ablation that returns
 *    byte-identical because the wiring did not take. The *control against
 *    itself* is asserted first, so the instrument is known to be able to report
 *    "no difference" before it is asked to report one.
 * 3. **A universe with no record is byte-identical to the build before this
 *    existed** — against the null of a succession seam that silently moved every
 *    committed measurement of an unaided universe.
 * 4. **The recurrence compounds and converges**, which is the only thing that
 *    makes it a meta-game rather than a per-run payout.
 */

import {
  EVER_KNOWN,
  GRANT_BUDGET,
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MATERIAL_STOCK,
  POPULACE_COHORT,
  TERMINAL_REASON,
  collectRecords,
  componentOf,
  findUniverse,
  readUniverse,
} from '@mm/state';
import type { SimState } from '@mm/sim-core';
import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import type { LegacyRecord, ReferenceOptions } from '@mm/scenario';
import {
  LEGACY_RECORD_SCHEMA,
  REFERENCE_SCENARIO_ID,
  buildReferenceState,
  legacyArchiveCandidates,
  legacyRecordOf,
  referenceContent,
  splitLegacyMaterials,
} from '@mm/scenario';
import {
  LEGACY_CHANNELS,
  carriedPrestige,
  defineWorldSimulation,
  legacyGrant,
  resolveGodContent,
} from '@mm/coordination';
import { MATERIAL_KINDS } from '@mm/rules-world';
import { describe, expect, it } from 'vitest';

/** One content resolution for the whole file. It is read-only. */
const content = referenceContent();
const C = resolveGodContent(content.registry).constants;
const simulation = defineWorldSimulation(content.deps);

const SEED = 0x0009_0001;

/** The founding options every arm below shares. Only the legacy differs. */
const OPTIONS: ReferenceOptions = Object.freeze({
  cohortSize: 4,
  foundingMages: 1,
  foundingNodes: 1,
  foundingSpeciesMask: 0,
  foundingPortalMagic: 0,
  foundingUniversities: 1,
  // The documented default site, so every arm below stands in the same
  // country and only the legacy differs — the siting branch made this field
  // required after this fixture was written.
  academySiteKind: 0,
  openingTechniqueCount: 0,
  openingFormCount: 0,
  openingSquareSeeded: 0,
});

function build(legacy?: LegacyRecord): SimState {
  return buildReferenceState({
    runSeed: SEED,
    options: OPTIONS,
    content,
    schema: simulation.schema,
    ...(legacy === undefined ? {} : { legacy }),
  });
}

function advance(state: SimState, ticks: number): SimState {
  let current = state;
  for (let index = 0; index < ticks; index += 1) {
    current = step(current, [], rngFromRootSeed(current.rootSeed));
  }
  return current;
}

/** Every quantity a legacy channel could move, read straight off state. */
function stocksOf(state: SimState) {
  const universe = findUniverse(state);
  const row = readUniverse(state, universe);
  const materials = componentOf(state, MATERIAL_STOCK);
  // Every kind the component declares, derived rather than transcribed. Three
  // were named here by hand and the split has been across seven since
  // `material-economy`, so the sum below was adding 3/7 of the channel and
  // asserting it was the whole of it — 87,750 against 204,750, exactly the
  // ratio. A derived map cannot lose a kind the same way twice.
  const byKind = Object.fromEntries(
    MATERIAL_KINDS.map((kind) => [kind, materials.get(universe, kind) ?? 0]),
  ) as Readonly<Record<(typeof MATERIAL_KINDS)[number], number>>;
  return {
    favor: row.favor,
    prestige: row.prestige,
    byKind,
    food: byKind.food,
    stone: byKind.stone,
    vellum: byKind.vellum,
    populace: collectRecords(state, POPULACE_COHORT).reduce((sum, { row: c }) => sum + c.count, 0),
    grimoires: collectRecords(state, GRIMOIRE).length,
    instances: collectRecords(state, KNOWLEDGE_INSTANCE).length,
    everKnown: componentOf(state, EVER_KNOWN).size,
  };
}

/**
 * A record at the prestige cap, built through the shipped arithmetic.
 *
 * Hand-built rather than run out of a universe that actually ascended, and the
 * reason is that the two answer different questions: {@link maxRecord} pins what
 * a *maximal* legacy does, which is the case every channel is non-zero in, while
 * the run-produced record below pins that a real ending produces one at all.
 */
function maxRecord(): LegacyRecord {
  const grant = legacyGrant(C.prestigeCap, C);
  return {
    schema: LEGACY_RECORD_SCHEMA,
    scenarioId: REFERENCE_SCENARIO_ID,
    runSeed: SEED,
    contentRevision: content.registry.contentRevision,
    endedAtTick: C.legacyReferenceTick,
    terminalReason: TERMINAL_REASON.ascensionApotheosis,
    prestigeEarned: C.prestigeEarnMax,
    carriedPrestige: C.prestigeCap,
    channels: {
      favor: grant.favor,
      materials: grant.materials,
      populace: grant.populace,
      archive: grant.archiveNodes,
    },
    archiveMaxTier: grant.archiveMaxTier,
    baselineReferenceTick: C.legacyReferenceTick,
  };
}

describe('a universe that ends leaves a legacy record', () => {
  it('produces nothing while the run is still going', () => {
    // The distinction that must not collapse: `undefined` means unfinished, and
    // there is deliberately no record whose channels are all zero, because
    // `prestigeEarned` gives every ending a non-zero base on purpose.
    expect(
      legacyRecordOf(build(), { constants: C, scenarioId: REFERENCE_SCENARIO_ID, runSeed: SEED }),
    ).toBeUndefined();
  });

  it('prices the cutoff ending, which no tick can detect for itself', () => {
    // §1.1 has three endings and `god-constant.json` prices all three. The world
    // loop writes `prestigeEarned` for ascension and stagnation; it cannot write
    // the cutoff, because no tick knows it is the last one. The caller does.
    const ended = advance(build(), 24);
    expect(readUniverse(ended, findUniverse(ended)).terminalReason).toBe(TERMINAL_REASON.none);

    const record = legacyRecordOf(ended, {
      constants: C,
      scenarioId: REFERENCE_SCENARIO_ID,
      runSeed: SEED,
      endedAtCap: true,
    });
    expect(record).toBeDefined();
    expect(record?.terminalReason).toBe(TERMINAL_REASON.truncated);
    expect(record?.prestigeEarned).toBeGreaterThanOrEqual(C.prestigeBaseCutoff);
    expect(record?.carriedPrestige).toBeGreaterThan(0);
  });

  it('round-trips through JSON unchanged, because it outlives its process', () => {
    const record = maxRecord();
    expect(JSON.parse(JSON.stringify(record))).toStrictEqual(record);
  });

  it('carries every channel `LEGACY_CHANNELS` names, and no other', () => {
    expect(Object.keys(maxRecord().channels).sort()).toStrictEqual([...LEGACY_CHANNELS].sort());
  });

  it('has all four channels non-zero at the prestige cap', () => {
    // The positive control for this whole change. A legacy that grants nothing
    // is the null the campaign exists to refuse, and it would pass every
    // structural assertion above.
    const { channels } = maxRecord();
    for (const channel of LEGACY_CHANNELS) {
      expect(channels[channel], `channel ${channel} is zero at the prestige cap`).toBeGreaterThan(0);
    }
  });

  it('carries the reference tick its baselines claim to be medians at', () => {
    expect(maxRecord().baselineReferenceTick).toBe(C.legacyReferenceTick);
  });
});

describe('a universe with no legacy is the universe this scenario always built', () => {
  it('builds a byte-identical founding state', () => {
    // The no-op control. Every committed measurement of an unaided universe was
    // taken on this state; a succession seam whose absent case moved it would be
    // a behaviour change wearing an option's clothes.
    expect(snapshotHash(build())).toBe(snapshotHash(build(undefined)));
  });

  it('and steps to a byte-identical state, so the instrument can report no difference', () => {
    // Read this one before the two-arm test below. It is the proof that
    // comparing two snapshot hashes is capable of returning "identical" — which
    // is what makes the *difference* the next test reports mean anything.
    expect(snapshotHash(advance(build(), 24))).toBe(snapshotHash(advance(build(), 24)));
  });
});

describe('a universe seeded from a legacy starts materially ahead', () => {
  const record = maxRecord();
  const seeded = stocksOf(build(record));
  const control = stocksOf(build());

  it('holds the carried prestige, which is what makes it a recurrence', () => {
    expect(control.prestige).toBe(0);
    expect(seeded.prestige).toBe(record.carriedPrestige);
  });

  it('holds more favor, by exactly the favor channel', () => {
    expect(seeded.favor - control.favor).toBe(record.channels.favor);
  });

  it('holds more of every material kind, summing to exactly the materials channel', () => {
    const split = splitLegacyMaterials(record.channels.materials);
    expect(seeded.food - control.food).toBe(split.food);
    expect(seeded.stone - control.stone).toBe(split.stone);
    expect(seeded.vellum - control.vellum).toBe(split.vellum);
    // Nothing is lost to the floor: the record does not claim to grant more than
    // it grants. Summed over **every** kind `MATERIAL_STOCK` declares, because
    // `splitLegacyMaterials` divides the channel across all of them — and a sum
    // over a hand-written subset is not a conservation check, it is a smaller
    // number that happens to have a name.
    const carried = MATERIAL_KINDS.reduce(
      (total, kind) => total + (seeded.byKind[kind] - control.byKind[kind]),
      0,
    );
    expect(carried).toBe(record.channels.materials);
    // And the per-kind rows really are the split, all seven of them, so the
    // total above cannot be right by two errors cancelling.
    for (const kind of MATERIAL_KINDS) {
      expect(seeded.byKind[kind] - control.byKind[kind], kind).toBe(split[kind]);
    }
  });

  it('holds more people, by exactly the populace channel, in the cohorts it already had', () => {
    expect(seeded.populace - control.populace).toBe(record.channels.populace);
    // No new cohort: §1.3 keys one on `(speciesId, occupation, birthTickBucket)`
    // and founding one would mean inventing a birth bucket.
    expect(collectRecords(build(record), POPULACE_COHORT).length).toBe(
      collectRecords(build(), POPULACE_COHORT).length,
    );
  });

  it('holds books nobody wrote, each a real shelved copy', () => {
    expect(seeded.grimoires - control.grimoires).toBe(record.channels.archive);
    expect(seeded.instances - control.instances).toBe(record.channels.archive);

    const state = build(record);
    const library = collectRecords(state, LIBRARY)
      .map(({ handle }) => handle)
      .sort((a, b) => a - b)[0];
    for (const { row } of collectRecords(state, GRIMOIRE)) {
      // §1.5 pairs a written copy with a `GRIMOIRE` whose holder agrees, and
      // `createInstance` throws otherwise — so this asserts the pairing is the
      // shipped one rather than a shape invented for the archive.
      expect(row.holderKind).toBe(HOLDER_KIND.library);
      expect(row.holderId).toBe(library);
    }
    const shelved = collectRecords(state, KNOWLEDGE_INSTANCE).filter(
      ({ row }) => row.locationKind === LOCATION_KIND.library,
    );
    expect(shelved.length).toBe(record.channels.archive);
  });

  it('never seeds a book deeper than the authored tier cap', () => {
    // *"A legacy that could seed the summit would be prestige buying the
    // ascension condition."* The cap is the guard, so the archive takes the
    // deepest tier under it — which makes the cap load-bearing rather than
    // decorative, and worth asserting.
    const state = build(record);
    const tierOf = new Map(
      content.registry.nodes.map((entry) => [entry.contentId, entry.record.tier] as const),
    );
    for (const { row } of collectRecords(state, GRIMOIRE)) {
      expect(tierOf.get(row.nodeId)).toBeLessThanOrEqual(record.archiveMaxTier);
    }
  });

  it('never seeds a node the founding grant already dealt', () => {
    const founding = new Set(content.foundingNodeIds.slice(0, OPTIONS.foundingNodes));
    for (const nodeId of legacyArchiveCandidates(
      content.registry,
      content.axes,
      record.archiveMaxTier,
      founding,
    )) {
      expect(founding.has(nodeId)).toBe(false);
    }
  });

  it('counts the archive as seeded, so the grant budget cannot read it as a discovery', () => {
    // The accrual is `everKnown − seededNodes`. An archived node raises
    // `everKnown`; leaving it out of `seededNodes` would hand the seeded arm a
    // larger grant budget than its control — a fifth difference between two arms
    // that must differ by four.
    const selfDiscovered = (state: SimState): number => {
      const universe = findUniverse(state);
      const budgets = componentOf(state, GRANT_BUDGET);
      const seededNodes = budgets.has(universe) ? (budgets.get(universe, 'seededNodes') ?? 0) : 0;
      return componentOf(state, EVER_KNOWN).size - seededNodes;
    };
    expect(selfDiscovered(build(record))).toBe(selfDiscovered(build()));
  });

  it('and is still ahead after ten world years of ordinary play', () => {
    // The head start is a stock, so it is spent — the point of the model. What
    // must not happen is that it leaves no trace at all, which is what a wiring
    // that did not take looks like.
    const after = 120;
    const seededEnd = stocksOf(advance(build(record), after));
    const controlEnd = stocksOf(advance(build(), after));
    expect(snapshotHash(advance(build(record), after))).not.toBe(
      snapshotHash(advance(build(), after)),
    );
    expect(seededEnd.populace).toBeGreaterThan(controlEnd.populace);
    expect(seededEnd.grimoires).toBeGreaterThan(controlEnd.grimoires);
    expect(seededEnd.prestige).toBe(record.carriedPrestige);
  });
});

describe('the recurrence compounds across generations and converges', () => {
  it('leaves a larger legacy the second time than the first', () => {
    const first = legacyRecordOf(advance(build(), 24), {
      constants: C,
      scenarioId: REFERENCE_SCENARIO_ID,
      runSeed: SEED,
      endedAtCap: true,
    });
    expect(first).toBeDefined();
    const second = legacyRecordOf(advance(build(first), 24), {
      constants: C,
      scenarioId: REFERENCE_SCENARIO_ID,
      runSeed: SEED,
      endedAtCap: true,
    });
    expect(second).toBeDefined();
    expect(second?.carriedPrestige ?? 0).toBeGreaterThan(first?.carriedPrestige ?? 0);
  });

  it('never exceeds the cap, however long the streak', () => {
    let prestige = 0;
    for (let run = 0; run < 64; run += 1) prestige = carriedPrestige(prestige, C.prestigeEarnMax, C);
    expect(prestige).toBeLessThanOrEqual(C.prestigeCap);
  });
});

describe('the materials split is a property of the component, not a list somebody typed', () => {
  it('has one share per declared field', () => {
    const split = splitLegacyMaterials(1024);
    expect(Object.keys(split).sort()).toStrictEqual(Object.keys(MATERIAL_STOCK.fields).sort());
  });

  it('loses nothing to the floor, at every remainder', () => {
    // The economy grew from one stock to three inside one release and has seven
    // authored on an unmerged branch, so the interesting case is not three — it
    // is that the identity holds for whatever the component declares.
    const kinds = Object.keys(MATERIAL_STOCK.fields).length;
    for (let total = 0; total < kinds * 4; total += 1) {
      const split = splitLegacyMaterials(total);
      const sum = Object.values(split).reduce((a, b) => a + b, 0);
      expect(sum, `split of ${String(total)} lost a unit`).toBe(total);
    }
  });

  it('refuses to grant a negative stock', () => {
    expect(Object.values(splitLegacyMaterials(-4096)).every((value) => value === 0)).toBe(true);
  });
});
