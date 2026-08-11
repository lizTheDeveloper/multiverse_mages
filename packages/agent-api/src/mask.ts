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
 * ## What "legal" means at world scale, and what it does not
 *
 * Structural validity only: is there a bit left to flip, is there an edict to
 * revoke, does the candidate list have anything in it. **Affordability is not
 * checked here** — the favor price of an action, and the hysteresis §1.1's
 * `axisChangeCounters` feeds, are `god-agency`'s (§8), and pricing them in this
 * package would be a second copy of a formula that does not exist yet. The
 * `observation-action-space` spec asks only that these entries *"reflect
 * ordinary affordability and validity rather than being unconditionally
 * false"*, and a structurally-valid-only mask satisfies that while leaving the
 * affordability term to the layer that owns it.
 */

import type { SimState } from '@mm/sim-core';
import {
  ASCENSION_PATH,
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
import type { CandidateLists } from './candidates.js';

/** What {@link legalityMask} needs. */
export interface MaskInput {
  readonly state: SimState;
  /** The lists from `buildCandidates`, which decide 8–14. */
  readonly candidates: CandidateLists;
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

  return mask;
}

/** Whether an action's mask entry is set. Out-of-range ids read as illegal. */
export function isLegal(mask: Uint8Array, action: number): boolean {
  return mask[action] === 1;
}
