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
  | 'autonomy-weight'
  | 'track'
  | 'ritual';

export interface TechniqueRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  readonly bit: number;
}

/**
 * ## There is deliberately no named `{ food, stone, vellum }` type in this file
 *
 * Both `yieldWeights` and `yieldPerLandUnit` below are written out inline, which
 * looks like a missed abstraction and is not. A named triple here would be a
 * second declaration of `@mm/state`'s `MaterialStockRecord`, and
 * `schema-duplication.test.ts` refuses one by name: *"two declarations of one §1
 * entity drift, and the field the copy adds is one the component layout never
 * serializes."* Sharing the state type instead is not available either —
 * `contracts.md` §5 makes `content` a leaf, and an edge from here to `state`
 * would invert the dependency graph.
 *
 * The refusal is also right on the merits. These are not the same quantity
 * wearing two hats. A **stock** is state and is spent; a **weight** is content
 * and is read. They share three field names because they are about the same
 * three kinds, which is exactly the coincidence a shared type would harden into
 * a claim that they are one thing.
 *
 * The two here are not even the same *scale*: {@link FormRecord.yieldWeights} is
 * a fixed-point share of a magnitude, bounded `0..1024`, while
 * {@link TerritoryRecord.yieldPerLandUnit} is a fixed-point rate with no such
 * ceiling. The schema enforces each bound separately.
 */

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
  readonly yieldWeights: { readonly food: Fp; readonly stone: Fp; readonly vellum: Fp };
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

/**
 * The technique's envelope, made mechanical (`sound-design.md` §4.1,
 * `compositional-content.md` §3.3). `create` (Creo), `reveal` (Intellego),
 * `transform` (Muto), `remove` (Perdo), `control` (Rego) — one mode per
 * technique, and `contracts.md` §3.1 states the fold each contributes.
 */
export type EffectMode = 'create' | 'reveal' | 'transform' | 'remove' | 'control';

/**
 * When an effect contributes at all. Absent on the record means `always`, the
 * default that every effect authored before this change already means.
 *
 * `revealed` is the latent half of Intellego (`compositional-content.md`
 * §3.4): the effect contributes only while a held `reveal` effect names it.
 * `holds-cell` contributes only while the holder has at least `minNodes` of
 * the named cell — value that depends on what else a mage holds.
 */
export type EffectCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'revealed' }
  | { readonly kind: 'holds-cell'; readonly cell: string; readonly minNodes: number };

/**
 * What a `reveal` effect makes audible (`compositional-content.md` §3.3). At
 * least one of the two is present; both means the conjunction — a latent
 * effect matches only when its cell and its primitive both match.
 */
export interface RevealTarget {
  readonly cell?: string;
  readonly primitive?: string;
}

/**
 * Rego's gate: a floor is reliability bought, a ceiling is upside sold
 * (`compositional-content.md` §3.3, `contracts.md` §3.1). At least one of the
 * two is present.
 */
export interface EffectControl {
  readonly floor?: Fp;
  readonly ceiling?: Fp;
}

export interface EffectRecord {
  readonly primitive: string;
  readonly magnitude: Fp;
  readonly target: EffectTarget;
  readonly durationTicks: number;
  /** The technique's envelope. Required — every effect has one mode. */
  readonly mode: EffectMode;
  readonly gloss?: string;
  readonly when?: EffectCondition;
  /** Present exactly on a `reveal` effect. */
  readonly reveals?: RevealTarget;
  /** Present exactly on a `control` effect. */
  readonly control?: EffectControl;
  /** Present exactly on a `transform` effect: the primitive magnitude flows to. */
  readonly transformTo?: string;
}

export type TuningStatus = 'untuned' | 'tuned';

/**
 * Whether a node's knowledge survives being written down.
 *
 * `episteme` is a result — a procedure, a derivation, a name, a formula — that a
 * competent stranger can reproduce from a correct text. `metis` is the
 * practitioner's knowledge that codification destroys: reading a situation,
 * judging a moment, telling two things apart that a text can only name.
 *
 * Authored, never derived. Tier is not the axis: a tier-1 knack can be pure
 * mētis and a tier-5 result perfectly writable. The reasoning behind every call
 * in the shipped set is in `docs/design/metis-authoring.md`.
 */
export type KnowledgeKind = 'episteme' | 'metis';

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
  readonly knowledgeKind: KnowledgeKind;
  readonly tuningStatus: TuningStatus;
  /** The named route through the grid this node belongs to, if any (`compositional-content.md` §3.1). */
  readonly track?: string;
  /**
   * Nodes this one may never be held alongside, **in one mind**
   * (`compositional-content.md` §3.2). Absent means empty. Always symmetric —
   * unlike a track exclusion, a node-level antirequisite has no field to
   * declare a one-way reason, and every one authored in v1 is an
   * opposed-in-kind pair. Declared on one side and enforced on both; see
   * {@link ContentRegistry.antirequisitesOf} and `normaliseAntirequisites` in
   * `load.ts`.
   */
  readonly antirequisites?: readonly string[];
}

/**
 * One track a mage on this one may not also walk
 * (`compositional-content.md` §3.1, `contracts.md` §2.12).
 *
 * Exclusion binds **one mind, never the universe**: a universe may hold every
 * school it can reach, accumulated across many mages over many lifetimes,
 * while an individual mage may not. `threshold` is how many nodes of the
 * excluded track one mind may hold before this track closes to it — `1` shuts
 * the door on first contact.
 *
 * `symmetric` is not a free choice — it follows from the reason a track
 * excludes another, which is why `gloss` is required beside it. Two things
 * opposed *in kind* (light and dark, making and unmaking) exclude each other
 * mutually; a one-way reason gives a one-way lock. `load.ts`'s
 * `normaliseTrackExclusions` honours whatever the data declares rather than
 * imposing a direction of its own.
 */
export interface TrackExclusion {
  readonly track: string;
  readonly threshold: number;
  readonly symmetric: boolean;
  readonly gloss: string;
}

/** A named path through the grid (`compositional-content.md` §3.1, `contracts.md` §2.12). */
export interface TrackRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  readonly excludes: readonly TrackExclusion[];
  readonly tuningStatus: TuningStatus;
}

/**
 * One caster's place in a ritual (`contracts.md` §2.13).
 *
 * `track` names a `track.json` record, never a node — a role is a *commitment*,
 * not an inventory check, which is what lets the loader prove the ritual is
 * uncastable by one mage from the track graph alone, before any mage exists to
 * check. `minNodes` is how many distinct nodes of that track the role demands;
 * `load.ts`'s `ritual-castable-by-one` additionally requires it be at least the
 * threshold at which this track's declared exclusions close the *other* roles'
 * tracks, because a role satisfiable below that threshold is a role one mage
 * could fill alongside another before either door has shut.
 */
export interface RitualRole {
  readonly track: string;
  readonly minNodes: number;
  readonly gloss: string;
}

/**
 * A spell that requires more than one mage to cast (`compositional-content.md`,
 * `contracts.md` §2.13).
 *
 * **No ritual state is stored anywhere.** `roles` and `effects` are the whole
 * record; whether a ritual is *available* is derived at cast time from the
 * living, affiliated mages of one university, and there is nothing here for a
 * caster's death to leave behind to clean up. `@mm/rules-magic`'s
 * `rituals/` module is what performs that derivation; this record only
 * declares what a valid combination of casters looks like.
 *
 * `roles` must name at least two mutually exclusive tracks — the loader's
 * `ritual-castable-by-one` refuses a ritual whose roles are not, because a
 * ritual any one mage could eventually satisfy alone is an expensive spell
 * wearing this shape for no reason. `effects` reuses `node.json`'s effect
 * shape for `primitive`, `magnitude`, `target`, `durationTicks` and `mode` —
 * `gloss` is required here rather than optional, since a ritual has no cell or
 * `v1` flag to make it conditional the way `effect-gloss-missing` does for a
 * node. It deliberately omits `when`, `reveals`, `control` and `transformTo`:
 * v1 ships only `create`/`remove` rituals, and the mode-payload coherence
 * checks (`mode-payload-missing`, `mode-technique-incoherent`) are tied to a
 * node's cell and technique, which a ritual does not have. A ritual's effects
 * are authored but not wired into cast resolution — see §2.13's note, the same
 * gap `compositional-content.md` §6a records for `gatherEffects`.
 */
export interface RitualRecord {
  readonly id: string;
  readonly name: string;
  readonly gloss: string;
  readonly roles: readonly RitualRole[];
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
  readonly yieldPerLandUnit: { readonly food: Fp; readonly stone: Fp; readonly vellum: Fp };
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
  readonly tracks: number;
  /**
   * Required, like every count above it.
   *
   * It shipped optional for one afternoon, so that the tree's single hand-built
   * `ContentRegistry` literal (`packages/rules-raid/test/unit/mode-fixture.ts`)
   * kept compiling while rituals landed in a package its author was not
   * allowed to edit. That is a scheduling reason, not a design one, and an
   * optional count is a question a reader has to answer twice — was it `0`
   * because nothing loaded, or because nobody asked? `tracks` set the
   * precedent when it landed required and the fixture was updated with it.
   */
  readonly rituals: number;
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
  readonly tracks: readonly Interned<TrackRecord>[];
  /** Required, like every other content collection. See {@link ContentCounts.rituals}. */
  readonly rituals?: readonly Interned<RitualRecord>[];

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
  /**
   * Every node this one may never be held alongside, **in one mind**
   * (`compositional-content.md` §3.2) — the symmetric closure of
   * `node.antirequisites`. A node declaring the relation on only one side is
   * enough; both sides is not an error. Always symmetric, unlike a track
   * exclusion — see `normaliseAntirequisites` in `load.ts`.
   */
  antirequisitesOf(nodeId: string): ReadonlySet<string>;
}
