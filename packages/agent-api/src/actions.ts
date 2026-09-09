/*
 * Multiverse Mages — the god's discrete action space.
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
 * `docs/design/contracts.md` §4.2's action table, ids 0–15, and §4.4's
 * slot-count constants.
 *
 * ## Why the ids are written out rather than generated
 *
 * They are serialized. An action log records `kind` as an integer
 * (`sim-core`'s `Action`), a replay reads it back, and a trained policy's output
 * layer is indexed by it. Renumbering is therefore the same class of change as
 * renumbering an RNG stream (§6): every recorded run and every trained policy
 * silently means something different afterwards, and nothing fails. So the table
 * is transcribed from §4.2 in the document's order, and
 * `action-space.test.ts` asserts each id against the document's number one by
 * one rather than against a derived sequence.
 *
 * ## These ids do not collide with `CORE_ACTION`
 *
 * `sim-core` numbers its own clock actions from the top of the `uint16` range
 * (`65534`, `65535`) *"so they cannot collide with the god's action space, which
 * `contracts.md` §4.2 numbers from 0"*. `noop` is `0` in both, which is not a
 * collision — it is the same action meaning the same thing.
 */

/**
 * `contracts.md` §4.2. **Ids are permanent.**
 *
 * The parameter columns of §4.2 are reproduced on each member, because the
 * parameter a slot index resolves to is the thing a reader most often has to
 * look up and most often guesses wrong.
 */
export const GOD_ACTION = {
  /** — */
  noop: 0,
  /** techniqueId */
  permitTechnique: 1,
  /** techniqueId */
  forbidTechnique: 2,
  /** formId */
  permitForm: 3,
  /** formId */
  forbidForm: 4,
  /** cellId */
  issueDispensation: 5,
  /** cellId */
  issueInterdiction: 6,
  /** edictIndex */
  revokeEdict: 7,
  /** mageId, nodeId — one candidate slot naming both (§4.4) */
  grantFoundingKnowledge: 8,
  /** mageId */
  blessMage: 9,
  /** mageId, roleId — one candidate slot naming both (§4.4) */
  assignRole: 10,
  /** universityId, or 0 to found a new one */
  fundUniversity: 11,
  /** cellId */
  encourageResearch: 12,
  /** traditionId */
  changeTradition: 13,
  /** targetUniverseId */
  openPortal: 14,
  /** — */
  declareAscension: 15,
  /** speciesId — the species whose scholar is invited (§4.2, `alliances`) */
  inviteScholar: 16,
} as const;

export type GodActionId = (typeof GOD_ACTION)[keyof typeof GOD_ACTION];

/** `17`. The length of every legality mask, and of a policy's output layer. */
export const ACTION_SPACE_SIZE = Object.keys(GOD_ACTION).length;

/** Every action id, ascending. */
export const ALL_GOD_ACTIONS: readonly GodActionId[] = Object.freeze(
  Object.values(GOD_ACTION).sort((a, b) => a - b),
) as readonly GodActionId[];

/**
 * The actions §4.2 says alter the ruleset or the tradition.
 *
 * Named as a set because the *reason* they are masked in engagement differs
 * from the reason 8–12, 14 and 15 are — these are the vision's frozen-policy
 * rule literally, the others are the same principle extended. Keeping the two
 * groups distinguishable is what lets a test assert §4.2's sentence rather than
 * assert a flat list that happens to match it.
 */
export const RULESET_ACTIONS: readonly GodActionId[] = Object.freeze([
  GOD_ACTION.permitTechnique,
  GOD_ACTION.forbidTechnique,
  GOD_ACTION.permitForm,
  GOD_ACTION.forbidForm,
  GOD_ACTION.issueDispensation,
  GOD_ACTION.issueInterdiction,
  GOD_ACTION.revokeEdict,
  GOD_ACTION.changeTradition,
]);

/**
 * The actions §4.4 gives a slot-indexed candidate list.
 *
 * *"Actions 8–14 carry entity handles drawn from a set that changes every tick,
 * and a flat discrete mask cannot express 'action 9, but only for these 40 of
 * 3,000 mages.'"* The range is the document's — 8 through 14 inclusive —
 * including 12 (`encourageResearch`, a cell id) and 13 (`changeTradition`, a
 * tradition id), which are content ids rather than handles. They are in the
 * range §4.4 names, so they get lists, and there is a practical reason as well
 * as a textual one: a cell list ranked by salience is how an agent is told
 * *which* cells are worth encouraging without the mask growing 70 entries.
 */
export const PARAMETERIZED_ACTIONS: readonly GodActionId[] = Object.freeze([
  GOD_ACTION.grantFoundingKnowledge,
  GOD_ACTION.blessMage,
  GOD_ACTION.assignRole,
  GOD_ACTION.fundUniversity,
  GOD_ACTION.encourageResearch,
  GOD_ACTION.changeTradition,
  GOD_ACTION.openPortal,
  GOD_ACTION.inviteScholar,
]);

/**
 * `k` per parameterized action: how many candidate slots the observation
 * carries.
 *
 * §4.4: *"`k` is a structural constant per action, pinned like
 * `EDICT_BUDGET_MAX`."* Pinned means what it means there — raising one of these
 * changes the meaning of every slot index a trained policy emits for that
 * action, so it is a contract change, not a tuning knob. The numbers are chosen
 * to be comfortably above what a decision at this scale needs and are not
 * claims about how many mages or universities exist.
 *
 * **Truncation is not tidy and is not meant to be.** `assignRole`'s candidates
 * are `(mage, role)` pairs and each living mage contributes three of them —
 * §1.2's four roles less the one she holds — so `k = 32` cuts the eleventh mage
 * off partway through her options. That is fine: a slot is a slot, the ordering
 * is deterministic, and an agent that wants a role for a mage far down the
 * ranking is asking for something the list was never going to offer. Rounding
 * `k` to a multiple of anything would suggest the boundary means something.
 */
export const CANDIDATE_SLOTS: Readonly<Record<number, number>> = Object.freeze({
  [GOD_ACTION.grantFoundingKnowledge]: 16,
  [GOD_ACTION.blessMage]: 32,
  [GOD_ACTION.assignRole]: 32,
  [GOD_ACTION.fundUniversity]: 8,
  [GOD_ACTION.encourageResearch]: 16,
  [GOD_ACTION.changeTradition]: 8,
  [GOD_ACTION.openPortal]: 8,
  // One slot per species the content declares, and the shipped table declares
  // six. Eight leaves room for two more without moving a pinned constant, which
  // is what `k` being pinned is for.
  [GOD_ACTION.inviteScholar]: 8,
});

/** How many candidate slots an action has. `0` for an action that takes none. */
export function candidateSlotCount(action: number): number {
  return CANDIDATE_SLOTS[action] ?? 0;
}

/** Whether an integer names an action in §4.2's table. */
export function isGodAction(action: number): action is GodActionId {
  return Number.isInteger(action) && action >= 0 && action < ACTION_SPACE_SIZE;
}
