/*
 * Multiverse Mages — a minimal, load-bypassing content fixture for effect-mode
 * dispatch tests.
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
 * W20's effect-mode tests (`effect-modes.test.ts`) need a `ContentRegistry`
 * and a `MagicGrid` carrying nodes whose `mode` is exactly what each test
 * wants — a bare `control` effect, a `remove`-mode `portal` effect, a
 * `transform` splitting one primitive into another. `packages/content`'s
 * `node.json` is mid-migration to `mode` (`docs/design/compositional-
 * content.md` §3.3) and does not validate yet — `loadContent
 * (shippedContentSource())` currently throws — and even once it does, the
 * shipped grid would not give these tests the specific, adversarial
 * combinations they need to prove the bug is closed.
 *
 * So this fixture never calls `loadContent`. `MagicGrid.from()` (`packages/
 * rules-magic/src/grid.ts`) only asks for `GridContent` — `techniques`,
 * `forms`, `cells`, `nodes`, each `Interned<T>[]` — and `CastArbiter`/
 * `portalGate` only ever call `registry.node()` and iterate
 * `registry.primitives`. Building both by hand, directly against `@mm/
 * content`'s types, skips every schema and graph-phase check `loadContent`
 * runs (the v1-rectangle shape, cost-curve variation, mode/technique
 * coherence, …) — none of which this package enforces or needs to at
 * runtime; they are `packages/content`'s authoring contract, not
 * `rules-raid`'s. What the fixture must still get right is *this* package's
 * own contract: an `EffectRecord` shaped exactly as `docs/design/
 * compositional-content.md` §3.3/§3.4 describes.
 */

import type {
  CellRecord,
  ContentRegistry,
  EffectRecord,
  FormRecord,
  Interned,
  NodeRecord,
  PrimitiveRecord,
  TechniqueRecord,
} from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { cellIdAt } from '@mm/state';
import { MagicGrid } from '@mm/rules-magic';

/** The five techniques, bit-assigned exactly as `contracts.md` §2.1 fixes them. */
const TECHNIQUE_BIT = { creo: 0, intellego: 1, muto: 2, perdo: 3, rego: 4 } as const;
export type TechniqueName = keyof typeof TECHNIQUE_BIT;

/**
 * Three placeholder forms, named for the ones the docs use in worked
 * examples (`limen` — the portal form — foremost among them). The other
 * eleven are filled in generically: `MagicGrid.from` requires exactly 14,
 * dense, and nothing here reads their names.
 */
const NAMED_FORM_BIT = { limen: 0, terram: 1, nomen: 2 } as const;
export type FormName = keyof typeof NAMED_FORM_BIT;

const TECHNIQUES: readonly TechniqueRecord[] = (
  Object.entries(TECHNIQUE_BIT) as [TechniqueName, number][]
).map(([id, bit]) => ({ id, name: id, gloss: 'fixture technique', bit }));

const FORMS: readonly FormRecord[] = Array.from({ length: 14 }, (_, bit) => {
  const named = (Object.entries(NAMED_FORM_BIT) as [FormName, number][]).find(
    ([, namedBit]) => namedBit === bit,
  );
  const id = named?.[0] ?? `form-${String(bit)}`;
  return {
    id,
    name: id,
    gloss: 'fixture form',
    bit,
    yieldWeights: { food: 341, stone: 341, vellum: 342 },
    tuningStatus: 'untuned',
  };
});

function internedTechniques(): Interned<TechniqueRecord>[] {
  return TECHNIQUES.map((record) => ({ contentId: record.bit + 1, record }));
}

function internedForms(): Interned<FormRecord>[] {
  return FORMS.map((record) => ({ contentId: record.bit + 1, record }));
}

/** The interned cell id for a `(technique, form)` pair, for building a `CellRecord` or addressing one. */
export function cellIdOf(technique: TechniqueName, form: FormName): number {
  return cellIdAt(TECHNIQUE_BIT[technique], NAMED_FORM_BIT[form]);
}

/**
 * The eight `contracts.md` §3 primitives `rules-raid` reads, copied verbatim
 * from `packages/content/data/primitive.json` (units, stacking rules and caps
 * unchanged) so a test exercises the real stacking arithmetic rather than a
 * simplified stand-in. The nine world-scale primitives are omitted: nothing
 * in this package ever asks the registry for them.
 */
const PRIMITIVES: readonly PrimitiveRecord[] = [
  {
    id: 'direct-damage',
    unit: 'hp-per-application',
    scale: 'engagement',
    stacking: 'summed-then-single-ward',
    cap: { kind: 'none' },
  },
  {
    id: 'ward',
    unit: 'fraction-of-damage-prevented',
    scale: 'engagement',
    stacking: 'multiplicative-on-remainder',
    cap: { kind: 'fp', value: 922 },
  },
  {
    id: 'area-denial',
    unit: 'hp-per-engagement-tick-within-radius-fp-metres',
    scale: 'engagement',
    stacking: 'additive',
    cap: { kind: 'none' },
  },
  {
    id: 'blink',
    unit: 'fp-metres-of-instantaneous-displacement',
    scale: 'engagement',
    stacking: 'max',
    cap: { kind: 'none' },
  },
  {
    id: 'summon',
    unit: 'count-of-combatants-from-a-template',
    scale: 'engagement',
    stacking: 'additive',
    cap: { kind: 'count-per-side', value: 8 },
  },
  {
    id: 'concealment',
    unit: 'fp-probability-of-evading-targeting-or-detection',
    scale: 'both',
    stacking: 'multiplicative-on-remainder',
    cap: { kind: 'fp', value: 870 },
  },
  {
    id: 'knowledge-steal',
    unit: 'fp-probability-per-attempt-of-copying-an-instance',
    scale: 'engagement',
    stacking: 'max',
    cap: { kind: 'none' },
  },
  {
    id: 'portal',
    unit: 'boolean-gate-enables-raid-initiation',
    scale: 'world',
    stacking: 'presence',
    cap: { kind: 'none' },
  },
];

function internedPrimitives(): Interned<PrimitiveRecord>[] {
  return PRIMITIVES.map((record, index) => ({ contentId: index + 1, record }));
}

/** A node, specified with just what these tests vary. Everything else defaults. */
export interface NodeSpec {
  readonly id: string;
  readonly technique: TechniqueName;
  readonly form: FormName;
  readonly effects: readonly EffectRecord[];
  readonly tier?: number;
}

/** One `EffectRecord`, with every field but the ones a test cares about defaulted. */
export function effect(spec: {
  readonly primitive: string;
  readonly mode: EffectRecord['mode'];
  readonly magnitude?: Fixed;
  readonly target?: EffectRecord['target'];
  readonly durationTicks?: number;
  readonly when?: EffectRecord['when'];
  readonly control?: EffectRecord['control'];
  readonly transformTo?: string;
  readonly reveals?: EffectRecord['reveals'];
}): EffectRecord {
  return {
    primitive: spec.primitive,
    mode: spec.mode,
    magnitude: spec.magnitude ?? 1024,
    target: spec.target ?? 'self',
    durationTicks: spec.durationTicks ?? 0,
    ...(spec.when === undefined ? {} : { when: spec.when }),
    ...(spec.control === undefined ? {} : { control: spec.control }),
    ...(spec.transformTo === undefined ? {} : { transformTo: spec.transformTo }),
    ...(spec.reveals === undefined ? {} : { reveals: spec.reveals }),
  };
}

/** A `ContentRegistry` and the `MagicGrid` built over it, from a handful of hand-specified nodes. */
export interface ModeFixture {
  readonly registry: ContentRegistry;
  readonly grid: MagicGrid;
  /** The interned node id assigned to each spec, in order. */
  readonly nodeIds: readonly number[];
}

/** Every `ContentRegistry` member this fixture does not implement, because nothing under test calls it. */
function unimplemented(member: string): () => never {
  return () => {
    throw new Error(`mode-fixture.ts's ContentRegistry does not implement "${member}" — nothing under test should call it`);
  };
}

export function buildModeFixture(specs: readonly NodeSpec[]): ModeFixture {
  const cellsById = new Map<string, CellRecord>();
  const cellRecordFor = (technique: TechniqueName, form: FormName): CellRecord => {
    const id = `${technique}-${form}`;
    const existing = cellsById.get(id);
    if (existing !== undefined) return existing;
    const record: CellRecord = { id, technique, form, classicalLabels: [], nodes: [] };
    cellsById.set(id, record);
    return record;
  };

  const nodesById = new Map<number, NodeRecord>();
  const nodeIds: number[] = [];
  const internedNodes: Interned<NodeRecord>[] = [];

  specs.forEach((spec, index) => {
    const cell = cellRecordFor(spec.technique, spec.form);
    const record: NodeRecord = {
      id: spec.id,
      cell: cell.id,
      name: spec.id,
      gloss: 'fixture node',
      tier: spec.tier ?? 1,
      prerequisites: [],
      researchCost: 1024,
      teachCost: 512,
      scribeCost: 1024,
      rediscoveryMultiplier: 5632,
      effects: spec.effects,
      knowledgeKind: 'episteme',
      tuningStatus: 'untuned',
    };
    const contentId = index + 1;
    nodesById.set(contentId, record);
    nodeIds.push(contentId);
    internedNodes.push({
      contentId,
      record: { ...record, cell: `${spec.technique}-${spec.form}` },
    });
  });

  const internedCells: Interned<CellRecord>[] = [...cellsById.values()].map((record) => ({
    contentId: cellIdOf(record.technique as TechniqueName, record.form as FormName),
    record,
  }));

  const registry: ContentRegistry = {
    contentRevision: 'a'.repeat(32),
    counts: {
      techniques: TECHNIQUES.length,
      forms: FORMS.length,
      cells: internedCells.length,
      v1Cells: 0,
      nodes: internedNodes.length,
      species: 0,
      traditions: 0,
      primitives: PRIMITIVES.length,
      territories: 0,
      godCosts: 0,
      godConstants: 0,
      raidConstants: 0,
      autonomyWeights: 0,
      tracks: 0,
      rituals: 0,
    },
    techniques: internedTechniques(),
    forms: internedForms(),
    cells: internedCells,
    nodes: internedNodes,
    species: [],
    traditions: [],
    primitives: internedPrimitives(),
    territories: [],
    godCosts: [],
    godConstants: [],
    raidConstants: [],
    autonomyWeights: [],
    tracks: [],
    rituals: [],
    intern: unimplemented('intern'),
    idOf: unimplemented('idOf'),
    cellAt: unimplemented('cellAt'),
    cell: unimplemented('cell'),
    node: (contentId) => nodesById.get(contentId),
    godCost: unimplemented('godCost'),
    godConstant: unimplemented('godConstant'),
    raidConstant: unimplemented('raidConstant'),
    autonomyWeight: unimplemented('autonomyWeight'),
    roleAppeal: unimplemented('roleAppeal'),
    antirequisitesOf: unimplemented('antirequisitesOf'),
  };

  return { registry, grid: MagicGrid.from(registry), nodeIds };
}
