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
 * ## The engagement rule, which is the whole point of this module
 *
 * > **Every action except no-op is masked during engagement.** The god acts
 * > only in world time. This covers the ruleset actions 1–7 and 13, and equally
 * > 8–12, 14, and 15: blessing a defender mid-raid, or declaring ascension to
 * > escape a losing one, violates frozen policy exactly as squarely as
 * > forbidding a technique does. Silence in an earlier draft of this table was
 * > not permission.
 *
 * So {@link legalityMask} has exactly one branch at the top, and it is total:
 * in engagement mode the mask is `[1, 0, 0, …]` and nothing below it runs.
 * Written as an early return rather than as a per-action `&& !engaged` so that
 * an action added to §4.2 later is masked during engagement *by default* — the
 * failure mode this rule has already had once is an action that nobody
 * remembered to add to a list.
 *
 * This is the vision's frozen-policy rule (§3), enforced in one place. It is
 * not the *only* enforcement: §1.1 has a raid evaluate legality against a
 * ruleset snapshot captured at portal open, precisely because `rules-raid` may
 * not depend on this package (§5) and a mask it cannot see would protect
 * nothing. The two are belt and braces on purpose.
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
  axisChangeCount,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  TERMINAL_REASON,
  canIssueEdict,
  findUniverse,
  godStateOrEmpty,
  inEngagement,
  readEdicts,
  readUniverse,
} from '@mm/state';

import { ACTION_SPACE_SIZE, GOD_ACTION, PARAMETERIZED_ACTIONS } from './actions.js';
import type { ActionCostTable, ContentCatalogue } from './catalogue.js';
import type { CandidateLists } from './candidates.js';

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
}

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
    return mask;
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

  switch (action) {
    case GOD_ACTION.permitTechnique:
    case GOD_ACTION.forbidTechnique:
      return mul(base, cheapestAxisMultiplier(state, AXIS_KIND.technique, GRID_TECHNIQUE_COUNT, costs));
    case GOD_ACTION.permitForm:
    case GOD_ACTION.forbidForm:
      return mul(base, cheapestAxisMultiplier(state, AXIS_KIND.form, GRID_FORM_COUNT, costs));
    case GOD_ACTION.grantFoundingKnowledge: {
      // §4.2 prices a grant at `base × node tier`, so the cheapest grant is the
      // shallowest node in the list. `candidates` carries `[mageId, nodeId]`
      // pairs and the tier is the catalogue's, but the list is already
      // restricted to prerequisite-free roots — every one of which is tier 1 in
      // any content set where a root is a root. Priced at the base for that
      // reason, and stated rather than assumed.
      return base;
    }
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

/** Whether an action's mask entry is set. Out-of-range ids read as illegal. */
export function isLegal(mask: Uint8Array, action: number): boolean {
  return mask[action] === 1;
}
