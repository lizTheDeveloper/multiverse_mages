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

/**
 * A quantity of each material kind, `food`, `stone`, and `vellum` — the three
 * kinds the single undifferentiated materials stock split into. Which scale
 * the fields carry depends on the field that holds one: {@link FormRecord}'s
 * `yieldWeights` is a fixed-point *share* of a magnitude (bounded `0..1024`,
 * `contracts.md` §0), while {@link TerritoryRecord}'s `yieldPerLandUnit` is a
 * fixed-point *rate* with no such ceiling. One generic shape rather than two
 * near-identical ones, because the three kinds are the same three kinds
 * everywhere a mix of them is authored, and a reader who has seen one has seen
 * the field names of the other.
 */
export interface MaterialKindAmounts<T> {
  readonly food: T;
  readonly stone: T;
  readonly vellum: T;
}

/**
 * A fixed-point share, `0..1024`, of a `resource-yield` magnitude routed to
 * one material kind. `1024` is the whole magnitude; the three components of a
 * {@link FormRecord.yieldWeights} need not sum to `1024` and frequently do not
 * — see the doc comment there for why a form is not a partition.
 */
export type YieldWeightFp = Fp;

export interface FormRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  readonly bit: number;
  /**
   * How a `resource-yield` magnitude on a node in one of this form's cells is
   * routed to `food`, `stone`, and `vellum` — the three material kinds the
   * economy differentiated a single materials stock into. `sound-design.md`
   * §4.2, "Forms are materials", is the source of truth for what each form
   * physically *is* (Terram is "mass, gravel, stone"; Herbam is "fibre,
   * splinter"), and this field is that gloss made numeric: the weight a kind
   * carries is the share of the magnitude that becomes that kind of stuff.
   *
   * **Forms are deliberately not partitioned across kinds.** A cell's yield is
   * not required to sum its weights to `fp(1024)`, and several forms name more
   * than one kind at full or near-full weight: Animal is both meat (`food`)
   * and hide (`vellum`) at `512` apiece, and Herbam is both timber's fibre
   * (`food`, as forage and mast) and its parchment stock (`vellum`) the same
   * way. A form is what its magic touches, not a slot in a single ledger, and
   * collapsing Animal or Herbam to one kind would be inventing a constraint
   * §4.2 never states.
   *
   * **All-zero weights are not a placeholder; they are the correct value for a
   * form whose magic is not a material at all.** §4.2 says so by name for
   * three of these: Mentem "has no reverb… it is not in the world" — mind
   * magic touches no substance a granary or a shelf could hold. Vim "is the
   * carrier itself, unfiltered" — the medium magic runs on, not a stuff
   * conjured or moved. Umbra "is only tail… you never hear the thing, only the
   * room's response to it" — shadow is what magic does to a space, not
   * something taken out of one. Corpus, Imaginem, Fatum and Limen are zero for
   * the same shape of reason: body, image, fate and threshold are things
   * magic *does*, not things a mage stores on a shelf or eats. A schema that
   * required a nonzero weight somewhere would be asserting every one of these
   * forms secretly yields a material, which is false, so the floor here is
   * `0`, not `1`.
   */
  readonly yieldWeights: MaterialKindAmounts<YieldWeightFp>;
  readonly tuningStatus: TuningStatus;
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
 * The two numbers answer different questions and are deliberately not folded
 * into one: `capacityPerLandUnit` is what this *kind* of country is like, and
 * `landUnits` is how much of it this universe holds. When universes stop being
 * singletons — a raid that takes ground, a scenario that seeds a smaller world —
 * `landUnits` becomes state and this record keeps the habitability.
 */
export interface TerritoryRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  /** How much of this region the universe holds. A count, not `fp`. */
  readonly landUnits: number;
  /** People one land unit of this region carries, `fp`. */
  readonly capacityPerLandUnit: Fp;
  /**
   * The mix of `food`, `stone`, and `vellum` one land unit of this territory
   * produces, `fp` per kind.
   *
   * A territory's yield and a form's {@link FormRecord.yieldWeights} answer
   * different questions and are deliberately not the same field: a form says
   * what a *technique acting on it* produces — Terram's magic makes stone
   * because stone is what Terram is — while a territory says what the *land
   * itself* is like independent of any magic worked on it. The river delta
   * outproduces the highland waste in every kind at once because it is simply
   * richer ground, which is a fact about geography, not about which of the
   * fourteen forms a mage happened to cast.
   */
  readonly yieldPerLandUnit: MaterialKindAmounts<Fp>;
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
