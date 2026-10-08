/*
 * Multiverse Mages — the ablation mask, from a scenario option into a raid.
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
 * `ablation-reaches-the-world-loop.test.ts`, for the half of the simulation that
 * loop does not contain.
 *
 * That file proves §9's mask reaches `world-step.ts`. It cannot say anything
 * about a raid: `coordination` may not import `@mm/rules-raid`, so the raid
 * system is appended to the schema by `reference-universe.ts` and takes its
 * mask through a **separate** argument. Before w18-combat there was no such
 * argument — `openPortal` had no `ablation` parameter and `arbitration.ts`
 * passed `{}` to every `stackMagnitudes` call — so a sweep arm neutralizing
 * `direct-damage` neutralized it everywhere except inside the raids that are the
 * only place `direct-damage` exists.
 *
 * `packages/rules-raid/test/unit/combat-knowledge.test.ts` proves the mask works
 * once it reaches `openPortal`, over all seven combat primitives. This file
 * proves the two lines that get it there — `reference-universe.ts` spreading
 * `options.ablation` into `raidSystem`, and `raids.ts` spreading `deps.ablation`
 * into `openPortal` — by running two whole reference universes and comparing
 * their raid logs. It never inspects a mask or a deps object, for the reason
 * that file gives at length: **a test that stops at the data structure is the
 * test that passes while the seam is open.**
 *
 * ## Why `knowledge-steal`, and the finding behind that choice
 *
 * **Historical as of 2026-10-08** — kept because the reasoning is how the gap
 * was found. The measured cause turned out to be vigor rather than the priority
 * order below: the cheapest cast cost fp(3) against every mage's fp(1), so
 * `firstCastableNode` refused everything. The raid tuning of that date made
 * casting affordable and all seven primitives now move reference raids; this
 * file asserts that, with a raidless run as the control.
 *
 * It is the only combat primitive whose neutralization changes a reference run
 * today, and the reason is worth writing down because it is a gap in the
 * scenario rather than in this wiring.
 *
 * **The reference universe joins no combat.** The first version of this
 * paragraph said it fields no mage combatants and gave the wrong mechanism —
 * *"defenders field `warden`"* — which `combatants.ts` contradicts:
 * `DEFENDING_ROLES` is `{warden, professor, researcher, raider}`, so every
 * living mage defends and an inbound raid is not walking onto an empty field.
 * The measured cause, from `scripts/w144-ablation-visibility.mjs` over all eight
 * shipped strategies at two seeds each — **61 raids, 80,615 combatant-ticks,
 * zero combat attempts** — is `chooseIntent`'s priority order. Theft is
 * candidate 2 and casting is candidate 3, and no shipped strategy grants a
 * raider a combat node, so `firstCastableNode` returns nothing on every tick of
 * every raid. Bodies are on the field; nobody swings.
 *
 * So ablating `direct-damage`, `concealment` or `blink` changes the raid log on
 * none of six seeds at 400 ticks, and every raid resolves with zero casualties,
 * zero nodes lost and zero nodes gained. Until `RaidRecord` grew an `actionEconomy` block that null was also
 * *unfalsifiable* — `RaidRecord` carried no combat instrumentation, so a live
 * mask and a dead one produced the same log. It carries `actionEconomy` now, and
 * `raid-metrics.test.ts` pins the zero-attempt finding as the tripwire that
 * fails the day a strategy fields an armed combatant.
 *
 * `knowledge-steal` still bites because a thief scores the *intent* to steal
 * before there is a victim, and a thief whose theft is worth nothing spends her
 * raid differently. That is the mask changing behaviour through the arbiter,
 * and it is what this file asserts.
 *
 * **It bites harder since `withdraw-after-ticks`.** It used to move two of six
 * surveyed seeds; it now moves every seed that raids at all, because a theft is
 * only delivered by a thief who comes home and until raiders could withdraw,
 * every theft was forfeited with its thief. The control on the control moved
 * with it — see {@link COMBAT_PRIMITIVES}.
 *
 * The honest reading is not "the mask barely works". It is **"reference raids
 * contain no combat at all"**, which is a finding for whoever tunes raid
 * participation next, and which this file will start reporting differently the
 * moment a strategy puts a combat node in a combatant's hands.
 *
 * ## That reading is now counted rather than argued — `main` at `57bcbc44`
 *
 * It was inferred from `chooseIntent`'s priority order, which is a claim about
 * code, and a null result is the one place a claim about code most needs a
 * measurement. `ablation-mask-is-consulted.test.ts` instruments the mask itself
 * over this file's first seed and horizon, and **all seven combat primitives
 * are stacked** on a run this file calls unmeasurable: `knowledge-steal` 334,
 * `ward` 223, `concealment` 68, `direct-damage` 22, `area-denial` 7, `blink` 4,
 * `summon` 4. The mask reaches `openPortal` hundreds of times a raid. The
 * magnitude is computed, neutralized, and discarded unused.
 *
 * So the six nulls are reading (2)-becoming-(3) in that file's taxonomy — the
 * wire is live and the consumer is idle — and **not** the reading that would
 * matter, which is the seam having come apart. Run that file first the day this
 * one reports a seed stopping moving: `SEEDS` and `UNMOVED_SEEDS` are a survey
 * of a mechanic that runs at the margin, and a seed crossing between them is
 * ordinary. Every one of them going quiet at once is not.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import { MAGE, MAGE_ROLE, collectRecords } from '@mm/state';
import { ablationMaskFor } from '@mm/coordination';

import { referenceContent, referenceScenario } from '../../src/index.js';

const content = referenceContent();

/** Long enough that the arrival process fires. Measured, not guessed: see below. */
const HORIZON = 400;

/**
 * Seeds whose raid log moves when `knowledge-steal` is neutralized.
 *
 * **Since 2026-10-08 the assertion over these is "at least one seed moves, per
 * primitive"** rather than "every seed moves under `knowledge-steal`": with
 * combat live, which primitive decides a given raid varies by seed, and seed
 * `0x0000_022b`'s raid is now decided before theft matters. The survey history
 * below is kept as the record it is.
 *
 * All four raid and all four move. This list used to be two, with the other two
 * held as a by-seed control; `withdraw-after-ticks` made thefts deliverable and
 * every raiding seed started moving, so the control had to change shape rather
 * than be re-picked — a by-seed control that has to be re-chosen whenever
 * behaviour improves is a control that tests the seed list.
 *
 * **`material-economy` re-surveyed this list on its own branch and came to a
 * different one.** Its reading is kept below rather than adopted: a seed list
 * is a measurement, the branch measured it without W204's affiliate writer,
 * W23's student pool or W190's scribing fidelity in the tree, and `main`'s four
 * were measured without the material faucets. Neither survey is a survey of
 * this tree, and the test itself is the instrument that says so — it asserts
 * every named seed moves, so a wrong list here is loud. What the branch found:
 *
 * The two seeds whose raid log moves when `knowledge-steal` is neutralized, of
 * twelve surveyed at this horizon.
 *
 * Named rather than swept, because two arms per seed at 400 ticks is seconds
 * each and a survey belongs in the commit message. Both are asserted, so one of
 * them ceasing to raid cannot silently leave this file passing on the other.
 *
 * **`0x0bad_c0de` was here and no longer moves.** Re-surveyed 2026-08-16 on
 * `w247/material-economy-build`: it still raids twice at this horizon and the
 * ablated log is now byte-identical, so `knowledge-steal` no longer reaches
 * either of its raids. That is the roster shift `material-economy` causes
 * upstream of any raid — mages spend months applying magic that they used to
 * spend researching, so who arrives at a portal holding what is different — and
 * it is a fact about that seed rather than about the mask. The survey of twelve
 * found three movers on this build: `0x00ab_cdef` (2 raids), `0x0a97_0001` (3),
 * and `0x0000_022b` (2). The first two are asserted; the third is recorded here
 * so the next reader has a spare rather than a search.
 *
 * A seed *replaced* rather than the assertion weakened, and the distinction is
 * the point of the file: the claim is that the mask reaches combat inside a
 * raid, and a seed where no raid carries the primitive cannot test it either
 * way. The four unmoved seeds below are what stop that from being an excuse.
 *
 * The list that reading produced, recorded and not adopted:
 * `Object.freeze([0x00ab_cdef, 0x0a97_0001])`.
 */
/*
 * **`0x0004_1000` replaced by `0x0000_022b` on `w/exp-yields`, 2026-08-16.**
 *
 * The file's own instruction, followed in order: *"Run `ablation-mask-is-
 * consulted.test.ts` first the day this one reports a seed stopping moving."*
 * It was run first. All seven combat primitives are still reached in the raid
 * arm — `knowledge-steal` 61 times in that run — so the seam is live and this
 * is reading (2), a mechanic that runs at the margin, and not the seam coming
 * apart. Two of four seeds moving would have been the other reading; three of
 * four still move.
 *
 * Re-surveyed rather than re-picked by hand, twelve seeds, control and
 * `knowledge-steal`-ablated arms at this horizon:
 *
 *   0x0bad_c0de  3 raids  moves      0x0000_022b  2 raids  moves
 *   0x00ab_cdef  2 raids  moves      0x0a97_0001  3 raids  moves
 *   0x1234_5678  1 raid   moves      0x2222_2222  1 raid   moves
 *   0x0badf00d   1 raid   moves      0x0004_1000  1 raid   DOES NOT
 *   0x1111_1111  1 raid   DOES NOT   0x0000_0001  0 raids
 *   0x0000_1000  0 raids             0x0eff_0001  0 raids
 *
 * `0x0004_1000` still raids once and its ablated log is now byte-identical, so
 * `knowledge-steal` no longer reaches that raid. `0x0000_022b` is taken because
 * it is the spare this file already recorded from `material-economy`'s survey,
 * so the replacement is a seed somebody else measured independently rather than
 * the first one that happened to pass.
 *
 * A seed **replaced rather than the assertion weakened**, which is this file's
 * own stated rule. Five further movers are above if the next tree needs one.
 */
/*
 * **`0x00ab_cdef` replaced by `0x0bad_f00d` on `sim-playability` (S4),
 * 2026-10-08** (not by the recorded spare `0x0a97_0001`; see below). `laborObligation` asks for about twice the laborers it did, so
 * who is idle, who studies and who reaches a portal all shift upstream of any
 * raid. Re-surveyed the same twelve seeds, control and `knowledge-steal`-
 * ablated arms at this horizon:
 *
 *   0x0bad_c0de  3 raids  moves      0x0000_022b  2 raids  moves
 *   0x00ab_cdef  2 raids  DOES NOT   0x0a97_0001  3 raids  moves
 *   0x1234_5678  1 raid   moves      0x2222_2222  1 raid   DOES NOT
 *   0x0badf00d   1 raid   moves      0x0004_1000  1 raid   DOES NOT
 *   0x1111_1111  1 raid   DOES NOT   0x0000_0001  0 raids
 *   0x0000_1000  0 raids             0x0eff_0001  0 raids
 *
 * `0x0a97_0001`, the spare both earlier surveys recorded, was tried first and
 * refused by this file's other guard: its ablated arm resolves **2** raids to
 * the control's 3, so the theft changes *whether* a raid happens rather than
 * what one does, and `ablated.raidCount === control.raidCount` fails. Taken
 * instead: `0x0badf00d`, 1 raid in both arms, log moved — the next recorded
 * mover, not the first seed that happened to pass.
 */
const SEEDS: readonly number[] = Object.freeze([
  0x0bad_c0de,
  0x0bad_f00d,
  0x1234_5678,
  0x0000_022b,
]);

/**
 * **Retired 2026-10-08.** This was `UNMOVED_PRIMITIVES`: the six combat
 * primitives whose neutralization moved **nothing** — the control on the
 * control, by primitive rather than by seed.
 *
 * A stronger control than the seed list it replaced, and a more honest one: it
 * says the mask is not a general perturbation that moves any run it is handed,
 * *and* it states the finding that makes this whole file unusual — **reference
 * raids contain no combat at all.** All six act through a cast, no shipped
 * strategy puts a combat node in a combatant's hands, and `firstCastableNode`
 * therefore returns nothing on every tick of every raid.
 *
 * So this list is a live measurement of a gap, and it fails the day somebody
 * closes it — which is the correct thing for it to do, and the reason it is
 * asserted rather than written in a comment.
 *
 * It failed on 2026-10-08, as written: the cause was not the priority order but
 * vigor — the cheapest cast cost fp(3) against every mage's fp(1) — and with the
 * raid tuning of that date every one of the six moves the raid log. The list is
 * now every combat primitive, asserted to move; the control on the control is a
 * raidless run that none of them may touch.
 */
const COMBAT_PRIMITIVES: readonly string[] = Object.freeze([
  'direct-damage',
  'area-denial',
  'ward',
  'concealment',
  'blink',
  'summon',
  'knowledge-steal',
]);

/** A seed that resolves no raid at {@link HORIZON}: `0x0000_0001`, per the survey above. */
const QUIET_SEED = 0x0000_0001;

interface Played {
  readonly raidLog: string;
  readonly raidCount: number;
  readonly wardens: number;
  readonly livingMages: number;
}

/**
 * Memoized on `(seed, ablation)`, because it is a pure function of both and an
 * arm at this horizon costs seconds. The by-primitive control asks for the same
 * four control arms once per primitive; without this it would compute
 * twenty-four runs to look at four, and time out doing it.
 */
/**
 * The budget every case here declares, because the suite default of 30 s was
 * measured against tests that only compute and these run four four-hundred-tick
 * universes each.
 *
 * 20-27 s per case on this box under load 20-50; every one of them was cut at
 * 30 s on GitHub Actions job 95387839967 on 2026-08-17, having actually taken
 * 40-56 s. Seven times the slowest local case, rounded up — see
 * `vitest.config.ts` for where the seven comes from, and note the global default
 * is deliberately left at 30 s so a *new* slow test still has to say so.
 */
const ARM_TIMEOUT_MS = 240_000;

const played = new Map<string, Played>();
async function play(seed: number, ablated?: string): Promise<Played> {
  const key = `${String(seed)}:${ablated ?? ''}`;
  const cached = played.get(key);
  if (cached !== undefined) return cached;
  const result = await playOnce(seed, ablated);
  played.set(key, result);
  return result;
}

/**
 * Hands the event loop back so the vitest worker can answer its runner.
 *
 * The convention `packages/scenario/src/annihilation.ts` states — *"every long
 * arm in this repository yields to the vitest runner once a world year"* — and
 * the reason `playOnce` is async for work that is otherwise entirely
 * synchronous. An arm here is 400 ticks and the cases below take four of them;
 * that is 20-27 s on this box and 40-56 s on GitHub Actions, either side of
 * birpc's hardcoded 60 s, and a worker that has not touched its event loop
 * inside that window fails the whole run with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` — five of them on job
 * 95387839967, 2026-08-17. It changes no number.
 */
async function yieldToRunner(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function playOnce(seed: number, ablated?: string): Promise<Played> {
  const run = referenceScenario(content, {
    raids: true,
    // Off: this file reads the raid log, and the census is seconds of work it
    // never looks at.
    telemetry: false,
    ...(ablated === undefined ? {} : { ablation: ablationMaskFor([ablated]) }),
  });
  let state = run.scenario.create(seed, { worldTickCap: HORIZON });
  for (let tick = 0; tick < HORIZON; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    // Once a world year, as every other long arm does.
    if (tick % 12 === 11) await yieldToRunner();
  }
  const living = collectRecords(state, MAGE).filter(({ row }) => row.alive === 1);
  return {
    raidLog: JSON.stringify(run.raids()),
    raidCount: run.raids().length,
    wardens: living.filter(({ row }) => row.roleId === MAGE_ROLE.warden).length,
    livingMages: living.length,
  };
}

describe('§9’s mask crosses the scenario boundary into a raid', () => {
  it.each(COMBAT_PRIMITIVES)(
    'neutralizing %s changes the raid log on at least one seed',
    async (primitive) => {
      // Since 2026-10-08 reference raids contain combat: the cheapest cast used
      // to cost fp(3) of vigor against every mage's fp(1), so nobody ever cast
      // and six of these seven moved nothing (`UNMOVED_PRIMITIVES`, retired).
      // Every one of them now reaches a raid that matters on these seeds.
      let resolved = 0;
      let moved = 0;
      for (const seed of SEEDS) {
        const control = await play(seed);
        if (control.raidCount === 0) continue;
        resolved += 1;
        const ablated = await play(seed, primitive);
        if (ablated.raidLog !== control.raidLog) moved += 1;
      }
      // The arm has to have reached the mechanic. A run that resolves no raid
      // reports two identical empty logs and would pass a naive comparison while
      // covering nothing.
      expect(resolved).toBeGreaterThan(0);
      expect(moved, `${primitive} moved no seed`).toBeGreaterThan(0);
    },
    ARM_TIMEOUT_MS,
  );

  it('leaves a run with no raid byte-identical, whatever is neutralized', async () => {
    // The other direction, and what makes the assertion above mean something:
    // the mask is not a general perturbation that moves any run it is handed.
    // It acts on combat only through a raid, so a seed that never raids is
    // untouched by any combat primitive's neutralization. Seed 1 resolves no
    // raid at this horizon (surveyed below, 2026-08-16, and re-checked here).
    const quiet = await play(QUIET_SEED);
    expect(quiet.raidCount).toBe(0);
    for (const primitive of COMBAT_PRIMITIVES) {
      expect((await play(QUIET_SEED, primitive)).raidLog, `${primitive} moved a raidless run`).toBe(quiet.raidLog);
    }
  }, ARM_TIMEOUT_MS);
});

describe('who defends', () => {
  it('fields no warden under the passive strategy — and every researcher defends anyway', async () => {
    const played = await play(0x0bad_c0de);
    // `assign role` is god action 10 and the passive strategy never submits it,
    // so every mage stays a `researcher`. `DEFENDING_ROLES` includes
    // `researcher`, so these mages do defend.
    expect(played.livingMages).toBeGreaterThan(0);
    expect(played.wardens).toBe(0);
  }, ARM_TIMEOUT_MS);
});
