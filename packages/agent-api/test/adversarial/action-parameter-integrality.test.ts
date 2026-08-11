/*
 * Multiverse Mages — adversarial: what the admission gate lets into the rules path.
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
 * # DEFECT 1 — a float parameter crosses the admission gate into `step`
 *
 * Two of the tests in this file **fail on purpose**. The case, in the three
 * parts a red test owes a reader:
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `admit()` in `src/gate.ts` validates `action.kind` — `isGodAction` requires
 * `Number.isInteger` — and, for the parameterized actions 8–14, validates the
 * slot index the same way before resolving it through `candidateAt`. For actions
 * 0–7 and 15 it does neither. It copies the agent's own parameter array through
 * verbatim:
 *
 * ```ts
 * admitted.push({ kind: action.kind, params: [...(action.params ?? [])] });
 * ```
 *
 * So `{ kind: GOD_ACTION.forbidTechnique, params: [0.5] }` is *admitted*, is
 * handed to `step()`, and arrives in `ctx.actions` for every rules system to
 * read. `NaN` and `Infinity` cross the same way.
 *
 * ## (b) What says otherwise
 *
 * `CLAUDE.md`'s first non-negotiable constraint:
 *
 * > **The simulation core is deterministic.** No `Math.random`, no `Date.now`,
 * > no wall-clock reads, **no floating-point arithmetic in the rules path**.
 * > Fixed-point integers at scale 1/1024.
 *
 * `sim-core`'s own `Action`, which is what `step` consumes:
 *
 * > **Deliberately flat integers.** `contracts.md` §4.2 defines the god's action
 * > space as discrete IDs with integer parameters […] A shape this narrow is
 * > also a shape the action log can serialize without a schema.
 *
 * `contracts.md` §4.2, on what happens to a submission that is not one of those:
 *
 * > An agent that submits an illegal action gets a no-op and a counter
 * > increment — never an exception, never a silent partial effect.
 *
 * And this package's own `saturate()`, refusing the mirror-image case one
 * direction out, in `src/layout.ts`:
 *
 * > Fixed-point arithmetic never produces a fraction, so a non-integer here is a
 * > float that reached the encoder — and §4.1 puts the only permitted float on
 * > the *export* path, past this point.
 *
 * The *export* path. A parameter travels the other way.
 *
 * ## (c) Why the asserted value is right
 *
 * `agent-api` is the last thing between a policy and `step`. `step` itself does
 * not judge parameters — its `default:` arm says *"an unrecognised kind here is
 * not illegal, it is somebody else's vocabulary"* — and no rules package
 * re-validates, because the gate is the stated place for that. A `techniqueId`
 * of `0.5` is not a technique; it is not an affordability question that §8's
 * `god-agency` owns, it is a value outside the type. Rejecting it costs one
 * `Number.isInteger` per parameter and yields exactly what §4.2 asks for: a
 * no-op and a counted rejection. Admitting it puts a double into a lockstep PvP
 * rules path, which is the failure `normalize.ts` spends four paragraphs
 * explaining that the project cannot tolerate.
 *
 * A `RejectionReason` for it does not exist yet; `'unknown-action'` fits the
 * existing vocabulary ("not an id in §4.2's table at all" generalises to "not a
 * submission §4.2's table describes"), but the tests below assert only that the
 * action does not reach the rules, not which string names the refusal.
 */

import type { Action } from '@mm/sim-core';
import { GOD_ACTION, admit, createSession } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

import { FIXTURE_CATALOGUE, LEAN_RESOURCES, plainScenario, universeHolding } from './worlds.js';

/** Submissions carrying a parameter that is not an integer. */
const NON_INTEGER_SUBMISSIONS: readonly Action[] = Object.freeze([
  { kind: GOD_ACTION.forbidTechnique, params: [0.5] },
  { kind: GOD_ACTION.permitTechnique, params: [2.0000000000000004] },
  { kind: GOD_ACTION.permitForm, params: [Number.NaN] },
  { kind: GOD_ACTION.issueDispensation, params: [Number.POSITIVE_INFINITY] },
  { kind: GOD_ACTION.revokeEdict, params: [-Number.MAX_VALUE] },
  { kind: GOD_ACTION.declareAscension, params: [1e-9] },
]);

/** Every parameter of every admitted action, flattened. */
function admittedParams(actions: readonly Action[]): number[] {
  return actions.flatMap((action) => [...(action.params ?? [])]);
}

describe('DEFECT 1 — the gate is the last integer boundary, and it does not hold', () => {
  it('FAILS ON PURPOSE: admits actions whose parameters are not integers', () => {
    const state = universeHolding(LEAN_RESOURCES);
    const result = admit({ state, catalogue: FIXTURE_CATALOGUE }, NON_INTEGER_SUBMISSIONS);

    // Nothing carrying a non-integer parameter may be handed to `step`.
    for (const value of admittedParams(result.admitted)) {
      expect(Number.isInteger(value), `admitted parameter ${String(value)}`).toBe(true);
    }
  });

  it('FAILS ON PURPOSE: lets a float reach ctx.actions inside step', () => {
    // The end-to-end version, because "admit returned it" and "the rules saw
    // it" are two claims and only the second one is the harm.
    const seen: Action[][] = [];
    const session = createSession({ scenario: plainScenario(seen) });
    session.reset(0x5150_0001, { worldTickCap: 4 });
    session.submit({ kind: GOD_ACTION.forbidTechnique, params: [0.5] });

    const reached = seen.flatMap((tick) => admittedParams(tick));
    for (const value of reached) {
      expect(Number.isInteger(value), `parameter seen by a rules system: ${String(value)}`).toBe(
        true,
      );
    }
  });

  it('HOLDS: a non-integer slot index on a parameterized action is rejected', () => {
    // The control, and the reason the two failures above are a gap rather than
    // a policy. Actions 8–14 route their parameter through `candidateAt`, which
    // does check `Number.isInteger` — so the package already knows this check
    // is needed and already spells it. Only the direct-parameter arm skips it.
    const state = universeHolding(LEAN_RESOURCES);
    const result = admit({ state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.blessMage, params: [0.5] },
      { kind: GOD_ACTION.encourageResearch, params: [Number.NaN] },
    ]);
    expect(result.admitted).toHaveLength(0);
    expect(result.rejected.map((entry) => entry.reason)).toEqual(['masked', 'empty-slot']);
  });

  it('HOLDS: an out-of-range integer parameter is passed through, as documented', () => {
    // Not asserted as a defect. `src/mask.ts` states that structural validity is
    // all this layer judges and that §8's `god-agency` owns the rest, and a
    // technique id of 9999 is an integer — it is the *type* boundary that this
    // file argues the gate owns, not the *range* one.
    const state = universeHolding(LEAN_RESOURCES);
    const result = admit({ state, catalogue: FIXTURE_CATALOGUE }, [
      { kind: GOD_ACTION.forbidTechnique, params: [9999] },
    ]);
    expect(result.admitted).toEqual([{ kind: GOD_ACTION.forbidTechnique, params: [9999] }]);
  });
});
