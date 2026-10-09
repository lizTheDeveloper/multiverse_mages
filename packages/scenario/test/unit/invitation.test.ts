/*
 * Multiverse Mages — action 16's roster is the species a reachable universe holds.
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
 * The rules-side half of the author's rule of 2026-10-08 (*"inter-universal
 * travel is the only way to get multiple races"*), and the reason the headless
 * build did not have to change.
 *
 * The session can only ask for a species its candidate list holds — action
 * parameters are slots — so these tests call `step` directly with raw species
 * ids, which is the one door the mask cannot guard. The lobby-side tests are in
 * `packages/lobby/test/unit/invitation.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION } from '@mm/agent-api';
import { defineWorldSimulation } from '@mm/coordination';
import { rngFromRootSeed, step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import { captureRuleset, findUniverse } from '@mm/state';

import {
  invitationSources,
  reachableSpecies,
  referenceContent,
  referenceScenario,
  speciesAliveIn,
  speciesTable,
} from '../../src/index.js';
import type { PeerPortals } from '../../src/index.js';
import { buildRival, portalTargetIds, readRivalConstants } from '../../src/rival-universe.js';

const content = referenceContent();
const { ids } = speciesTable(content.registry);
const speciesId = (id: string): number => content.registry.species.find((e) => e.record.id === id)!.contentId;
const HUMAN = speciesId('human');
const ELF = speciesId('elf');
const DWARF = speciesId('dwarf');
const ALL = [...ids].sort((a, b) => a - b);

/** A human-only founding that holds a portal node, sized like a lobby universe. */
const CONFIG = {
  worldTickCap: 4000,
  options: {
    foundingSpeciesMask: 1 << ids.indexOf(HUMAN),
    foundingPortalMagic: 1,
    foundingMages: 12,
    cohortSize: 24,
  },
} as const;

/** A seat stub whose universe holds exactly `held`. */
function seatHolding(held: readonly number[]): PeerPortals {
  return { seats: [1], participant: () => undefined, speciesIn: () => held };
}

/**
 * `ticks` months asking for `ask` by raw id every month, past the mask. Returns
 * every species the universe was seen holding.
 */
function askEveryMonth(state: SimState, ask: number, ticks: number): { state: SimState; seen: number[] } {
  const seen = new Set<number>(speciesAliveIn(state));
  let current = state;
  for (let t = 0; t < ticks; t += 1) {
    current = step(current, [{ kind: GOD_ACTION.inviteScholar, params: [ask] }], rngFromRootSeed(current.rootSeed));
    for (const id of speciesAliveIn(current)) seen.add(id);
  }
  return { state: current, seen: [...seen].sort((a, b) => a - b) };
}

describe('action 16 asked directly, past the mask', () => {
  it('refuses a species no seat holds, and admits the one a seat does', () => {
    const run = referenceScenario(content, { peers: seatHolding([ELF]) });
    const founded = run.scenario.create(3, CONFIG);
    expect(speciesAliveIn(founded)).toEqual([HUMAN]);

    const refused = askEveryMonth(founded, DWARF, 120);
    expect(refused.seen).toEqual([HUMAN]);

    // The positive control: the same founding, a reachable species, and she
    // comes. Asked from the founding rather than after the 120 refused months
    // because action 16 also needs a *usable* portal node (#251), and with no
    // raider to drill it the founders' node decays below the activation
    // threshold inside those months — the case pinned just below.
    const admitted = askEveryMonth(founded, ELF, 120);
    expect(admitted.seen).toEqual([HUMAN, ELF].sort((a, b) => a - b));

    // Both conditions, and the second one bites: the same reachable species,
    // asked after the portal node has decayed below use, does not come.
    const decayed = askEveryMonth(refused.state, ELF, 120);
    expect(decayed.seen).toEqual([HUMAN]);
  });

  it('refuses every species in a universe with no portal at all', () => {
    const run = referenceScenario(content, { raids: false });
    const founded = run.scenario.create(3, CONFIG);
    let state = founded;
    for (const ask of ALL) state = askEveryMonth(state, ask, 20).state;
    expect(speciesAliveIn(state)).toEqual([HUMAN]);
  });

  it('offers the raidless scenario no roster at all', () => {
    expect(referenceScenario(content, { raids: false }).scenario.invitableSpecies).toBeUndefined();
  });
});

describe('the roster', () => {
  it('is the union of what the seats hold, each with the lowest seat holding it', () => {
    const peers: PeerPortals = {
      seats: [3, 1, 2],
      participant: () => undefined,
      speciesIn: (seat) => (seat === 1 ? [ELF] : seat === 2 ? undefined : [DWARF, ELF]),
    };
    expect(invitationSources(peers)).toEqual(
      [
        { speciesId: ELF, seat: 1 },
        { speciesId: DWARF, seat: 3 },
      ].sort((a, b) => a.speciesId - b.speciesId),
    );
    expect(reachableSpecies(peers)).toEqual([DWARF, ELF].sort((a, b) => a - b));
  });

  it('is read live from the scenario with peers, and static without', () => {
    const held: number[] = [];
    const live = referenceScenario(content, { peers: { ...seatHolding(held), speciesIn: () => held } }).scenario;
    expect(live.invitableSpecies).toBeUndefined();
    expect(live.invitableSpeciesNow?.()).toEqual([]);
    held.push(ELF);
    expect(live.invitableSpeciesNow?.()).toEqual([ELF]);

    const headless = referenceScenario(content).scenario;
    expect(headless.invitableSpeciesNow).toBeUndefined();
    expect([...(headless.invitableSpecies ?? [])].sort((a, b) => a - b)).toEqual(ALL);
  });

  /**
   * Why the headless roster is still every species. Its portal targets are the
   * stand-in rivals, and the rule admits a species a reachable universe holds:
   * if a stand-in ever stopped holding all six, the static roster would be
   * breaking the rule in every baseline, and this is where that shows up.
   */
  it('headless: every stand-in rival holds every species', () => {
    const schema = defineWorldSimulation(content.deps).schema;
    const constants = readRivalConstants(content.registry);
    for (const runSeed of [1, 2, 0xdead_beef]) {
      const host = referenceScenario(content, { raids: false }).scenario.create(runSeed, { worldTickCap: 1 });
      const ruleset = captureRuleset(host, findUniverse(host));
      for (const targetId of portalTargetIds(constants)) {
        const rival = buildRival({
          runSeed,
          targetId,
          content,
          schema,
          hostTraditionId: ruleset.traditionId,
          constants,
          localRuleset: ruleset,
        });
        expect(speciesAliveIn(rival.participant.world)).toEqual(ALL);
      }
    }
  });
});
