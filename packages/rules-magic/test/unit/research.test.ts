/*
 * Multiverse Mages — research, rediscovery, and the 3× floor.
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

import { describe, expect, it } from 'vitest';

import { mul } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

import {
  REDISCOVERY_FLOOR,
  createRediscoveryClampCounter,
  effectiveRediscoveryMultiplier,
} from '@mm/primitives';

import { catalogOf } from '../../src/instances/catalog.js';
import type { ResearchInputs } from '../../src/instances/research.js';
import { research, researchRequirement } from '../../src/instances/research.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type { PersonalStore } from '../../src/traditions/store.js';
import { UNBOUNDED_SLOTS } from '../../src/traditions/store.js';
import {
  CHILD_NODE,
  CROSS_CELL_CHILD,
  HOME_CELL,
  OTHER_CELL,
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

const SUBJECT = 4096;
const FULL = 1024;

function fixture(): { knowledge: KnowledgeSubsystem } {
  return { knowledge: new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT) };
}

function inputs(
  knowledge: KnowledgeSubsystem,
  overrides: Partial<ResearchInputs> = {},
): ResearchInputs {
  return {
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(9, 3),
    subject: SUBJECT,
    nodeId: ROOT_NODE,
    worldTick: 3,
    progress: 0,
    effort: 0,
    learnRate: FULL,
    researchRate: FULL,
    rediscoveryAffinity: FULL,
    clampCounter: createRediscoveryClampCounter(),
    ...overrides,
  };
}

describe('research', () => {
  it('creates a mind instance when progress reaches the requirement', () => {
    const { knowledge } = fixture();
    const outcome = research(inputs(knowledge, { progress: 4096, effort: 1024 }));

    expect(outcome.refusal).toBeUndefined();
    expect(outcome.completed).toBe(true);
    expect(outcome.instance).not.toBe(0);
    const created = knowledge.read(outcome.instance);
    expect(created.locationKind).toBe(LOCATION_KIND.mind);
    expect(created.locationId).toBe(SUBJECT);
    expect(created.acquiredTick).toBe(3);
    expect(created.mastery).toBeGreaterThan(0);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
    expect(knowledge.wasEverKnown(ROOT_NODE)).toBe(true);
  });

  it('accumulates progress without completing, and carries it forward', () => {
    const { knowledge } = fixture();
    const first = research(inputs(knowledge, { progress: 0, effort: 512 }));
    expect(first.completed).toBe(false);
    expect(first.instance).toBe(0);
    expect(first.progress).toBeGreaterThan(0);
    expect(first.progress).toBeLessThan(first.required);

    const second = research(inputs(knowledge, { progress: first.progress, effort: 512 }));
    expect(second.progress).toBeGreaterThan(first.progress);
  });

  it('refuses an interdicted cell, naming it, and accumulates nothing', () => {
    const { knowledge } = fixture();
    const outcome = research(
      inputs(knowledge, { ruleset: interdicting(HOME_CELL), progress: 4096, effort: 4096 }),
    );

    expect(outcome.refusal).toEqual({
      reason: 'forbidden-cell',
      nodeId: ROOT_NODE,
      cellId: HOME_CELL,
    });
    expect(outcome.progress).toBe(4096);
    expect(outcome.instance).toBe(0);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  it('refuses an unheld prerequisite, naming it', () => {
    const { knowledge } = fixture();
    const outcome = research(
      inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 1024 }),
    );

    expect(outcome.refusal).toEqual({
      reason: 'unsatisfied-prerequisite',
      nodeId: CHILD_NODE,
      prerequisiteId: ROOT_NODE,
      subject: SUBJECT,
    });
    expect(outcome.instance).toBe(0);
  });

  it('accepts a prerequisite the subject holds, and refuses a dormant one', () => {
    const { knowledge } = fixture();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SUBJECT,
      acquiredTick: 0,
      mastery: FULL,
    });

    const held = research(inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 1024 }));
    expect(held.refusal).toBeUndefined();
    expect(held.completed).toBe(true);

    // Re-permitting is what restores it; a dormant instance satisfies nothing,
    // so a god cannot route research *through* their own interdiction.
    const dormant = research(
      inputs(knowledge, {
        nodeId: CHILD_NODE,
        progress: 99999,
        effort: 1024,
        ruleset: interdicting(HOME_CELL),
      }),
    );
    expect(dormant.refusal?.reason).toBe('forbidden-cell');
  });

  it('satisfies a prerequisite in another cell, and refuses when that cell is forbidden', () => {
    const { knowledge } = fixture();
    knowledge.createInstance({
      nodeId: OTHER_CELL_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: SUBJECT,
      acquiredTick: 0,
      mastery: FULL,
    });

    const permitted = research(
      inputs(knowledge, { nodeId: CROSS_CELL_CHILD, progress: 99999, effort: 0 }),
    );
    expect(permitted.refusal).toBeUndefined();
    expect(permitted.completed).toBe(true);

    // The node's own cell stays permitted; only its prerequisite's is closed.
    // A god may not route research *through* their own interdiction.
    const routed = research(
      inputs(knowledge, {
        nodeId: CROSS_CELL_CHILD,
        progress: 99999,
        effort: 0,
        ruleset: interdicting(OTHER_CELL),
      }),
    );
    expect(routed.refusal).toEqual({
      reason: 'unsatisfied-prerequisite',
      nodeId: CROSS_CELL_CHILD,
      prerequisiteId: OTHER_CELL_NODE,
      subject: SUBJECT,
    });
  });

  it('throws on a node this content set does not declare', () => {
    const { knowledge } = fixture();
    expect(() => research(inputs(knowledge, { nodeId: 99 }))).toThrow(/No node with id 99/u);
  });

  describe("the store hook's slot bound", () => {
    /** A two-slot palace: small enough to fill, shaped like the shipped one. */
    const BOUNDED: PersonalStore = {
      kind: 'palace',
      personalLocationKind: LOCATION_KIND.palace,
      slotsPerMage: 2,
    };
    /** What `store: standard` resolves to, and what every other tradition gets. */
    const UNBOUNDED: PersonalStore = {
      kind: 'standard',
      personalLocationKind: LOCATION_KIND.mind,
      slotsPerMage: UNBOUNDED_SLOTS,
    };

    function fill(knowledge: KnowledgeSubsystem, store: PersonalStore, count: number): void {
      for (let held = 0; held < count; held += 1) {
        knowledge.createInstance({
          nodeId: ROOT_NODE,
          locationKind: store.personalLocationKind,
          locationId: SUBJECT,
          acquiredTick: 0,
          mastery: FULL,
        });
      }
    }

    it('refuses once the store is full, and names the declared count', () => {
      const { knowledge } = fixture();
      fill(knowledge, BOUNDED, BOUNDED.slotsPerMage);

      const outcome = research(
        inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 0, store: BOUNDED }),
      );

      expect(outcome.refusal).toEqual({
        reason: 'personal-store-full',
        nodeId: CHILD_NODE,
        subject: SUBJECT,
        storeKind: 'palace',
        held: 2,
        slotsPerMage: 2,
      });
      expect(outcome.completed).toBe(false);
      // Refused before the effort was spent, not after: progress is untouched.
      expect(outcome.progress).toBe(99999);
    });

    it('admits up to the bound and lands the instance where the hook says', () => {
      const { knowledge } = fixture();
      fill(knowledge, BOUNDED, BOUNDED.slotsPerMage - 1);

      const outcome = research(
        inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 0, store: BOUNDED }),
      );

      expect(outcome.refusal).toBeUndefined();
      expect(knowledge.read(outcome.instance).locationKind).toBe(LOCATION_KIND.palace);
      expect(knowledge.instancesAt(LOCATION_KIND.palace, SUBJECT)).toHaveLength(2);
    });

    it('leaves a tradition that declares no bound exactly as it was', () => {
      const { knowledge } = fixture();
      fill(knowledge, UNBOUNDED, 50);

      const outcome = research(
        inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 0, store: UNBOUNDED }),
      );

      // Fifty deep and still admitted — this is the Vancian and True Naming
      // case, and the bound existing must not cost them a single instance.
      expect(outcome.refusal).toBeUndefined();
      expect(knowledge.instancesHeldBy(SUBJECT)).toHaveLength(51);
    });

    it('counts only that mage, at only that store', () => {
      const { knowledge } = fixture();
      // A full palace's worth of instances — but in a *mind*, which is where a
      // tradition change into the Art of Memory leaves what a mage already
      // knew. `slotsPerMage` bounds the palace, so these spend nothing.
      for (let held = 0; held < 5; held += 1) {
        knowledge.createInstance({
          nodeId: ROOT_NODE,
          locationKind: LOCATION_KIND.mind,
          locationId: SUBJECT,
          acquiredTick: 0,
          mastery: FULL,
        });
      }
      // And another mage's full palace is her own business.
      for (let held = 0; held < 5; held += 1) {
        knowledge.createInstance({
          nodeId: ROOT_NODE,
          locationKind: LOCATION_KIND.palace,
          locationId: SUBJECT + 1,
          acquiredTick: 0,
          mastery: FULL,
        });
      }

      const outcome = research(
        inputs(knowledge, { nodeId: CHILD_NODE, progress: 99999, effort: 0, store: BOUNDED }),
      );
      expect(outcome.refusal).toBeUndefined();
      expect(outcome.completed).toBe(true);
    });
  });

  it('draws its jitter from stream 3, so the same seed reproduces the step', () => {
    const { knowledge } = fixture();
    const once = research(inputs(knowledge, { effort: 1024, rng: stepRng(11, 3) }));
    const again = research(inputs(knowledge, { effort: 1024, rng: stepRng(11, 3) }));
    const elsewhere = research(inputs(knowledge, { effort: 1024, rng: stepRng(12, 3) }));

    expect(again.progress).toBe(once.progress);
    expect(elsewhere.progress).not.toBe(once.progress);
  });
});

describe('rediscovery', () => {
  const lostNode = (): KnowledgeSubsystem => {
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    const instance = knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 55,
      acquiredTick: 0,
      mastery: FULL,
    });
    knowledge.destroyInstance(instance, 1);
    return knowledge;
  };

  it('costs the declared multiplier, and completion below it creates nothing', () => {
    const knowledge = lostNode();
    const required = mul(4096, mul(4096, FULL));

    const short = research(inputs(knowledge, { progress: required - 1, effort: 0 }));
    expect(short.rediscovery).toBe(true);
    expect(short.required).toBe(required);
    expect(short.completed).toBe(false);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);

    const enough = research(inputs(knowledge, { progress: required, effort: 0 }));
    expect(enough.completed).toBe(true);
    expect(knowledge.exists(ROOT_NODE)).toBe(true);
  });

  /**
   * **Direction settled by `contracts.md` §2.4.** This test previously called
   * `fp(768)` "gnomish" and asserted it was cheaper, which is the multiplier
   * reading — written from `knowledge-instances`' scenario wording rather than
   * from the contract or the data. §2.4 is normative and makes
   * `rediscoveryAffinity` a *divisor*, and the shipped gnome carries `fp(1792)`,
   * not `fp(768)` — `fp(768)` is the dwarf, a below-average rediscoverer. So the
   * fixture is now the real gnome and the comparison stands as written.
   *
   * The node is authored at `fp(6144)` rather than the shared catalog's
   * `fp(4096)` because the assertion is about differentiating *above* the floor,
   * and `fp(4096)` cannot: §2.3 rejects it by name, since `4096 × 1024 / 1792`
   * is `2340`, under the floor, and the gnome clamps flat. `fp(6144)` clears the
   * `fp(5376)` break-even `content`'s `V1_REDISCOVERY_AUTHORING_FLOOR` enforces.
   */
  it('lets a higher affinity differentiate above the floor', () => {
    const knowledge = lostNode();
    const authoredAboveBreakEven = catalogOf([
      {
        nodeId: ROOT_NODE,
        tier: 1,
        prerequisites: [],
        researchCost: 4096,
        teachCost: 1024,
        scribeCost: 2048,
        rediscoveryMultiplier: 6144,
      },
    ]);
    const at = (rediscoveryAffinity: number): number =>
      research(
        inputs(knowledge, {
          catalog: authoredAboveBreakEven,
          progress: 0,
          effort: 0,
          rediscoveryAffinity,
        }),
      ).required;

    const gnomish = at(1792);
    const ordinary = at(FULL);
    const orcish = at(512);

    // Higher affinity is cheaper, monotonically, across the shipped span.
    expect(gnomish).toBeLessThan(ordinary);
    expect(ordinary).toBeLessThan(orcish);
    // And nobody, including the best rediscoverer alive, gets under 3×.
    expect(gnomish).toBeGreaterThanOrEqual(mul(4096, REDISCOVERY_FLOOR));
    expect(ordinary).toBeGreaterThanOrEqual(mul(4096, REDISCOVERY_FLOOR));
    // Above the floor, not merely at it — which is what "differentiate" means.
    expect(gnomish).toBeGreaterThan(mul(4096, REDISCOVERY_FLOOR));
  });

  /**
   * **Direction settled by `contracts.md` §2.4.** The strong affinity here was
   * `fp(512)`, which under the divisor reading is the *orc* — the worst
   * rediscoverer in v1 content, who pays `3072 × 1024 / 512 = fp(6144)` and is
   * never anywhere near the floor. The species that actually threatens the
   * release claim is the gnome at `fp(1792)`: `3072 × 1024 / 1792 = 1755`, well
   * under `fp(3072)`, so the clamp is what keeps 0.3.0's "at least 3×" true.
   */
  it('clamps to three times research cost however strong the affinity', () => {
    const knowledge = lostNode();
    const atTheFloor = catalogOf([
      {
        nodeId: ROOT_NODE,
        tier: 1,
        prerequisites: [],
        researchCost: 4096,
        teachCost: 1024,
        scribeCost: 2048,
        rediscoveryMultiplier: REDISCOVERY_FLOOR,
      },
    ]);

    const outcome = research(
      inputs(knowledge, {
        catalog: atTheFloor,
        progress: 0,
        effort: 0,
        rediscoveryAffinity: 1792,
      }),
    );

    expect(outcome.required).toBe(mul(4096, REDISCOVERY_FLOOR));
    expect(outcome.required).toBe(4096 * 3);
  });

  it('never yields an effective multiplier below the floor, for any affinity', () => {
    const counter = createRediscoveryClampCounter();
    for (const affinity of [1, 128, 512, 768, FULL, 1792, 2048, 8192]) {
      expect(
        effectiveRediscoveryMultiplier(REDISCOVERY_FLOOR, affinity, counter),
      ).toBeGreaterThanOrEqual(REDISCOVERY_FLOOR);
      expect(effectiveRediscoveryMultiplier(8192, affinity, counter)).toBeGreaterThanOrEqual(
        REDISCOVERY_FLOOR,
      );
    }
    // The counter is not decoration: the floor really did bind on the strong
    // affinities here, and a run in which it never bound would be a different
    // (and equally reportable) finding.
    expect(counter.evaluated).toBe(16);
    expect(counter.floored).toBeGreaterThan(0);
  });

  it('charges ordinary research for a node this universe never knew', () => {
    const { knowledge } = fixture();
    const outcome = research(inputs(knowledge, { progress: 0, effort: 0 }));
    expect(outcome.rediscovery).toBe(false);
    expect(outcome.required).toBe(4096);
  });

  it('charges ordinary research while an instance still survives', () => {
    const { knowledge } = fixture();
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: 55,
      acquiredTick: 0,
      mastery: FULL,
    });

    const outcome = research(inputs(knowledge, { progress: 0, effort: 0 }));
    expect(outcome.rediscovery).toBe(false);
    expect(outcome.required).toBe(4096);
  });

  it('stays at three times the same subject’s ordinary cost at any rate', () => {
    // The claim is a *ratio*, not an absolute figure: learn rate scales the
    // requirement, so "three times research" means three times what research
    // would have cost this same subject. `div` floors, and floor(3x) is never
    // below 3·floor(x), so the ratio survives the rounding in both terms.
    const node = testCatalog().node(ROOT_NODE);
    expect(node).toBeDefined();

    for (const learnRate of [512, FULL, 2048]) {
      for (const researchRate of [768, FULL, 1536]) {
        const ordinary = researchRequirement(node!, {
          rediscovery: false,
          rediscoveryAffinity: FULL,
          learnRate,
          researchRate,
          clampCounter: createRediscoveryClampCounter(),
        });
        // **Direction settled by `contracts.md` §2.4.** This was `fp(128)`,
        // chosen as an absurdly *strong* affinity under the multiplier reading.
        // Under the divisor reading `fp(128)` is an absurdly *weak* one, which
        // makes rediscovery dearer and the assertion vacuous. `fp(8192)` is the
        // extreme in the direction that actually threatens the claim.
        const rediscovered = researchRequirement(node!, {
          rediscovery: true,
          rediscoveryAffinity: 8192,
          learnRate,
          researchRate,
          clampCounter: createRediscoveryClampCounter(),
        });
        expect(rediscovered).toBeGreaterThanOrEqual(ordinary * 3);
      }
    }
  });

  it('scales the requirement by learn rate and the stacked research-rate multiplier', () => {
    const node = testCatalog().node(ROOT_NODE);
    expect(node).toBeDefined();

    const slow = researchRequirement(node!, {
      rediscovery: false,
      rediscoveryAffinity: FULL,
      learnRate: 512,
      researchRate: FULL,
      clampCounter: createRediscoveryClampCounter(),
    });
    const quick = researchRequirement(node!, {
      rediscovery: false,
      rediscoveryAffinity: FULL,
      learnRate: 2048,
      researchRate: FULL,
      clampCounter: createRediscoveryClampCounter(),
    });

    expect(slow).toBeGreaterThan(4096);
    expect(quick).toBeLessThan(4096);
  });
});
