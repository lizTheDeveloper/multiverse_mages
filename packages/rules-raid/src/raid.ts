/*
 * Multiverse Mages — a raid, from the portal opening to the world resuming.
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
 * The engagement loop: `openPortal` → `stepEngagement`* → `resolveRaid`.
 *
 * ## A raid is a function of three things and nothing else
 *
 * `(attacker snapshot, host snapshot, raidSeed)`. No wall clock, no ambient
 * state, no content read after portal open — the tuning is captured, the
 * rulesets are captured, and the terrain is regenerated from the seed. That is
 * what `pvp-server` inherits instead of re-deriving, and it is why every input
 * below arrives as a parameter rather than as a module-level anything.
 *
 * ## The tick phases, and one honest deviation
 *
 * `raid-space` fixes the order: intent, movement and displacement, area denial,
 * cast resolution, theft, objective interaction, stability decrement, cleanup.
 * That order is implemented as written with **one** reading recorded here rather
 * than absorbed quietly: a `blink` displacement caused by a cast is applied
 * during cast resolution, not during the movement phase, because an effect
 * cannot precede the cast that produced it. The alternatives were to defer the
 * displacement by a tick — which is not "instantaneous" — or to apply a node's
 * effects outside `resolveCast`, which is the one thing arbitration forbids.
 * Terrain clamping and max-stacking are unchanged either way, so both spec
 * scenarios about `blink` hold.
 *
 * ## Damage is ledgered, not applied
 *
 * Every point of damage in a tick — from casts, from area-denial fields, from
 * detachments and summons — is accumulated against its target and settled once,
 * in cleanup, as `applied = Σraw × (1 − ward)`. Three properties fall out
 * together and none of them is separately implemented:
 *
 * - **Ten small hits equal one large hit.** `contracts.md` §3 asks for exactly
 *   this and gives the reason: per-source ward application would make splitting
 *   an attack strictly worse for the attacker as a rounding artefact.
 * - **Within-tick order independence.** Nothing in the tick reads a hit point
 *   value that this tick has changed, so the walk order of the cast phase cannot
 *   decide the outcome.
 * - **Deferred death.** A combatant reduced to zero still resolves the intent it
 *   declared, because it is not removed until after the ledger settles. That is
 *   not flavour — it is what stops entity index order from silently deciding
 *   fights.
 */

import type { ContentId, ContentRegistry, SpeciesRecord } from '@mm/content';
import type { EntityHandle, Fixed, RngSource, SimState } from '@mm/sim-core';
import {
  FP_ONE,
  RNG_STREAM,
  advanceClock,
  enterEngagement,
  floorDiv,
  nextBounded,
  rngFromRootSeed,
} from '@mm/sim-core';
import { ClampCounters } from '@mm/primitives';
import type { Engagement, Handle, RaidSideValue, RulesetSnapshot } from '@mm/state';
import {
  COMBATANT,
  COMBATANT_SOURCE_KIND,
  LOCATION_KIND,
  OBJECTIVE_STATUS,
  RAID_SIDE,
  beginEngagement,
  componentOf,
  endEngagement,
} from '@mm/state';
import type { KnowledgeSubsystem, MagicGrid, PortalHooks } from '@mm/rules-magic';
import { MASTERY_ACTIVATION_THRESHOLD } from '@mm/rules-magic';

import type { ArbitrationFaults, HeldInstance } from './arbitration.js';
import { COMBAT_PRIMITIVES, CastArbiter, summonCount } from './arbitration.js';
import type { CombatantBrief, SideRoster } from './combatants.js';
import { emptyRoster, sideHasSummonRoom, spawnCombatant } from './combatants.js';
import type { Point } from './geometry.js';
import { withinRange, hasLineOfSight } from './geometry.js';
import { compareCombatantKeys, opposingSide, packCombatantKey } from './keys.js';
import { blinkToward } from './movement.js';
import { TerrainNavigator } from './navigation.js';
import type { ObjectiveBrief } from './objectives.js';
import {
  OBJECTIVE_KIND,
  allObjectivesResolved,
  syncObjectiveRow,
  takenObjectiveValue,
  totalObjectiveValue,
} from './objectives.js';
import { buildSpatialIndex } from './spatial.js';
import { generateTerrain } from './terrain.js';
import type { TerrainGrid } from './terrain.js';
import type { RaidTuning } from './tuning.js';
import { OutcomeLedger } from './outcome.js';
import type { RaidOutcome } from './outcome.js';
import {
  EngagementCeilingReached,
  MAX_ENGAGEMENT_TICKS,
  RAID_END_REASON,
  decayStability,
  maxEngagementTicks,
  terminationOf,
  victorOf,
} from './termination.js';

/** One universe in a raid, with everything the engine reads of it. */
export interface RaidParticipant {
  readonly world: SimState;
  readonly knowledge: KnowledgeSubsystem;
  /** Frozen at portal open. Arbitration never dereferences a live universe. */
  readonly ruleset: RulesetSnapshot;
  /** Resolved hooks: home `store`/`cast`, host `cast`/`cost` (§2.5). */
  readonly hooks: PortalHooks;
  readonly speciesOf: (speciesId: number) => SpeciesRecord;
}

/** An area-denial field on the ground, with the ticks it has left. */
interface DenialField {
  readonly owner: RaidSideValue;
  readonly position: Point;
  readonly magnitude: Fixed;
  ticksRemaining: number;
}

/** A raid in progress. Discarded whole at resolution. */
export interface Raid {
  readonly attacker: RaidParticipant;
  readonly host: RaidParticipant;
  readonly engagement: Engagement;
  readonly terrain: TerrainGrid;
  /** Distance fields over the terrain, so movement cannot oscillate. */
  readonly navigator: TerrainNavigator;
  readonly arbiter: CastArbiter;
  readonly tuning: RaidTuning;
  readonly grid: MagicGrid;
  readonly registry: ContentRegistry;
  readonly rng: RngSource;
  readonly rosters: readonly [SideRoster, SideRoster];
  readonly objectives: ObjectiveBrief[];
  readonly fields: DenialField[];
  readonly ledger: OutcomeLedger;
  readonly counters: ClampCounters;
  /** Where the attacker came in, and the only way out. */
  readonly portal: Point;
  /** Computable before the first tick, from `RaidState` alone. */
  readonly maxTicks: number;
  readonly faults: RaidFaults;
  outcome: RaidOutcome | undefined;
}

/** The only ways a test may weaken a raid, and each one exists to prove a check. */
export interface RaidFaults extends ArbitrationFaults {
  /**
   * Skips the stability decrement, so the raid runs to the compile-time ceiling.
   *
   * The only legitimate use is the test that proves the ceiling is a loud
   * failure rather than a quiet truncation. A ceiling nobody has ever reached is
   * a ceiling nobody knows the behaviour of.
   */
  readonly disableStabilityDecay?: boolean;
}

/** What a combatant decided to do this tick, scored against tick-start state. */
interface Intent {
  readonly kind: 'cast' | 'steal' | 'move' | 'objective' | 'withdraw' | 'guard';
  readonly nodeId?: ContentId;
  readonly goal?: Point;
  readonly objective?: ObjectiveBrief;
}

// ---------------------------------------------------------------------------
// Portal open
// ---------------------------------------------------------------------------

/** Everything a raid needs to exist. */
export interface OpenPortalOptions {
  readonly attacker: RaidParticipant;
  readonly host: RaidParticipant;
  readonly registry: ContentRegistry;
  readonly grid: MagicGrid;
  readonly tuning: RaidTuning;
  /** Derived at portal open by the caller; the raid's whole randomness. */
  readonly raidSeed: number;
  readonly faults?: RaidFaults;
}

/**
 * Opens the portal: freezes world time for both participants, captures the
 * battlefield, derives combatants, and computes each one's legal-node mask.
 *
 * World time is frozen for **both** universes, which is what makes a raid cost
 * zero world ticks on either side. `beginEngagement` does the host's clock and
 * builds the engagement store; the attacker's clock is stopped beside it. The
 * asymmetry is only in which store the combatants live in — there is one
 * engagement, and both sides are in it.
 */
export function openPortal(options: OpenPortalOptions): Raid {
  const { attacker, host, tuning, registry, grid } = options;
  const rng = rngFromRootSeed(options.raidSeed);

  // Stream 10 — "objective and raid generation" — for the opening jitter, so
  // two raids from one snapshot do not end on the same tick. The bound is
  // computed from initial + jitter at content load, so no draw here can produce
  // a raid longer than the declared ceiling.
  const jitterStream = rng.stream(RNG_STREAM.objectives, 0);
  const jitter = tuning.portalStabilityJitter * 2 + 1;
  const portalStability =
    tuning.portalStabilityInitial - tuning.portalStabilityJitter + nextBounded(jitterStream, jitter);

  const engagement = beginEngagement(host.world, {
    hostRuleset: host.ruleset,
    raiderRuleset: attacker.ruleset,
    portalStability,
    stabilityDecayPerTick: tuning.stabilityDecayPerTick,
    raidSeed: options.raidSeed,
  });
  // The attacker's world stops too. Vision §3's raid costs the raider tempo as
  // surely as it costs the defender, and `inboundRaidTempoLoss` is only a
  // griefing guard if `raidInitiationCost` is measured against it.
  enterEngagement(attacker.world.clock);

  const counters = new ClampCounters();
  const arbiter = new CastArbiter({
    hostRuleset: host.ruleset,
    grid,
    registry,
    tuning,
    counters,
    faults: options.faults ?? {},
  });

  const terrain = generateTerrain(tuning, rng);

  const raid: Raid = {
    attacker,
    host,
    engagement,
    terrain,
    navigator: new TerrainNavigator(terrain),
    arbiter,
    tuning,
    grid,
    registry,
    rng,
    rosters: [emptyRoster(), emptyRoster()],
    objectives: [],
    fields: [],
    ledger: new OutcomeLedger(),
    counters,
    portal: { x: floorDiv(tuning.battlefieldExtent, 2), y: 0 },
    maxTicks: maxEngagementTicks(engagement.raid),
    faults: options.faults ?? {},
    outcome: undefined,
  };

  return raid;
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

/** A place inside a side's deployment band, on passable ground. */
export function deploymentPosition(
  raid: Raid,
  side: RaidSideValue,
  ordinal: number,
): Point {
  const stream = raid.rng.actorStream(RNG_STREAM.terrain, 1, packCombatantKey({ side, spawnOrdinal: ordinal }));
  const depth = raid.tuning.deploymentZoneDepth;
  const near = side === RAID_SIDE.attacker ? 0 : raid.tuning.battlefieldExtent - depth;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const point: Point = {
      x: nextBounded(stream, raid.tuning.battlefieldExtent),
      y: near + nextBounded(stream, depth),
    };
    if (raid.terrain.passableAt(point)) return point;
  }
  // A bounded search, then a fixed fallback. An unbounded search on a map that
  // happened to be mostly rock is a raid that never starts, which is the
  // termination failure this change exists to make impossible arriving through
  // a side door.
  return { x: floorDiv(raid.tuning.battlefieldExtent, 2), y: near };
}

/** Reads a combatant's §1.6 row field. The row is authoritative. */
function field(raid: Raid, handle: EntityHandle, name: 'x' | 'y' | 'hp' | 'maxHp' | 'vigor' | 'concealment'): number {
  return componentOf(raid.engagement.entities, COMBATANT).get(handle, name);
}

function setField(
  raid: Raid,
  handle: EntityHandle,
  name: 'x' | 'y' | 'hp' | 'vigor',
  value: number,
): void {
  componentOf(raid.engagement.entities, COMBATANT).set(handle, name, value);
}

/** A combatant's position, as the row holds it. */
export function positionOf(raid: Raid, brief: CombatantBrief): Point {
  return { x: field(raid, brief.handle, 'x'), y: field(raid, brief.handle, 'y') };
}

/** Whether this combatant is still standing. */
export function isAlive(raid: Raid, brief: CombatantBrief): boolean {
  return (
    componentOf(raid.engagement.entities, COMBATANT).has(brief.handle) &&
    field(raid, brief.handle, 'hp') > 0
  );
}

/** Every living combatant, ascending by stable key — the order every phase walks. */
export function livingCombatants(raid: Raid): CombatantBrief[] {
  const all: CombatantBrief[] = [];
  for (const roster of raid.rosters) {
    for (const brief of roster.briefs) {
      if (isAlive(raid, brief) && !brief.withdrawn) all.push(brief);
    }
  }
  all.sort((a, b) => compareCombatantKeys(a.key, b.key));
  return all;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * One engagement tick, in the fixed phase order.
 *
 * @returns the termination found in cleanup, or `undefined` if the raid runs on.
 */
export function stepEngagement(raid: Raid): ReturnType<typeof terminationOf> {
  const tick = engagementTickOf(raid);
  const combatants = livingCombatants(raid);
  const index = buildSpatialIndex(
    combatants.map((brief) => ({ key: brief.key, position: positionOf(raid, brief), brief })),
    raid.tuning.battlefieldExtent,
    raid.tuning.maxInteractionRadius,
  );

  raid.ledger.observeCounts(
    combatants.filter((brief) => brief.side === RAID_SIDE.attacker).length,
    combatants.filter((brief) => brief.side === RAID_SIDE.defender).length,
  );

  // ---- Phase 1: intent, against tick-start state. ----
  const intents = new Map<EntityHandle, Intent>();
  for (const brief of combatants) {
    intents.set(brief.handle, chooseIntent(raid, brief, combatants, tick));
  }

  // ---- Phase 2: movement. ----
  for (const brief of combatants) {
    const intent = intents.get(brief.handle);
    if (intent?.goal === undefined) continue;
    const landed = raid.navigator.stepTowardGoal(
      positionOf(raid, brief),
      intent.goal,
      raid.tuning.movementPerTick,
    );
    setField(raid, brief.handle, 'x', landed.x);
    setField(raid, brief.handle, 'y', landed.y);
  }

  // Damage accumulates here and is settled once, in cleanup.
  const ledger = new Map<EntityHandle, Fixed>();
  const addDamage = (target: EntityHandle, amount: Fixed): void => {
    ledger.set(target, (ledger.get(target) ?? 0) + amount);
  };

  // ---- Phase 3: area denial. Additive across fields; bypasses concealment. ----
  for (const denial of raid.fields) {
    for (const brief of combatants) {
      if (brief.side === denial.owner) continue;
      if (!withinRange(denial.position, positionOf(raid, brief), raid.tuning.areaDenialRadius)) {
        continue;
      }
      // A field targets nobody, so there is nothing for concealment to evade —
      // which is the mechanical reason area denial is the counter to a
      // concealment build, and it is stated rather than left emergent.
      addDamage(brief.handle, denial.magnitude);
      raid.ledger.applied(COMBAT_PRIMITIVES.areaDenial, denial.owner, denial.magnitude);
    }
  }

  // ---- Phase 4: cast resolution, ascending key. ----
  for (const brief of combatants) {
    const intent = intents.get(brief.handle);
    if (intent === undefined) continue;
    if (intent.kind === 'cast' && intent.nodeId !== undefined) {
      resolveOneCast(raid, brief, intent.nodeId, combatants, index, tick, addDamage);
    }
    // A detachment or a summon holds no knowledge; its attack is intrinsic and
    // is not a cast, so it neither consults nor could consult the ruleset. A
    // ruleset governs magic.
    if (brief.intrinsicDamage > 0) {
      const target = acquireTarget(raid, brief, combatants, brief.intrinsicRange);
      if (target !== undefined) {
        addDamage(target.handle, brief.intrinsicDamage);
        raid.ledger.applied(COMBAT_PRIMITIVES.directDamage, brief.side, brief.intrinsicDamage);
      }
    }
  }

  // ---- Phase 5: theft, after damage, so a kill and a robbery are a choice. ----
  for (const brief of combatants) {
    const intent = intents.get(brief.handle);
    if (intent?.kind !== 'steal' || intent.nodeId === undefined) continue;
    resolveTheft(raid, brief, intent.nodeId, combatants, tick, ledger);
  }

  // ---- Phase 6: objective interaction. ----
  for (const brief of combatants) {
    const intent = intents.get(brief.handle);
    if (intent?.kind !== 'objective' || intent.objective === undefined) continue;
    advanceObjective(raid, brief, intent.objective);
  }
  for (const brief of combatants) {
    const intent = intents.get(brief.handle);
    if (intent?.kind !== 'withdraw') continue;
    if (withinRange(positionOf(raid, brief), raid.portal, raid.tuning.portalMargin)) {
      brief.withdrawn = true;
    }
  }

  // ---- Phase 7: the stability decrement. One call, one writer, no guard. ----
  if (raid.faults.disableStabilityDecay !== true) decayStability(raid.engagement.raid);

  // ---- Phase 8: cleanup — settle the ledger, remove the dead, ask if it ends. ----
  for (const [handle, raw] of ledger) {
    const brief = briefOf(raid, handle);
    if (brief === undefined) continue;
    const applied = raid.arbiter.applyWardOnce(raw, brief.wardSources);
    const remaining = field(raid, handle, 'hp') - applied;
    setField(raid, handle, 'hp', remaining > 0 ? remaining : 0);
  }
  for (const denial of raid.fields) denial.ticksRemaining -= 1;
  for (let at = raid.fields.length - 1; at >= 0; at -= 1) {
    if ((raid.fields[at] as DenialField).ticksRemaining <= 0) raid.fields.splice(at, 1);
  }

  // Both clocks advance, and neither world tick moves: `advanceClock` cannot
  // reach `worldTick` while the mode is engagement, so the freeze is structural
  // rather than a rule this loop is asked to respect.
  advanceClock(raid.host.world.clock);
  advanceClock(raid.attacker.world.clock);
  const nextTick = engagementTickOf(raid);

  const alive = livingCombatants(raid);
  return terminationOf({
    raid: raid.engagement.raid,
    engagementTick: nextTick,
    maxTicks: raid.maxTicks,
    allObjectivesResolved: allObjectivesResolved(raid.objectives),
    livingAttackers: alive.filter((brief) => brief.side === RAID_SIDE.attacker).length,
    livingDefenders: alive.filter((brief) => brief.side === RAID_SIDE.defender).length,
  });
}

function briefOf(raid: Raid, handle: EntityHandle): CombatantBrief | undefined {
  for (const roster of raid.rosters) {
    for (const brief of roster.briefs) {
      if (brief.handle === handle) return brief;
    }
  }
  return undefined;
}

/**
 * What a combatant does this tick.
 *
 * **A priority order, not a weighted utility score, and that is deliberate.**
 * `mage-autonomy`'s scorer is typed over the world goal registry and a
 * `MageOutlook` built from world state; a raid goal set is a different domain
 * and reusing the scorer would mean inventing a second outlook for it. What is
 * reused is the *discipline*: candidates are enumerated in a fixed order, and
 * where two candidates genuinely tie the tie breaks on stream 7, which is the
 * registry's *"mage autonomy / utility-AI tie-breaking, including combatant goal
 * selection in a raid"*.
 *
 * A priority order also has no magnitudes in it, which matters before 0.5.0: a
 * set of invented weights would be a balance claim wearing an AI's clothes,
 * where an ordering is a statement about what a raider is *for*.
 */
function chooseIntent(
  raid: Raid,
  brief: CombatantBrief,
  combatants: readonly CombatantBrief[],
  tick: number,
): Intent {
  const here = positionOf(raid, brief);
  const isAttacker = brief.side === RAID_SIDE.attacker;

  // 1. Leave, while leaving is still possible. The stranded-raider rule makes
  //    this the difference between a live mage and a dead one.
  if (
    isAttacker &&
    raid.engagement.raid.portalStability <= raid.tuning.withdrawStabilityMargin
  ) {
    return { kind: 'withdraw', goal: raid.portal };
  }

  // 2. Rob, if a mind is close enough to read **and holds something new**.
  //
  // The second half is not a refinement. Without it a thief steals the same
  // node from the same mind on every tick for the whole raid: the intent is
  // satisfied, the attempt succeeds, and nothing about the world changes — 455
  // identical thefts in the first end-to-end run, which is what "a metric
  // describing nothing" looks like from the inside.
  const theftNode = firstNodeWith(raid, brief, COMBAT_PRIMITIVES.knowledgeSteal);
  if (theftNode !== undefined) {
    const victim = acquireTarget(raid, brief, combatants, raid.tuning.theftRange);
    if (victim !== undefined && stealableFrom(raid, brief, victim) !== 0) {
      return { kind: 'steal', nodeId: theftNode };
    }
  }

  // 3. Cast, if anything legal is readied and anyone is in range and in sight.
  const castNode = firstCastableNode(raid, brief);
  if (castNode !== undefined) {
    const target = acquireTarget(raid, brief, combatants, raid.tuning.castRange);
    if (target !== undefined) return { kind: 'cast', nodeId: castNode };
  }

  // 4. Take what you came for.
  if (isAttacker) {
    const objective = nearestUnresolvedObjective(raid, here, tick, brief);
    if (objective !== undefined) {
      if (withinRange(here, objective.position, raid.tuning.objectiveInteractionRadius)) {
        return { kind: 'objective', objective };
      }
      return { kind: 'move', goal: objective.position };
    }
    // Nothing left to take. Go home rather than stand in a stranger's field.
    return { kind: 'withdraw', goal: raid.portal };
  }

  // 5. Close with whoever is nearest, or hold.
  const enemy = nearestEnemy(raid, brief, combatants);
  if (enemy !== undefined) return { kind: 'move', goal: positionOf(raid, enemy) };
  return { kind: 'guard' };
}

/**
 * The first node this combatant can **actually release right now**, ascending.
 *
 * Three filters, and every one of them is load-bearing:
 *
 * - **Legal**, from the mask — so an illegal node is never a candidate.
 * - **Readied**, if the host's `cast` hook requires preparation — a Vancian sky
 *   releases only what was memorised, and once the list is spent it is spent.
 * - **Affordable**, at the host's `cost` hook price.
 *
 * Leaving any of them out produces the same failure and it is not subtle: the
 * combatant declares a cast every tick, the cast is refused every tick, and
 * because a declared cast carries no movement goal she stands still for the rest
 * of the raid. Observed on the second end-to-end run — two spells were thrown,
 * the preparations ran out, and both sides stood in a field for two thousand
 * ticks. A refusal that costs a tick is a behavioural bug wearing a safety
 * check's clothes.
 */
function firstCastableNode(raid: Raid, brief: CombatantBrief): ContentId | undefined {
  const hostCast = raid.host.hooks.hostCast;
  const vigor = field(raid, brief.handle, 'vigor');

  const pool = raid.arbiter.selectionMaskDisabled
    ? [...brief.preparedSpells]
    : hostCast.preparationRequired
      ? brief.preparedSpells.filter((nodeId) => brief.legalNodes.has(nodeId))
      : [...brief.legalNodes];

  for (const nodeId of [...pool].sort((a, b) => a - b)) {
    const node = raid.registry.node(nodeId);
    if (node === undefined) continue;
    if (!node.effects.some((effect) => effect.primitive === COMBAT_PRIMITIVES.directDamage)) {
      continue;
    }
    const price = raid.tuning.castVigorBase + raid.tuning.castVigorPerTier * node.tier;
    if (!raid.host.hooks.hostCost.paidAtPreparation && price > vigor) continue;
    return nodeId;
  }
  return undefined;
}

/** The first legal node this combatant holds that carries a primitive. */
function firstNodeWith(raid: Raid, brief: CombatantBrief, primitiveId: string): ContentId | undefined {
  for (const nodeId of [...brief.legalNodes].sort((a, b) => a - b)) {
    const node = raid.registry.node(nodeId);
    if (node?.effects.some((effect) => effect.primitive === primitiveId) === true) return nodeId;
  }
  return undefined;
}

/**
 * The weakest enemy in range and in line of sight, ties on ascending key.
 *
 * *"Focus the weakest"* is a legible default rather than a claim about optimal
 * play, and it is marked untuned. What matters more than the rule is that it is
 * a **total order** over a stable identity: two peers with the same battlefield
 * acquire the same target, always.
 */
function acquireTarget(
  raid: Raid,
  caster: CombatantBrief,
  combatants: readonly CombatantBrief[],
  range: Fixed,
): CombatantBrief | undefined {
  const from = positionOf(raid, caster);
  const enemySide = opposingSide(caster.side);
  let best: CombatantBrief | undefined;
  let bestHp = Number.POSITIVE_INFINITY;

  for (const candidate of combatants) {
    if (candidate.side !== enemySide) continue;
    const hp = field(raid, candidate.handle, 'hp');
    if (hp <= 0) continue;
    const to = positionOf(raid, candidate);
    if (!withinRange(from, to, range)) continue;
    if (!seesEachOther(raid, from, to)) continue;
    if (hp < bestHp || (hp === bestHp && best !== undefined && compareCombatantKeys(candidate.key, best.key) < 0)) {
      best = candidate;
      bestHp = hp;
    }
  }
  return best;
}

function seesEachOther(raid: Raid, from: Point, to: Point): boolean {
  return hasLineOfSight(from, to, raid.terrain.cellSize, raid.terrain.cellsPerSide, (cell) =>
    raid.terrain.blocksAt(cell),
  );
}

function nearestEnemy(
  raid: Raid,
  brief: CombatantBrief,
  combatants: readonly CombatantBrief[],
): CombatantBrief | undefined {
  const from = positionOf(raid, brief);
  const enemySide = opposingSide(brief.side);
  let best: CombatantBrief | undefined;
  let bestSquared = Number.POSITIVE_INFINITY;
  for (const candidate of combatants) {
    if (candidate.side !== enemySide) continue;
    const to = positionOf(raid, candidate);
    const squared = (from.x - to.x) * (from.x - to.x) + (from.y - to.y) * (from.y - to.y);
    if (squared < bestSquared) {
      best = candidate;
      bestSquared = squared;
    }
  }
  return best;
}

/**
 * The nearest objective still worth going to, ties broken on stream 7.
 *
 * The tie-break is the one place the raid AI draws randomness, and it is on the
 * registry's autonomy stream because that is what the registry says it is for.
 */
function nearestUnresolvedObjective(
  raid: Raid,
  here: Point,
  tick: number,
  brief: CombatantBrief,
): ObjectiveBrief | undefined {
  const open = raid.objectives.filter((objective) => objective.status === OBJECTIVE_STATUS.held);
  if (open.length === 0) return undefined;

  let bestSquared = Number.POSITIVE_INFINITY;
  let tied: ObjectiveBrief[] = [];
  for (const objective of open) {
    const dx = here.x - objective.position.x;
    const dy = here.y - objective.position.y;
    const squared = dx * dx + dy * dy;
    if (squared < bestSquared) {
      bestSquared = squared;
      tied = [objective];
    } else if (squared === bestSquared) {
      tied.push(objective);
    }
  }
  if (tied.length === 1) return tied[0];
  const stream = raid.rng.actorStream(RNG_STREAM.autonomy, tick, packCombatantKey(brief.key));
  return tied[nextBounded(stream, tied.length)];
}

/**
 * One cast: through the arbiter, then onto the field.
 *
 * Everything before the effects is the arbiter's; everything after is geometry.
 * That split is what makes "one entry point" true — this function cannot apply
 * an effect it was not handed.
 */
function resolveOneCast(
  raid: Raid,
  caster: CombatantBrief,
  nodeId: ContentId,
  combatants: readonly CombatantBrief[],
  _index: unknown,
  tick: number,
  addDamage: (target: EntityHandle, amount: Fixed) => void,
): void {
  const target = acquireTarget(raid, caster, combatants, raid.tuning.castRange);
  // No target means no expenditure: the preparation stays readied and the price
  // is not charged. Charging for a cast that never happened is the kind of
  // asymmetry that shows up months later as an unexplained vigor drain.
  const needsTarget = raid.registry
    .node(nodeId)
    ?.effects.some((effect) => effect.primitive === COMBAT_PRIMITIVES.directDamage);
  if (needsTarget === true && target === undefined) return;

  const resolution = raid.arbiter.resolveCast({
    nodeId,
    legalNodes: caster.legalNodes,
    hostCast: raid.host.hooks.hostCast,
    hostCost: raid.host.hooks.hostCost,
    preparedSpells: caster.preparedSpells,
    vigor: field(raid, caster.handle, 'vigor'),
  });
  if (!resolution.resolved) return;

  caster.preparedSpells = resolution.preparedSpells;
  setField(raid, caster.handle, 'vigor', field(raid, caster.handle, 'vigor') - resolution.cost);

  // Displacement first, so that a blink-and-strike node reaches from where it
  // ended up. See the module note: a `blink` caused by a cast is applied here
  // rather than in phase 2, because an effect cannot precede its own cast.
  if (resolution.effects.blink.length > 0) {
    const goal = target === undefined ? raid.portal : positionOf(raid, target);
    const landed = blinkToward(
      positionOf(raid, caster),
      goal,
      resolution.effects.blink,
      raid.terrain,
    );
    setField(raid, caster.handle, 'x', landed.x);
    setField(raid, caster.handle, 'y', landed.y);
    for (const magnitude of resolution.effects.blink) {
      raid.ledger.applied(COMBAT_PRIMITIVES.blink, caster.side, magnitude);
    }
  }

  for (const denial of resolution.effects.areaDenial) {
    raid.fields.push({
      owner: caster.side,
      position: target === undefined ? positionOf(raid, caster) : positionOf(raid, target),
      magnitude: denial.magnitude,
      // A field with no declared duration lasts the tick it was cast in, which
      // is one application. A zero-tick field that applied nothing would be a
      // primitive that content could declare and never observe.
      ticksRemaining: Math.max(1, denial.durationTicks),
    });
  }

  for (const magnitude of resolution.effects.summon) {
    summonInto(raid, caster, magnitude);
  }

  if (resolution.effects.directDamage.length > 0 && target !== undefined) {
    // The evasion roll — the only miss chance in combat — on stream 8, keyed on
    // the *target*, because it is the target's concealment being tested.
    const stream = raid.rng.actorStream(RNG_STREAM.combat, tick, packCombatantKey(target.key));
    const evaded = raid.arbiter.evades(field(raid, target.handle, 'concealment'), stream);
    if (!evaded) {
      for (const magnitude of resolution.effects.directDamage) {
        addDamage(target.handle, magnitude);
        raid.ledger.applied(COMBAT_PRIMITIVES.directDamage, caster.side, magnitude);
      }
    } else {
      raid.ledger.applied(COMBAT_PRIMITIVES.concealment, target.side, field(raid, target.handle, 'concealment'));
    }
  }
}

/**
 * A summon, or a no-op.
 *
 * Over the cap is **a no-op, never a queue**: a queued request is an unbounded
 * structure wearing a cap's clothes, and the caps are half of what makes total
 * raid work bounded. The cost is still charged, because the caster spent the
 * spell either way.
 */
function summonInto(raid: Raid, caster: CombatantBrief, magnitude: Fixed): void {
  const roster = raid.rosters[caster.side] as SideRoster;
  const wanted = summonCount(magnitude);
  for (let created = 0; created < wanted; created += 1) {
    if (!sideHasSummonRoom(roster, raid.tuning)) return;
    spawnCombatant(raid.engagement.entities, roster, {
      side: caster.side,
      sourceKind: COMBATANT_SOURCE_KIND.summon,
      // §1.6: a summon has no world source, and writes nothing back. It never
      // existed at world scale, so there is nothing for it to have been.
      sourceId: 0,
      position: positionOf(raid, caster),
      hp: raid.tuning.summonMaxHp,
      vigor: 0,
      concealment: 0,
      intrinsicDamage: raid.tuning.summonDamage,
      intrinsicRange: raid.tuning.detachmentRange,
    });
    raid.ledger.applied(COMBAT_PRIMITIVES.summon, caster.side, FP_ONE);
  }
}

/**
 * One theft attempt, on stream 9, gated by the host's ruleset.
 *
 * Resolved after damage so that a thief who kills her target this tick does not
 * also read its mind — the mind is gone. Deliberate: it forces a real choice
 * between killing and robbing, and it is the reason phase 5 exists as a separate
 * phase rather than as a branch inside phase 4.
 */
function resolveTheft(
  raid: Raid,
  thief: CombatantBrief,
  nodeId: ContentId,
  combatants: readonly CombatantBrief[],
  tick: number,
  damageLedger: ReadonlyMap<EntityHandle, Fixed>,
): void {
  const victim = acquireTarget(raid, thief, combatants, raid.tuning.theftRange);
  if (victim === undefined) return;
  if (victim.sourceKind !== COMBATANT_SOURCE_KIND.mage) return;

  // The mind has to still be there. Damage has not been settled yet — that is
  // cleanup's job — so the question is asked of what this tick will do.
  const incoming = damageLedger.get(victim.handle) ?? 0;
  if (field(raid, victim.handle, 'hp') - raid.arbiter.applyWardOnce(incoming, victim.wardSources) <= 0) {
    return;
  }

  const node = raid.registry.node(nodeId);
  if (node === undefined) return;
  const magnitudes = node.effects
    .filter((effect) => effect.primitive === COMBAT_PRIMITIVES.knowledgeSteal)
    .map((effect) => effect.magnitude);

  const stream = raid.rng.actorStream(RNG_STREAM.knowledgeTheft, tick, packCombatantKey(thief.key));
  if (!raid.arbiter.attemptTheft(nodeId, magnitudes, stream)) return;

  const taken = stealableFrom(raid, thief, victim);
  if (taken === 0) return;

  // Reading a mind **copies**: the victim keeps hers. Whether the thief keeps
  // it is decided at resolution, by whether she withdrew alive.
  thief.stolen.push(taken);
  raid.ledger.applied(COMBAT_PRIMITIVES.knowledgeSteal, thief.side, magnitudes[0] ?? 0);
}

/**
 * The node a thief would take from this victim, or `0`.
 *
 * Deepest first, so a successful theft takes something worth having, and ties
 * on the instance handle so that two peers take the same one. Nodes the thief
 * already knows — or has already taken this raid — are excluded, because
 * possession is not gated by `permits()` and a second copy of a node she is
 * already carrying is not a theft, it is a loop.
 */
function stealableFrom(raid: Raid, thief: CombatantBrief, victim: CombatantBrief): ContentId {
  if (victim.sourceKind !== COMBATANT_SOURCE_KIND.mage) return 0;
  const victimSide = victim.side === RAID_SIDE.attacker ? raid.attacker : raid.host;
  const already = new Set<ContentId>([...thief.knownNodes, ...thief.stolen]);

  const ranked = victimSide.knowledge
    .instancesHeldBy(victim.sourceId)
    .map((instance) => ({ instance, view: victimSide.knowledge.read(instance) }))
    .filter((entry) => raid.grid.hasNode(entry.view.nodeId) && !already.has(entry.view.nodeId))
    .sort(
      (a, b) =>
        raid.grid.tierOf(b.view.nodeId) - raid.grid.tierOf(a.view.nodeId) || a.instance - b.instance,
    );
  return ranked[0]?.view.nodeId ?? 0;
}

/** Progress on an objective; four ticks of contact resolves it. */
function advanceObjective(raid: Raid, brief: CombatantBrief, objective: ObjectiveBrief): void {
  objective.progress += raid.tuning.objectiveProgressPerTick;
  if (objective.progress < FP_ONE) return;

  objective.capturedBy = brief.handle;
  // A library is looted — the raider takes what she can carry. An archmage or a
  // university is captured: there is nothing there to put in a bag. Burning is
  // what happens to a library the attacker cannot carry away, and it is decided
  // at write-back by whether the raider withdrew, not here.
  objective.status =
    objective.kind === OBJECTIVE_KIND.library ? OBJECTIVE_STATUS.looted : OBJECTIVE_STATUS.captured;
  syncObjectiveRow(raid.engagement.entities, objective);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Runs the raid to its end and returns the outcome record.
 *
 * The loop is bounded twice over: by the termination predicate, and by the
 * compile-time ceiling. The second bound is the one that matters here — it is
 * what turns "a raid that does not decay" from a hang into a test failure.
 *
 * @throws EngagementCeilingReached **after** resolving, so a caller that
 * catches it still holds a complete outcome record.
 */
export function runRaid(raid: Raid): RaidOutcome {
  let termination = terminationOf({
    raid: raid.engagement.raid,
    engagementTick: 0,
    maxTicks: raid.maxTicks,
    allObjectivesResolved: allObjectivesResolved(raid.objectives),
    livingAttackers: raid.rosters[RAID_SIDE.attacker].briefs.length,
    livingDefenders: raid.rosters[RAID_SIDE.defender].briefs.length,
  });

  while (termination === undefined) {
    termination = stepEngagement(raid);
  }

  const outcome = resolveRaid(raid, termination.reason);
  if (termination.reason === RAID_END_REASON.ceilingReached) {
    throw new EngagementCeilingReached(engagementTickOf(raid));
  }
  return outcome;
}

/**
 * Closes the portal: decides the victor, freezes the outcome, and returns both
 * clocks to world time.
 *
 * Nothing is written to either world here. Application is
 * `applyRaidOutcome`'s, and the separation is what makes the write atomic.
 */
export function resolveRaid(raid: Raid, reason: RaidOutcome['reason']): RaidOutcome {
  const total = totalObjectiveValue(raid.objectives);
  const taken = takenObjectiveValue(raid.objectives);

  const casualties: RaidOutcome['casualties'] = [];
  const cohortLosses: RaidOutcome['cohortLosses'] = [];
  const movements = [...raid.ledger.knowledgeMovements];

  for (const roster of raid.rosters) {
    for (const brief of roster.briefs) {
      const dead = !isAlive(raid, brief);
      // The stranded-raider rule. An attacker still on the field when the
      // portal collapses is lost with it, and takes everything she was carrying.
      //
      // **This is the tunable most likely to need softening**, and it is marked
      // so deliberately. If the harness shows raiding is never worth attempting,
      // the intended relaxation is a survival roll scaled by distance to the
      // portal — NOT automatic extraction, which would make the last tick of a
      // raid free and turn the timer from a tension into a scene change.
      const stranded = brief.side === RAID_SIDE.attacker && !dead && !brief.withdrawn;
      if (!dead && !stranded) {
        for (const nodeId of brief.stolen) {
          movements.push({ nodeId, verb: 'copied', byCombatant: brief.handle, forfeited: false });
        }
        continue;
      }
      if (brief.sourceKind === COMBATANT_SOURCE_KIND.mage) {
        (casualties as { side: RaidSideValue; mageId: Handle; stranded: boolean }[]).push({
          side: brief.side,
          mageId: brief.sourceId,
          stranded,
        });
      } else if (brief.sourceKind === COMBATANT_SOURCE_KIND.soldierDetachment) {
        (cohortLosses as { side: RaidSideValue; cohortId: Handle; count: number }[]).push({
          side: brief.side,
          cohortId: brief.sourceId,
          count: brief.detachmentStrength,
        });
      }
      for (const nodeId of brief.stolen) {
        movements.push({ nodeId, verb: 'copied', byCombatant: brief.handle, forfeited: true });
      }
    }
  }

  const outcome: RaidOutcome = {
    victor: victorOf({
      takenValue: taken,
      totalValue: total,
      victoryThresholdFraction: raid.tuning.victoryThresholdFraction,
    }),
    reason,
    resolutionTick: engagementTickOf(raid),
    maxTicks: raid.maxTicks,
    casualties,
    cohortLosses,
    objectives: raid.objectives.map((objective) => ({
      kind: objective.kind,
      targetId: objective.targetId,
      value: objective.value,
      status: objective.status,
    })),
    knowledgeMovements: movements,
    nodesLostByHost: [],
    nodesGainedByRaider: [],
    forbiddenCastsBlocked: raid.arbiter.forbiddenCastsBlocked,
    capClamps: raid.counters.entries(),
    primitiveApplication: raid.ledger.primitiveApplication(),
    peakCombatants: raid.ledger.peakCombatants,
  };

  raid.outcome = outcome;
  return outcome;
}

/** Returns both universes to world time, at exactly the tick they paused at. */
export function closePortal(raid: Raid): void {
  endEngagement(raid.host.world);
  raid.attacker.world.clock.mode = 0;
  raid.attacker.world.clock.engagementTick = 0;
}

/**
 * The engagement tick, read from the participants' own clocks.
 *
 * `contracts.md` §0 puts the engagement tick on the clock and freezes world
 * time while the mode is engagement, so this is the contract's counter rather
 * than one this module keeps beside it. A second counter would be a second
 * source of truth for the number `raidLengthDistribution` is entirely about.
 */
export function engagementTickOf(raid: Raid): number {
  return raid.host.world.clock.engagementTick;
}

/** Every instance a mage holds, in the shape arbitration reads. */
export function heldInstancesOf(
  participant: RaidParticipant,
  mage: Handle,
): readonly HeldInstance[] {
  return participant.knowledge.instancesHeldBy(mage).map((instance) => {
    const view = participant.knowledge.read(instance);
    return { nodeId: view.nodeId, locationKind: view.locationKind, mastery: view.mastery };
  });
}

/** The mastery at which a held instance starts contributing. `rules-magic` owns it. */
export const CASTABLE_MASTERY = MASTERY_ACTIVATION_THRESHOLD;

/** Location kinds a raid may burn or loot from. Books and shelves, never minds. */
export const BURNABLE_LOCATION_KINDS: readonly number[] = [
  LOCATION_KIND.grimoire,
  LOCATION_KIND.library,
];

/**
 * Every node that still exists in a universe, recomputed from the instance
 * index and cached nowhere.
 *
 * `contracts.md` §1.5: *"whether a node 'exists in the universe' is
 * count(instances of nodeId) > 0, computed from an index maintained by the
 * knowledge subsystem. Nothing may cache it in state."* So the raid's node-loss
 * accounting takes this before and after the write-back and compares the two
 * sets, rather than maintaining a count of its own that could disagree.
 */
export function existingNodes(participant: RaidParticipant): Set<ContentId> {
  const found = new Set<ContentId>();
  for (const instance of participant.knowledge.instances()) {
    found.add(participant.knowledge.read(instance).nodeId);
  }
  return found;
}

/** The compile-time ceiling, re-exported so consumers do not reach into a module. */
export { MAX_ENGAGEMENT_TICKS };
