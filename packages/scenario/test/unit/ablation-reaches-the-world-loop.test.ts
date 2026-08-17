/*
 * Multiverse Mages — the ablation mask, from a RunTask to a different universe.
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
 * ## The test that was missing while §9 was unreachable
 *
 * `RunTask.ablatedPrimitives` was set by `tasks.ts`, validated by
 * `ablation.ts`, carried across the worker boundary, and read on the far side by
 * **nothing**. Every arm of an ablation sweep therefore ran the unablated
 * universe, and the campaign's own instrumentation found it the way it finds
 * everything of this shape: a counter on `stackMagnitudes` reported **0 of
 * 70,462** stacked magnitudes seeing a mask over a 300-tick reference run, and
 * the declared arm's outcome was byte-identical to the control's.
 *
 * `ablation-scheduling.test.ts` was green throughout. It asserts that `armSpec`
 * returns a spec whose `ablation.primitives` is `['ward']` and that `buildTasks`
 * copies that onto the task — both true, both irrelevant to whether the
 * simulation ever saw it. **A test that stops at the data structure is the test
 * that passes while the seam is open**, so this file deliberately never inspects
 * a mask, a spec or a task field. It runs two universes and compares what they
 * became.
 *
 * ## Why `resource-yield`, and why 240 ticks
 *
 * Both are measured rather than chosen, and the measurements are the reason the
 * obvious cheaper versions of this test do not work.
 *
 * **The primitive.** Only three call sites in `world-step.ts` forward
 * `deps.ablation` — `materialsProduced`, `advanceConstruction` and
 * `appliedYield` — so `resource-yield` and `build-rate` are the only two
 * primitives the world loop can currently neutralize at all. Masking
 * `research-rate`, `teach-rate`, `scribe-rate`, `fertility` or `lifespan` in a
 * reference run neutralizes **zero** stacked magnitudes today; a test written
 * over one of those would assert "no difference" and pass for the wrong reason.
 * `build-rate` is out for the reason `causal-chain-build-rate.test.ts` had to
 * hand-seed a site: the reference universe seeds its academy complete, so a
 * passive run has nothing to build.
 *
 * **The horizon.** Masking `resource-yield` neutralizes thousands of magnitudes
 * from early on — 2,997 by tick 120 — and the census is *still* identical at
 * tick 192, because a material surplus absorbs the loss. The census first
 * diverges between tick 192 and tick 204. 240 is four census intervals past
 * that boundary, where the divergence is 23% of knowledge instances and 71% of
 * grimoires: far enough that a content tweak moving the boundary a little
 * cannot silently turn this into a passing test of nothing.
 *
 * Those two percentages read 20% and 68% until 2026-08-14. They were
 * re-measured on the `anti-requisites` tree — 3,190 → 2,462 and 1,024 → 298 —
 * and moved because that branch's exclusion pair is reachable here; see
 * `POPULATION_FLOOR_PERCENT` below. The argument is unchanged and the margin
 * got wider, not narrower.
 *
 * That last sentence is the whole argument for spending seconds here. A cheaper
 * horizon exists and would have been fine on the day it was written.
 *
 * ## Correction, re-measured on `main` at `57bcbc44`, 2026-08-15
 *
 * **Everything above this heading is a historical record. Four of its claims
 * are false on this ref, and the two that matter are false in the direction
 * that makes this file weaker than it reads.** They are left standing rather
 * than edited in place because the argument they make is still the right
 * argument; it is the numbers under it that moved.
 *
 * 1. **There are four forwarding sites, not three.** `academic-effects.ts`
 *    added `workOne`'s `libraryRateMultiplier` call, which is how the three
 *    library rates reach the mask. (`reference-universe.ts`'s "three
 *    `deps.ablation === undefined` sites" is still literally true — that fourth
 *    site passes the mask positionally rather than through the spread idiom.)
 * 2. **`research-rate`, `teach-rate` and `scribe-rate` no longer neutralize
 *    zero magnitudes.** Instrumented over this file's own arm at `cohortSize: 4`
 *    they neutralize 3,241, 302 and 471 respectively. `fertility` and
 *    `lifespan` still neutralize zero, and so do `build-rate`, `portal` and
 *    `worship-yield`; see `ablation-mask-is-consulted.test.ts`, which pins the
 *    whole reachability census rather than asserting it in prose.
 * 3. **The margin at `HORIZON` is 5% of knowledge and 19% of grimoires, not 23%
 *    and 71%.** Re-measured at this file's exact levels
 *    (`cohortSize: 12, foundingMages: 2, foundingNodes: 4`, seed `0x12345678`,
 *    strategy `permissive-breadth`): control 322 / 68 / **1,137** / 248 against
 *    ablated 322 / 67 / **1,080** / 201 — knowledge −57, grimoires −47. The
 *    coupling this file measures has weakened roughly thirteen-fold since the
 *    2026-08-14 reading, and the same instrument on `integration/group-f`
 *    reports **1,131 == 1,131**: the margin reaching zero.
 * 4. **A longer horizon does not restore it, so the fix is not the constant.**
 *    Same levels, control against `resource-yield`: 240 → −5% knowledge / −19%
 *    grimoires; 360 → −3% / **+3%**; 480 → −5% / −20%; 600 → −0% / −30%. At 360
 *    the grimoire assertion below would *invert*. 240 is a lucky horizon rather
 *    than a safe one, and the sentence above claiming a content tweak cannot
 *    quietly turn this into a passing test of nothing is no longer true.
 *
 * **What was deliberately not done about (3) and (4).** No assertion here was
 * touched and no constant was re-pinned. A `toBeLessThan` weakened to fit a
 * shrinking margin is the exact edit CLAUDE.md forbids, and moving `HORIZON` to
 * whichever value happens to have margin today would be choosing the horizon
 * from the answer. The thinning margin is a fact about the game — applied yield
 * matters less to knowledge accumulation than it did — and it belongs to
 * whoever owns the material economy, not to the instrument.
 *
 * **What was done instead.** `ablation-mask-is-consulted.test.ts` is the
 * positive control this file never had. When this file reports "no difference",
 * run that one: it separates *the mask never reached `stackMagnitudes`* — which
 * would void every ablation number in the repository — from *the mask
 * substituted 4,776 times and the universe absorbed it*, which is what a thin
 * margin looks like and is a finding rather than a broken instrument.
 */

import { describe, expect, it } from 'vitest';

import type { RunTask } from '@mm/mc-harness';

import { executeReferenceRun, referenceContent } from '../../src/index.js';
import type { CensusSample } from '../../src/census.js';

/**
 * The horizon both arms run to. See the file comment: measured, not picked.
 */
const HORIZON = 240;

/** A cheap horizon, for the runs that only have to be *identical*. */
const SHORT_HORIZON = 36;

/**
 * The primitive both arms disagree about.
 *
 * One of exactly two the world loop can neutralize today. If this test ever
 * fails because `resource-yield` stopped being one of them, the fix is to
 * forward `deps.ablation` at more call sites, not to change this constant.
 */
const ABLATED = 'resource-yield';

/**
 * Shared across every run but the last on purpose.
 *
 * A `ReferenceContent` is read-only and reused across thousands of runs — an
 * executor pre-resolves one, and `CONTENT_BY_TRADITION` memoizes one per
 * tradition for the life of a worker. So the realistic wrong version of this
 * fix is one that folds the mask into `content.deps`, which mutates or
 * replaces a value later runs still hold. Passing one object to both the
 * ablated run and the control after it is what gives the leak test below
 * something real to catch.
 */
const shared = referenceContent();

function taskFor(ablatedPrimitives: readonly string[], worldTickCap: number): RunTask {
  return {
    coordinates: {
      sweepId: 'ablation-reaches-the-world-loop',
      rootSeed: 0x1234_5678,
      cellIndex: 0,
      replicateIndex: 0,
    },
    runSeed: 0x1234_5678,
    levels: { cohortSize: 12, foundingMages: 2, foundingNodes: 4 },
    strategies: ['permissive-breadth'],
    worldTickCap,
    metrics: [],
    ablatedPrimitives: [...ablatedPrimitives],
  };
}

function censusOf(task: RunTask, content = shared): CensusSample {
  const result = executeReferenceRun(task, { content });
  const last = result.samples.at(-1);
  if (last === undefined) {
    throw new Error('A completed run kept no census sample; the recorder is not sampling.');
  }
  return last;
}

/**
 * The two long arms, run once between them.
 *
 * Memoized rather than run per test, and *lazily* rather than at module scope:
 * a run at this horizon costs seconds, four assertions read the pair, and work
 * done while a file is being collected is outside every test timeout — which
 * turns a slow machine into a collection error rather than into a slow test.
 *
 * The control is taken **first**, deliberately. If a mask ever leaked into the
 * shared `ReferenceContent`, taking the control afterwards would hide the leak
 * inside the very number the leak test compares against.
 */
let pair: { control: CensusSample; ablated: CensusSample } | undefined;
function arms(): { control: CensusSample; ablated: CensusSample } {
  if (pair === undefined) {
    const control = censusOf(taskFor([], HORIZON));
    pair = { control, ablated: censusOf(taskFor([ABLATED], HORIZON)) };
  }
  return pair;
}

/** Long enough for two 240-tick runs on a machine several agents are sharing. */
const RUN_TIMEOUT_MS = 300_000;

/**
 * How far below the control's population the ablated arm is allowed to finish,
 * as a percentage.
 *
 * ## This was an equality, and the equality was wrong
 *
 * It read `expect(ablated.population).toBe(control.population)`, and its comment
 * gave the reason: the divergence above should read as *"a loss the arm suffered
 * rather than an arm that died"*. Both arms did land on the same population for
 * as long as nothing in content could kill a school of magic.
 *
 * The `anti-requisites` branch ships one exclusion pair — `creo-ignem` ⊥
 * `creo-umbra`, resolution `destructive` — and **this file is the only run in
 * the suite that can see it.** Every balance gate plays the v1 rectangle
 * (`intellego · perdo · rego` × `mentem · terram · limen · nomen`); both halves
 * of the pair are `creo`, so no gate can reach either cell. This test permits
 * the full grid. So the two arms now lose different mages' schools at different
 * ticks, their demographic paths separate, and the equality became a claim the
 * mechanic legitimately breaks: **298 control, 300 ablated.**
 *
 * ## Why a floor, and why one-sided
 *
 * The equality was never the point — *not having died* was. So the replacement
 * is the weakest statement that still says that, and no weaker:
 *
 * - **One-sided.** The observed drift is *upward* (+2), and an ablated arm
 *   finishing with slightly more people is not the failure this guards. The
 *   inverted-mask failure the file comment warns about — `0` substituted for
 *   `FP_ONE` in `additive-into-multiplier`, multiplying an arm's whole economy
 *   by zero — is already caught by the two `toBeLessThan` assertions above,
 *   which a better-off arm cannot satisfy.
 * - **A constant, not a ratio off `knowledgeInstances`.** A tolerance derived
 *   from the very quantity that is diverging widens itself as the mechanic
 *   grows, which is how a guard stops guarding without anyone editing it.
 * - **95, and it is a backstop rather than a discriminator. Stated plainly,
 *   because the alternative is a line that looks like a guard and is not.**
 *
 * ## The measurement that says so, and what it means for the old equality
 *
 * Every primitive was ablated in turn at `HORIZON` against the same control
 * (population 298, living mages 67, knowledge 3,190, grimoires 1,024):
 *
 * | ablated | population | living mages | knowledge | grimoires |
 * |---|--:|--:|--:|--:|
 * | `resource-yield` | 300 (+2) | 67 (0) | 2,462 (−728) | 298 (−726) |
 * | `fertility` | 298 (0) | 67 (0) | 3,190 (0) | 1,024 (0) |
 * | `lifespan` | 298 (0) | 67 (0) | 3,190 (0) | 1,024 (0) |
 * | `research-rate` | 298 (0) | 67 (0) | 3,190 (0) | 1,024 (0) |
 * | `teach-rate` | 298 (0) | 67 (0) | 3,190 (0) | 1,024 (0) |
 * | `scribe-rate` | 298 (0) | 67 (0) | 3,190 (0) | 1,024 (0) |
 * | `build-rate` | 298 (0) | 67 (0) | 3,190 (0) | 1,024 (0) |
 *
 * Six of the seven are byte-identical to the control, which is the file
 * comment's claim about `resource-yield` re-measured rather than restated. And
 * one row harsher than any of them: substituting `0` for `FP_ONE` in
 * `additive-into-multiplier` — the inversion this file warns about, which
 * multiplies the ablated arm's yield by zero — costs **97 % of its grimoires**
 * (1,024 → 31) and **31 % of its knowledge**, and still leaves population at
 * **297 against 298** and living mages **unchanged at 67**.
 *
 * **So the equality this replaced never had power.** It held because population
 * is very nearly decoupled from `resource-yield` at this horizon, not because
 * the two arms were demographically matched — and a 2-mage knock-on through the
 * exclusion pair was enough to break it. No ablation lever available moves
 * population by more than 2 of 298, so nothing this test can do will trip the
 * floor today.
 *
 * It is kept rather than deleted because the coupling is real at longer
 * horizons and is documented elsewhere in the repository:
 * `gate-power.test.ts`'s `BLIND_ARM_LINES` records
 * `referencePeakPopulation@permissive-breadth` moving 7,009 → 12,685 at the
 * 2,400-tick gate "because applied food raises `K` hardest in the arm that
 * permits the most cells". A floor that costs nothing and would catch that
 * coupling arriving at 240 ticks is worth its line; a floor presented as though
 * it were discriminating between the arms today would not be.
 *
 * ## The negative control is on the assertions that do have power
 *
 * Not on this one, for the reason above. The three `deps.ablation` forwarding
 * sites in `coordination`'s `world-step.ts` — `materialsProduced`,
 * `advanceConstruction` and `appliedYield` — were severed, reproducing the
 * defect this file was written for: the ablated arm goes byte-identical to the
 * control, `not.toEqual` fails, and both `toBeLessThan` assertions fail with
 * `expected 3190 to be less than 3190`. Restoring the three lines returns all
 * six tests to green.
 *
 * ## A second, independent reason the equality had to go — `w187/effects-union`
 *
 * The paragraphs above were written against the `anti-requisites` failure. The
 * union of the two effect campaigns hit the same assertion from a different
 * direction, and the diagnosis is worth keeping because it is the stronger form
 * of the claim: *the equality was never structural, and it was not structural
 * before any of these changes landed.*
 *
 * It passes at `d11e09c` (the academic rate wire alone) and at `3219c62` (the
 * vitality wire alone) and failed on their merge, which reads exactly like an
 * interaction defect. Measured across six seeds instead of one, on this tree,
 * it is not. Each cell is `ablated.population − control.population`:
 *
 * | seed | both wires off | academic only | vitality only | both |
 * |---|--:|--:|--:|--:|
 * | `0x12345678` | 0 | +1 | 0 | **+1** |
 * | `0x00000001` | **−5** | **−2** | **−5** | **−2** |
 * | `0x00000002` | 0 | 0 | 0 | 0 |
 * | `0xdeadbeef` | 0 | 0 | 0 | 0 |
 * | `0x0badc0de` | 0 | **−1** | 0 | **−1** |
 * | `0x5eed0007` | 0 | 0 | 0 | 0 |
 *
 * **The first column is not all zeroes.** It is also not a simulation of the
 * past: the same sweep was run on an unmodified checkout of `e2b89d8`, this
 * branch's merge base, with no instrumentation and neither wire present, and
 * seed `0x00000001` finishes **three** people apart there too. So "it passed
 * before and fails now" is a statement about `0x12345678`, and the sign is not
 * systematic: +1, −1, −2, −3 and −5 all appear.
 *
 * The channel predates every wire. `resource-yield` feeds `stock.food`; food is
 * the only kind `carryingCapacity` reads; capacity sets `fertilityBrake`; and
 * `deliverBirths` is stochastic. Two arms whose food histories differ take
 * different draws.
 *
 * ## And the vitality column is zero for a reason worth its own paragraph
 *
 * On the pre-`anti-requisites` base this table looked very different: the
 * vitality wire raised population from 325 to 392 on its own and to 494 with
 * the academic wire, over 2,592 gathered contributions. **On this tree, with
 * `#161` merged, the vitality wire gathers zero contributions at all six seeds
 * whenever the academic rate wire is on** — and 650 to 739 at three of the six
 * when it is off, worth 283 → 365, 311 → 382 and 328 → 408 in population.
 *
 * That is not the wire breaking. It is `creo-ignem ⊥ creo-umbra` resolving
 * `destructive` under a faster research rate: the sooner a mage reaches the
 * other half of an excluded pair, the sooner she burns the school, and the
 * `lifespan` and `fertility` nodes live in `creo-animal`, `creo-corpus` and
 * `creo-fatum`'s neighbourhood rather than in the v1 rectangle. The agency
 * baseline records the same mechanism at gate scale, where it is not seed
 * anecdote: `referenceNodesKnown@permissive-breadth` **42.5 → 36.625** when
 * these wires land on top of `#161`, against `#161` itself having taken it from
 * 68.63 to 42.50. **That delta was read off a baseline re-record that has since
 * been reverted** — no baseline in this tree was regenerated, by standing rule —
 * so it is a measurement someone took once and not a number this repository
 * currently commits. **Do not re-derive it to check: that means running a gate,
 * and gates are deferred until the wiring is finished.** Treat it as a lead. The
 * six-seed instrumentation above is the evidence that lives in the tree, and the
 * 68.63 → 42.50 half of the comparison is committed — `docs/design/anti-requisites.md`
 * and the agency baseline's own rationale both carry it.
 *
 * **Three separate mechanics now meet on `permissive-breadth` and are invisible
 * everywhere else**, which is a fact about the opening square rather than about
 * any of them.
 *
 * Measured 2026-08-14 on `w187/effects-union` merged with `origin/main`
 * `1e2651a`; the pre-wire control on an unmodified `e2b89d8`.
 */
const POPULATION_FLOOR_PERCENT = 90;

/*
 * **95 until 2026-08-16, and the reason it moved is the reason this file
 * exists.**
 *
 * On `4621db1a` the two assertions above this one — *"a task naming an ablated
 * primitive produces a different universe"* and *"neutralizing resource-yield
 * costs the universe knowledge and grimoires"* — **failed**, at
 * `2366 === 2366`. The arms were byte-identical: the ablation was a null by
 * construction, and this floor passed for the emptiest possible reason, because
 * the ablated arm *was* the control.
 *
 * On `w/exp-yields` both of those pass and this one failed. `resource-yield`
 * now routes through fourteen distinct form baskets instead of nine, reads a
 * per-universe land mix, and is tilted by species aptitude — so neutralizing it
 * finally costs something. Measured at this horizon and seed: **263 people
 * against a control of 279**, which is 94.3%.
 *
 * The claim the assertion makes is *"lost knowledge rather than people, so this
 * is not a collapsed universe"*, and 94.3% is not a collapsed universe by any
 * reading. What 95 was, was a threshold chosen against arms that did not
 * differ. 90 is chosen to leave the claim's meaning intact — a universe that
 * kept nine tenths of its people while losing knowledge and grimoires is
 * exactly the asymmetry being asserted — with enough margin that the next
 * wiring merge does not have to move it again. It is not chosen to clear 94.3
 * by a hair, which would make the number a record of one run rather than a
 * statement about collapse.
 */

describe('an ablation arm is not its own control', () => {
  it('a task naming an ablated primitive produces a different universe', () => {
    const { control, ablated } = arms();
    // Not `not.toEqual` on one field: the claim is that the *run* diverged, and
    // naming the field would let a future change satisfy this by moving a
    // different number.
    expect(ablated).not.toEqual(control);
  }, RUN_TIMEOUT_MS);

  it('neutralizing resource-yield costs the universe knowledge and grimoires', () => {
    const { control, ablated } = arms();
    // The direction is asserted, not only the difference. A mask that arrived
    // and made the ablated arm *better* would satisfy the test above, and would
    // mean the neutralization identity is inverted — which `ablation.ts` warns
    // about at length for `additive-into-multiplier`, where substituting `0` for
    // `FP_ONE` multiplies the arm's whole economy by zero.
    expect(ablated.knowledgeInstances).toBeLessThan(control.knowledgeInstances);
    expect(ablated.grimoires).toBeLessThan(control.grimoires);
  }, RUN_TIMEOUT_MS);

  it('lost knowledge rather than people, so this is not a collapsed universe', () => {
    const { control, ablated } = arms();
    // Integer arithmetic rather than a ratio, so the assertion has no floating
    // point in it and the failure message prints two whole populations.
    expect(ablated.population * 100).toBeGreaterThanOrEqual(
      control.population * POPULATION_FLOOR_PERCENT,
    );
  }, RUN_TIMEOUT_MS);

  it('the two arms ran the same length, so the difference is not a shorter run', () => {
    const { control, ablated } = arms();
    expect(ablated.worldTick).toBe(control.worldTick);
  }, RUN_TIMEOUT_MS);
});

describe('the mask belongs to one run', () => {
  it('does not leak into the memoized content the next run reuses', () => {
    // Same shared `ReferenceContent` the ablated run above was executed against,
    // versus a content set that has never seen a mask. A fix that wrote the mask
    // into `content.deps` — the obvious one-line version — would make every
    // subsequent run holding that object an ablation arm, and the sweep would
    // still complete with entirely plausible numbers.
    arms();
    const afterAblated = censusOf(taskFor([], SHORT_HORIZON));
    const untouched = censusOf(taskFor([], SHORT_HORIZON), referenceContent());
    expect(afterAblated).toEqual(untouched);
  }, RUN_TIMEOUT_MS);
});

describe('a task the mask cannot represent is refused', () => {
  it('names both primitives rather than ablating the first', () => {
    // `ablationMaskFor` rather than `neutralizing(ids[0])`, so a pairwise arm
    // cannot be recorded under two names having neutralized one.
    expect(() => executeReferenceRun(taskFor(['ward', 'blink'], SHORT_HORIZON), { content: shared }))
      .toThrow(/single-primitive only/);
  });
});
