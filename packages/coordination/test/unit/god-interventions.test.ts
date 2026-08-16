/*
 * Multiverse Mages — every verb the god has, and what each one refuses.
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
 * The `interventions` spec, asserted against the dispatch rather than against
 * the loop.
 *
 * Every case here is a *pair*: the action resolving, and the same action refused
 * for one named reason. A test that only asserts the happy path cannot tell a
 * precondition that is enforced from one that was written down — and the
 * preconditions are most of what this capability is. A refusal is asserted three
 * ways at once, because any one of them alone can be satisfied by an
 * implementation that is wrong in a different way: the state is unchanged, the
 * favor pool is unchanged, and the illegal-action counter moved.
 */

import { describe, expect, it } from 'vitest';

import type { Action, EntityHandle, SimState } from '@mm/sim-core';
import { FP_ONE, createState, rngFromRootSeed } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import {
  BLESSING,
  EDICT,
  EDICT_KIND,
  ENCOURAGED_CELL,
  KNOWLEDGE_INSTANCE,
  MAGE,
  MAGE_ROLE,
  TERMINAL_REASON,
  UNIVERSE,
  UNIVERSITY,
  UPHEAVAL,
  collectRecords,
  componentOf,
  defineWorldStateSchema,
  findUniverse,
  permits,
  readEdicts,
  readRulesetForObservation,
  readUniverse,
} from '@mm/state';
import { KnowledgeSubsystem } from '@mm/rules-magic';

import type { InterventionDeps } from '../../src/index.js';
import { ACTION, emphasisAt, interventionCost, resolveInterventions } from '../../src/index.js';

import { catalogAndCells, registry } from './world-fixtures.js';
import { constants, costs, godWorld, nodesCarrying } from './god-fixtures.js';

const C = constants();
const COSTS = costs();
/** `sound-design.md` §5.2's eight bars, read from content rather than assumed. */
const UNEASE_BARS = C.uneaseBars;
const SCHEMA = defineWorldStateSchema([]);

/** A universe with enough favor to buy anything, and the deps to act on it. */
interface Bench {
  readonly state: SimState;
  readonly universe: EntityHandle;
  readonly mages: readonly EntityHandle[];
  readonly universities: readonly EntityHandle[];
  readonly deps: InterventionDeps;
  /** How many times a resolved action asked the clock to enter engagement. */
  readonly engagementRequests: number;
}

/**
 * A tick-bound RNG for the resolver, which needs one only for action 16's
 * personality roll. Bound at tick 0: these benches resolve one action against a
 * hand-built world, and the tick a draw is keyed on is not what any of them
 * measures.
 */
const TEST_RNG = {
  rootSeed: 1,
  stream: (subsystemId: number) => rngFromRootSeed(1).stream(subsystemId, 0),
  actorStream: (subsystemId: number, actorKey: number) =>
    rngFromRootSeed(1).actorStream(subsystemId, 0, actorKey),
};

function bench(options: Parameters<typeof godWorld>[1] = {}): Bench {
  const world = godWorld(SCHEMA, { favor: 1_000_000, ...options });
  const { catalog, cells } = catalogAndCells();
  const counter = { engagementRequests: 0 };
  const deps: InterventionDeps = {
    god: { constants: C, costs: COSTS },
    catalog,
    cells,
    knowledge: KnowledgeSubsystem.fromState(world.state, catalog.nodeCount),
    edictBudgetMax: 8,
    portalNodes: new Set(nodesCarrying('portal').keys()),
    invitableSpecies: new Set<number>(),
    speciesOf: () => undefined,
    rng: TEST_RNG,
    requestEngagement: () => {
      counter.engagementRequests += 1;
    },
  };
  return {
    ...world,
    deps,
    get engagementRequests() {
      return counter.engagementRequests;
    },
  };
}

function resolve(
  bench: Bench,
  actions: readonly Action[],
  worldTick = 0,
  mode: number = TIME_MODE.world,
): ReturnType<typeof resolveInterventions> {
  return resolveInterventions(bench.state, actions, worldTick, mode, bench.deps);
}

/** The nth seeded mage. Throws rather than letting `undefined` into a param list. */
function mage(b: Bench, index: number): EntityHandle {
  const handle = b.mages[index];
  if (handle === undefined) throw new Error(`the bench seeded no mage at index ${String(index)}`);
  return handle;
}

function favorOf(state: SimState, universe: EntityHandle): number {
  return componentOf(state, UNIVERSE).get(universe, 'favor');
}

/** The first interned node that declares no prerequisites, in a permitted cell. */
function grantableNode(state: SimState, universe: EntityHandle): { nodeId: number; tier: number } {
  const { catalog, cells } = catalogAndCells();
  const ruleset = readRulesetForObservation(state, universe);
  for (let nodeId = 1; nodeId <= catalog.nodeCount; nodeId += 1) {
    const node = catalog.node(nodeId);
    if (node === undefined || node.prerequisites.length > 0) continue;
    if (!permits(ruleset, cells.cellOf(nodeId))) continue;
    return { nodeId, tier: node.tier };
  }
  throw new Error('the shipped content offers no prerequisite-free node in a permitted cell');
}

/**
 * The 1-based form axis a 1-based cell id sits on.
 *
 * The grid is row-major over `GRID_FORM_COUNT` forms, so cell `c` is technique
 * `floor((c-1)/14)` and form `(c-1)%14` as *bits* — and `axisPlan` takes the
 * axis **1-based**, refusing anything below 1. Conflating the two is what made
 * an earlier draft of this file pass vacuously.
 */
function formAxisOf(cellId: number): number {
  return ((cellId - 1) % 14) + 1;
}

/** A node that declares prerequisites — what a grant must refuse. */
function gatedNode(): number {
  const { catalog } = catalogAndCells();
  for (let nodeId = 1; nodeId <= catalog.nodeCount; nodeId += 1) {
    if ((catalog.node(nodeId)?.prerequisites.length ?? 0) > 0) return nodeId;
  }
  throw new Error('the shipped content has no node with prerequisites');
}

describe('the dispatch owns exactly the action ids contracts.md §4.2 declares', () => {
  it('names all seventeen, from the no-op to the invitation', () => {
    // Transcribed from §4.2 one by one rather than compared against a derived
    // sequence, for the reason `actions.ts` gives: these ids are serialized into
    // action logs and indexed by a trained policy's output layer, so a
    // renumbering is silent everywhere.
    expect(ACTION).toEqual({
      noop: 0,
      permitTechnique: 1,
      forbidTechnique: 2,
      permitForm: 3,
      forbidForm: 4,
      issueDispensation: 5,
      issueInterdiction: 6,
      revokeEdict: 7,
      grantFoundingKnowledge: 8,
      blessMage: 9,
      assignRole: 10,
      fundUniversity: 11,
      encourageResearch: 12,
      changeTradition: 13,
      openPortal: 14,
      declareAscension: 15,
      inviteScholar: 16,
    });
  });

  it('prices every one of them, with no gap a free action could hide in', () => {
    // Seventeen since `w109`. This assertion is the one that caught the real
    // defect the append produced: `ACTION_ID_MAX` was written as a literal `15`
    // here in `coordination` *and* as `GOD_ACTION_ID_MAX` in `@mm/content`, only
    // the second moved, and the cost table was built one entry short — so the
    // new action was silently free. A length check is why that surfaced as a
    // failure rather than as a balance number nobody could explain.
    expect(COSTS.byAction).toHaveLength(17);
    for (const price of COSTS.byAction) expect(price).toBeGreaterThanOrEqual(0);
  });

  it('leaves an id outside the table alone rather than refusing it', () => {
    // §4.2 numbers from 0; `sim-core` numbers its clock actions from the top of
    // the `uint16` range precisely so they cannot collide, and an unrecognised
    // kind is *"somebody else's vocabulary"* rather than an illegal action.
    const b = bench();
    const before = b.state.illegalActionCount;
    resolve(b, [{ kind: 65_534 }]);
    expect(b.state.illegalActionCount).toBe(before);
  });
});

describe('every intervention is world-time only', () => {
  it('refuses all sixteen during engagement, leaving nothing changed', () => {
    // The bound is `inviteScholar` and not `declareAscension`, which is the
    // whole point of walking the range rather than listing ids: §4.2 says
    // silence in an earlier draft was not permission, and an action appended
    // after this test was written must be covered by it without anyone
    // remembering to come back. Inviting a foreign scholar mid-raid is a
    // frozen-policy violation exactly as squarely as blessing a defender is.
    const b = bench({ mages: 2 });
    const favorBefore = favorOf(b.state, b.universe);
    const submissions: Action[] = [];
    for (let kind = ACTION.permitTechnique; kind <= ACTION.inviteScholar; kind += 1) {
      submissions.push({ kind, params: [1, 1] });
    }
    const before = b.state.illegalActionCount;

    const report = resolve(b, submissions, 700, TIME_MODE.engagement);

    expect(report.applied).toBe(0);
    expect(report.refused).toBe(16);
    expect(b.state.illegalActionCount).toBe(before + 16);
    expect(favorOf(b.state, b.universe)).toBe(favorBefore);
    expect(readUniverse(b.state, b.universe).permittedTechniques).toBe(0b11111);
    expect(collectRecords(b.state, BLESSING)).toHaveLength(0);
  });

  it('refuses a blessing mid-raid specifically, deducting nothing', () => {
    const b = bench({ mages: 1 });
    const favorBefore = favorOf(b.state, b.universe);
    resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }], 0, TIME_MODE.engagement);
    expect(collectRecords(b.state, BLESSING)).toHaveLength(0);
    expect(favorOf(b.state, b.universe)).toBe(favorBefore);
  });

  it('refuses everything once the run has terminated', () => {
    const b = bench({ mages: 1 });
    componentOf(b.state, UNIVERSE).set(b.universe, 'terminalReason', TERMINAL_REASON.stagnation);
    const favorBefore = favorOf(b.state, b.universe);
    const report = resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.warden] }]);
    expect(report.applied).toBe(0);
    expect(report.refused).toBe(1);
    expect(favorOf(b.state, b.universe)).toBe(favorBefore);
  });
});

describe('technique and form toggles are symmetric and immediate', () => {
  it('clears the bit and charges the declared price', () => {
    // Axis ids are 1-based — `axisPlan` refuses anything below 1 — so technique
    // 1 is bit 0. Written out rather than derived, because getting it wrong is
    // how four of these tests first passed vacuously: every submission was
    // refused, so every "nothing was charged" assertion held for the wrong
    // reason.
    const b = bench();
    const before = favorOf(b.state, b.universe);
    const report = resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }]);
    expect(report.applied).toBe(1);
    expect(readUniverse(b.state, b.universe).permittedTechniques & 1).toBe(0);
    expect(before - favorOf(b.state, b.universe)).toBe(COSTS.byAction[ACTION.forbidTechnique]);
  });

  it('costs the same in each direction before hysteresis', () => {
    const forbid = bench();
    const forbidBefore = favorOf(forbid.state, forbid.universe);
    expect(resolve(forbid, [{ kind: ACTION.forbidTechnique, params: [1] }]).applied).toBe(1);
    const forbidSpend = forbidBefore - favorOf(forbid.state, forbid.universe);
    expect(forbidSpend).toBeGreaterThan(0);

    const permit = bench({ permittedTechniques: 0b11110 });
    const permitBefore = favorOf(permit.state, permit.universe);
    expect(resolve(permit, [{ kind: ACTION.permitTechnique, params: [1] }]).applied).toBe(1);
    expect(permitBefore - favorOf(permit.state, permit.universe)).toBe(forbidSpend);
  });

  it('routes legality through permits rather than through a cached cell list', () => {
    const b = bench();
    const { cells } = catalogAndCells();
    const cellId = cells.cellOf(grantableNode(b.state, b.universe).nodeId);
    expect(permits(readRulesetForObservation(b.state, b.universe), cellId)).toBe(true);
    // Forbid the whole form axis this cell sits on and ask again, through the
    // same one arbitration function. Nothing is invalidated and nothing is
    // rebuilt; the bitmask moved and `permits` answers differently.
    expect(resolve(b, [{ kind: ACTION.forbidForm, params: [formAxisOf(cellId)] }]).applied).toBe(1);
    expect(permits(readRulesetForObservation(b.state, b.universe), cellId)).toBe(false);
  });

  it('refuses a toggle that would not move the bit, rather than charging for it', () => {
    const b = bench();
    const before = favorOf(b.state, b.universe);
    const report = resolve(b, [{ kind: ACTION.permitTechnique, params: [1] }]);
    expect(report.applied).toBe(0);
    expect(report.refused).toBe(1);
    expect(favorOf(b.state, b.universe)).toBe(before);
  });

  it('escalates the price of a second flip of the same axis', () => {
    const b = bench();
    // Eight bars apart, which is `sound-design.md` §5.2's unease window. This
    // test is about hysteresis — the price of flipping *one axis* back and
    // forth — and letting the two acts land in the same phrase would measure
    // the product of two rules and attribute it to one.
    const first = favorOf(b.state, b.universe);
    expect(resolve(b, [{ kind: ACTION.forbidTechnique, params: [1] }], 0).applied).toBe(1);
    const afterFirst = favorOf(b.state, b.universe);
    expect(
      resolve(b, [{ kind: ACTION.permitTechnique, params: [1] }], UNEASE_BARS).applied,
    ).toBe(1);
    const afterSecond = favorOf(b.state, b.universe);
    expect(first - afterFirst).toBeGreaterThan(0);
    expect(afterFirst - afterSecond).toBe((first - afterFirst) * 2);
  });

  it('keeps escalation per axis rather than global', () => {
    const b = bench();
    const base = COSTS.byAction[ACTION.forbidTechnique] ?? 0;
    // One act per phrase, for the reason above.
    for (const [tick, kind] of [
      [0, ACTION.forbidTechnique],
      [UNEASE_BARS, ACTION.permitTechnique],
      [2 * UNEASE_BARS, ACTION.forbidTechnique],
    ] as const) {
      expect(resolve(b, [{ kind, params: [1] }], tick).applied).toBe(1);
    }
    const before = favorOf(b.state, b.universe);
    // A different technique, never touched, pays the base price.
    expect(
      resolve(b, [{ kind: ACTION.forbidTechnique, params: [2] }], 3 * UNEASE_BARS).applied,
    ).toBe(1);
    expect(before - favorOf(b.state, b.universe)).toBe(base);
  });

  it('applies a worship shock when forbidding strands knowledge, and none when it strands nothing', () => {
    const unused = bench();
    expect(resolve(unused, [{ kind: ACTION.forbidForm, params: [14] }]).applied).toBe(1);
    // No mage has ever studied anything, so nothing was stranded and no shock
    // worth having is in force.
    for (const { row } of collectRecords(unused.state, UPHEAVAL)) {
      expect(row.factor).toBe(FP_ONE);
    }

    const b = bench({ mages: 1 });
    const { nodeId } = grantableNode(b.state, b.universe);
    const { cells } = catalogAndCells();
    resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]);
    resolve(b, [{ kind: ACTION.forbidForm, params: [formAxisOf(cells.cellOf(nodeId))] }]);
    const shocks = collectRecords(b.state, UPHEAVAL).map(({ row }) => row.factor);
    expect(shocks.some((factor) => factor < FP_ONE)).toBe(true);
  });

  it('renders a forbidden cell inert rather than destroying its knowledge', () => {
    const b = bench({ mages: 1 });
    const { nodeId } = grantableNode(b.state, b.universe);
    const { cells } = catalogAndCells();
    resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]);
    const before = collectRecords(b.state, KNOWLEDGE_INSTANCE).map(({ row }) => ({ ...row }));

    const formAxis = formAxisOf(cells.cellOf(nodeId));
    resolve(b, [{ kind: ACTION.forbidForm, params: [formAxis] }]);
    resolve(b, [{ kind: ACTION.permitForm, params: [formAxis] }], 1);

    const after = collectRecords(b.state, KNOWLEDGE_INSTANCE).map(({ row }) => ({ ...row }));
    expect(after).toEqual(before);
  });
});

describe('edicts are single-cell exceptions bounded by the budget', () => {
  it('opens one forbidden cell with a dispensation and leaves its neighbours shut', () => {
    const b = bench({ permittedTechniques: 0b11110 });
    const ruleset = () => readRulesetForObservation(b.state, b.universe);
    const shut = [...Array(14).keys()].map((form) => form + 1).filter((cellId) => !permits(ruleset(), cellId));
    const target = shut[0];
    if (target === undefined) throw new Error('forbidding a technique shut no cell');

    resolve(b, [{ kind: ACTION.issueDispensation, params: [target] }]);
    expect(permits(ruleset(), target)).toBe(true);
    for (const cellId of shut.slice(1)) expect(permits(ruleset(), cellId)).toBe(false);
  });

  it('closes one permitted cell with an interdiction and leaves the rest open', () => {
    const b = bench();
    const ruleset = () => readRulesetForObservation(b.state, b.universe);
    resolve(b, [{ kind: ACTION.issueInterdiction, params: [3] }]);
    expect(permits(ruleset(), 3)).toBe(false);
    expect(permits(ruleset(), 4)).toBe(true);
  });

  it('refuses a vacuous edict, which would consume a slot and change nothing', () => {
    const b = bench();
    const before = favorOf(b.state, b.universe);
    // A dispensation naming a cell whose axes are both already permitted.
    const report = resolve(b, [{ kind: ACTION.issueDispensation, params: [3] }]);
    expect(report.refused).toBe(1);
    expect(readEdicts(b.state)).toHaveLength(0);
    expect(favorOf(b.state, b.universe)).toBe(before);
  });

  it('refuses a second edict once the budget is full', () => {
    const b = bench();
    componentOf(b.state, UNIVERSE).set(b.universe, 'edictBudget', 1);
    resolve(b, [{ kind: ACTION.issueInterdiction, params: [3] }]);
    expect(readEdicts(b.state)).toHaveLength(1);
    const report = resolve(b, [{ kind: ACTION.issueInterdiction, params: [4] }]);
    expect(report.refused).toBe(1);
    expect(readEdicts(b.state)).toHaveLength(1);
  });

  it('frees the slot on revocation, and restores the underlying axes', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.issueInterdiction, params: [3] }]);
    componentOf(b.state, UNIVERSE).set(b.universe, 'edictBudget', 1);
    resolve(b, [{ kind: ACTION.revokeEdict, params: [0] }]);
    expect(readEdicts(b.state)).toHaveLength(0);
    expect(permits(readRulesetForObservation(b.state, b.universe), 3)).toBe(true);
    // And the freed slot is usable in the same tick's successor.
    resolve(b, [{ kind: ACTION.issueInterdiction, params: [4] }]);
    expect(readEdicts(b.state)).toHaveLength(1);
  });

  it('refuses two edicts on one cell, which permits() would have to arbitrate', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.issueInterdiction, params: [3] }]);
    const report = resolve(b, [{ kind: ACTION.issueDispensation, params: [3] }]);
    expect(report.refused).toBe(1);
    expect(readEdicts(b.state).filter((edict) => edict.cellId === 3)).toHaveLength(1);
  });

  it('refuses a revocation of a slot that does not exist', () => {
    const b = bench();
    expect(resolve(b, [{ kind: ACTION.revokeEdict, params: [4] }]).refused).toBe(1);
    expect(resolve(b, [{ kind: ACTION.revokeEdict, params: [-1] }]).refused).toBe(1);
  });
});

describe('granting founding knowledge seeds roots and cannot buy a summit', () => {
  it('creates exactly one instance, at full mastery, in the named mage', () => {
    const b = bench({ mages: 1 });
    const { nodeId } = grantableNode(b.state, b.universe);
    resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]);

    const instances = collectRecords(b.state, KNOWLEDGE_INSTANCE).filter(
      ({ row }) => row.nodeId === nodeId,
    );
    expect(instances).toHaveLength(1);
    expect(instances[0]?.row.mastery).toBe(C.grantMastery);
    expect(instances[0]?.row.locationId).toBe(mage(b, 0));
  });

  it('charges the tier-scaled price', () => {
    const b = bench({ mages: 1 });
    const { nodeId, tier } = grantableNode(b.state, b.universe);
    const before = favorOf(b.state, b.universe);
    resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]);
    expect(before - favorOf(b.state, b.universe)).toBe(
      interventionCost(ACTION.grantFoundingKnowledge, COSTS, { nodeTier: tier }),
    );
  });

  it('refuses a node that declares prerequisites, which is how the summit stays unpurchasable', () => {
    // The load-bearing precondition. Without it the cheapest route to the
    // Apotheosis path is: save to the pool cap, buy the deepest node of a cell
    // outright, scribe a second copy, declare — and a condition built as a
    // conjunction of four unlikely facts becomes a favor-accumulation race.
    const b = bench({ mages: 1 });
    const before = favorOf(b.state, b.universe);
    const report = resolve(b, [
      { kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), gatedNode()] },
    ]);
    expect(report.refused).toBe(1);
    expect(collectRecords(b.state, KNOWLEDGE_INSTANCE)).toHaveLength(0);
    expect(favorOf(b.state, b.universe)).toBe(before);
  });

  it('refuses every node the universe already holds an instance of', () => {
    const b = bench({ mages: 2 });
    const { nodeId } = grantableNode(b.state, b.universe);
    resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]);
    const report = resolve(b, [
      { kind: ACTION.grantFoundingKnowledge, params: [mage(b, 1), nodeId] },
    ]);
    expect(report.refused).toBe(1);
    expect(
      collectRecords(b.state, KNOWLEDGE_INSTANCE).filter(({ row }) => row.nodeId === nodeId),
    ).toHaveLength(1);
  });

  it('refuses a forbidden cell and a dead mage', () => {
    const b = bench({ mages: 1 });
    const { nodeId } = grantableNode(b.state, b.universe);
    const { cells } = catalogAndCells();
    expect(
      resolve(b, [{ kind: ACTION.forbidForm, params: [formAxisOf(cells.cellOf(nodeId))] }]).applied,
    ).toBe(1);
    expect(
      resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]).refused,
    ).toBe(1);

    const alive = bench({ mages: 1 });
    componentOf(alive.state, MAGE).set(mage(alive, 0) as EntityHandle, 'alive', 0);
    const node = grantableNode(alive.state, alive.universe);
    expect(
      resolve(alive, [
        { kind: ACTION.grantFoundingKnowledge, params: [mage(alive, 0), node.nodeId] },
      ]).refused,
    ).toBe(1);
  });
});

describe('blessing refreshes, is bounded by tier, and touches no other mage field', () => {
  it('writes one row with the declared expiry', () => {
    const b = bench({ mages: 1 });
    resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }], 10);
    const rows = collectRecords(b.state, BLESSING);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.row.expiryTick).toBe(10 + C.blessDurationTicks);
  });

  it('refreshes rather than stacks, because a mage cannot hold two rows', () => {
    const b = bench({ mages: 1 });
    resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }], 10);
    resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }], 40);
    const rows = collectRecords(b.state, BLESSING);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.row.expiryTick).toBe(40 + C.blessDurationTicks);
  });

  it('caps concurrency at 1 + worshipTier', () => {
    const b = bench({ mages: 6 });
    componentOf(b.state, UNIVERSE).set(b.universe, 'worshipTier', 2);
    for (const handle of b.mages) resolve(b, [{ kind: ACTION.blessMage, params: [handle] }], 0);
    expect(collectRecords(b.state, BLESSING)).toHaveLength(3);
  });

  it('lets a refresh through even at the concurrency cap, because it occupies no new slot', () => {
    const b = bench({ mages: 3 });
    componentOf(b.state, UNIVERSE).set(b.universe, 'worshipTier', 0);
    resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }], 0);
    const report = resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }], 5);
    expect(report.applied).toBe(1);
    expect(collectRecords(b.state, BLESSING)).toHaveLength(1);
  });

  it('writes no mage field at all', () => {
    const b = bench({ mages: 1 });
    const before = { ...collectRecords(b.state, MAGE)[0]?.row };
    resolve(b, [{ kind: ACTION.blessMage, params: [mage(b, 0)] }]);
    expect({ ...collectRecords(b.state, MAGE)[0]?.row }).toEqual(before);
  });
});

describe('role assignment is the only mage field any intervention writes', () => {
  it('sets roleId and nothing else', () => {
    const b = bench({ mages: 1 });
    const before = { ...collectRecords(b.state, MAGE)[0]?.row };
    resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.warden] }]);
    const after = { ...collectRecords(b.state, MAGE)[0]?.row };
    expect(after).toEqual({ ...before, roleId: MAGE_ROLE.warden });
  });

  it('keeps roles exclusive: the second assignment replaces the first', () => {
    const b = bench({ mages: 1 });
    resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.warden] }]);
    resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.professor] }]);
    expect(componentOf(b.state, MAGE).get(mage(b, 0) as EntityHandle, 'roleId')).toBe(
      MAGE_ROLE.professor,
    );
  });

  it('refuses the role a mage already holds, and a role that does not exist', () => {
    const b = bench({ mages: 1 });
    expect(
      resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.researcher] }]).refused,
    ).toBe(1);
    expect(resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), 99] }]).refused).toBe(1);
  });

  it('refuses a dead mage and a stale handle', () => {
    const b = bench({ mages: 1 });
    componentOf(b.state, MAGE).set(mage(b, 0) as EntityHandle, 'alive', 0);
    expect(
      resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.warden] }]).refused,
    ).toBe(1);
    expect(resolve(b, [{ kind: ACTION.assignRole, params: [99_999, MAGE_ROLE.warden] }]).refused).toBe(
      1,
    );
  });
});

describe('funding advances a university and founding creates an empty one', () => {
  it('founds at zero progress with a target of 0, contributing nothing yet', () => {
    const b = bench();
    const before = favorOf(b.state, b.universe);
    resolve(b, [{ kind: ACTION.fundUniversity, params: [0] }]);
    const built = collectRecords(b.state, UNIVERSITY);
    expect(built).toHaveLength(1);
    expect(built[0]?.row.buildProgress).toBe(0);
    expect(before - favorOf(b.state, b.universe)).toBe(COSTS.foundUniversity);
  });

  it('advances an incomplete university and refuses a complete one', () => {
    // `godWorld` seeds completed universities first, then incomplete ones.
    const b = bench({ completedUniversities: 1, incompleteUniversities: 1 });
    const [complete, incomplete] = b.universities;
    if (incomplete === undefined || complete === undefined) throw new Error('missing fixture');

    resolve(b, [{ kind: ACTION.fundUniversity, params: [incomplete] }]);
    expect(progressOf(b.state, incomplete)).toBeGreaterThan(0);

    const before = favorOf(b.state, b.universe);
    expect(resolve(b, [{ kind: ACTION.fundUniversity, params: [complete] }]).refused).toBe(1);
    expect(favorOf(b.state, b.universe)).toBe(before);
  });

  it('prices founding above funding', () => {
    expect(COSTS.foundUniversity).toBeGreaterThan(COSTS.byAction[ACTION.fundUniversity] ?? 0);
  });
});

function progressOf(state: SimState, university: EntityHandle): number {
  return componentOf(state, UNIVERSITY).get(university, 'buildProgress');
}

describe('encouraging research is bounded, decaying, and permitted-only', () => {
  it('records one cell and decays it to nothing', () => {
    const b = bench();
    resolve(b, [{ kind: ACTION.encourageResearch, params: [3] }], 0);
    const rows = collectRecords(b.state, ENCOURAGED_CELL);
    expect(rows).toHaveLength(1);
    const expiry = rows[0]?.row.expiryTick ?? 0;

    expect(emphasisAt(expiry, 0, C)).toBe(C.encourageMagnitude);
    expect(emphasisAt(expiry, expiry - 1, C)).toBeLessThan(C.encourageMagnitude);
    expect(emphasisAt(expiry, expiry, C)).toBe(0);
    expect(emphasisAt(expiry, expiry + 100, C)).toBe(0);
  });

  it('bounds concurrency at the declared maximum', () => {
    const b = bench();
    for (let cellId = 1; cellId <= C.encourageMaxCells + 3; cellId += 1) {
      resolve(b, [{ kind: ACTION.encourageResearch, params: [cellId] }], 0);
    }
    expect(collectRecords(b.state, ENCOURAGED_CELL)).toHaveLength(C.encourageMaxCells);
  });

  it('lets a renewal through at the cap, because it occupies no new slot', () => {
    const b = bench();
    for (let cellId = 1; cellId <= C.encourageMaxCells; cellId += 1) {
      resolve(b, [{ kind: ACTION.encourageResearch, params: [cellId] }], 0);
    }
    const report = resolve(b, [{ kind: ACTION.encourageResearch, params: [1] }], 5);
    expect(report.applied).toBe(1);
    expect(collectRecords(b.state, ENCOURAGED_CELL)).toHaveLength(C.encourageMaxCells);
  });

  it('refuses a forbidden cell and a cell id outside the grid', () => {
    const b = bench({ permittedForms: 0 });
    expect(resolve(b, [{ kind: ACTION.encourageResearch, params: [3] }]).refused).toBe(1);
    const open = bench();
    expect(resolve(open, [{ kind: ACTION.encourageResearch, params: [0] }]).refused).toBe(1);
    expect(resolve(open, [{ kind: ACTION.encourageResearch, params: [9999] }]).refused).toBe(1);
  });
});

describe('changing tradition is a single ruinous act', () => {
  it('replaces the tradition, zeroes the pool, and puts a long shock in force', () => {
    const b = bench();
    const others = registry()
      .traditions.map((entry) => entry.contentId)
      .filter((id) => id !== readUniverse(b.state, b.universe).traditionId);
    const target = others[0];
    if (target === undefined) throw new Error('only one tradition is shipped');

    resolve(b, [{ kind: ACTION.changeTradition, params: [target] }], 0);

    expect(readUniverse(b.state, b.universe).traditionId).toBe(target);
    expect(favorOf(b.state, b.universe)).toBe(0);
    const shocks = collectRecords(b.state, UPHEAVAL);
    expect(shocks).toHaveLength(1);
    expect(shocks[0]?.row.factor).toBe(C.traditionShock);
    expect(shocks[0]?.row.expiryTick).toBe(C.traditionShockTicks);
  });

  it('destroys and duplicates no knowledge instance of its own accord', () => {
    const b = bench({ mages: 1 });
    const { nodeId } = grantableNode(b.state, b.universe);
    resolve(b, [{ kind: ACTION.grantFoundingKnowledge, params: [mage(b, 0), nodeId] }]);
    const before = collectRecords(b.state, KNOWLEDGE_INSTANCE).map(({ row }) => ({ ...row }));

    const others = registry()
      .traditions.map((entry) => entry.contentId)
      .filter((id) => id !== readUniverse(b.state, b.universe).traditionId);
    resolve(b, [{ kind: ACTION.changeTradition, params: [others[0] ?? 1] }], 0);

    expect(collectRecords(b.state, KNOWLEDGE_INSTANCE).map(({ row }) => ({ ...row }))).toEqual(
      before,
    );
  });

  it('refuses the tradition the universe already holds', () => {
    const b = bench();
    const held = readUniverse(b.state, b.universe).traditionId;
    expect(resolve(b, [{ kind: ACTION.changeTradition, params: [held] }]).refused).toBe(1);
  });

  it('is unaffordable to a universe at a young tier, structurally rather than by a gate', () => {
    // The favor cap at every tier below the top is lower than the price, so a
    // young universe cannot hold enough favor to pay however long it saves.
    const price = COSTS.byAction[ACTION.changeTradition] ?? 0;
    const b = bench({ favor: 0 });
    componentOf(b.state, UNIVERSE).set(b.universe, 'favor', price - 1);
    const others = registry()
      .traditions.map((entry) => entry.contentId)
      .filter((id) => id !== readUniverse(b.state, b.universe).traditionId);
    const report = resolve(b, [{ kind: ACTION.changeTradition, params: [others[0] ?? 1] }]);
    expect(report.refused).toBe(1);
    expect(readUniverse(b.state, b.universe).traditionId).not.toBe(others[0]);
  });
});

describe('opening a portal needs legality, knowledge, and a target', () => {
  it('refuses when no living mage holds a node carrying the portal primitive', () => {
    const b = bench({ mages: 1 });
    expect(resolve(b, [{ kind: ACTION.openPortal, params: [7] }]).refused).toBe(1);
    expect(b.engagementRequests).toBe(0);
  });

  it('refuses a target of zero, which names no universe', () => {
    const b = bench({ mages: 1 });
    expect(resolve(b, [{ kind: ACTION.openPortal, params: [0] }]).refused).toBe(1);
  });
});

describe('affordability is a refusal, never a negative pool', () => {
  it('refuses an unaffordable action and leaves every component untouched', () => {
    const b = bench({ mages: 1, favor: 0 });
    const before = collectRecords(b.state, MAGE).map(({ row }) => ({ ...row }));
    const report = resolve(b, [{ kind: ACTION.assignRole, params: [mage(b, 0), MAGE_ROLE.warden] }]);
    expect(report.refused).toBe(1);
    expect(report.applied).toBe(0);
    expect(favorOf(b.state, b.universe)).toBe(0);
    expect(collectRecords(b.state, MAGE).map(({ row }) => ({ ...row }))).toEqual(before);
  });

  it('never lets a sequence of actions drive the pool below zero', () => {
    const b = bench({ mages: 8, favor: (COSTS.byAction[ACTION.assignRole] ?? 0) * 3 });
    const submissions = b.mages.map((handle) => ({
      kind: ACTION.assignRole,
      params: [handle, MAGE_ROLE.warden],
    }));
    resolve(b, submissions);
    expect(favorOf(b.state, b.universe)).toBeGreaterThanOrEqual(0);
  });

  it('rejects a non-integer parameter rather than letting a float into the rules path', () => {
    const b = bench({ mages: 1 });
    const before = favorOf(b.state, b.universe);
    expect(resolve(b, [{ kind: ACTION.forbidTechnique, params: [0.5] }]).refused).toBe(1);
    expect(resolve(b, [{ kind: ACTION.forbidTechnique, params: [Number.NaN] }]).refused).toBe(1);
    expect(favorOf(b.state, b.universe)).toBe(before);
  });
});

describe('the resolver honours submission order', () => {
  it('applies a dispensation issued after a forbidding in the same tick', () => {
    const b = bench();
    // Forbidding the technique shuts every cell on its row; the dispensation
    // that follows reopens exactly one of them. Reordering to "ruleset last"
    // would be the rules rewriting the player's turn.
    const report = resolve(b, [
      { kind: ACTION.forbidTechnique, params: [1] },
      { kind: ACTION.issueDispensation, params: [1] },
    ]);
    expect(report.applied).toBe(2);
    const ruleset = readRulesetForObservation(b.state, b.universe);
    expect(permits(ruleset, 1)).toBe(true);
    expect(permits(ruleset, 2)).toBe(false);
  });
});

describe('the state the dispatch is given is the only state it reads', () => {
  it('does nothing at all in a world with no universe', () => {
    const empty = createState({ rootSeed: 1, schema: SCHEMA, contentRevision: registry().contentRevision });
    expect(findUniverse(empty)).toBe(0);
    const { catalog, cells } = catalogAndCells();
    const report = resolveInterventions(empty, [{ kind: ACTION.blessMage, params: [1] }], 0, TIME_MODE.world, {
      god: { constants: C, costs: COSTS },
      catalog,
      cells,
      knowledge: KnowledgeSubsystem.fromState(empty, catalog.nodeCount),
      edictBudgetMax: 8,
      portalNodes: new Set(),
      invitableSpecies: new Set<number>(),
      speciesOf: () => undefined,
      rng: TEST_RNG,
      requestEngagement: () => undefined,
    });
    expect(report.applied).toBe(0);
    expect(collectRecords(empty, EDICT)).toHaveLength(0);
  });
});

/** `EDICT_KIND` is imported for the reader's benefit; assert it is the pair §1.1 declares. */
describe('edict kinds are the two contracts.md §1.1 declares', () => {
  it('numbers dispensation 0 and interdiction 1', () => {
    expect(EDICT_KIND.dispensation).toBe(0);
    expect(EDICT_KIND.interdiction).toBe(1);
  });
});
