/*
 * Multiverse Mages — the legality mask, and the frozen-policy rule it enforces.
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
 * Task 4.4, and the `observation-action-space` scenarios *"ruleset actions
 * available mid-raid to the defender"* and *"ruleset actions available at world
 * scale"*.
 *
 * The engagement assertions here are still written over **every** action rather
 * than over a named few, and the reason survives `raid-engagement.md` §1's
 * repeal of the frozen-policy rule intact — it just points the other way now.
 * §4.2's old sentence was:
 *
 * > ~~This covers the ruleset actions 1–7 and 13, and equally 8–12, 14, and 15…
 * > Silence in an earlier draft of this table was not permission.~~
 *
 * Four actions — 1, 2, 3, 4 — are now legal mid-raid **for the defender, in a
 * phase that still admits a change**. Everything else stays masked, and the
 * sweep over `ALL_GOD_ACTIONS` is what keeps that true by default: a test that
 * checked only the four would pass against a mask that also let an agent bless
 * a defender mid-raid, which is the same defect the repealed sentence was added
 * to close.
 */

import type { SimState } from '@mm/sim-core';
import {
  ASCENSION_PATH,
  AXIS_CHANGE_COUNTER,
  AXIS_KIND,
  EDICT,
  EDICT_KIND,
  EMPTY_GOD_STATE,
  GOD_STATE,
  GRID_TECHNIQUE_COUNT,
  MID_RAID_CHANGE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  TERMINAL_REASON,
  UNIVERSE,
  attachRecord,
  cellIdAt,
  collectRecords,
  componentOf,
  findUniverse,
  readUniverse,
} from '@mm/state';
import type { ActionCostTable, ActionMaterialCost, ContentCatalogue } from '@mm/agent-api';
import type { EngagementStance } from '@mm/agent-api';
import {
  ACTION_SPACE_SIZE,
  ALL_GOD_ACTIONS,
  ENGAGEMENT_ACTIONS,
  GOD_ACTION,
  RULESET_ACTIONS,
  buildCandidates,
  buildCatalogue,
  isLegal,
  legalityMask,
  unaffordableReason,
  observe,
} from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, engageWorld, firstUniverse, secondUniverse } from './fixtures.js';

function maskOf(world: { state: SimState }, engagement?: EngagementStance): Uint8Array {
  const candidates = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
  return legalityMask({
    state: world.state,
    candidates,
    ...(engagement === undefined ? {} : { engagement }),
  });
}

/** `RAID_SIDE`'s two values, named so the tests read as sides and not as ints. */
const ATTACKER = 0;
const DEFENDER = 1;

/** A defender in a phase that still admits a ruleset change. */
const DEFENDING: EngagementStance = { side: DEFENDER, admitsRuleChange: true };

describe('the mask accompanies every observation', () => {
  it('is exactly the width of the action space', () => {
    const world = firstUniverse();
    const view = observe({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(view.mask.length).toBe(ACTION_SPACE_SIZE);
  });
});

describe('§4.2 as amended — the defender may change the ruleset mid-raid', () => {
  it('opens exactly actions 1-4 to a defender whose phase admits a change', () => {
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world, DEFENDING);

    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of ENGAGEMENT_ACTIONS) {
      expect(isLegal(mask, action), `action ${action} must be open to the defender`).toBe(true);
    }

    // And nothing else. The sweep, not a list — an action added to §4.2
    // tomorrow has to be put in ENGAGEMENT_ACTIONS deliberately to be legal
    // mid-raid, which is the property the repealed total mask had.
    const allowed = new Set<number>([GOD_ACTION.noop, ...ENGAGEMENT_ACTIONS]);
    for (const action of ALL_GOD_ACTIONS) {
      if (allowed.has(action)) continue;
      expect(isLegal(mask, action), `action ${action} must stay masked mid-raid`).toBe(false);
    }
  });

  it('gives the attacker nothing: forbidding is defender-only (§6.2)', () => {
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world, { side: ATTACKER, admitsRuleChange: true });

    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of ALL_GOD_ACTIONS) {
      if (action === GOD_ACTION.noop) continue;
      expect(isLegal(mask, action), `attacker action ${action} must be masked`).toBe(false);
    }
  });

  it('gives a defender in resolution nothing: the last phase is watch-only (§2)', () => {
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world, { side: DEFENDER, admitsRuleChange: false });

    for (const action of ENGAGEMENT_ACTIONS) {
      expect(isLegal(mask, action), `action ${action} must close in resolution`).toBe(false);
    }
  });

  it('gives a caller who said nothing about the engagement nothing', () => {
    // Silence is not permission. A caller that cannot say which side it is on
    // or which phase the raid is in has not established that any verb is legal,
    // and the honest mask is the no-op — the same rule the cost table follows
    // when a catalogue arrives without prices.
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world);

    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of ALL_GOD_ACTIONS) {
      if (action === GOD_ACTION.noop) continue;
      expect(isLegal(mask, action), `action ${action} must be masked without a stance`).toBe(false);
    }
  });

  it('still masks the parameterized actions, which an earlier draft left silent', () => {
    const world = firstUniverse();
    engageWorld(world);
    const mask = maskOf(world, DEFENDING);
    // Named individually so a regression names itself: blessing a defender,
    // funding a university, opening a second portal, escaping by ascending.
    // None of these is a ruleset change and none of them is repealed.
    expect(isLegal(mask, GOD_ACTION.blessMage)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.assignRole)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.fundUniversity)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.encourageResearch)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.openPortal)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.declareAscension)).toBe(false);
    // And the two ruleset actions that are *not* axis toggles: an edict is a
    // per-cell dispensation with a budget, and §4.2 as amended does not grant
    // it under fire.
    expect(isLegal(mask, GOD_ACTION.issueDispensation)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.issueInterdiction)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.revokeEdict)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.changeTradition)).toBe(false);
  });

  it('closes an axis mid-raid on the same structural test world time applies', () => {
    // Every technique permitted, so there is no technique left to permit — the
    // mask must say so under fire exactly as it does at world scale, because
    // the resolver refuses a toggle that would not move the bit either way.
    const world = firstUniverse();
    const universe = findUniverse(world.state);
    const store = componentOf(world.state, UNIVERSE);
    store.set(universe, 'permittedTechniques', (1 << GRID_TECHNIQUE_COUNT) - 1);
    engageWorld(world);
    const mask = maskOf(world, DEFENDING);

    expect(isLegal(mask, GOD_ACTION.permitTechnique)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.forbidTechnique)).toBe(true);
  });
});

describe('at world scale the mask reflects ordinary validity, not a blanket refusal', () => {
  it('permits the ruleset actions when there is something to change', () => {
    const world = firstUniverse();
    const mask = maskOf(world);
    // 0b00111 of 5 techniques and 0b111111 of 14 forms: both directions open.
    expect(isLegal(mask, GOD_ACTION.permitTechnique)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.forbidTechnique)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.permitForm)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.forbidForm)).toBe(true);
    // One edict against a budget of four.
    expect(isLegal(mask, GOD_ACTION.issueDispensation)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.issueInterdiction)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.revokeEdict)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.changeTradition)).toBe(true);
  });

  it('is not unconditionally true either — a saturated axis closes its action', () => {
    const world = secondUniverse();
    // Every technique and every form permitted: nothing left to permit.
    attachRecord(world.state, UNIVERSE, world.universe, { ...FULL_RULESET });
    const mask = maskOf(world);
    expect(isLegal(mask, GOD_ACTION.permitTechnique)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.permitForm)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.forbidTechnique)).toBe(true);
    expect(isLegal(mask, GOD_ACTION.forbidForm)).toBe(true);
  });

  it('closes revokeEdict when there are no edicts, and issuing when the budget is spent', () => {
    const world = secondUniverse();
    expect(isLegal(maskOf(world), GOD_ACTION.revokeEdict)).toBe(false);

    // §1.1 caps issuing at `length < edictBudget`, via the one implementation.
    const budget = firstUniverse();
    for (let i = 0; i < 3; i += 1) {
      const edict = budget.state.entities.create();
      attachRecord(budget.state, EDICT, edict, {
        cellId: cellIdAt(0, i),
        kind: EDICT_KIND.dispensation,
      });
    }
    const mask = maskOf(budget);
    expect(isLegal(mask, GOD_ACTION.issueDispensation)).toBe(false);
    expect(isLegal(mask, GOD_ACTION.revokeEdict)).toBe(true);
  });

  it('closes declareAscension for a universe that qualifies for no path', () => {
    // This assertion used to run the other way: the mask reported action 15
    // legal for *any* non-terminated universe, because the only thing it could
    // check was "this run is over" and eligibility was `god-agency`'s and did
    // not exist. It does now, cached on the god-state row and recomputed every
    // world tick so that it can lapse, so a fresh universe at tick zero is
    // correctly told it cannot declare.
    const world = firstUniverse();
    expect(isLegal(maskOf(world), GOD_ACTION.declareAscension)).toBe(false);

    attachRecord(world.state, GOD_STATE, world.universe, {
      ...EMPTY_GOD_STATE,
      ascensionPath: ASCENSION_PATH.apotheosis,
    });
    expect(isLegal(maskOf(world), GOD_ACTION.declareAscension)).toBe(true);
  });

  it('closes every action, not merely declareAscension, once the run has ended', () => {
    const world = firstUniverse();
    attachRecord(world.state, GOD_STATE, world.universe, {
      ...EMPTY_GOD_STATE,
      ascensionPath: ASCENSION_PATH.apotheosis,
    });
    expect(isLegal(maskOf(world), GOD_ACTION.declareAscension)).toBe(true);

    attachRecord(world.state, UNIVERSE, world.universe, {
      ...SETTLED_RULESET,
      terminalReason: TERMINAL_REASON.stagnation,
    });
    // Not just action 15. `god-agency`'s resolver refuses *every* submission
    // against a terminated universe, and a mask that kept reporting a role
    // assignment legal would hand an agent an action the rules silently turn
    // away — the mask-versus-rules disagreement `illegalActionRate` calls a
    // spec-clarity smell.
    const mask = maskOf(world);
    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of ALL_GOD_ACTIONS) {
      if (action === GOD_ACTION.noop) continue;
      expect(isLegal(mask, action), `action ${action} must be masked after termination`).toBe(false);
    }
  });

  it('leaves only no-op legal for a world with no universe yet', () => {
    const world = secondUniverse();
    world.state.entities.destroy(world.universe);
    const mask = maskOf(world);
    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of RULESET_ACTIONS) {
      expect(isLegal(mask, action)).toBe(false);
    }
  });
});

/** Every technique and form permitted — the saturated-axis case. */
const FULL_RULESET = {
  permittedTechniques: 0b11111,
  permittedForms: 0b11111111111111,
  edictBudget: 8,
  traditionId: 3,
  favor: 0,
  worship: 0,
  worshipTier: 0,
  materials: 0,
  prestige: 0,
  prestigeEarned: 0,
  terminalReason: 0,
  favorCap: 0,
  ascended: 0,
} as const;

/** The first fixture universe's row, for tests that rewrite one field of it. */
const SETTLED_RULESET = {
  permittedTechniques: 0b00111,
  permittedForms: 0b00000000111111,
  edictBudget: 4,
  traditionId: 2,
  favor: 40 * 1024,
  worship: 12 * 1024,
  worshipTier: 3,
  materials: 500 * 1024,
  prestige: 2 * 1024,
  prestigeEarned: 0,
  terminalReason: 0,
  favorCap: 100 * 1024,
  ascended: 0,
} as const;

/**
 * A cost table with every price the same, so that "can this god afford it" is a
 * question about one number rather than about a lookup.
 *
 * Built here rather than loaded, for the reason `catalogue.ts` gives: this
 * package refuses `@mm/content` so that the observation layer can run in a
 * browser, and the cost table therefore arrives as data. A test that had to load
 * the shipped content to exercise a comparison would be asserting the shipped
 * prices, which is `god-agency`'s business and not this module's.
 */
function pricedCatalogue(price: number, hysteresisStep = 1024): ContentCatalogue {
  return buildCatalogue(
    FIXTURE_CATALOGUE.nodes,
    [...FIXTURE_CATALOGUE.traditionIds],
    {
      byAction: Array.from({ length: ACTION_SPACE_SIZE }, (_, action) =>
        action === GOD_ACTION.noop || action === GOD_ACTION.declareAscension ? 0 : price,
      ),
      foundUniversity: price * 2,
      hysteresisStep,
    },
  );
}

/**
 * The same table, plus a material price on one action.
 *
 * `material-economy` task 4.2. Built here rather than loaded for the reason
 * `pricedCatalogue` gives above — this package refuses `@mm/content` — and the
 * cost defaults onto `issueDispensation` because it is structurally legal in
 * this fixture without a candidate list — `proposal.md` B prices that verb in
 * `essence`, and the fixture universe holds none of it, which is the arm under
 * test. Its `food` stock is 500 `fp` units, which supplies the other arm.
 */
function materiallyPricedCatalogue(
  price: number,
  material: ActionMaterialCost,
  action: number = GOD_ACTION.issueDispensation,
): ContentCatalogue {
  return buildCatalogue(FIXTURE_CATALOGUE.nodes, [...FIXTURE_CATALOGUE.traditionIds], {
    byAction: Array.from({ length: ACTION_SPACE_SIZE }, (_, id) =>
      id === GOD_ACTION.noop || id === GOD_ACTION.declareAscension ? 0 : price,
    ),
    foundUniversity: price * 2,
    hysteresisStep: 1024,
    materialByAction: Array.from({ length: ACTION_SPACE_SIZE }, (_, id) =>
      id === action ? material : undefined,
    ),
  });
}

function pricedMask(world: { state: SimState }, catalogue: ContentCatalogue): Uint8Array {
  const candidates = buildCandidates({ state: world.state, catalogue });
  return legalityMask({ state: world.state, candidates, catalogue });
}

describe('a material price is a mask condition too, and it says which currency', () => {
  const affordableFavor = 0;

  it('clears the action when the stock cannot pay, though the favor can', () => {
    // `material-economy`'s spec: *"An action whose material cost cannot be paid
    // SHALL be cleared from the legality mask, for the same reason an
    // unaffordable favor cost is cleared."* The fixture universe holds no
    // `essence` at all.
    const world = firstUniverse();
    const catalogue = materiallyPricedCatalogue(affordableFavor, { essence: 16 });
    expect(isLegal(pricedMask(world, catalogue), GOD_ACTION.issueDispensation)).toBe(false);
  });

  it('leaves it open when the stock can pay, which is the positive control', () => {
    // Same price, same universe, a kind it actually holds. Without this arm the
    // assertion above would pass on a mask that cleared the action for any
    // reason at all — including a material check that refused everything.
    const world = firstUniverse();
    const catalogue = materiallyPricedCatalogue(affordableFavor, { food: 16 });
    expect(isLegal(pricedMask(world, catalogue), GOD_ACTION.issueDispensation)).toBe(true);
  });

  it('opens at exactly the price, as the favor check does', () => {
    const world = firstUniverse();
    const held = 500 * 1024;
    expect(
      isLegal(
        pricedMask(world, materiallyPricedCatalogue(affordableFavor, { food: held })),
        GOD_ACTION.issueDispensation,
      ),
    ).toBe(true);
    expect(
      isLegal(
        pricedMask(world, materiallyPricedCatalogue(affordableFavor, { food: held + 1 })),
        GOD_ACTION.issueDispensation,
      ),
    ).toBe(false);
  });

  it('pays no price out of a total, because there is no market', () => {
    // A `passage` cost is not payable out of a heap of `food`, however deep.
    // Cross-kind substitution is a market, and `kinds.ts` refuses one by name:
    // it would dissolve the differentiation the seven kinds exist to create.
    const world = firstUniverse();
    const catalogue = materiallyPricedCatalogue(affordableFavor, { passage: 1 });
    expect(isLegal(pricedMask(world, catalogue), GOD_ACTION.issueDispensation)).toBe(false);
  });

  it('names the currency, so a player is not told to wait for the wrong thing', () => {
    // **Task 4.2's second half.** The mask is one byte per action and cannot
    // carry a reason; `unaffordableReason` is the §4.4 explain channel beside
    // it. The distinction is not cosmetic — favor refills from worship on its
    // own clock whatever the god does, and a material stock refills only if
    // somebody is casting the right magic in a permitted cell.
    const world = firstUniverse();
    const candidates = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });

    const poor = materiallyPricedCatalogue(1_000_000, { food: 16 });
    expect(
      unaffordableReason(GOD_ACTION.issueDispensation, {
        state: world.state,
        candidates,
        catalogue: poor,
      }),
    ).toBe('favor');

    const dry = materiallyPricedCatalogue(affordableFavor, { essence: 16 });
    expect(
      unaffordableReason(GOD_ACTION.issueDispensation, {
        state: world.state,
        candidates,
        catalogue: dry,
      }),
    ).toBe('materials');

    const payable = materiallyPricedCatalogue(affordableFavor, { food: 16 });
    expect(
      unaffordableReason(GOD_ACTION.issueDispensation, {
        state: world.state,
        candidates,
        catalogue: payable,
      }),
    ).toBeUndefined();
  });

  it('reports favor first when neither currency can pay', () => {
    // A deliberate order rather than an accident: favor is the one that comes
    // back on its own, so it is the shorter thing to wait for and the more
    // useful thing to be told.
    const world = firstUniverse();
    const candidates = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(
      unaffordableReason(GOD_ACTION.issueDispensation, {
        state: world.state,
        candidates,
        catalogue: materiallyPricedCatalogue(1_000_000, { essence: 16 }),
      }),
    ).toBe('favor');
  });

  it('stays silent about a price it was not told', () => {
    const world = firstUniverse();
    const candidates = buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE });
    expect(
      unaffordableReason(GOD_ACTION.issueDispensation, {
        state: world.state,
        candidates,
        catalogue: FIXTURE_CATALOGUE,
      }),
    ).toBeUndefined();
  });
});

describe('affordability is a mask condition, not a failure', () => {
  it('reports structural legality only when the catalogue carries no prices', () => {
    // The pre-`god-agency` behaviour, kept: a catalogue built for an encoder
    // should not have to supply a cost table to get an observation, and silence
    // about a price nobody was told is honest where a guess would not be.
    const world = firstUniverse();
    const bare = legalityMask({
      state: world.state,
      candidates: buildCandidates({ state: world.state, catalogue: FIXTURE_CATALOGUE }),
      catalogue: FIXTURE_CATALOGUE,
    });
    expect(isLegal(bare, GOD_ACTION.forbidTechnique)).toBe(true);
  });

  it('closes an action the pool cannot pay for, and opens it at exactly the price', () => {
    const world = firstUniverse();
    const favor = readUniverse(world.state, world.universe).favor;

    expect(isLegal(pricedMask(world, pricedCatalogue(favor + 1)), GOD_ACTION.forbidTechnique)).toBe(
      false,
    );
    // Exactly affordable is affordable: the resolver refuses only when
    // `cost > favor`, and a mask that used `>=` would report an action illegal
    // on the tick a god had saved precisely enough for it.
    expect(isLegal(pricedMask(world, pricedCatalogue(favor)), GOD_ACTION.forbidTechnique)).toBe(
      true,
    );
  });

  it('never closes the no-op, whatever the pool holds', () => {
    const world = firstUniverse();
    // A price at the top of the fixed-point domain rather than at the top of
    // the safe-integer range: §0 puts every rules-path number in `int32`, and
    // handing `mul` a larger operand is a content bug rather than a poor god.
    const mask = pricedMask(world, pricedCatalogue(2_000_000_000));
    expect(isLegal(mask, GOD_ACTION.noop)).toBe(true);
    for (const action of RULESET_ACTIONS) expect(isLegal(mask, action)).toBe(false);
  });

  it('leaves a structurally illegal action closed rather than reopening it when it is free', () => {
    // Ordering matters: affordability runs *after* structural legality, so a
    // free action that names nothing stays masked for the reason that does not
    // change when the pool refills.
    const world = secondUniverse();
    const free = pricedCatalogue(0);
    const mask = pricedMask(world, free);
    expect(isLegal(mask, GOD_ACTION.declareAscension)).toBe(false);
  });

  it('prices a revoke at the surcharge when the only edict is one a raid left', () => {
    // `raid-engagement.md` §1's revert surcharge, at the *mask*. The resolver
    // charging it is proved in `coordination`; this is the other half, and the
    // reason `revertSurcharge` lives in `@mm/state` rather than beside either of
    // them: agent-api may not import a rules package and coordination may not
    // import agent-api, so a second copy of the price would be a player told
    // they can afford something the server refuses.
    const world = firstUniverse();
    const favor = readUniverse(world.state, world.universe).favor;
    // Priced so the ordinary revoke is affordable and the surcharged one is not.
    const catalogue = pricedCatalogue(favor);
    const marked = buildCatalogue(FIXTURE_CATALOGUE.nodes, [...FIXTURE_CATALOGUE.traditionIds], {
      ...(catalogue.costs as ActionCostTable),
      midRaidRevertMultiplier: 2048,
    });

    // Every edict this universe already carries, so that the mark below leaves
    // no unmarked one to price the entry at the base.
    const standing = collectRecords(world.state, EDICT);
    expect(standing.length).toBeGreaterThan(0);
    expect(isLegal(pricedMask(world, marked), GOD_ACTION.revokeEdict)).toBe(true);

    // Now say a raid put every one of them there. The only revoke available is
    // a surcharged one, and it is out of reach.
    for (const { row } of standing) {
      const mark = world.state.entities.create();
      attachRecord(world.state, MID_RAID_CHANGE, mark, {
        scope: RULE_SCOPE.cell,
        targetId: row.cellId,
        changeKind:
          row.kind === EDICT_KIND.interdiction ? RULE_CHANGE_KIND.forbid : RULE_CHANGE_KIND.permit,
        paidCost: 0,
        markedTick: 0,
      });
    }
    expect(isLegal(pricedMask(world, marked), GOD_ACTION.revokeEdict)).toBe(false);

    // A second, unmarked edict reopens the entry: a mask over an action with
    // many parameters can only honestly mean "there is a parameter this god can
    // afford", and now there is one.
    const ordinary = world.state.entities.create();
    attachRecord(world.state, EDICT, ordinary, { cellId: 70, kind: EDICT_KIND.interdiction });
    expect(isLegal(pricedMask(world, marked), GOD_ACTION.revokeEdict)).toBe(true);
  });

  it('prices a flip at the cheapest axis, not at the most recently churned one', () => {
    // A god who has flipped one technique twice may still flip a different one
    // at the base price, so the entry stays open while any axis is affordable.
    const world = firstUniverse();
    const favor = readUniverse(world.state, world.universe).favor;
    const catalogue = pricedCatalogue(favor);

    const churned = world.state.entities.create();
    attachRecord(world.state, AXIS_CHANGE_COUNTER, churned, {
      axisKind: AXIS_KIND.technique,
      axisBit: 0,
      changeCount: 3,
    });
    // Axis 0 now costs four times the pool; every other technique still costs
    // exactly the pool.
    expect(isLegal(pricedMask(world, catalogue), GOD_ACTION.forbidTechnique)).toBe(true);

    for (let bit = 1; bit < 5; bit += 1) {
      const handle = world.state.entities.create();
      attachRecord(world.state, AXIS_CHANGE_COUNTER, handle, {
        axisKind: AXIS_KIND.technique,
        axisBit: bit,
        changeCount: 3,
      });
    }
    // Now every technique carries the escalation, and none is affordable.
    expect(isLegal(pricedMask(world, catalogue), GOD_ACTION.forbidTechnique)).toBe(false);
  });

  it('keeps funding legal while founding alone is out of reach', () => {
    // §4.2 gives founding and funding one id, so the entry is legal while
    // *either* is affordable — and the fixture universes carry universities to
    // fund.
    const world = firstUniverse();
    const favor = readUniverse(world.state, world.universe).favor;
    const catalogue = pricedCatalogue(favor);
    expect(catalogue.costs?.foundUniversity).toBeGreaterThan(favor);
    expect(isLegal(pricedMask(world, catalogue), GOD_ACTION.fundUniversity)).toBe(true);
  });
});
