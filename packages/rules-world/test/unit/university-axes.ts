/*
 * Multiverse Mages — the axes a university is swept over, as data.
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
 * ## Every axis in this file is a table, and a new axis is a row
 *
 * The point of writing them down here rather than as loops in the sweep is the
 * one `CLAUDE.md` makes about content: *"grid cells, nodes, species,
 * primitives, traditions — lives in validated data files, never hardcoded."*
 * A sweep whose axes are nested `for` loops is a sweep where adding "what
 * happens with two libraries" is a code change in three places; here it is a
 * row, and {@link ALL_AXES} picks it up for free.
 *
 * The values themselves are **read off the shipped content** wherever content
 * has an opinion — the species list is `species.json`'s six, the roles are
 * `MAGE_ROLE`, the occupations are `OCCUPATION`. Inventing a seventh species
 * for a test is how a sweep ends up measuring a universe nobody ships.
 *
 * ## What is deliberately *not* an axis
 *
 * `depthCeiling`, `laborAffinity`, `scribeAffinity` and `curiosity` are not
 * axes. They are **consequences** of the species mix, and making them
 * independent axes would sweep species combinations that no content file can
 * produce — and then report a finding about them.
 */

import { MAGE_ROLE, OCCUPATION } from '@mm/state';
import type { MageRoleValue, OccupationValue } from '@mm/state';

/** One point on one axis: a stable id, and the value the sweep applies. */
export interface AxisPoint<T> {
  /** Appears in the run key and therefore in every golden. Never renamed lightly. */
  readonly id: string;
  readonly value: T;
}

/** A named axis. `ALL_AXES` crosses these; the CLI selects among them. */
export interface Axis<T> {
  readonly name: string;
  readonly points: readonly AxisPoint<T>[];
}

// ---------------------------------------------------------------------------
// 1. Species mixes
// ---------------------------------------------------------------------------

/**
 * The six shipped species, in `species.json` order.
 *
 * Order is load-bearing: it fixes which subset a mix id names, so a golden
 * recorded today still means the same universe after a seventh species is
 * added — the new one appends, and `human+elf` is still `human+elf`.
 */
export const SHIPPED_SPECIES: readonly string[] = [
  'human',
  'elf',
  'dwarf',
  'draconic',
  'gnome',
  'orc',
];

/** How many species share one institution. The ask names one through four. */
export const MIX_SIZES: readonly number[] = [1, 2, 3, 4];

/** Every k-subset of `items`, in lexicographic index order. */
function subsets<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const out: T[][] = [];
  const indices = Array.from({ length: size }, (_, index) => index);
  for (;;) {
    out.push(indices.map((index) => items[index] as T));
    let cursor = size - 1;
    while (cursor >= 0 && (indices[cursor] as number) === items.length - size + cursor) cursor -= 1;
    if (cursor < 0) return out;
    indices[cursor] = (indices[cursor] as number) + 1;
    for (let next = cursor + 1; next < size; next += 1) {
      indices[next] = (indices[next - 1] as number) + 1;
    }
  }
}

/**
 * Every mix of one, two, three or four of the six shipped species.
 *
 * `C(6,1) + C(6,2) + C(6,3) + C(6,4)` = 6 + 15 + 20 + 15 = **56**. Exhaustive,
 * not sampled — this is the axis the ask names explicitly and it is small
 * enough to take whole.
 */
export const SPECIES_MIXES: Axis<readonly string[]> = {
  name: 'speciesMix',
  points: MIX_SIZES.flatMap((size) =>
    subsets(SHIPPED_SPECIES, size).map((mix) => ({ id: mix.join('+'), value: mix })),
  ),
};

// ---------------------------------------------------------------------------
// 2. Staff size and role mix
// ---------------------------------------------------------------------------

/**
 * Mages resident at the institution.
 *
 * Zero is in the list on purpose: a university with a library and no scholars
 * is the state a raided universe is left in, and its profile is the one thing
 * about it that must still answer.
 */
export const STAFF_SIZES: Axis<number> = {
  name: 'staffSize',
  points: [0, 1, 2, 4, 8, 16].map((count) => ({ id: String(count), value: count })),
};

/**
 * How the resident mages divide across `MAGE_ROLE`, as weights.
 *
 * Weights rather than counts so one row applies at every {@link STAFF_SIZES}
 * point. The allocator is largest-remainder in `MAGE_ROLE` order, which is
 * deterministic and gives the same answer for the same pair.
 */
export type RoleWeights = Readonly<Record<MageRoleValue, number>>;

function weights(researcher: number, warden: number, professor: number, raider: number): RoleWeights {
  return {
    [MAGE_ROLE.researcher]: researcher,
    [MAGE_ROLE.warden]: warden,
    [MAGE_ROLE.professor]: professor,
    [MAGE_ROLE.raider]: raider,
  };
}

/**
 * The five staff compositions worth distinguishing.
 *
 * `teaching-school` and `research-institute` are the two the vision's §6a loop
 * is about, `balanced` is the four-way control, `fortress` is the university a
 * universe under raid actually staffs, and `all-raiders` is the degenerate
 * case that proves the profile still reads.
 */
export const ROLE_MIXES: Axis<RoleWeights> = {
  name: 'roleMix',
  points: [
    { id: 'teaching-school', value: weights(1, 0, 3, 0) },
    { id: 'research-institute', value: weights(3, 0, 1, 0) },
    { id: 'balanced', value: weights(1, 1, 1, 1) },
    { id: 'fortress', value: weights(1, 2, 1, 0) },
    { id: 'all-raiders', value: weights(0, 0, 0, 1) },
  ],
};

// ---------------------------------------------------------------------------
// 3. Game stage
// ---------------------------------------------------------------------------

/**
 * What "early", "mid" and "late" set.
 *
 * **Four things move together here and a difference between stages is
 * therefore not attributable to any one of them.** That is a deliberate
 * limitation and it is written down rather than discovered: the stage axis
 * answers *"what does a university look like at each point in a universe's
 * life"*, which is the ask's question, and not *"which of tick, shelf, stock
 * or populace caused it"*.
 *
 * {@link SEEDED_DEPTHS} exists for the attributable question. It moves the
 * shelf and nothing else, which is what the §6a capital loop actually reads.
 */
export interface Stage {
  /** World tick the run opens at. */
  readonly openingTick: number;
  /** Distinct nodes already on the shelves, taken from the shipped catalog. */
  readonly seededNodes: number;
  /** Opening stone, `fp`. Construction spends this and nothing else. */
  readonly stone: number;
  /** Opening vellum, `fp`. Scribing and library upkeep spend this. */
  readonly vellum: number;
  /** Vellum added each tick, `fp`. A universe with an economy behind it. */
  readonly vellumIncome: number;
  /** Populace headcount per species per occupation. */
  readonly cohortSize: number;
  /** Whether the site opens already built. */
  readonly startsComplete: boolean;
}

export const STAGES: Axis<Stage> = {
  name: 'stage',
  points: [
    {
      id: 'early',
      value: {
        openingTick: 12,
        seededNodes: 0,
        stone: 4096,
        vellum: 512,
        vellumIncome: 8,
        cohortSize: 40,
        startsComplete: false,
      },
    },
    {
      id: 'mid',
      value: {
        openingTick: 600,
        seededNodes: 40,
        stone: 16_384,
        vellum: 4096,
        vellumIncome: 64,
        cohortSize: 200,
        startsComplete: true,
      },
    },
    {
      id: 'late',
      value: {
        openingTick: 2000,
        seededNodes: 160,
        stone: 65_536,
        vellum: 16_384,
        vellumIncome: 256,
        cohortSize: 800,
        startsComplete: true,
      },
    },
  ],
};

/**
 * Seeded shelf depth with **everything else held fixed**.
 *
 * The one axis on this file that supports a causal reading, and the reason it
 * is separate from {@link STAGES}: `capital.ts`'s contribution table is
 * piecewise-linear with knots at 0, 8, 32, 96, 256 and 640 distinct nodes, so
 * these points straddle every segment boundary the curve has. A sweep that
 * only ever sat inside one segment would report the table as linear.
 */
export const SEEDED_DEPTHS: Axis<number> = {
  name: 'seededDepth',
  points: [0, 8, 32, 96, 256].map((nodes) => ({ id: String(nodes), value: nodes })),
};

// ---------------------------------------------------------------------------
// 4. The scribing queue — the axis `world-step.ts` pins at zero
// ---------------------------------------------------------------------------

/**
 * Where the populace controller's scribe demand comes from.
 *
 * `world-step.ts` passes `scribingQueueDepth: 0` as a literal, so
 * `computeOccupationDemand` returns zero scribes wanted, **forever**, in every
 * shipped build. The other three demand inputs are live: a university under
 * construction asks for laborers through `constructionBacklog`, and a finished
 * one asks for students through `universityCapacity`.
 *
 * So a university can create demand for the people who build it and for the
 * people who study in it, and never for the people who copy its books. This
 * axis is how the harness shows that: run `pinned-zero` and `books-awaiting`
 * side by side and the difference is the whole of the defect.
 *
 * It is an **input** to the mock rather than a fix. Fixing it is a change to
 * `world-step.ts` and a re-baseline; demonstrating it is this file's job.
 */
export type ScribeQueuePolicy = 'pinned-zero' | 'books-awaiting';

export const SCRIBE_QUEUE_POLICIES: Axis<ScribeQueuePolicy> = {
  name: 'scribeQueue',
  points: [
    { id: 'pinned-zero', value: 'pinned-zero' },
    { id: 'books-awaiting', value: 'books-awaiting' },
  ],
};

// ---------------------------------------------------------------------------
// 5. The ruleset gate
// ---------------------------------------------------------------------------

/**
 * How much of the grid the god permits.
 *
 * `library.ts`'s `counts` predicate is the seam: an interdicted book still
 * stands, still costs upkeep, and contributes no depth. A sweep with no
 * forbidden cell never exercises the one place where a university's inventory
 * and its worth come apart.
 */
export type RulesetGate = 'permit-all' | 'forbid-half' | 'forbid-all';

export const RULESET_GATES: Axis<RulesetGate> = {
  name: 'ruleset',
  points: [
    { id: 'permit-all', value: 'permit-all' },
    { id: 'forbid-half', value: 'forbid-half' },
    { id: 'forbid-all', value: 'forbid-all' },
  ],
};

// ---------------------------------------------------------------------------
// 6. Populace occupations supplied to the institution
// ---------------------------------------------------------------------------

/**
 * Which occupations the mock populace actually contains.
 *
 * From `OCCUPATION` rather than from a list of strings, so a sixth occupation
 * appears here the day `enums.ts` grows one.
 */
export const SUPPLIED_OCCUPATIONS: readonly OccupationValue[] = [
  OCCUPATION.laborer,
  OCCUPATION.scribe,
  OCCUPATION.student,
];

/**
 * Every axis in this file, by name.
 *
 * The sweep and the CLI both read this rather than naming axes individually,
 * which is what makes "a new axis is a row" true rather than aspirational —
 * add a row above, export it, add it here, and it is swept, keyed, reported
 * and golden-recorded with no further edit.
 */
export const ALL_AXES = {
  speciesMix: SPECIES_MIXES,
  staffSize: STAFF_SIZES,
  roleMix: ROLE_MIXES,
  stage: STAGES,
  seededDepth: SEEDED_DEPTHS,
  scribeQueue: SCRIBE_QUEUE_POLICIES,
  ruleset: RULESET_GATES,
} as const;

export type AxisName = keyof typeof ALL_AXES;

/** Axis names in declaration order, which is the order a run key is built in. */
export const AXIS_NAMES: readonly AxisName[] = Object.keys(ALL_AXES) as AxisName[];

/** How many cells a full cross of the named axes has. */
export function crossSize(names: readonly AxisName[]): number {
  return names.reduce((total, name) => total * ALL_AXES[name].points.length, 1);
}

/**
 * Splits `count` across `MAGE_ROLE` by the given weights, largest remainder.
 *
 * Deterministic and total: the parts always sum to `count`, and ties go to the
 * earlier role in `MAGE_ROLE` order. A `Math.round` per role would not sum,
 * and a sweep whose staff size quietly disagrees with its staff size is the
 * kind of defect that reads as a balance finding.
 */
export function allocateRoles(count: number, mix: RoleWeights): Map<MageRoleValue, number> {
  const roles = Object.values(MAGE_ROLE) as MageRoleValue[];
  const total = roles.reduce<number>((sum, role) => sum + mix[role], 0);
  const allocated = new Map<MageRoleValue, number>();
  if (count <= 0 || total <= 0) {
    for (const role of roles) allocated.set(role, 0);
    return allocated;
  }

  let assigned = 0;
  const remainders: { role: MageRoleValue; remainder: number }[] = [];
  for (const role of roles) {
    const exact = count * mix[role];
    const whole = Math.floor(exact / total);
    allocated.set(role, whole);
    assigned += whole;
    remainders.push({ role, remainder: exact - whole * total });
  }

  remainders.sort((a, b) => (b.remainder === a.remainder ? 0 : b.remainder - a.remainder));
  for (let index = 0; assigned < count; index += 1, assigned += 1) {
    const entry = remainders[index % remainders.length] as { role: MageRoleValue };
    allocated.set(entry.role, (allocated.get(entry.role) ?? 0) + 1);
  }
  return allocated;
}
