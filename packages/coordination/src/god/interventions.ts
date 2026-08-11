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
import type { AxisChangeCounterRecord } from '@mm/state';
import { FP_ONE, TIME_MODE } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { CellResolver, KnowledgeSubsystem, NodeCatalog } from '@mm/rules-magic';
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
  TERMINAL_REASON,
  UNIVERSE,
  UNIVERSITY,
  UPHEAVAL,
  activeBlessings,
  activeEncouragements,
  attachRecord,
  collectRecords,
  componentOf,
  isCellId,
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
  return Number.isInteger(kind) && kind >= ACTION.permitTechnique && kind <= ACTION.declareAscension;
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
  return rows[0]?.handle ?? 0;
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
  const cost = interventionCost(actionId, deps.god.costs, {
    hysteresis: hysteresisMultiplier(counter.record.changeCount, deps.god.constants),
  });

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
  return {
    cost: interventionCost(ACTION.revokeEdict, deps.god.costs),
    apply: () => {
      state.entities.destroy(target.handle);
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
 * below the teach threshold and could never leave the founder's head — which
 * would make founding knowledge a gift to one mage rather than to a universe.
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
    },
  };
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

  const ruleset = readRulesetForObservation(state, universe);
  let holder = 0;
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    for (const nodeId of heldNodeIds(state, handle)) {
      if (!deps.catalog.node(nodeId)) continue;
      const cellId = deps.cells.cellOf(nodeId);
      if (!isCellId(cellId) || !permits(ruleset, cellId)) continue;
      if (!deps.portalNodes.has(nodeId)) continue;
      holder = handle;
      break;
    }
    if (holder !== 0) break;
  }
  if (holder === 0) return undefined;

  return {
    cost: interventionCost(ACTION.openPortal, deps.god.costs),
    apply: () => {
      deps.requestEngagement();
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
