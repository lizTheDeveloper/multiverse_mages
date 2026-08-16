/*
 * Multiverse Mages — the legality mask over the god's action space.
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
 * `docs/design/contracts.md` §4.2: *"Legality mask is mandatory. Every
 * observation carries a boolean mask over the action space."*
 *
 * ## The engagement rule, and its repeal
 *
 * This module used to open with the frozen-policy rule quoted as law:
 *
 * > ~~**Every action except no-op is masked during engagement.** The god acts
 * > only in world time.~~
 *
 * **`docs/design/raid-engagement.md` §1 repeals that**, and the docstring
 * outlived the rule it quoted by long enough to be worth naming: the early
 * return below stayed a total mask while `rules-raid` grew six raid verbs, a
 * `RaidLock`, a revert surcharge and the `mid-raid-change` component — an
 * entire mechanic whose whole premise is that the god *does* act under fire.
 * `ui/raid/`'s framing question was *"every action is masked for the duration.
 * What is a player actually **doing** while a raid runs?"* and the answer the
 * mask gave was *nothing*.
 *
 * §4.2 now reads: during an engagement the **defender** may `permitTechnique`
 * (1), `permitForm` (3), `forbidTechnique` (2) and `forbidForm` (4), each of
 * which **locks** for the rest of the raid and leaves a mark that makes
 * reverting it afterwards cost more than it did under fire. Everything else
 * stays masked, and stays masked as an early-return default rather than as a
 * list somebody has to remember to extend — {@link ENGAGEMENT_ACTIONS} is the
 * allow-list, and an action added to §4.2 tomorrow is masked mid-raid unless it
 * is put there deliberately.
 *
 * ## What this mask can and cannot know, and why a phase arrives as data
 *
 * A raid's verbs decay across three phases and none is legal in resolution.
 * The phase is computable from `clock.engagementTick` — `rules-raid`'s
 * `phaseOf` takes elapsed ticks and nothing else — but *"has contact
 * happened"* and *"are all objectives resolved"* live in the engagement store,
 * which is not the world and which this package cannot reach: §5 forbids
 * `agent-api` from importing `rules-raid`, and the dependency runs one way only
 * so that a rules package can never be made to depend on the agent boundary.
 *
 * So the phase arrives as **data on the input**, exactly as the cost table
 * does — see {@link MaskInput.engagement}. Absent, the mask reports the four
 * actions legal on structure alone, which is the same honest-silence rule the
 * cost table follows: it says *"this action is well formed"* and stays silent
 * on a phase it was not told. The authority remains `rules-raid`'s: the lock
 * refuses a change the mask permitted, exactly as `permits()` refuses a cast,
 * and that belt-and-braces arrangement is unchanged by this — only its
 * *direction* is. The mask was refusing everything the rules allowed.
 *
 * ## What "legal" means at world scale
 *
 * Two things, in this order. **Structural validity**: is there a bit left to
 * flip, is there an edict to revoke, does the candidate list have anything in
 * it. Then **affordability**, which the favor-economy spec makes a mask
 * condition rather than a failure — *"an action whose cost exceeds the current
 * favor pool MUST have its legality mask entry set false"*.
 *
 * Affordability used to be absent here, on the argument that pricing an action
 * in this package would be a second copy of a formula `god-agency` had not
 * written. It has now, and the argument inverts: a mask that says yes where the
 * rules say no is the mask lying, and §7 calls a rejection reason that dominates
 * a run *"a spec-clarity smell"* for exactly that case. What this module does
 * **not** do is *decide* a price. The table arrives as data on the catalogue,
 * projected out of `god-cost.json`, and the only arithmetic here is picking the
 * cheapest way an action could resolve — because a flat mask entry over an
 * action with many parameters can only honestly mean *"there is some parameter
 * this god can afford"*.
 *
 * A catalogue carrying no cost table gets structural legality alone. That is an
 * honest answer rather than a wrong one: it says the action is well formed, and
 * stays silent on a price it was not told.
 */

import type { SimState } from '@mm/sim-core';
import { FP_ONE, mul } from '@mm/sim-core';
import {
  ASCENSION_PATH,
  AXIS_KIND,
  BAR_PHASE,
  axisChangeCount,
  componentOf,
  EDICT,
  EDICT_KIND,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  TERMINAL_REASON,
  canIssueEdict,
  collectRecords,
  findUniverse,
  godStateOrEmpty,
  inEngagement,
  readEdicts,
  readMidRaidMarks,
  readUniverse,
  revertSurcharge,
} from '@mm/state';

import { ACTION_SPACE_SIZE, GOD_ACTION, PARAMETERIZED_ACTIONS } from './actions.js';
import type { ActionCostTable, ContentCatalogue } from './catalogue.js';
import type { CandidateLists } from './candidates.js';

/**
 * What a caller knows about the engagement in flight, when there is one.
 *
 * Distinct from `observation.ts`'s `EngagementView`, which carries the whole
 * `Engagement` so the observation block can be laid out own-first. This one
 * carries **two answers rather than a structure**, because the questions the
 * mask asks — *"which side am I"* and *"does this phase still admit a ruleset
 * change"* — are `rules-raid`'s to answer, and a structure would invite this
 * package to answer them itself out of a store it should not be reading.
 *
 * Structural rather than a `Raid`, for the reason `phaseOf` takes structural
 * inputs and `permits()` takes a `Ruleset`: the engine, a test, and a client
 * projecting an observation should all be asking the same question, and only
 * one of the three has a `Raid` to hand. Supplying it is what lets the mask
 * follow a raid's phases down; omitting it is honest silence.
 */
export interface EngagementStance {
  /**
   * Which side this god is on. `0` attacker, `1` defender — `RAID_SIDE`'s
   * values, carried as a number because `agent-api` may not import a rules
   * package.
   *
   * Load-bearing rather than informational: forbidding is **defender-only**
   * (`raid-engagement.md` §6.2), because under host arbitration an attacker
   * closing her own cells changes nothing inside the universe she is standing
   * in. An attacker therefore gets no ruleset verb at all.
   */
  readonly side: number;
  /**
   * Whether this phase still admits a ruleset change.
   *
   * One boolean and not a phase number, deliberately. The phase → verb table is
   * `rules-raid`'s (`verbLegalIn`), and a second copy of it here is exactly the
   * drift `revertSurcharge` is imported rather than reimplemented to avoid. The
   * caller asks `rules-raid` and passes the answer.
   */
  readonly admitsRuleChange: boolean;
}

/** What {@link legalityMask} needs. */
export interface MaskInput {
  readonly state: SimState;
  /** The lists from `buildCandidates`, which decide 8–14. */
  readonly candidates: CandidateLists;
  /**
   * The catalogue, for its cost table. Optional, and absent means the mask
   * reports structural legality only — see the module note.
   */
  readonly catalogue?: ContentCatalogue | undefined;
  /**
   * The engagement in flight, when the caller knows about one.
   *
   * Only read while `clock.mode` is engagement. Absent there means the mask
   * reports {@link ENGAGEMENT_ACTIONS} on structure alone.
   */
  readonly engagement?: EngagementStance | undefined;
}

/**
 * The §4.2 actions an engagement admits, ascending.
 *
 * An explicit allow-list against an early return, so that the default for any
 * action added to §4.2 later is **masked** — which is the property the old
 * total mask had and the one worth keeping out of it. All four are ruleset
 * axis toggles, all four lock for the raid, and all four are the defender's.
 */
export const ENGAGEMENT_ACTIONS: readonly number[] = Object.freeze([
  GOD_ACTION.permitTechnique,
  GOD_ACTION.forbidTechnique,
  GOD_ACTION.permitForm,
  GOD_ACTION.forbidForm,
]);

/** `RAID_SIDE.defender`. Named here because `agent-api` may not import it. */
const DEFENDER_SIDE = 1;

/**
 * The mask, one byte per action id, `1` legal and `0` not.
 *
 * A `Uint8Array` rather than `boolean[]`: it crosses to a Python RL bridge
 * (§5's `gym-bridge`) as bytes with no per-element boxing, and its length is
 * fixed at construction, which is one fewer way for a mask to arrive at the
 * wrong width.
 */
export function legalityMask(input: MaskInput): Uint8Array {
  const { state, candidates } = input;
  const mask = new Uint8Array(ACTION_SPACE_SIZE);

  // No-op is always legal. §4.2 makes it the action an illegal submission is
  // *replaced by*, so a mask that could forbid it would leave a rejected action
  // with nothing legal to become.
  mask[GOD_ACTION.noop] = 1;

  if (inEngagement(state)) {
    return engagementMask(mask, input);
  }

  const universe = findUniverse(state);
  if (universe === 0) {
    // No universe yet: there is nothing to act on and every parameter would
    // name something absent. Not an error — a freshly created state is a
    // legitimate thing to observe.
    return mask;
  }

  const record = readUniverse(state, universe);

  // A run that has ended has nothing legal but the no-op. §4.3 makes the
  // episode over, and `god-agency`'s resolver refuses every submission against
  // a terminated universe — so a mask that kept reporting `assignRole` legal
  // would be handing an agent an action the rules will silently turn away. That
  // disagreement between the mask and the rules is exactly what
  // `illegalActionRate`'s *"spec-clarity smell"* note is about, and it is
  // cheaper to close here than to explain later.
  //
  // Written as an early return for the same reason the engagement branch above
  // is: an action added to §4.2 later is masked after termination *by default*,
  // rather than by somebody remembering to add it to a list.
  if (record.ascended !== 0 || record.terminalReason !== TERMINAL_REASON.none) {
    return mask;
  }

  const techniqueMask = (1 << GRID_TECHNIQUE_COUNT) - 1;
  const formMask = (1 << GRID_FORM_COUNT) - 1;

  mask[GOD_ACTION.permitTechnique] = (record.permittedTechniques & techniqueMask) === techniqueMask ? 0 : 1;
  mask[GOD_ACTION.forbidTechnique] = (record.permittedTechniques & techniqueMask) === 0 ? 0 : 1;
  mask[GOD_ACTION.permitForm] = (record.permittedForms & formMask) === formMask ? 0 : 1;
  mask[GOD_ACTION.forbidForm] = (record.permittedForms & formMask) === 0 ? 0 : 1;

  // §1.1: a new edict may be issued only while `length < edictBudget`, and the
  // budget is separately capped by EDICT_BUDGET_MAX. `canIssueEdict` is the one
  // implementation of that; re-deriving it here is how the two would drift.
  const canIssue = canIssueEdict(state, universe) ? 1 : 0;
  mask[GOD_ACTION.issueDispensation] = canIssue;
  mask[GOD_ACTION.issueInterdiction] = canIssue;
  mask[GOD_ACTION.revokeEdict] = readEdicts(state).length > 0 ? 1 : 0;

  for (const action of PARAMETERIZED_ACTIONS) {
    mask[action] = (candidates.get(action)?.length ?? 0) > 0 ? 1 : 0;
  }

  // §1.1's terminal flags are handled above, by the early return: a run that
  // has already ended cannot declare ascension again, and cannot do anything
  // else either. What remains here is the *eligibility*, which is
  // `god-agency`'s (vision §8a) and lives on the god-state row — the outcome
  // system recomputes it every world tick precisely so that it can lapse, and
  // reading it rather than re-deriving it is what makes the mask follow it down.
  mask[GOD_ACTION.declareAscension] =
    godStateOrEmpty(state, universe).ascensionPath === ASCENSION_PATH.none ? 0 : 1;

  applyAffordability(mask, state, candidates, input.catalogue?.costs, record.favor);

  return mask;
}

/**
 * Clears the entry of every action this god cannot pay for.
 *
 * Runs after structural legality rather than instead of it, so an action that
 * is both malformed and unaffordable stays masked for the structural reason —
 * which is the one that does not change when the pool refills.
 *
 * The price of an action with parameters is the **cheapest** way it could
 * resolve. A flat mask entry cannot say "affordable for these four cells and
 * not those three", so the only honest reading of a set entry is *"there is a
 * parameter this god can afford"*, and the candidate list is what says which
 * parameters exist.
 */
function applyAffordability(
  mask: Uint8Array,
  state: SimState,
  candidates: CandidateLists,
  costs: ActionCostTable | undefined,
  favor: number,
): void {
  if (costs === undefined) return;

  for (let action = 1; action < ACTION_SPACE_SIZE; action += 1) {
    if (mask[action] !== 1) continue;
    if (cheapestPrice(action, state, candidates, costs) > favor) mask[action] = 0;
  }
}

/** The lowest favor price at which an action could resolve, given its parameters. */
function cheapestPrice(
  action: number,
  state: SimState,
  candidates: CandidateLists,
  costs: ActionCostTable,
): number {
  const base = costs.byAction[action] ?? 0;
  if (base === 0 && action !== GOD_ACTION.fundUniversity) return 0;

  // `sound-design.md` §5.2's eight-bar unease. Applied to every §5.1 tier-3
  // action, after whatever else prices it, in the same order and with the same
  // `mul` `god-agency`'s `interventionCost` uses — see `coordination/god/timing.ts`.
  const unease = uneaseMultiplier(state, costs, action);

  switch (action) {
    case GOD_ACTION.permitTechnique:
    case GOD_ACTION.forbidTechnique:
      return mul(
        mul(base, cheapestAxisMultiplier(state, AXIS_KIND.technique, GRID_TECHNIQUE_COUNT, costs)),
        unease,
      );
    case GOD_ACTION.permitForm:
    case GOD_ACTION.forbidForm:
      return mul(
        mul(base, cheapestAxisMultiplier(state, AXIS_KIND.form, GRID_FORM_COUNT, costs)),
        unease,
      );
    case GOD_ACTION.issueDispensation:
    case GOD_ACTION.issueInterdiction:
      return mul(base, unease);
    case GOD_ACTION.grantFoundingKnowledge: {
      // §4.2 prices a grant at `base × node tier`, so the cheapest grant is the
      // shallowest node in the list. `candidates` carries `[mageId, nodeId]`
      // pairs and the tier is the catalogue's, but the list is already
      // restricted to prerequisite-free roots — every one of which is tier 1 in
      // any content set where a root is a root. Priced at the base for that
      // reason, and no longer merely stated: `@mm/content`'s
      // `roots-are-tier-one.test.ts` pins the equivalence in both directions,
      // because `candidates.ts` depends on it too and a content edit that broke
      // it would put the mask and `grantPlan` back into disagreement.
      return base;
    }
    case GOD_ACTION.revokeEdict:
      // **Both branches priced this action and the union made one unreachable.**
      // W21 grouped it with dispensation/interdiction under the unease
      // multiplier; `design/raid-engagement` gave it a dedicated arm charging
      // §1's revert surcharge. A textual union produced two `case
      // GOD_ACTION.revokeEdict` labels in one switch — the first wins, the
      // second is dead, and the only thing that reported it was eslint's
      // `no-duplicate-case` through `float-boundary.test.ts`. TypeScript
      // compiled it silently.
      //
      // Composed rather than chosen: the revert surcharge picks *which* edict is
      // cheapest to revoke, and the unease multiplier prices *when* the revoke
      // happens. They are independent and both are live, in the same order and
      // through the same `mul` that `coordination`'s `interventionCost` uses.
      return mul(cheapestRevoke(state, costs, base), unease);
    case GOD_ACTION.fundUniversity: {
      // Slot 0 founds and every other slot funds; §4.2 gives them one id, so the
      // entry is legal while *either* is affordable.
      const list = candidates.get(action) ?? [];
      const canFund = list.some((candidate) => candidate.params[0] !== 0);
      return canFund ? Math.min(base, costs.foundUniversity) : costs.foundUniversity;
    }
    default:
      return base;
  }
}

/**
 * The smallest hysteresis multiplier across an axis family, in `fp`.
 *
 * A god who has flipped one technique twice may still flip a different one at
 * the base price, so the cheapest flip available is the least-recently-churned
 * axis.
 *
 * Returned in `fp` and applied through the same `mul` `god-agency`'s
 * `interventionCost` uses, rather than divided out here into a whole-number
 * factor. Dividing first is correct only while `hysteresisStep` happens to be
 * `fp(1024)`; the moment a retune makes it anything else, the mask would price
 * an action a unit under what the rules charge, and the symptom would be one
 * action in a thousand admitted by the mask and refused by the resolver.
 */
function cheapestAxisMultiplier(
  state: SimState,
  axisKind: number,
  axisCount: number,
  costs: ActionCostTable,
): number {
  let lowest = FP_ONE;
  for (let bit = 0; bit < axisCount; bit += 1) {
    const count = axisChangeCount(state, axisKind, bit);
    const multiplier = FP_ONE + count * costs.hysteresisStep;
    if (bit === 0 || multiplier < lowest) lowest = multiplier;
  }
  return lowest;
}

/**
 * `sound-design.md` §5.2's unease multiplier, for a §5.1 tier-3 action.
 *
 * `fp(1024)` — nothing owing — for every other action, for a universe that has
 * never changed its own law, and for a cost table built before the rule
 * existed. The arithmetic is `coordination/god/timing.ts`'s `interventionPhase`
 * restated, for the reason `cheapestAxisMultiplier` restates hysteresis:
 * `contracts.md` §5 gives neither package an edge to the other, and the two are
 * bound by a test rather than by an import.
 */
function uneaseMultiplier(state: SimState, costs: ActionCostTable, action: number): number {
  const bars = costs.uneaseBars ?? 0;
  const step = costs.uneaseStep ?? 0;
  if (bars <= 0 || step === 0) return FP_ONE;
  if (action < GOD_ACTION.permitTechnique || action > GOD_ACTION.revokeEdict) return FP_ONE;

  const universe = findUniverse(state);
  if (universe === 0) return FP_ONE;
  const store = componentOf(state, BAR_PHASE);
  if (!store.has(universe)) return FP_ONE;

  const remaining = Math.max(store.get(universe, 'uneaseUntilTick') - state.clock.worldTick, 0);
  return FP_ONE + Math.min(remaining, bars) * step;
}

/**
 * The cheapest edict this god could revoke.
 *
 * Ordinary while any *unmarked* edict stands, because the mask's contract is
 * "there is a parameter this god can afford" rather than "every parameter is
 * affordable" — the same reading `cheapestAxisMultiplier` takes one case up.
 * When every standing edict is one a raid left, the cheapest revoke really is a
 * surcharged one, and reporting the base there would admit an action the
 * resolver refuses.
 *
 * Priced through `@mm/state`'s `revertSurcharge`, which is where that
 * arithmetic lives precisely so that this file and `coordination`'s resolver
 * cannot disagree: `agent-api` may not import a rules package and `coordination`
 * may not import `agent-api`, so a second copy here would be a player told they
 * can afford something the server refuses.
 */
function cheapestRevoke(state: SimState, costs: ActionCostTable, base: number): number {
  const marks = readMidRaidMarks(state);
  if (marks.length === 0) return base;

  const multiplier = costs.midRaidRevertMultiplier ?? FP_ONE;
  let cheapest = Number.POSITIVE_INFINITY;
  for (const { row } of collectRecords(state, EDICT)) {
    const mark = marks.find(
      (candidate) =>
        candidate.scope === RULE_SCOPE.cell &&
        candidate.targetId === row.cellId &&
        candidate.changeKind ===
          (row.kind === EDICT_KIND.interdiction ? RULE_CHANGE_KIND.forbid : RULE_CHANGE_KIND.permit),
    );
    const price = mark === undefined ? base : revertSurcharge(base, mark.paidCost, multiplier);
    if (price < cheapest) cheapest = price;
  }
  return cheapest === Number.POSITIVE_INFINITY ? base : cheapest;
}

/**
 * The mask during an engagement: {@link ENGAGEMENT_ACTIONS}, gated.
 *
 * Four gates, in order, each of which is the mask agreeing with a rule that
 * exists elsewhere rather than inventing one here:
 *
 * 1. **Nothing without an {@link EngagementStance}.** A caller that did not say
 *    which side it is on or whether the phase admits a change gets the no-op
 *    only. Silence is not permission — that is the same reading the repealed
 *    rule's own docstring took, and the only part of it worth keeping.
 * 2. **Defender only** (§6.2). An attacker's ruleset does not govern the
 *    universe she is standing in.
 * 3. **The phase still admits it** (§2). Resolution is watch-only.
 * 4. **The bit is there to flip**, which is the same structural test world time
 *    applies, read off the same universe row.
 *
 * Affordability is deliberately *not* applied. §3 prices a mid-raid change in
 * the **raid purse** — the defender's favor as it stood at portal open, less
 * what she has already spent inside this raid — and that purse is raid-scoped
 * state this package cannot see. Pricing it against the live universe row would
 * be a second, wrong copy of a rule `verbs.ts` owns: the row does not move
 * during a raid, and every spend is settled at resolution. So the mask reports
 * structural legality here and the lock refuses what the purse cannot buy —
 * which is exactly the split the cost-table note describes for a catalogue that
 * arrives without prices.
 */
function engagementMask(mask: Uint8Array, input: MaskInput): Uint8Array {
  const { state, engagement } = input;
  if (engagement === undefined) return mask;
  if (engagement.side !== DEFENDER_SIDE) return mask;
  if (!engagement.admitsRuleChange) return mask;

  const universe = findUniverse(state);
  if (universe === 0) return mask;

  const record = readUniverse(state, universe);
  // A terminated universe is a terminated universe mid-raid too. The world-time
  // branch returns early on this and the reason carries over unchanged: the
  // resolver refuses every submission against one, so reporting an action legal
  // would be the mask disagreeing with the rules.
  if (record.ascended !== 0 || record.terminalReason !== TERMINAL_REASON.none) return mask;

  const techniqueMask = (1 << GRID_TECHNIQUE_COUNT) - 1;
  const formMask = (1 << GRID_FORM_COUNT) - 1;

  mask[GOD_ACTION.permitTechnique] =
    (record.permittedTechniques & techniqueMask) === techniqueMask ? 0 : 1;
  mask[GOD_ACTION.forbidTechnique] = (record.permittedTechniques & techniqueMask) === 0 ? 0 : 1;
  mask[GOD_ACTION.permitForm] = (record.permittedForms & formMask) === formMask ? 0 : 1;
  mask[GOD_ACTION.forbidForm] = (record.permittedForms & formMask) === 0 ? 0 : 1;

  return mask;
}

/** Whether an action's mask entry is set. Out-of-range ids read as illegal. */
export function isLegal(mask: Uint8Array, action: number): boolean {
  return mask[action] === 1;
}
