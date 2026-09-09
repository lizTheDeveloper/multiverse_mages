/*
 * Multiverse Mages — the seam: a god action submitted mid-raid becomes a raid verb.
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
 * `rules-raid` built six verbs, three phases, a lock and a revert surcharge, and
 * **nothing could reach any of them**: `applyDirective` and `runPlanFor` were
 * exported and called by nothing outside the package's own tests. `agent-api`'s
 * mask independently returned `[1, 0, 0, …]` for the whole engagement, quoting a
 * rule `raid-engagement.md` §1 had repealed. Two halves of one hole.
 *
 * The mask half is closed in `agent-api`. This is the other half: the thing that
 * takes a §4.2 action the god submitted and turns it into a {@link Directive}.
 *
 * ## Why this lives in `scenario` and not in either package it joins
 *
 * `contracts.md` §5 runs the dependency one way: `rules-raid` may not import
 * `agent-api`, so the engine cannot read an action space, and `agent-api` may
 * not import `rules-raid`, so the mask cannot read a `Raid`. Neither can host
 * the join. `scenario` is the composition root and already depends on both —
 * it is a **leaf**, which is exactly what makes its wide edge list safe — so the
 * translation belongs here, beside the system that opens the portal.
 *
 * ## The mapping, and the one thing it does not do
 *
 * Four actions map, all of them the defender's, all of them axis toggles:
 *
 * | §4.2 action | verb | change |
 * |---|---|---|
 * | 1 `permitTechnique` | `permit` | technique bit |
 * | 2 `forbidTechnique` | `forbid` | technique bit |
 * | 3 `permitForm` | `permit` | form bit |
 * | 4 `forbidForm` | `forbid` | form bit |
 *
 * It does **not** price anything, decide legality, or write a ruleset. Every one
 * of those is `applyDirective`'s, which checks side, then phase, then purse,
 * then the lock — and the lock is what makes a mid-raid change stick for the
 * raid and leave the `mid-raid-change` mark that prices reverting it later. A
 * translation layer that re-derived any of that would be the second copy of a
 * rule this project keeps finding in its own history.
 *
 * The parameter convention is §4.2's: `params[0]` is a **1-based axis id**, the
 * same integer `axisPlan` reads at world scale, converted to a 0-based bit here
 * because `RuleChange.targetId` is a bit index. Getting that off by one would
 * forbid the wrong technique silently, so it is converted in exactly one place.
 */

import type { Action } from '@mm/sim-core';
import type { Raid, RaidVerbValue, VerbResult } from '@mm/rules-raid';
import {
  EngagementCeilingReached,
  RAID_END_REASON,
  RAID_VERB,
  allObjectivesResolved,
  applyDirective,
  currentPhase,
  phaseAdmitsAction,
  resolveRaid,
  stepEngagement,
  terminationOf,
  verbLegalIn,
} from '@mm/rules-raid';
import type { ContentCatalogue, EngagementStance } from '@mm/agent-api';
import {
  EMPTY_CATALOGUE,
  ENGAGEMENT_ACTIONS,
  buildCandidates,
  isLegal,
  legalityMask,
} from '@mm/agent-api';
import {
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  RAID_SIDE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
} from '@mm/state';

/** `contracts.md` §4.2's four axis-toggle ids. Named, not repeated as literals. */
const GOD_ACTION = {
  permitTechnique: 1,
  forbidTechnique: 2,
  permitForm: 3,
  forbidForm: 4,
} as const;

/** One §4.2 submission, translated. */
export interface TranslatedDirective {
  /** The action id it came from, so a report can name what the god asked for. */
  readonly action: number;
  /** What the engine did with it. */
  readonly result: VerbResult;
}

/**
 * The scope and verb an action id names, or `undefined` if it names neither.
 *
 * A table rather than a switch with a default, so that adding an action to §4.2
 * does not silently acquire a mid-raid meaning — the same default-masked
 * property `ENGAGEMENT_ACTIONS` gives the mask, on the other side of the seam.
 */
function verbFor(
  action: number,
): { scope: number; verb: RaidVerbValue; axisCount: number } | undefined {
  switch (action) {
    case GOD_ACTION.permitTechnique:
      return { scope: RULE_SCOPE.technique, verb: RAID_VERB.permit, axisCount: GRID_TECHNIQUE_COUNT };
    case GOD_ACTION.forbidTechnique:
      return { scope: RULE_SCOPE.technique, verb: RAID_VERB.forbid, axisCount: GRID_TECHNIQUE_COUNT };
    case GOD_ACTION.permitForm:
      return { scope: RULE_SCOPE.form, verb: RAID_VERB.permit, axisCount: GRID_FORM_COUNT };
    case GOD_ACTION.forbidForm:
      return { scope: RULE_SCOPE.form, verb: RAID_VERB.forbid, axisCount: GRID_FORM_COUNT };
    default:
      return undefined;
  }
}

/**
 * Whether this raid's phase still admits a ruleset change from this side.
 *
 * The answer `agent-api`'s `EngagementStance.admitsRuleChange` wants, computed
 * where the `Raid` is. Both ruleset verbs carry the same phase rule, so `permit`
 * stands for both — asserted by `verbLegalIn` rather than assumed, because a
 * future split would otherwise make the mask and the engine disagree silently.
 */
export function admitsRuleChange(raid: Raid): boolean {
  const phase = currentPhase(raid);
  return (
    phaseAdmitsAction(phase) &&
    verbLegalIn(RAID_VERB.permit, phase) &&
    verbLegalIn(RAID_VERB.forbid, phase)
  );
}

/**
 * Applies every §4.2 action this tick that a raid has a verb for.
 *
 * In submission order, and every one is offered to `applyDirective` even after
 * a refusal: a god who submits two changes and can afford one should get the
 * one, and stopping at the first refusal would make the outcome depend on
 * ordering in a way no agent could observe.
 *
 * @param defending whether the god running this scenario is the raid's
 * defender. Attackers get nothing — forbidding is defender-only (§6.2) — and
 * the check lives here rather than being left to `applyDirective`'s
 * `wrong-side` refusal so that the caller's own report distinguishes *"the god
 * had no verb"* from *"the god asked for one and the engine refused"*.
 */
export function applySubmittedDirectives(
  raid: Raid,
  actions: readonly Action[],
  defending: boolean,
): TranslatedDirective[] {
  if (!defending) return [];

  const applied: TranslatedDirective[] = [];
  for (const action of actions) {
    const mapping = verbFor(action.kind);
    if (mapping === undefined) continue;

    // §4.2's 1-based axis id → `RuleChange`'s 0-based bit. An out-of-range id
    // is dropped rather than clamped: clamping would turn "forbid technique 9"
    // into a real change to technique 5, which is an action the agent did not
    // take being charged to it.
    const axisId = action.params?.[0];
    if (axisId === undefined || !Number.isInteger(axisId)) continue;
    if (axisId < 1 || axisId > mapping.axisCount) continue;

    applied.push({
      action: action.kind,
      result: applyDirective(raid, {
        verb: mapping.verb,
        side: RAID_SIDE.defender,
        // The direction is carried on the verb and `resolveRuleVerb` derives
        // `kind` from it, so a directive cannot say `forbid` and hold a permit.
        // Filled in consistently anyway rather than left at a placeholder: a
        // field whose value is ignored today is a field somebody reads tomorrow.
        change: {
          scope: mapping.scope,
          targetId: axisId - 1,
          kind:
            mapping.verb === RAID_VERB.forbid ? RULE_CHANGE_KIND.forbid : RULE_CHANGE_KIND.permit,
        },
      }),
    });
  }
  return applied;
}

/**
 * What an agent is offered on one engagement tick, and what it submits back.
 *
 * A callback rather than a session, because a `Scenario` session is driven at
 * **world** scale by `mc-harness`'s episode loop and a raid consumes zero world
 * ticks — there is no world tick left for the loop to hand out mid-raid. So the
 * raid asks its caller directly, and a caller that has a policy can consult it.
 *
 * The mask handed over is `agent-api`'s own, computed against the same
 * {@link EngagementStance} the engine derives, so a policy that trusts it is
 * trusting the same authority the world-scale loop does.
 */
export type EngagementPolicy = (offer: {
  /** Engagement ticks stepped so far. */
  readonly tick: number;
  /** §4.2's legality mask, with actions 1–4 open exactly when they are legal. */
  readonly mask: Uint8Array;
  /** Which side this god is on, and whether the phase still admits a change. */
  readonly stance: EngagementStance;
}) => readonly Action[];

/** What one engagement produced, beyond its `RaidOutcome`. */
export interface DirectiveLog {
  /** Every directive offered to the engine, in the order it was offered. */
  readonly directives: readonly TranslatedDirective[];
  /** Engagement ticks on which the mask reported at least one action legal. */
  readonly ticksOffered: number;
}

/**
 * Drives a raid to termination, asking a policy on every engagement tick.
 *
 * **This is the caller the seam needed.** `runRaid` drives `stepEngagement` in a
 * `while` loop with no gap in it — which is why unmasking actions 1–4 moved
 * nothing on its own, and why the engagement branch of the mask had been
 * measured as evaluated *zero* times. This loop is the same loop with the gap
 * open.
 *
 * Behaviour with no policy is `runRaid`'s exactly: same steps, same order, same
 * resolution, same ceiling error. That is deliberate and it is what lets the
 * control arm of any experiment here be the build before it.
 *
 * ## Why the raid asks rather than the world tick
 *
 * A god's world-tick submission is one list, and the world-scale resolver has
 * already consumed it by the time a raid opens — measured: submitting
 * `forbidTechnique` on every world tick drains every technique bit at world
 * scale by tick 100, after which the *same* action mid-raid is correctly
 * `not-a-change`. A raid that re-applied `ctx.actions` would therefore either
 * double-apply a world-scale action or apply a dead one. Asking per engagement
 * tick is the only shape in which a mid-raid decision is a decision.
 *
 * @throws EngagementCeilingReached after resolving, exactly as `runRaid` does,
 * so a caller that catches it still holds a complete outcome.
 */
export function runRaidWithPolicy(
  raid: Raid,
  options: {
    /** Whether the god driving this scenario defends. Attackers get no verb. */
    readonly defending: boolean;
    readonly policy?: EngagementPolicy | undefined;
    /** For the mask's cost table. Absent means structural legality only. */
    readonly catalogue?: ContentCatalogue | undefined;
  },
): DirectiveLog {
  const directives: TranslatedDirective[] = [];
  let ticksOffered = 0;
  const { policy } = options;

  // `runRaid`'s own opening check, reproduced rather than skipped: a raid that
  // was over before its first step — no objectives, an empty side — must
  // resolve without stepping, and a loop that stepped first would give it one
  // tick it should not have had.
  let termination = terminationOf({
    raid: raid.engagement.raid,
    engagementTick: 0,
    maxTicks: raid.maxTicks,
    allObjectivesResolved: allObjectivesResolved(raid.objectives),
    livingAttackers: raid.rosters[RAID_SIDE.attacker].briefs.length,
    livingDefenders: raid.rosters[RAID_SIDE.defender].briefs.length,
  });

  while (termination === undefined) {
    if (policy !== undefined) {
      const stance: EngagementStance = {
        side: options.defending ? RAID_SIDE.defender : RAID_SIDE.attacker,
        admitsRuleChange: admitsRuleChange(raid),
      };
      // The host's world is the state the mask reads, because the ruleset the
      // defender is changing is the host's. For an inbound raid that is this
      // universe, which is the only case `defending` is true in.
      const mask = legalityMask({
        state: raid.host.world,
        candidates: buildCandidates({
          state: raid.host.world,
          catalogue: options.catalogue ?? EMPTY_CATALOGUE,
        }),
        ...(options.catalogue === undefined ? {} : { catalogue: options.catalogue }),
        engagement: stance,
      });
      if (ENGAGEMENT_ACTIONS.some((action) => isLegal(mask, action))) ticksOffered += 1;

      directives.push(
        ...applySubmittedDirectives(
          raid,
          policy({ tick: engagementTick(raid), mask, stance }),
          options.defending,
        ),
      );
    }
    termination = stepEngagement(raid);
  }

  // Resolution and the ceiling throw are `runRaid`'s, reproduced exactly: the
  // outcome is assigned before the error is raised, so a caller that catches it
  // still holds a complete record rather than half a battle.
  resolveRaid(raid, termination.reason);
  if (termination.reason === RAID_END_REASON.ceilingReached) {
    throw new EngagementCeilingReached(engagementTick(raid));
  }

  return { directives, ticksOffered };
}

/** The engagement tick, read off the host clock rather than recomputed. */
function engagementTick(raid: Raid): number {
  return raid.host.world.clock.engagementTick;
}
