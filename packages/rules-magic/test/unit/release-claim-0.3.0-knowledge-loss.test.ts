/*
 * Multiverse Mages — the 0.3.0 release claim about losing and rediscovering a node.
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
 * **Release claim, `docs/design/release-plan.md` §0.3.0, verbatim:**
 *
 * > A node ceases to exist in a universe when its last instance is destroyed,
 * > and rediscovering it costs at least 3× its original research cost.
 *
 * **Disproved by**, verbatim: *"a scenario test where a node remains learnable
 * after its last instance is destroyed, or where rediscovery completes below
 * the multiplier."*
 *
 * This file is the measurement the release plan says is *collected*. It is
 * named for the claim rather than for the module so that somebody auditing
 * 0.3.0 can find the evidence without reading the rest of the suite, and every
 * `describe` below is one half of the claim or one of the two disproof
 * conditions.
 *
 * ## What "remains learnable" is taken to mean, and why it is four assertions
 *
 * `knowledge-instances` spells the consequence out: a node that has left the
 * universe *"MUST NOT be teachable or scribable by anyone, and MUST NOT satisfy
 * any prerequisite"*, and may be re-derived *"only by rediscovery"*. A single
 * `exists() === false` would not disprove the disproof condition — a subsystem
 * could report a node absent while every operation happily carried on. So each
 * of the four routes back to the node is exercised through the shipped
 * operation that owns it: `teach`, `scribe`, prerequisite satisfaction inside
 * `research`, and `research` on the node itself.
 *
 * ## The second half is a ratio, not a magnitude
 *
 * "3× its original research cost" is a statement about two numbers computed
 * under the *same* rates: what ordinary research would have required of this
 * subject, and what rediscovery requires of her. Both are scaled by learn rate
 * and the stacked `research-rate` multiplier, and `div` floors — so the
 * property is only worth asserting across a grid of rates, which is what
 * `rediscovery costs at least three times ordinary research` below does. It
 * survives flooring because `floor(3x) ≥ 3·floor(x)`; a test at one rate would
 * pass under an implementation that clamps the *content* value instead of the
 * composed one, which is the specific mistake `constants.ts` documents.
 *
 * ## The persisted half
 *
 * Node existence is derived and must never be stored; **ever-known** is
 * persisted and cannot be derived. A test that only checked in-memory state
 * would prove half the claim, because after a save and load nothing else in the
 * world remembers the node was ever there — and rediscovery would silently
 * become ordinary research. `survives a snapshot round trip` below re-asserts
 * every route back to the node against a subsystem rebuilt from bytes.
 */

import { describe, expect, it } from 'vitest';

import { deserializeState, div, mul, serializeState } from '@mm/sim-core';
import {
  REDISCOVERY_FLOOR,
  createRediscoveryClampCounter,
  effectiveRediscoveryMultiplier,
} from '@mm/primitives';
import { LOCATION_KIND, defineWorldStateSchema } from '@mm/state';

import type { KnowledgeNode } from '../../src/instances/catalog.js';
import { DEFAULT_INITIAL_MASTERY, MASTERY_MAX } from '../../src/instances/constants.js';
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
  ROOT_NODE,
  TEST_NODE_COUNT,
  interdicting,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

/** Opaque handles. `rules-magic` never dereferences them, so any integer does. */
const ARCHMAGE = 500;
const STUDENT = 501;
const LIBRARY = 900;

/** The unity rates: what the claim's "original research cost" means unscaled. */
const UNITY = { learnRate: 1024, researchRate: 1024 } as const;

/** A universe holding one mind instance of {@link ROOT_NODE}, at full mastery. */
function universeKnowing(node = ROOT_NODE): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId: node,
    locationKind: LOCATION_KIND.mind,
    locationId: ARCHMAGE,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  return knowledge;
}

/** One research step, with every world-side rate supplied explicitly. */
function researchStep(
  knowledge: KnowledgeSubsystem,
  options: {
    readonly nodeId?: number;
    readonly subject?: number;
    readonly progress?: number;
    readonly effort?: number;
    readonly tick?: number;
    readonly rediscoveryAffinity?: number;
  } = {},
) {
  const tick = options.tick ?? 20;
  return research({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(2, tick),
    subject: options.subject ?? ARCHMAGE,
    nodeId: options.nodeId ?? ROOT_NODE,
    worldTick: tick,
    progress: options.progress ?? 0,
    effort: options.effort ?? 0,
    learnRate: UNITY.learnRate,
    researchRate: UNITY.researchRate,
    rediscoveryAffinity: options.rediscoveryAffinity ?? 1024,
    clampCounter: createRediscoveryClampCounter(),
  });
}

/**
 * Every route back to a node, asked of a universe that has lost it.
 *
 * One function rather than four inline blocks because the same four questions
 * are asked twice — once in memory, once against a subsystem rebuilt from a
 * snapshot — and two copies of a claim's evidence is one copy that can rot.
 */
function routesBackTo(knowledge: KnowledgeSubsystem) {
  const taught = teach({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(3, 21),
    teacher: ARCHMAGE,
    student: STUDENT,
    nodeId: ROOT_NODE,
    worldTick: 21,
  });

  const scribed = scribe({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(3, 21),
    scribe: ARCHMAGE,
    nodeId: ROOT_NODE,
    worldTick: 21,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 1024 * 16,
    materials: 1024 * 16,
  });

  // CHILD_NODE's only prerequisite is the lost node.
  const dependent = researchStep(knowledge, { nodeId: CHILD_NODE, effort: 1024 * 64 });

  // The node itself, funded with exactly what ordinary research would have cost.
  const ordinary = researchRequirement(testCatalog().node(ROOT_NODE) as KnowledgeNode, {
    rediscovery: false,
    rediscoveryAffinity: 1024,
    ...UNITY,
    clampCounter: createRediscoveryClampCounter(),
  });
  const rederived = researchStep(knowledge, { effort: ordinary });

  return { taught, scribed, dependent, rederived, ordinary };
}

describe('release claim 0.3.0 — a node ceases to exist when its last instance is destroyed', () => {
  /**
   * Disproof condition: *a scenario test where a node remains learnable after
   * its last instance is destroyed.* Route one of three by which a node's last
   * instance dies: the mage carrying it dies.
   */
  it('is lost when its holder dies, and is then learnable by no route but rediscovery', () => {
    const knowledge = universeKnowing();
    expect(knowledge.exists(ROOT_NODE)).toBe(true);

    const losses = knowledge.destroyInstancesHeldBy(ARCHMAGE, 40);

    expect(losses).toEqual([{ nodeId: ROOT_NODE, worldTick: 40, location: LOCATION_KIND.mind }]);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(0);

    const routes = routesBackTo(knowledge);

    // Not teachable by anyone.
    expect(routes.taught.refusal).toEqual({ reason: 'node-lost', nodeId: ROOT_NODE });
    expect(routes.taught.instance).toBe(0);

    // Not scribable by anyone.
    expect(routes.scribed.refusal?.reason).toBe('node-not-held');
    expect(routes.scribed.grimoire).toBe(0);

    // Satisfies no prerequisite.
    expect(routes.dependent.refusal).toEqual({
      reason: 'unsatisfied-prerequisite',
      nodeId: CHILD_NODE,
      prerequisiteId: ROOT_NODE,
      subject: ARCHMAGE,
    });

    // And re-deriving it is rediscovery, which the original price does not buy.
    expect(routes.rederived.rediscovery).toBe(true);
    expect(routes.rederived.completed).toBe(false);
    expect(routes.rederived.required).toBeGreaterThanOrEqual(routes.ordinary * 3);

    // Nothing above created an instance: the node is still gone.
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  /**
   * Route two: the last copy is a book, and the library burns. The loss event
   * must name the *library* location kind — `knowledgeHalfLife` and
   * `libraryDependence` exist to tell "an archmage died" from "the library
   * burned", and an event that could not distinguish them would make both
   * metrics unreadable.
   */
  it('is lost when the last copy burns in a library, and the event names the library', () => {
    const knowledge = universeKnowing();
    const written = scribe({
      knowledge,
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
    expect(written.refusal).toBeUndefined();
    shelveGrimoire(knowledge, written.grimoire, LIBRARY);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);

    // Losing one of two is not a loss. The claim is about the *last* instance.
    expect(knowledge.destroyInstancesHeldBy(ARCHMAGE, 41)).toEqual([]);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);

    expect(destroyLibrary(knowledge, LIBRARY, 42)).toEqual([
      { nodeId: ROOT_NODE, worldTick: 42, location: LOCATION_KIND.library },
    ]);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(routesBackTo(knowledge).taught.refusal).toEqual({
      reason: 'node-lost',
      nodeId: ROOT_NODE,
    });
  });

  /**
   * Route three, and the one the god causes: an interdicted cell's instances
   * decay without a floor and are destroyed at zero mastery. This is how
   * forbidding a cell actually costs a civilization something, so it has to
   * produce a loss indistinguishable in form from the other two.
   */
  it('is lost when the last dormant instance decays to nothing', () => {
    const knowledge = universeKnowing();

    const losses = decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset: interdicting(HOME_CELL),
      elapsedTicks: 200,
      worldTick: 43,
      retentionOf: () => 1024,
    });

    expect(losses).toEqual([{ nodeId: ROOT_NODE, worldTick: 43, location: LOCATION_KIND.mind }]);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });

  /**
   * The negative control. If a loss event were emitted for *any* destruction,
   * every assertion above would pass for the wrong reason and the metric the
   * claim feeds would be noise.
   */
  it('does not cease to exist while any instance survives', () => {
    const knowledge = universeKnowing();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: STUDENT,
      acquiredTick: 1,
      mastery: MASTERY_MAX,
    });
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.palace,
      locationId: STUDENT,
      acquiredTick: 1,
      mastery: MASTERY_MAX,
    });
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(3);

    expect(knowledge.destroyInstancesHeldBy(ARCHMAGE, 44)).toEqual([]);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(2);

    // Still ordinary research, because the node never left.
    const still = researchStep(knowledge, { effort: 0 });
    expect(still.rediscovery).toBe(false);
    expect(still.required).toBe(4096);
  });

  /**
   * The persisted half of the claim.
   *
   * Existence is derived from the instance index; **ever-known** is a component
   * and is in the snapshot. If it were not, a save and load would turn a lost
   * node back into one nobody ever knew, and rediscovery — the expensive path
   * the claim is *about* — would silently become ordinary research. Task 4.13's
   * own test asserts the required progress survives; this one re-asks all four
   * routes back to the node, because a restored universe in which the node is
   * priced as lost but is still teachable would satisfy 4.13 and disprove the
   * release claim.
   */
  it('survives a snapshot round trip: the node is still gone, and still expensive', () => {
    const before = universeKnowing();
    before.destroyInstancesHeldBy(ARCHMAGE, 45);

    const after = KnowledgeSubsystem.fromState(
      deserializeState(serializeState(before.state), defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );

    expect(after.exists(ROOT_NODE)).toBe(false);
    expect(after.wasEverKnown(ROOT_NODE)).toBe(true);

    const routes = routesBackTo(after);
    expect(routes.taught.refusal).toEqual({ reason: 'node-lost', nodeId: ROOT_NODE });
    expect(routes.scribed.refusal?.reason).toBe('node-not-held');
    expect(routes.dependent.refusal?.reason).toBe('unsatisfied-prerequisite');
    expect(routes.rederived.rediscovery).toBe(true);
    expect(routes.rederived.completed).toBe(false);
    expect(routes.rederived.required).toBeGreaterThanOrEqual(routes.ordinary * 3);

    // And the control: a node this universe never held is ordinary research
    // after the same round trip, so the assertion above is about the record and
    // not about restores being expensive in general.
    expect(
      researchStep(after, { nodeId: CHILD_NODE, subject: STUDENT, effort: 0 }).rediscovery,
    ).toBe(false);
  });
});

/**
 * The second half, and the second disproof condition: *"where rediscovery
 * completes below the multiplier."*
 *
 * The grid is the point. `researchRequirement` divides by
 * `mul(learnRate, researchRate)` and `div` floors toward negative infinity, so
 * the claim is a statement about two floored quotients rather than about one
 * product. It survives because `mul(cost, fp(3072))` is exactly `3 × cost` and
 * `floor(3y) ≥ 3·floor(y)` — but *that* is the thing worth checking against the
 * implementation rather than against the algebra, at every rate a species and a
 * stacked `research-rate` multiplier could plausibly produce.
 */
describe('release claim 0.3.0 — rediscovery costs at least 3× the original research cost', () => {
  const RESEARCH_COSTS = [1024, 3072, 4096, 16384];
  const REDISCOVERY_MULTIPLIERS = [3072, 4096, 6144, 8192];
  /**
   * Species `rediscoveryAffinity`, spanning "much worse" to "much better".
   *
   * **The span reads in that order because §2.4 makes the trait a divisor**,
   * and this comment used to say the reverse. `fp(512)` is the orc, the worst
   * rediscoverer in v1 content; `fp(2048)` is better than any shipped species
   * (the gnome leads at `fp(1792)`) and is here to push past the shipped range.
   */
  const AFFINITIES = [512, 768, 1024, 1536, 2048];
  const LEARN_RATES = [256, 1024, 4096];
  /** The **already stacked** `research-rate` multiplier. */
  const RESEARCH_RATES = [256, 1024, 3072];

  function nodeCosting(researchCost: number, rediscoveryMultiplier: number): KnowledgeNode {
    return {
      nodeId: ROOT_NODE,
      tier: 1,
      prerequisites: [],
      researchCost,
      teachCost: 1024,
      scribeCost: 2048,
      rediscoveryMultiplier,
      knowledgeKind: 'episteme',
    };
  }

  it('holds across every combination of content magnitude, affinity, and rate', () => {
    const violations: string[] = [];
    const counter = createRediscoveryClampCounter();
    let strictlyAbove = 0;
    let combinations = 0;

    for (const researchCost of RESEARCH_COSTS) {
      for (const rediscoveryMultiplier of REDISCOVERY_MULTIPLIERS) {
        for (const rediscoveryAffinity of AFFINITIES) {
          for (const learnRate of LEARN_RATES) {
            for (const researchRate of RESEARCH_RATES) {
              const node = nodeCosting(researchCost, rediscoveryMultiplier);
              const rates = {
                learnRate,
                researchRate,
                rediscoveryAffinity,
                clampCounter: counter,
              };
              const ordinary = researchRequirement(node, { rediscovery: false, ...rates });
              const lost = researchRequirement(node, { rediscovery: true, ...rates });

              combinations += 1;
              if (lost < ordinary * 3) {
                violations.push(
                  `cost ${String(researchCost)} × multiplier ${String(rediscoveryMultiplier)} ` +
                    `× affinity ${String(rediscoveryAffinity)} at learn ${String(learnRate)} / ` +
                    `research ${String(researchRate)}: ${String(lost)} < 3 × ${String(ordinary)}`,
                );
              }
              if (lost > ordinary * 3) strictlyAbove += 1;
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
    expect(combinations).toBe(720);
    // Not vacuous: most of the grid is *dearer* than the floor, which is what
    // content authored above `fp(3072)` and species affinity are both for.
    expect(strictlyAbove).toBeGreaterThan(combinations / 2);

    // **Re-derived under the divisor reading of §2.4, and it still holds.**
    // Zero violations across all 720, and `strictlyAbove` is 558 — the *same*
    // 558 the multiplier reading produced, which is a coincidence of this grid's
    // roughly symmetric affinity span rather than a fact about the arithmetic.
    //
    // What moved is *which* species meet the clamp, not how strong the claim is.
    // Under the old reading the floor caught the low affinities (`fp(512)`,
    // `fp(768)`); under §2.4's it catches the high ones (`fp(1536)`, `fp(2048)`)
    // against content authored near the invariant. On this grid that is 144 of
    // 720 rather than 108 — the floor binds slightly *more often* here, which is
    // an artefact of the chosen affinity span and not a weakening: the claim's
    // margin, `strictlyAbove`, is unchanged, and on **shipped** content the
    // clamp fires zero times (`rules-world`'s species-traits suite asserts that
    // over every species × node pair, which is the number that actually says
    // whether the trait differentiates anything).
    //
    // The counts are pinned so a future retune that quietly flattens the trait —
    // the clamp firing across most of the grid — fails here rather than passing.
    expect(counter.evaluated).toBe(720);
    expect(counter.floored).toBe(144);
    // The floor is a guarantee, not the mechanism: it is idle on most of the grid.
    expect(counter.floored).toBeLessThan(counter.evaluated / 2);
    expect(strictlyAbove).toBe(558);
  });

  /**
   * The clamp itself. A species good at rediscovery composes below 3× against
   * content authored at the invariant — `div(fp(3072), fp(2048))` is `fp(1536)`,
   * or 1.5×, and the release claim would be false before any code ran. The
   * clamp is what makes it true, and lowering it falsifies a released claim
   * rather than retuning anything.
   *
   * **Direction settled by `contracts.md` §2.4.** These assertions named
   * `fp(512)` as the species "good at rediscovery", which is the multiplier
   * reading; §2.4 is normative and makes affinity a divisor, under which
   * `fp(512)` is the *orc* — the worst rediscoverer in v1, who pays `fp(6144)`
   * and never approaches the floor. The species that threatens the claim is a
   * high-affinity one, so the fixtures are `fp(2048)` and the shipped gnome's
   * `fp(1792)`. The arithmetic is untouched: `3072 × 1024 / 2048` is the same
   * `1536` that `3072 × 512 / 1024` used to be, so the magnitude the clamp has
   * to catch is unchanged — only which species produces it.
   */
  it('clamps the effective multiplier at fp(3072) however good the species is', () => {
    const counter = createRediscoveryClampCounter();
    expect(div(REDISCOVERY_FLOOR, 2048)).toBe(1536);
    expect(effectiveRediscoveryMultiplier(REDISCOVERY_FLOOR, 2048, counter)).toBe(
      REDISCOVERY_FLOOR,
    );
    // The shipped best rediscoverer, against content authored at the invariant:
    // `3072 × 1024 / 1792 = 1755`, under the floor. This is the exact case
    // `contracts.md` §2.3 cites when it tells v1 authors to clear `fp(5376)`.
    expect(div(REDISCOVERY_FLOOR, 1792)).toBe(1755);
    expect(effectiveRediscoveryMultiplier(REDISCOVERY_FLOOR, 1792, counter)).toBe(
      REDISCOVERY_FLOOR,
    );

    for (const affinity of AFFINITIES) {
      for (const multiplier of REDISCOVERY_MULTIPLIERS) {
        expect(effectiveRediscoveryMultiplier(multiplier, affinity, counter)).toBeGreaterThanOrEqual(
          REDISCOVERY_FLOOR,
        );
      }
    }

    // At the floor and at unity rates, the requirement is exactly three times
    // `researchCost` — the magnitude `knowledge-instances` names.
    const atFloor = nodeCosting(4096, REDISCOVERY_FLOOR);
    expect(
      researchRequirement(atFloor, {
        rediscovery: true,
        rediscoveryAffinity: 2048,
        ...UNITY,
        clampCounter: counter,
      }),
    ).toBe(4096 * 3);

    // And affinity still differentiates *above* the floor, so the clamp is a
    // guarantee rather than a flattening.
    const authoredAbove = nodeCosting(4096, 8192);
    const gifted = researchRequirement(authoredAbove, {
      rediscovery: true,
      rediscoveryAffinity: 1792,
      ...UNITY,
      clampCounter: counter,
    });
    const ordinaryAffinity = researchRequirement(authoredAbove, {
      rediscovery: true,
      rediscoveryAffinity: 1024,
      ...UNITY,
      clampCounter: counter,
    });
    expect(gifted).toBeLessThan(ordinaryAffinity);
    expect(gifted).toBeGreaterThanOrEqual(4096 * 3);
  });

  /**
   * The disproof condition, driven through the shipped operation rather than
   * through the requirement function: *rediscovery completes below the
   * multiplier*. Progress is accumulated a step at a time, through the stream-3
   * jitter, and the assertion is that no instance appears until the accumulated
   * progress has cleared three times what the same subject's ordinary research
   * would have cost.
   */
  it('never completes a rediscovery below three times ordinary research', () => {
    const knowledge = universeKnowing();
    knowledge.destroyInstancesHeldBy(ARCHMAGE, 50);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);

    const ordinary = researchRequirement(testCatalog().node(ROOT_NODE) as KnowledgeNode, {
      rediscovery: false,
      rediscoveryAffinity: 1024,
      ...UNITY,
      clampCounter: createRediscoveryClampCounter(),
    });
    const floorOfTheClaim = ordinary * 3;

    let progress = 0;
    let steps = 0;
    let completedAt = -1;
    let completedWith = 0;

    for (let tick = 60; tick < 160; tick += 1) {
      const outcome = researchStep(knowledge, { progress, effort: 512, tick });
      progress = outcome.progress;
      steps += 1;
      expect(outcome.rediscovery).toBe(true);

      if (!outcome.completed) {
        // The disproof condition, asserted every step: nothing was created, and
        // the progress that failed to create it is below the claimed floor
        // whenever the requirement is what makes it fail.
        expect(outcome.instance).toBe(0);
        expect(knowledge.exists(ROOT_NODE)).toBe(false);
        expect(progress).toBeLessThan(outcome.required);
        continue;
      }

      completedAt = steps;
      completedWith = progress;
      expect(outcome.instance).not.toBe(0);
      expect(outcome.required).toBeGreaterThanOrEqual(floorOfTheClaim);
      expect(progress).toBeGreaterThanOrEqual(floorOfTheClaim);
      break;
    }

    expect(completedAt).toBeGreaterThan(0);
    expect(completedWith).toBeGreaterThanOrEqual(floorOfTheClaim);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);

    // The comparison that makes the number mean something: a universe that
    // never knew the node buys it with the ordinary price, in far fewer steps.
    const fresh = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    let freshProgress = 0;
    let freshSteps = 0;
    for (let tick = 60; tick < 160; tick += 1) {
      const outcome = researchStep(fresh, { progress: freshProgress, effort: 512, tick });
      freshProgress = outcome.progress;
      freshSteps += 1;
      expect(outcome.rediscovery).toBe(false);
      if (outcome.completed) break;
    }
    expect(fresh.exists(ROOT_NODE)).toBe(true);
    expect(freshSteps).toBeLessThan(completedAt);
    // Four times, not three, because content authors above the floor: the node
    // in the fixture declares `rediscoveryMultiplier` `fp(4096)`.
    expect(div(mul(4096, 4096), 1024)).toBe(16384);
    expect(completedAt).toBeGreaterThanOrEqual(freshSteps * 3);
  });

  /**
   * A node this universe never held is ordinary research, at every rate. The
   * claim is about *re*discovery, and an implementation that charged the
   * multiplier for everything would satisfy every assertion above while making
   * the distinction the ever-known record exists to draw meaningless.
   */
  it('charges the multiplier only for a node this universe has lost', () => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    for (const learnRate of LEARN_RATES) {
      for (const researchRate of RESEARCH_RATES) {
        const node = nodeCosting(4096, 4096);
        const rates = {
          learnRate,
          researchRate,
          rediscoveryAffinity: 1024,
          clampCounter: createRediscoveryClampCounter(),
        };
        expect(researchRequirement(node, { rediscovery: false, ...rates })).toBe(
          div(4096, mul(learnRate, researchRate)),
        );
      }
    }
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(false);
    expect(researchStep(knowledge, { effort: 0 }).rediscovery).toBe(false);
    expect(researchStep(knowledge, { effort: 0 }).required).toBe(4096);
    expect(DEFAULT_INITIAL_MASTERY).toBeLessThan(MASTERY_MAX);
  });
});
