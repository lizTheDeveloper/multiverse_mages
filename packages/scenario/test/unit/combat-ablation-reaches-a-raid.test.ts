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
 * with it — see {@link UNMOVED_PRIMITIVES}.
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
const SEEDS: readonly number[] = Object.freeze([
  0x0bad_c0de,
  0x00ab_cdef,
  0x1234_5678,
  0x0000_022b,
]);

/**
 * The six combat primitives whose neutralization moves **nothing** — the
 * control on the control, by primitive rather than by seed.
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
 */
const UNMOVED_PRIMITIVES: readonly string[] = Object.freeze([
  'direct-damage',
  'area-denial',
  'ward',
  'concealment',
  'blink',
  'summon',
]);

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
  it.each(SEEDS)(
    'neutralizing knowledge-steal changes the raid log on seed %i',
    async (seed) => {
      const control = await play(seed);
      const ablated = await play(seed, 'knowledge-steal');

      // The arm has to have reached the mechanic. A run that resolves no raid
      // reports two identical empty logs and would pass a naive comparison while
      // covering nothing — the same hollowing-out `raid-engagement.test.ts`
      // guards its sentinel arm against.
      expect(control.raidCount).toBeGreaterThan(0);
      expect(ablated.raidCount).toBe(control.raidCount);

      expect(ablated.raidLog).not.toBe(control.raidLog);
    },
    ARM_TIMEOUT_MS,
  );

  it.each(UNMOVED_PRIMITIVES)(
    'leaves a run byte-identical when %s is neutralized',
    async (primitive) => {
      // The other direction, and it is what makes the assertion above mean
      // something: the mask is not a general perturbation that moves any run it
      // is handed. Six of the seven primitives move nothing on any seed, because
      // nothing in a reference raid ever casts.
      for (const seed of SEEDS) {
        const control = await play(seed);
        expect(control.raidCount, `seed ${String(seed)} resolved no raid`).toBeGreaterThan(0);
        expect(
          (await play(seed, primitive)).raidLog,
          `${primitive} moved seed ${String(seed)} — a reference raid now contains combat`,
        ).toBe(control.raidLog);
      }
    },
    ARM_TIMEOUT_MS,
  );
});

describe('why six of the seven combat primitives cannot be measured here', () => {
  it.each(['direct-damage', 'concealment', 'blink'])(
    'neutralizing %s changes nothing, because nobody ever swings',
    async (primitive) => {
      const seed = 0x0bad_c0de;
      // The raid log now carries `actionEconomy`, so this comparison is a real
      // one: before the record carried `actionEconomy` it could not have distinguished a live mask from a dead
      // one, because the fields a combat primitive moves were not in it.
      expect((await play(seed, primitive)).raidLog).toBe((await play(seed)).raidLog);
    },
    ARM_TIMEOUT_MS,
  );

  it('fields no warden — which is a symptom, and not the cause', async () => {
    const played = await play(0x0bad_c0de);
    // `assign role` is god action 10 and the passive strategy never submits it,
    // so every mage stays a `researcher`. That is worth asserting and it is
    // **not** why the six are invisible: `DEFENDING_ROLES` includes
    // `researcher`, so these mages do defend. The cause is that nobody on either
    // side holds a combat node and theft outranks casting in `chooseIntent`, so
    // no attempt is ever begun — pinned as a tripwire in `raid-metrics.test.ts`,
    // where the record can now show it.
    expect(played.livingMages).toBeGreaterThan(0);
    expect(played.wardens).toBe(0);
  }, ARM_TIMEOUT_MS);
});
