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
 * Shapes for the seven content files of `docs/design/contracts.md` §2, plus the
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

/** Which of the seven content namespaces an interned id belongs to. */
export type ContentNamespace =
  | 'technique'
  | 'form'
  | 'cell'
  | 'node'
  | 'species'
  | 'tradition'
  | 'primitive';

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
}
