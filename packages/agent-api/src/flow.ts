/*
 * Multiverse Mages — where the tick's material came from and where it went.
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
 * §4.4's **fifth** projection, beside `./knowledge-census.ts`, `./explain.ts`,
 * `./candidate-detail.ts` and `./academy.ts`.
 *
 * Every projection before this one is a reading of **state**: a level, a census,
 * a roster. `docs/design/economy-flow-models.md` §5.2 names what that leaves
 * out —
 *
 * > Every metric in the registry measures a level, a rate, or a distribution at
 * > a checkpoint. None reconciles flows.
 *
 * — and a level cannot tell material that was *spent* from material that was
 * *lost*. `coordination`'s `WorldStepReport` has computed a full per-tick flow
 * ledger for some time and thrown it away every tick: it is handed through a
 * closure into a single mutable `last`, deliberately outside state so that it
 * stays outside the snapshot hash, and nothing outside the analysis tools ever
 * called `lastReport()`. Neither recorder script called it at all.
 *
 * This is the wire. It carries the ledger to a client for the tick just
 * stepped, and nothing else changes: `OBSERVATION_SIZE` is still 400, the layout
 * digest is still `46182c35d829b205`, there is no world-schema revision and no
 * RNG draw. The ledger is derived per tick and belongs nowhere near the hashed
 * snapshot — `world-step.ts` makes that argument for the report as a whole, and
 * the reason is that *"two peers could 'desync' over a number no rule reads"*.
 *
 * ## Not on `PlayerState`, and that is a second reason rather than the same one
 *
 * `./entitlement.ts` requires every top-level `PlayerState` block to be one
 * `encodePlayerState` places, and `DECLARED_UNENCODED` cannot hold a
 * `PlayerState` field — so a block there would have to reach slots, which moves
 * the digest. `./candidate-detail.ts` and `./academy.ts` are off `PlayerState`
 * for exactly this, and so is this.
 *
 * It adds no `(component, field)` trait either, because it reads no component.
 * Every number here is derived within one tick and written to no store, so
 * `TRAIT_CLASSIFICATION` has nothing to classify and
 * `docs/design/observable-trait-inventory.md` does not move.
 *
 * ## The report arrives through the scenario, because §5 forbids the edge
 *
 * `agent-api` depends on `@mm/sim-core` and `@mm/state` and on nothing else —
 * `package.json` records why `@mm/content` is excluded, and the same argument
 * covers `@mm/coordination`, which owns the loop. So the report cannot be
 * imported; it is **handed in**, by the composition root that installed the
 * loop, through {@link Scenario.flowReport}. That is the shape `portalTargets`
 * already has, and its note states the principle: *"whoever built the world is
 * the only party that knows"*.
 *
 * {@link FlowReportSource} is therefore a **structural** declaration of the
 * fields this projection reads, not an import of `WorldStepReport`. The two are
 * held equivalent by the compiler at the wiring site: `reference-universe.ts`
 * assigns a `() => WorldStepReport | undefined` where a
 * `() => FlowReportSource | undefined` is expected, and a field renamed or
 * retyped in `coordination` fails to build there.
 *
 * ## Two faucets, and they are not the same kind of thing
 *
 * The map this feeds draws sources → stocks → sinks, and the two sources differ
 * in a way a single "produced" number hides:
 *
 * - **`land`** is what the populace produced. It is an **allocation**, not a
 *   discovery: `produceMaterials` computes one `base` off `MATERIALS_PER_LABORER`
 *   and splits it by subtraction into hands for hire and work on the ground, so
 *   `land.labor` is *taken out of* the same month that would otherwise have
 *   yielded food, stone and vellum. A reader who treats `labor` as new supply
 *   will conclude that raising `hireableShare` grows the economy; it moves it.
 * - **`applied`** is per mage, and is routed to a kind by the **form** of the
 *   node she cast. It is new supply.
 *
 * What is deliberately **not** here is that `base` itself, so the exact split
 * between the two halves of a laborer's month cannot be recovered from this
 * projection. `produceMaterials` returns only the basket, the land three pass
 * through `resourceYieldMultiplier` afterwards and `labor` through its own, so
 * `Σ land three` is not `worked` and no arithmetic here recovers it. Carrying it
 * would mean a new return value from a `rules-world` function on the rules path,
 * which is a change to the simulation to serve a drawing.
 *
 * ## The invariant, and why it is stated within one tick
 *
 * `closing - opening == faucet - sink`, per kind, exactly, with no tolerance —
 * every quantity is a fixed-point integer and an epsilon would hide the slow
 * one-unit leak the check exists to find.
 *
 * **Within one tick, and never across two frames.** The god's intervention
 * system runs *before* the world system in the same step and `deductMaterials`
 * spends the stocks for a priced action, so last tick's `closing` is not this
 * tick's `opening` on any tick the god paid for something. A client differencing
 * two frames would read those ticks as breaches and every other tick as sound,
 * which is a checker answering about the wrong input. {@link FlowLedger.opening}
 * exists precisely so the identity can be checked on one frame, which is the
 * only form of it that is true.
 *
 * {@link FlowLedger.breaches} is the ledger's own answer to the same question,
 * carried rather than recomputed: it is what `assertMaterialsConserved` throws
 * on, so the series and the error can never disagree about a tick.
 */

import { MATERIAL_STOCK } from '@mm/state';

/** Fixed point, scale 1/1024 — the same convention every other projection uses. */
type Fixed = number;

/** A quantity of each material kind, keyed by the stock's own column names. */
export type FlowAmounts = Readonly<Record<string, Fixed>>;

/** One kind whose stock did not move by exactly what the tick recorded. */
export interface FlowBreach {
  readonly kind: string;
  /** `closing - opening`. */
  readonly delta: Fixed;
  /** `faucet - sink`, which `delta` must equal. */
  readonly expected: Fixed;
  /** `delta - expected`. Positive is material from nowhere; negative is a leak. */
  readonly discrepancy: Fixed;
}

/** One claimant's flow: what it asked for, what it got, what it went without. */
export interface FlowClaimant {
  readonly claimant: string;
  /** The stock it is paid out of. Resolved by `coordination`, never re-derived here. */
  readonly kind: string;
  readonly owed: Fixed;
  readonly paid: Fixed;
  readonly shortfall: Fixed;
  /** `consumption` is the phase-9 priority walk; `reserved` was paid before it. */
  readonly settledIn: string;
}

/**
 * The shape of `coordination`'s `WorldStepReport` this projection reads.
 *
 * Structural rather than imported, for the §5 reason in the module note. Only
 * the flow fields are named: a field added to the report and not added here is
 * simply not carried, which is a visible absence rather than a silent one.
 */
export interface FlowReportSource {
  readonly worldTick: number;
  readonly openingByKind: FlowAmounts;
  readonly closingByKind: FlowAmounts;
  readonly faucetByKind: FlowAmounts;
  readonly sinkByKind: FlowAmounts;
  readonly producedByKind: FlowAmounts;
  readonly appliedByKind: FlowAmounts;
  readonly spilledByKind: FlowAmounts;
  readonly remainingByKind: FlowAmounts;
  readonly shortKinds: Readonly<Record<string, boolean>>;
  readonly conservationBreaches: readonly FlowBreach[];
  readonly claimantFlows: readonly FlowClaimant[];
  readonly castingOwed: number;
  readonly castingShortfall: number;
  readonly materialsScribed: number;
  readonly applicationRations: number;
  readonly magesApplying: number;
  readonly economicNodes: number;
  readonly buildRateSources: number;
  readonly subsistenceShortfallShare: number;
  readonly teachingFundedShare: number;
  readonly libraryUpkeepOwed: number;
  readonly libraryUpkeepPaid: number;
  readonly constructionStoneOwed: number;
  readonly constructionStonePaid: number;
}

/** Where a tick's material came from and where it went. All quantities `fp`. */
export interface FlowLedger {
  /** The tick this ledger is of. Always the tick just stepped — see {@link describeFlow}. */
  readonly worldTick: number;
  /** The stocks at the top of the world tick, after any god spend. */
  readonly opening: FlowAmounts;
  /** The stocks written at the end of it. */
  readonly closing: FlowAmounts;
  /** Everything created this tick, per kind: `land + applied`. */
  readonly faucet: FlowAmounts;
  /** Everything destroyed this tick, per kind: every claimant, plus the spill. */
  readonly sink: FlowAmounts;
  /** The populace's basket. An **allocation** — see the module note on `labor`. */
  readonly land: FlowAmounts;
  /** Applied magic's basket, routed to a kind by the node's form. New supply. */
  readonly applied: FlowAmounts;
  /** What each kind lost to the stock ceiling. On the sink side, and separately readable. */
  readonly spilled: FlowAmounts;
  /** Which kinds could not pay a claimant this tick. */
  readonly short: Readonly<Record<string, boolean>>;
  /** Every claimant, in priority order. */
  readonly claimants: readonly FlowClaimant[];
  /** Empty on a correct tick, and it is the ledger's own list rather than a re-derivation. */
  readonly breaches: readonly FlowBreach[];
  /**
   * The owed-versus-paid pairs whose *difference* is the interesting number, and
   * which are not claimant rows.
   *
   * `casting` is here as well as in {@link FlowLedger.claimants} because the two
   * are different questions: the row says what the priority walk paid, this says
   * what the work phase wanted before the shelf bounded it.
   */
  readonly pressure: {
    /** Vellum this tick's magical work asked for, and did not get. */
    readonly castingOwed: Fixed;
    readonly castingShortfall: Fixed;
    /** The share of subsistence demand the granary could not meet, `fp` of 1. */
    readonly subsistenceShortfallShare: Fixed;
    /** The share of teaching the `insight` stock funded. `fp` of 1 when fully funded. */
    readonly teachingFundedShare: Fixed;
    readonly libraryUpkeepOwed: Fixed;
    readonly libraryUpkeepPaid: Fixed;
    readonly constructionStoneOwed: Fixed;
    readonly constructionStonePaid: Fixed;
    /** Food the applying mages ate over and above the populace, folded into subsistence. */
    readonly applicationRations: Fixed;
    /** Vellum the scribes spent at the desk, before the priority walk ran. */
    readonly materialsScribed: Fixed;
  };
  /**
   * How many *things* fed the two faucets, which is not how much they made.
   *
   * A zero yield and no producer look identical in every amount above, and the
   * whole history of this seam is a bonus list nobody noticed was empty for
   * three releases. `economicNodes` and `buildRateSources` are the report's own
   * counters for exactly that; `magesApplying` is the applied faucet's.
   */
  readonly producers: {
    readonly magesApplying: number;
    readonly economicNodes: number;
    readonly buildRateSources: number;
  };
}

/**
 * The material kinds, from the component that owns the answer.
 *
 * Read off `MATERIAL_STOCK.fields` rather than transcribed, for the reason
 * `player-state.ts` gives where it does the same: *"a transcribed list is how a
 * kind added to the schema gets silently dropped from every client."* The order
 * is the column order, which is appended to and never reordered.
 */
export const FLOW_KINDS: readonly string[] = Object.freeze(Object.keys(MATERIAL_STOCK.fields));

/** A basket, rebuilt over the schema's own kinds so a missing column is a `0` here and not `undefined`. */
function amounts(source: FlowAmounts): FlowAmounts {
  const out: Record<string, Fixed> = {};
  for (const kind of FLOW_KINDS) out[kind] = source[kind] ?? 0;
  return out;
}

/** The same, for the boolean record. */
function flags(source: Readonly<Record<string, boolean>>): Readonly<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const kind of FLOW_KINDS) out[kind] = source[kind] === true;
  return out;
}

/**
 * The flow ledger for the tick just stepped, or `undefined`.
 *
 * `undefined` in two cases, and they are deliberately the same answer:
 *
 * - **Nothing has been stepped yet.** `lastReport()` is `undefined` before the
 *   first world tick, so the opening frame of every recording has no ledger.
 * - **The report is of a different tick.** The `last` closure in
 *   `defineWorldSimulation` is not cleared by `scenario.create()`, so after a
 *   `reset` it still holds the *previous episode's* final tick. Serving that as
 *   this episode's opening position would be a stale universe presented as the
 *   current one, which is worse than an absence because it draws.
 *
 * Both render as absent, and a client must render absent as absent —
 * `ui/shared/session.js` refuses to substitute `0`, because an empty granary is
 * a crisis and an unknown granary is not.
 *
 * @param report - The world loop's last report, from `Scenario.flowReport`.
 * @param worldTick - The tick the caller's state is on. The report is served
 * only if it is a report of that tick.
 */
export function describeFlow(
  report: FlowReportSource | undefined,
  worldTick: number,
): FlowLedger | undefined {
  if (report === undefined) return undefined;
  if (report.worldTick !== worldTick) return undefined;
  return {
    worldTick: report.worldTick,
    opening: amounts(report.openingByKind),
    closing: amounts(report.closingByKind),
    faucet: amounts(report.faucetByKind),
    sink: amounts(report.sinkByKind),
    land: amounts(report.producedByKind),
    applied: amounts(report.appliedByKind),
    spilled: amounts(report.spilledByKind),
    short: flags(report.shortKinds),
    claimants: report.claimantFlows.map((row) => ({ ...row })),
    breaches: report.conservationBreaches.map((row) => ({ ...row })),
    pressure: {
      castingOwed: report.castingOwed,
      castingShortfall: report.castingShortfall,
      subsistenceShortfallShare: report.subsistenceShortfallShare,
      teachingFundedShare: report.teachingFundedShare,
      libraryUpkeepOwed: report.libraryUpkeepOwed,
      libraryUpkeepPaid: report.libraryUpkeepPaid,
      constructionStoneOwed: report.constructionStoneOwed,
      constructionStonePaid: report.constructionStonePaid,
      applicationRations: report.applicationRations,
      materialsScribed: report.materialsScribed,
    },
    producers: {
      magesApplying: report.magesApplying,
      economicNodes: report.economicNodes,
      buildRateSources: report.buildRateSources,
    },
  };
}
