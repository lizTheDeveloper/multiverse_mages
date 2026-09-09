/*
 * Multiverse Mages — adversarial: five ways to try to cheat the rediscovery price.
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
 * **Expected to pass.** These are attacks on release 0.3.0's first claim that
 * did **not** find a defect, kept because a green result on a named attack is
 * worth more than an untested assumption, and because the shipped claim test
 * (`test/unit/release-claim-0.3.0-knowledge-loss.test.ts`) exercises none of
 * them: it loses the node once, in a universe holding nothing else, and
 * round-trips only the mind-instance case.
 *
 * The claim, verbatim from `docs/design/release-plan.md` §0.3.0:
 *
 * > A node ceases to exist in a universe when its last instance is destroyed,
 * > and rediscovering it costs at least 3× its original research cost.
 *
 * Five axes, each a plausible way for the price to leak:
 *
 * 1. **Losing and rediscovering the same node repeatedly.** A per-loss counter
 *    that compounded, or an `ever-known` row written twice, would show here.
 * 2. **Progress carried across the loss boundary.** Work banked at the ordinary
 *    price before the last instance died must not buy the node at that price
 *    afterwards.
 * 3. **Interdiction toggled around the loss.** The refusal path computes the
 *    requirement before it refuses; a refusal must bank nothing and must not
 *    forget the node was lost.
 * 4. **A shelved book as the last instance, across a save and load.** The
 *    `ever-known` row is a component, but the *existence* index and the
 *    grimoire pairing are both rebuilt, and a book that failed to rebuild would
 *    make a live node look lost — charging 3× for something the universe still
 *    has.
 * 5. **Destruction order.** Two peers that destroy the same instances in
 *    different orders must agree on which nodes left the universe.
 *
 * One near-miss found along the way is deliberately *not* asserted here and is
 * reported as a design question instead: a mage part-way through a rediscovery
 * whose universe re-acquires the node by another route (a raid deposit, a
 * founding grant) finishes at the ordinary price, because `isRediscovery` is
 * re-evaluated every step and she is no longer rediscovering anything. That is
 * defensible and may even be intended, but it is the one place a large
 * rediscovery bill can be converted into a small one, and it should be a
 * decision rather than a consequence.
 */

import { describe, expect, it } from 'vitest';

import { createRediscoveryClampCounter } from '@mm/primitives';
import { deserializeState, serializeState } from '@mm/sim-core';
import { EVER_KNOWN, LOCATION_KIND, componentOf, defineWorldStateSchema } from '@mm/state';

import type { KnowledgeNode } from '../../src/instances/catalog.js';
import { MASTERY_MAX } from '../../src/instances/constants.js';
import { decayHeldKnowledge } from '../../src/instances/decay.js';
import { destroyLibrary, shelveGrimoire } from '../../src/instances/location.js';
import { research, researchRequirement } from '../../src/instances/research.js';
import { scribe } from '../../src/instances/scribing.js';
import { STANDARD_STORE } from '../support/store-hooks.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { teach } from '../../src/instances/teaching.js';
import {
  CHILD_NODE,
  HOME_CELL,
  OTHER_CELL_NODE,
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const ARCHMAGE = 500;
const RIVAL = 501;
const STUDENT = 502;
const LIBRARY = 900;

/** What the fixture node costs unscaled, and three times it. */
const ORDINARY = researchRequirement(testCatalog().node(ROOT_NODE) as KnowledgeNode, {
  rediscovery: false,
  rediscoveryAffinity: 1024,
  learnRate: 1024,
  researchRate: 1024,
  clampCounter: createRediscoveryClampCounter(),
});
const THREE_TIMES = ORDINARY * 3;

function universeKnowing(holder = ARCHMAGE): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: holder,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  return knowledge;
}

function step(
  knowledge: KnowledgeSubsystem,
  options: {
    readonly nodeId?: number;
    readonly subject?: number;
    readonly progress?: number;
    readonly effort?: number;
    readonly tick?: number;
    readonly ruleset?: ReturnType<typeof permissiveRuleset>;
  } = {},
) {
  const tick = options.tick ?? 20;
  return research({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: options.ruleset ?? permissiveRuleset(),
    rng: stepRng(2, tick),
    subject: options.subject ?? ARCHMAGE,
    nodeId: options.nodeId ?? ROOT_NODE,
    worldTick: tick,
    progress: options.progress ?? 0,
    effort: options.effort ?? 0,
    learnRate: 1024,
    researchRate: 1024,
    rediscoveryAffinity: 1024,
    clampCounter: createRediscoveryClampCounter(),
  });
}

/** Accumulates until the node is derived, reporting what it took. */
function researchToCompletion(
  knowledge: KnowledgeSubsystem,
  firstTick: number,
): { readonly steps: number; readonly progress: number; readonly required: number; readonly rediscovery: boolean } {
  let progress = 0;
  for (let tick = firstTick; tick < firstTick + 200; tick += 1) {
    const outcome = step(knowledge, { progress, effort: 512, tick });
    progress = outcome.progress;
    if (outcome.completed) {
      return {
        steps: tick - firstTick + 1,
        progress,
        required: outcome.required,
        rediscovery: outcome.rediscovery,
      };
    }
  }
  throw new Error('the fixture never completed; the scenario, not the code, is wrong');
}

describe('losing and rediscovering the same node over and over', () => {
  it('charges the same 3× every cycle, and never writes a second ever-known row', () => {
    const knowledge = universeKnowing();
    const bills: number[] = [];

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const losses = knowledge.destroyInstancesHeldBy(ARCHMAGE, 100 + cycle);
      expect(losses).toHaveLength(1);
      expect(knowledge.exists(ROOT_NODE)).toBe(false);
      expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);

      const run = researchToCompletion(knowledge, 200 + cycle * 300);
      expect(run.rediscovery).toBe(true);
      expect(run.required).toBeGreaterThanOrEqual(THREE_TIMES);
      expect(run.progress).toBeGreaterThanOrEqual(THREE_TIMES);
      bills.push(run.required);

      expect(knowledge.exists(ROOT_NODE)).toBe(true);
      // The rediscovered instance is the archmage's again, so the next cycle
      // loses it the same way.
      expect(knowledge.instancesHeldBy(ARCHMAGE)).toHaveLength(1);
    }

    // The claim is "at least 3×", not "3× and rising": nothing compounds.
    expect(new Set(bills).size).toBe(1);
    // And ever-known is idempotent. A second row would be harmless today and a
    // silent duplicate in every later snapshot.
    expect(componentOf(knowledge.state, EVER_KNOWN).size).toBe(1);
  });
});

describe('progress banked before the node was lost', () => {
  it('does not buy it at the ordinary price afterwards', () => {
    // The rival holds the only instance; the archmage is researching it
    // independently, which is ordinary research and not rediscovery.
    const knowledge = universeKnowing(RIVAL);
    let progress = 0;
    for (let tick = 20; tick < 24; tick += 1) {
      const outcome = step(knowledge, { progress, effort: 900, tick });
      progress = outcome.progress;
      expect(outcome.rediscovery).toBe(false);
      expect(outcome.completed).toBe(false);
    }
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(ORDINARY);

    // The rival dies one step short of the archmage finishing.
    expect(knowledge.destroyInstancesHeldBy(RIVAL, 30)).toHaveLength(1);

    const afterLoss = step(knowledge, { progress, effort: 0, tick: 31 });
    expect(afterLoss.rediscovery).toBe(true);
    expect(afterLoss.required).toBeGreaterThanOrEqual(THREE_TIMES);
    expect(afterLoss.completed).toBe(false);
    // Her banked work is kept — nothing here confiscates it — but it is now
    // measured against the rediscovery price.
    expect(afterLoss.progress).toBe(progress);

    const finished = researchToCompletion(knowledge, 40);
    expect(finished.rediscovery).toBe(true);
    expect(finished.progress).toBeGreaterThanOrEqual(THREE_TIMES);
  });
});

describe('an interdiction toggled around the loss', () => {
  it('refuses without banking progress, and still remembers the node was lost', () => {
    const knowledge = universeKnowing();
    // The god forbids the cell; the last instance erodes floorlessly and dies.
    expect(
      decayHeldKnowledge({
        knowledge,
        cells: testCells,
        ruleset: interdicting(HOME_CELL),
        elapsedTicks: 400,
        worldTick: 10,
        retentionOf: () => 1024,
      }),
    ).toEqual([{ nodeId: ROOT_NODE, worldTick: 10, location: LOCATION_KIND.mind }]);

    // While still forbidden: refused, no progress, and the price is already 3×.
    const forbidden = step(knowledge, {
      effort: 1024 * 64,
      tick: 11,
      ruleset: interdicting(HOME_CELL),
    });
    expect(forbidden.refusal?.reason).toBe('forbidden-cell');
    expect(forbidden.progress).toBe(0);
    expect(forbidden.rediscovery).toBe(true);
    expect(forbidden.required).toBeGreaterThanOrEqual(THREE_TIMES);

    // The god relents. The interdiction did not launder the node back into
    // never-known: it is still rediscovery, at the same price.
    const relented = step(knowledge, { effort: 1024 * 64, tick: 12 });
    expect(relented.rediscovery).toBe(true);
    expect(relented.required).toBe(forbidden.required);
    expect(relented.completed).toBe(true);
    expect(relented.progress).toBeGreaterThanOrEqual(THREE_TIMES);
  });
});

describe('a shelved book as the node’s last instance', () => {
  it('survives a save and load, and burning the library then loses the node', () => {
    const before = universeKnowing();
    const written = scribe({
      knowledge: before,
      catalog: testCatalog(),
      cells: testCells,
      ruleset: permissiveRuleset(),
      rng: stepRng(5, 10),
      scribe: ARCHMAGE,
      nodeId: ROOT_NODE,
      worldTick: 10,
      store: STANDARD_STORE,
      scribeAffinity: 1024,
      scribeCapacity: 1024 * 16,
      materials: 1024 * 16,
    });
    shelveGrimoire(before, written.grimoire, LIBRARY);
    before.destroyInstancesHeldBy(ARCHMAGE, 11);
    expect(before.instanceCount(ROOT_NODE)).toBe(1);

    const after = KnowledgeSubsystem.fromState(
      deserializeState(serializeState(before.state), defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );

    // Still one instance, still existing, so still *ordinary* research: a
    // rebuild that dropped the book would have charged 3× for a node the
    // universe can read off a shelf.
    expect(after.exists(ROOT_NODE)).toBe(true);
    expect(after.instanceCount(ROOT_NODE)).toBe(1);
    expect(step(after, { effort: 0, tick: 12 }).rediscovery).toBe(false);

    expect(destroyLibrary(after, LIBRARY, 13)).toEqual([
      { nodeId: ROOT_NODE, worldTick: 13, location: LOCATION_KIND.library },
    ]);
    expect(after.exists(ROOT_NODE)).toBe(false);

    // And now it is rediscovery, in the restored universe.
    const lost = step(after, { effort: 0, tick: 14 });
    expect(lost.rediscovery).toBe(true);
    expect(lost.required).toBeGreaterThanOrEqual(THREE_TIMES);
    // Every route back is shut, in the restored universe as in the live one.
    expect(
      teach({
        knowledge: after,
        catalog: testCatalog(),
        cells: testCells,
        ruleset: permissiveRuleset(),
        rng: stepRng(3, 15),
        teacher: ARCHMAGE,
        student: STUDENT,
        nodeId: ROOT_NODE,
        worldTick: 15,
      }).refusal,
    ).toEqual({ reason: 'node-lost', nodeId: ROOT_NODE });
  });

  /**
   * Two copies of one node on one shelf is the case
   * `KnowledgeSubsystem.#relinkShelvedGrimoires` documents as ambiguous. The
   * documented promise is that the ambiguity is confined to `acquiredTick`; this
   * checks the part that matters — the count, the burn, and the loss event.
   */
  it('holds when two copies of one node share a shelf', () => {
    const before = universeKnowing();
    for (const tick of [10, 11]) {
      const written = scribe({
        knowledge: before,
        catalog: testCatalog(),
        cells: testCells,
        ruleset: permissiveRuleset(),
        rng: stepRng(5, tick),
        scribe: ARCHMAGE,
        nodeId: ROOT_NODE,
        worldTick: tick,
        store: STANDARD_STORE,
        scribeAffinity: 1024,
        scribeCapacity: 1024 * 16,
        materials: 1024 * 16,
      });
      shelveGrimoire(before, written.grimoire, LIBRARY);
    }
    before.destroyInstancesHeldBy(ARCHMAGE, 12);
    expect(before.instanceCount(ROOT_NODE)).toBe(2);

    const after = KnowledgeSubsystem.fromState(
      deserializeState(serializeState(before.state), defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );
    expect(after.instanceCount(ROOT_NODE)).toBe(2);

    // Burning the library empties the node exactly once.
    expect(destroyLibrary(after, LIBRARY, 13)).toEqual([
      { nodeId: ROOT_NODE, worldTick: 13, location: LOCATION_KIND.library },
    ]);
    expect(after.exists(ROOT_NODE)).toBe(false);
    expect(after.instanceCount(ROOT_NODE)).toBe(0);
  });
});

describe('two peers destroying the same instances in different orders', () => {
  it('agree on which nodes left the universe', () => {
    function seeded(): { knowledge: KnowledgeSubsystem; handles: number[] } {
      const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
      const handles = ([
        [ROOT_NODE, ARCHMAGE],
        [ROOT_NODE, RIVAL],
        [CHILD_NODE, ARCHMAGE],
        [OTHER_CELL_NODE, RIVAL],
      ] as const).map(([nodeId, holder]) =>
        knowledge.createInstance({
          nodeId,
          locationKind: LOCATION_KIND.mind,
          locationId: holder,
          acquiredTick: 0,
          mastery: MASTERY_MAX,
        }),
      );
      return { knowledge, handles };
    }

    const forward = seeded();
    const reverse = seeded();
    const forwardLosses = forward.knowledge.destroyAll(forward.handles, 9);
    const reverseLosses = reverse.knowledge.destroyAll([...reverse.handles].reverse(), 9);

    // The *order* of the events follows the destruction order, which is what
    // "the location kind of the destroyed instance" means. The *set* must not.
    const nodesOf = (losses: readonly { nodeId: number }[]) =>
      losses.map((loss) => loss.nodeId).sort((a, b) => a - b);
    expect(nodesOf(forwardLosses)).toEqual(nodesOf(reverseLosses));
    expect(nodesOf(forwardLosses)).toEqual([ROOT_NODE, CHILD_NODE, OTHER_CELL_NODE].sort((a, b) => a - b));
    expect(forward.knowledge.knownNodes()).toEqual(reverse.knowledge.knownNodes());
    expect(forward.knowledge.knownNodes()).toEqual([]);
    // Exactly one loss per node, however the destruction was ordered.
    expect(forwardLosses).toHaveLength(3);
    expect(reverseLosses).toHaveLength(3);
  });
});
