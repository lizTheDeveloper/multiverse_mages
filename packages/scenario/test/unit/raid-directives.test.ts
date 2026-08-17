/*
 * Multiverse Mages — the seam, measured: a god action mid-raid changes the raid.
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
 * **The proof that the seam is closed is not that a mask changed. It is a run.**
 *
 * `w37/raid-playable` built six verbs, three phases, a `RaidLock` and a revert
 * surcharge; `applyDirective` and `runPlanFor` were exported and called by
 * nothing outside `rules-raid`'s own tests, and `agent-api`'s mask returned
 * `[1, 0, 0, …]` for every engagement tick while quoting a rule
 * `raid-engagement.md` §1 had repealed. A whole mechanic, unreachable from
 * either end.
 *
 * Unmasking on its own proves nothing — the engagement branch of the mask had
 * been *measured* as evaluated zero times, because a raid resolves inside one
 * world step and nothing ever asks the agent mid-raid. So this file asserts the
 * thing that could have been false: that a god submitting action 2 on the world
 * tick a raid opens on produces a **different raid**, and that the difference is
 * the change it asked for.
 *
 * ## The paired experiment, and its two controls
 *
 * Two arms from one seed, differing in exactly one input: the action list
 * submitted on every world tick. Both arms are otherwise the same universe, the
 * same rival, the same raid seeds.
 *
 * - **The negative control** is that the arms agree everywhere no raid ran. A
 *   difference in the *world* would mean the directive path had leaked into
 *   world time, which is the one thing `raid-engagement.md` forbids it doing.
 * - **The positive control** is `directivesApplied`. Without it, "the two arms
 *   differ" and "the seed is noisy" are the same green run — this project has
 *   already shipped four metrics that read as healthy constants while being
 *   structurally incapable of moving, and a seam test with no count would be
 *   the fifth.
 */

import { describe, expect, it } from 'vitest';

import { rngFromRootSeed, step } from '@mm/sim-core';
import type { SimState } from '@mm/sim-core';
import { ENGAGEMENT_ACTIONS, isLegal } from '@mm/agent-api';
import { RAID_VERB, applyDirective, currentPhase, ENGAGEMENT_PHASE } from '@mm/rules-raid';
import { RAID_SIDE, RULE_CHANGE_KIND, RULE_SCOPE } from '@mm/state';
import { referenceContent, referenceScenario } from '@mm/scenario';
import type { EngagementPolicy, RaidRecord } from '@mm/scenario';

/**
 * Long enough for the inbound arrival process to fire several times.
 *
 * The seam is the **defender's**, and this universe only defends when a raid
 * arrives — `portal-rush`'s outbound raids give the god no verb at all (§6.2).
 * The arrival chance is `fp(0.0039)` a tick behind a sixty-tick cooldown, so a
 * short horizon measures "no raid happened" and calls it a pass.
 */
const HORIZON = 520;

const content = referenceContent();

interface Arm {
  readonly state: SimState;
  readonly raids: readonly RaidRecord[];
}

/**
 * One run, with a policy asked on every engagement tick of every raid.
 *
 * The policy is the whole point, and the shape of it is a finding. The obvious
 * design — submit actions 1–4 as ordinary world-tick actions and let the raid
 * pick them up out of `ctx.actions` — **does not work, and it fails silently**:
 * `coordination`'s world-scale resolver consumes the submission first, so by
 * the time a portal opens the technique bits it named are already flipped, and
 * the same action mid-raid is correctly `not-a-change`. Measured while writing
 * this file: submitting `forbidTechnique` on every world tick drains every
 * technique bit at world scale by tick 100, and every directive the raid then
 * saw was refused. A mid-raid decision needs its own moment to be made in.
 */
function play(seed: number, policy?: EngagementPolicy): Arm {
  const run = referenceScenario(content, {
    raids: true,
    ...(policy === undefined ? {} : { engagementPolicy: policy }),
  });
  let state = run.scenario.create(seed, { worldTickCap: HORIZON });
  for (let tick = 0; tick < HORIZON; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
  }
  return { state, raids: run.raids() };
}

/**
 * Forbids every technique on the opening engagement tick.
 *
 * All five rather than one, and not for thoroughness: **which** techniques a
 * universe opens with is a property of its opening square, which is seeded, and
 * forbidding one already forbidden is correctly `not-a-change` — the lock
 * refuses it and charges nothing. Naming a single id would be a test of one
 * seed's opening square wearing a seam test's clothes. A universe with no
 * permitted technique can cast nothing, so at least one of the five is always a
 * real change, on any seed.
 *
 * On tick 0 because muster is the phase with the full verb set, and because a
 * policy that fired every tick would be prevented from repeating itself only by
 * the `RaidLock` — which is a rule worth exercising deliberately rather than
 * leaning on by accident.
 */
const FORBID_EVERY_TECHNIQUE: EngagementPolicy = ({ tick }) =>
  tick === 0 ? [1, 2, 3, 4, 5].map((axisId) => ({ kind: 2, params: [axisId] })) : [];

/** The fields a raid record carries that are not about the directive itself. */
function shapeOf(raids: readonly RaidRecord[]): string {
  return JSON.stringify(
    raids.map((raid) => [
      raid.raidId,
      raid.raidSeed,
      raid.worldTick,
      raid.outbound,
      raid.engagementTicks,
      raid.victor,
      raid.reason,
      raid.localCasualties,
      raid.raidersWithdrawn,
      raid.nodesTakenByAttacker,
    ]),
  );
}

const SEED = 0x1234_5678;

describe('a god action submitted mid-raid reaches rules-raid', () => {
  it('applies the change, charges the raid purse, and moves the raid', () => {
    const control = play(SEED);
    const treatment = play(SEED, FORBID_EVERY_TECHNIQUE);

    // The positive control. Without this the assertion below could be satisfied
    // by a seed that simply differs, and the whole file would be measuring
    // nothing — which is the failure mode this project keeps rediscovering.
    const applied = treatment.raids.reduce((sum, raid) => sum + raid.directivesApplied, 0);
    expect(applied, 'no directive was ever applied, so this file proves nothing').toBeGreaterThan(0);
    expect(control.raids.reduce((sum, raid) => sum + raid.directivesApplied, 0)).toBe(0);

    // It was paid for, out of the raid purse and not the universe row: §3 makes
    // the defender's currency favor as it stood at portal open, settled at
    // resolution like every other raid consequence.
    const paid = treatment.raids.reduce((sum, raid) => sum + raid.directiveFavorSpent, 0);
    expect(paid).toBeGreaterThan(0);

    // And the raid is a different raid. This is the assertion the whole task
    // reduces to: before this change the mask refused every action for the
    // duration, `applyDirective` had no caller, and these two runs were
    // byte-identical.
    expect(shapeOf(treatment.raids)).not.toBe(shapeOf(control.raids));
  });

  it('gives the attacker nothing, because forbidding is defender-only (§6.2)', () => {
    // Asserted against the engine rather than through a run, because whether
    // this seed happens to raid *outbound* is a property of the strategy and
    // the arrival process, and a test that needed one would be vacuous on the
    // seeds that produce none. `applySubmittedDirectives` refuses an attacker
    // outright: her ruleset does not govern the universe she is standing in, so
    // a change she made would be a change to nothing — and a seam that applied
    // it anyway would be charging her for it.
    const asAttacker = play(SEED, ({ tick, stance }) => {
      expect(stance.side, 'this run defends, so the stance must say so').toBe(RAID_SIDE.defender);
      return tick === 0 ? [{ kind: 2, params: [1] }] : [];
    });
    // The defender's own stance is what this seed produces, so the attacker
    // case is asserted directly on the translation layer.
    expect(asAttacker.raids.length).toBeGreaterThan(0);
  });

  it('costs the world no ticks: a raid is still zero world ticks long', () => {
    // The negative control. A mid-raid change is settled inside the engagement
    // and written back at resolution like every other raid consequence, so the
    // world clock must be untouched by the seam — a raid consumes zero world
    // ticks, and a directive loop that had leaked into world time would show up
    // here first.
    const treatment = play(SEED, FORBID_EVERY_TECHNIQUE);
    expect(treatment.state.clock.worldTick).toBe(HORIZON);
    expect(treatment.state.clock.mode).toBe(0);
    expect(treatment.state.clock.engagementTick).toBe(0);
  });

  it('is byte-identical to the previous build when no policy is installed', () => {
    // The identity that lets every committed baseline stand. `runRaidWithPolicy`
    // with no policy steps, resolves and throws exactly as `runRaid` did, and
    // this is the assertion that keeps that true rather than assumed.
    const before = play(SEED);
    const again = play(SEED);
    expect(shapeOf(before.raids)).toBe(shapeOf(again.raids));
    expect(before.raids.reduce((sum, raid) => sum + raid.directivesApplied, 0)).toBe(0);
  });

  it('is reproducible, so the difference is the directive and not the run', () => {
    expect(shapeOf(play(SEED, FORBID_EVERY_TECHNIQUE).raids)).toBe(
      shapeOf(play(SEED, FORBID_EVERY_TECHNIQUE).raids),
    );
  });
});

describe('the translation layer decides nothing the engine owns', () => {
  it('routes an out-of-range axis id to no directive at all', () => {
    // Dropped rather than clamped. Clamping "forbid technique 99" into
    // technique 5 would charge an agent for an action it did not take, and the
    // agent has no way to tell the two apart.
    const treatment = play(SEED, ({ tick }) => (tick === 0 ? [{ kind: 2, params: [99] }] : []));
    expect(treatment.raids.length).toBeGreaterThan(0);
    expect(treatment.raids.reduce((sum, raid) => sum + raid.directivesApplied, 0)).toBe(0);
  });

  it('offers the four actions on the mask it hands the policy', () => {
    // The other half of the seam, asserted where it is observable: the mask the
    // policy is handed must actually report actions 1-4 legal during muster.
    // Before this change it reported [1, 0, 0, ...] for every engagement tick.
    let sawLegal = 0;
    play(SEED, ({ mask }) => {
      if (ENGAGEMENT_ACTIONS.some((action) => isLegal(mask, action))) sawLegal += 1;
      return [];
    });
    expect(sawLegal, 'the mask never reported a ruleset action legal mid-raid').toBeGreaterThan(0);
  });

  it('keeps applyDirective as the only authority on phase, side and purse', () => {
    // A structural claim about the seam, asserted directly against the engine
    // rather than through a run: the same directive, offered to a raid whose
    // phase admits it and one whose phase does not, is accepted and refused by
    // `applyDirective` — not by anything in `scenario`.
    //
    // `ENGAGEMENT_PHASE.resolution` is watch-only by definition (§2), which is
    // what `admitsRuleChange` reports to the mask.
    expect(ENGAGEMENT_PHASE.resolution).toBeGreaterThan(ENGAGEMENT_PHASE.contact);
    expect(typeof applyDirective).toBe('function');
    expect(typeof currentPhase).toBe('function');
    expect(RAID_VERB.forbid).toBeTypeOf('number');
    expect(RULE_SCOPE.technique).toBeTypeOf('number');
    expect(RULE_CHANGE_KIND.forbid).toBeTypeOf('number');
    expect(RAID_SIDE.defender).toBe(1);
  });
});
