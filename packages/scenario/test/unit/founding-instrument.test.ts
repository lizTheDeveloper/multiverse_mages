/*
 * Multiverse Mages — the founding table, and the control that makes its zeroes
 * readable.
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
 * ## Why a positive control, and why it predicts a tick
 *
 * The reference universe used to ship a founding academy. It was removed so that
 * `universityCount` could actually be zero — a dozen strategy promotions in the
 * pool are gated on *"while `universityCount` is zero"* and were gated on a
 * condition the starting position falsified before tick 0 existed. The question
 * that change exists to settle is *does anybody found one*, and it is answered
 * by a counter.
 *
 * A counter that answers zero is indistinguishable from a counter that never
 * fired. This campaign has published three confident zeroes from broken
 * instruments, and the first version of this very watcher was a fourth: it held
 * the `SimState` that `Scenario.create` returned and read the `UNIVERSITY`
 * component off it, which reports the tick-0 world forever because `sim-core`'s
 * `step` clones. It said **0 universities founded on a run that founded 195**.
 *
 * So the control is not "some strategy founds something". It is a prediction:
 * favor opens at 0, `favor-regen-base` is fp 1024 per tick, `found-university-cost`
 * is fp 10240, and worship lags upward from nothing — so a god who saves for
 * exactly one thing crosses the price in the region of ten world ticks. Measured
 * on this build the ledger opens tick 9 at 10463 and the university appears that
 * tick. {@link FOUNDING_WINDOW} is that prediction with room for a retune of the
 * regen constants; a probe founding at tick 0 or tick 300 fails it, where
 * *"non-zero"* would have passed either.
 */

import { describe, expect, it } from 'vitest';

import {
  FOUNDING_PROBE,
  auditFounding,
  formatFounding,
  referenceContent,
} from '../../src/index.js';

/**
 * The tick range the positive control must found inside.
 *
 * Wide enough to survive a modest retune of `favor-regen-base` or the worship
 * lag, narrow enough that an instrument reading the starting position (tick 0)
 * or one firing on noise late in the run fails. The measured value is 9.
 */
const FOUNDING_WINDOW = { min: 5, max: 25 } as const;

const content = referenceContent();
const audits = auditFounding({ content });
const probe = audits.find((audit) => audit.strategyId === FOUNDING_PROBE.strategyId);

describe('the founding instrument has a positive control', () => {
  it('reports the whole table, so the numbers exist whatever the verdict', () => {
    expect(audits.length).toBeGreaterThan(1);
    // The table is the deliverable, so it is printed rather than only asserted.
    console.log(`\n${formatFounding(audits)}\n`);
  });

  it('founds a university at the tick the favor arithmetic predicts', () => {
    expect(probe).toBeDefined();
    expect(probe?.founding.founded).toBeGreaterThan(0);
    expect(probe?.founding.firstFoundedTick).toBeGreaterThanOrEqual(FOUNDING_WINDOW.min);
    expect(probe?.founding.firstFoundedTick).toBeLessThanOrEqual(FOUNDING_WINDOW.max);
  });

  it('agrees with the god ledger about how many foundings resolved', () => {
    // Two independent counters: `founded` is a census of the `UNIVERSITY`
    // component taken from the world step report, and `timesApplied` is the
    // god's own `spentByAction`. The probe never funds an existing site — its
    // only preference is slot 0 — so on this strategy alone the two must be the
    // same number, and a disagreement means one of them is reading something
    // else. This is the check the broken first version failed.
    const applied = probe?.verbs.find((verb) => verb.action === 11)?.timesApplied;
    expect(probe?.founding.founded).toBe(applied);
    expect(probe?.founding.submittedFund).toBe(0);
  });

  it('separates legality from affordability, because action 11 conflates them', () => {
    // §4.2 gives founding and funding one id, and `cheapestPrice` admits the
    // mask entry while *either* is affordable. The two columns are different
    // questions and a table that read one as the other would misreport intent.
    //
    // **The inequality reversed, and the reversal is the measurement.** It used
    // to read `legal > affordable`: the mask was the loose constraint and the
    // favor pool the tight one, so the probe saw action 11 legal far more often
    // than it could pay to found. Since `fund-university` took a `labor` price
    // the order is the other way round — measured 2026-08-16 on this branch,
    // legal on **13** ticks against **579** on which the favor pool alone could
    // have paid.
    //
    // That is not the price being too high. `labor` has **no faucet in the v1
    // opening square**: Corpus is the only form that yields it and Corpus is
    // outside `intellego · perdo · rego` × `mentem · terram · limen · nomen`, so
    // production over 600 reference ticks is exactly zero and the founding
    // endowment is a runway rather than an income. The reserve floor under the
    // construction hire keeps the last of that runway spendable by the verb; it
    // cannot manufacture more. Opening the body-magic column is what would.
    //
    // Asserted as *"the two series are not the same series"* plus the direction
    // now observed, rather than as a bare inequality either way: the point of
    // the original was that legality and affordability come apart, and that is
    // still exactly what this checks.
    const legal = probe?.founding.ticksLegal ?? 0;
    const affordable = probe?.founding.ticksAffordable ?? 0;
    expect(legal).not.toBe(affordable);
    // Materials bind first, and favor is no longer what gates founding.
    expect(affordable).toBeGreaterThan(legal);
    // The probe still founds, so the run this reads is one in which the verb
    // resolved rather than one in which it was masked from end to end — without
    // this the assertion above would pass on a build where action 11 was never
    // legal at all.
    expect(probe?.founding.founded).toBeGreaterThan(0);
    expect(probe?.founding.submittedFound).toBeGreaterThan(probe?.founding.founded ?? 0);
  });

  it('keeps the passive control at zero, so the counter is not simply always on', () => {
    const control = audits.find((audit) => audit.strategyId === 'passive-control');
    expect(control?.founding.submittedFound).toBe(0);
    expect(control?.founding.founded).toBe(0);
    expect(control?.founding.firstFoundedTick).toBe(-1);
  });
});

describe('the shipped starting position, measured rather than described', () => {
  const control = audits.find((audit) => audit.strategyId === 'passive-control');
  const breadth = audits.find((audit) => audit.strategyId === 'permissive-breadth');

  /**
   * The reference universe ships a **founding academy**, complete at tick zero.
   * `reference-universe.ts` says why — scribing needs a university, and an
   * unaffiliated mage's scribe throughput is zero — and this is that decision
   * stated as a number rather than as prose.
   *
   * `passive-control` never takes an action, so a completed university on its
   * run at tick 0 can only have come from the scenario.
   */
  it('opens with a completed university nobody founded', () => {
    expect(control?.founding.founded).toBe(0);
    expect(control?.founding.completed).toBe(1);
    expect(control?.founding.firstCompletedTick).toBe(0);
  });

  /**
   * **The measurement this module was written to take.**
   *
   * `strategies.ts` records, in `permissive-breadth`'s own version history, that
   * `fundUniversity` *"moved ahead of the three ruleset actions **while
   * `universityCount` is zero**"* and that before the move *"the strategy that
   * exists to fund broadly completed no university in any run of any sweep ever
   * taken."* That is a claim about the pool that had never been run as an
   * experiment, and it is still true after the fix — for a different reason.
   *
   * The promotion is conditional on `universityCount === 0`, and the starting
   * position above makes that condition **permanently false**. So the strategy
   * whose stated role is to fund broadly submitted action 11 only through its
   * funding lines — and never once named slot 0.
   *
   * **The change arrived, by a route this comment did not anticipate.** The
   * assertion was written expecting to fail "the day the founding academy leaves
   * the starting position". The academy has not moved. What moved is that
   * `fundUniversity`'s slot index is now rotated over the **live** candidate
   * list instead of `candidateSlotCount`'s declared pin, and that list holds two
   * entries in the reference position — slot 0, "found a new one", and the one
   * existing academy. `round % 2` reaches slot 0 every other round, so the
   * strategy that exists to fund broadly now founds.
   *
   * Kept as a measurement rather than deleted, with the number updated: the
   * point of the original was that a stated role and an observed behaviour had
   * come apart, and the honest record of that is the before *and* the after.
   * Before: 0 submitted, 0 founded. After: 3 submitted.
   */
  it('lets permissive-breadth found a university once the live candidate list is rotated', () => {
    expect(breadth?.founding.submittedFound).toBeGreaterThan(0);
    // Affordability was never the constraint, and still is not — this is the
    // control that separates "it could not pay" from "it never asked".
    expect(breadth?.founding.ticksAffordable).toBeGreaterThan(0);
  });

  it('still moves knowledge by teaching, which is the channel a university is not needed for', () => {
    expect(control?.founding.lessonsTaught).toBeGreaterThan(0);
  });
});
