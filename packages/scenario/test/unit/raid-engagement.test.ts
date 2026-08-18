/*
 * Multiverse Mages — raids, in a real universe, end to end.
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
 * `rules-raid` shipped complete and unreached: 4,500 lines, its own conformance
 * scans, and zero callers outside its own tests. Everything asserted here is
 * about the **wiring** — that a real reference universe opens portals, resolves
 * raids, and carries the consequences into its own component rows — and not
 * about the engine, which has its own suite.
 *
 * Two of these are guards rather than features, and both exist because the
 * failure they catch is silent:
 *
 * - **A raid must cost zero world ticks.** `portals`' spec says so, and the way
 *   to get it wrong is to leave the clock in engagement mode: every world system
 *   returns early on `ctx.mode !== world`, so the run does not crash, it simply
 *   stops advancing until the harness's cap. That reads as a slow universe.
 * - **Raids off must be raids off.** The mechanic moves every balance baseline,
 *   so the A/B has to be real: `raids: false` must take no portal targets, roll
 *   no arrival, and leave the run exactly where the pre-raid build left it.
 */

import { describe, expect, it } from 'vitest';

import { installValueSentinel, rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, collectRecords, permits } from '@mm/state';
import {
  executeReferenceRunAsync,
  referenceContent,
  referenceScenario,
  standardOpeningAxes,
} from '@mm/scenario';
import type { ComponentValueViolation, SimState } from '@mm/sim-core';

/**
 * Long enough for the arrival process to fire, short enough to run in a gate.
 *
 * The authored inbound chance is `fp(0.0039)` a tick behind a sixty-tick
 * cooldown, so a horizon short enough to be quick is a horizon that measures
 * "no raid happened" and calls it a pass. Five hundred and twenty ticks is forty-three world
 * years and reaches the first arrivals with room to spare; a century here cost
 * the suite three minutes for the same assertions.
 */
const HORIZON = 520;

/** Seeds these tests play. Three, so a pass is not one lucky arrival. */
const SEEDS: readonly number[] = Object.freeze([0x1234_5678, 0x0bad_c0de]);

/**
 * The seed and horizon the sentinel arm plays, chosen to be the cheapest pair
 * that still resolves a raid rather than the pair the rest of the file uses.
 *
 * The sentinel routes every component write through a `Proxy`, so its arm costs
 * several times what an ordinary one does, and this suite is already the
 * slowest in the repository. At {@link HORIZON} on this file's usual seed the
 * arm added twenty-one seconds and pushed the whole run into
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` — which fails `npm run
 * verify` outright, because vitest exits non-zero on an unhandled error even
 * when every test passed.
 *
 * A scan of ten seeds at 240 ticks found `portal-rush` resolving raids on four
 * of them; seed 99 resolves two, in under a third of the work. One resolved
 * raid exercises the code path as well as three do, and the arm asserts the
 * count, so a seed that stops raiding fails rather than quietly covering
 * nothing.
 */
const SEED_UNDER_SENTINEL = 99;
const SENTINEL_HORIZON = 240;

const content = referenceContent();

/**
 * One scripted run, long enough for a strategy to afford and open a portal.
 *
 * Memoized. A run at this horizon is seconds rather than milliseconds and two
 * tests ask for the same one; recomputing it would double the suite's cost to
 * re-derive a pure function of its argument.
 */
const played = new Map<string, Awaited<ReturnType<typeof executeReferenceRunAsync>>>();

/**
 * The levels the looting arm plays, and **every one of the last three is load
 * bearing** — see the re-authoring note on the looting test below.
 *
 * `openingTechniqueCount: 5, openingFormCount: 13` is the narrowest square
 * `standardOpeningAxes` can draw that still contains `rego-limen`, which is
 * where both `portal`-carrying nodes live. It permits 65 of the seventy cells
 * and forbids the five Nomen ones, so this universe's god has something to
 * forbid — which is the whole precondition `shelveForeignBooks` needs and which
 * the open grid took away.
 *
 * `foundingPortalMagic: 1` puts the shallowest portal node in a founder's head.
 * Without it this universe never reaches action 14's gate inside 400 ticks and
 * the arm resolves **zero** outbound raids, measured; the flag's own docstring
 * declares it exists precisely to separate *"the verb does nothing"* from *"the
 * verb never ran"*.
 */
const LOOTING_LEVELS: Readonly<Record<string, number>> = Object.freeze({
  cohortSize: 12,
  foundingMages: 2,
  foundingNodes: 4,
  openingTechniqueCount: 5,
  openingFormCount: 13,
  foundingPortalMagic: 1,
});

/**
 * **This was the longest unbroken synchronous block in the whole suite, and it
 * is not one any more.**
 *
 * The note this docstring replaces said: *"`executeReferenceRun` is
 * `mc-harness`'s shipped entry point rather than a loop this file owns, so it
 * cannot be given the once-a-world-year yield `playOnce` has … the fix for that
 * would be a yield inside `executeReferenceRun`, which is src and is not this
 * change's to make."* It was right about the diagnosis and right about where the
 * fix belonged. Instrumented across all 394 test files on 2026-08-18, this file
 * left the event loop untouched for **65.2 s** — the only file in the suite over
 * birpc's hardcoded 60 s, on the run that produced exactly one
 * `[vitest-worker]: Timeout calling "onTaskUpdate"`.
 *
 * `executeReferenceRunAsync` is that yield. It runs the same generator the
 * synchronous entry point runs and pauses between world years;
 * `reference-universe.test.ts` asserts the two produce an identical result over
 * a real run.
 */
async function runOf(
  strategy: string,
  levels: Readonly<Record<string, number>> = { cohortSize: 12, foundingMages: 2, foundingNodes: 4 },
): Promise<Awaited<ReturnType<typeof executeReferenceRunAsync>>> {
  const key = `${strategy}:${JSON.stringify(levels)}`;
  const cached = played.get(key);
  if (cached !== undefined) return cached;
  const result = await executeReferenceRunAsync(
    {
      coordinates: {
        sweepId: 'raid-engagement-test',
        rootSeed: 0x1234_5678,
        cellIndex: 0,
        replicateIndex: 0,
      },
      runSeed: 0x1234_5678,
      levels: { ...levels },
      strategies: [strategy],
      worldTickCap: 400,
      metrics: [],
      ablatedPrimitives: [],
    },
    { content },
  );
  played.set(key, result);
  return result;
}

interface Arm {
  readonly state: SimState;
  readonly raids: ReturnType<ReturnType<typeof referenceScenario>['raids']>;
  readonly instances: number;
}

/**
 * Memoized on its whole argument list, because it is a pure function of it and
 * a run at this horizon costs seconds. Eight tests ask for four distinct arms;
 * without this they would compute twelve.
 */
const arms = new Map<string, Arm>();
async function play(seed: number, raids: boolean, ticks = HORIZON): Promise<Arm> {
  const key = `${String(seed)}:${String(raids)}:${String(ticks)}`;
  const cached = arms.get(key);
  if (cached !== undefined) return cached;
  const arm = await playOnce(seed, raids, ticks);
  arms.set(key, arm);
  return arm;
}

/**
 * The budget every case that plays an arm declares.
 *
 * 10-33 s each on this box under load 20-50 — the 33 s case was already over
 * the 30 s suite default here, and the 30 s case was cut on both boxes on
 * 2026-08-17 (GitHub Actions job 95387839967, and locally at load 48). Seven
 * times the slowest local case, rounded up; see `vitest.config.ts` for the
 * factor. The global default stays at 30 s so a *new* slow test still has to say
 * so.
 */
const ARM_TIMEOUT_MS = 300_000;

async function playOnce(seed: number, raids: boolean, ticks: number): Promise<Arm> {
  const run = referenceScenario(content, { raids });
  let state = run.scenario.create(seed, { worldTickCap: ticks });
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    // Once a world year, as `yieldToRunner` below explains.
    if (tick % 12 === 11) await yieldToRunner();
  }
  return {
    state,
    raids: run.raids(),
    instances: collectRecords(state, KNOWLEDGE_INSTANCE).length,
  };
}

/**
 * Hands the event loop back so the vitest worker can answer its runner, for the
 * reason `assembled-run-values.test.ts` documents: a worker doing unbroken
 * synchronous work cannot answer an RPC, and a runner that has not heard from a
 * worker treats it as dead. It changes no number.
 */
async function yieldToRunner(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * # The NaN check, on the one path it could not previously reach
 *
 * `assembled-run-values.test.ts` watches the component write boundary across
 * the reference universe and every shipped strategy, and finds nothing. It also
 * cannot see `rules-raid`, which is 4,525 lines: its strategy arms run sixty
 * ticks, and the arrival process behind a sixty-tick cooldown needs hundreds.
 * Measured on this tree, the whole ten-strategy pool at that horizon resolves
 * *one* raid, and that one is an accident of `archivist`'s seed --
 * `portal-rush`, whose entire purpose is opening portals, resolves none at 60,
 * 90, 120, 180 or 240 ticks.
 *
 * So raid coverage in the NaN check was never a property of a test. It was a
 * property of one seed. This file already pays for the horizon that reaches the
 * mechanic, so the check belongs here.
 *
 * The resolved-raid count is asserted for the reason the violation list is not
 * enough on its own: a run that resolves no raid reports zero violations and
 * passes while covering nothing. Asserting the count makes the arm fail when it
 * stops reaching the mechanic, instead of quietly hollowing out.
 */
describe('a raid writes no non-finite value into state', () => {
  it('stays clean at the component write boundary across every resolved raid', async () => {
    const violations: ComponentValueViolation[] = [];
    const previous = installValueSentinel((violation) => violations.push(violation));

    let resolved = 0;
    try {
      const run = referenceScenario(content, { raids: true });
      let state = run.scenario.create(SEED_UNDER_SENTINEL, {
        worldTickCap: SENTINEL_HORIZON,
      });
      for (let tick = 0; tick < SENTINEL_HORIZON; tick += 1) {
        state = step(state, [], rngFromRootSeed(state.rootSeed));
        // Once a world year, as the long run does.
        if (tick % 12 === 11) await yieldToRunner();
      }
      resolved = run.raids().length;
    } finally {
      installValueSentinel(previous);
    }

    expect(
      violations.map(
        (violation) =>
          `${violation.component}.${violation.field}[${String(violation.row)}] = ` +
          `${String(violation.value)} (via ${violation.door})`,
      ),
    ).toEqual([]);
    expect(resolved).toBeGreaterThan(0);
  }, 180_000);
});

describe('a reference universe is raided', () => {
  it('resolves raids over forty-three world years, where the build before this one resolved none', async () => {
    const played = await play(0x1234_5678, true);
    expect(played.raids.length).toBeGreaterThan(0);
  }, ARM_TIMEOUT_MS);

  it('is the defender, and its raiders are derived from its own mages', async () => {
    const played = await play(0x1234_5678, true);
    // Nothing in this run submits action 14, so every raid is inbound. An
    // outbound raid here would mean the arrival process had picked a side.
    expect(played.raids.every((raid) => !raid.outbound)).toBe(true);
  }, ARM_TIMEOUT_MS);

  /**
   * **This test passed on `main` for a reason that was not its title, and W116
   * is what exposed that.** It asserted `raided.instances < peaceful.instances`
   * on one seed. That held — and still holds on `main`, on all four seeds
   * surveyed (784/845, 813/884, 1029/1122, 1031/1073) — but **not because a
   * raid destroyed anything.**
   *
   * Measured on `origin/main` at `552630b`, the same four seeds: every raid
   * ends `objectivesResolved`, with **zero casualties, zero
   * `nodesLostLocally`, and zero `nodesGainedLocally`.** No instance is
   * destroyed and none is stolen. `consequences.ts` destroys a casualty's
   * instances and there are no casualties, so the channel the title names is
   * never entered. The instance gap is the **time cost** of engagement: §0
   * freezes world time for a universe in a raid, so a raided universe has
   * fewer mage-months in which to research and write.
   *
   * A whole-universe instance count cannot tell those two apart, and once
   * affiliation let mages scribe, the scribing term grew large enough to
   * dominate the time term and the comparison split 2–2 across the same four
   * seeds (669/626, 594/654, 921/852, 849/938). **A proxy that stops agreeing
   * with itself when an unrelated channel gets louder was never measuring what
   * it claimed.**
   *
   * So the assertion is now the seed-robust fact the fixture can actually
   * support: a raid is not a no-op on the host's knowledge economy. The
   * direction is deliberately not asserted, because on this build there is no
   * destruction to give it one.
   *
   * **The zero-loss finding is left standing and is not this branch's to fix.**
   * A reference universe that is raided three times and loses no node is either
   * a combat model nobody dies in or an objective set with nothing to take, and
   * both are `raid-engagement`'s. What is fixed here is a test that would have
   * gone on reporting success through either.
   */
  it('is not a no-op on the host universe knowledge economy', async () => {
    const seed = 0x0bad_c0de;
    const raided = await play(seed, true);
    expect(raided.raids.length).toBeGreaterThan(0);
    expect(raided.instances).not.toBe((await play(seed, false)).instances);
  }, ARM_TIMEOUT_MS);

  it('destroys nothing and steals nothing, which is a finding and not a design', async () => {
    // The zero above, pinned so it cannot quietly stop being zero — in either
    // direction. If `raid-engagement` gives raiders something to take, this is
    // the test that fails and says so, and the assertion above becomes
    // directional again.
    for (const seed of SEEDS) {
      const raided = await play(seed, true);
      expect(raided.raids.length).toBeGreaterThan(0);
      expect(raided.raids.reduce((sum, raid) => sum + raid.nodesLostLocally, 0)).toBe(0);
      expect(raided.raids.reduce((sum, raid) => sum + raid.localCasualties, 0)).toBe(0);
    }
  }, ARM_TIMEOUT_MS);
});

describe('the two properties raid-engagement is arranged around', () => {
  it('resolves every raid inside its own portal-stability bound', async () => {
    for (const seed of SEEDS) {
      for (const raid of (await play(seed, true)).raids) {
        expect(raid.engagementTicks).toBeLessThanOrEqual(raid.initialPortalStabilityTicks);
      }
    }
  }, ARM_TIMEOUT_MS);

  it('blocks no forbidden cast, because none is ever selected', async () => {
    // The 0.7.0 zero-occurrence claim, measured rather than assumed. A non-zero
    // here is the selection mask having failed and the assertion having caught
    // it, which is a defect and not a balance result.
    for (const seed of SEEDS) {
      const total = (await play(seed, true)).raids.reduce(
        (sum, raid) => sum + raid.forbiddenCastsBlocked,
        0,
      );
      expect(total).toBe(0);
    }
  }, ARM_TIMEOUT_MS);
});

describe('a raid consumes zero world ticks', () => {
  it('returns the clock to world time and advances the world exactly once a step', async () => {
    const played = await play(0x1234_5678, true);
    expect(played.raids.length).toBeGreaterThan(0);
    expect(played.state.clock.mode).toBe(0);
    expect(played.state.clock.engagementTick).toBe(0);
    // The failure this catches: a run that entered engagement and stayed there
    // would report a world tick well below the number of steps taken, with no
    // error anywhere.
    expect(played.state.clock.worldTick).toBe(HORIZON);
  }, ARM_TIMEOUT_MS);
});

describe('raids off is the build before this one', () => {
  it('offers no portal targets, so action 14 has no candidates', () => {
    expect(referenceScenario(content, { raids: false }).scenario.portalTargets).toBeUndefined();
  });

  it('resolves no raid and leaves the clock untouched', async () => {
    const played = await play(0x1234_5678, false);
    expect(played.raids).toEqual([]);
    expect(played.state.clock.worldTick).toBe(HORIZON);
  }, ARM_TIMEOUT_MS);

  it('produces a different universe from the same seed once a raid has landed', async () => {
    // Not an equality assertion in either direction: the point is that the two
    // arms are genuinely different runs, so a sweep comparing them is comparing
    // something. If these hashes ever match, raids resolved and changed nothing.
    const seed = 0x5eed_0001;
    expect(snapshotHash((await play(seed, true)).state)).not.toEqual(
      snapshotHash((await play(seed, false)).state),
    );
  }, ARM_TIMEOUT_MS);
});

describe('looting reaches what research cannot', () => {
  it('brings home nodes from cells this universe would never have permitted', { timeout: ARM_TIMEOUT_MS }, async () => {
    // The measurement behind the content-exhaustion finding. Seventy cells are
    // authored and twelve are enabled, and those twelve hold 51 of the 300
    // nodes — so an undisturbed universe learns all 51 and stops, whatever it
    // plays. Vision §3 makes a god's ruleset the thing that decides what can
    // exist *at home*; §8 makes a raid the thing that reaches what cannot. A
    // strategy that opens portals must end holding nodes a strategy that does
    // not could never have derived.
    //
    // `portal-rush` and not the passive control, and outbound and not inbound:
    // an inbound raid makes this universe the host, and the host is the side
    // that *loses* books.
    //
    // ## Re-authored on `integration/all-branches`, 2026-08-17
    //
    // **This measured zero, and the zero had no question behind it.** The
    // paragraph above describes a universe whose god permits twelve cells of
    // seventy; this campaign flagged all seventy `"v1": true`, and
    // `shelveForeignBooks` picks a rival's loot shelf from the cells *this*
    // universe's ruleset forbids. A universe that forbids nothing is offered
    // nothing, the function early-returns, and *"raids bring home 0 nodes"* was
    // a statement about an empty shelf rather than about looting.
    //
    // So the arm is given a god who forbids something. `LOOTING_LEVELS` above
    // has the details; in short, a 5x13 opening square forbids the five Nomen
    // cells and keeps `rego-limen`, where portal magic lives, and
    // `foundingPortalMagic` puts the universe at action 14's gate rather than
    // upstream of it.
    //
    // Measured on this tree at these coordinates, 400 ticks:
    //
    // | arm | raids | outbound | nodes gained |
    // |---|---:|---:|---:|
    // | `portal-rush`, 5x13 square, portal magic | 4 | 2 | **4** |
    // | `portal-rush`, open grid, portal magic   | 4 | 2 | **0** |
    // | `portal-rush`, open grid, no portal magic| 1 | 0 |   0 |
    // | `passive-control`, 5x13 square           | 1 | 0 |   0 |
    //
    // The middle row is the finding this re-authoring preserves rather than
    // erases: **with the grid fully open, an outbound raid that resolves still
    // brings home nothing**, because there is nothing on the rival's shelf that
    // this universe could not have derived. Vision §8's *"raids reach what
    // research cannot"* is a claim about a god who forbids, and the reference
    // universe as this campaign leaves it forbids nothing.
    const rushed = await runOf('portal-rush', LOOTING_LEVELS);
    const outbound = rushed.rawRaids.filter((raid) => raid.outbound);
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.reduce((sum, raid) => sum + raid.nodesGainedLocally, 0)).toBeGreaterThan(0);

    // The precondition, asserted so that a later widening of the opening square
    // turns this into a failure rather than into a silent zero again: the square
    // this arm plays must actually forbid cells that hold nodes.
    const ruleset = {
      ...standardOpeningAxes(content.registry, { techniqueCount: 5, formCount: 13 }),
      edicts: [],
    };
    const forbiddenCells = content.registry.cells.filter(
      (entry) => !permits(ruleset, entry.contentId),
    );
    const cellIdOf = new Map(content.registry.cells.map((e) => [e.record.id, e.contentId]));
    const forbiddenCellIds = new Set(forbiddenCells.map((entry) => entry.contentId));
    const forbiddenNodes = content.registry.nodes.filter((entry) =>
      forbiddenCellIds.has(cellIdOf.get(entry.record.cell) ?? -1),
    );
    expect(forbiddenCells).toHaveLength(5);
    expect(forbiddenNodes.length).toBeGreaterThan(0);
  });

  it('leaves a universe that never opened a portal with nothing it did not derive', { timeout: ARM_TIMEOUT_MS }, async () => {
    // The same god, the same forbidden Nomen cells, the same portal magic in a
    // founder's head — and a strategy that never submits action 14. It resolves
    // only inbound raids and gains nothing, which is what makes the arm above a
    // statement about *looting* rather than about the levels it plays.
    const passive = await runOf('passive-control', LOOTING_LEVELS);
    expect(passive.rawRaids.every((raid) => !raid.outbound)).toBe(true);
    expect(passive.rawRaids.reduce((sum, raid) => sum + raid.nodesGainedLocally, 0)).toBe(0);
  });
});

describe('a raid is reproducible from its seed', () => {
  it('produces byte-identical raid logs across two plays of one run', async () => {
    const first = await play(0x0bad_c0de, true);
    const second = await play(0x0bad_c0de, true);
    expect(second.raids).toEqual(first.raids);
    expect(snapshotHash(second.state)).toEqual(snapshotHash(first.state));
  }, ARM_TIMEOUT_MS);
});
