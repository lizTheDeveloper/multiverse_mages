/*
 * Multiverse Mages — what the academics know changes how fast they work.
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
 * `universe-effects.test.ts` pins the economy's wire with real content. This is
 * the same file for the three rates a scholar's own knowledge moves, and it is
 * deliberately written at the **loop** rather than at `academicRateBonuses`.
 *
 * ## Why not a unit test on the multiplier
 *
 * Because that is the test that passed while this was broken. Before W18 you
 * could call `capitalRateMultiplier(researchRate, [128], 0)` and get `fp(1.125)`
 * back, correctly, every time — and no mage in any universe was ever handed a
 * `128`. A test that asserts a function returns the right number given the right
 * input cannot distinguish a connected pipeline from a disconnected one, which
 * is precisely the failure `check:consumption` exists to catch and precisely the
 * failure that survived four releases here.
 *
 * So every assertion below is on `WorldStepReport` counters — research
 * completed, lessons taught, grimoires scribed — produced by stepping a real
 * universe through `step`.
 *
 * ## The control arm is a *tier-matched set*, not an absent one
 *
 * A universe whose mages know one more thing is not a control: it researches a
 * different graph, its mages score goals differently, its library is deeper, and
 * any delta confounds "the rate moved" with "they knew more". So both arms grant
 * **the same number of nodes at the same tiers** to every mage, and the sets
 * differ only in which primitive the effects name.
 *
 * The treatment set is *every* v1 node carrying the primitive — which is the
 * claim the change is actually making, and the multiplier it buys is worth
 * stating because it is what makes the effect visible at all:
 *
 * | primitive | v1 nodes | tiers | Σ magnitude | `(1 + Σ)` |
 * | --- | ---: | --- | ---: | ---: |
 * | `research-rate` | 7 | 1,1,1,2,3,3,4 | 1600 | ×2.5625 |
 * | `teach-rate` | 5 | 1,2,2,4,4 | 1152 | ×2.1250 |
 * | `scribe-rate` | 4 | 2,2,3,4 | 960 | ×1.9375 |
 *
 * The control set is drawn, tier for tier, from the v1 nodes whose every effect
 * names a primitive **nothing consumes** — `ward`, `direct-damage`,
 * `concealment`, `area-denial`, `blink`, `summon`, `knowledge-steal`, which are
 * exactly the seven still in `check:consumption`'s failure list. Granting one is
 * granting a node that is inert by construction. When they acquire a consumer
 * this file's controls stop being controls, so {@link INERT_PRIMITIVES} is
 * asserted against that list rather than left as a comment.
 *
 * ## One month is already enough for most work, and that bounds what can move
 *
 * A finding, recorded here because it explains a shape a reader will otherwise
 * read as a broken wire. `MAGE_MONTHS_PER_TICK` is `fp(1)`, a teaching pair
 * pushes two of them, and `contracts.md` §2.3's authored costs are `teachCost`
 * 512 at tier 1 doubling per tier, `scribeCost` 1024 likewise. So a tier-1
 * lesson completes in one tick at *any* multiplier — it is already four times
 * saturated — and a tier-1 grimoire completes in exactly one. A rate can only
 * change a **count** where the work spans more than one month, which is tier 4
 * and up for teaching and tier 2 and up for scribing.
 *
 * This is why the arms below grant the whole set rather than one node: ×1.125
 * from a single tier-1 node crosses almost no tick boundary anywhere in the v1
 * rectangle, and a test built on one would have reported "no effect" for a wire
 * that works.
 *
 * ## And an ablation arm, which holds even the nodes identical
 *
 * The matched control still differs by seven content ids. The ablation arm does
 * not: both arms grant the *same* set and differ only in whether §9's mask
 * neutralizes the primitive. That is the argument `ablation.ts` makes for why a
 * mask is a better counterfactual than a content change, and it is the only test
 * of the mask reaching `capitalRateMultiplier` at all — a route that did not
 * exist before this change, because there was nothing on these three primitives
 * for a mask to neutralize.
 *
 * Note that the mask neutralizes the primitive's **whole** accumulator, the
 * library's depth term included. So the ablation delta is larger than the
 * node-sourced delta alone, and the two arms answer different questions on
 * purpose: the matched control isolates the nodes, the mask isolates the
 * primitive.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import {
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
  findUniverse,
  readRulesetForObservation,
} from '@mm/state';

import type { AcademicEffectIndex, WorldStepDeps, WorldStepReport } from '../../src/index.js';
import { createConsumptionRecorder } from '@mm/rules-magic';

import {
  academicEffectIndex,
  academicRateBonuses,
  defineWorldSimulation,
  neutralizing,
  universeEffectIndex,
} from '../../src/index.js';

import {
  registry,
  scribingTraditionId,
  seededWorld,
  sourceFor,
  worldDeps,
} from './world-fixtures.js';

const ROOT_SEED = 0x0004_1000;
/** Five world years, as `work-phase.test.ts` uses. Long enough for every counter below to be far from zero. */
const TICKS = 60;
/** `fp(1.0)` — a completed university (`contracts.md` §1.4), and full mastery. */
const FP_ONE = 1024;

/** The three rates a scholar's own knowledge moves. */
const ACADEMIC_PRIMITIVES = ['research-rate', 'teach-rate', 'scribe-rate'] as const;
type AcademicPrimitive = (typeof ACADEMIC_PRIMITIVES)[number];

/**
 * Primitives with no consumer anywhere, as of this change.
 *
 * The control sets are built out of nodes whose every effect names one of these,
 * so a control node is inert by construction rather than by hope. Asserted
 * against `check:consumption`'s failure list below, because the day one of them
 * acquires a consumer is the day this file's controls quietly stop being
 * controls.
 */
const INERT_PRIMITIVES = new Set([
  'area-denial',
  'blink',
  'concealment',
  'direct-damage',
  'knowledge-steal',
  'summon',
  'ward',
]);

/** Which report counter each primitive is expected to move. */
const METRIC = {
  'research-rate': 'researchCompleted',
  'teach-rate': 'lessonsTaught',
  'scribe-rate': 'grimoiresScribed',
} as const;

interface NodeFacts {
  readonly contentId: number;
  readonly id: string;
  readonly tier: number;
  readonly primitives: ReadonlySet<string>;
}

/** Every v1 node, with the facts the arms are matched on. Content, not fixture. */
function v1Nodes(): readonly NodeFacts[] {
  const content = registry();
  const v1 = new Set(
    content.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.id),
  );
  return content.nodes
    .filter((entry) => v1.has(entry.record.cell))
    .map((entry) => ({
      contentId: entry.contentId,
      id: entry.record.id,
      tier: entry.record.tier,
      primitives: new Set(entry.record.effects.map((effect) => effect.primitive)),
    }))
    .sort((left, right) => left.contentId - right.contentId);
}

/** Every v1 node carrying `primitive`. The treatment set. */
function treatmentSet(primitive: AcademicPrimitive): readonly NodeFacts[] {
  const found = v1Nodes().filter((node) => node.primitives.has(primitive));
  if (found.length === 0) {
    throw new Error(
      `No v1 node carries ${primitive}. This file's whole claim is that the shipped v1 rectangle ` +
        'authors these effects, so an empty set is a content change that invalidates the test ' +
        'rather than a test that should pass vacuously.',
    );
  }
  return found;
}

/**
 * A set matching `treatment` tier for tier, out of nodes with only inert effects.
 *
 * Ascending content id, so the choice is a function of the content set and not
 * of iteration order — the same reason `foundingCandidates` sorts.
 */
function controlSet(treatment: readonly NodeFacts[]): readonly NodeFacts[] {
  const pool = v1Nodes().filter(
    (node) =>
      node.primitives.size > 0 && [...node.primitives].every((id) => INERT_PRIMITIVES.has(id)),
  );
  const taken = new Set<number>();
  const chosen: NodeFacts[] = [];
  for (const node of treatment) {
    const match = pool.find((candidate) => candidate.tier === node.tier && !taken.has(candidate.contentId));
    if (match === undefined) {
      throw new Error(
        `No unused inert v1 node at tier ${String(node.tier)} to match ${node.id}. The control arm ` +
          'has to hold tier for tier, because tier drives cost, library depth and goal scoring ' +
          'alike — an unmatched arm would confound the rate with the graph.',
      );
    }
    taken.add(match.contentId);
    chosen.push(match);
  }
  return chosen;
}

/** What one arm is. */
interface Arm {
  /** The nodes every mage is granted at full mastery. */
  readonly grant: readonly NodeFacts[];
  /** A primitive §9's mask neutralizes, or absent for the unmasked arm. */
  readonly ablate?: string;
}

/** What one arm did over {@link TICKS}. */
interface ArmTotals {
  readonly researchCompleted: number;
  readonly lessonsTaught: number;
  readonly grimoiresScribed: number;
  readonly instances: number;
  readonly grimoires: number;
  readonly nodesKnown: number;
}

/**
 * Steps one arm and sums its report counters.
 *
 * `academicEffects` is supplied here rather than in the shared `worldDeps`
 * fixture, for the reason that fixture already gives for `universeEffects`:
 * wiring it into the default would silently make every other test in this
 * package a test of this wire.
 */
/**
 * Arms are pure functions of their inputs, so each is stepped once per process.
 *
 * Not only for speed. A run here is ~1.5 s of tight synchronous stepping, and
 * vitest's worker sends a progress heartbeat over an RPC that a blocked event
 * loop starves — the run then fails with `Timeout calling "onTaskUpdate"` while
 * every assertion passes, which is the most confusing possible way for a suite
 * to go red. {@link stepped} yields once per world year for the same reason,
 * which is the pattern `long-run.ts` already established.
 */
const armCache = new Map<string, Promise<ArmTotals>>();

async function armTotals(arm: Arm): Promise<ArmTotals> {
  const traditionId = scribingTraditionId();
  const base = worldDeps(traditionId);
  const deps: WorldStepDeps = {
    ...base,
    academicEffects: academicEffectIndex(registry()),
    ...(arm.ablate === undefined ? {} : { ablation: neutralizing(arm.ablate) }),
  };
  const key = `${arm.grant.map((node) => node.id).join(',')}|${arm.ablate ?? ''}`;
  const hit = armCache.get(key);
  if (hit !== undefined) return hit;
  const run = stepped(deps, arm.grant);
  armCache.set(key, run);
  return run;
}

/** The shared stepping loop, so the no-index arm below is the same run minus one dep. */
async function stepped(deps: WorldStepDeps, grant: readonly NodeFacts[]): Promise<ArmTotals> {
  const simulation = defineWorldSimulation(deps);
  const { state } = seededWorld(simulation.schema, {
    rootSeed: ROOT_SEED,
    traditionId: scribingTraditionId(),
  });
  withAnAcademy(state, grant);
  const source = sourceFor(ROOT_SEED);

  let current = state;
  let researchCompleted = 0;
  let lessonsTaught = 0;
  let grimoiresScribed = 0;
  for (let tick = 0; tick < TICKS; tick += 1) {
    // Once per world year, so the worker's progress RPC is not starved by a
    // minute of unbroken synchronous stepping. `runLongReference` yields on the
    // same boundary and says why.
    if (tick > 0 && tick % 12 === 0) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    current = step(current, [], source);
    const report = simulation.lastReport() as WorldStepReport;
    researchCompleted += report.researchCompleted;
    lessonsTaught += report.lessonsTaught;
    grimoiresScribed += report.grimoiresScribed;
  }
  const instances = componentOf(current, KNOWLEDGE_INSTANCE).size;
  const grimoires = componentOf(current, GRIMOIRE).size;
  const known = new Set<number>();
  for (const { row } of collectRecords(current, KNOWLEDGE_INSTANCE)) known.add(row.nodeId);
  return {
    researchCompleted,
    lessonsTaught,
    grimoiresScribed,
    instances,
    grimoires,
    nodesKnown: known.size,
  };
}

/**
 * A completed university, every mage affiliated and holding `granted`, and one
 * founder holding a teachable seed node.
 *
 * The academy half is lifted from `work-phase.test.ts`, whose module note
 * records why both preconditions have to be supplied by hand at 0.4.0: nothing
 * raises mastery, so a self-researched instance can never be taught, and an
 * unaffiliated mage has zero scribe throughput.
 *
 * The seed node goes to **one** mage and the arm's set to **every** mage, and
 * the split is what makes a lesson possible at all: teaching needs a holder and
 * a non-holder, so the thing being taught must not be the thing everyone already
 * knows. Node 1 is the lowest-numbered node the catalog declares and has no
 * prerequisites — `work-phase.test.ts` seeds it for the same reason — and it
 * carries no academic effect, so it is the same seed in every arm.
 */
function withAnAcademy(state: SimState, granted: readonly NodeFacts[]): void {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: 0 });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: 64,
    buildProgress: FP_ONE,
  });

  const mages = componentOf(state, MAGE);
  const roster: EntityHandle[] = [];
  mages.forEach((_row, handle) => {
    roster.push(handle);
    mages.set(handle, 'universityId', university);
  });

  const hold = (mage: EntityHandle, nodeId: number): void => {
    const instance = state.entities.create();
    attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
      nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: mage,
      acquiredTick: 0,
      mastery: FP_ONE,
    });
  };

  const founder = roster[0];
  if (founder === undefined) throw new Error('the fixture seeded no mages');
  hold(founder, 1);

  for (const mage of roster) {
    for (const node of granted) hold(mage, node.contentId);
  }
}

/** A line a reader can check against the tables in the module note. */
function lift(label: string, treatment: number, control: number): string {
  const pct = control === 0 ? Number.NaN : ((treatment - control) / control) * 100;
  return `${label}: control ${String(control)} -> treatment ${String(treatment)} (${pct.toFixed(1)}%)`;
}

describe('the control sets are inert by construction', () => {
  it('names only primitives no consumer in this package registers', () => {
    // The assumption the whole control arm rests on, checked rather than
    // asserted in a comment. Every node-driven consumer this package has
    // registers from the line that reads its magnitudes, so a recorder threaded
    // through both index builders holds the complete list of primitives a mage's
    // knowledge can move from here. An inert primitive appearing in it is a
    // control that has stopped being one.
    const recorder = createConsumptionRecorder();
    academicEffectIndex(registry(), recorder);
    universeEffectIndex(registry(), recorder);

    const consumed = recorder
      .registrations()
      .filter((entry) => entry.kind === 'node' && entry.nodeCount > 0)
      .map((entry) => entry.primitiveId);

    for (const primitive of INERT_PRIMITIVES) expect(consumed).not.toContain(primitive);
  });

  it('matches every treatment node with an unused inert node of the same tier', () => {
    for (const primitive of ACADEMIC_PRIMITIVES) {
      const treatment = treatmentSet(primitive);
      const control = controlSet(treatment);
      expect(control).toHaveLength(treatment.length);
      expect(control.map((node) => node.tier)).toEqual(treatment.map((node) => node.tier));
      for (const node of control) {
        for (const id of node.primitives) expect(INERT_PRIMITIVES.has(id)).toBe(true);
      }
    }
  });
});

describe('a universe that knows these nodes outworks one that does not', () => {
  // The headline claim, and the counterfactual is the **pre-W18 universe**: same
  // mages, same seed, same knowledge in the same heads, differing only in whether
  // what they know reaches their rates. `world-step.ts` documents the optional
  // dep as *"a thing a test can assert against rather than a silent
  // degradation"*; this is that assertion, run three times.
  it.each(ACADEMIC_PRIMITIVES)('%s: more work finished than when knowledge moves nothing', async (primitive) => {
    const grant = treatmentSet(primitive);
    const metric = METRIC[primitive];

    const knowing = await armTotals({ grant });
    const inert = await stepped(worldDeps(scribingTraditionId()), grant);

    console.log(lift(`${primitive} vs knowledge-moves-nothing (${metric})`, knowing[metric], inert[metric]));

    expect(inert[metric]).toBeGreaterThan(0);
    expect(knowing[metric]).toBeGreaterThan(inert[metric]);
  });

  it('ends holding more distinct nodes, not merely churning through more work', async () => {
    // `researchCompleted` counts completions including rediscoveries, so a
    // universe that forgets and relearns the same node scores well on it. This is
    // the check that the extra work is *retained*: distinct nodes held at the end
    // of the run.
    const grant = treatmentSet('research-rate');
    const knowing = await armTotals({ grant });
    const inert = await stepped(worldDeps(scribingTraditionId()), grant);

    console.log(lift('research-rate, distinct nodes held at the end', knowing.nodesKnown, inert.nodesKnown));
    expect(knowing.nodesKnown).toBeGreaterThan(inert.nodesKnown);
  });
});

describe("§9's mask reaches the academic rates, and attributes the gain", () => {
  // The stronger counterfactual, and a *different* claim: identical content,
  // identical grant, identical seed, and the mask names exactly one primitive. So
  // a delta here is attributable to that primitive, which the arm above is not —
  // omitting the index switches all three off at once, and a universe left to run
  // for five years discovers `research-rate` nodes whatever it was granted.
  //
  // The mask also neutralizes the library's depth term, because `stackMagnitudes`
  // is where §9 applies it and the library shares that accumulator by design. The
  // delta is therefore an upper bound on the node-sourced part, not an estimate
  // of it.
  it('attributes a large research gain to research-rate alone', async () => {
    const grant = treatmentSet('research-rate');
    const live = await armTotals({ grant });
    const masked = await armTotals({ grant, ablate: 'research-rate' });

    console.log(lift('ablate research-rate (researchCompleted)', live.researchCompleted, masked.researchCompleted));
    console.log(lift('ablate research-rate (nodesKnown)', live.nodesKnown, masked.nodesKnown));

    expect(live.researchCompleted).toBeGreaterThan(masked.researchCompleted);
    expect(live.nodesKnown).toBeGreaterThan(masked.nodesKnown);
  });

  it('attributes a grimoire gain to scribe-rate alone', async () => {
    const grant = treatmentSet('scribe-rate');
    const live = await armTotals({ grant });
    const masked = await armTotals({ grant, ablate: 'scribe-rate' });

    console.log(lift('ablate scribe-rate (grimoiresScribed)', live.grimoiresScribed, masked.grimoiresScribed));
    expect(live.grimoiresScribed).toBeGreaterThan(masked.grimoiresScribed);
  });

  it('finds no completion-count gain for teach-rate, because a lesson already fits in a month', async () => {
    // **A finding, asserted so it cannot rot into a silent zero.**
    //
    // `teach-rate`'s magnitudes reach the multiplier — the test below reads them
    // off a stepped universe — and neutralizing the primitive nonetheless moves
    // `lessonsTaught` by under two percent. The reason is arithmetic and lives in
    // the content, not in this wire: `MAGE_MONTHS_PER_TICK` is `fp(1)`, a
    // teaching pair pushes two of them, and `contracts.md` §2.3 authors
    // `teachCost` at 512 for tier 1, doubling per tier. A tier-1 lesson is
    // already four times saturated in a single tick and a tier-3 lesson fits
    // exactly, so no multiplier can change how many months either takes.
    //
    // Asserted as a **bound** rather than as equality, because the number is
    // allowed to move a little — goal selection is downstream of every other rate
    // — but a large move would mean the saturation reading is wrong and this
    // comment is lying to the next reader.
    const grant = treatmentSet('teach-rate');
    const live = await armTotals({ grant });
    const masked = await armTotals({ grant, ablate: 'teach-rate' });

    const relative = Math.abs(live.lessonsTaught - masked.lessonsTaught) / masked.lessonsTaught;
    console.log(lift('ablate teach-rate (lessonsTaught)', live.lessonsTaught, masked.lessonsTaught));

    expect(masked.lessonsTaught).toBeGreaterThan(0);
    expect(relative).toBeLessThan(0.1);
  });
});

describe('the magnitudes reach the mage, in a universe that has been running', () => {
  // Not a call to `academicRateBonuses` with hand-built input — that is the test
  // that passed while this was broken. The state below is the state a universe
  // arrived at after five years of stepping, and the question asked of it is
  // whether the loop's own per-mage lookup finds anything in it.
  //
  // This is what carries `teach-rate`'s claim, since the completion counter
  // cannot: the magnitudes are there, gathered through the same four-question
  // gate as everything else, and the reason they change no count is the content
  // fact recorded above rather than a broken wire.
  //
  // Only the positive is asserted. A control arm would not stay clean: five years
  // is long enough for mages granted inert nodes to *discover* academic ones, and
  // an assertion that they had none would be a claim about goal selection wearing
  // this file's name.
  it.each(ACADEMIC_PRIMITIVES)('%s: a holder is carrying magnitudes after five years', async (primitive) => {
    const grant = treatmentSet(primitive);
    const traditionId = scribingTraditionId();
    const deps: WorldStepDeps = {
      ...worldDeps(traditionId),
      academicEffects: academicEffectIndex(registry()),
    };
    const simulation = defineWorldSimulation(deps);
    const { state, mages } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED, traditionId });
    withAnAcademy(state, grant);
    const source = sourceFor(ROOT_SEED);

    let current = state;
    for (let tick = 0; tick < TICKS; tick += 1) current = step(current, [], source);

    const bonuses = academicRateBonuses(current, {
      index: deps.academicEffects as AcademicEffectIndex,
      cells: deps.cells,
      ruleset: readRulesetForObservation(current, findUniverse(current)),
    });

    // One per contributing instance, across every mage — the counter that falls
    // when a mage dies, when mastery decays below the threshold, and when a cell
    // is interdicted.
    expect(bonuses.contributingNodes).toBeGreaterThan(0);

    const magnitudesOf = {
      'research-rate': bonuses.researchRate,
      'teach-rate': bonuses.teachRate,
      'scribe-rate': bonuses.scribeRate,
    }[primitive];
    const carrying = mages.filter((mage) => magnitudesOf(mage).length > 0);
    expect(carrying.length).toBeGreaterThan(0);
    // Every magnitude is a positive `fp` the content authored, not a placeholder.
    for (const mage of carrying) {
      for (const magnitude of magnitudesOf(mage)) expect(magnitude).toBeGreaterThan(0);
    }
  });
});
