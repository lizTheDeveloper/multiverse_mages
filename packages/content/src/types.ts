/*
 * Multiverse Mages — content record and registry types.
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
 * Shapes for the eight content files of `docs/design/contracts.md` §2, plus the
 * interned registry the loader returns.
 *
 * Every `Fp` here is a fixed-point integer at scale 1024 (`contracts.md` §0).
 * The type is a bare `number` rather than an import from `@mm/sim-core` on
 * purpose: this package declares no dependencies at all, which is strictly
 * inside the "content depends on sim-core (types only)" rule of §5 and keeps
 * the loader loadable in any host without a build graph.
 */

/** A fixed-point value at scale 1024. `1024` means 1.0. */
export type Fp = number;

/** An interned content handle. `0` is the reserved null (`contracts.md` §0). */
export type ContentId = number;

/** The reserved null content id. Never assigned to a record. */
export const NULL_CONTENT_ID = 0;

/** Which content namespace an interned id belongs to. */
export type ContentNamespace =
  | 'technique'
  | 'form'
  | 'cell'
  | 'node'
  | 'species'
  | 'tradition'
  | 'primitive'
  | 'territory'
  | 'god-cost'
  | 'god-constant'
  | 'raid-constant'
  | 'autonomy-weight';

export interface TechniqueRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  readonly bit: number;
}

export interface FormRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  readonly bit: number;
}

/** A content-declared starting edict for a cell (`contracts.md` §1.1). */
export type EdictKind = 'dispensation' | 'interdiction';

export interface CellRecord {
  readonly id: string;
  readonly technique: string;
  readonly form: string;
  /** Display only. No rule may read these (`contracts.md` §2.2). */
  readonly classicalLabels: readonly string[];
  readonly nodes: readonly string[];
  readonly v1?: boolean;
  readonly edicts?: readonly EdictKind[];
}

export type EffectTarget = 'self' | 'single' | 'area' | 'side' | 'universe';

export interface EffectRecord {
  readonly primitive: string;
  readonly magnitude: Fp;
  readonly target: EffectTarget;
  readonly durationTicks: number;
}

export type TuningStatus = 'untuned' | 'tuned';

export interface NodeRecord {
  readonly id: string;
  readonly cell: string;
  readonly name: string;
  readonly gloss: string;
  readonly tier: number;
  readonly prerequisites: readonly string[];
  readonly researchCost: Fp;
  readonly teachCost: Fp;
  readonly scribeCost: Fp;
  readonly rediscoveryMultiplier: Fp;
  readonly effects: readonly EffectRecord[];
  readonly tuningStatus: TuningStatus;
}

export interface SpeciesRecord {
  readonly id: string;
  readonly name: string;
  readonly lifespanMonths: number;
  readonly lifespanVarianceMonths: number;
  readonly maturityMonths: number;
  readonly curiosity: Fp;
  readonly depthCeiling: number;
  readonly learnRate: Fp;
  readonly retention: Fp;
  readonly fertility: Fp;
  readonly scribeAffinity: Fp;
  readonly rediscoveryAffinity: Fp;
  readonly mageAptitude: Fp;
  readonly laborAffinity: Fp;
  readonly affinities: Readonly<Record<string, Fp>>;
  readonly personality?: {
    readonly curiosity?: Fp;
    readonly ambition?: Fp;
    readonly caution?: Fp;
  };
  readonly tuningStatus: TuningStatus;
}

export interface HookRecord {
  readonly kind: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface TraditionRecord {
  readonly id: string;
  readonly name: string;
  readonly hooks: {
    readonly acquire: HookRecord;
    readonly store: HookRecord;
    readonly cast: HookRecord;
    readonly cost: HookRecord;
  };
}

export type PrimitiveScale = 'world' | 'engagement' | 'both';

export type PrimitiveStacking =
  | 'additive'
  | 'additive-into-multiplier'
  | 'multiplicative-on-remainder'
  | 'max'
  | 'summed-then-single-ward'
  | 'presence';

export interface PrimitiveCap {
  readonly kind: 'none' | 'fp' | 'fraction-of-species-base' | 'count-per-side';
  readonly value?: number;
}

export interface PrimitiveRecord {
  readonly id: string;
  readonly unit: string;
  readonly scale: PrimitiveScale;
  readonly stacking: PrimitiveStacking;
  readonly cap: PrimitiveCap;
}

/**
 * One region of a universe, and the people it can hold.
 *
 * Territory is the **fixed** resource of `contracts.md` §2.7: nothing a
 * universe does in a run creates land. That is the whole reason the record
 * exists — carrying capacity is derived from it precisely because no in-run
 * process can grow it, which is not true of the materials stock that used to
 * carry that job alone.
 *
 * The numbers answer different questions and are deliberately not folded into
 * one: `capacityPerLandUnit` and `libraryUpkeepMultiplier` are what this *kind*
 * of country is like, and `landUnits` is how much of it this universe holds.
 *
 * **`landUnits` is now the founding endowment, not the live figure.** §2.7 said
 * this would happen — *"when universes stop being singletons […] `landUnits`
 * becomes state and this record keeps the habitability"* — and
 * `university-siting` is where it happened. The universe's actual holding lives
 * in the `territory-holding` component (`contracts.md` §1.1); this field is what
 * the first world tick materializes those rows from, and what a scenario that
 * seeds no rows of its own starts with.
 *
 * `libraryUpkeepMultiplier` is the second habitability number and it is authored
 * **against** the first on purpose. A country that feeds many people is not a
 * country that keeps parchment: the delta floods, the forest is damp, and the
 * highland waste is cold, dry and empty. Without an anti-correlated term, siting
 * a university would be a ranking rather than a decision, and the richest kind
 * would strictly dominate.
 */
export interface TerritoryRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  /**
   * How much of this kind of country the universe is **founded** holding. A
   * count, not `fp`. The live figure is the `territory-holding` component.
   */
  readonly landUnits: number;
  /** People one land unit of this region carries, `fp`. */
  readonly capacityPerLandUnit: Fp;
  /**
   * What a library standing in this kind of country pays to stay standing, `fp`
   * as a multiplier on the per-instance upkeep. `fp(1024)` is neutral; above it
   * the country eats books, below it the country keeps them.
   */
  readonly libraryUpkeepMultiplier: Fp;
  readonly tuningStatus: TuningStatus;
}

/**
 * What one action in `contracts.md` §4.2 costs the god, as data.
 *
 * The cost table ships as content alongside nodes and species so that retuning
 * a price is a content change the balance harness can sweep rather than a code
 * change. `actionId` is the §4.2 id and is the key every consumer looks the
 * record up by; `id` is the kebab-case name the diagnostics use, because a
 * failure that says only "action 13" makes the reader count rows.
 */
export interface GodCostRecord {
  readonly id: string;
  /** `contracts.md` §4.2's action id, `0..15`. Permanent, like the action itself. */
  readonly actionId: number;
  /** Base favor price, `fp`. Hysteresis and node tier scale it at resolution. */
  readonly favorCost: Fp;
  readonly gloss: string;
  readonly tuningStatus: TuningStatus;
}

/**
 * One named magnitude of the worship loop, the favor economy, the
 * interventions, ascension, stagnation, or prestige.
 *
 * The *set* of ids is structural — the rules read each by name and the loader
 * refuses a set that is missing one or carries an unknown one — while the
 * *values* are untuned placeholders. That split is the point: a sweep may move
 * every value in this file and may not invent a constant the rules do not read,
 * which is what stops a tuning pass from quietly adding a mechanic.
 */
export interface GodConstantRecord {
  readonly id: string;
  readonly value: number;
  /** What the number is: `fp`, world `ticks`, a `count`, `months`, or a worship `tier`. */
  readonly unit: 'fp' | 'ticks' | 'count' | 'months' | 'tier';
  readonly gloss: string;
  readonly tuningStatus: TuningStatus;
}

/**
 * One named magnitude an engagement is made of.
 *
 * The same shape as {@link GodConstantRecord}, and deliberately a separate
 * table rather than more rows in that one. `god-constant.json`'s loader rejects
 * any id its own required set does not name — correctly, because an unread
 * constant there is a knob that does nothing — so a raid magnitude added to it
 * would have to be added to `god-agency`'s contract as well, and the worship
 * loop would acquire an opinion about how long a portal holds.
 */
export interface RaidConstantRecord {
  readonly id: string;
  readonly value: number;
  /** What the number is: `fp`, a `raw` countdown integer, a `count`, or `ticks`. */
  readonly unit: 'fp' | 'raw' | 'count' | 'ticks';
  readonly gloss: string;
  readonly tuningStatus: TuningStatus;
}

/**
 * One named magnitude of a mage's choice of *which node to work on*.
 *
 * Two kinds of record share the table. A **scalar** — a term weight, a divisor,
 * a per-term bound — declares neither `role` nor `primitive` and is read by
 * name. A **role-appeal row** declares both, and prices one authored effect
 * primitive for one standing role, which is what makes vision §7's *"their
 * assigned standing role"* a number rather than an intention. See
 * `autonomy.ts` for the checks, including the one that stops a role
 * outvoting every other term at once.
 */
export interface AutonomyWeightRecord {
  readonly id: string;
  /** May be negative: a role can find a whole kind of magic distasteful. */
  readonly value: number;
  /** `fp` for a magnitude on the score's own axis, `raw` for a divisor. */
  readonly unit: 'fp' | 'raw';
  /** Present exactly on a role-appeal row. One of `contracts.md` §1.2's four. */
  readonly role?: 'researcher' | 'warden' | 'professor' | 'raider';
  /** Present exactly on a role-appeal row. An id from `primitive.json`. */
  readonly primitive?: string;
  readonly gloss: string;
  readonly tuningStatus: TuningStatus;
}

/** A record plus the integer it was interned to. */
export interface Interned<T> {
  readonly contentId: ContentId;
  readonly record: T;
}

/** How many records of each kind were loaded, for the loader's success report. */
export interface ContentCounts {
  readonly techniques: number;
  readonly forms: number;
  readonly cells: number;
  readonly v1Cells: number;
  readonly nodes: number;
  readonly species: number;
  readonly traditions: number;
  readonly primitives: number;
  readonly territories: number;
  readonly godCosts: number;
  readonly godConstants: number;
  readonly raidConstants: number;
  readonly autonomyWeights: number;
}

/**
 * The loaded, interned, integrity-checked content set.
 *
 * There is no partially-populated variant of this type. Either every record
 * loaded or {@link ContentValidationError} was thrown; a half-built registry is
 * the exact failure mode `contracts.md` §2 exists to prevent.
 */
export interface ContentRegistry {
  readonly contentRevision: string;
  readonly counts: ContentCounts;

  readonly techniques: readonly Interned<TechniqueRecord>[];
  readonly forms: readonly Interned<FormRecord>[];
  readonly cells: readonly Interned<CellRecord>[];
  readonly nodes: readonly Interned<NodeRecord>[];
  readonly species: readonly Interned<SpeciesRecord>[];
  readonly traditions: readonly Interned<TraditionRecord>[];
  readonly primitives: readonly Interned<PrimitiveRecord>[];
  readonly territories: readonly Interned<TerritoryRecord>[];
  readonly godCosts: readonly Interned<GodCostRecord>[];
  readonly godConstants: readonly Interned<GodConstantRecord>[];
  readonly raidConstants: readonly Interned<RaidConstantRecord>[];
  readonly autonomyWeights: readonly Interned<AutonomyWeightRecord>[];

  /** String id to interned integer, per namespace. */
  intern(namespace: ContentNamespace, id: string): ContentId;
  /** Interned integer back to string id, for diagnostics and content tooling. */
  idOf(namespace: ContentNamespace, contentId: ContentId): string | undefined;

  /** `(techniqueId, formId)` to cell id. Total over the full 5 × 14 grid. */
  cellAt(techniqueId: ContentId, formId: ContentId): ContentId;
  /** The record behind an interned cell id. */
  cell(contentId: ContentId): CellRecord | undefined;
  /** The record behind an interned node id. */
  node(contentId: ContentId): NodeRecord | undefined;
  /** What §4.2's action id costs the god, or `undefined` for an id the table lacks. */
  godCost(actionId: number): GodCostRecord | undefined;
  /**
   * A named `god-agency` magnitude.
   *
   * @throws Error for an id the table does not declare. The loader has already
   * checked the required set is present, so a miss here means a caller invented
   * a constant name — and a silent `0` would be a worship formula whose lag was
   * zero, which is a plausible-looking answer to a question nobody asked.
   */
  godConstant(id: string): number;
  /**
   * A named `raid-engagement` magnitude.
   *
   * @throws Error for an id the table does not declare, for the reason
   * {@link ContentRegistry.godConstant} does: the loader has already checked
   * the required set, so a miss means a caller invented a name, and a silent
   * `0` would be a cast range of zero or a portal that never decays.
   */
  raidConstant(id: string): number;
  /**
   * A named scalar weight of target selection.
   *
   * @throws Error for an id the table does not declare, for the reason
   * {@link ContentRegistry.godConstant} does. A silent `0` here would be a
   * divisor of zero or a term bound that removes a whole input from the score,
   * and a mage would go on choosing plausibly from an arithmetic that had
   * quietly stopped reading half of what shapes her.
   */
  autonomyWeight(id: string): number;
  /**
   * What one standing role thinks of one authored effect primitive, or `0` for
   * a pair the table declines to price.
   *
   * `0` is a real answer here and not a missing one — an unpriced pair is a
   * role with no opinion — which is why this reads as a total function while
   * {@link ContentRegistry.autonomyWeight} throws.
   */
  roleAppeal(role: string, primitiveId: string): number;
}
