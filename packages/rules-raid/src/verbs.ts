/*
 * Multiverse Mages — what a player actually does while a raid runs.
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
 * `docs/design/raid-engagement.md` §3: the raid verb set, and the asymmetry
 * that is the point of it.
 *
 * `ui/raid/`'s framing question was *"every action is masked for the duration.
 * What is a player actually **doing** while a raid runs?"* and the honest answer
 * was **nothing**. This module is the answer.
 *
 * ## Two currencies, and the fiction is the reason
 *
 * > **The defender spends favor. The attacker spends something else.**
 *
 * Favor comes from your populace's worship. You are the god *of your universe*.
 * When you raid, your mages are on the far side of a portal, inside a place your
 * worshippers do not live and your ruleset does not govern — so your domestic
 * currency does not reach cleanly through the door.
 *
 * - **The defender spends favor**, which already exists, already regenerates
 *   from worship, and has never had anything worth buying that resolved inside
 *   seconds.
 * - **The attacker spends Vis** — a portable, lootable stock carried through the
 *   portal, seeded at portal open and never refilled. Running out of it is what
 *   ends an over-extended raid.
 * - **The attacker also pays exposure**, which is the more interesting half and
 *   lives in `exposure.ts`.
 *
 * ## Forbidding is defender-only, and that is a ruling rather than an omission
 *
 * §6.2, ruled: under §3's host arbitration the *host's* ruleset governs every
 * spell cast inside it, so an attacker forbidding her own cells would change
 * nothing inside the universe she is standing in. Making the verb defender-only
 * turns a dead verb into a deliberate asymmetry: the attacker holds initiative
 * and chose the engagement, the defender holds the constitution and can close a
 * door on both of them. Those are different kinds of power, which is what makes
 * the matchup a matchup.
 *
 * ## Nothing here writes a world
 *
 * Not one field of either universe moves while the raid runs. The purse is
 * raid-scoped, seeded at portal open, and settled through `RaidOutcome` — for
 * the reason `outcome.ts` gives about every other consequence: worlds are
 * persistent across runs, so a partial application on a crashed worker is a
 * corrupted universe rather than a lost battle. A verb that debited favor
 * directly would be the one write in the whole engine that could half-happen.
 *
 * ## Randomness
 *
 * **No verb here draws.** Every magnitude is authored content applied
 * deterministically, and the one verb that creates a combatant —
 * {@link RAID_VERB.levy} — places it through `deploymentPosition`, which
 * draws on stream 11 keyed on a **fresh spawn ordinal**. Ordinals are never
 * reused, so `contracts.md` §6's insertion invariance means a levy
 * re-rolls nothing for anybody, on either side, in any subsystem. The stream
 * registry is unchanged and `rngRegistryHash` with it.
 */

import type { ContentId } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import type { Handle, PopulaceCohortRecord, RaidSideValue, RuleChange } from '@mm/state';
import {
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  OCCUPATION,
  POPULACE_COHORT,
  RAID_SIDE,
  RULE_CHANGE_KIND,
  RULE_SCOPE,
  UNIVERSE,
  collectRecords,
  componentOf,
  findUniverse,
} from '@mm/state';

import { sideHasRoom, spawnCombatant } from './combatants.js';
import type { RuleChangeResult } from './lock.js';
import type { EngagementPhaseValue } from './phases.js';
import { ENGAGEMENT_PHASE } from './phases.js';
import type { Raid } from './raid.js';
import { changeRuleMidRaid, currentPhase, deploymentPosition, livingCombatants } from './raid.js';

/**
 * The verbs a raid has, which exist nowhere else.
 *
 * Distinct from `contracts.md` §4.2's world-time action space on purpose: these
 * resolve inside an engagement, are paid for in two different currencies, and
 * are gone the moment the portal closes. Numbered ascending and append-only, for
 * the reason §4.2's ids are — a client renders them and a policy would learn
 * them.
 */
export const RAID_VERB = {
  /** Defender. Close a technique, a form, or a cell. Locks (§1). */
  forbid: 1,
  /** Defender. Open one. Locks in exactly the same way. */
  permit: 2,
  /** Defender. Levy a detachment out of a cohort that does not fight. */
  levy: 3,
  /** Defender. Raise every living defender's ward. */
  ward: 4,
  /** Attacker. Mend every living raider — the constraint that actually binds. */
  mend: 5,
  /** Attacker. Raise every living raider's concealment. */
  conceal: 6,
} as const;

export type RaidVerbValue = (typeof RAID_VERB)[keyof typeof RAID_VERB];

/** Which side may issue a verb, and how deep into the engagement. */
interface VerbRule {
  readonly side: RaidSideValue;
  /**
   * The last phase this verb is legal in.
   *
   * `raid-engagement.md` §2: *"full verb set in muster, fewer sharper
   * interventions in contact, watch-only in resolution."* So the split is a
   * single comparison, and which verbs survive contact is the design decision:
   * the two that are about **committing forces before they meet** —
   * {@link RAID_VERB.levy} and {@link RAID_VERB.conceal} — end with muster,
   * because deciding who fights and how they approach is a thing you do before
   * contact or not at all. The ruleset verbs survive, because §2 says so
   * explicitly. The two that are about **helping the people already fighting**
   * survive with them.
   */
  readonly through: EngagementPhaseValue;
}

const VERB_RULES: Readonly<Record<RaidVerbValue, VerbRule>> = Object.freeze({
  [RAID_VERB.forbid]: { side: RAID_SIDE.defender, through: ENGAGEMENT_PHASE.contact },
  [RAID_VERB.permit]: { side: RAID_SIDE.defender, through: ENGAGEMENT_PHASE.contact },
  [RAID_VERB.levy]: { side: RAID_SIDE.defender, through: ENGAGEMENT_PHASE.muster },
  [RAID_VERB.ward]: { side: RAID_SIDE.defender, through: ENGAGEMENT_PHASE.contact },
  [RAID_VERB.mend]: { side: RAID_SIDE.attacker, through: ENGAGEMENT_PHASE.contact },
  [RAID_VERB.conceal]: { side: RAID_SIDE.attacker, through: ENGAGEMENT_PHASE.muster },
});

/** The side a verb belongs to. Forbidding is defender-only (§6.2). */
export function verbSide(verb: RaidVerbValue): RaidSideValue {
  return VERB_RULES[verb].side;
}

/** Whether a phase still admits a verb. */
export function verbLegalIn(verb: RaidVerbValue, phase: EngagementPhaseValue): boolean {
  return phase <= VERB_RULES[verb].through;
}

/** Every verb a side may issue in a phase, ascending. For a client and a mask. */
export function legalVerbs(
  side: RaidSideValue,
  phase: EngagementPhaseValue,
): readonly RaidVerbValue[] {
  return (Object.values(RAID_VERB) as RaidVerbValue[])
    .filter((verb) => verbSide(verb) === side && verbLegalIn(verb, phase))
    .sort((a, b) => a - b);
}

/** One instruction from a player. */
export interface Directive {
  readonly verb: RaidVerbValue;
  /** Which side issued it. Checked, never inferred. */
  readonly side: RaidSideValue;
  /** The ruleset change, for {@link RAID_VERB.forbid} and `permit`. */
  readonly change?: RuleChange;
}

/** Why a directive did nothing. `''` means it resolved. */
export type VerbRefusal =
  | ''
  /** The issuing side does not have this verb. Forbidding is defender-only. */
  | 'wrong-side'
  /** This phase no longer admits it. Resolution admits nothing. */
  | 'phase-closed'
  /** The purse is empty. */
  | 'unaffordable'
  /** A ruleset verb arrived without a change, or with a malformed one. */
  | 'malformed'
  /** The verb resolved to nothing to do: no cohort left, nobody alive. */
  | 'no-effect'
  /** The lock, or the ruleset, refused the change. See `lockRefusal`. */
  | 'refused';

/** What one directive did. */
export interface VerbResult {
  readonly applied: boolean;
  readonly refusal: VerbRefusal;
  /** What it cost, in the issuing side's currency. Zero on any refusal. */
  readonly paid: Fixed;
  /** Combatants it touched. */
  readonly affected: number;
  /** The lock's own answer, for a ruleset verb. */
  readonly rule?: RuleChangeResult;
}

function refuse(refusal: Exclude<VerbRefusal, ''>, rule?: RuleChangeResult): VerbResult {
  return rule === undefined
    ? { applied: false, refusal, paid: 0, affected: 0 }
    : { applied: false, refusal, paid: 0, affected: 0, rule };
}

/**
 * The two stocks a raid is played out of.
 *
 * Raid-scoped by construction: there is no way to spend from here into a world,
 * and no way for a world to top it up. Both are read once, at portal open.
 */
export interface RaidPurse {
  /** The host god's favor at portal open, less whatever has been spent. */
  defenderFavor: Fixed;
  /** Vis carried through the portal, less whatever has been spent. */
  attackerVis: Fixed;
  /** What the defender has spent. `defenderFavor` plus this is the opening. */
  defenderSpent: Fixed;
  /** What the attacker has spent. */
  attackerSpent: Fixed;
}

/**
 * The purse a raid opens with.
 *
 * The defender's favor is read from the host universe's own row, so a poor god
 * genuinely cannot buy her way out of a raid — which is the whole reason favor
 * is the defender's currency rather than a raid-local allowance. A world with no
 * universe row (every hand-built fixture) opens at zero, which is absence
 * treated as absence.
 *
 * The attacker's Vis is **authored content, not a world balance**, and that is
 * the deliberate limit of this change: the economy spec amendment records that
 * Vis production and storage land with the economy capability, so what a raiding
 * party carries is a constant until they do. Reading a stock that does not exist
 * yet would be a fourth resource invented here rather than one chosen.
 */
export function openPurse(hostWorld: SimState, visStock: Fixed): RaidPurse {
  const universe = findUniverse(hostWorld);
  const favor =
    universe === 0 ? 0 : componentOf(hostWorld, UNIVERSE).get(universe, 'favor');
  return { defenderFavor: favor, attackerVis: visStock, defenderSpent: 0, attackerSpent: 0 };
}

/** What one verb costs, from the authored raid table. */
export function verbCost(raid: Raid, verb: RaidVerbValue): Fixed {
  const tuning = raid.tuning;
  switch (verb) {
    case RAID_VERB.forbid:
      return tuning.verbForbidCost;
    case RAID_VERB.permit:
      return tuning.verbPermitCost;
    case RAID_VERB.levy:
      return tuning.verbLevyCost;
    case RAID_VERB.ward:
      return tuning.verbWardCost;
    case RAID_VERB.mend:
      return tuning.verbMendCost;
    default:
      return tuning.verbConcealCost;
  }
}

/** What a side has left to spend. */
export function purseOf(purse: RaidPurse, side: RaidSideValue): Fixed {
  return side === RAID_SIDE.attacker ? purse.attackerVis : purse.defenderFavor;
}

function debit(purse: RaidPurse, side: RaidSideValue, amount: Fixed): void {
  if (side === RAID_SIDE.attacker) {
    purse.attackerVis -= amount;
    purse.attackerSpent += amount;
  } else {
    purse.defenderFavor -= amount;
    purse.defenderSpent += amount;
  }
}

/**
 * Resolves one directive against a running raid.
 *
 * The order is deliberate and each step refuses before the next is asked:
 * **side**, then **phase**, then **price**, then the verb's own preconditions.
 * Charging before the effect is possible is how an unexplained drain appears
 * months later, and `raid.ts` records finding exactly that shape once already.
 *
 * Called between `stepEngagement` calls. A headless run supplies a plan; a
 * client will supply a click. Nothing about this function knows the difference,
 * which is what keeps a raid a reproducible function of its inputs.
 */
export function applyDirective(raid: Raid, directive: Directive): VerbResult {
  const { verb, side } = directive;
  const rule = VERB_RULES[verb] as VerbRule | undefined;
  if (rule === undefined) return refuse('malformed');
  if (rule.side !== side) return refuse('wrong-side');
  if (!verbLegalIn(verb, currentPhase(raid))) return refuse('phase-closed');

  const price = verbCost(raid, verb);
  if (price > purseOf(raid.purse, side)) return refuse('unaffordable');

  switch (verb) {
    case RAID_VERB.forbid:
    case RAID_VERB.permit:
      return resolveRuleVerb(raid, directive, price);
    case RAID_VERB.levy:
      return resolveLevy(raid, price);
    case RAID_VERB.ward:
      return resolveWard(raid, price);
    case RAID_VERB.mend:
      return resolveMend(raid, price);
    default:
      return resolveConceal(raid, price);
  }
}

/**
 * Forbid and permit, which are the same verb pointed two ways.
 *
 * The direction is taken from the verb rather than from the change, so a
 * directive cannot say `forbid` and carry a permit. The price is charged only
 * when the lock accepts: a change refused as locked, out of range, or as no
 * change at all has cost the player a decision but not a resource, which is the
 * same rule `axisPlan` follows at world scale.
 */
function resolveRuleVerb(raid: Raid, directive: Directive, price: Fixed): VerbResult {
  const requested = directive.change;
  if (requested === undefined) return refuse('malformed');
  if (requested.scope !== RULE_SCOPE.technique && requested.scope !== RULE_SCOPE.form && requested.scope !== RULE_SCOPE.cell) {
    return refuse('malformed');
  }

  const change: RuleChange = {
    scope: requested.scope,
    targetId: requested.targetId,
    kind: directive.verb === RAID_VERB.forbid ? RULE_CHANGE_KIND.forbid : RULE_CHANGE_KIND.permit,
  };

  const result = changeRuleMidRaid(raid, change, price);
  if (!result.applied) return refuse('refused', result);

  debit(raid.purse, RAID_SIDE.defender, price);
  return {
    applied: true,
    refusal: '',
    paid: price,
    affected: result.combatantsAffected[0] + result.combatantsAffected[1],
    rule: result,
  };
}

/**
 * A detachment levied out of a cohort that does not fight.
 *
 * **Not "one more soldier detachment", and the difference was found by trying.**
 * `portal.ts`'s opening deployment already commits *every* detachment a soldier
 * cohort can field — `while (remaining >= detachmentStrength)` — so a verb that
 * asked a soldier cohort for one more could never fire. It refused on every
 * seed, in every fixture, silently and correctly. Recorded here rather than
 * worked around, because a verb that is legal and always refuses is the exact
 * shape of a mechanic that looks implemented and does nothing.
 *
 * So this levies a cohort that was *not* eligible: laborers, scholars, whoever
 * the universe was using for something else. That makes it a real decision with
 * a real price — the population you turn into bodies is population that was
 * doing something — rather than a button that spends favor to un-forget a
 * soldier you already sent.
 *
 * Deliberately a **detachment and not a mage**: §1.3 keeps a cohort from being
 * promoted to individuals, and the mage roster was already selected by a rule at
 * portal open — deepest knowledge first — so adding a mage would mean overriding
 * that rule or fielding the one it rejected.
 *
 * The cohort is charged nothing here. It loses exactly the detachment's strength
 * if the detachment dies, through the ordinary casualty path, which is the same
 * accounting the opening deployment uses.
 */
function resolveLevy(raid: Raid, price: Fixed): VerbResult {
  const roster = raid.rosters[RAID_SIDE.defender];
  if (!sideHasRoom(roster, raid.tuning)) return refuse('no-effect');

  const alreadyCommitted = new Map<number, number>();
  for (const brief of roster.briefs) {
    if (brief.sourceKind !== COMBATANT_SOURCE_KIND.soldierDetachment) continue;
    alreadyCommitted.set(brief.sourceId, (alreadyCommitted.get(brief.sourceId) ?? 0) + 1);
  }

  // Ascending handle, and the first cohort with the people to spare. A rule
  // rather than an iteration order, for the reason `eligibleMages` sorts: which
  // cohort is levied must not depend on the create/destroy history of the world.
  for (const cohort of leviableCohorts(raid.host.world)) {
    const committed = (alreadyCommitted.get(cohort.handle) ?? 0) * raid.tuning.detachmentStrength;
    if (cohort.record.count - committed < raid.tuning.detachmentStrength) continue;

    spawnCombatant(raid.engagement.entities, roster, {
      side: RAID_SIDE.defender,
      sourceKind: COMBATANT_SOURCE_KIND.soldierDetachment,
      sourceId: cohort.handle,
      // A fresh spawn ordinal, so the deployment draw is on a key no combatant
      // has ever held. Insertion invariance does the rest: nobody re-rolls.
      position: deploymentPosition(raid, RAID_SIDE.defender, roster.nextSpawnOrdinal),
      hp: raid.tuning.detachmentMaxHp,
      vigor: 0,
      concealment: 0,
      intrinsicDamage: raid.tuning.detachmentDamage,
      intrinsicRange: raid.tuning.detachmentRange,
      detachmentStrength: raid.tuning.detachmentStrength,
    });
    debit(raid.purse, RAID_SIDE.defender, price);
    return { applied: true, refusal: '', paid: price, affected: 1 };
  }

  return refuse('no-effect');
}

/**
 * Every cohort a levy may draw from, ascending by handle.
 *
 * The complement of `eligibleCohorts`: cohorts whose occupation is *not*
 * soldier, because the soldiers are already on the field. A universe with
 * nothing but soldiers has nobody left to levy, which is the honest answer and
 * is what {@link VerbRefusal} `'no-effect'` says.
 */
function leviableCohorts(world: SimState): { handle: Handle; record: PopulaceCohortRecord }[] {
  const found: { handle: Handle; record: PopulaceCohortRecord }[] = [];
  for (const entry of collectRecords(world, POPULACE_COHORT)) {
    if (entry.row.occupation === OCCUPATION.soldier) continue;
    if (entry.row.count <= 0) continue;
    found.push({ handle: entry.handle, record: entry.row as PopulaceCohortRecord });
  }
  found.sort((a, b) => a.handle - b.handle);
  return found;
}

/**
 * A ward over every living defender.
 *
 * Appended as one more `ward` source rather than written as a total, so it
 * stacks through `@mm/primitives` with whatever the combatant already carries
 * and is capped by §3's ward cap like every other source. A verb that wrote a
 * final ward value would be the one place in the game where the cap did not
 * apply, and it would read as a balance result.
 */
function resolveWard(raid: Raid, price: Fixed): VerbResult {
  const magnitude = raid.tuning.verbWardMagnitude;
  let affected = 0;
  for (const brief of livingCombatants(raid)) {
    if (brief.side !== RAID_SIDE.defender) continue;
    brief.wardSources = [...brief.wardSources, magnitude];
    affected += 1;
  }
  if (affected === 0) return refuse('no-effect');
  debit(raid.purse, RAID_SIDE.defender, price);
  return { applied: true, refusal: '', paid: price, affected };
}

/**
 * Hit points back into every living raider, capped at what she arrived with.
 *
 * **This was a vigor verb first, and vigor turned out not to be a constraint.**
 * Measured over eight seeds on the shipped tuning: a raider arrives at
 * `maxVigor`, a raid resolves in 54–96 engagement ticks, and she never spends
 * enough to make a refill do anything — the verb reported `no-effect` on every
 * run of every arm. Recorded rather than quietly replaced, because "a verb that
 * is legal and always refuses" is precisely the shape of a mechanic that looks
 * implemented and does nothing, and this campaign has found several.
 *
 * Hit points are what actually binds: raiders die, and §5's first claim is
 * measured in survival. So Vis buys the raiding party's lives, capped at
 * `maxHp` because a combatant above the health she arrived with is a mage the
 * world could not describe when she got home.
 *
 * It is also the verb that makes the attacker's two payments pull against each
 * other, which is the design's point: Vis keeps raiders alive to cast again, and
 * every cast is a spell the host's academics watch you use.
 */
function resolveMend(raid: Raid, price: Fixed): VerbResult {
  const store = componentOf(raid.engagement.entities, COMBATANT);
  let affected = 0;
  for (const brief of livingCombatants(raid)) {
    if (brief.side !== RAID_SIDE.attacker) continue;
    const max = store.get(brief.handle, 'maxHp');
    const now = store.get(brief.handle, 'hp');
    const raised = Math.min(now + raid.tuning.verbMendHitPoints, max);
    if (raised === now) continue;
    store.set(brief.handle, 'hp', raised);
    affected += 1;
  }
  if (affected === 0) return refuse('no-effect');
  debit(raid.purse, RAID_SIDE.attacker, price);
  return { applied: true, refusal: '', paid: price, affected };
}

/**
 * Concealment over every living raider, which is the only miss chance in combat.
 *
 * Written onto the §1.6 row rather than stacked as a source, because
 * concealment is a row field and the row is authoritative for it — the same
 * split `combatants.ts` describes. Capped at §3's concealment cap through the
 * arbiter's own stacking, applied here by clamping against `fp(1)`: a
 * concealment above one is a combatant nothing can ever hit.
 */
function resolveConceal(raid: Raid, price: Fixed): VerbResult {
  const store = componentOf(raid.engagement.entities, COMBATANT);
  let affected = 0;
  for (const brief of livingCombatants(raid)) {
    if (brief.side !== RAID_SIDE.attacker) continue;
    const now = store.get(brief.handle, 'concealment');
    const raised = Math.min(now + raid.tuning.verbConcealMagnitude, raid.tuning.concealmentCap);
    if (raised === now) continue;
    store.set(brief.handle, 'concealment', raised);
    affected += 1;
  }
  if (affected === 0) return refuse('no-effect');
  debit(raid.purse, RAID_SIDE.attacker, price);
  return { applied: true, refusal: '', paid: price, affected };
}

/**
 * A scripted plan, for a headless run.
 *
 * The shape that makes `raid-engagement.md` §5's first measurement runnable at
 * all: *"two arms, same seed, same forces, different muster spend → different
 * survival."* A plan makes the difference between the arms **data**, so the two
 * runs differ in exactly one input and a divergence is attributable.
 *
 * A client supplies clicks instead and calls {@link applyDirective} directly.
 * Nothing in the engine distinguishes the two.
 */
export interface RaidPlan {
  /** Directives to issue before the engagement tick of that key is stepped. */
  readonly at: ReadonlyMap<number, readonly Directive[]>;
}

/** Issues whatever a plan has for this tick, in order. */
export function runPlanFor(raid: Raid, plan: RaidPlan, tick: number): VerbResult[] {
  const due = plan.at.get(tick);
  if (due === undefined) return [];
  return due.map((directive) => applyDirective(raid, directive));
}

/** Nodes an attacker cast this raid, which is what exposure is computed over. */
export type CastRegister = Set<ContentId>;
