/*
 * Multiverse Mages — the intervention dispatch: what each of contracts.md
 * §4.2's actions actually does to a universe.
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
 * This is the file the whole change exists for.
 *
 * Before it, `step` handed admitted actions to the rules layers and every one
 * of them ignored `ctx.actions` — with the measured consequence that all eight
 * scripted bot strategies produced byte-identical universes, so the tournament
 * measured the harness rather than the game. A god action reaching a rules layer
 * starts here.
 *
 * ## Where legality is decided, and why it is decided twice
 *
 * `agent-api`'s mask is **advisory and structural**: it tells an agent which
 * actions are worth submitting, and `contracts.md` §4.2 makes a masked
 * submission a no-op and a counter increment rather than an exception. This
 * dispatch is **authoritative**: every precondition is re-checked here against
 * the state the action is actually resolving against, and a failed check is the
 * same no-op-and-count.
 *
 * The two cannot be one function, and the reason is a boundary rather than
 * taste. `agent-api` must run in a browser, so it refuses `@mm/content` — and
 * the cost table, the node graph and the constants are all content. Rules
 * packages may never import `agent-api` (§5 rule 4). So the shared *readers*
 * live in `@mm/state` (`god.ts`), which both may import, and the two layers
 * each apply them. What must not drift is the readers; the comparisons are one
 * line each on both sides.
 *
 * ## Resolution is atomic
 *
 * Every action validates completely before it writes anything, then deducts,
 * then applies. Nothing here can leave favor spent and an effect unapplied, or
 * the reverse. The favor-economy spec asks for a rollback *"if effect
 * application fails"*, and the strongest form of that is an apply that cannot
 * fail — so the checks are exhaustive and the deduction is the last thing before
 * the write. The one operation that can genuinely throw, creating a knowledge
 * instance, is wrapped, and the refusal restores the pool and counts an error.
 *
 * ## Interventions compose existing primitives and introduce none
 *
 * A blessing is `research-rate`, `teach-rate` and `lifespan` contributions;
 * an encouragement is a `research-rate` contribution for one cell. Both go
 * through `@mm/primitives`' shared stacking and its caps. Inventing a
 * `divine-favor` primitive would be a whole category of effect the harness's
 * ablation runs cannot see, which is the exact hole vision §4a's four-hook cap
 * exists to prevent on the tradition side.
 */

import type { Action, EntityHandle, SimState } from '@mm/sim-core';
import type { AxisChangeCounterRecord, MidRaidMark } from '@mm/state';
import { FP_ONE, NULL_ENTITY, TIME_MODE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { CellResolver, KnowledgeSubsystem, NodeCatalog } from '@mm/rules-magic';
import type { SpeciesRecord } from '@mm/content';
import type { StepRng } from '@mm/rules-world';
import { createMage } from '@mm/rules-world';
import {
  AXIS_CHANGE_COUNTER,
  AXIS_KIND,
  ASCENSION_PATH,
  BLESSING,
  EDICT,
  EDICT_KIND,
  ENCOURAGED_CELL,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  TERMINAL_REASON,
  UNIVERSE,
  UNIVERSITY,
  UPHEAVAL,
  GRANT_BUDGET,
  activeBlessings,
  activeEncouragements,
  attachRecord,
  canGrantFoundingKnowledge,
  collectRecords,
  componentOf,
  findMidRaidMark,
  isCellId,
  revertSurcharge,
  permits,
  readEdicts,
  readRulesetForObservation,
  readUniverse,
} from '@mm/state';

import type { GodContent } from './constants.js';
import { hysteresisMultiplier, inertFraction, interventionCost, upheavalShock } from './favor.js';
import { edictBudgetFor, favorCapFor } from './worship.js';
import { godState, writeGodState } from './god-state.js';

/** `contracts.md` §4.2's action ids, as this dispatch names them. */
export const ACTION = {
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
} as const;

/** Everything the dispatch needs that is content or a subsystem rather than state. */
export interface InterventionDeps {
  readonly god: GodContent;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  /** A knowledge subsystem over the state being stepped. Rebuilt per tick by the caller. */
  readonly knowledge: KnowledgeSubsystem;
  /** `EDICT_BUDGET_MAX` from `contracts.md` §0, passed rather than re-derived. */
  readonly edictBudgetMax: number;
  /**
   * Node ids whose effects carry the `portal` primitive.
   *
   * Resolved from content once, by the composition root, rather than scanned
   * per action: the set is fixed for a run, and rescanning three hundred nodes'
   * effect lists on every portal attempt would put a content walk inside a
   * per-tick path for a fact that cannot change.
   */
  readonly portalNodes: ReadonlySet<number>;
  /**
   * Species an allied realm would send a scholar from, by interned id.
   *
   * Caller-supplied, exactly as `agent-api`'s candidate list is and for the
   * same §1.1 reason: the roster of realms is not in this universe's state. An
   * empty set switches action 16 off without a branch anywhere else, which is
   * what makes the paired measurement a factor level rather than a build flag.
   */
  readonly invitableSpecies: ReadonlySet<number>;
  /** The species table, for the traits an arriving scholar is built from. */
  readonly speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  /**
   * The step's randomness, for the arriving scholar's personality roll.
   *
   * Stream 1 keyed on her own entity handle — `contracts.md` §6's mage-birth
   * stream, the same one promotion draws from. Insertion invariance is what
   * makes this free: a draw keyed on a handle that did not exist before
   * disturbs nobody else's rolls, so **no committed baseline is invalidated by
   * adding this action.** That property is the reason the verb creates a mage
   * rather than, say, re-rolling an existing one.
   */
  readonly rng: StepRng;
  /** Asks the clock to enter engagement. Supplied by the step context. */
  readonly requestEngagement: () => void;
}

/** What one tick's interventions did. Reporting only; never an input to a rule. */
export interface InterventionReport {
  /** Favor spent, by action id. The ledger's spend side. */
  readonly spentByAction: Readonly<Record<number, Fixed>>;
  /** Submissions this layer refused after the mask let them through. */
  readonly refused: number;
  /** Refusals caused by an effect throwing after favor was deducted. Should be 0. */
  readonly rolledBack: number;
  /** Actions that resolved. */
  readonly applied: number;
}

/** A mutable tally the resolver folds into, turned into a report at the end. */
interface Tally {
  spentByAction: Record<number, Fixed>;
  refused: number;
  rolledBack: number;
  applied: number;
}

/**
 * Resolves every god action submitted for this tick, in submission order.
 *
 * Submission order matters and is honoured: a god who forbids a technique and
 * then issues a dispensation on one of its cells within the same tick gets the
 * dispensation applied against the forbidden axis, which is a legitimate — and
 * expensive — opening. Reordering to "cheapest first" or "ruleset last" would
 * be the rules quietly rewriting the player's turn.
 */
export function resolveInterventions(
  state: SimState,
  actions: readonly Action[],
  worldTick: number,
  mode: number,
  deps: InterventionDeps,
): InterventionReport {
  const tally: Tally = { spentByAction: {}, refused: 0, rolledBack: 0, applied: 0 };

  const universe = findTheUniverse(state);
  if (universe === 0) return report(tally);

  // Every god action is world-time only. The mask says so too, and a caller
  // driving `step` directly bypasses the mask entirely — which is exactly the
  // case vision §3's frozen-policy rule has to survive, so the refusal is here
  // as well and not only there.
  if (mode !== TIME_MODE.world) {
    for (const action of actions) {
      if (isGodIntervention(action.kind)) refuse(state, tally);
    }
    return report(tally);
  }

  // An ascended or otherwise terminated universe is frozen: §4.3 makes the
  // episode over, and a run that kept accepting actions would put ticks past
  // its own ending into a record claiming it had ended.
  if (readUniverse(state, universe).terminalReason !== TERMINAL_REASON.none) {
    for (const action of actions) {
      if (isGodIntervention(action.kind)) refuse(state, tally);
    }
    return report(tally);
  }

  for (const action of actions) {
    if (!isGodIntervention(action.kind)) continue;
    resolveOne(state, universe, action, worldTick, deps, tally);
  }
  return report(tally);
}

function report(tally: Tally): InterventionReport {
  return {
    spentByAction: Object.freeze({ ...tally.spentByAction }),
    refused: tally.refused,
    rolledBack: tally.rolledBack,
    applied: tally.applied,
  };
}

/** Whether an action id is one this dispatch owns. `0` is the no-op and is not. */
function isGodIntervention(kind: number): boolean {
  return Number.isInteger(kind) && kind >= ACTION.permitTechnique && kind <= ACTION.inviteScholar;
}

/**
 * A refused submission: no state change, and the core's own illegal-action
 * counter incremented.
 *
 * `noteIllegalAction` is the same counter `agent-api`'s gate uses, and that is
 * deliberate: §7's `illegalActionRate` is *"the fraction of agent actions
 * rejected by the mask"*, and a second counter for "rejected by the rules"
 * would split one measurement across two numbers that nobody sums. A refusal
 * here means the mask and the resolver disagreed, which the metric's own note
 * calls *"a spec-clarity smell"* — so it should be visible in the same place.
 */
function refuse(state: SimState, tally: Tally): void {
  tally.refused += 1;
  state.noteIllegalAction();
}

function findTheUniverse(state: SimState): EntityHandle {
  const rows = collectRecords(state, UNIVERSE);
  return rows[0]?.handle ?? NULL_ENTITY;
}

/** One action: validate everything, price it, deduct, apply. */
function resolveOne(
  state: SimState,
  universe: EntityHandle,
  action: Action,
  worldTick: number,
  deps: InterventionDeps,
  tally: Tally,
): void {
  const plan = planOf(state, universe, action, worldTick, deps);
  if (plan === undefined) {
    refuse(state, tally);
    return;
  }

  const universeStore = componentOf(state, UNIVERSE);
  const opening = universeStore.get(universe, 'favor');
  if (plan.cost > opening) {
    // Affordability is a mask condition, not a failure — but a caller driving
    // `step` directly, or a mask that priced an action before a same-tick spend
    // emptied the pool, both land here. The remedy is §4.2's: a no-op and a
    // count, never a negative pool.
    refuse(state, tally);
    return;
  }

  universeStore.set(universe, 'favor', opening - plan.cost);
  try {
    plan.apply();
  } catch {
    // The rollback the favor-economy spec asks for. Every apply below is a
    // small number of component writes and none of them is expected to throw;
    // this exists so that "effects never outrun payment" is a property of the
    // code rather than of a reading of it, and `rolledBack` is instrumented so
    // that a resolver that started throwing would be visible rather than
    // merely correct.
    universeStore.set(universe, 'favor', opening);
    tally.rolledBack += 1;
    refuse(state, tally);
    return;
  }

  tally.spentByAction[action.kind] = (tally.spentByAction[action.kind] ?? 0) + plan.cost;
  tally.applied += 1;
}

/** A validated action: what it costs, and the writes it will make. */
interface Plan {
  readonly cost: Fixed;
  readonly apply: () => void;
}

/** Validates one action and returns its plan, or `undefined` to refuse it. */
function planOf(
  state: SimState,
  universe: EntityHandle,
  action: Action,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  const params = action.params ?? [];
  if (!params.every((value) => Number.isInteger(value))) return undefined;

  switch (action.kind) {
    case ACTION.permitTechnique:
    case ACTION.forbidTechnique:
      return axisPlan(state, universe, action.kind, params[0], worldTick, deps, AXIS_KIND.technique);
    case ACTION.permitForm:
    case ACTION.forbidForm:
      return axisPlan(state, universe, action.kind, params[0], worldTick, deps, AXIS_KIND.form);
    case ACTION.issueDispensation:
      return edictPlan(state, universe, params[0], EDICT_KIND.dispensation, deps);
    case ACTION.issueInterdiction:
      return edictPlan(state, universe, params[0], EDICT_KIND.interdiction, deps);
    case ACTION.revokeEdict:
      return revokePlan(state, params[0], deps);
    case ACTION.grantFoundingKnowledge:
      return grantPlan(state, universe, params[0], params[1], worldTick, deps);
    case ACTION.blessMage:
      return blessPlan(state, universe, params[0], worldTick, deps);
    case ACTION.assignRole:
      return rolePlan(state, params[0], params[1], deps);
    case ACTION.fundUniversity:
      return fundPlan(state, params[0], worldTick, deps);
    case ACTION.encourageResearch:
      return encouragePlan(state, universe, params[0], worldTick, deps);
    case ACTION.changeTradition:
      return traditionPlan(state, universe, params[0], worldTick, deps);
    case ACTION.openPortal:
      return portalPlan(state, universe, params[0], deps);
    case ACTION.declareAscension:
      return ascensionPlan(state, universe, worldTick, deps);
    case ACTION.inviteScholar:
      return invitePlan(state, universe, params[0], worldTick, deps);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// 1–4: technique and form toggles
// ---------------------------------------------------------------------------

/**
 * Permitting or forbidding one axis.
 *
 * Symmetric in price by construction — both directions read the same content
 * row, and the loader refuses a table where they differ — and immediate, taking
 * effect in the tick it resolves. Every legality question afterwards goes
 * through `permits`, which reads the bitmask this writes; nothing caches a
 * permitted-cell list.
 *
 * A toggle that would not change the bit is refused rather than charged. A god
 * permitting an already-permitted technique has done nothing, and charging for
 * it would put a real price on an action the agent cannot distinguish from a
 * no-op.
 */
function axisPlan(
  state: SimState,
  universe: EntityHandle,
  actionId: number,
  axisId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
  axisKind: number,
): Plan | undefined {
  const technique = axisKind === AXIS_KIND.technique;
  const count = technique ? GRID_TECHNIQUE_COUNT : GRID_FORM_COUNT;
  if (axisId === undefined || axisId < 1 || axisId > count) return undefined;
  const bit = axisId - 1;

  const field = technique ? 'permittedTechniques' : 'permittedForms';
  const store = componentOf(state, UNIVERSE);
  const mask = store.get(universe, field);
  const permitting = actionId === ACTION.permitTechnique || actionId === ACTION.permitForm;
  const isSet = (mask & (1 << bit)) !== 0;
  if (isSet === permitting) return undefined;

  const counter = counterFor(state, axisKind, bit);
  const ordinary = interventionCost(actionId, deps.god.costs, {
    hysteresis: hysteresisMultiplier(counter.record.changeCount, deps.god.constants),
  });

  // `raid-engagement.md` §1's revert surcharge. A change made under fire is
  // marked; walking it back afterwards is priced against what it cost then.
  const scope = technique ? RULE_SCOPE.technique : RULE_SCOPE.form;
  const mark = reverts(state, scope, bit, permitting);
  const cost =
    mark === undefined
      ? ordinary
      : revertSurcharge(ordinary, mark.paidCost, deps.god.constants.midRaidRevertMultiplier);

  // Computed before the write, because the fraction is "how much of what the
  // universe knows is about to go inert" and after the flip it is zero.
  const stranded = permitting
    ? { inert: 0, known: 0 }
    : strandedByAxis(state, universe, axisKind, bit, deps);

  return {
    cost,
    apply: () => {
      store.set(universe, field, permitting ? mask | (1 << bit) : mask & ~(1 << bit));
      bumpCounter(state, counter);
      // The mark is discharged by being paid for, not by expiring. A surcharge
      // that could be paid twice for one raid would price a second, ordinary
      // change at the raid's rate months later.
      if (mark !== undefined) state.entities.destroy(mark.handle);
      if (!permitting && stranded.inert > 0) {
        applyShock(
          state,
          upheavalShock(inertFraction(stranded.inert, stranded.known), deps.god.constants),
          worldTick + deps.god.constants.upheavalTicks,
        );
      }
    },
  };
}

/**
 * How many known nodes a forbidding would strand, and how many there are.
 *
 * Counted over nodes the universe currently holds an instance of, cell by cell.
 * Knowledge in a forbidden cell becomes **inert, not destroyed** — §1.1 already
 * says a mage may hold knowledge her universe has since forbidden and that it
 * lies dormant — so nothing here touches an instance. The count is only used to
 * scale the worship shock, which is what makes forbidding an axis nobody
 * studies nearly free and forbidding the axis a civilization was built on
 * ruinous.
 */
function strandedByAxis(
  state: SimState,
  universe: EntityHandle,
  axisKind: number,
  bit: number,
  deps: InterventionDeps,
): { inert: number; known: number } {
  const ruleset = readRulesetForObservation(state, universe);
  const known = deps.knowledge.knownNodes();
  let inert = 0;
  for (const nodeId of known) {
    const cellId = deps.cells.cellOf(nodeId);
    if (!isCellId(cellId)) continue;
    // Only cells that are permitted *now* can be stranded: one already dark is
    // already inert, and counting it would charge the god worship for a
    // disruption that already happened.
    if (!permits(ruleset, cellId)) continue;
    const onAxis =
      axisKind === AXIS_KIND.technique
        ? Math.floor((cellId - 1) / GRID_FORM_COUNT) === bit
        : (cellId - 1) % GRID_FORM_COUNT === bit;
    if (onAxis) inert += 1;
  }
  return { inert, known: known.length };
}

/**
 * One axis's hysteresis row, with the handle it hangs on.
 *
 * A pair of the shared `AxisChangeCounterRecord` and a handle, rather than a
 * flattened struct carrying both. `schema-duplication.test.ts` calls a
 * superset of a §1 record a duplicated type however it is named, and it is
 * right to: the extra field is one the component layout never serializes, so it
 * would be written every tick and absent from every snapshot.
 *
 * `handle: 0` means the axis has never been flipped and carries no row — which
 * is the whole reason the counters are sparse entities rather than nineteen
 * fields on the universe.
 */
interface AxisCounter {
  readonly handle: EntityHandle;
  readonly record: AxisChangeCounterRecord;
}

/**
 * The mid-raid mark this axis toggle would walk back, or `undefined`.
 *
 * A toggle reverts a mark when it moves legality the *opposite* way: permitting
 * discharges a mid-raid forbid, forbidding discharges a mid-raid permit. A
 * toggle in the same direction as the mark cannot happen — the axis is already
 * in that state and `axisPlan` has refused it as a no-op before reaching here —
 * so the check is a direction comparison rather than a search.
 */
function reverts(
  state: SimState,
  scope: number,
  bit: number,
  permitting: boolean,
): MidRaidMark | undefined {
  const mark = findMidRaidMark(state, scope, bit);
  if (mark === undefined) return undefined;
  const undoes =
    mark.changeKind === (permitting ? RULE_CHANGE_KIND.forbid : RULE_CHANGE_KIND.permit);
  return undoes ? mark : undefined;
}

function counterFor(state: SimState, axisKind: number, axisBit: number): AxisCounter {
  for (const { handle, row } of collectRecords(state, AXIS_CHANGE_COUNTER)) {
    if (row.axisKind === axisKind && row.axisBit === axisBit) return { handle, record: row };
  }
  return { handle: 0, record: { axisKind, axisBit, changeCount: 0 } };
}

function bumpCounter(state: SimState, counter: AxisCounter): void {
  if (counter.handle === 0) {
    const handle = state.entities.create();
    attachRecord(state, AXIS_CHANGE_COUNTER, handle, { ...counter.record, changeCount: 1 });
    return;
  }
  componentOf(state, AXIS_CHANGE_COUNTER).set(
    counter.handle,
    'changeCount',
    counter.record.changeCount + 1,
  );
}

/** Records a worship shock. Combined with any others by `shockedTarget`. */
function applyShock(state: SimState, factor: Fixed, expiryTick: number): void {
  const handle = state.entities.create();
  attachRecord(state, UPHEAVAL, handle, { factor, expiryTick });
}

// ---------------------------------------------------------------------------
// 5–7: edicts
// ---------------------------------------------------------------------------

/**
 * Issuing a dispensation or an interdiction.
 *
 * Both occupy one edict slot, and the budget is the one `edictBudget` the
 * worship tier grants. A **vacuous** edict is refused: a dispensation naming a
 * cell already permitted, or an interdiction naming one already forbidden,
 * would consume a slot and change nothing, and a slot is the scarcest thing the
 * god owns.
 */
function edictPlan(
  state: SimState,
  universe: EntityHandle,
  cellId: number | undefined,
  kind: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (cellId === undefined || !isCellId(cellId)) return undefined;

  const edicts = readEdicts(state);
  const budget = Math.min(readUniverse(state, universe).edictBudget, deps.edictBudgetMax);
  if (edicts.length >= budget) return undefined;
  // One cell may not carry both, which `assertNoEdictConflict` treats as a
  // content error and which a god could otherwise create by hand.
  if (edicts.some((edict) => edict.cellId === cellId)) return undefined;

  const ruleset = readRulesetForObservation(state, universe);
  const permitted = permits(ruleset, cellId);
  if (kind === EDICT_KIND.dispensation && permitted) return undefined;
  if (kind === EDICT_KIND.interdiction && !permitted) return undefined;

  const actionId =
    kind === EDICT_KIND.dispensation ? ACTION.issueDispensation : ACTION.issueInterdiction;
  return {
    cost: interventionCost(actionId, deps.god.costs),
    apply: () => {
      const handle = state.entities.create();
      attachRecord(state, EDICT, handle, { cellId, kind });
    },
  };
}

/**
 * Revoking an edict by its slot index.
 *
 * The index is into `readEdicts`' ascending slot order, which is the one order
 * two peers that reached the same state by different routes agree on. Revoking
 * frees the slot in the same world tick, and the underlying axes decide the
 * cell again with no further action.
 */
function revokePlan(
  state: SimState,
  index: number | undefined,
  deps: InterventionDeps,
): Plan | undefined {
  if (index === undefined || index < 0) return undefined;
  const rows = collectRecords(state, EDICT).sort((a, b) => a.handle - b.handle);
  const target = rows[index];
  if (target === undefined) return undefined;

  const ordinary = interventionCost(ACTION.revokeEdict, deps.god.costs);
  // Revoking is the *only* route back from a cell-scoped mid-raid change:
  // `edictPlan` refuses a second edict on a cell that already carries one, so
  // the opposite edict cannot be issued over the top. The surcharge therefore
  // belongs here and nowhere else for the cell scope.
  //
  // "Reverts" means the standing edict is the one the raid left. Its direction
  // is read from the edict rather than from the mark, so revoking a *peacetime*
  // edict that happens to sit on a marked cell is priced ordinarily.
  const wasForbid = target.row.kind === EDICT_KIND.interdiction;
  const mark = findMidRaidMark(state, RULE_SCOPE.cell, target.row.cellId);
  const discharges =
    mark !== undefined &&
    mark.changeKind === (wasForbid ? RULE_CHANGE_KIND.forbid : RULE_CHANGE_KIND.permit);

  return {
    cost:
      discharges && mark !== undefined
        ? revertSurcharge(ordinary, mark.paidCost, deps.god.constants.midRaidRevertMultiplier)
        : ordinary,
    apply: () => {
      state.entities.destroy(target.handle);
      if (discharges && mark !== undefined) state.entities.destroy(mark.handle);
    },
  };
}

// ---------------------------------------------------------------------------
// 8: founding knowledge
// ---------------------------------------------------------------------------

/**
 * Granting founding knowledge — the only route for a body of magic the universe
 * has never held.
 *
 * Four preconditions, and the first is the load-bearing one. **The node must
 * declare no prerequisites.** Without that restriction the grant is a direct
 * purchase of any node in the game, and the cheapest route to the Apotheosis
 * ascension path becomes: save to the pool cap, buy the deepest node of a cell
 * outright, scribe a second copy, declare. That turns a condition built as a
 * conjunction of four unlikely facts into a favor-accumulation race and takes
 * the whole plausibility argument for the 5–20% ascension band with it. Pricing
 * deep grants steeply instead was considered and rejected: a price is a delay,
 * and a hundred world years of saving is not a design constraint, it is a
 * loading screen.
 *
 * The others: the node must have zero instances anywhere (teaching and scribing
 * are the route to further copies), the target mage must be alive, and
 * `permits` must return true for the node's cell.
 *
 * Granted at full mastery, because a grant at the research default would sit
 * below the teach threshold — which, before `rules-magic`'s `practice` existed,
 * meant it could never leave the founder's head at all, making founding
 * knowledge a gift to one mage rather than to a universe. Practice gives a
 * below-threshold instance an exit now, so the grant is no longer the *only*
 * route above the threshold; it stays at full mastery anyway, because a
 * founding gift that the founder had to spend a year drilling before she could
 * pass it on is a delay rather than a gift.
 *
 * ## The fifth precondition: the budget
 *
 * Grants are **scarce, not weak**. The shape above is untouched — a full
 * instance at `grantMastery`. When the budget was written, that shape was
 * load-bearing for a second reason that has since gone: `setMastery`'s only
 * non-test caller was the decay pass and it lowers, so a granted instance was
 * the *one* source of knowledge above the teach threshold a universe had.
 * `practice` is a second source now, and the argument for keeping grants strong
 * is the one above rather than that scarcity. What is limited is the count,
 * through `canGrantFoundingKnowledge`, and a universe carrying no
 * `grant-budget` row is unbounded exactly as it was before the row existed.
 *
 * The refusal is here **and** in `agent-api`'s candidate list, which is the same
 * belt-and-braces the edict budget gets: the mask must close so a bot cannot
 * submit an action that silently does nothing, and the rules must refuse so that
 * a caller which never consulted a mask cannot spend past the budget anyway.
 *
 * `seededNodes` is incremented only when the grant makes a node **newly**
 * ever-known. A god who re-seeds a node the universe once held and lost has not
 * introduced anything, and crediting it would let the god quietly inflate the
 * count that its own accrual is measured against.
 */
function grantPlan(
  state: SimState,
  universe: EntityHandle,
  mageId: number | undefined,
  nodeId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (mageId === undefined || nodeId === undefined) return undefined;
  const node = deps.catalog.node(nodeId);
  if (node === undefined) return undefined;
  if (node.prerequisites.length > 0) return undefined;
  if (deps.knowledge.instanceCount(nodeId) > 0) return undefined;
  if (!isLivingMage(state, mageId)) return undefined;

  const cellId = deps.cells.cellOf(nodeId);
  if (!isCellId(cellId)) return undefined;
  if (!permits(readRulesetForObservation(state, universe), cellId)) return undefined;
  if (!canGrantFoundingKnowledge(state, universe)) return undefined;

  // Read before the write, because `createInstance` is what marks a node
  // ever-known and asking afterwards would answer `true` for every grant.
  const wasKnown = deps.knowledge.wasEverKnown(nodeId);

  return {
    cost: interventionCost(ACTION.grantFoundingKnowledge, deps.god.costs, { nodeTier: node.tier }),
    apply: () => {
      deps.knowledge.createInstance({
        nodeId,
        locationKind: LOCATION_KIND.mind,
        locationId: mageId,
        acquiredTick: worldTick,
        mastery: deps.god.constants.grantMastery,
      });
      spendFoundingGrant(state, universe, wasKnown);
    },
  };
}

/**
 * Charges one grant against the budget, and records whether it seeded a node.
 *
 * A universe with no budget row is one where no budget is in force, so there is
 * nothing to charge and nothing to record — the ledger is the budget's own, and
 * writing half of it into a world that declined to have one would turn "no
 * budget" into "a budget of zero" the moment anything created the row.
 */
function spendFoundingGrant(
  state: SimState,
  universe: EntityHandle,
  wasEverKnown: boolean,
): void {
  const store = componentOf(state, GRANT_BUDGET);
  if (!store.has(universe)) return;
  store.set(universe, 'grantsUsed', (store.get(universe, 'grantsUsed') ?? 0) + 1);
  if (!wasEverKnown) {
    store.set(universe, 'seededNodes', (store.get(universe, 'seededNodes') ?? 0) + 1);
  }
}

// ---------------------------------------------------------------------------
// 9: blessing
// ---------------------------------------------------------------------------

/**
 * Blessing a mage: a bounded, temporary uplift made of primitives that already
 * exist.
 *
 * One row per mage, so re-blessing writes `expiryTick` on the row already there
 * — the refresh-not-stack rule is structural rather than checked, because there
 * is no representation in which a mage holds two blessings.
 *
 * Concurrency is capped at `1 + worshipTier`, counted over rows still in force.
 * Refreshing a mage who is already blessed does not consume a slot she is
 * already occupying, which is why the cap is checked only when the mage has no
 * live row.
 */
function blessPlan(
  state: SimState,
  universe: EntityHandle,
  mageId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (mageId === undefined || !isLivingMage(state, mageId)) return undefined;

  const live = activeBlessings(state, worldTick);
  const already = live.some((entry) => entry.mage === mageId);
  const cap = 1 + readUniverse(state, universe).worshipTier;
  if (!already && live.length >= cap) return undefined;

  const store = componentOf(state, BLESSING);
  const expiryTick = worldTick + deps.god.constants.blessDurationTicks;
  return {
    cost: interventionCost(ACTION.blessMage, deps.god.costs),
    apply: () => {
      if (store.has(mageId as EntityHandle)) {
        store.set(mageId as EntityHandle, 'expiryTick', expiryTick);
        return;
      }
      attachRecord(state, BLESSING, mageId as EntityHandle, { mageId, expiryTick });
    },
  };
}

// ---------------------------------------------------------------------------
// 10: standing roles
// ---------------------------------------------------------------------------

/**
 * Assigning a standing role — the only field of a mage any intervention writes.
 *
 * The interventions spec makes that a conformance property: *"no intervention
 * may set a mage's goal, target, movement, or spell choice"*, and the mage's
 * own utility scoring keeps producing her decisions afterwards. A role bias is
 * an input to that scoring, not a replacement for it.
 *
 * Assigning the role a mage already holds is refused rather than charged, for
 * the same reason a vacuous edict is: it is a slot that reliably does nothing.
 */
function rolePlan(
  state: SimState,
  mageId: number | undefined,
  roleId: number | undefined,
  deps: InterventionDeps,
): Plan | undefined {
  if (mageId === undefined || roleId === undefined) return undefined;
  if (!Object.values(MAGE_ROLE).includes(roleId as never)) return undefined;
  if (!isLivingMage(state, mageId)) return undefined;

  const store = componentOf(state, MAGE);
  if (store.get(mageId as EntityHandle, 'roleId') === roleId) return undefined;

  return {
    cost: interventionCost(ACTION.assignRole, deps.god.costs),
    apply: () => {
      store.set(mageId as EntityHandle, 'roleId', roleId);
    },
  };
}

// ---------------------------------------------------------------------------
// 11: universities
// ---------------------------------------------------------------------------

/**
 * Funding a university, or founding one with a target of `0`.
 *
 * §4.2 gives the two one action id, so they share a mask entry and differ in
 * price: founding reads its own constant rather than a second cost row, because
 * the cost table is keyed on action ids and there is only one.
 *
 * A newly founded university starts at zero progress and contributes nothing —
 * not to worship, not to capacity — until `buildProgress` reaches `fp(1024)`.
 * Funding a completed one is refused: there is nothing left to buy.
 */
function fundPlan(
  state: SimState,
  universityId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (universityId === undefined || universityId < 0) return undefined;

  if (universityId === 0) {
    return {
      cost: deps.god.costs.foundUniversity,
      apply: () => {
        const library = state.entities.create();
        attachRecord(state, LIBRARY, library, { foundedTick: worldTick });
        const university = state.entities.create();
        attachRecord(state, UNIVERSITY, university, {
          libraryId: library,
          capacity: deps.god.constants.foundUniversityCapacity,
          buildProgress: 0,
        });
      },
    };
  }

  const store = componentOf(state, UNIVERSITY);
  if (!store.has(universityId as EntityHandle)) return undefined;
  const progress = store.get(universityId as EntityHandle, 'buildProgress');
  if (progress >= FP_ONE) return undefined;

  return {
    cost: interventionCost(ACTION.fundUniversity, deps.god.costs),
    apply: () => {
      store.set(
        universityId as EntityHandle,
        'buildProgress',
        Math.min(progress + deps.god.constants.fundProgress, FP_ONE),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// 12: research emphasis
// ---------------------------------------------------------------------------

/**
 * Encouraging research on one cell.
 *
 * The emphasis decays linearly to nothing, and its **magnitude is derived from
 * the remaining ticks rather than stored**: a stored magnitude beside a stored
 * expiry is two records of one linear decay, and the day they disagree the
 * emphasis is either immortal or already gone. See {@link emphasisAt}.
 *
 * Concurrency is bounded, and the bound is a refusal rather than a displacement:
 * the fourth encouragement is masked until one decays. Displacing the oldest
 * would make the action always legal and its effect depend on state the agent
 * cannot see in the mask.
 */
function encouragePlan(
  state: SimState,
  universe: EntityHandle,
  cellId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (cellId === undefined || !isCellId(cellId)) return undefined;
  if (!permits(readRulesetForObservation(state, universe), cellId)) return undefined;

  const live = activeEncouragements(state, worldTick);
  const existing = live.find((entry) => entry.cellId === cellId);
  if (existing === undefined && live.length >= deps.god.constants.encourageMaxCells) {
    return undefined;
  }

  const constants = deps.god.constants;
  // Ceiling division: the emphasis reaches zero on the tick the last whole
  // step of decay is spent, so a magnitude that does not divide evenly by the
  // decay rate lasts the extra tick rather than one short of it. Flooring here
  // was the alternative and would make `emphasisAt` return a positive value on
  // a tick the row had already expired.
  const lifetime = Math.ceil(constants.encourageMagnitude / constants.encourageDecayPerTick);
  const expiryTick = worldTick + lifetime;

  return {
    cost: interventionCost(ACTION.encourageResearch, deps.god.costs),
    apply: () => {
      if (existing !== undefined) {
        componentOf(state, ENCOURAGED_CELL).set(existing.handle, 'expiryTick', expiryTick);
        return;
      }
      const handle = state.entities.create();
      attachRecord(state, ENCOURAGED_CELL, handle, { cellId, expiryTick });
    },
  };
}

/**
 * A cell's current research emphasis, `fp`, derived from what is left of its
 * lifetime.
 *
 * `(expiryTick − worldTick) × decayPerTick`, held at the authored magnitude so
 * that a refresh cannot exceed a fresh encouragement, and at zero once the row
 * lapses. Derived rather than stored — see {@link encouragePlan}.
 */
export function emphasisAt(
  expiryTick: number,
  worldTick: number,
  constants: GodContent['constants'],
): Fixed {
  const remaining = expiryTick - worldTick;
  if (remaining <= 0) return 0;
  return Math.min(remaining * constants.encourageDecayPerTick, constants.encourageMagnitude);
}

// ---------------------------------------------------------------------------
// 13: tradition
// ---------------------------------------------------------------------------

/**
 * Changing the universe's tradition: one ruinous act.
 *
 * The price exceeds the favor cap at every worship tier below the highest, so
 * the action is *structurally unavailable* to a young universe rather than
 * merely expensive — vision §4a's "at enormous cost, and it throws the
 * civilization into upheaval" without needing a separate gate. The remaining
 * pool is zeroed on top of the price, and the tradition shock runs five times
 * longer than a forbidding's.
 *
 * Existing instances are not touched here. Migration between a memory-palace
 * `store` hook and a standard one is `knowledge-model`'s, through the tradition
 * hooks; an intervention that destroyed or duplicated instances on its own
 * would be a second entry point into the loss machinery with different
 * semantics.
 */
function traditionPlan(
  state: SimState,
  universe: EntityHandle,
  traditionId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (traditionId === undefined || traditionId <= 0) return undefined;
  const store = componentOf(state, UNIVERSE);
  if (store.get(universe, 'traditionId') === traditionId) return undefined;

  return {
    cost: interventionCost(ACTION.changeTradition, deps.god.costs),
    apply: () => {
      store.set(universe, 'traditionId', traditionId);
      // Zeroed *after* the price is paid, which is why the two are not one
      // number: the cost is what the mask judges affordability against, and the
      // zeroing is a consequence the agent cannot dodge by spending first.
      store.set(universe, 'favor', 0);
      applyShock(
        state,
        deps.god.constants.traditionShock,
        worldTick + deps.god.constants.traditionShockTicks,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// 14: portals
// ---------------------------------------------------------------------------

/**
 * Opening a portal.
 *
 * Everything up to the moment the clock changes mode, and nothing after it:
 * the engagement itself is `raid-engagement`'s and is not specified here.
 *
 * Three preconditions beyond affordability — the cell carrying the `portal`
 * primitive is permitted, a living mage holds a node carrying it, and the
 * target names a universe. The last is the caller's to supply: §1.1 puts one
 * universe in a simulation instance, so a portal target is a handle into a
 * multiverse this process does not hold, and an empty target list means the
 * action is masked, which is the correct answer for a single-universe Monte
 * Carlo run.
 */
function portalPlan(
  state: SimState,
  universe: EntityHandle,
  targetId: number | undefined,
  deps: InterventionDeps,
): Plan | undefined {
  if (targetId === undefined || targetId === 0) return undefined;
  if (portalMagicHolder(state, universe, deps) === 0) return undefined;

  return {
    cost: interventionCost(ACTION.openPortal, deps.god.costs),
    apply: () => {
      deps.requestEngagement();
    },
  };
}

/**
 * A living mage holding a permitted node that carries the `portal` primitive,
 * or `0`.
 *
 * Extracted rather than duplicated because actions 14 and 16 are the same
 * design claim pointing two ways: a universe that has not worked out how to
 * hold a threshold open is alone, and being alone is what it means to be unable
 * either to raid or to ally. `ages-of-magic.md` §2f states the peaceful half —
 * *"the peaceful counterpart to the portal"* — and two copies of the predicate
 * would let one half of that sentence drift away from the other.
 *
 * **Measured, and it is a finding rather than a detail.** On this build no
 * draconic-only run in a hundred ever satisfies this predicate: the closure to
 * `rl-open-the-portal` is seven nodes across two cells ending at tier 4, and
 * `speciesTargetTerm` prices a tier-4 node for a curiosity-256 species at the
 * −384 bound. The species this gate is between and its rescue is the species
 * least able to pass it. That is a fact about where the portal nodes sit in the
 * grid, not a reason to price the alliance differently, and it is recorded in
 * the branch's measurement rather than patched around here.
 */
function portalMagicHolder(
  state: SimState,
  universe: EntityHandle,
  deps: InterventionDeps,
): EntityHandle {
  const ruleset = readRulesetForObservation(state, universe);
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    for (const nodeId of heldNodeIds(state, handle)) {
      if (!deps.catalog.node(nodeId)) continue;
      const cellId = deps.cells.cellOf(nodeId);
      if (!isCellId(cellId) || !permits(ruleset, cellId)) continue;
      if (deps.portalNodes.has(nodeId)) return handle;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 16: alliances
// ---------------------------------------------------------------------------

/**
 * Inviting a scholar of another species.
 *
 * `ages-of-magic.md` §2f: *"alliances between realms are the way that you get
 * visiting mages."* This is the smallest thing that makes that sentence true
 * against `contracts.md` §1.1, which puts one universe in a simulation
 * instance and therefore leaves no second realm to negotiate with. What
 * arrives is an **immigrant, not a modifier** — an ordinary `MAGE` row of the
 * invited species, affiliated to one of this universe's universities, indexed
 * by every loop that counts a mage, free to research, teach and be taught.
 *
 * ## Four preconditions, and each one is doing separate work
 *
 * 1. **The species is on the caller's roster.** §1.1 again: who would send
 *    anyone is not a fact this universe's state holds.
 * 2. **No living mage of that species is already here.** This is what stops the
 *    verb being free immigration. A universe may import the kind of academic it
 *    lacks and may never import a second copy of itself, so a species with a
 *    healthy roster of its own gains nothing — which is the asymmetry the
 *    mechanic exists to create. Draconic, whose `maturityMonths` of 3,600
 *    exceeds the whole 2,400-tick horizon and which therefore cannot promote a
 *    single new mage inside a run, gains the most; orc, which promotes
 *    constantly, gains almost nothing.
 * 3. **The universe holds portal magic.** The owner's design, and the same
 *    predicate action 14 uses. See {@link portalMagicHolder}.
 * 4. **A university exists to host her.** A visiting scholar is hosted, not
 *    merely resident, and affiliation is what lets her scribe at all
 *    (`scribeThroughputFor` returns zero for an unaffiliated mage). The lowest
 *    handle among universities is chosen — deterministic, and not a claim that
 *    it is the best one; ranking hosts is the universities layer's to own.
 *
 * ## What it deliberately does not do
 *
 * No familiarity, no per-pair affinity, no resistance or damage bonus —
 * §2g's accumulating `(your species, their species)` quantity is a schema-
 * bearing mechanic and this action does not need it to be measurable. No cost
 * in mages sent the other way either: §2f's *"a mage sent abroad is subtracted
 * from a stationed set"* is the half that needs a second simulated realm, and
 * inventing a one-sided version of it here would price a mechanic against a
 * cost the model cannot yet represent. Both are named so a reader knows they
 * were declined rather than missed.
 */
function invitePlan(
  state: SimState,
  universe: EntityHandle,
  speciesId: number | undefined,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  if (speciesId === undefined || speciesId <= 0) return undefined;
  if (!deps.invitableSpecies.has(speciesId)) return undefined;

  const species = deps.speciesOf(speciesId);
  if (species === undefined) return undefined;

  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive !== 0 && row.speciesId === speciesId) return undefined;
  }

  if (portalMagicHolder(state, universe, deps) === 0) return undefined;

  let host: EntityHandle = 0;
  for (const { handle } of collectRecords(state, UNIVERSITY)) {
    if (host === 0 || handle < host) host = handle;
  }
  if (host === 0) return undefined;

  return {
    cost: interventionCost(ACTION.inviteScholar, deps.god.costs),
    apply: () => {
      const mage = state.entities.create();
      // Born `maturityMonths` ago, so she arrives an adult who can work this
      // tick. A scholar who had to grow up here would be a birth wearing a
      // diplomat's name, and for draconic — whose maturity exceeds the run —
      // it would make the action do nothing at all inside a measurable horizon.
      attachRecord(
        state,
        MAGE,
        mage,
        createMage(deps.rng, mage, species, speciesId, worldTick - species.maturityMonths, host),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// 15: ascension
// ---------------------------------------------------------------------------

/**
 * Declaring ascension.
 *
 * Free, and gated. The condition being met makes the action legal; it does not
 * end the run — a summit that triggers itself is not a decision, and vision §8a
 * frames ascension as a choice about when to stop. It also gives the harness a
 * clean signal: the gap between condition-met and declaration is informative on
 * its own, and an agent that never declares is telling you the terminal reward
 * is mispriced against continued play.
 *
 * The eligibility itself is recomputed every world tick by the outcome system
 * and cached on the god-state row, so this reads a fact rather than re-deriving
 * one — which is what lets a condition *lapse* between ticks and the mask
 * follow it down.
 */
function ascensionPlan(
  state: SimState,
  universe: EntityHandle,
  worldTick: number,
  deps: InterventionDeps,
): Plan | undefined {
  const god = godState(state, universe);
  if (god.ascensionPath === ASCENSION_PATH.none) return undefined;
  if (worldTick < deps.god.constants.ascensionMinTick) return undefined;

  const store = componentOf(state, UNIVERSE);
  return {
    cost: 0,
    apply: () => {
      store.set(universe, 'ascended', 1);
      store.set(
        universe,
        'terminalReason',
        god.ascensionPath === ASCENSION_PATH.apotheosis
          ? TERMINAL_REASON.ascensionApotheosis
          : TERMINAL_REASON.ascensionCanon,
      );
      writeGodState(state, universe, { ...god, terminalTick: worldTick });
    },
  };
}

// ---------------------------------------------------------------------------
// Shared readers
// ---------------------------------------------------------------------------

function isLivingMage(state: SimState, mageId: number): boolean {
  const store = componentOf(state, MAGE);
  if (!store.has(mageId as EntityHandle)) return false;
  return store.get(mageId as EntityHandle, 'alive') !== 0;
}

/** Node ids a mage holds in mind or palace. §1.5 locates both by mage handle. */
function heldNodeIds(state: SimState, mage: EntityHandle): number[] {
  const found: number[] = [];
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.mind && row.locationKind !== LOCATION_KIND.palace) {
      continue;
    }
    if (row.locationId === mage) found.push(row.nodeId);
  }
  return found;
}

/** Recomputes `edictBudget` and `favorCap` from a tier. Used by the outcome system. */
export function tierDerivedValues(
  worshipTier: number,
  deps: InterventionDeps,
): { edictBudget: number; favorCap: Fixed } {
  return {
    edictBudget: edictBudgetFor(worshipTier, deps.edictBudgetMax),
    favorCap: favorCapFor(worshipTier, deps.god.constants),
  };
}
