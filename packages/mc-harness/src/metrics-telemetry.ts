/*
 * Multiverse Mages — what a run reports to the metric collectors, and which
 * mechanics the build declares it has.
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
 * Task group 6's input side.
 *
 * ## Why the collectors read a telemetry record and not the world
 *
 * `contracts.md` §5 grants `mc-harness` exactly one edge, to `agent-api`, and
 * the harness currently reaches the simulation through a caller-supplied
 * {@link RunExecutor} and nothing else. A collector that imported `@mm/state` to
 * count knowledge instances would break that boundary — and would break it in
 * the specific way `design.md` warns about, by measuring something a trained
 * agent cannot see through the interface it plays on.
 *
 * So the executor observes; the collectors compute. Everything here is a plain
 * structured-cloneable record, which also means a run's telemetry can cross a
 * worker boundary and be recomputed offline from the same inputs.
 *
 * ## Absence is declared, never inferred
 *
 * Half the mechanics §7 names do not exist at 0.5.0. The dangerous way to handle
 * that is to let each collector guess — a collector that sees an empty raid list
 * and concludes "raids are absent" reports `mechanic-absent` forever, including
 * on the build where raids exist and simply were not initiated. §7's own
 * scenario draws exactly that line: *"a run completes with no raids because none
 * were initiated, on a build where raids exist"* must report `no-observations`.
 *
 * {@link MechanicAvailability} is therefore a declaration the build makes once,
 * and {@link MECHANICS_AT_0_5_0} is this build's honest answer. Adding a mechanic
 * means flipping a flag in one place, and the flag is what a reviewer reads.
 */

import type { IllegalActionAccounting, TerminalStatus } from './session.js';
import type { RunCoordinates } from './seed.js';

/**
 * Which mechanics this build actually implements.
 *
 * Not "which are configured on" — which *exist*. A flag turned on for a mechanic
 * whose formula has not been written produces a metric with a plausible number
 * behind it, which `design.md` names as the single worst failure available to a
 * measurement layer.
 */
export interface MechanicAvailability {
  /**
   * Worship and favor regeneration, owned by `god-agency`. `contracts.md` §8
   * leaves the formulas to it explicitly, and `rules-world` is scanned for a
   * write to `favor` or `worship` and fails on one.
   */
  readonly worship: boolean;
  /** Raids, portals, and engagement-scale time, owned by `raid-engagement`. */
  readonly raidEngagement: boolean;
  /**
   * Prestige carried forward across runs, owned by `god-agency`. Separate from
   * {@link worship} because the carry-forward *maximum* is the thing
   * `prestigeAdvantage` needs, and it is a distinct decision from whether favor
   * regenerates at all.
   */
  readonly prestigeCarryForward: boolean;
}

/**
 * What this build has, as of 0.5.0.
 *
 * Two of the three are now `true`, and the flip is what `god-agency` bought:
 * `coordination`'s god systems compute worship from three saturated source
 * classes and regenerate favor from it every world tick, and `PRESTIGE_CAP` is
 * a loaded content constant with an asserted identity behind it, so both
 * `worshipSnowball` and `prestigeAdvantage` have a mechanic to measure. Neither
 * flag says the *sweep* produced a sample — `worshipSnowball` still needs
 * checkpoint samples and `prestigeAdvantage` still needs mirrored pairs, and
 * both report `no-observations` without them. That is the distinction these
 * flags exist to keep: absent is declared, empty is measured.
 *
 * `raidEngagement` stays `false`, and stays checked against the tree:
 * `raid-engagement` has not landed, `rules-raid` is a skeleton, and no run
 * produces a raid. Four §7 metrics depend on it and all four correctly report
 * `mechanic-absent`.
 *
 * **This is a default, not a fact about every run.** An executor reports its own
 * availability — see {@link RunTelemetry.mechanics} — and a caller running a
 * world with no god installed must say so rather than inheriting these.
 */
export const MECHANICS_AT_0_5_0: MechanicAvailability = Object.freeze({
  worship: true,
  raidEngagement: false,
  prestigeCarryForward: true,
});

/**
 * A world with none of the three. The shape a toy or god-less executor reports.
 *
 * Named rather than spelled out at each call site, because "all false" written
 * inline three times is three places that can drift from each other and from
 * the thing they describe.
 */
export const NO_MECHANICS: MechanicAvailability = Object.freeze({
  worship: false,
  raidEngagement: false,
  prestigeCarryForward: false,
});

/** One knowledge census sample. See `metrics-census.ts` for when they are taken. */
export interface CensusSample {
  readonly worldTick: number;
  /**
   * Node ids existing in the universe at this tick — `contracts.md` §1.5's
   * "instance count ≥ 1", read off `NodeExistenceIndex.knownNodes()`.
   */
  readonly existingNodeIds: readonly number[];
  /** Of those, the ones with exactly one surviving instance. */
  readonly singleInstanceNodeIds: readonly number[];
}

/** The first world tick a species held a node of a given tier, in a mind. */
export interface TierReach {
  readonly speciesId: string;
  /** `1..7`, as `contracts.md` §2.3 numbers node tiers. */
  readonly tier: number;
  readonly worldTick: number;
}

/** What a run reports at one snowball checkpoint tick. */
export interface CheckpointSample {
  readonly worldTick: number;
  /**
   * Instantaneous favor regeneration per world tick, or `null` when the build
   * has no worship mechanic. Never `0` in that case: zero is a measurement.
   */
  readonly favorRegenPerTick: number | null;
  /**
   * Distinct nodes held in instances whose location kind is `library`, summed
   * across all libraries. The §6a capital loop's stock variable.
   */
  readonly libraryNodeCount: number;
  /**
   * The three saturated worship source classes, separately, or absent when the
   * build has no worship.
   *
   * `god-agency`'s task 7.2: *"report per-class saturated worship contributions
   * with the metric so a runaway is attributable without a second sweep"*. A
   * Gini coefficient over 0.35 says inequality is growing and says nothing about
   * which of mages, universities or populace is producing it — and the three
   * saturate independently, so the answer changes what you would retune. Kept
   * beside the checkpoint rather than in a second telemetry channel because it
   * is a decomposition *of this sample*, and a decomposition taken at a
   * different moment would not add up.
   */
  readonly worshipByClass?: {
    readonly mages: number;
    readonly universities: number;
    readonly populace: number;
  };
}

/**
 * What one combat primitive was worth in one raid, in action-economy terms.
 *
 * Plain numbers, and deliberately not `rules-raid`'s own report type.
 * `contracts.md` §5 gives `mc-harness` exactly one edge, to `agent-api`, and
 * `packages/mc-harness/test/unit/package-boundaries.test.ts` enforces it — so
 * the executor flattens `RaidOutcome.actionEconomy` into this and the harness
 * never learns what a `CombatantBrief` is. It is also what lets a raid's
 * telemetry survive a structured clone to a worker.
 *
 * `source` is finer than `contracts.md` §3's primitive list in one place, and
 * that split is the whole point: `rules-raid` logs a summon's and a soldier
 * detachment's intrinsic attacks into `primitiveApplication` as `direct-damage`,
 * which makes "the bolt" and "the summoned servant" the same row. A measure that
 * cannot tell a cast from a body cannot answer what a combat *node* is worth.
 */
export interface RaidCombatSource {
  /** `direct-damage`, `area-denial`, `summon-intrinsic`, `ward`, … See `rules-raid`'s `COMBAT_SOURCE`. */
  readonly source: string;
  /** Combatant-ticks of enemy action this source denied, summed over both sides. */
  readonly deniedCombatantTicks: number;
  /** Hit points it actually removed, overkill excluded. **Secondary** — reported, not primary. */
  readonly hitPointsRemoved: number;
  /** Attempts that damaged a combatant which reached zero hit points on a tick they fed. */
  readonly removingAttempts: number;
  /** Attempts that removed hit points and left the target standing. */
  readonly hurtingAttempts: number;
  /** Attempts that landed nothing — evaded, or warded to zero. In neither ratio. */
  readonly spentAttempts: number;
}

/** One raid, as `raid-engagement` will report it. */
export interface RaidObservation {
  /** Stable within the run, so a failure can name the raid. */
  readonly raidId: number;
  /** Derived at portal open; named in the overflow failure message. */
  readonly raidSeed: number;
  /** Engagement ticks from raid start to resolution. */
  readonly engagementTicks: number;
  /** `portalStability` at portal open, in engagement ticks. The bound. */
  readonly initialPortalStabilityTicks: number;
  /** World ticks this universe spent frozen as the defender in this raid. */
  readonly defenderFrozenWorldTicks: number;
  /** World ticks of tempo the attacker forwent to open and hold this portal. */
  readonly attackerTempoCostWorldTicks: number;

  /**
   * Per-primitive action economy, ascending by `source`.
   *
   * Required rather than optional, for the reason the module opens with:
   * absence is *declared* through {@link MechanicAvailability}, never inferred
   * from a missing field. An optional field would make "this build has no
   * action-economy instrumentation" and "this raid had no combat" the same
   * observation, which is the confusion the reason codes exist to end.
   */
  readonly combatSources: readonly RaidCombatSource[];
  /**
   * Combatant-ticks this raid contained: for every combatant, the ticks from
   * entry to removal or to resolution. The denominator that turns denied
   * combatant-ticks from a level into a rate comparable across raid lengths.
   */
  readonly totalCombatantTicks: number;
  /** World-scale combatants removed — mages and detachments. Summons are not in this. */
  readonly worldScaleRemovals: number;
  /** Summons removed. Reported apart, and outside the primary scalar. */
  readonly summonsRemoved: number;
  /**
   * Denial channels `contracts.md` §3 permits that this build's engine has no
   * code path for — `displacement`, today.
   *
   * Carried through to the metric's detail so that a channel reading zero is
   * visibly a statement about the engine rather than a measurement. Four metrics
   * in this project have read as healthy constants while being structurally
   * incapable of moving; a declared list is how the fifth is avoided.
   */
  readonly unimplementedCombatChannels: readonly string[];
}

/** Everything a per-run collector may read. */
export interface RunTelemetry {
  readonly coordinates: RunCoordinates;
  readonly status: TerminalStatus;
  /** World ticks actually stepped. The right-censoring horizon. */
  readonly ticksRun: number;
  readonly mechanics: MechanicAvailability;
  readonly census: readonly CensusSample[];
  /**
   * The species the loaded content declares, in content order.
   *
   * Supplied rather than pinned: `CLAUDE.md` puts species in validated data
   * files and forbids hardcoding them here. What *is* pinned is the shape — six
   * species and seven tiers make §7's 42 pairs — and the collector fails loudly
   * if the content it was handed disagrees with that shape.
   */
  readonly speciesIds: readonly string[];
  /** First reach per `(species, tier)`. Pairs never reached are simply absent. */
  readonly tierFirstReached: readonly TierReach[];
  readonly checkpoints: readonly CheckpointSample[];
  /**
   * Raids observed, or `undefined` when the build has no raid mechanic.
   *
   * `undefined` and `[]` are the two different answers §7 requires: no mechanic
   * versus no sample. A collector must never collapse them.
   */
  readonly raids: readonly RaidObservation[] | undefined;
  readonly accounting: IllegalActionAccounting;
  /**
   * Submissions keyed by action id, when the session can supply them.
   *
   * §7's `illegalActionRate` must come from `agent-api`'s counters rather than
   * being recounted, and today those counters are `submitted`, `rejected` and
   * `rejectedByAction` — rejections by action, not *submissions* by action. The
   * no-op share the capability spec asks to see reported separately from the
   * rejection count needs the latter.
   *
   * So this is optional and is a recorded gap, not a workaround: when the
   * session grows a submission tally, the executor passes it through and the
   * breakdown appears. Until then the collector reports the two counters that do
   * exist and omits the share, rather than counting submissions itself — a
   * second tally that disagreed with the session's would be undiscoverable.
   */
  readonly submittedByActionId?: Readonly<Record<string, number>>;
}

/** One run, as an arm-scoped collector sees it. */
export interface ArmRunSummary {
  readonly coordinates: RunCoordinates;
  readonly status: TerminalStatus;
  /**
   * §1.1's ending, so `ascensionRate` can report *which summit* alongside how
   * many. Defaults to `none` for a record written before the field existed.
   */
  readonly terminalReason: number;
  readonly ticksRun: number;
  readonly checkpoints: readonly CheckpointSample[];
}

/**
 * One mirrored `prestigeAdvantage` play.
 *
 * A pair is two of these sharing a `runSeed` with the sides swapped, so a
 * structural side advantage contributes to both arms equally. Both plays
 * contribute, which is what "mirrored" means — reporting only the first would
 * reintroduce the bias the mirroring exists to cancel.
 */
export interface MirroredPlay {
  readonly runSeed: number;
  /** Which side the prestige-seeded universe played. */
  readonly prestigeSide: 0 | 1;
  /** Whether the prestige-seeded universe won this play. */
  readonly prestigeWon: boolean;
}

/** Everything a per-arm collector may read. */
export interface ArmTelemetry {
  readonly armId: string;
  readonly mechanics: MechanicAvailability;
  /**
   * The arm's runs. **Must already be in canonical order** — the caller sorts by
   * `(cellIndex, replicateIndex)`, because a Gini coefficient is a
   * floating-point fold and eight workers do not finish in an order.
   */
  readonly runs: readonly ArmRunSummary[];
  /** Present only for a `prestigeAdvantage` arm. */
  readonly mirroredPlays?: readonly MirroredPlay[];
  /**
   * The primitive this arm neutralizes, or `null` on a control arm.
   *
   * `winRateByPrimitive` reads it for one reason that is not bookkeeping: §7
   * reports `not-attributable` for `portal`, and that decision is made from the
   * primitive's *name* rather than from its results, because a `portal` arm
   * produces no results to decide from. See `ablation.ts`.
   */
  readonly ablatedPrimitiveId?: string | null;
  /**
   * The arm's mirrored ablation plays, in canonical run order.
   *
   * Shaped like {@link MirroredPlay} and deliberately not the same type: the
   * side that matters here is the *retaining* one, and a shared type would let a
   * caller hand prestige plays to the ablation collector and get a plausible
   * number. `ablation.ts` owns the type; this is `unknown`-free because the
   * telemetry record must survive a structured clone.
   */
  readonly ablationPlays?: readonly {
    readonly runSeed: number;
    readonly retainingSide: 0 | 1;
    readonly retainingWon: boolean;
  }[];
  /**
   * The maximum permitted prestige carry-forward, once `god-agency` defines it.
   *
   * `null` here is not a default: it is the statement that nobody has chosen a
   * magnitude, and the collector refuses to invent one. See the capability
   * spec's *"Prestige magnitude is not invented here"*.
   */
  readonly prestigeCarryForwardMax: number | null;
}
