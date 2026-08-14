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
import { KNOWLEDGE_INSTANCE, collectRecords } from '@mm/state';
import { executeReferenceRun, referenceContent, referenceScenario } from '@mm/scenario';
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
const played = new Map<string, ReturnType<typeof executeReferenceRun>>();
function runOf(strategy: string): ReturnType<typeof executeReferenceRun> {
  const cached = played.get(strategy);
  if (cached !== undefined) return cached;
  const result = executeReferenceRun(
    {
      coordinates: {
        sweepId: 'raid-engagement-test',
        rootSeed: 0x1234_5678,
        cellIndex: 0,
        replicateIndex: 0,
      },
      runSeed: 0x1234_5678,
      levels: { cohortSize: 12, foundingMages: 2, foundingNodes: 4 },
      strategies: [strategy],
      worldTickCap: 400,
      metrics: [],
      ablatedPrimitives: [],
    },
    { content },
  );
  played.set(strategy, result);
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
function play(seed: number, raids: boolean, ticks = HORIZON): Arm {
  const key = `${String(seed)}:${String(raids)}:${String(ticks)}`;
  const cached = arms.get(key);
  if (cached !== undefined) return cached;
  const arm = playOnce(seed, raids, ticks);
  arms.set(key, arm);
  return arm;
}

function playOnce(seed: number, raids: boolean, ticks: number): Arm {
  const run = referenceScenario(content, { raids });
  let state = run.scenario.create(seed, { worldTickCap: ticks });
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
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
  it('resolves raids over forty-three world years, where the build before this one resolved none', () => {
    const played = play(0x1234_5678, true);
    expect(played.raids.length).toBeGreaterThan(0);
  });

  it('is the defender, and its raiders are derived from its own mages', () => {
    const played = play(0x1234_5678, true);
    // Nothing in this run submits action 14, so every raid is inbound. An
    // outbound raid here would mean the arrival process had picked a side.
    expect(played.raids.every((raid) => !raid.outbound)).toBe(true);
  });

  // ### FAILING ON PURPOSE — enabling all seventy cells, and what it exposed here
  //
  // Left red rather than adjusted, because both honest repairs are someone else's
  // call and a green test would hide the finding. Measured on this branch at
  // HORIZON=520, raids-on minus raids-off instances, six seeds:
  //
  //     0x12345678  -68     0x63       -171
  //     0x0badc0de  +67     0x7        -137
  //     0x5eed0001  +33     0x1e240    +304
  //
  // Raids reduce instances on 3 of 6 seeds and the deltas sum to +28. This is a
  // coin flip: the arms diverge in their RNG trajectory the moment a raid lands,
  // and with 300 nodes reachable instead of 51 that divergence is far larger than
  // anything a raid removes.
  //
  // And it removes nothing. Every raid in both arms reports
  // `nodesLostLocally: 0` and `localCasualties: 0`, and the raid log names
  // `unimplementedCombatChannels: ["removal","save","decoy","displacement"]`.
  // **That is true on `main` too** — checked by restoring `main`'s cell.json and
  // load.ts and re-running — so this assertion has never been measuring
  // destruction. It measured trajectory divergence, and passed while the world
  // was small enough for the sign to be stable.
  //
  // So the assertion is false as written and was always weakly founded. Restoring
  // it green would mean asserting the coin flip; deleting it would drop a §8
  // claim nobody has replaced. The repair is to assert `nodesLostLocally` once
  // `removal` is implemented, which is a raid-engagement task and not a content
  // one.
  it('destroys knowledge instances that would otherwise have survived', () => {
    const seed = 0x0bad_c0de;
    expect(play(seed, true).instances).toBeLessThan(play(seed, false).instances);
  });
});

describe('the two properties raid-engagement is arranged around', () => {
  it('resolves every raid inside its own portal-stability bound', () => {
    for (const seed of SEEDS) {
      for (const raid of play(seed, true).raids) {
        expect(raid.engagementTicks).toBeLessThanOrEqual(raid.initialPortalStabilityTicks);
      }
    }
  });

  it('blocks no forbidden cast, because none is ever selected', () => {
    // The 0.7.0 zero-occurrence claim, measured rather than assumed. A non-zero
    // here is the selection mask having failed and the assertion having caught
    // it, which is a defect and not a balance result.
    for (const seed of SEEDS) {
      const total = play(seed, true).raids.reduce(
        (sum, raid) => sum + raid.forbiddenCastsBlocked,
        0,
      );
      expect(total).toBe(0);
    }
  });
});

describe('a raid consumes zero world ticks', () => {
  it('returns the clock to world time and advances the world exactly once a step', () => {
    const played = play(0x1234_5678, true);
    expect(played.raids.length).toBeGreaterThan(0);
    expect(played.state.clock.mode).toBe(0);
    expect(played.state.clock.engagementTick).toBe(0);
    // The failure this catches: a run that entered engagement and stayed there
    // would report a world tick well below the number of steps taken, with no
    // error anywhere.
    expect(played.state.clock.worldTick).toBe(HORIZON);
  });
});

describe('raids off is the build before this one', () => {
  it('offers no portal targets, so action 14 has no candidates', () => {
    expect(referenceScenario(content, { raids: false }).scenario.portalTargets).toBeUndefined();
  });

  it('resolves no raid and leaves the clock untouched', () => {
    const played = play(0x1234_5678, false);
    expect(played.raids).toEqual([]);
    expect(played.state.clock.worldTick).toBe(HORIZON);
  });

  it('produces a different universe from the same seed once a raid has landed', () => {
    // Not an equality assertion in either direction: the point is that the two
    // arms are genuinely different runs, so a sweep comparing them is comparing
    // something. If these hashes ever match, raids resolved and changed nothing.
    const seed = 0x5eed_0001;
    expect(snapshotHash(play(seed, true).state)).not.toEqual(
      snapshotHash(play(seed, false).state),
    );
  });
});

describe('looting reaches what research cannot', () => {
  // ### FAILING ON PURPOSE — this property's premise is gone, and that is the finding
  //
  // Looting matters because a god's ruleset is narrower than the content: a book
  // from a universe that permitted other cells is knowledge no amount of domestic
  // research could reach. Enabling all seventy cells removed the premise in two
  // places at once, both of them silent.
  //
  // 1. `shelveForeignBooks` picks the rival's shelf from nodes in **non-v1
  //    cells**. There are none, so it hits `if (foreign.length === 0) return;`
  //    and the rival shelves nothing. No error, no symptom — the exact failure
  //    mode this repository keeps catching. Note that the mechanism is keyed on
  //    the *content* flag while `raid-constant.json`'s own gloss describes it as
  //    *"cells this universe's own ruleset forbids"*: the two gates coincided
  //    until now, and the code took the wrong one. Deriving it from `permits()`
  //    instead would not help today, because the reference universe's opening
  //    ruleset now permits all seventy.
  //
  // 2. `portal-rush` stops raiding outbound at all. Measured at 400 ticks, seed
  //    0x12345678: **31 raids, all outbound, 8 nodes looted** on `main`, against
  //    **1 raid, inbound, 0 looted** here. The strategy still submits action 14
  //    on every one of its 400 rounds; 242 of them are now rejected
  //    (`accounting.byActionId[14] = 242`). Whatever gates action 14 is
  //    responding to the wider ruleset, and that is un-diagnosed.
  //
  // Left red. Asserting zero outbound raids would turn a tripwire into a
  // description, and this is the strongest single argument that a narrow opening
  // square — `w72`'s work — has to land with the wider grid rather than after it.
  it('brings home nodes from cells this universe would never have permitted', { timeout: 60_000 }, () => {
    // The measurement behind the content-exhaustion finding. Seventy cells are
    // authored and twelve were enabled, and those twelve held 51 of the 300
    // nodes — so an undisturbed universe learned all 51 and stopped, whatever it
    // played. Vision §3 makes a god's ruleset the thing that decides what can
    // exist *at home*; §8 makes a raid the thing that reaches what cannot. A
    // strategy that opens portals must end holding nodes a strategy that does
    // not could never have derived.
    //
    // `portal-rush` and not the passive control, and outbound and not inbound:
    // an inbound raid makes this universe the host, and the host is the side
    // that *loses* books.
    const rushed = runOf('portal-rush');
    const outbound = rushed.rawRaids.filter((raid) => raid.outbound);
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.reduce((sum, raid) => sum + raid.nodesGainedLocally, 0)).toBeGreaterThan(0);
  });

  it('leaves a universe that never opened a portal with nothing it did not derive', { timeout: 60_000 }, () => {
    const passive = runOf('passive-control');
    expect(passive.rawRaids.every((raid) => !raid.outbound)).toBe(true);
    expect(passive.rawRaids.reduce((sum, raid) => sum + raid.nodesGainedLocally, 0)).toBe(0);
  });
});

describe('a raid is reproducible from its seed', () => {
  it('produces byte-identical raid logs across two plays of one run', () => {
    const first = play(0x0bad_c0de, true);
    const second = play(0x0bad_c0de, true);
    expect(second.raids).toEqual(first.raids);
    expect(snapshotHash(second.state)).toEqual(snapshotHash(first.state));
  });
});
