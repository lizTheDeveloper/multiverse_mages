/*
 * Multiverse Mages — two god-agency tests that close partial OpenSpec tasks.
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
 * Task 5.10: an ascended universe's snapshot hash is unchanged by further
 * stepping — `frozenWhenTerminal` must suppress every system, leaving the
 * state byte-identical.
 *
 * Task 6.8: a seeded archive (from prestige legacy) carries no protective
 * flag, and burning it removes the corresponding advantage — the archive is
 * burnable, lootable stock, not a permanent fixture.
 */

import { describe, expect, it } from 'vitest';

import type { SimState } from '@mm/sim-core';
import {
  encodeSnapshot,
  hashBytes,
  rngFromRootSeed,
  snapshotHash,
  stateToEnvelope,
  step,
} from '@mm/sim-core';
import {
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  TERMINAL_REASON,
  UNIVERSE,
  collectRecords,
  componentOf,
  findUniverse,
} from '@mm/state';
import type { LegacyRecord, ReferenceOptions } from '@mm/scenario';
import {
  LEGACY_RECORD_SCHEMA,
  REFERENCE_SCENARIO_ID,
  buildReferenceState,
  referenceContent,
} from '@mm/scenario';
import { defineWorldSimulation, legacyGrant, resolveGodContent } from '@mm/coordination';
import { destroyGrimoire, KnowledgeSubsystem } from '@mm/rules-magic';

// ---- shared fixtures --------------------------------------------------------

const content = referenceContent();
const C = resolveGodContent(content.registry).constants;
const simulation = defineWorldSimulation(content.deps);

const SEED = 0x0005_0010;

const OPTIONS: ReferenceOptions = Object.freeze({
  cohortSize: 4,
  foundingMages: 1,
  foundingNodes: 1,
  foundingSpeciesMask: 0,
  foundingPortalMagic: 0,
  foundingUniversities: 1,
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

/** A maximal legacy record at the prestige cap. */
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

// ---- Task 5.10: ascended hash immutability ----------------------------------

/**
 * Hash of the world content — entities and components — with the clock zeroed
 * out so that `advanceClock` (which runs unconditionally inside `step`) does
 * not obscure the real question: did anything the *systems* touch change?
 *
 * `step()` always increments `worldTick` and `stepOrdinal`, so
 * `snapshotHash(state)` changes on every call even when every system skips.
 * Stripping the clock isolates the part of the state that the three systems
 * (world, god-intervention, god-outcome) are responsible for, and that is
 * what `frozenWhenTerminal` must hold still.
 */
function worldContentHash(state: SimState): string {
  const envelope = stateToEnvelope(state);
  const frozen = {
    ...envelope,
    clock: { worldTick: 0, engagementTick: 0, stepOrdinal: 0, mode: 0 },
  };
  return hashBytes(encodeSnapshot(frozen));
}

describe('an ascended universe is frozen: its world content does not move', () => {
  it('produces the same world-content hash after further stepping when terminalReason is set', () => {
    // Build a universe, advance it a few ticks so the state is non-trivial,
    // then mark it ascended by writing the terminal reason directly onto
    // the universe row — the same field `frozenWhenTerminal` checks.
    const state = advance(build(), 12);
    const universe = findUniverse(state);
    expect(universe).not.toBe(0);

    // Write the ascension termination.
    const universeStore = componentOf(state, UNIVERSE);
    universeStore.set(universe, 'terminalReason', TERMINAL_REASON.ascensionApotheosis);
    universeStore.set(universe, 'ascended', 1);

    // Take the world-content hash at the moment of ascension.
    const hashAtAscension = worldContentHash(state);

    // Step the universe several more ticks. All three systems — world
    // (via `frozenWhenTerminal`), god-intervention and god-outcome — skip
    // when `terminalReason` is non-zero, so none of them should change
    // entity or component state.
    const steppedFurther = advance(state, 6);
    const hashAfterStepping = worldContentHash(steppedFurther);

    expect(hashAfterStepping).toBe(hashAtAscension);
  });

  it('the clock does advance, proving the step actually ran', () => {
    // Positive control: the clock portion *does* change after stepping,
    // which proves that the frozen hash equality above is not vacuous.
    const state = advance(build(), 12);
    const universe = findUniverse(state);
    componentOf(state, UNIVERSE).set(
      universe,
      'terminalReason',
      TERMINAL_REASON.ascensionApotheosis,
    );
    componentOf(state, UNIVERSE).set(universe, 'ascended', 1);

    const fullHashBefore = snapshotHash(state);
    const steppedFurther = advance(state, 6);
    const fullHashAfter = snapshotHash(steppedFurther);

    // The full snapshot hash differs because the clock advanced.
    expect(fullHashAfter).not.toBe(fullHashBefore);
  });

  it('is distinct from stepping the same universe without ascension', () => {
    // Positive control: without the terminal flag, stepping *does* change
    // the world content hash. This proves the ascended-hash test above is
    // not passing because stepping never does anything.
    const state = advance(build(), 12);
    const hashBefore = worldContentHash(state);
    const hashAfter = worldContentHash(advance(state, 6));
    expect(hashAfter).not.toBe(hashBefore);
  });
});

// ---- Task 6.8: burnable seeded archive --------------------------------------

describe('a seeded archive is burnable stock, not a protected fixture', () => {
  it('carries no protective flag: durability is ordinary, holder is a library', () => {
    const seeded = build(maxRecord());

    // The archive creates grimoires in the founding library. Every archive
    // grimoire must be at the library, with `HOLDER_KIND.library`, and with
    // positive durability — never a special "protective" or "indestructible"
    // marker.
    const library = collectRecords(seeded, LIBRARY)
      .map(({ handle }) => handle)
      .sort((a, b) => a - b)[0];
    expect(library).toBeDefined();

    const archiveGrimoires = collectRecords(seeded, GRIMOIRE).filter(
      ({ row }) => row.holderKind === HOLDER_KIND.library && row.holderId === library,
    );
    expect(archiveGrimoires.length).toBeGreaterThan(0);

    for (const { row } of archiveGrimoires) {
      // Durability is finite and positive, not infinity or a sentinel.
      expect(row.durability).toBeGreaterThan(0);
      expect(Number.isFinite(row.durability)).toBe(true);
      // Holder kind is library — no special "protected" flag exists on the
      // component, and the holder is an ordinary library.
      expect(row.holderKind).toBe(HOLDER_KIND.library);
    }
  });

  it('burning removes the corresponding knowledge instance', () => {
    const seeded = build(maxRecord());
    const nodeCount = content.deps.catalog.nodeCount;

    // Count archive grimoires before burning.
    const library = collectRecords(seeded, LIBRARY)
      .map(({ handle }) => handle)
      .sort((a, b) => a - b)[0]!;
    const archiveGrimoires = collectRecords(seeded, GRIMOIRE).filter(
      ({ row }) => row.holderKind === HOLDER_KIND.library && row.holderId === library,
    );
    const grimoiresBefore = archiveGrimoires.length;
    expect(grimoiresBefore).toBeGreaterThan(0);

    // Count library-located knowledge instances before burning.
    const instancesBefore = collectRecords(seeded, KNOWLEDGE_INSTANCE).filter(
      ({ row }) => row.locationKind === LOCATION_KIND.library && row.locationId === library,
    ).length;
    expect(instancesBefore).toBe(grimoiresBefore);

    // Burn the first archive grimoire — the same `destroyGrimoire` that
    // `settleLibrary` in `consequences.ts` calls during a raid.
    const target = archiveGrimoires[0]!;
    const knowledge = KnowledgeSubsystem.fromState(seeded, nodeCount);
    destroyGrimoire(knowledge, target.handle, 1);

    // The grimoire and its paired instance are both gone.
    const grimairesAfter = collectRecords(seeded, GRIMOIRE).filter(
      ({ row }) => row.holderKind === HOLDER_KIND.library && row.holderId === library,
    ).length;
    expect(grimairesAfter).toBe(grimoiresBefore - 1);

    const instancesAfter = collectRecords(seeded, KNOWLEDGE_INSTANCE).filter(
      ({ row }) => row.locationKind === LOCATION_KIND.library && row.locationId === library,
    ).length;
    expect(instancesAfter).toBe(instancesBefore - 1);
  });

  it('a control universe without legacy has fewer grimoires than a seeded one', () => {
    // Positive control for the archive channel: a seeded universe holds more
    // books than a control. Without this, the archive tests above could pass
    // on a universe whose founding grant already produced the same books.
    const seeded = build(maxRecord());
    const control = build();

    const seededGrimoires = collectRecords(seeded, GRIMOIRE).length;
    const controlGrimoires = collectRecords(control, GRIMOIRE).length;
    expect(seededGrimoires).toBeGreaterThan(controlGrimoires);
  });
});
