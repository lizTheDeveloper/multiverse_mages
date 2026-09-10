/*
 * Multiverse Mages — 10,000-raid Monte Carlo sweep: zero forbidden casts, zero
 * stability violations.
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
 * Task 10.4: run 10,000 raids from random seeds and assert two invariants:
 *
 * 1. **Zero forbidden casts resolved.** `forbiddenCastsBlocked` aggregates to
 *    zero across the sweep. A non-zero value means the arbiter's legal-node mask
 *    missed something and the host's ruleset was violated.
 *
 * 2. **Zero raids exceed portal stability.** Every raid's `resolutionTick` is at
 *    most `maxTicks`, which is computable from portal stability before the first
 *    tick. A violation proves the termination argument is broken.
 *
 * The sweep varies seeds, species, traditions, node loadouts, and side sizes.
 * Each raid is a full open-deploy-run sequence against the shipped content set.
 *
 * This is a long-running test. It is separated from the fast suite and
 * controlled by the `RUN_MONTE_CARLO` environment variable so it does not slow
 * down `npm run verify`.
 */

import { describe, expect, it } from 'vitest';

import { MAGE_ROLE } from '@mm/state';

import type { RaidOutcome } from '@mm/rules-raid';
import { deployRaid, openPortal, runRaid } from '@mm/rules-raid';

import {
  ALL_FORMS,
  ALL_TECHNIQUES,
  addMage,
  addSoldiers,
  addLaborers,
  addUniversity,
  combat,
  emptyWorld,
  grid,
  knowledgeFor,
  nodesCarrying,
  participant,
  registry,
  ruleset,
  traditionId,
  tuning,
} from './raid-fixture.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOTAL_RAIDS = 10_000;

/**
 * Six species, three traditions: every pairing a raid could produce.
 *
 * The sweep does not need to hit every cell of this matrix — statistical
 * coverage is the point, not exhaustive combinatorics — so it picks from these
 * pools pseudo-randomly, keyed on the seed.
 */
const SPECIES = ['human', 'elf', 'dwarf', 'draconic', 'gnome', 'orc'] as const;
const TRADITIONS = ['vancian-memorization', 'true-naming', 'art-of-memory'] as const;

/**
 * Combat-relevant nodes, grouped by the primitive they carry.
 *
 * Every raid needs at least one combatant with a damage or area-denial node, or
 * it becomes a zero-cast stalemate that tests nothing but the timer.
 */
const DAMAGE_NODES = nodesCarrying('direct-damage');
const AREA_DENIAL_NODES = nodesCarrying('area-denial');
const STEAL_NODES = nodesCarrying('knowledge-steal');
const SUMMON_NODES = nodesCarrying('summon');
const BLINK_NODES = nodesCarrying('blink');
const WARD_NODES = nodesCarrying('ward');
const CORRUPT_NODES = nodesCarrying('knowledge-corrupt');

/** All combat node pools, so we can pick from whichever has entries. */
const OFFENSIVE_POOLS = [DAMAGE_NODES, AREA_DENIAL_NODES, SUMMON_NODES].filter(
  (pool) => pool.length > 0,
);
const UTILITY_POOLS = [STEAL_NODES, BLINK_NODES, WARD_NODES, CORRUPT_NODES].filter(
  (pool) => pool.length > 0,
);

/**
 * Nodes for shelving in the host's library. Wide variety so that theft and
 * corruption have something to act on.
 */
const SHELVE_CANDIDATES = [
  ...DAMAGE_NODES.slice(0, 3),
  ...AREA_DENIAL_NODES.slice(0, 2),
  ...STEAL_NODES.slice(0, 2),
  ...SUMMON_NODES.slice(0, 2),
  ...WARD_NODES.slice(0, 2),
].filter(Boolean);

// ---------------------------------------------------------------------------
// Deterministic selection helpers — keyed on the raid's seed so the sweep is
// reproducible.
// ---------------------------------------------------------------------------

/**
 * A simple integer hash so that every field derived from a seed is
 * independently distributed rather than correlated. Not cryptographic —
 * uniformity across the pools is all that matters.
 */
function mix(seed: number, salt: number): number {
  let h = (seed * 2654435761 + salt) >>> 0;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return h >>> 0;
}

function pick<T>(pool: readonly T[], seed: number, salt: number): T {
  return pool[mix(seed, salt) % pool.length] as T;
}

function pickN<T>(pool: readonly T[], count: number, seed: number, salt: number): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count && out.length < pool.length; i++) {
    let idx = mix(seed, salt + i * 7) % pool.length;
    while (seen.has(idx)) idx = (idx + 1) % pool.length;
    seen.add(idx);
    out.push(pool[idx] as T);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Raid builder — one function, one seed, one raid.
// ---------------------------------------------------------------------------

function buildAndRunRaid(seed: number): RaidOutcome {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = knowledgeFor(attackerWorld);
  const hostKnowledge = knowledgeFor(hostWorld);

  // Pick a tradition for each side.
  const attackerTradition = pick(TRADITIONS, seed, 1);
  const hostTradition = pick(TRADITIONS, seed, 2);
  const hostTradId = traditionId(hostTradition);

  // Pick species for each side.
  const attackerSpecies = pick(SPECIES, seed, 3);
  const defenderSpecies = pick(SPECIES, seed, 4);

  // Vary side sizes: 1-4 mages per side, picked from the seed.
  const nAttackers = 1 + (mix(seed, 5) % 4);
  const nDefenders = 1 + (mix(seed, 6) % 4);

  // Every attacker gets at least one offensive node plus optionally a utility.
  for (let i = 0; i < nAttackers; i++) {
    const offPool = pick(OFFENSIVE_POOLS, seed, 10 + i);
    const offNode = pick(offPool, seed, 20 + i);
    const nodes: string[] = [offNode];

    // 50% chance of a utility node.
    if (mix(seed, 30 + i) % 2 === 0 && UTILITY_POOLS.length > 0) {
      const utilPool = pick(UTILITY_POOLS, seed, 40 + i);
      const utilNode = pick(utilPool, seed, 50 + i);
      if (utilNode !== offNode) nodes.push(utilNode);
    }

    addMage(attackerWorld, attackerKnowledge, {
      species: i === 0 ? attackerSpecies : pick(SPECIES, seed, 60 + i),
      role: MAGE_ROLE.raider,
      nodes,
    });
  }

  // Defenders get similar loadouts.
  for (let i = 0; i < nDefenders; i++) {
    const offPool = pick(OFFENSIVE_POOLS, seed, 110 + i);
    const offNode = pick(offPool, seed, 120 + i);
    const nodes: string[] = [offNode];

    if (mix(seed, 130 + i) % 2 === 0 && UTILITY_POOLS.length > 0) {
      const utilPool = pick(UTILITY_POOLS, seed, 140 + i);
      const utilNode = pick(utilPool, seed, 150 + i);
      if (utilNode !== offNode) nodes.push(utilNode);
    }

    addMage(hostWorld, hostKnowledge, {
      species: i === 0 ? defenderSpecies : pick(SPECIES, seed, 160 + i),
      role: MAGE_ROLE.warden,
      nodes,
    });
  }

  // Shelve 2-5 nodes in the host library.
  const nShelved = 2 + (mix(seed, 200) % 4);
  const shelved = SHELVE_CANDIDATES.length > 0
    ? pickN(SHELVE_CANDIDATES, Math.min(nShelved, SHELVE_CANDIDATES.length), seed, 210)
    : [];
  if (shelved.length > 0) {
    addUniversity(hostWorld, hostKnowledge, shelved);
  }

  // 30% chance of soldiers on each side.
  if (mix(seed, 300) % 10 < 3) {
    addSoldiers(attackerWorld, 100 + (mix(seed, 301) % 200));
  }
  if (mix(seed, 310) % 10 < 3) {
    addSoldiers(hostWorld, 100 + (mix(seed, 311) % 200));
  }

  // 20% chance of laborers on the host (for the levy verb).
  if (mix(seed, 320) % 5 === 0) {
    addLaborers(hostWorld, 200 + (mix(seed, 321) % 300));
  }

  // Occasionally restrict a form or technique axis to test forbidden-cast
  // enforcement under constrained rulesets (10% of raids).
  let permittedForms = ALL_FORMS;
  let permittedTechniques = ALL_TECHNIQUES;
  if (mix(seed, 400) % 10 === 0) {
    // Disable one form by flipping a random bit off.
    const formBit = mix(seed, 401) % 14;
    permittedForms = ALL_FORMS & ~(1 << formBit);
  }
  if (mix(seed, 410) % 10 === 0) {
    // Disable one technique.
    const techBit = mix(seed, 411) % 5;
    permittedTechniques = ALL_TECHNIQUES & ~(1 << techBit);
  }

  const hostSnapshot = ruleset({
    traditionId: hostTradId,
    permittedForms,
    permittedTechniques,
  });
  const attackerSnapshot = ruleset({
    traditionId: traditionId(attackerTradition),
  });

  const raid = openPortal({
    attacker: participant(
      attackerWorld,
      attackerKnowledge,
      attackerSnapshot,
      hostTradId,
    ),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostTradId),
    registry,
    grid,
    combat,
    tuning,
    raidSeed: seed,
  });
  deployRaid(raid);
  return runRaid(raid);
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

describe.skipIf(!process.env['RUN_MONTE_CARLO'])(
  'raid Monte Carlo sweep (10,000 raids)',
  () => {
    it('zero forbidden casts resolved and zero raids exceeding portal stability', () => {
      let totalForbiddenCastsBlocked = 0;
      let stabilityViolations = 0;
      let raidsThatProducedCasts = 0;
      let totalResolutionTick = 0;

      for (let seed = 1; seed <= TOTAL_RAIDS; seed++) {
        const outcome = buildAndRunRaid(seed);

        // Invariant 1: no forbidden cast should have resolved.
        totalForbiddenCastsBlocked += outcome.forbiddenCastsBlocked;

        // Invariant 2: the raid must not exceed portal stability.
        // maxTicks is the bound computable from the portal's initial stability
        // and decay rate, derived at portal open. resolutionTick must be <= it.
        if (outcome.resolutionTick > outcome.maxTicks) {
          stabilityViolations++;
        }

        // Bookkeeping for diagnostics.
        if (outcome.primitiveApplication.length > 0) raidsThatProducedCasts++;
        totalResolutionTick += outcome.resolutionTick;
      }

      // The two load-bearing assertions.
      expect(totalForbiddenCastsBlocked).toBe(0);
      expect(stabilityViolations).toBe(0);

      // Sanity: at least some raids had combat. If none did, the sweep tested
      // nothing but empty battlefields and the invariants passed vacuously.
      expect(raidsThatProducedCasts).toBeGreaterThan(TOTAL_RAIDS * 0.5);

      // Informational: mean resolution tick, so the output tells you something.
      const meanTick = totalResolutionTick / TOTAL_RAIDS;
      console.log(
        `Monte Carlo sweep: ${String(TOTAL_RAIDS)} raids, ` +
          `mean resolution tick ${meanTick.toFixed(1)}, ` +
          `${String(raidsThatProducedCasts)} with combat, ` +
          `forbidden casts: ${String(totalForbiddenCastsBlocked)}, ` +
          `stability violations: ${String(stabilityViolations)}`,
      );
    }, 600_000); // 10 minutes — this is a long test.
  },
);
