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

/**
 * One species' reach across the seventy-cell grid, as content alone determines
 * it.
 *
 * Supplied by the executor rather than computed here, and the reason is the
 * package boundary: `mc-harness` depends on `@mm/agent-api` and nothing else,
 * so it cannot read `@mm/content`'s species records or the node catalogue. The
 * derivation therefore lives where the content does and arrives as a
 * measurement, the same way `speciesIds` does.
 *
 * Every field is a **cell count**, never a fraction — the denominators (70 and
 * 12) are pinned constants of the metric, and carrying a pre-divided ratio here
 * would put the arithmetic on the far side of the boundary from the definition
 * that names it.
 */
export interface SpeciesGridReach {
  readonly speciesId: string;
  /** The species `depthCeiling`, carried so a reader can see what produced the counts. */
  readonly depthCeiling: number;
  /** Cells the species can staff, over the full seventy. */
  readonly staffableCells: number;
  /** Of those, the ones the ruleset currently permits. */
  readonly staffableEnabledCells: number;
  /** Cells whose deepest node the species can reach — the *depth* question, for contrast. */
  readonly exhaustibleCells: number;
  /** Of those, the ones the ruleset currently permits. */
  readonly exhaustibleEnabledCells: number;
  /**
   * World ticks a node stays transmissible in this species' hands, starting
   * from full mastery: `floor((MASTERY_MAX − TEACH_THRESHOLD) /
   * masteryDecayPerTick(retention))`.
   *
   * **This is the quantity that actually separates the species**, and it exists
   * because nothing in the rules path ever *raises* mastery. `setMastery` has
   * one non-test caller, `decay.ts`, and it only lowers. Researched knowledge is
   * born at `DEFAULT_INITIAL_MASTERY` (256), below the 512 teach threshold, and
   * can never climb to it; every teachable instance descends from a god grant at
   * 1024 and is sliding back down. So breadth is not limited by what a species
   * can learn, it is limited by how long it can still pass on what it was given
   * — and that window runs from 32 ticks to 102 across the shipped six.
   *
   * `0` would mean a species that cannot teach a granted node even once.
   */
  readonly teachableWindowTicks: number;
  /**
   * Authored affinity entries naming a form no currently permitted cell uses.
   *
   * Zero is the healthy answer. A positive count is authored content that
   * cannot influence anything in this ruleset.
   */
  readonly inertAffinityEntries: number;
  /** Authored affinity entries that a permitted cell does use. */
  readonly liveAffinityEntries: number;
}

/**
 * The whole grid-reach measurement, plus the denominators it was taken against.
 *
 * The denominators travel with the counts because a coverage number read
 * against the wrong grid size is wrong in a way that still looks plausible.
 */
export interface SpeciesVersatilitySample {
  /** Cells in the full grid. `contracts.md` §2.2's seventy. */
  readonly gridCells: number;
  /** Cells the seeded ruleset permits. Twelve, in the v1 content. */
  readonly enabledCells: number;
  /** One entry per species the content declares, in content order. */
  readonly species: readonly SpeciesGridReach[];
}

/**
 * One species' **realised** occupancy of the grid at run end.
 *
 * The counterpart to {@link SpeciesGridReach}, and the difference is the whole
 * reason both exist. `SpeciesGridReach` is *capability*, derived from content:
 * which cells a species **could** staff given its `depthCeiling` and the
 * prerequisite closure. This is *outcome*, read off world state: which cells a
 * species **did** occupy, meaning at least one living mage of that species holds
 * a knowledge instance of a node in that cell, in a mind.
 *
 * `speciesGridVersatility`'s own falsification test is stated over exactly this
 * quantity — *"the predicted-staffable set must be a superset of the
 * observed-staffed set"* — and until this channel existed there was no observed
 * set to check it against.
 */
export interface SpeciesCellOccupancy {
  readonly speciesId: string;
  /**
   * Cells this species occupies, over the full seventy.
   *
   * A cell is occupied when a **living** mage of the species holds an instance
   * of one of its nodes at location kind `mind`. Library copies are excluded on
   * purpose: `contracts.md` §1.5 makes a shelved book exactly as magical as a
   * shelf, and a species whose only claim on a cell is a book somebody else can
   * read is not staffing it.
   */
  readonly occupiedCells: number;
  /** Of those, the ones the ruleset currently permits. */
  readonly occupiedEnabledCells: number;
  /** Living mages of this species, so a zero can be read as "none alive". */
  readonly livingMages: number;
  /** Distinct nodes held in a mind by a living mage of the species. */
  readonly nodesHeld: number;
  /**
   * **Which** cells, by interned cell id, ascending.
   *
   * Not a nicety. Merging `main` into `w53/practice` produced the campaign's
   * first mechanic-driven species divergence — two short-lived species collapse
   * and one goes extinct — and a count alone would have shown nothing, because
   * two species can hold twelve cells each and hold *different* twelve. The ids
   * are what make "these two species stopped overlapping" visible in a record
   * somebody reads later, without a second run.
   *
   * Ascending rather than in discovery order: a record whose array order
   * depends on entity-creation history is a record two machines disagree about.
   */
  readonly occupiedCellIds: readonly number[];
}

/**
 * Realised per-species grid occupancy for one run, with its denominators.
 *
 * Carries the denominators rather than letting the collector assume seventy and
 * twelve: `enabledCells` is whatever `permits()` accepted for the ruleset this
 * run actually played, and a hardcoded twelve would silently misreport every
 * run whose god forbade or dispensed anything.
 */
export interface SpeciesCellOccupancySample {
  /** Cells in the full grid. `contracts.md` §2.2's seventy. */
  readonly gridCells: number;
  /** Cells the ruleset permitted at the moment of the reading. */
  readonly enabledCells: number;
  /** The world tick the reading was taken at. */
  readonly worldTick: number;
  /** One entry per species the content declares, in content order. */
  readonly species: readonly SpeciesCellOccupancy[];
}

/** One species' roster at one world tick, for the loss-shock recovery curve. */
export interface RosterSample {
  readonly worldTick: number;
  /** Living mages per species, aligned with {@link RunTelemetry.speciesIds}. */
  readonly livingMagesBySpecies: readonly number[];
  /** Total populace per species, aligned the same way. */
  readonly populationBySpecies: readonly number[];
  /**
   * Distinct nodes held in a mind by at least one living mage of the species.
   *
   * The second half of the recovery question: a roster that returns to its
   * pre-shock headcount while the knowledge those mages carried does not come
   * back has not recovered, and a headcount series alone would report that it
   * had.
   */
  readonly nodesHeldBySpecies: readonly number[];
}

/**
 * A deterministic mage cull applied to one run, and the series either side of
 * it.
 *
 * **`undefined` on an ordinary run**, which is the whole point: a run that was
 * never shocked has no recovery time, and reporting `0` for it would read as
 * instantaneous recovery. The collector answers `no-observations`.
 */
export interface LossShockSample {
  /** The world tick the cull was applied at. */
  readonly shockTick: number;
  /** The fraction of living mages culled, at `fp` scale (1/1024). */
  readonly shockFractionFp: number;
  /** Living mages per species immediately before the cull. */
  readonly preShockBySpecies: readonly number[];
  /** Living mages per species immediately after it. */
  readonly postShockBySpecies: readonly number[];
  /** Distinct nodes held in a mind per species immediately before the cull. */
  readonly preShockNodesBySpecies: readonly number[];
  /** Roster samples, ascending by tick, spanning the shock. */
  readonly samples: readonly RosterSample[];
}

/**
 * What role assignment cost, over a run that made assignments and one that did
 * not.
 *
 * The paired shape is deliberate. A species' share of the roster falling over a
 * run is not evidence that role assignment caused it — long-lived species drift
 * for reasons that have nothing to do with the god — so the quantity with
 * meaning is the *difference* against a run that assigned nothing, and a
 * telemetry channel that carried only the treated side would invite the
 * single-arm reading.
 */
export interface RoleDemographySample {
  /** Roles assigned during the run, by role id, in the treated arm. */
  readonly assignmentsByRoleId: Readonly<Record<string, number>>;
  /** Mages lost to a lossy role's exposure, per species, in the treated arm. */
  readonly roleAttributedDeathsBySpecies: readonly number[];
  /** Roster share at run end, per species, `fp` scale, treated arm. */
  readonly finalShareFpBySpecies: readonly number[];
  /** The same shares from the paired control run, which assigned no roles. */
  readonly controlFinalShareFpBySpecies: readonly number[];
  /** Roster samples from the treated arm, ascending by tick. */
  readonly samples: readonly RosterSample[];
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
  /**
   * The content-derived grid reach of every species, or absent when the
   * executor did not supply it.
   *
   * Absent is `no-observations`, never `mechanic-absent`: species traits and the
   * seventy-cell grid have both shipped, so a missing sample is a run that did
   * not report one, not a mechanic that does not exist.
   */
  readonly speciesVersatility?: SpeciesVersatilitySample;
  /**
   * The realised per-species grid occupancy at run end, or absent when the
   * executor did not supply it.
   *
   * Absent is `no-observations` for the same reason {@link speciesVersatility}'s
   * is: species and the grid have both shipped, so a missing sample is a run
   * that did not report one rather than a mechanic that does not exist.
   */
  readonly speciesCellOccupancy?: SpeciesCellOccupancySample;
  /** The loss shock this run was subjected to, or absent on an unshocked run. */
  readonly lossShock?: LossShockSample;
  /** The role-assignment demography pair, or absent when the run made no assignments. */
  readonly roleDemography?: RoleDemographySample;
}

/**
 * The three fields every raid-scoped run collector reads, and no more.
 *
 * Named and narrowed rather than taking the whole {@link RunTelemetry}, because
 * a caller that can honestly answer *"were there raids, and how long did the run
 * last"* should not have to fabricate a species list and a tier-reach table to
 * ask a raid question. `packages/scenario`'s reference executor is exactly that
 * caller: it observes raids and world ticks, and inventing the other fields to
 * satisfy a signature would put fiction into a measurement path.
 *
 * Contravariance is what keeps this free: a function taking this slice still
 * satisfies {@link BalanceMetricDefinition.collectRun}'s `RunTelemetry`
 * parameter, so the §7 registry is unchanged and every existing caller passing
 * full telemetry still compiles.
 */
export type RaidRunSlice = Pick<RunTelemetry, 'mechanics' | 'raids' | 'ticksRun'>;

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
