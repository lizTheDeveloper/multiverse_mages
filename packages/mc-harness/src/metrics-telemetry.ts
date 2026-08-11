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
 * Three `false`s and nothing else, and each one is checked against the tree:
 * `god-agency` (0.6.0) has not landed, so there is no favor-regeneration formula
 * and no prestige magnitude; `raid-engagement` (0.7.0) has not landed, so
 * `rules-raid` is a skeleton and no run produces a raid.
 */
export const MECHANICS_AT_0_5_0: MechanicAvailability = Object.freeze({
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
