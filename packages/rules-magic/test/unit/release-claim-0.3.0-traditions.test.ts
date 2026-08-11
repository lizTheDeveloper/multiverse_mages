/*
 * Multiverse Mages — the 0.3.0 release claim about what a tradition may change.
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
 * > Each of the three v1 traditions changes measurable behaviour through its
 * > declared hook, and through no other path.
 *
 * **Disproved by**, verbatim: *"two traditions producing identical outcomes on
 * a scenario that should distinguish them, or a tradition altering behaviour
 * outside its four hooks."*
 *
 * Named for the claim rather than for the module, so that an auditor of 0.3.0
 * finds the evidence without reading the suite. The two disproof conditions are
 * two `describe` blocks, and the sentence has two halves that fail differently:
 *
 * - **"changes measurable behaviour"** fails when a tradition is a label. Every
 *   pair of the three v1 records must differ on a seeded scenario run through
 *   the shipped operations — `research`, `teach`, `scribe`, decay, destruction —
 *   not merely on a hook policy object.
 * - **"and through no other path"** is the half people skip. It fails when a
 *   tradition perturbs something it never declared, which would still satisfy
 *   the first half while being exactly what `vision.md` §4a caps hooks to
 *   prevent: a bespoke behaviour the balance harness cannot enumerate, showing
 *   up at 0.5.0 as unexplained variance in a Monte Carlo sweep.
 *
 * ## How "no other path" is actually defended, and by what jointly
 *
 * `rules-magic` has no coordinator: the shipped operations receive a tradition's
 * effects as *parameters* (a scaled cost, a location kind, a `StoreHook`), which
 * is what `contracts.md` §5 requires of a package that may not import
 * `rules-world`. So the wiring below — `applyAcquire` → costs and mastery,
 * `storePolicy` → location kind and written storage — is the wiring a caller
 * would do, and this file cannot by itself prove that no *other* caller wires
 * something extra. Three things prove it together, and only the first two are
 * here:
 *
 * 1. **Agreement through the real functions.** `traditions agree outside their
 *    differing hooks` resolves each tradition's hooks and then runs research
 *    refusals, prerequisite satisfaction, cell legality and `decayHeldKnowledge`
 *    — none of which take a tradition — and asserts one identical log for all
 *    three.
 * 2. **Structural containment per hook.** `acquire: true-name` is shown to leave
 *    the store, cast and cost policies bit-identical to the `standard` ones, and
 *    `store: palace` is shown to make instances unlootable and untransferable at
 *    *every* location kind it can hold, rather than carrying a flag.
 * 3. **The conformance scan**, `tradition-conformance.test.ts` (task 6.14),
 *    which fails if any file in `packages/rules-magic/src` outside
 *    `traditions/hook-for.ts` so much as reads `traditionId`. That is the leg
 *    this file deliberately does not duplicate: a second copy of the scan would
 *    be a second thing to keep in step with the source layout.
 *
 * Task 6.15's `tradition-differentiation.test.ts` asserts the same two halves at
 * the hook-policy level. This file is the release-claim counterpart and differs
 * on purpose: it drives the knowledge subsystem, so a hook that resolved
 * correctly and then failed to change what a mage can actually do would pass
 * there and fail here.
 */

import { describe, expect, it } from 'vitest';

import { createRediscoveryClampCounter } from '@mm/primitives';
import { GRIMOIRE, LOCATION_KIND, componentOf } from '@mm/state';
import type { LocationKindValue } from '@mm/state';

import {
  DEFAULT_INITIAL_MASTERY,
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_MAX,
} from '../../src/instances/constants.js';
import { decayHeldKnowledge } from '../../src/instances/decay.js';
import { research } from '../../src/instances/research.js';
import { scribe } from '../../src/instances/scribing.js';
import type { StoreHook } from '../../src/instances/scribing.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { teach } from '../../src/instances/teaching.js';
import type { InstanceView, StorePolicy } from '../../src/traditions/index.js';
import {
  RESOLUTION,
  UNBOUNDED_SLOTS,
  admitToStore,
  applyAcquire,
  canHoldAt,
  castCost,
  castPolicy,
  changeTradition,
  costPolicy,
  expendOnCast,
  hooksOfTradition,
  palaceLibraryDepth,
  prepare,
  preparationCost,
  scribeAvailability,
  storePolicy,
} from '../../src/traditions/index.js';
import {
  ART_OF_MEMORY,
  TRADITIONS,
  TRUE_NAMING,
  V1_TRADITIONS,
  VANCIAN,
} from './tradition-fixtures.js';
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

const ARCHMAGE = 700;
const STUDENT = 701;
/** A mage who exists only to have her personal store filled to its brim. */
const HOARDER = 702;
/**
 * How full a personal store is driven before one more acquisition is attempted,
 * when the tradition declares no bound of its own.
 *
 * Deeper than the deepest v1 bound, so the unbounded traditions are probed past
 * the point the bounded one refuses and the comparison is not an artefact of
 * stopping early.
 */
const PROBE_FILL = 12;
/** Base costs before any hook has a say. Identical for every tradition. */
const BASE_RESEARCH_COST = 4096;
const BASE_TEACH_COST = 1024;
const BASE_CAST_COST = 3072;
/** Identical supplied rates, so a difference can only come from a hook. */
const UNITY = { learnRate: 1024, researchRate: 1024 } as const;
/** Every location kind, for the policies that answer per kind. */
const ALL_LOCATION_KINDS: readonly LocationKindValue[] = [
  LOCATION_KIND.mind,
  LOCATION_KIND.grimoire,
  LOCATION_KIND.library,
  LOCATION_KIND.palace,
];

/** Everything one seeded run observed. Comparable with `toEqual`. */
interface Transcript {
  readonly researchCost: number;
  readonly researchSteps: number;
  readonly instanceLocationKind: number;
  readonly instanceMastery: number;
  readonly teachCost: number;
  readonly teachRefusal: string;
  readonly studentMastery: number;
  readonly scribeRefusal: string;
  readonly grimoiresInWorld: number;
  readonly instancesAfterScribing: number;
  readonly thirteenthAdmitted: boolean;
  /** What the tradition's `store` hook declares. `0` when it declares no bound. */
  readonly declaredSlots: number;
  /** The refusal a full personal store produced from the shipped `research` path. */
  readonly overflowRefusal: string;
  /** What the probed mage was left holding once the store had been overfilled. */
  readonly heldAfterOverflow: number;
  readonly prepared: boolean;
  readonly preparedAfterCast: readonly number[];
  readonly costAtPreparation: number;
  readonly costAtRelease: number;
  readonly palaceDepth: number;
  readonly lossesOnHolderDeath: readonly number[];
  readonly survivesItsHolder: boolean;
}

/** What a full personal store did to one more acquisition. */
interface OverflowProbe {
  readonly refusal: string;
  readonly held: number;
}

/**
 * Fills a mage's personal store and then researches one node too many.
 *
 * **This is the store bound as an outcome rather than as a question.** Asking
 * `admitToStore(store, 12)` proves the policy object can do arithmetic; it
 * proved nothing about acquisition, and for the whole of 0.3.0's development it
 * was true while a mage could research her thirtieth palace instance unimpeded.
 * So the probe drives the shipped `research` path and reports what the mage is
 * left holding.
 *
 * Run on its own world so that overfilling one does not perturb the scripted
 * transcript's existence counts, loss events or grimoire tally — the probe is
 * about the bound, and a probe that moved the other readings would make every
 * one of them harder to attribute.
 *
 * A tradition declaring no bound is filled to {@link PROBE_FILL} anyway, so
 * that "refused at twelve" and "not refused at twelve" are the same experiment
 * run twice rather than two different ones.
 */
function overflowProbe(store: StorePolicy): OverflowProbe {
  const fill = store.slotsPerMage === UNBOUNDED_SLOTS ? PROBE_FILL : store.slotsPerMage;
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  for (let held = 0; held < fill; held += 1) {
    // A founding grant through the subsystem's own writer: how a universe
    // starts out knowing things. The acquisition under test is the one below.
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: store.personalLocationKind,
      locationId: HOARDER,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });
  }

  let refusal = '';
  let progress = 0;
  for (let tick = 400; tick < 460; tick += 1) {
    const outcome = research({
      knowledge,
      catalog: testCatalog(),
      cells: testCells,
      ruleset: permissiveRuleset(),
      rng: stepRng(23, tick),
      subject: HOARDER,
      nodeId: OTHER_CELL_NODE,
      worldTick: tick,
      progress,
      effort: BASE_RESEARCH_COST,
      ...UNITY,
      rediscoveryAffinity: 1024,
      clampCounter: createRediscoveryClampCounter(),
      initialMastery: MASTERY_MAX,
      store,
    });
    progress = outcome.progress;
    refusal = outcome.refusal?.reason ?? '';
    if (outcome.completed || outcome.refusal !== undefined) break;
  }

  return {
    refusal,
    held: knowledge.instancesAt(store.personalLocationKind, HOARDER).length,
  };
}

/**
 * One seeded scenario, run under one tradition, through the shipped operations.
 *
 * The script is fixed and identical for all three; the only variable is which
 * tradition's four hooks are resolved at the top. Nothing draws from a stream
 * the others do not draw from at the same tick, so "seeded" here means the RNG
 * is the same for every run and any divergence is the tradition's doing.
 */
function transcript(tradition: number): Transcript {
  const hooks = hooksOfTradition(tradition, TRADITIONS);
  const acquire = applyAcquire(hooks.acquire, {
    baseResearchCost: BASE_RESEARCH_COST,
    baseTeachCost: BASE_TEACH_COST,
    baseInitialMastery: DEFAULT_INITIAL_MASTERY,
    baseStolenMastery: DEFAULT_INITIAL_MASTERY,
  });
  const store = storePolicy(hooks.store);
  const cast = castPolicy(hooks.cast);
  const cost = costPolicy(hooks.cost);

  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const catalog = testCatalog({
    researchCost: acquire.researchCost,
    teachCost: acquire.teachCost,
  });
  const ruleset = permissiveRuleset();
  const written: StoreHook = { kind: store.kind, keepsWrittenCopies: store.scribingAvailable };

  // 1. The archmage derives the node. `acquire` decides what it costs her and
  //    what mastery it arrives at; `store` decides where it lands.
  //    Effort per step is a constant the tradition has no say in, so the step
  //    count is a direct reading of what the `acquire` hook charged.
  let researchSteps = 0;
  let progress = 0;
  let instance = 0;
  for (let tick = 10; tick < 200 && instance === 0; tick += 1) {
    const outcome = research({
      knowledge,
      catalog,
      cells: testCells,
      ruleset,
      rng: stepRng(11, tick),
      subject: ARCHMAGE,
      nodeId: ROOT_NODE,
      worldTick: tick,
      progress,
      effort: 512,
      ...UNITY,
      rediscoveryAffinity: 1024,
      clampCounter: createRediscoveryClampCounter(),
      initialMastery: acquire.initialMastery,
      store,
    });
    researchSteps += 1;
    progress = outcome.progress;
    instance = outcome.instance;
  }
  const created = knowledge.read(instance);

  // 2. She teaches it. Whether she *may* is a consequence of the mastery the
  //    acquire hook created the instance at, against a threshold no hook owns.
  const taught = teach({
    knowledge,
    catalog,
    cells: testCells,
    ruleset,
    rng: stepRng(11, 220),
    teacher: ARCHMAGE,
    student: STUDENT,
    nodeId: ROOT_NODE,
    worldTick: 220,
    store,
  });

  // 3. She tries to write it down. Only the `store` hook can refuse this.
  const scribed = scribe({
    knowledge,
    catalog,
    cells: testCells,
    ruleset,
    rng: stepRng(11, 221),
    scribe: ARCHMAGE,
    nodeId: ROOT_NODE,
    worldTick: 221,
    store: written,
    scribeAffinity: 1024,
    scribeCapacity: 1024 * 16,
    materials: 1024 * 16,
  });

  // 4. Preparation, release, and what each costs.
  const preparation = prepare(cast, [], { nodeId: ROOT_NODE, usable: true, dormant: false });
  const released = expendOnCast(cast, preparation.preparedSpells, ROOT_NODE);

  // 5. She dies. What survives her is the whole bargain of the `store` hook.
  const losses = knowledge.destroyInstancesHeldBy(ARCHMAGE, 240);

  // 6. Elsewhere, a mage fills her personal store and reaches for one more.
  const overflow = overflowProbe(store);

  return {
    researchCost: acquire.researchCost,
    researchSteps,
    instanceLocationKind: created.locationKind,
    instanceMastery: created.mastery,
    teachCost: acquire.teachCost,
    teachRefusal: taught.refusal?.reason ?? '',
    studentMastery: taught.mastery,
    scribeRefusal: scribed.refusal?.reason ?? '',
    grimoiresInWorld: componentOf(knowledge.state, GRIMOIRE).size,
    instancesAfterScribing: knowledge.instanceCount(ROOT_NODE) + losses.length,
    thirteenthAdmitted: admitToStore(store, PROBE_FILL).admitted,
    declaredSlots: store.slotsPerMage,
    overflowRefusal: overflow.refusal,
    heldAfterOverflow: overflow.held,
    prepared: preparation.prepared,
    preparedAfterCast: released.preparedSpells,
    costAtPreparation: preparationCost(cost, BASE_CAST_COST),
    costAtRelease: castCost(cost, BASE_CAST_COST),
    palaceDepth: palaceLibraryDepth(store, [{ mageId: ARCHMAGE, tierWeightedCount: 15 }]),
    lossesOnHolderDeath: losses.map((loss) => loss.location),
    survivesItsHolder: knowledge.exists(ROOT_NODE),
  };
}

describe('release claim 0.3.0 — each v1 tradition changes measurable behaviour', () => {
  const runs = new Map(V1_TRADITIONS.map(([name, id]) => [name, transcript(id)]));

  /**
   * Disproof condition, first half: *two traditions producing identical
   * outcomes on a scenario that should distinguish them.*
   */
  for (let i = 0; i < V1_TRADITIONS.length; i += 1) {
    for (let j = i + 1; j < V1_TRADITIONS.length; j += 1) {
      const left = V1_TRADITIONS[i]?.[0] ?? '';
      const right = V1_TRADITIONS[j]?.[0] ?? '';

      it(`${left} and ${right} do not produce the same run`, () => {
        expect(runs.get(left)).not.toEqual(runs.get(right));
      });
    }
  }

  it('is reproducible: the same seeded scenario twice under each tradition', () => {
    for (const [, id] of V1_TRADITIONS) expect(transcript(id)).toEqual(transcript(id));
  });

  /**
   * Differing *through the declared hook*, not incidentally. The claim is not
   * that the three runs differ — three coin flips would differ — but that each
   * difference is attributable to the hook that tradition declares.
   */
  it('Vancian differs through cast and cost, its two declared hooks', () => {
    const vancian = runs.get('vancian-memorization');
    const trueNaming = runs.get('true-naming');

    // cast: prepared — a spell must be readied, and casting spends the readying.
    expect(vancian?.prepared).toBe(true);
    expect(vancian?.preparedAfterCast).toEqual([]);
    expect(trueNaming?.prepared).toBe(false);

    // cost: prepaid — the price moves from release to preparation, and the two
    // halves still sum to the base cost, so `prepaid` is a schedule not a discount.
    expect(vancian?.costAtRelease).toBe(0);
    expect(vancian?.costAtPreparation).toBe(BASE_CAST_COST);
    expect((vancian?.costAtPreparation ?? 0) + (vancian?.costAtRelease ?? 0)).toBe(BASE_CAST_COST);
    expect(trueNaming?.costAtRelease).toBe(BASE_CAST_COST);
    expect(trueNaming?.costAtPreparation).toBe(0);

    // And its two standard hooks changed nothing: it stores and acquires like
    // any standard tradition.
    expect(vancian?.researchCost).toBe(BASE_RESEARCH_COST);
    expect(vancian?.instanceLocationKind).toBe(LOCATION_KIND.mind);
  });

  it('True Naming differs through acquire, its one declared hook', () => {
    const trueNaming = runs.get('true-naming');
    const vancian = runs.get('vancian-memorization');

    // Research dearer, teaching cheaper — the two costs the hook owns.
    expect(trueNaming?.researchCost).toBeGreaterThan(vancian?.researchCost ?? 0);
    expect(trueNaming?.teachCost).toBeLessThan(vancian?.teachCost ?? 0);
    expect(trueNaming?.researchSteps).toBeGreaterThan(vancian?.researchSteps ?? 0);

    // A name is known or it is not: the instance arrives complete, and is
    // therefore immediately teachable without transmission loss — where the
    // standard traditions' fresh instance is below the teaching threshold.
    expect(trueNaming?.instanceMastery).toBe(MASTERY_MAX);
    expect(trueNaming?.teachRefusal).toBe('');
    expect(trueNaming?.studentMastery).toBe(MASTERY_MAX);
    expect(vancian?.instanceMastery).toBe(DEFAULT_INITIAL_MASTERY);
    expect(vancian?.teachRefusal).toBe('teacher-below-threshold');
    expect(DEFAULT_INITIAL_MASTERY).toBeLessThan(DEFAULT_TEACH_THRESHOLD);

    // And it stores, casts and pays exactly as a standard tradition does.
    expect(trueNaming?.instanceLocationKind).toBe(LOCATION_KIND.mind);
    expect(trueNaming?.scribeRefusal).toBe('');
    expect(trueNaming?.costAtRelease).toBe(BASE_CAST_COST);
  });

  it('the Art of Memory differs through store, its one declared hook', () => {
    const artOfMemory = runs.get('art-of-memory');
    const vancian = runs.get('vancian-memorization');

    // The instance lands in a palace, not a mind, and the palace is bounded.
    expect(artOfMemory?.instanceLocationKind).toBe(LOCATION_KIND.palace);
    expect(artOfMemory?.thirteenthAdmitted).toBe(false);
    expect(vancian?.thirteenthAdmitted).toBe(true);

    // And bounded *in the simulation*, not only in the policy object: a mage
    // whose palace is full is refused by the shipped `research` path, the
    // refusal names the declared count, and she ends holding exactly it —
    // where a standard mage sails past the same depth. The claim is
    // "changes measurable behaviour", and this is the measurement.
    expect(artOfMemory?.overflowRefusal).toBe('personal-store-full');
    expect(artOfMemory?.heldAfterOverflow).toBe(artOfMemory?.declaredSlots);
    expect(artOfMemory?.declaredSlots).toBeGreaterThan(0);
    expect(vancian?.overflowRefusal).toBe('');
    expect(vancian?.heldAfterOverflow).toBe(PROBE_FILL + 1);
    expect(vancian?.declaredSlots).toBe(UNBOUNDED_SLOTS);

    // Nothing is written down — and this is the shipped `scribe` refusing,
    // not a flag: no grimoire entity exists in the world afterwards.
    expect(artOfMemory?.scribeRefusal).toBe('written-storage-unavailable');
    expect(artOfMemory?.grimoiresInWorld).toBe(0);
    expect(vancian?.grimoiresInWorld).toBe(1);

    // So when the holder dies the node dies with her, from a palace — where a
    // standard universe's copy survives on a shelf. This is the tradition's
    // whole bargain, and it is observable as a loss event and as existence.
    expect(artOfMemory?.lossesOnHolderDeath).toEqual([LOCATION_KIND.palace]);
    expect(artOfMemory?.survivesItsHolder).toBe(false);
    expect(vancian?.lossesOnHolderDeath).toEqual([]);
    expect(vancian?.survivesItsHolder).toBe(true);

    // And its universities draw depth from living minds, which no standard
    // tradition does — the coefficient is content, so this is not code.
    expect(artOfMemory?.palaceDepth).toBeGreaterThan(0);
    expect(vancian?.palaceDepth).toBe(0);
  });
});

/**
 * A scenario built from nothing any hook has a word for: research
 * prerequisites, cell legality, dormancy and deterministic decay, with
 * identical supplied rates and identical base costs.
 *
 * The tradition is resolved at the top **deliberately**. A leak past the four
 * hooks would have to happen downstream of exactly this call, and a scenario
 * that never resolved a tradition could not detect one.
 */
function unhookedScenario(tradition: number): readonly (number | string)[] {
  const hooks = hooksOfTradition(tradition, TRADITIONS);
  expect(Object.keys(hooks).sort()).toEqual(['acquire', 'cast', 'cost', 'store']);

  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  const catalog = testCatalog();
  const log: (number | string)[] = [];

  function step(nodeId: number, ruleset: ReturnType<typeof permissiveRuleset>, tick: number) {
    const outcome = research({
      knowledge,
      catalog,
      cells: testCells,
      ruleset,
      rng: stepRng(19, tick),
      subject: ARCHMAGE,
      nodeId,
      worldTick: tick,
      progress: 0,
      effort: 1024 * 64,
      ...UNITY,
      rediscoveryAffinity: 1024,
      clampCounter: createRediscoveryClampCounter(),
    });
    log.push(outcome.refusal?.reason ?? '', outcome.required, outcome.progress, outcome.instance);
    return outcome;
  }

  // Cell legality: an interdicted cell refuses acquisition outright.
  step(OTHER_CELL_NODE, interdicting(OTHER_CELL), 300);

  // Prerequisites: unheld refuses, held satisfies.
  step(CHILD_NODE, permissiveRuleset(), 301);
  step(ROOT_NODE, permissiveRuleset(), 302);
  step(CHILD_NODE, permissiveRuleset(), 303);

  // A *dormant* prerequisite satisfies nothing, which is legality and
  // prerequisites at once and is the shape a stored dormancy flag would break.
  step(OTHER_CELL_NODE, permissiveRuleset(), 304);
  step(CROSS_CELL_CHILD, interdicting(OTHER_CELL), 305);
  step(CROSS_CELL_CHILD, permissiveRuleset(), 306);

  // Deterministic decay: to a retention-derived floor while permitted, and
  // floorlessly to destruction once the cell is interdicted.
  for (let tick = 310; tick < 330; tick += 1) {
    decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset: permissiveRuleset(),
      elapsedTicks: 4,
      worldTick: tick,
      retentionOf: () => 1536,
    });
    for (const instance of knowledge.instances()) log.push(knowledge.read(instance).mastery);
  }
  for (let tick = 330; tick < 360; tick += 1) {
    const losses = decayHeldKnowledge({
      knowledge,
      cells: testCells,
      ruleset: interdicting(HOME_CELL),
      elapsedTicks: 8,
      worldTick: tick,
      retentionOf: () => 1536,
    });
    for (const loss of losses) log.push(loss.nodeId, loss.worldTick, loss.location);
    log.push(knowledge.instances().length);
  }

  log.push(knowledge.exists(ROOT_NODE) ? 1 : 0, knowledge.wasEverKnown(ROOT_NODE) ? 1 : 0);
  return log;
}

describe('release claim 0.3.0 — and through no other path', () => {
  /**
   * Disproof condition, second half: *a tradition altering behaviour outside
   * its four hooks.* All three v1 traditions must produce one identical log.
   */
  it('all three traditions produce one identical log outside their hooks', () => {
    const [first = [], ...rest] = V1_TRADITIONS.map(([, id]) => unhookedScenario(id));
    expect(first.length).toBeGreaterThan(100);
    for (const other of rest) expect(other).toEqual(first);
  });

  it('is not vacuous — the scenario observed refusals, decay, and a loss', () => {
    const log = unhookedScenario(VANCIAN);
    expect(log).toContain('forbidden-cell');
    expect(log).toContain('unsatisfied-prerequisite');
    // A node was lost to floorless dormant decay, and stayed ever-known.
    expect(log.at(-2)).toBe(0);
    expect(log.at(-1)).toBe(1);
    // And the hooked scenario does distinguish the same traditions, so the
    // equality above is a containment result and not an inert script.
    expect(transcript(VANCIAN)).not.toEqual(transcript(TRUE_NAMING));
  });

  /**
   * `acquire: true-name` has no effect on decay, storage, casting, or cost.
   *
   * `magic-traditions` states it as a MUST NOT, and the containment is
   * structural: the hook's entire vocabulary is four costs. Asserted three
   * ways — the resolved policies of the other three hooks are identical to a
   * `standard` tradition's, and decay under a supplied retention is identical.
   */
  it('acquire: true-name touches nothing but the four acquire terms', () => {
    const trueNaming = hooksOfTradition(TRUE_NAMING, TRADITIONS);
    const vancian = hooksOfTradition(VANCIAN, TRADITIONS);
    const artOfMemory = hooksOfTradition(ART_OF_MEMORY, TRADITIONS);

    // Storage: identical to Vancian's, which declares `store: standard`.
    expectSameStore(storePolicy(trueNaming.store), storePolicy(vancian.store));

    // Casting and cost: identical to the Art of Memory's, which declares both
    // `standard`. (Vancian declares neither, which is Vancian's business.)
    expect(castPolicy(trueNaming.cast)).toEqual(castPolicy(artOfMemory.cast));
    expect(costPolicy(trueNaming.cost)).toEqual(costPolicy(artOfMemory.cost));

    // Decay: `magic-traditions` names this case explicitly. A True Naming mind
    // instance carried forward under a supplied retention decays by exactly the
    // same amount as an identical instance under a standard acquire tradition.
    // It has to: `decayHeldKnowledge` takes no tradition, by construction, and
    // the assertion is here so that giving it one would go red.
    const logs = [TRUE_NAMING, VANCIAN, ART_OF_MEMORY].map((tradition) => {
      const hooks = hooksOfTradition(tradition, TRADITIONS);
      expect(hooks.acquire.point).toBe('acquire');
      const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
      knowledge.createInstance({
        nodeId: ROOT_NODE,
        locationKind: LOCATION_KIND.mind,
        locationId: ARCHMAGE,
        acquiredTick: 0,
        mastery: MASTERY_MAX,
      });
      const masteries: number[] = [];
      for (let tick = 400; tick < 440; tick += 1) {
        decayHeldKnowledge({
          knowledge,
          cells: testCells,
          ruleset: permissiveRuleset(),
          elapsedTicks: 2,
          worldTick: tick,
          retentionOf: () => 1536,
        });
        for (const instance of knowledge.instances()) masteries.push(knowledge.read(instance).mastery);
      }
      return masteries;
    });
    expect(logs[0]).toEqual(logs[1]);
    expect(logs[0]).toEqual(logs[2]);
    // Non-vacuous: the instance genuinely decayed and genuinely settled.
    expect(logs[0]?.[0]).toBeLessThan(MASTERY_MAX);
    expect(logs[0]?.at(-1)).toBeGreaterThan(0);
  });

  /**
   * `store: palace` makes instances genuinely unlootable and untransferable,
   * not merely flagged.
   *
   * "Genuinely" is the load-bearing word, and one boolean returning `false`
   * would not establish it. Three facts together do: there is no location kind
   * a palace tradition can hold at which an instance is lootable or
   * transferable; the only operation that could turn knowledge into an object
   * refuses and creates no object; and adopting the tradition destroys the
   * objects a previous one made rather than carrying them across.
   */
  it('store: palace leaves no route by which an instance becomes an object', () => {
    const palace = storePolicy(hooksOfTradition(ART_OF_MEMORY, TRADITIONS).store);
    const standard = storePolicy(hooksOfTradition(VANCIAN, TRADITIONS).store);

    // 1. Nothing it can hold is lootable, transferable, or burnable.
    for (const kind of palace.holdableLocationKinds) {
      expect(palace.lootableAt(kind)).toBe(false);
      expect(palace.transferableAt(kind)).toBe(false);
      expect(palace.burnableAt(kind)).toBe(false);
    }
    // And it cannot hold the kinds that *are* objects at all.
    expect(canHoldAt(palace, LOCATION_KIND.grimoire)).toBe(false);
    expect(canHoldAt(palace, LOCATION_KIND.library)).toBe(false);
    // The control: a standard tradition's written copies are all three.
    expect(standard.lootableAt(LOCATION_KIND.grimoire)).toBe(true);
    expect(standard.transferableAt(LOCATION_KIND.library)).toBe(true);
    expect(standard.burnableAt(LOCATION_KIND.grimoire)).toBe(true);
    // A mind is an object under neither, at every kind either can hold.
    for (const kind of ALL_LOCATION_KINDS) {
      if (kind === LOCATION_KIND.mind) {
        expect(palace.lootableAt(kind)).toBe(false);
        expect(standard.lootableAt(kind)).toBe(false);
      }
    }

    // 2. The one operation that makes an object refuses, and makes nothing.
    expect(scribeAvailability(palace).available).toBe(false);
    const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.palace,
      locationId: ARCHMAGE,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });
    const attempted = scribe({
      knowledge,
      catalog: testCatalog(),
      cells: testCells,
      ruleset: permissiveRuleset(),
      rng: stepRng(23, 500),
      scribe: ARCHMAGE,
      nodeId: ROOT_NODE,
      worldTick: 500,
      store: { kind: palace.kind, keepsWrittenCopies: palace.scribingAvailable },
      scribeAffinity: 2048,
      scribeCapacity: 1024 * 64,
      materials: 1024 * 64,
    });
    expect(attempted.refusal).toEqual({
      reason: 'written-storage-unavailable',
      nodeId: ROOT_NODE,
      storeKind: 'palace',
    });
    expect(attempted.grimoire).toBe(0);
    expect(attempted.instance).toBe(0);
    expect(componentOf(knowledge.state, GRIMOIRE).size).toBe(0);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);

    // 3. Adopting the tradition destroys the objects an earlier one made,
    //    rather than leaving them addressable at a location it cannot describe.
    const inherited: readonly InstanceView[] = [
      { instanceId: 1, nodeId: ROOT_NODE, locationKind: LOCATION_KIND.mind, locationId: ARCHMAGE },
      { instanceId: 2, nodeId: CHILD_NODE, locationKind: LOCATION_KIND.grimoire, locationId: 90 },
      { instanceId: 3, nodeId: CHILD_NODE, locationKind: LOCATION_KIND.library, locationId: 91 },
    ];
    const change = changeTradition({
      outgoingStore: hooksOfTradition(VANCIAN, TRADITIONS).store,
      incomingStore: hooksOfTradition(ART_OF_MEMORY, TRADITIONS).store,
      instances: inherited,
      worldTick: 501,
    });
    expect(change.applied).toBe(true);
    expect(change.destroyed).toEqual([2, 3]);
    expect(change.resolutions.map((entry) => entry.resolution)).toEqual([
      RESOLUTION.kept,
      RESOLUTION.destroyed,
      RESOLUTION.destroyed,
    ]);
    expect(change.losses).toEqual([
      { nodeId: CHILD_NODE, worldTick: 501, location: LOCATION_KIND.library },
    ]);
  });
});

/** Two store policies agree on every field and on every per-kind answer. */
function expectSameStore(left: StorePolicy, right: StorePolicy): void {
  expect(left.kind).toBe(right.kind);
  expect(left.holdableLocationKinds).toEqual(right.holdableLocationKinds);
  expect(left.personalLocationKind).toBe(right.personalLocationKind);
  expect(left.slotsPerMage).toBe(right.slotsPerMage);
  expect(left.scribingAvailable).toBe(right.scribingAvailable);
  expect(left.perishesWithHolder).toEqual(right.perishesWithHolder);
  expect(left.libraryDepthCoefficient).toBe(right.libraryDepthCoefficient);
  for (const kind of ALL_LOCATION_KINDS) {
    expect(left.lootableAt(kind)).toBe(right.lootableAt(kind));
    expect(left.transferableAt(kind)).toBe(right.transferableAt(kind));
    expect(left.burnableAt(kind)).toBe(right.burnableAt(kind));
  }
}
