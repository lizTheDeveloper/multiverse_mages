/*
 * Multiverse Mages — the fixed observation layout and its normalization descriptors.
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
 * `docs/design/contracts.md` §4.1's observation table, transcribed as offsets,
 * sizes, and one normalization descriptor per channel.
 *
 * ## Why the layout is a table and not a set of hand-written offsets
 *
 * §4.1 opens with the requirement the whole file exists to serve: *"Shape must
 * be constant across a run and across universes, or RL cannot consume it."* A
 * hand-written offset is a number that can be right in the writer and wrong in
 * the reader, and the symptom is not a crash — it is a policy that trains
 * against `worship` while the encoder is writing `favor` there. So the offsets
 * are *derived* from one ordered block list, exactly once, and
 * {@link OBSERVATION_SIZE} is the sum of that list. A block whose size changes
 * moves every block after it consistently on both sides.
 *
 * ## Everything here is sized from the FULL space, never from v1
 *
 * 70 cells, 6 species, 7 tiers, 14 forms, 5 techniques — not the 12-cell v1
 * subset. `observation-action-space`'s scenario *"v1 content yields a sparse
 * vector"* is the point: a universe using 12 cells emits 210 knowledge channels
 * of which 174 are zero. Sizing to the content actually loaded would produce a
 * vector that changed width the day the thirteenth cell shipped, and every
 * policy trained before that day would silently be reading the wrong channels.
 *
 * ## Normalization descriptors are pinned constants, never measured
 *
 * §4.1: *"Each block declares its own normalization descriptor — a divisor and
 * a clamp — so that a quantity whose range later grows does not silently
 * rescale an existing policy's inputs."*
 *
 * Read that as a ban, because it is one: **no divisor below may be computed
 * from state, from loaded content, or from anything observed at runtime.** A
 * divisor derived from, say, the largest cohort seen so far is precisely the
 * silent rescale the sentence forbids — every channel in the block would shift
 * the moment a run grew a bigger cohort, and a trained policy's inputs would
 * move underneath it with nothing failing anywhere. Each scale below is a
 * literal, and raising one is a breaking contract change of the same kind as
 * raising `EDICT_BUDGET_MAX`.
 */

import { FP_ONE } from '@mm/sim-core';
import { EDICT_BUDGET_MAX, GRID_CELL_COUNT, GRID_FORM_COUNT, GRID_TECHNIQUE_COUNT } from '@mm/state';

// ---------------------------------------------------------------------------
// Structural constants. Each is pinned in the sense `contracts.md` §0 pins
// EDICT_BUDGET_MAX: raising it resizes the observation and invalidates every
// trained policy, so it is a contract change and not a tuning knob.
// ---------------------------------------------------------------------------

/**
 * Species the observation has room for. §4.1 sizes both the population and the
 * mage block at *"6 species"*, and `vision.md` §6 names six.
 *
 * A seventh species is therefore not a content addition — it is a contract
 * change that widens the vector by 5 population channels and 7 mage channels.
 * {@link speciesSlot} throws rather than dropping the extra species quietly,
 * because a species that simply vanished from the observation would look like a
 * population that never grew.
 */
export const OBSERVATION_SPECIES_COUNT = 6;

/** Node tiers. `contracts.md` §2.3: `tier` is `1..7`. */
export const OBSERVATION_TIER_COUNT = 7;

/**
 * Mage-block slots per species: the seven tiers plus one for the untaught.
 *
 * `contracts.md` §4.1 widened the block from 7 to 8 during `core-contracts`.
 * Bucketing purely by highest tier known left a mage who knows nothing in no
 * bucket at all, and no other block carries a living-mage count — so an agent
 * could not tell ten fresh mages from none, which is the state every universe
 * is in for its first decades and exactly when the god's choices matter most.
 */
export const MAGE_TIER_SLOTS = OBSERVATION_TIER_COUNT + 1;

/** The mage-block slot for a mage who knows no nodes at all. */
export const UNTAUGHT_TIER_SLOT = 0;

/** Occupations a cohort can hold. `contracts.md` §1.3, five of them. */
export const OBSERVATION_OCCUPATION_COUNT = 5;

/** Channels per cell in the knowledge block: nodes known, deepest tier, instances. */
export const OBSERVATION_KNOWLEDGE_CHANNELS = 3;

/** Channels summarizing one side of an engagement. See {@link ENGAGEMENT_SIDE_CHANNELS}. */
export const OBSERVATION_SIDE_CHANNELS = 7;

/** Channels describing one objective slot: kind, status, value, captured. */
export const OBSERVATION_OBJECTIVE_CHANNELS = 4;

/**
 * Objective slots the engagement block carries.
 *
 * **This number is chosen to make the engagement block exactly the 64 §4.1
 * fixes**, given two seven-channel side summaries and a two-channel portal
 * summary: `64 - 14 - 2 = 48`, and `48 / 4 = 12`. It is not a claim that a raid
 * has twelve objectives. A raid with more than twelve reports its twelve most
 * salient, in the deterministic order `rankedObjectives` defines; a raid with
 * fewer zero-fills the rest, which is indistinguishable from world scale for
 * those slots and is fine, because the clock block already says which scale the
 * observation was taken at.
 */
export const OBSERVATION_OBJECTIVE_SLOTS = 12;

/**
 * The largest tradition id the tradition channel can represent distinctly.
 *
 * §4.1 gives `tradition` one channel holding *"tradition id"*, and a single
 * channel has to divide by something. There is no natural ceiling in
 * `contracts.md` — §2.5 caps a tradition's *hooks* at four but never caps the
 * number of traditions — so this is an invented constant, and it is written
 * here rather than derived from the loaded content registry for the reason at
 * the top of this file: a divisor that tracked the content would rescale this
 * channel every time a tradition shipped.
 */
export const OBSERVATION_MAX_TRADITION_ID = 64;

/**
 * The worship tier the resources block normalizes against.
 *
 * `worshipTier` is a `uint8` whose formula §8 leaves to `god-agency`, so there
 * is nothing to derive this from and it must be pinned. Deliberately generous:
 * a tier above it clamps to 1.0 rather than wrapping, which is a saturated
 * reading rather than a wrong one.
 */
export const OBSERVATION_MAX_WORSHIP_TIER = 16;

/**
 * Pinned count scales. Each answers "what integer maps to 1.0 in this channel",
 * and each is a round number comfortably above what a run is expected to reach
 * — a channel that saturates is far less damaging than one whose divisor moves.
 */
export const OBSERVATION_SCALE = {
  /** People in one cohort. */
  cohortCount: 1_000_000,
  /** Living mages in one (species, tier) bucket. */
  mageCount: 1024,
  /** Distinct nodes known within one cell. */
  nodesPerCell: 64,
  /** Knowledge instances within one cell. */
  instancesPerCell: 512,
  /** Universities in the universe. */
  universityCount: 64,
  /** Summed student capacity across universities. */
  universityCapacity: 65_536,
  /** Distinct nodes held in libraries — §7's `capitalSnowball` quantity. */
  libraryDepth: 4096,
  /** Grimoires in existence. */
  grimoireCount: 4096,
  /** World ticks. 12 per year (§0), so this is a thousand world years. */
  worldTick: 12_000,
  /** Eras. `ERA_TICKS` is 240, so this matches the world-tick scale. */
  era: 50,
  /** Combatants on one side of an engagement. */
  combatantCount: 256,
  /** A side's summed `fp` pools — hp, vigor, concealment. */
  sideFpTotal: 256 * FP_ONE,
  /** Prepared spells held across one side. */
  preparedSpellCount: 1024,
  /** `portalStability`, a raw integer (§1.6). */
  portalStability: 65_536,
  /** `stabilityDecayPerTick`, a raw integer ≥ 1 (§1.6). */
  portalDecay: 1024,
  /** Objective `kind`, whose values `raid-engagement` names. A `uint8`. */
  objectiveKind: 255,
} as const;

// ---------------------------------------------------------------------------
// Normalization descriptors.
// ---------------------------------------------------------------------------

/**
 * The five normalization rules the `agent-api` capability permits, in the
 * order that spec lists them.
 *
 * A rule is a *declaration of meaning*, not merely an arithmetic recipe, and
 * two of them coincide numerically: over the integers a `flag` and a `ratio`
 * whose constant is 1 export the same number for every input. They are still
 * two rules, because the layout digest is taken over the declaration — so a
 * channel that quietly stops being a boolean and starts being a count-out-of-one
 * changes the digest even though not one exported value moves. A digest that
 * covered only the arithmetic would call that change invisible, which is the
 * failure `design.md` rejects length-comparison for.
 */
export const NORMALIZATION_RULES = [
  /** An integer divided by a declared constant, then clamped. */
  'ratio',
  /** An `fp` value divided by `fp(1024)`. §4.1's named rule. */
  'bounded',
  /** A count mapped through a declared logarithmic bucket edge list. */
  'log-bucket',
  /** Set or unset. */
  'flag',
  /** Already in `[0, 1]`; passed through and clamped. */
  'identity',
] as const;

export type NormalizationRule = (typeof NORMALIZATION_RULES)[number];

/**
 * How one channel's integer becomes a number in `[0, 1]`.
 *
 * §4.1 asks for *"a divisor and a clamp"*; the `agent-api` capability asks for
 * *"its normalization rule and its saturation constant"*. Those are the same
 * two things under two names, and {@link divisor} is the one number — the value
 * at which the channel reads exactly `max`. It is written once rather than
 * carried under both names, because two fields holding one fact are two fields
 * that can disagree.
 *
 * The clamp is expressed as an explicit `[min, max]` pair rather than as an
 * implied `[0, 1]` so that the bound is a value a test can read back and assert,
 * rather than a convention living in whichever function happens to do the
 * division.
 */
export interface NormalizationDescriptor {
  /** Which of the five rules governs this channel. */
  readonly rule: NormalizationRule;
  /**
   * The saturation constant: the integer that maps to {@link max}. Always a
   * positive integer, and always a literal — see this file's opening note.
   */
  readonly divisor: number;
  /** Normalized floor. Zero everywhere today; present so a signed channel could say otherwise. */
  readonly min: number;
  /** Normalized ceiling. One everywhere, because §4.1 pins the export to `[0, 1]`. */
  readonly max: number;
  /**
   * Bucket edges, ascending. Present on `log-bucket` descriptors and on no
   * others. A value lands in the bucket counting how many edges it has reached,
   * so the last edge is the saturation constant.
   */
  readonly edges?: readonly number[];
}

/** Rejects anything that could not have been written as a literal. */
function assertSaturationConstant(value: number, role: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(
      `${role} must be a positive integer; received ${String(value)}. A fractional, unsafe, or ` +
        'derived saturation constant is the silent rescale contracts.md §4.1 forbids.',
    );
  }
}

/**
 * `ratio`: an integer divided by a declared constant, clamped to `[0, 1]`.
 *
 * The workhorse. Every count channel uses it, and the constant is what the
 * channel saturates at rather than what it is expected to reach.
 */
export function ratioScale(saturation: number): NormalizationDescriptor {
  assertSaturationConstant(saturation, 'A ratio saturation constant');
  return Object.freeze({ rule: 'ratio' as const, divisor: saturation, min: 0, max: 1 });
}

/**
 * `bounded`: a fixed-point quantity over `fp(1024)`.
 *
 * **This is the rule §4.1 names explicitly**: *"values in `[0, 1]`, with
 * `fp(1024)` mapping to `1.0`"*. It takes no argument, which is the point —
 * every `fp` channel divides by the same constant and none may choose another,
 * since a second fixed-point divisor would mean two channels reporting the same
 * magnitude as different numbers.
 */
export function boundedScale(): NormalizationDescriptor {
  return Object.freeze({ rule: 'bounded' as const, divisor: FP_ONE, min: 0, max: 1 });
}

/**
 * `flag`: set or unset.
 *
 * Kept as a descriptor rather than special-cased, so that *every* index in the
 * vector has one and `normalizedObservation` has no branch that could treat one
 * channel differently from the rest.
 */
export function flagScale(): NormalizationDescriptor {
  return Object.freeze({ rule: 'flag' as const, divisor: 1, min: 0, max: 1 });
}

/**
 * `identity`: a value already inside the exported range.
 *
 * **No slot elects this at 0.5.0**, and that is worth saying rather than
 * leaving to be discovered. The rule is in the spec's list of five, so it is
 * implemented and tested; the encoder next door emits integers, and an integer
 * channel that is already in `[0, 1]` is a flag, which has its own rule and its
 * own meaning. `identity` is here for a channel whose raw value is normalized by
 * construction — and adopting it for an existing channel would change that
 * channel's declared meaning and therefore the layout digest, which is exactly
 * the visibility the digest exists to provide.
 */
export function identityScale(): NormalizationDescriptor {
  return Object.freeze({ rule: 'identity' as const, divisor: 1, min: 0, max: 1 });
}

/**
 * `log-bucket`: a count mapped through a declared edge list.
 *
 * For a quantity whose interesting range spans orders of magnitude, where a
 * plain ratio spends the whole channel in the first percent — a universe of
 * three thousand people against a cohort scale of a million reads `0.003`, and a
 * policy cannot tell that from `0.001`.
 *
 * **No slot elects this at 0.5.0 either.** Changing an existing channel's rule
 * is a change to what the observation *means*, and this change exports the §4
 * space rather than redefining it. The rule ships implemented so that whoever
 * has evidence a channel's dynamic range needs it can adopt it as a digest-
 * changing, reviewable move rather than as a new mechanism invented under
 * deadline.
 *
 * @param edges - Strictly increasing positive integers. A value scores one for
 * each edge it has reached, so `[1, 4, 16]` gives four buckets: below 1, at
 * least 1, at least 4, at least 16 — exported as `0`, `1/3`, `2/3`, `1`.
 */
export function logBucketScale(edges: readonly number[]): NormalizationDescriptor {
  if (edges.length === 0) {
    throw new RangeError(
      'A log-bucket descriptor needs at least one edge; with none there is nothing to divide the ' +
        'range at and the channel would be constant.',
    );
  }
  let previous = 0;
  for (const [position, edge] of edges.entries()) {
    if (!Number.isSafeInteger(edge)) {
      throw new RangeError(
        `Bucket edge ${String(position)} must be an integer; received ${String(edge)}. The core ` +
          'emits integers, and a fractional edge is a comparison that would never be exact.',
      );
    }
    if (edge < 1) {
      throw new RangeError(
        `Bucket edge ${String(position)} must be positive; received ${String(edge)}. Zero is the ` +
          'bucket below the first edge and is not itself an edge.',
      );
    }
    if (edge <= previous) {
      throw new RangeError(
        `Bucket edges must be strictly increasing; edge ${String(position)} is ${String(edge)} ` +
          `after ${String(previous)}. An out-of-order edge makes the mapping non-monotonic, so a ` +
          'larger count could export a smaller number.',
      );
    }
    previous = edge;
  }
  return Object.freeze({
    rule: 'log-bucket' as const,
    // The saturation constant is the top edge: the value at which the channel
    // reads exactly 1.0, which is what the constant means for every other rule.
    divisor: previous,
    min: 0,
    max: 1,
    edges: Object.freeze([...edges]),
  });
}

/**
 * A `0`/`1` flag. Named for the callers that had it before the rules were
 * introduced; {@link flagScale} is the same descriptor.
 */
export const BOOLEAN_SCALE = flagScale();

/** The one fixed-point descriptor. See {@link boundedScale}. */
export const FP_SCALE = boundedScale();

/** The `identity` descriptor. No slot elects it — see {@link identityScale}. */
export const IDENTITY_SCALE = identityScale();

// ---------------------------------------------------------------------------
// The block table. Order is the vector's order; do not reorder.
// ---------------------------------------------------------------------------

/** The name of each §4.1 block, in the document's order. */
export const OBSERVATION_BLOCK_NAMES = [
  'ruleset',
  'tradition',
  'resources',
  'population',
  'mages',
  'knowledge',
  'institutions',
  'clock',
  'engagement',
] as const;

export type ObservationBlockName = (typeof OBSERVATION_BLOCK_NAMES)[number];

/** One §4.1 block, resolved to its place in the vector. */
export interface ObservationBlock {
  readonly name: ObservationBlockName;
  /** Index of this block's first channel. */
  readonly offset: number;
  /** Channels in this block. */
  readonly size: number;
  /** One descriptor per channel. Always exactly {@link size} long. */
  readonly descriptors: readonly NormalizationDescriptor[];
}

/** `n` copies of one descriptor, for a block whose channels are homogeneous. */
function repeat(descriptor: NormalizationDescriptor, count: number): NormalizationDescriptor[] {
  return Array.from({ length: count }, () => descriptor);
}

/**
 * The ruleset block: 19 axis bits, then `EDICT_BUDGET_MAX` `(cellId, kind)`
 * pairs, zero-padded.
 *
 * `19` is not a magic number — it is `GRID_TECHNIQUE_COUNT + GRID_FORM_COUNT`,
 * and it is written that way so that §2.1's grid and §4.1's block cannot
 * disagree. If the grid ever changed shape this width would follow it, and the
 * assertion below would report the new total rather than silently mis-slicing.
 */
const RULESET_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  ...repeat(BOOLEAN_SCALE, GRID_TECHNIQUE_COUNT),
  ...repeat(BOOLEAN_SCALE, GRID_FORM_COUNT),
  // Interleaved per slot, matching how the encoder writes them: a reader that
  // assumed "all cell ids, then all kinds" would decode a plausible ruleset
  // made of the wrong pairs.
  ...Array.from({ length: EDICT_BUDGET_MAX }, () => [
    ratioScale(GRID_CELL_COUNT),
    BOOLEAN_SCALE,
  ]).flat(),
];

const RESOURCE_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  FP_SCALE, // favor
  FP_SCALE, // worship
  ratioScale(OBSERVATION_MAX_WORSHIP_TIER), // worshipTier
  FP_SCALE, // materials
  FP_SCALE, // prestige
];

const KNOWLEDGE_DESCRIPTORS: readonly NormalizationDescriptor[] = Array.from(
  { length: GRID_CELL_COUNT },
  () => [
    ratioScale(OBSERVATION_SCALE.nodesPerCell),
    ratioScale(OBSERVATION_TIER_COUNT),
    ratioScale(OBSERVATION_SCALE.instancesPerCell),
  ],
).flat();

const INSTITUTION_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  ratioScale(OBSERVATION_SCALE.universityCount),
  ratioScale(OBSERVATION_SCALE.universityCapacity),
  ratioScale(OBSERVATION_SCALE.libraryDepth),
  ratioScale(OBSERVATION_SCALE.grimoireCount),
];

const CLOCK_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  ratioScale(OBSERVATION_SCALE.worldTick),
  ratioScale(OBSERVATION_SCALE.era),
  BOOLEAN_SCALE, // mode: 0 world, 1 engagement
];

/**
 * The seven channels summarizing one side of an engagement, in order.
 *
 * Aggregates rather than per-combatant rows, because §4.1 requires a constant
 * shape and a raid's combatant count is not constant — §4.1 says variable-length
 * data is *"bucketed or summarized, never emitted raw"*. Totals rather than
 * means: a mean hides the count, and the count is already the first channel, so
 * a policy that wants the mean can divide while one that wants the mass cannot
 * recover it from a mean.
 */
export const ENGAGEMENT_SIDE_CHANNELS = [
  'combatantCount',
  'hpTotal',
  'maxHpTotal',
  'vigorTotal',
  'maxVigorTotal',
  'concealmentTotal',
  'preparedSpellCount',
] as const;

const SIDE_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  ratioScale(OBSERVATION_SCALE.combatantCount),
  ratioScale(OBSERVATION_SCALE.sideFpTotal),
  ratioScale(OBSERVATION_SCALE.sideFpTotal),
  ratioScale(OBSERVATION_SCALE.sideFpTotal),
  ratioScale(OBSERVATION_SCALE.sideFpTotal),
  ratioScale(OBSERVATION_SCALE.sideFpTotal),
  ratioScale(OBSERVATION_SCALE.preparedSpellCount),
];

/** The four channels of one objective slot, in order. */
export const ENGAGEMENT_OBJECTIVE_CHANNELS = ['kind', 'statusKind', 'valueFp', 'captured'] as const;

const OBJECTIVE_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  ratioScale(OBSERVATION_SCALE.objectiveKind),
  // `OBJECTIVE_STATUS` has four members (held/captured/looted/destroyed), so the
  // largest value is 3. Divided by 3 rather than by 4 so that `destroyed` reads
  // as exactly 1.0 and the four statuses are evenly spaced.
  ratioScale(3),
  FP_SCALE, // valueFp
  BOOLEAN_SCALE, // captured by anyone at all
];

const ENGAGEMENT_DESCRIPTORS: readonly NormalizationDescriptor[] = [
  ...SIDE_DESCRIPTORS, // own side
  ...SIDE_DESCRIPTORS, // enemy side
  ...Array.from({ length: OBSERVATION_OBJECTIVE_SLOTS }, () => OBJECTIVE_DESCRIPTORS).flat(),
  ratioScale(OBSERVATION_SCALE.portalStability),
  ratioScale(OBSERVATION_SCALE.portalDecay),
];

/** Every block's descriptors, in §4.1's order, before offsets are resolved. */
const BLOCK_DESCRIPTORS: Readonly<Record<ObservationBlockName, readonly NormalizationDescriptor[]>> =
  {
    ruleset: RULESET_DESCRIPTORS,
    tradition: [ratioScale(OBSERVATION_MAX_TRADITION_ID)],
    resources: RESOURCE_DESCRIPTORS,
    population: repeat(
      ratioScale(OBSERVATION_SCALE.cohortCount),
      OBSERVATION_SPECIES_COUNT * OBSERVATION_OCCUPATION_COUNT,
    ),
    mages: repeat(
      ratioScale(OBSERVATION_SCALE.mageCount),
      OBSERVATION_SPECIES_COUNT * MAGE_TIER_SLOTS,
    ),
    knowledge: KNOWLEDGE_DESCRIPTORS,
    institutions: INSTITUTION_DESCRIPTORS,
    clock: CLOCK_DESCRIPTORS,
    engagement: ENGAGEMENT_DESCRIPTORS,
  };

function buildBlocks(): readonly ObservationBlock[] {
  let offset = 0;
  const blocks: ObservationBlock[] = [];
  for (const name of OBSERVATION_BLOCK_NAMES) {
    const descriptors = BLOCK_DESCRIPTORS[name];
    blocks.push(Object.freeze({ name, offset, size: descriptors.length, descriptors }));
    offset += descriptors.length;
  }
  return Object.freeze(blocks);
}

/** Every §4.1 block, with resolved offsets. Frozen; the layout is a contract. */
export const OBSERVATION_BLOCKS: readonly ObservationBlock[] = buildBlocks();

const BLOCK_BY_NAME: ReadonlyMap<ObservationBlockName, ObservationBlock> = new Map(
  OBSERVATION_BLOCKS.map((block) => [block.name, block]),
);

/** A block by name. Throws on an unknown name rather than returning `undefined`. */
export function observationBlock(name: ObservationBlockName): ObservationBlock {
  const block = BLOCK_BY_NAME.get(name);
  if (block === undefined) {
    throw new Error(`No observation block named "${name}".`);
  }
  return block;
}

/**
 * The length of every observation, from every universe, at every tick, in both
 * clock modes.
 *
 * `400`, decomposing as `35 + 1 + 5 + 30 + 48 + 210 + 4 + 3 + 64`. The
 * arithmetic is done by {@link buildBlocks} rather than written here, and a
 * test asserts the sum equals this literal — so the constant is a *claim about*
 * the block table rather than a second, independently rottable copy of it.
 */
export const OBSERVATION_SIZE = OBSERVATION_BLOCKS.reduce((total, block) => total + block.size, 0);

/** Every channel's descriptor, indexed by position in the vector. */
export const OBSERVATION_DESCRIPTORS: readonly NormalizationDescriptor[] = Object.freeze(
  OBSERVATION_BLOCKS.flatMap((block) => [...block.descriptors]),
);

/** The descriptor governing one channel. Throws on an index outside the vector. */
export function descriptorAt(index: number): NormalizationDescriptor {
  const descriptor = OBSERVATION_DESCRIPTORS[index];
  if (descriptor === undefined) {
    throw new RangeError(
      `Channel ${String(index)} is outside the observation, which is ${OBSERVATION_SIZE} wide.`,
    );
  }
  return descriptor;
}

// ---------------------------------------------------------------------------
// Index helpers. Every encoder and decoder goes through these.
// ---------------------------------------------------------------------------

/**
 * The population/mage block slot for a species.
 *
 * @throws RangeError if the species id is outside `1..OBSERVATION_SPECIES_COUNT`.
 * Throwing rather than skipping is the same judgement `permits()` makes about a
 * nonsense cell id: a species silently absent from the observation reads as a
 * population that never grew, which looks like a balance result rather than a
 * contract violation. Content that ships a seventh species must widen the
 * vector first.
 */
export function speciesSlot(speciesId: number): number {
  if (!Number.isInteger(speciesId) || speciesId < 1 || speciesId > OBSERVATION_SPECIES_COUNT) {
    throw new RangeError(
      `Species id ${String(speciesId)} has no observation slot. contracts.md §4.1 sizes the ` +
        `population and mage blocks at exactly ${OBSERVATION_SPECIES_COUNT} species; adding a ` +
        'species widens the observation and invalidates every trained policy, so it is a ' +
        'contract change and not a content change.',
    );
  }
  return speciesId - 1;
}

/**
 * The mage-block slot for a `(species, highest tier known)` pair.
 *
 * **Slot 0 is the untaught.** Tiers are numbered 1–7 (§2.3), so pass `0` for a
 * mage who knows no nodes. The block used to have exactly seven slots and such
 * a mage was counted nowhere, which made an all-zero mage block ambiguous
 * between an empty universe and a young one — see {@link MAGE_TIER_SLOTS}.
 */
export function mageTierSlot(speciesId: number, tier: number): number {
  if (!Number.isInteger(tier) || tier < UNTAUGHT_TIER_SLOT || tier > OBSERVATION_TIER_COUNT) {
    throw new RangeError(
      `Tier ${String(tier)} has no mage-block slot; contracts.md §2.3 numbers node tiers ` +
        `1..${OBSERVATION_TIER_COUNT}, and 0 is the slot for a mage who knows nothing.`,
    );
  }
  return speciesSlot(speciesId) * MAGE_TIER_SLOTS + tier;
}

/** The population-block slot for a `(species, occupation)` pair. */
export function cohortSlot(speciesId: number, occupation: number): number {
  if (
    !Number.isInteger(occupation) ||
    occupation < 0 ||
    occupation >= OBSERVATION_OCCUPATION_COUNT
  ) {
    throw new RangeError(
      `Occupation ${String(occupation)} has no observation slot; contracts.md §1.3 defines ` +
        `${OBSERVATION_OCCUPATION_COUNT}.`,
    );
  }
  return speciesSlot(speciesId) * OBSERVATION_OCCUPATION_COUNT + occupation;
}

/** The knowledge-block offset of a cell's first channel. Cell ids are `1..70`. */
export function knowledgeSlot(cellId: number): number {
  if (!Number.isInteger(cellId) || cellId < 1 || cellId > GRID_CELL_COUNT) {
    throw new RangeError(
      `Cell id ${String(cellId)} has no knowledge-block slot; cell ids are 1..${GRID_CELL_COUNT} ` +
        'and 0 is the reserved null (contracts.md §0).',
    );
  }
  return (cellId - 1) * OBSERVATION_KNOWLEDGE_CHANNELS;
}

/**
 * The largest and smallest integers the raw observation can hold.
 *
 * The raw vector is an `Int32Array` — §4.1 has the core emit integers, and a
 * typed integer array is the version of that claim the runtime enforces. Sums
 * can exceed it: `PopulaceCohortRecord.count` is a `uint32`, so two large
 * cohorts added together overflow a signed 32-bit slot and wrap to a *negative*
 * population. {@link saturate} is what every write goes through instead.
 */
const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

/**
 * Clamps a value into the `Int32Array` range instead of letting it wrap.
 *
 * Saturating rather than wrapping, for the reason `SimState.noteIllegalAction`
 * saturates: a wrapped total reports *less* than the truth and looks like a
 * plausible smaller number, while a saturated one reads honestly as "at least
 * this much" and normalizes to a clamped `1.0` — which is what a channel at its
 * ceiling should say anyway.
 */
export function saturate(value: number): number {
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `The raw observation holds integers only, but received ${String(value)}. Fixed-point ` +
        'arithmetic never produces a fraction, so a non-integer here is a float that reached the ' +
        'encoder — and §4.1 puts the only permitted float on the *export* path, past this point.',
    );
  }
  if (value > INT32_MAX) return INT32_MAX;
  if (value < INT32_MIN) return INT32_MIN;
  return value;
}
