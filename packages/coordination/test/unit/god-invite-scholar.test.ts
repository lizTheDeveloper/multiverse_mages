/*
 * Multiverse Mages — action 16: what an alliance costs, what it refuses, and
 * what arrives.
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
 * ## What these tests are guarding, and it is not "the code runs"
 *
 * Action 16 exists because `ages-of-magic.md` §2f wants visiting mages and
 * `contracts.md` §1.1 leaves no second realm to get them from. Three of its
 * properties are load-bearing in a way a reader would not guess, and each has a
 * test here because each would fail silently:
 *
 * 1. **The arriving scholar's personality is rolled from *her own* species.**
 *    If it came from the host's, the mechanic would be defeated in the exact
 *    case it was built for: draconic imports a gnome precisely to get a
 *    curiosity of 1792 into a universe whose own is 256, and a host-rolled
 *    personality would hand it a gnome-shaped dragon. Nothing about the run
 *    would look wrong.
 * 2. **A species already living here is refused.** This is the only thing
 *    standing between "an alliance" and "free immigration", and free
 *    immigration would help every species equally — which is to say it would
 *    not have made dragons special at all.
 * 3. **The portal gate holds.** The owner's design is that portal magic is how
 *    a civilization stops being alone.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { TIME_MODE, createState, rngFromRootSeed } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  UNIVERSE,
  attachRecord,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  readRecord,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import type { InterventionDeps } from '../../src/index.js';
import { ACTION, resolveInterventions } from '../../src/index.js';

import { catalogAndCells, registry } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
const SCHEMA = defineWorldStateSchema([]);

/** Tick-bound randomness. Tick 0, because no assertion here is about the tick. */
const RNG = {
  rootSeed: 1,
  stream: (subsystemId: number) => rngFromRootSeed(1).stream(subsystemId, 0),
  actorStream: (subsystemId: number, actorKey: number) =>
    rngFromRootSeed(1).actorStream(subsystemId, 0, actorKey),
};

/** Every species the shipped table declares, ascending by interned id. */
function speciesIds(): readonly number[] {
  return registry()
    .species.map((entry) => entry.contentId)
    .sort((a, b) => a - b);
}

function speciesOf(speciesId: number) {
  return registry().species.find((entry) => entry.contentId === speciesId)?.record;
}

/** The first node carrying the `portal` primitive. */
function portalNodeId(): number {
  const first = [...nodesCarrying('portal').keys()].sort((a, b) => a - b)[0];
  if (first === undefined) throw new Error('Shipped content declares no portal node.');
  return first;
}

interface Bench {
  readonly state: SimState;
  readonly mages: readonly EntityHandle[];
  readonly deps: InterventionDeps;
}

/**
 * A universe with one mage, one university, and enough favor.
 *
 * `portalMagic` decides whether that mage holds a portal node — the whole of
 * the gate, and the only difference between the two halves of the first pair of
 * tests below.
 */
function bench(options: { portalMagic: boolean; roster?: readonly number[] }): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000, mages: 1, completedUniversities: 1 });
  const { catalog, cells } = catalogAndCells();

  if (options.portalMagic) {
    const holder = world.mages[0];
    if (holder === undefined) throw new Error('The fixture promised a mage.');
    const instance = world.state.entities.create();
    attachRecord(world.state, KNOWLEDGE_INSTANCE, instance, {
      nodeId: portalNodeId(),
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      mastery: 1024,
      acquiredTick: 0,
    });
  }

  return {
    state: world.state,
    mages: world.mages,
    deps: {
      god: { constants: C, costs: COSTS },
      catalog,
      cells,
      knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
      edictBudgetMax: 8,
      portalNodes: new Set(nodesCarrying('portal').keys()),
      invitableSpecies: new Set(options.roster ?? speciesIds()),
      speciesOf,
      rng: RNG,
      requestEngagement: () => {
        /* action 16 never asks for engagement. */
      },
    },
  };
}

/** Resolves one invitation of `speciesId` and reports what the tick did. */
function invite(state: SimState, deps: InterventionDeps, speciesId: number) {
  return resolveInterventions(
    state,
    [{ kind: ACTION.inviteScholar, params: [speciesId] }],
    100,
    TIME_MODE.world,
    deps,
  );
}

/** Living mages of a species, by handle. */
function livingOf(state: SimState, speciesId: number): EntityHandle[] {
  return collectRecords(state, MAGE)
    .filter(({ row }) => row.alive !== 0 && row.speciesId === speciesId)
    .map(({ handle }) => handle);
}

/** The species the fixture's founding mage belongs to. */
function residentSpecies(state: SimState): number {
  const first = collectRecords(state, MAGE).find(({ row }) => row.alive !== 0);
  if (first === undefined) throw new Error('The fixture promised a living mage.');
  return first.row.speciesId;
}

/** A species that is not the resident one. */
function foreignSpecies(state: SimState): number {
  const resident = residentSpecies(state);
  const other = speciesIds().find((id) => id !== resident);
  if (other === undefined) throw new Error('Shipped content declares only one species.');
  return other;
}

describe('action 16: the portal gate', () => {
  it('refuses every invitation while no mage holds portal magic', () => {
    const { state, deps } = bench({ portalMagic: false });
    const guest = foreignSpecies(state);

    const report = invite(state, deps, guest);

    expect(report.applied).toBe(0);
    expect(report.refused).toBe(1);
    expect(livingOf(state, guest)).toHaveLength(0);
  });

  it('admits one once a living mage holds a permitted portal node', () => {
    const { state, deps } = bench({ portalMagic: true });
    const guest = foreignSpecies(state);

    const report = invite(state, deps, guest);

    expect(report.applied).toBe(1);
    expect(livingOf(state, guest)).toHaveLength(1);
  });
});

describe('action 16: who may be invited', () => {
  it('refuses a species that already has a living mage here', () => {
    const { state, deps } = bench({ portalMagic: true });
    const resident = residentSpecies(state);

    const report = invite(state, deps, resident);

    // The whole difference between an alliance and free immigration. A universe
    // may import the kind of academic it lacks and may never import a second
    // copy of itself.
    expect(report.applied).toBe(0);
    expect(livingOf(state, resident)).toHaveLength(1);
  });

  it('refuses a species no ally would send, even when the gate is open', () => {
    const { state, deps } = bench({ portalMagic: true, roster: [] });

    const report = invite(state, deps, foreignSpecies(state));

    expect(report.applied).toBe(0);
  });

  it('refuses a second scholar of a species it has just admitted', () => {
    const { state, deps } = bench({ portalMagic: true });
    const guest = foreignSpecies(state);

    expect(invite(state, deps, guest).applied).toBe(1);
    expect(invite(state, deps, guest).applied).toBe(0);
    expect(livingOf(state, guest)).toHaveLength(1);
  });
});

describe('action 16: what arrives', () => {
  it('is a living, affiliated mage of the invited species, adult on arrival', () => {
    const { state, deps } = bench({ portalMagic: true });
    const guest = foreignSpecies(state);

    invite(state, deps, guest);

    const [handle] = livingOf(state, guest);
    if (handle === undefined) throw new Error('No scholar arrived.');
    const row = readRecord(state, MAGE, handle);

    expect(row.alive).not.toBe(0);
    expect(row.speciesId).toBe(guest);
    // Hosted, not merely resident: an unaffiliated mage's scribe throughput is
    // zero, so a guest with no university could never put anything in a library.
    expect(row.universityId).not.toBe(0);
    // Born `maturityMonths` before arrival, so she can work the tick she lands.
    // For draconic — maturity 3,600 against a 2,400-tick horizon — a scholar who
    // had to grow up here would never work at all.
    const species = speciesOf(guest);
    expect(row.birthTick).toBe(100 - (species?.maturityMonths ?? 0));
    expect(row.maxVigor).toBeGreaterThan(0);
  });

  it('rolls her personality around her own curiosity, not her hosting universe’s', () => {
    // The test the coordinator asked for by name. Run the same invitation once
    // per foreign species and check each arrival lands within the personality
    // roll's bounded deviation of *that* species' declared curiosity. A
    // host-rolled personality would put every arrival in one narrow band around
    // the resident's mean instead, and nothing else in the run would look wrong.
    const deviation = 256;

    for (const guest of speciesIds()) {
      const { state, deps } = bench({ portalMagic: true });
      if (guest === residentSpecies(state)) continue;

      invite(state, deps, guest);

      const [handle] = livingOf(state, guest);
      if (handle === undefined) throw new Error(`No scholar arrived for species ${String(guest)}.`);
      const row = readRecord(state, MAGE, handle);
      const declared = speciesOf(guest)?.curiosity ?? 0;

      expect(Math.abs(row.curiosity - declared)).toBeLessThanOrEqual(deviation);
    }
  });

  it('charges the authored price exactly once', () => {
    const { state, deps } = bench({ portalMagic: true });
    const universe = collectRecords(state, UNIVERSE)[0];
    if (universe === undefined) throw new Error('The fixture promised a universe.');
    const opening = componentOf(state, UNIVERSE).get(universe.handle, 'favor');

    const report = invite(state, deps, foreignSpecies(state));

    expect(report.spentByAction[ACTION.inviteScholar]).toBe(COSTS.byAction[ACTION.inviteScholar]);
    expect(componentOf(state, UNIVERSE).get(universe.handle, 'favor')).toBe(
      opening - (COSTS.byAction[ACTION.inviteScholar] ?? 0),
    );
  });

  it('refuses when the universe cannot afford her, and takes nothing', () => {
    const world = godWorld(SCHEMA, { favor: 1, mages: 1, completedUniversities: 1 });
    const { catalog, cells } = catalogAndCells();
    const holder = world.mages[0];
    if (holder === undefined) throw new Error('The fixture promised a mage.');
    const instance = world.state.entities.create();
    attachRecord(world.state, KNOWLEDGE_INSTANCE, instance, {
      nodeId: portalNodeId(),
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      mastery: 1024,
      acquiredTick: 0,
    });
    const deps: InterventionDeps = {
      god: { constants: C, costs: COSTS },
      catalog,
      cells,
      knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
      edictBudgetMax: 8,
      portalNodes: new Set(nodesCarrying('portal').keys()),
      invitableSpecies: new Set(speciesIds()),
      speciesOf,
      rng: RNG,
      requestEngagement: () => {
        /* unused */
      },
    };

    const guest = foreignSpecies(world.state);
    const report = invite(world.state, deps, guest);

    expect(report.applied).toBe(0);
    expect(livingOf(world.state, guest)).toHaveLength(0);
  });
});

describe('action 16: a universe with no host', () => {
  it('refuses when there is no university to receive her', () => {
    const world = godWorld(SCHEMA, { favor: 1_000_000, mages: 1, completedUniversities: 0 });
    const { catalog, cells } = catalogAndCells();
    const holder = world.mages[0];
    if (holder === undefined) throw new Error('The fixture promised a mage.');
    const instance = world.state.entities.create();
    attachRecord(world.state, KNOWLEDGE_INSTANCE, instance, {
      nodeId: portalNodeId(),
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      mastery: 1024,
      acquiredTick: 0,
    });
    const deps: InterventionDeps = {
      god: { constants: C, costs: COSTS },
      catalog,
      cells,
      knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
      edictBudgetMax: 8,
      portalNodes: new Set(nodesCarrying('portal').keys()),
      invitableSpecies: new Set(speciesIds()),
      speciesOf,
      rng: RNG,
      requestEngagement: () => {
        /* unused */
      },
    };

    expect(invite(world.state, deps, foreignSpecies(world.state)).applied).toBe(0);
  });
});

describe('action 16: determinism', () => {
  it('produces an identical arrival from an identical world', () => {
    // The property `contracts.md` §6 buys by keying stream 1 on the arriving
    // mage's own handle. Two worlds built the same way must not merely both
    // succeed — they must agree on who walked through the door.
    const first = bench({ portalMagic: true });
    const second = bench({ portalMagic: true });
    const guest = foreignSpecies(first.state);

    invite(first.state, first.deps, guest);
    invite(second.state, second.deps, guest);

    const rowOf = (state: SimState) => {
      const [handle] = livingOf(state, guest);
      if (handle === undefined) throw new Error('No scholar arrived.');
      return readRecord(state, MAGE, handle);
    };

    expect(rowOf(first.state)).toEqual(rowOf(second.state));
  });
});

describe('the state a fresh universe is in', () => {
  it('has no scholar to invite anywhere, because nothing holds portal magic yet', () => {
    // Guards the measurement's premise rather than the code: if a founding
    // position ever ships already holding a portal node, the gate stops being a
    // gate and the branch's whole finding about content placement changes.
    const state = createState({
      rootSeed: 7,
      schema: SCHEMA,
      contentRevision: registry().contentRevision,
    });
    expect(collectRecords(state, MAGE)).toHaveLength(0);
  });
});
