/*
 * Multiverse Mages — the positive control under every ablation measurement.
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
 * ## The guard that was missing, and the night it was missed
 *
 * `ablation-reaches-the-world-loop.test.ts` and
 * `combat-ablation-reaches-a-raid.test.ts` are the two end-to-end proofs that
 * §9's mask reaches the simulation. Both work by running an ablated arm and a
 * control and asserting the two differ. **Neither can say anything when they
 * come back the same**, and on 2026-08-15 three instruments came back the same
 * on the same night — two on a twelve-branch integration merge, one on a branch
 * whose sweep declares no ablation at all — with no way to tell whether the
 * switch had gone inert or the subsystem was simply unreached.
 *
 * Those are opposite findings. An inert switch voids every ablation number this
 * repository has ever committed. An unreached subsystem voids none of them and
 * is a fact about the game. `ablation-probe.ts` explains the three readings; the
 * one-line version is that a census assertion folds *"the probe is broken"* into
 * *"the answer is no"*, which is the failure CLAUDE.md's **"a checker that
 * answers about the wrong input is worse than no checker"** section is entirely
 * about, and `scripts/w117-gate-check.sh` is the local precedent for splitting.
 *
 * So this file never asserts that a universe changed. It asserts that the mask
 * was **asked**, and reports what it was asked about. Run it first when an
 * ablation instrument reports a null:
 *
 * - **`consultations()` is 0** — the seam is severed somewhere between
 *   `ReferenceScenarioOptions.ablation` and `stackMagnitudes`, and every arm in
 *   flight is running the unablated universe. This is the historic defect, found
 *   by a throwaway counter reporting *0 of 70,462* stacked magnitudes masked.
 * - **`consultations()` is large and the primitive is absent from `asked`** —
 *   the mask is live and that primitive is never stacked in this run. The arm is
 *   a null by construction; recording it as a measured zero is a fabrication.
 * - **`neutralizations()` is large and the census did not move** — a real,
 *   reportable result. Note that it is *also* what a neutralization that happens
 *   to be a no-op looks like: `additive-into-multiplier` neutralizes to
 *   `FP_ONE`, and a primitive nobody has learned already stacks to `FP_ONE`, so
 *   substituting it changes nothing. That is the case the pinned census below
 *   exists to keep visible.
 *
 * ## Measured on `main` at `57bcbc44`, 2026-08-15
 *
 * Every count in this file was taken on that ref with `npm ci` run in the
 * worktree. They are pinned as tripwires, not as targets: a number moving is a
 * statement about reachability that somebody should read before it is re-pinned.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';

import { referenceContent, referenceScenario } from '../../src/index.js';
import { UNMATCHABLE, countingMask } from './ablation-probe.js';
import type { CountingMask } from './ablation-probe.js';

const content = referenceContent();

/**
 * The world-loop arm: no raids, small cohort, the horizon
 * `ablation-reaches-the-world-loop.test.ts` measures at.
 *
 * `raids: false` is deliberate rather than incidental. It makes the census
 * below a statement about the **world loop alone**, so a combat primitive
 * appearing in it would mean something had moved, and it keeps this arm cheap.
 */
const WORLD_SEED = 0x1234_5678;
const WORLD_TICKS = 240;
const WORLD_OPTIONS = { cohortSize: 4, foundingMages: 2, foundingNodes: 4 } as const;

/**
 * The raid arm: `combat-ablation-reaches-a-raid.test.ts`'s first seed and
 * horizon, which is the shortest run in the suite that actually opens portals.
 */
const RAID_SEED = 0x0bad_c0de;
const RAID_TICKS = 400;

/**
 * The primitives the **world loop** stacks, and the two seams they arrive
 * through.
 *
 * `resource-yield` comes through `produceMaterials` and `appliedYield`;
 * `research-rate`, `scribe-rate` and `teach-rate` come through `workOne`'s
 * `libraryRateMultiplier`, which `academic-effects.ts` added and which is the
 * **fourth** `deps.ablation` forwarding site in `world-step.ts` — the other
 * three being `produceMaterials`, `advanceUniversities` and `appliedYield`.
 *
 * A name arriving here is good news and the edit is to add it. A name leaving
 * here means an ablation arm over that primitive has silently become a null,
 * and the edit is **not** to delete the name.
 *
 * **`practice-rate` arrived on the combine of the five wiring merges into
 * `integration/all-branches`, 2026-08-16, which is this list doing its stated
 * job on its first day.** It was authored on `origin/main`, where the primitive
 * had no forwarding site at all: `w53/practice`'s design authored the primitive
 * and the design that survived the merge — `integration/group-e`'s — had not
 * consumed it, so the merge wired it through `workOne`'s `GOAL.practice` branch,
 * in the same `rate()` channel research and scribing use. **Measured, not
 * assumed:** this probe reports it stacked on the world arm at these levels, and
 * that is the whole reason it is added rather than the assertion being relaxed.
 * `check:consumption` still refuses it, and correctly — that check asks whether
 * a *node-driven* magnitude reaches the primitive, and only the god hook does.
 */
const WORLD_LOOP_PRIMITIVES: readonly string[] = Object.freeze([
  'practice-rate',
  'research-rate',
  'resource-yield',
  'scribe-rate',
  'teach-rate',
]);

/**
 * The primitives a **raid** adds, through the second seam.
 *
 * `coordination` may not import `@mm/rules-raid`, so the raid system takes its
 * mask through a separate argument — `reference-universe.ts` spreading
 * `options.ablation` into `raidSystem`, and `raids.ts` spreading `deps.ablation`
 * into `openPortal`. All seven combat primitives are stacked, which is the
 * finding worth keeping in view: `combat-ablation-reaches-a-raid.test.ts`
 * reports six of them as unmeasurable, and this file shows that is **not**
 * because the mask fails to reach them. It reaches them hundreds of times a run.
 * Nobody swings, so the neutralized magnitude is computed and discarded.
 */
const RAID_PRIMITIVES: readonly string[] = Object.freeze([
  'area-denial',
  'blink',
  'concealment',
  'direct-damage',
  'knowledge-steal',
  'summon',
  'ward',
]);

/**
 * Primitives the mask reaches in **neither** arm, recorded rather than asserted
 * away.
 *
 * An ablation sweep arm naming one of these is a null *by construction*: the
 * mask is consulted thousands of times in the same run and never about them.
 * `build-rate` is reachable in principle — `causal-chain-build-rate.test.ts`
 * hand-seeds a construction site to reach it — but the reference universe seeds
 * its academy complete, so a passive run never builds. `portal` is `presence`
 * and gates through `permits()` rather than through a stacked magnitude.
 *
 * The remaining three are the ones with no explanation on file: nothing in a
 * reference universe stacks `fertility`, `lifespan` or `worship-yield`, and
 * §7's `winRateByPrimitive` would report each of them as a measured effect of
 * zero. That is a finding for whoever owns the demography and worship systems,
 * and it is written here because this is the run that can see it.
 */
const UNREACHED_PRIMITIVES: readonly string[] = Object.freeze([
  'build-rate',
  'fertility',
  'lifespan',
  'portal',
  'worship-yield',
]);

/** Ticks between yields back to the event loop; see {@link play}. */
const YIELD_EVERY_TICKS = 60;

/** Two arms of a few hundred ticks each, on a machine several agents share. */
const RUN_TIMEOUT_MS = 300_000;

interface Arm {
  readonly hash: string;
  readonly raidLog: string;
  readonly raids: number;
}

/**
 * One universe stepped to its horizon with `mask` installed, or with none.
 *
 * Stepped directly rather than through a session, for the reason
 * `balance-telemetry.test.ts` gives: this compares a **snapshot hash**, and a
 * session deliberately does not hand its state out. Zero actions, so the mask is
 * the only difference between any two arms here.
 */
async function play(
  seed: number,
  ticks: number,
  raids: boolean,
  options: Record<string, number> | undefined,
  mask: CountingMask | undefined,
): Promise<Arm> {
  const run = referenceScenario(content, {
    raids,
    // Off everywhere in this file: nothing here reads a census, and the
    // recorder is seconds of work per arm.
    telemetry: false,
    ...(mask === undefined ? {} : { ablation: mask }),
  });
  let state: SimState = run.scenario.create(seed, {
    worldTickCap: ticks,
    ...(options === undefined ? {} : { options: { ...options } }),
  });
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    // A few hundred ticks of a real universe is seconds of uninterrupted
    // synchronous work, and a worker that never yields starves vitest's own
    // reporting channel — which surfaces as a `[vitest-worker]` timeout naming
    // no failing test at all.
    if (tick % YIELD_EVERY_TICKS === YIELD_EVERY_TICKS - 1) await new Promise(setImmediate);
  }
  return { hash: snapshotHash(state), raidLog: JSON.stringify(run.raids()), raids: run.raids().length };
}

/**
 * Every arm this file needs, run once between them and memoized.
 *
 * Six runs, and the assertions read them eleven times. Lazy rather than at
 * module scope: work done while a file is being collected is outside every test
 * timeout, which turns a slow machine into a collection error rather than a slow
 * test.
 */
interface Arms {
  readonly worldControl: Arm;
  readonly worldProbe: CountingMask;
  readonly worldProbeArm: Arm;
  readonly worldAblated: CountingMask;
  readonly raidControl: Arm;
  readonly raidProbe: CountingMask;
  readonly raidProbeArm: Arm;
  readonly raidAblated: CountingMask;
}

let memo: Promise<Arms> | undefined;
function arms(): Promise<Arms> {
  memo ??= (async (): Promise<Arms> => {
    const worldProbe = countingMask(UNMATCHABLE);
    const worldAblated = countingMask('resource-yield');
    const raidProbe = countingMask(UNMATCHABLE);
    const raidAblated = countingMask('knowledge-steal');
    // The controls are taken **first**, as `ablation-reaches-the-world-loop.ts`
    // takes its: a mask leaking into the shared `ReferenceContent` would
    // otherwise hide inside the very number the inertness claim compares to.
    const worldControl = await play(WORLD_SEED, WORLD_TICKS, false, WORLD_OPTIONS, undefined);
    const worldProbeArm = await play(WORLD_SEED, WORLD_TICKS, false, WORLD_OPTIONS, worldProbe);
    await play(WORLD_SEED, WORLD_TICKS, false, WORLD_OPTIONS, worldAblated);
    const raidControl = await play(RAID_SEED, RAID_TICKS, true, undefined, undefined);
    const raidProbeArm = await play(RAID_SEED, RAID_TICKS, true, undefined, raidProbe);
    await play(RAID_SEED, RAID_TICKS, true, undefined, raidAblated);
    return {
      worldControl,
      worldProbe,
      worldProbeArm,
      worldAblated,
      raidControl,
      raidProbe,
      raidProbeArm,
      raidAblated,
    };
  })();
  return memo;
}

describe('the probe does not perturb what it measures', () => {
  it('an unmatchable mask leaves the world loop byte-identical', async () => {
    const { worldControl, worldProbeArm } = await arms();
    // Not a weaker claim about a census: `stackMagnitudes` takes the unmasked
    // branch for every question this mask answers `false`, so the arithmetic is
    // the same arithmetic and the hash must be the same hash. Anything less
    // would mean the census below describes a universe the ablation tests never
    // run.
    expect(worldProbeArm.hash).toBe(worldControl.hash);
  }, RUN_TIMEOUT_MS);

  it('an unmatchable mask leaves a raiding run byte-identical', async () => {
    const { raidControl, raidProbeArm } = await arms();
    expect(raidProbeArm.hash).toBe(raidControl.hash);
    expect(raidProbeArm.raidLog).toBe(raidControl.raidLog);
  }, RUN_TIMEOUT_MS);
});

describe('the ablation seam is live', () => {
  it('the world loop asks the mask', async () => {
    const { worldProbe } = await arms();
    // **The positive control.** Zero here is not "resource-yield does not
    // matter"; it is "no ablation number in this repository means anything",
    // because every arm of every sweep ran the unablated universe. Measured at
    // 8,809 on `main` at 57bcbc44; asserted as "more than none" so a content
    // change cannot fail it for the wrong reason.
    expect(worldProbe.consultations()).toBeGreaterThan(0);
  }, RUN_TIMEOUT_MS);

  it('a raid asks the mask, through its own separate argument', async () => {
    const { raidProbe, raidControl } = await arms();
    // The raid seam is not the world-loop seam and cannot be inferred from it:
    // `reference-universe.ts` spreads the mask into `raidSystem` on a different
    // line, and before w18-combat that line did not exist.
    expect(raidControl.raids).toBeGreaterThan(0);
    for (const id of RAID_PRIMITIVES) {
      expect(raidProbe.asked.get(id) ?? 0).toBeGreaterThan(0);
    }
  }, RUN_TIMEOUT_MS);

  it('a named primitive is actually neutralized, not merely asked about', async () => {
    const { worldAblated, raidAblated } = await arms();
    // Consultation proves the mask arrived; neutralization proves the
    // substitution in `stackMagnitudes` was taken. A mask that is asked 8,809
    // times and answers `true` zero times names a primitive nothing stacks.
    expect(worldAblated.neutralizations()).toBeGreaterThan(0);
    expect(raidAblated.neutralizations()).toBeGreaterThan(0);
  }, RUN_TIMEOUT_MS);
});

describe('which primitives an ablation arm can move at all', () => {
  it('the world loop stacks exactly the five it is documented to', async () => {
    const { worldProbe } = await arms();
    expect([...worldProbe.asked.keys()].sort()).toEqual([...WORLD_LOOP_PRIMITIVES]);
  }, RUN_TIMEOUT_MS);

  it('a raid adds all seven combat primitives', async () => {
    const { raidProbe } = await arms();
    expect([...raidProbe.asked.keys()].sort()).toEqual(
      [...WORLD_LOOP_PRIMITIVES, ...RAID_PRIMITIVES].sort(),
    );
  }, RUN_TIMEOUT_MS);

  it('names the primitives no arm can move, so their nulls are not read as findings', async () => {
    const { worldProbe, raidProbe } = await arms();
    const reached = new Set([...worldProbe.asked.keys(), ...raidProbe.asked.keys()]);
    // A name leaving this list is a subsystem getting wired and the edit is to
    // delete it. A name *arriving* is a subsystem going dark, and the edit is
    // not to add it — it is to find out why §9 can no longer measure it.
    for (const id of UNREACHED_PRIMITIVES) {
      expect(reached.has(id)).toBe(false);
    }
  }, RUN_TIMEOUT_MS);
});
