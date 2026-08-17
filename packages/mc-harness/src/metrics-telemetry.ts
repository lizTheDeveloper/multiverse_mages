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
 * ## Why collectors read telemetry, not the world
 *
 * `contracts.md` §5 grants `mc-harness` one edge, to `agent-api`; the harness
 * reaches the simulation only through a caller-supplied {@link RunExecutor}. A
 * collector importing `@mm/state` to count instances would break that boundary
 * the way `design.md` warns — measuring what a trained agent cannot see through
 * the interface it plays on. So the executor observes, collectors compute. All
 * of it plain structured-cloneable: telemetry crosses a worker and recomputes
 * offline from the same inputs.
 *
 * ## Absence is declared, never inferred
 *
 * Half the mechanics §7 names do not exist at 0.5.0. A collector that saw an
 * empty raid list and concluded "raids are absent" would report
 * `mechanic-absent` forever, including where raids exist and were simply not
 * initiated — `balance-metrics/spec.md:51` requires `no-observations` there. So
 * {@link MechanicAvailability} is a declaration the build makes once and
 * {@link MECHANICS_AT_0_5_0} is its honest answer: one flag, one place, and the
 * flag is what a reviewer reads.
 */

import type { IllegalActionAccounting, TerminalStatus } from './session.js';
import type { RunCoordinates } from './seed.js';

/**
 * Which mechanics this build actually implements.
 *
 * Not "configured on" — *exists*. A flag on for an unwritten formula produces a
 * metric with a plausible number behind it: `design.md`'s single worst failure
 * available to a measurement layer.
 */
export interface MechanicAvailability {
  /**
   * Worship and favor regeneration, owned by `god-agency` (`contracts.md` §8
   * leaves it the formulas). `rules-world` is scanned for a write to `favor` or
   * `worship` and fails on one.
   */
  readonly worship: boolean;
  /** Raids, portals, and engagement-scale time, owned by `raid-engagement`. */
  readonly raidEngagement: boolean;
  /**
   * Prestige carried forward across runs, owned by `god-agency`. Separate from
   * {@link worship}: `prestigeAdvantage` needs the carry-forward *maximum*, a
   * different decision from whether favor regenerates at all.
   */
  readonly prestigeCarryForward: boolean;
}

/**
 * What this build has, as of 0.5.0.
 *
 * Two of three are `true`, and that flip is what `god-agency` bought:
 * `coordination`'s god systems compute worship from three saturated source
 * classes and regenerate favor from it every world tick, and `PRESTIGE_CAP` is
 * a loaded content constant with an asserted identity. So `worshipSnowball` and
 * `prestigeAdvantage` each have a mechanic to measure. Neither flag claims the
 * *sweep* produced a sample — the first still needs checkpoint samples, the
 * second mirrored pairs, and both report `no-observations` without them. Absent
 * is declared, empty is measured.
 *
 * `raidEngagement` stays `false`, checked against the tree: `raid-engagement`
 * has not landed, `rules-raid` is a skeleton, no run produces a raid. Four §7
 * metrics depend on it and all four correctly report `mechanic-absent`.
 *
 * **A default, not a fact about every run.** An executor reports its own
 * availability ({@link RunTelemetry.mechanics}); a caller running a world with
 * no god installed must say so rather than inherit these.
 */
export const MECHANICS_AT_0_5_0: MechanicAvailability = Object.freeze({
  worship: true,
  raidEngagement: false,
  prestigeCarryForward: true,
});

/**
 * A world with none of the three — what a toy or god-less executor reports.
 *
 * Named, not inlined: "all false" written three times is three places that can
 * drift from each other and from what they describe.
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
   * The three saturated worship source classes, separately; absent when the
   * build has no worship.
   *
   * `god-agency/tasks.md:84` wants a runaway attributable without a second
   * sweep. A Gini over 0.35 says inequality is growing and nothing about which
   * of mages, universities or populace produces it — and the three saturate
   * independently, so the answer changes what you retune. Beside the checkpoint
   * because it decomposes *this sample*; taken at another moment it would not
   * add up.
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
 * Plain numbers, deliberately not `rules-raid`'s own report type: `contracts.md`
 * §5 gives `mc-harness` one edge, to `agent-api`, and
 * `packages/mc-harness/test/unit/package-boundaries.test.ts` enforces it. The
 * executor flattens `RaidOutcome.actionEconomy` into this, so the harness never
 * learns what a `CombatantBrief` is — and a raid's telemetry survives a
 * structured clone to a worker.
 *
 * `source` is finer than `contracts.md` §3's primitive list in one place, and
 * that split is the point: `rules-raid` logs a summon's and a soldier
 * detachment's intrinsic attacks into `primitiveApplication` as `direct-damage`,
 * making "the bolt" and "the summoned servant" one row. A measure that cannot
 * tell a cast from a body cannot say what a combat *node* is worth.
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
   * The attacking side's mages: sent, brought home, and lost to the timer.
   *
   * Attacker-relative whichever side the observing universe was on, matching
   * {@link RaidObservation.combatSources}. Three counts and not a rate: a
   * withdrawal rule that never fires and one that fires and is survived produce
   * the same casualty total, and telling them apart is the whole reason these
   * are here.
   */
  readonly raidersFielded: number;
  readonly raidersWithdrawn: number;
  readonly raidersStranded: number;
  /** Nodes the attacking side carried out of the host universe. */
  readonly nodesTakenByAttacker: number;
  /** Mid-raid ruleset changes this god made, and the raid favor they cost. */
  readonly directivesApplied: number;
  readonly directiveFavorSpent: number;

  /**
   * Who won, and why it ended. `RAID_SIDE` and `RAID_END_REASON` values,
   * carried as the integers `rules-raid` computed rather than as names.
   *
   * Present because an observation that could not say who won made the two
   * halves of a withdrawal tuning indistinguishable: a threshold early enough
   * that every raider comes home is also early enough that none of them takes
   * anything, and without the victor the first reads as a success.
   */
  readonly victor: number;
  readonly reason: number;

  /**
   * Per-primitive action economy, ascending by `source`.
   *
   * Required, not optional, for the reason the module opens with: absence is
   * *declared* through {@link MechanicAvailability}. Optional would collapse
   * "this build has no action-economy instrumentation" and "this raid had no
   * combat" into one observation — the confusion the reason codes exist to end.
   */
  readonly combatSources: readonly RaidCombatSource[];
  /**
   * Combatant-ticks this raid contained: per combatant, entry to removal or
   * resolution. The denominator that turns denied combatant-ticks from a level
   * into a rate comparable across raid lengths.
   */
  readonly totalCombatantTicks: number;
  /** World-scale combatants removed — mages and detachments. Summons are not in this. */
  readonly worldScaleRemovals: number;
  /** Summons removed. Reported apart, and outside the primary scalar. */
  readonly summonsRemoved: number;
  /**
   * Denial channels `contracts.md` §3 permits that this engine has no code path
   * for — `displacement`, today.
   *
   * Carried into the metric's detail so a channel reading zero is visibly a
   * statement about the engine, not a measurement. Four metrics here have read
   * as healthy constants while structurally incapable of moving; a declared
   * list is how the fifth is avoided.
   */
  readonly unimplementedCombatChannels: readonly string[];
}

/**
 * One species' reach across the seventy-cell grid, as content alone determines
 * it.
 *
 * Supplied by the executor, not computed here — package boundary: `mc-harness`
 * depends on `@mm/agent-api` alone and cannot read `@mm/content`'s species
 * records or the node catalogue. The derivation lives with the content and
 * arrives as a measurement, like `speciesIds`.
 *
 * Every field is a **cell count**, never a fraction. The denominators (70 and
 * 12) are pinned constants of the metric; a pre-divided ratio would put the
 * arithmetic on the far side of the boundary from the definition naming it.
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
   * **The span a granted instance stays transmissible for, and nothing else.**
   *
   * When this metric was written it was the quantity that separated the species
   * outright, because nothing in the rules path ever *raised* mastery:
   * `setMastery` had one non-test caller, `decay.ts`, which only lowers, so
   * researched knowledge born at `DEFAULT_INITIAL_MASTERY` (256) could never
   * climb to the 512 threshold and every teachable instance descended from a
   * god grant at 1024 and was sliding back down.
   *
   * `rules-magic`'s `practice` (`w196/mastery-rises`) removed that monopoly: a
   * mage can now carry her own work up to `practiceCeiling(tier,
   * depthCeiling)`. So this number is no longer the whole story of what a
   * species can transmit — it is the decay half of it, measured from full
   * mastery, and it still runs from 32 ticks to 102 across the shipped six.
   * What it does **not** report is how far a species can climb on its own,
   * which is a function of `depthCeiling` against a node's tier.
   *
   * `0` means a species that cannot teach a granted node even once.
   */
  readonly teachableWindowTicks: number;
  /**
   * Authored affinity entries naming a form no permitted cell uses.
   *
   * Zero is healthy. A positive count is authored content that cannot influence
   * anything in this ruleset.
   */
  readonly inertAffinityEntries: number;
  /** Authored affinity entries that a permitted cell does use. */
  readonly liveAffinityEntries: number;
}

/**
 * The whole grid-reach measurement, plus the denominators it was taken against.
 *
 * Denominators travel with the counts: a coverage number read against the wrong
 * grid size is wrong in a way that still looks plausible.
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
 * Counterpart to {@link SpeciesGridReach}, and the contrast is why both exist.
 * That one is *capability* from content: which cells a species **could** staff
 * given its `depthCeiling` and the prerequisite closure. This is *outcome* from
 * world state: which it **did** occupy — at least one living mage of the species
 * holding an instance of a node in that cell, in a mind.
 *
 * `speciesGridVersatility`'s falsification test is stated over exactly this
 * (`metrics-registry.ts:488`); until this channel existed there was no observed
 * set to check it against.
 */
export interface SpeciesCellOccupancy {
  readonly speciesId: string;
  /**
   * Cells this species occupies, over the full seventy.
   *
   * Occupied = a **living** mage of the species holds an instance of one of its
   * nodes at location kind `mind`. Libraries excluded deliberately:
   * `contracts.md` §1.5 makes a shelved book exactly as magical as the shelf,
   * and a claim resting on a book anyone can read is not staffing.
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
   * first mechanic-driven species divergence — two short-lived species collapse,
   * one goes extinct — and a count alone would have shown nothing: two species
   * can hold twelve cells each and hold *different* twelve. The ids are what
   * make "these two stopped overlapping" visible in a record read later, with no
   * second run.
   *
   * Ascending, not discovery order: array order that depends on entity-creation
   * history is a record two machines disagree about.
   */
  readonly occupiedCellIds: readonly number[];
}

/**
 * Realised per-species grid occupancy for one run, with its denominators.
 *
 * Carries its denominators instead of letting the collector assume seventy and
 * twelve: `enabledCells` is whatever `permits()` accepted for the ruleset this
 * run played, and a hardcoded twelve silently misreports every run whose god
 * forbade or dispensed anything.
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
   * The second half of recovery: a roster back to its pre-shock headcount
   * without the knowledge those mages carried has not recovered, and a headcount
   * series alone would report that it had.
   */
  readonly nodesHeldBySpecies: readonly number[];
}

/**
 * A deterministic mage cull applied to one run, and the series either side of
 * it.
 *
 * **`undefined` on an ordinary run**: an unshocked run has no recovery time, and
 * `0` would read as instantaneous. The collector answers `no-observations`.
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
 * Paired deliberately. A species' share of the roster falling over a run is not
 * evidence that role assignment caused it — long-lived species drift for reasons
 * unrelated to the god — so the meaningful quantity is the *difference* against
 * a run that assigned nothing. A channel carrying only the treated side would
 * invite the single-arm reading.
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
   * Supplied, not pinned: `CLAUDE.md` puts species in validated data files. The
   * *shape* is pinned — six species × seven tiers = §7's 42 pairs — and the
   * collector fails loudly if the content disagrees with it.
   */
  readonly speciesIds: readonly string[];
  /** First reach per `(species, tier)`. Pairs never reached are simply absent. */
  readonly tierFirstReached: readonly TierReach[];
  readonly checkpoints: readonly CheckpointSample[];
  /**
   * Raids observed, or `undefined` when the build has no raid mechanic.
   *
   * `undefined` and `[]` are §7's two different answers: no mechanic versus no
   * sample. A collector must never collapse them.
   */
  readonly raids: readonly RaidObservation[] | undefined;
  readonly accounting: IllegalActionAccounting;
  /**
   * Submissions keyed by action id, when the session can supply them.
   *
   * §7's `illegalActionRate` must come from `agent-api`'s counters rather than
   * be recounted, and those counters are `submitted`, `rejected` and
   * `rejectedByAction` — rejections by action, not *submissions* by action. The
   * no-op share the spec wants reported separately needs the latter.
   *
   * Optional, and a recorded gap rather than a workaround: when the session
   * grows a submission tally the executor passes it through and the breakdown
   * appears. Until then the collector reports the two counters that exist and
   * omits the share — a second tally disagreeing with the session's would be
   * undiscoverable.
   */
  readonly submittedByActionId?: Readonly<Record<string, number>>;
  /**
   * The content-derived grid reach of every species, or absent when the
   * executor did not supply it.
   *
   * Absent is `no-observations`, never `mechanic-absent`: species traits and the
   * grid have both shipped, so a missing sample is a run that did not report
   * one.
   */
  readonly speciesVersatility?: SpeciesVersatilitySample;
  /**
   * The realised per-species grid occupancy at run end, or absent when the
   * executor did not supply it.
   *
   * Absent is `no-observations`, same reason as {@link speciesVersatility}'s.
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
 * Narrowed rather than taking the whole {@link RunTelemetry}, so the three
 * signatures in `metrics-collectors.ts` state their own input instead of
 * implying they read a species list and a tier-reach table they never touch.
 * The documented contract: a raid collector reports out of *"were there raids,
 * how many, and how long did the run last"* and nothing else, so widening one
 * is a visible signature change rather than a silent new read.
 *
 * It also keeps them callable by anything that can answer those three honestly
 * — a test harness holding a fixed raid log — not only by the reference
 * executor's full telemetry.
 *
 * Contravariance makes it free: a function taking this slice still satisfies
 * {@link BalanceMetricDefinition.collectRun}'s `RunTelemetry` parameter, so the
 * §7 registry is unchanged and every caller passing full telemetry compiles.
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
 * A pair is two of these sharing a `runSeed` with sides swapped, so a structural
 * side advantage feeds both arms equally. Both plays count — that is what
 * "mirrored" means; reporting only the first reintroduces the bias it cancels.
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
   * `winRateByPrimitive` reads it for a reason that is not bookkeeping: §7
   * reports `not-attributable` for `portal`, decided from the primitive's *name*
   * rather than its results, because a `portal` arm produces none. See
   * `ablation.ts`.
   */
  readonly ablatedPrimitiveId?: string | null;
  /**
   * The arm's mirrored ablation plays, in canonical run order.
   *
   * Shaped like {@link MirroredPlay}, deliberately not the same type: here the
   * side that matters is the *retaining* one, and a shared type would let a
   * caller hand prestige plays to the ablation collector and get a plausible
   * number. `ablation.ts` owns the type; this stays `unknown`-free so the record
   * survives a structured clone.
   */
  readonly ablationPlays?: readonly {
    readonly runSeed: number;
    readonly retainingSide: 0 | 1;
    readonly retainingWon: boolean;
  }[];
  /**
   * The maximum permitted prestige carry-forward, once `god-agency` defines it.
   *
   * `null` on purpose — nobody has chosen a magnitude and the collector refuses
   * to invent one. `balance-metrics/spec.md:226`.
   */
  readonly prestigeCarryForwardMax: number | null;
}
