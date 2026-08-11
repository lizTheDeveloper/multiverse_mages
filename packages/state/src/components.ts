/*
 * Multiverse Mages — component layouts for world and engagement state.
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
 * `docs/design/contracts.md` §1, expressed as component layouts over the
 * `@mm/sim-core` entity store, plus a readable record type per component.
 *
 * ## Field names and widths come from §1, not from taste
 *
 * Every field below appears in a §1 table with the width written there, and the
 * name is the document's name. Where §1 is silent the code says so out loud
 * rather than choosing quietly — see `library` and `everKnown` below, and the
 * `era` note on `universe`. This file is the place two capability teams will
 * compare against each other's assumptions, so an undocumented invention here
 * is worth more confusion later than the five lines it saves.
 *
 * ## Declaration order is part of the snapshot format
 *
 * `WorldSchema` says component order is the order sections appear in a
 * snapshot, so reordering {@link WORLD_COMPONENTS} changes every serialized
 * byte and therefore every committed golden fixture. Field order inside a
 * component is load-bearing for the same reason: values are stored row-major by
 * field position, and a permuted field table restores every value into the
 * wrong field. Neither list is something to tidy alphabetically.
 *
 * ## Variable-length parts of §1 are entities, not arrays
 *
 * §1.1 gives the universe three lists — `edicts`, `encouragedCells`,
 * `axisChangeCounters` — and §1.4 gives a university a list of staff cohorts. A
 * component field is one integer per entity, so a list cannot live in one. Each
 * is therefore a component on its own entities, which the snapshot serializes
 * like anything else. The alternative, holding them as JavaScript arrays beside
 * the state, would produce state that does not round-trip through a save: the
 * bug would show up as a loaded game missing the player's edicts.
 *
 * ## No world-scale component has a position
 *
 * §0: *"Only engagement entities have positions… World-scale entities have no
 * coordinates — the component model must not assume otherwise."* That is
 * enforced by {@link assertNoWorldPositions}, which
 * {@link defineWorldStateSchema} runs, so a positional field added to a world
 * component fails when the world is defined rather than at some later moment
 * when someone reads coordinates that were never written.
 */

import type { ComponentFields, ComponentSpec, ComponentStore, SimState, System } from '@mm/sim-core';
import { defineWorld } from '@mm/sim-core';

// ---------------------------------------------------------------------------
// Semantic aliases. Each is a `number`; they exist so a reader can tell a
// fixed-point magnitude from a content id from an entity handle at a glance.
// ---------------------------------------------------------------------------

/** A fixed-point value at scale 1024 (`contracts.md` §0). */
export type Fp = number;
/** An interned content id (`uint16`). `0` is the reserved null. */
export type ContentId = number;
/** A runtime entity handle (`uint32`). `0` is the reserved null. */
export type Handle = number;
/** A world or engagement tick count. */
export type Tick = number;
/** A `uint8` drawn from one of the enumerations in `./enums.ts`. */
export type Enum8 = number;
/** A boolean stored as `uint8`; `0` false, `1` true. */
export type Bool8 = number;

// ---------------------------------------------------------------------------
// The record-to-layout lock.
// ---------------------------------------------------------------------------

type FieldKeys<S extends { readonly fields: ComponentFields }> = Extract<keyof S['fields'], string>;

/**
 * `true` when a record type and a component layout describe the same fields,
 * and otherwise a type carrying the names that differ.
 *
 * Every component below is followed by a `const … : KeysMatch<…> = true`, which
 * fails to compile if the two drift apart. The record types are what rules code
 * reads and writes; the layouts are what the snapshot serializes. A field added
 * to one and not the other produces state that is written and never saved, or
 * saved and never written — both of which look like a rule that intermittently
 * does not fire.
 */
export type KeysMatch<R, S extends { readonly fields: ComponentFields }> = [
  Exclude<keyof R, FieldKeys<S>>,
] extends [never]
  ? [Exclude<FieldKeys<S>, keyof R>] extends [never]
    ? true
    : { readonly missingFromRecord: Exclude<FieldKeys<S>, keyof R> }
  : { readonly missingFromComponent: Exclude<keyof R, FieldKeys<S>> };

// ---------------------------------------------------------------------------
// §1.1 Universe.
// ---------------------------------------------------------------------------

/**
 * The universe singleton (`contracts.md` §1.1). One simulation instance holds
 * exactly one; a raid captures a ruleset snapshot rather than loading a second.
 *
 * **`era` is deliberately absent.** §1.1 calls it "derived, cached:
 * `floor(worldTick / ERA_TICKS)`" and records that it was previously a field
 * nothing wrote while an ascension path was defined over it. `@mm/sim-core`
 * already resolved that by making `eraOf(worldTick)` a pure function of the
 * clock, so storing it here would reintroduce the second source of truth the
 * note is about. Call `eraOf(state.clock.worldTick)`.
 *
 * **`worshipTier` is present**, though §1.1 marks it derived too. The
 * difference is that era's formula is pinned in this document while the worship
 * formulas are explicitly left to `god-agency` (§8) — so a tier cannot be
 * recomputed from state by anything at this layer, and a value that cannot be
 * recomputed is state.
 */
export const UNIVERSE = {
  name: 'universe',
  fields: {
    permittedTechniques: 'u8',
    permittedForms: 'u16',
    edictBudget: 'u8',
    traditionId: 'u16',
    favor: 'i32',
    worship: 'i32',
    worshipTier: 'u8',
    materials: 'i32',
    prestige: 'i32',
    prestigeEarned: 'i32',
    terminalReason: 'u8',
    favorCap: 'i32',
    ascended: 'u8',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface UniverseRecord {
  /** 5 bits, one per technique. */
  permittedTechniques: number;
  /** 14 bits, one per form. */
  permittedForms: number;
  /** Current allowance. Grows with worship tier, never exceeds `EDICT_BUDGET_MAX`. */
  edictBudget: number;
  /** Exactly one tradition; never 0. */
  traditionId: ContentId;
  /** The god's currency. */
  favor: Fp;
  /** Drives favor regeneration. */
  worship: Fp;
  /** Derived from worship by `god-agency`, cached here because nothing else can. */
  worshipTier: Enum8;
  materials: Fp;
  /** Carried in from prior runs. **Read-only during a run.** */
  prestige: Fp;
  /** Written once at run end; the input to the next run's `prestige`. */
  prestigeEarned: Fp;
  /** {@link TERMINAL_REASON}. */
  terminalReason: Enum8;
  /** Rises with worship tier; overflow is discarded and counted as `favorWasted`. */
  favorCap: Fp;
  /** Terminal flag. */
  ascended: Bool8;
}

export const UNIVERSE_FIELDS_MATCH: KeysMatch<UniverseRecord, typeof UNIVERSE> = true;

/**
 * One entry of §1.1's `edicts` array.
 *
 * A new edict may be issued only while `count < edictBudget`. Existing edicts
 * stay in force if the budget later falls: §1.1 forbids deterministic
 * auto-revocation, because it would silently rewrite a player's ruleset mid-run.
 */
export const EDICT = {
  name: 'edict',
  fields: {
    cellId: 'u16',
    kind: 'u8',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface EdictComponentRecord {
  cellId: ContentId;
  /** {@link EDICT_KIND}. */
  kind: Enum8;
}

export const EDICT_FIELDS_MATCH: KeysMatch<EdictComponentRecord, typeof EDICT> = true;

/** One entry of §1.1's `encouragedCells` array — where action 12 persists. */
export const ENCOURAGED_CELL = {
  name: 'encouraged-cell',
  fields: {
    cellId: 'u16',
    expiryTick: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface EncouragedCellRecord {
  cellId: ContentId;
  /** World tick at which the encouragement lapses. */
  expiryTick: Tick;
}

export const ENCOURAGED_CELL_FIELDS_MATCH: KeysMatch<EncouragedCellRecord, typeof ENCOURAGED_CELL> =
  true;

/**
 * One entry of §1.1's `axisChangeCounters` — the hysteresis that escalates the
 * cost of repeatedly flipping the same axis.
 *
 * §1.1 calls it "array per technique/form". Realized as one entity per axis
 * that has ever been flipped rather than as 19 fixed fields: the sparse form
 * costs nothing for the axes a run never touches, and 19 named fields on one
 * component would have to be addressed by string concatenation, which is how a
 * typo becomes a counter that silently never increments.
 */
export const AXIS_CHANGE_COUNTER = {
  name: 'axis-change-counter',
  fields: {
    axisKind: 'u8',
    axisBit: 'u8',
    changeCount: 'u32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface AxisChangeCounterRecord {
  /** {@link AXIS_KIND}. */
  axisKind: Enum8;
  /** The technique or form bit this counter belongs to. */
  axisBit: number;
  changeCount: number;
}

export const AXIS_CHANGE_COUNTER_FIELDS_MATCH: KeysMatch<
  AxisChangeCounterRecord,
  typeof AXIS_CHANGE_COUNTER
> = true;

// ---------------------------------------------------------------------------
// §1.2 Mage. §1.3 Populace cohort.
// ---------------------------------------------------------------------------

/**
 * An individual mage (`contracts.md` §1.2). *"Mages are individuals. Everyone
 * else is not."*
 *
 * `alive` is a field as well as a store-level fact. The two are not redundant:
 * entity liveness answers "is this handle valid", while §1.2's `alive` answers
 * "is this mage living", and a dead mage's entity may be retained — a grimoire
 * naming her as its last holder, a university naming her as founder — long
 * after she stops acting. Destroying the entity would invalidate those handles.
 *
 * `age` is deliberately absent: §1.2 says it is derived from `birthTick`, never
 * stored, so nothing can hold a stale copy of it.
 */
export const MAGE = {
  name: 'mage',
  fields: {
    speciesId: 'u16',
    birthTick: 'i32',
    roleId: 'u8',
    universityId: 'u32',
    curiosity: 'i32',
    ambition: 'i32',
    caution: 'i32',
    vigor: 'i32',
    maxVigor: 'i32',
    alive: 'u8',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface MageRecord {
  speciesId: ContentId;
  /** World ticks. Age is derived from this, never stored. */
  birthTick: Tick;
  /** {@link MAGE_ROLE}. */
  roleId: Enum8;
  /** University handle; `0` is unaffiliated. */
  universityId: Handle;
  /** Personality, rolled at birth from species means. */
  curiosity: Fp;
  ambition: Fp;
  caution: Fp;
  /** What a tradition's `cost` hook deducts from. Without it the hook is decorative. */
  vigor: Fp;
  maxVigor: Fp;
  alive: Bool8;
}

export const MAGE_FIELDS_MATCH: KeysMatch<MageRecord, typeof MAGE> = true;

/**
 * What a mage is currently working on (`contracts.md` §1.2, "Goal commitment").
 *
 * **Attached to the mage's own entity handle, and only while she has chosen.**
 * That is the whole of the design, and both halves are load-bearing:
 *
 * - *On her own handle*, so the commitment is found by the handle everything
 *   else already has, and so a dead mage's commitment leaves with her entity.
 * - *Only while she has chosen*, so a mage who has never made a decision — every
 *   mage on the tick she is promoted, and every mage in a universe whose
 *   autonomy has not run yet — carries no row at all. The absence is the
 *   distinction `select.ts` reads as `no-incumbent`, which is a different state
 *   from a mage who considered her options and committed to `idle`. Widening
 *   §1.2's mage row instead would have made those two indistinguishable without
 *   a sentinel, and would have cost four fields on every mage in a Monte Carlo
 *   run to carry a value most of them are not using.
 *
 * **Why this is a component rather than a value beside the state.** Hysteresis
 * (`MIN_COMMITMENT_TICKS`) and the stagger both compare against `adoptedTick`,
 * so the commitment has to survive from one tick to the next — and therefore
 * across a save. A JavaScript map beside the state is the defect this file's
 * header names: state that does not round-trip, showing up as a loaded game
 * whose mages all reconsider on the first tick because none of them remembers
 * committing to anything.
 *
 * `goalId` values are `@mm/rules-world`'s permanent, append-only goal registry.
 * This package deliberately does not enumerate them: it would be a second copy
 * of a table whose whole contract is that there is one, and `state` may not
 * import a rules package to get the first.
 */
export const GOAL_COMMITMENT = {
  name: 'goal-commitment',
  fields: {
    goalId: 'u8',
    targetNodeId: 'u16',
    adoptedTick: 'i32',
    score: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface GoalCommitmentRecord {
  /** `@mm/rules-world`'s `GOAL` registry. Permanent ids; `0` is `idle`. */
  goalId: Enum8;
  /** The node the goal is pointed at, or `0` for a goal that needs none. */
  targetNodeId: ContentId;
  /** The world tick the goal was adopted on. The commitment clock. */
  adoptedTick: Tick;
  /** The score it was adopted at, for reporting rather than for comparison. */
  score: Fp;
}

export const GOAL_COMMITMENT_FIELDS_MATCH: KeysMatch<GoalCommitmentRecord, typeof GOAL_COMMITMENT> =
  true;

/**
 * Unfinished work, one row per project (`contracts.md` §1.2, "Effort progress").
 *
 * `@mm/rules-magic`'s `research` takes *"progress accumulated before this step"*
 * as a parameter and says the caller owns storing it; teaching and scribing have
 * a cost to reach and no accumulator either. This component is what owns them.
 *
 * ## An effort is its own entity, keyed by the fields, not by a handle
 *
 * {@link GOAL_COMMITMENT} hangs on the mage's own handle because a mage has
 * exactly one goal. A mage has any number of *projects* — that is the whole
 * point of the decision recorded in §1.2: progress must outlive a goal switch,
 * so a mage who is bumped off a node by hysteresis and returns to it two years
 * later resumes rather than restarts. One row per mage cannot express that, and
 * a fixed set of slots on the mage row expresses it only up to whatever number
 * somebody guessed.
 *
 * So an effort is an entity of its own carrying its own subject, exactly as
 * {@link AXIS_CHANGE_COUNTER} is one entity per axis and {@link PREPARED_SPELL}
 * one per readied spell. A mage with nothing in flight carries no row anywhere,
 * which is the same absence-means-absence property the goal commitment has and
 * is why neither of them widened §1.2's mage row.
 *
 * The addressing key is `(subject, kind, nodeId, counterparty)`, and every part
 * of it earns its place:
 *
 * - **`kind`** distinguishes projects over the same node that are not the same
 *   project — see {@link EFFORT_KIND}. Without it, scribing finishes teaching.
 * - **`counterparty`** makes a teaching effort belong to the *pair*.
 *   `contracts.md` §2.3 prices teaching as one cost for the two of them, and
 *   both mages have goals — the teacher's `teach` and the student's
 *   `seek-teaching`. Two rows would let one lesson create two instances of the
 *   node in one student's head. One row, contributed to from either side, is the
 *   pair's project, and a teacher who takes a second student starts a second
 *   one. It is `0` for research and scribing, which have no second party.
 * - **`subject`** is the mage the effort is counted against, and for teaching it
 *   is the *teacher*: she is the one who must hold the node, so she is the one
 *   whose death ends the project rather than pausing it.
 *
 * ## What `progress` is measured in depends on `kind`, and that is not a hedge
 *
 * Research progress is compared against `researchRequirement`, which scales the
 * node's `researchCost` by the researcher's own rates; teaching against the
 * node's authored `teachCost`; scribing against the scribe-months its tier
 * costs. Those are three different denominators because §2.3 authors three
 * different costs, and normalizing them to a fraction here would put a division
 * — and a rounding decision — in a component layout.
 */
export const EFFORT_PROGRESS = {
  name: 'effort-progress',
  fields: {
    subject: 'u32',
    kind: 'u8',
    nodeId: 'u16',
    counterparty: 'u32',
    progress: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface EffortProgressRecord {
  /** The mage this effort is counted against. For teaching, the teacher. */
  subject: Handle;
  /** {@link EFFORT_KIND}. Never `0` on a well-formed row. */
  kind: Enum8;
  /** The node being worked toward. */
  nodeId: ContentId;
  /** The student, for a teaching effort; `0` for research and scribing. */
  counterparty: Handle;
  /** Work accumulated so far, in the units {@link EFFORT_KIND} implies. */
  progress: Fp;
}

export const EFFORT_PROGRESS_FIELDS_MATCH: KeysMatch<EffortProgressRecord, typeof EFFORT_PROGRESS> =
  true;

/**
 * An aggregate populace cohort (`contracts.md` §1.3).
 *
 * **This is a performance contract, not a modelling preference.** Simulating a
 * whole population as individuals is what would make Monte Carlo unaffordable.
 * No capability may promote populace to individual entities without changing
 * `contracts.md` first — and the cost of discovering that after
 * `mages-and-species` is written is a rewrite of its hot loop.
 */
export const POPULACE_COHORT = {
  name: 'populace-cohort',
  fields: {
    speciesId: 'u16',
    occupation: 'u8',
    count: 'u32',
    birthTickBucket: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface PopulaceCohortRecord {
  speciesId: ContentId;
  /** {@link OCCUPATION}. */
  occupation: Enum8;
  /** People in this cohort. One entity, however many people. */
  count: number;
  /** Cohorts are bucketed by decade of birth, not per person. */
  birthTickBucket: Tick;
}

export const POPULACE_COHORT_FIELDS_MATCH: KeysMatch<PopulaceCohortRecord, typeof POPULACE_COHORT> =
  true;

// ---------------------------------------------------------------------------
// §1.4 University and its library.
// ---------------------------------------------------------------------------

/** A university (`contracts.md` §1.4). */
export const UNIVERSITY = {
  name: 'university',
  fields: {
    libraryId: 'u32',
    capacity: 'u16',
    buildProgress: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface UniversityRecord {
  /** Library handle. `0` while the university has no library. */
  libraryId: Handle;
  /** Students supportable. */
  capacity: number;
  /** `fp(1024)` is complete. */
  buildProgress: Fp;
}

export const UNIVERSITY_FIELDS_MATCH: KeysMatch<UniversityRecord, typeof UNIVERSITY> = true;

/**
 * One entry of §1.4's `staffCohorts` array: a link from a university to a
 * populace cohort staffing it.
 *
 * A link entity rather than a `universityId` field on the cohort, because a
 * cohort could in principle staff more than one institution and, more
 * importantly, because §1.4 puts the relationship on the university. Storing it
 * on both sides is the second-source-of-truth mistake this file exists to
 * avoid.
 */
export const UNIVERSITY_STAFF = {
  name: 'university-staff',
  fields: {
    universityId: 'u32',
    cohortId: 'u32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface UniversityStaffRecord {
  universityId: Handle;
  cohortId: Handle;
}

export const UNIVERSITY_STAFF_FIELDS_MATCH: KeysMatch<UniversityStaffRecord, typeof UNIVERSITY_STAFF> =
  true;

/**
 * A library.
 *
 * **`contracts.md` §1 gives libraries no field table.** They appear only by
 * reference: `University.libraryId` (§1.4), `locationKind = 3` on a knowledge
 * instance and `holderKind = library` on a grimoire (§1.5), and
 * `libraryDependence` in §7. So this component carries the minimum that makes a
 * library an entity at all — a founding tick — and **`foundedTick` is not
 * normative**: it is not in §1, and `knowledge-model` should replace this
 * layout with the real one when it defines what a library does.
 *
 * What it deliberately does *not* carry is a `universityId` pointing back at
 * its owner. §1.4 already pins that edge on the university, and an inverse copy
 * is a second source of truth that can disagree with the first — at which point
 * a library belongs to two universities, or to none, depending which side you
 * ask.
 */
export const LIBRARY = {
  name: 'library',
  fields: {
    foundedTick: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface LibraryRecord {
  /** World tick the library was founded. **Not specified by contracts.md §1.** */
  foundedTick: Tick;
}

export const LIBRARY_FIELDS_MATCH: KeysMatch<LibraryRecord, typeof LIBRARY> = true;

// ---------------------------------------------------------------------------
// §1.5 Knowledge.
// ---------------------------------------------------------------------------

/**
 * A written copy of one node (`contracts.md` §1.5).
 *
 * **One instance per written copy.** A grimoire shelved in a library does not
 * produce a second knowledge instance: the instance's location is *rewritten*
 * from `(grimoire, grimoireId)` to `(library, libraryId)` on shelving and back
 * on removal. Counting a shelved book twice would inflate every redundancy
 * metric and make `libraryDependence` lie in the safe direction — which is the
 * worst direction for a metric whose whole job is to warn.
 */
export const GRIMOIRE = {
  name: 'grimoire',
  fields: {
    nodeId: 'u16',
    durability: 'i32',
    holderKind: 'u8',
    holderId: 'u32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface GrimoireRecord {
  /** One node per grimoire. */
  nodeId: ContentId;
  /** Species scribe-affinity raises this; dwarven books resist burning. */
  durability: Fp;
  /** {@link HOLDER_KIND}. */
  holderKind: Enum8;
  /** Mage or library handle; `0` when unowned or in transit. */
  holderId: Handle;
}

export const GRIMOIRE_FIELDS_MATCH: KeysMatch<GrimoireRecord, typeof GRIMOIRE> = true;

/** A knowledge instance (`contracts.md` §1.5) — knowledge as *state*. */
export const KNOWLEDGE_INSTANCE = {
  name: 'knowledge-instance',
  fields: {
    nodeId: 'u16',
    locationKind: 'u8',
    locationId: 'u32',
    acquiredTick: 'i32',
    mastery: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface KnowledgeInstanceRecord {
  /** The node this is an instance of. Nodes themselves are content, not state. */
  nodeId: ContentId;
  /** {@link LOCATION_KIND}. */
  locationKind: Enum8;
  /** Mage, grimoire, library, or mage handle, per `locationKind`. */
  locationId: Handle;
  acquiredTick: Tick;
  /** `0` just learned; `fp(1024)` teachable without loss. */
  mastery: Fp;
}

export const KNOWLEDGE_INSTANCE_FIELDS_MATCH: KeysMatch<
  KnowledgeInstanceRecord,
  typeof KNOWLEDGE_INSTANCE
> = true;

/**
 * The per-node **ever-known** record (`contracts.md` §1.5).
 *
 * §1.5 marks this *"persisted, and not derivable"*, and the distinction is
 * load-bearing: instances alone cannot tell a node this universe once held and
 * lost from one it never knew, and rediscovery — with its `rediscoveryMultiplier`
 * — requires exactly that distinction. This is why it is state and why the
 * node-existence index next door is emphatically not.
 *
 * §1.5 specifies no fields beyond the node itself, and none are invented here.
 */
export const EVER_KNOWN = {
  name: 'ever-known',
  fields: {
    nodeId: 'u16',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface EverKnownRecord {
  nodeId: ContentId;
}

export const EVER_KNOWN_FIELDS_MATCH: KeysMatch<EverKnownRecord, typeof EVER_KNOWN> = true;

// ---------------------------------------------------------------------------
// §1.6 Engagement-only entities.
// ---------------------------------------------------------------------------

/**
 * A combatant (`contracts.md` §1.6). Engagement-scale, and therefore the first
 * thing in this file with coordinates.
 *
 * `preparedSpells` is not a field here — see {@link PREPARED_SPELL}.
 */
export const COMBATANT = {
  name: 'combatant',
  fields: {
    sourceKind: 'u8',
    sourceId: 'u32',
    side: 'u8',
    x: 'i32',
    y: 'i32',
    hp: 'i32',
    maxHp: 'i32',
    vigor: 'i32',
    maxVigor: 'i32',
    concealment: 'i32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface CombatantRecord {
  /** {@link COMBATANT_SOURCE_KIND}. */
  sourceKind: Enum8;
  /** Handle into world state; `0` for summons. */
  sourceId: Handle;
  /** {@link RAID_SIDE}. */
  side: Enum8;
  /** Metres, fixed-point. The reference field is 200 m × 200 m (§0). */
  x: Fp;
  y: Fp;
  hp: Fp;
  maxHp: Fp;
  /** Carried from the source mage; the *host* tradition's `cost` hook spends it. */
  vigor: Fp;
  maxVigor: Fp;
  concealment: Fp;
}

export const COMBATANT_FIELDS_MATCH: KeysMatch<CombatantRecord, typeof COMBATANT> = true;

/**
 * One entry of §1.6's `preparedSpells`: **readied at home, spent abroad.**
 *
 * The raider's *home* `cast` hook populates this list at portal entry, drawing
 * on what her home `store` hook makes available; the *host's* `cast` hook
 * governs how casting consumes it and the host's `cost` hook sets the price.
 * That split is the only one under which vision §4a's "carries her own
 * preparations but pays the host's price" is literally true — a purely
 * host-governed `cast` would strip a Vancian raider of preparations entirely on
 * arrival.
 *
 * **Ordering within a combatant's list is not defined here.** §1.6 calls it an
 * array, and entity slot order is ascending but not insertion order after
 * churn. Whether a Vancian slot order matters, and what it is, belongs to
 * `raid-engagement`; adding an ordinal field now would pin a decision this
 * layer has no basis for.
 */
export const PREPARED_SPELL = {
  name: 'prepared-spell',
  fields: {
    combatantId: 'u32',
    nodeId: 'u16',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface PreparedSpellRecord {
  combatantId: Handle;
  nodeId: ContentId;
}

export const PREPARED_SPELL_FIELDS_MATCH: KeysMatch<PreparedSpellRecord, typeof PREPARED_SPELL> =
  true;

/** One entry of §1.6's `RaidState.objectives`. */
export const OBJECTIVE = {
  name: 'objective',
  fields: {
    kind: 'u8',
    targetId: 'u32',
    x: 'i32',
    y: 'i32',
    valueFp: 'i32',
    statusKind: 'u8',
    capturedBy: 'u32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

export interface ObjectiveRecord {
  /** Values are `raid-engagement`'s to name; see `OBJECTIVE_KIND_UNSPECIFIED`. */
  kind: Enum8;
  /** Handle into world state for what the objective stands on. */
  targetId: Handle;
  x: Fp;
  y: Fp;
  valueFp: Fp;
  /** {@link OBJECTIVE_STATUS}: held / captured / looted / destroyed. */
  statusKind: Enum8;
  /** Combatant handle, or `0`. */
  capturedBy: Handle;
}

export const OBJECTIVE_FIELDS_MATCH: KeysMatch<ObjectiveRecord, typeof OBJECTIVE> = true;

// ---------------------------------------------------------------------------
// Schemas.
// ---------------------------------------------------------------------------

/**
 * World-scale components, in snapshot order. **Append; do not reorder.**
 */
export const WORLD_COMPONENTS = [
  UNIVERSE,
  EDICT,
  ENCOURAGED_CELL,
  AXIS_CHANGE_COUNTER,
  MAGE,
  POPULACE_COHORT,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  LIBRARY,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  EVER_KNOWN,
  GOAL_COMMITMENT,
  EFFORT_PROGRESS,
] as const satisfies readonly ComponentSpec<ComponentFields>[];

/** Engagement-scale components, in snapshot order. */
export const ENGAGEMENT_COMPONENTS = [
  COMBATANT,
  PREPARED_SPELL,
  OBJECTIVE,
] as const satisfies readonly ComponentSpec<ComponentFields>[];

/**
 * Field names that make an entity positioned. Both of §0's coordinates, and
 * nothing else — a `radius` or a `facing` is not a position.
 */
export const POSITION_FIELD_NAMES: readonly string[] = ['x', 'y'];

/** Every world component that declares a positional field. Must always be empty. */
export function worldComponentsWithPosition(
  components: readonly ComponentSpec<ComponentFields>[] = WORLD_COMPONENTS,
): { component: string; field: string }[] {
  const found: { component: string; field: string }[] = [];
  for (const spec of components) {
    for (const field of Object.keys(spec.fields)) {
      if (POSITION_FIELD_NAMES.includes(field)) {
        found.push({ component: spec.name, field });
      }
    }
  }
  return found;
}

/**
 * Throws if any world-scale component carries a coordinate.
 *
 * §0 does not merely observe that world entities have no coordinates; it says
 * *"the component model must not assume otherwise"*. The failure this prevents
 * is not a crash — a world entity with an `x` would work perfectly, cost two
 * `int32` per mage in every Monte Carlo run, and grow rules that read a
 * position nothing ever writes. That reads as a mysterious clustering at the
 * origin, months later, rather than as a schema mistake.
 */
export function assertNoWorldPositions(
  components: readonly ComponentSpec<ComponentFields>[] = WORLD_COMPONENTS,
): void {
  const offenders = worldComponentsWithPosition(components);
  if (offenders.length > 0) {
    const listed = offenders.map((entry) => `${entry.component}.${entry.field}`).join(', ');
    throw new Error(
      `World-scale components must not carry coordinates, but ${listed} do. contracts.md §0: ` +
        'only engagement entities have positions, and the component model must not assume ' +
        'otherwise. If this entity genuinely needs a place on a battlefield, it is an engagement ' +
        'entity and belongs in ENGAGEMENT_COMPONENTS.',
    );
  }
}

/**
 * The world schema: every §1 world-scale component, plus whatever systems the
 * caller runs.
 *
 * Systems are a parameter because `contracts.md` §5 keeps rules out of this
 * package entirely — `state` describes shapes, and `rules-*` supply behaviour.
 * A schema with no systems is a perfectly valid world that simply does nothing,
 * which is what the round-trip and snapshot tests want.
 */
export function defineWorldStateSchema(systems: readonly System[] = []) {
  assertNoWorldPositions();
  return defineWorld({ components: [...WORLD_COMPONENTS], systems: [...systems] });
}

/**
 * Slots the engagement store may allocate.
 *
 * Bounded, unlike the world store. An engagement is short-lived and small, and
 * a cap turns runaway summon spawning into a loud failure instead of a memory
 * problem that only shows up on the machine with the least RAM.
 */
export const ENGAGEMENT_MAX_SLOTS = 8192;

/**
 * The engagement schema: combatants, their prepared spells, and objectives.
 *
 * **A separate schema, and therefore a separate store, is how §1.6's exclusion
 * from world snapshots is achieved.** See `./engagement.ts`.
 */
export function defineEngagementSchema(
  systems: readonly System[] = [],
  maxSlots: number = ENGAGEMENT_MAX_SLOTS,
) {
  return defineWorld({
    components: [...ENGAGEMENT_COMPONENTS],
    systems: [...systems],
    maxSlots,
  });
}

/**
 * A component's storage, typed by the layout it was declared with.
 *
 * The cast is checked, not assumed: the store's field names are compared with
 * the spec's before it is handed back. An unchecked cast here would be a lie
 * that only surfaces as a read of the wrong field, and reading a mage's
 * `caution` as her `vigor` is the kind of bug that survives a code review.
 */
export function componentOf<F extends ComponentFields>(
  state: SimState,
  spec: ComponentSpec<F>,
): ComponentStore<F> {
  const store = state.component(spec.name);
  const declared = Object.keys(spec.fields);
  const actual = [...store.fieldNames];
  if (declared.length !== actual.length || declared.some((name, i) => name !== actual[i])) {
    throw new Error(
      `Component "${spec.name}" in this world has fields [${actual.join(', ')}] but the layout ` +
        `declares [${declared.join(', ')}]. The state was built from a different schema.`,
    );
  }
  return store as unknown as ComponentStore<F>;
}
