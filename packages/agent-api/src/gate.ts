/*
 * Multiverse Mages — the admission gate: illegal actions become no-ops, counted.
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
 * `docs/design/contracts.md` §4.2:
 *
 * > An agent that submits an illegal action gets a no-op and a counter
 * > increment — never an exception, never a silent partial effect. RL agents
 * > will submit illegal actions constantly; that must be cheap and observable.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is the **admission gate**: it decides whether a submission reaches the
 * rules at all. It is *not* an implementation of what the actions do. §5 puts
 * observation, the action space, and legality masks in `agent-api`, and §8
 * leaves the god's mechanics — the favor prices, the hysteresis, what
 * "encourage research" actually costs — to `god-agency`. Applying a
 * forbid-technique here would put a rule in the package the rules are forbidden
 * to import from, which is the cycle §5 rule 4 exists to prevent.
 *
 * So `admit` returns the submissions that survived, resolved from slot indices
 * into real parameters, ready to be handed to `step()` for whichever system
 * owns them. Everything else is discarded and counted.
 *
 * ## Why the gate re-derives the mask instead of taking the agent's
 *
 * §4.4: *"A slot referring to an entity that died between observation and
 * action is an ordinary illegal action."* An agent observes, decides, and
 * submits; between those the world may have moved, and a mage in slot 5 may be
 * dead. The mask the agent saw would still say action 9 is legal, because it
 * was. So the gate rebuilds the mask and the candidate lists against the state
 * the action is actually being submitted against, and a stale slot falls out as
 * an ordinary rejection — no exception, no special case, no separate counter.
 *
 * ## Why the gate is where a non-integer parameter dies
 *
 * `agent-api` is the last thing between a policy and `step`, and `step` does not
 * judge parameters — its `default:` arm says an unrecognised kind is *"somebody
 * else's vocabulary"* — so no layer downstream re-validates. A `techniqueId` of
 * `0.5`, a `NaN` cell id or an infinite edict index would therefore travel into
 * `ctx.actions` and be read by rules systems, which is a float in the rules path
 * and the first of `CLAUDE.md`'s non-negotiable constraints broken. `sim-core`'s
 * own `Action` calls its parameters *"deliberately flat integers"*; this is the
 * boundary that makes the sentence true rather than aspirational.
 *
 * Two placement decisions, both deliberate:
 *
 * - **After the mask, not before.** §4.2's remedy is the same either way — a
 *   no-op and a counted rejection — so the only thing the order changes is which
 *   reason is reported, and a masked action is masked whatever it carries.
 * - **On the direct-parameter arm only.** Actions 8–14 never forward the agent's
 *   number at all: the slot index goes through `candidateAt`, which checks
 *   `Number.isInteger` itself, and what is admitted comes from the candidate
 *   list this package built. There is nothing left there to validate, and
 *   checking anyway would silently change the reason a stale slot is reported
 *   under.
 *
 * ## Why the gate is allowed to touch `illegalActionCount`
 *
 * `SimState.noteIllegalAction` is the one mutator the core exposes for exactly
 * this, and its own comment says why the counter is state and not a local
 * tally: it feeds §7's `illegalActionRate`, so it has to survive a snapshot.
 * The gate increments it on the state the caller is about to step; `step`
 * clones, and the clone carries the count forward. Counting per *submission*
 * rather than per tick is deliberate and matches `step`'s own handling of
 * redundant clock actions — ten illegal submissions in one tick are ten.
 */

import type { Action, SimState } from '@mm/sim-core';

import { PARAMETERIZED_ACTIONS, candidateSlotCount, isGodAction } from './actions.js';
import type { CandidateInput } from './candidates.js';
import { buildCandidates, candidateAt } from './candidates.js';
import { isLegal, legalityMask } from './mask.js';

/** A submission the gate turned away, and why. */
export interface RejectedAction {
  /** The submission as it arrived. */
  readonly action: Action;
  /**
   * A short, stable reason.
   *
   * For diagnostics and for `illegalActionRate`'s *"spec-clarity smell"* note
   * in §7 — a rejection reason that dominates a run is usually a mask that is
   * lying rather than an agent that is confused. **Never fed back to the
   * agent**: it is not in the observation, and making it one would be a channel
   * the mask does not have.
   */
  readonly reason: RejectionReason;
}

export type RejectionReason =
  /** Not an id in §4.2's table at all. */
  | 'unknown-action'
  /** The mask, rebuilt against current state, says no. */
  | 'masked'
  /** A parameterized action arrived without a slot index. */
  | 'missing-slot'
  /** The slot is outside `0..k-1`, or names nothing in the current list. */
  | 'empty-slot'
  /**
   * A parameter is not an integer — a fraction, a `NaN`, or an infinity.
   *
   * Distinct from `'unknown-action'`, which says the *id* is not in §4.2's
   * table. This one says the id is fine and the value carried under it is not a
   * value of the type §4.2 gives it. Naming the two apart is what lets
   * `illegalActionRate`'s breakdown tell a policy emitting nonsense ids from one
   * emitting continuous parameters into a discrete action space — which are two
   * different bugs in two different layers.
   */
  | 'non-integer-parameter';

/** The outcome of screening one tick's submissions. */
export interface AdmissionResult {
  /**
   * Submissions that passed, with slot indices resolved to real parameters.
   *
   * Pass these to `step()`. An empty array is a perfectly ordinary tick: §4.2's
   * remedy for an illegal action is a no-op, and a no-op is the absence of an
   * action rather than an action that does nothing.
   */
  readonly admitted: readonly Action[];
  /** Everything turned away, in submission order. */
  readonly rejected: readonly RejectedAction[];
  /** The mask the gate judged against — the current one, not the agent's. */
  readonly mask: Uint8Array;
}

/** What {@link admit} judges against. */
export interface GateInput extends CandidateInput {
  readonly state: SimState;
}

/**
 * Screens one tick's submissions, counting every rejection on the state.
 *
 * @param input - The state the actions are submitted against, and what the
 * candidate lists are derived from.
 * @param submissions - In submission order. For a parameterized action (8–14),
 * `params[0]` is the **slot index** into that action's candidate list, not a
 * handle — §4.4 is explicit that the agent selects a slot index. Any further
 * entries are ignored; the slot names every parameter §4.2 lists.
 * @returns What survived, what did not, and the mask used. Never throws for a
 * bad submission — that is the contract.
 */
export function admit(input: GateInput, submissions: readonly Action[]): AdmissionResult {
  const { state } = input;
  const candidates = buildCandidates(input);
  const mask = legalityMask({ state, candidates });

  const admitted: Action[] = [];
  const rejected: RejectedAction[] = [];

  const reject = (action: Action, reason: RejectionReason): void => {
    rejected.push({ action, reason });
    state.noteIllegalAction();
  };

  for (const action of submissions) {
    if (!isGodAction(action.kind)) {
      reject(action, 'unknown-action');
      continue;
    }
    if (!isLegal(mask, action.kind)) {
      reject(action, 'masked');
      continue;
    }
    if (!PARAMETERIZED_ACTIONS.includes(action.kind)) {
      // 0–7 and 15 carry their parameters directly: technique bits, form bits,
      // cell ids, and edict indices are small, enumerable, and do not name
      // entities that can die. They pass through as submitted — but only after
      // the one check the other arm gets for free.
      const params = [...(action.params ?? [])];
      if (!params.every((value) => Number.isInteger(value))) {
        reject(action, 'non-integer-parameter');
        continue;
      }
      admitted.push({ kind: action.kind, params });
      continue;
    }

    const slot = action.params?.[0];
    if (slot === undefined) {
      reject(action, 'missing-slot');
      continue;
    }
    const candidate = candidateAt(candidates, action.kind, slot);
    if (candidate === undefined) {
      // Either past the end of a shorter-than-k list, or a slot whose entity is
      // gone. §4.4 makes both an ordinary illegal action, and they are not
      // distinguished here for the same reason: the agent already has the mask.
      reject(action, 'empty-slot');
      continue;
    }
    admitted.push({ kind: action.kind, params: [...candidate.params] });
  }

  return { admitted, rejected, mask };
}

/** How many slots an action's candidate list has. Re-exported for callers driving the gate. */
export { candidateSlotCount };
