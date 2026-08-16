/*
 * Multiverse Mages — the sandbox layer: cheat codes, and the brand that makes a
 * cheated run impossible to mistake for evidence.
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
 * An instrument, not a mechanic.
 *
 * Seventy-odd rules-path symbols have no production caller and a dozen
 * mechanisms have never fired in a shipped run — student capacity, spell
 * preparation, library destruction, snapshot loading. None of them is
 * *broken*; they are simply never reached, because reaching them means putting
 * a universe into a state a two-hundred-year passive run does not produce. This
 * file puts a universe into that state on purpose, so a person can watch
 * whether the mechanism fires.
 *
 * ## Why none of this is in the rules path
 *
 * There is no `if (sandbox)` anywhere under `packages/rules-*` or
 * `packages/coordination`, and there must never be. Everything here is a
 * **composition-root** concern, and it is expressed in the two shapes this
 * package already uses for exactly that:
 *
 * 1. **Founding-time cheats** run inside `Scenario.create`, after
 *    `buildReferenceState` and before tick 0 exists. `reference-universe.ts`
 *    already argues why that is legitimate — *"a scenario **is** the set of
 *    initial conditions"* — and a cheat is a starting position somebody
 *    declared out loud.
 * 2. **Per-tick cheats** run in {@link sandboxSystem}, one `System` installed
 *    **ahead of** the world loop, exactly the way `balanceTelemetrySystem` is
 *    installed ahead of it. It writes component rows the same way a rules
 *    system does and asks the rules for nothing.
 *
 * `referenceScenario` reads one optional field. With the field absent, every
 * line it executes is the line it executed before this file existed, including
 * the schema it builds — which is the whole of the inert-by-default claim and
 * is asserted by a snapshot-hash identity in `sandbox.test.ts` against hashes
 * measured on `origin/main` before this file was written.
 *
 * ## Determinism
 *
 * **Nothing here draws a random number.** No `ctx.rng`, no new stream id,
 * `packages/sim-core/src/rng/streams.ts` untouched. That is deliberate and it
 * is not an accident of the current cheat list: a cheat that drew would re-roll
 * a subsystem, and the layer whose purpose is to make runs *inspectable* would
 * be the layer that made them incomparable. Where a rules path would roll —
 * `scribe` rolls a book's durability — this writes a stated constant instead
 * ({@link SANDBOX_GRIMOIRE_DURABILITY}) and says so. `sandbox.test.ts` runs the
 * system against an `rng` that throws on contact, so the claim has a test and
 * not only a paragraph.
 *
 * All arithmetic is integer, fixed-point at 1/1024, like every other write to
 * these components.
 *
 * ## How a cheated run is branded, and why it cannot be laundered
 *
 * A sandbox scenario builds its world on a **different schema**: every
 * `WORLD_COMPONENTS` component plus {@link SANDBOX_BRAND}. Three consequences,
 * and each of them is the answer to a way somebody might come to believe a
 * cheated number six weeks from now:
 *
 * - The brand is **in the snapshot bytes**. `snapshot.ts` emits a section per
 *   component the schema declares, so the brand is inside the hashed payload
 *   rather than beside it. A cheated run's hash is not a reference run's hash
 *   and never can be.
 * - It **survives a save and a load**, and a load into an honest build
 *   *refuses*: `SimState.component` throws on a name the world does not
 *   declare, so `deserializeState(bytes, defineWorldStateSchema(...))` fails
 *   loudly on a branded snapshot rather than quietly dropping the brand. There
 *   is no build that can read the save and not know.
 * - It **cannot be cleared by playing on**. Nothing detaches the row: no god
 *   action touches it, the world loop does not declare the component, and
 *   {@link sandboxSystem} only ever ORs bits in. `cheatMask` is monotone by
 *   construction.
 *
 * Above that sit two softer markers that catch the cases where the bytes are
 * not what somebody is reading: the scenario id is
 * `sandbox:<reference id>:<digest>` rather than the reference one, so a
 * baseline keyed on the reference scenario cannot match; and
 * {@link sandboxProvenance} stamps the harness `Provenance` block, which
 * `provenanceProblems` now rejects — so a sweep built on a cheated run refuses
 * to dispatch and a baseline sealed from one refuses to load.
 */

import type {
  ComponentFields,
  ComponentSpec,
  EntityHandle,
  SimState,
  StepContext,
  System,
  WorldSchema,
} from '@mm/sim-core';
import { defineWorld } from '@mm/sim-core';
import type { ContentId } from '@mm/content';
import {
  GRANT_BUDGET,
  GRIMOIRE,
  HOLDER_KIND,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MATERIAL_STOCK,
  UNIVERSE,
  UNIVERSITY,
  WORLD_COMPONENTS,
  attachRecord,
  collectRecords,
  componentOf,
  findUniverse,
} from '@mm/state';
import { KnowledgeSubsystem, MASTERY_MAX, writtenInstanceLocation } from '@mm/rules-magic';
import { CLAIMANT_KIND, CONSUMPTION_ORDER } from '@mm/rules-world';
import type { ConsumptionKind } from '@mm/rules-world';
import { canonicalHash } from '@mm/mc-harness';
import type { Provenance } from '@mm/mc-harness';

/* ------------------------------------------------------------ material kinds */

/**
 * The material kinds, read out of {@link MATERIAL_STOCK}'s field list.
 *
 * **Derived, never listed.** There are three today and seven on
 * `w247/material-economy-build`; a sandbox that spelled `food, stone, vellum`
 * anywhere would silently offer three of seven the day that branch lands, and
 * the symptom would be an operator unable to grant `essence` with no error
 * anywhere. `sandbox.test.ts` cross-checks this against `rules-world`'s own
 * `MATERIAL_KINDS`, so the two disagreeing is a test failure rather than a
 * cheat that writes a field nothing reads.
 */
export const SANDBOX_MATERIAL_KINDS: readonly string[] = Object.freeze(
  Object.keys(MATERIAL_STOCK.fields).sort(),
);

/** The claimants, in the order `consumeMaterials` pays them. */
export const SANDBOX_CLAIMANTS: readonly ConsumptionKind[] = Object.freeze([...CONSUMPTION_ORDER]);

/**
 * Which stock a claimant is paid out of.
 *
 * Re-exported rather than re-derived, because the sandbox's "satisfy this
 * claimant" cheat is *exactly* a top-up of this kind, and any second answer
 * here would be a cheat that satisfied a different claimant than the one named.
 */
export const SANDBOX_CLAIMANT_KIND: Readonly<Record<ConsumptionKind, string>> = CLAIMANT_KIND;

/* -------------------------------------------------------------------- brand */

/** {@link SANDBOX_BRAND}'s layout revision. Bumped if a field moves. */
export const SANDBOX_BRAND_VERSION = 1;

/**
 * The mark a cheated universe carries for the rest of its life.
 *
 * Declared **here**, in the composition root, and deliberately not added to
 * `WORLD_COMPONENTS`. A snapshot emits a section per declared component whether
 * or not it has rows, so a brand in the world component set would move the
 * snapshot hash of every honest universe ever built — which is precisely the
 * control this layer has to keep green. Instead a sandbox world is built on
 * `WORLD_COMPONENTS + this`, and an honest world is built on exactly what it
 * was built on before.
 */
export const SANDBOX_BRAND = {
  name: 'sandbox-brand',
  fields: {
    /** {@link SANDBOX_BRAND_VERSION}. Non-zero on every branded universe. */
    version: 'u8',
    /** Which cheats have ever fired. See {@link SANDBOX_CHEAT}. Monotone. */
    cheatMask: 'u32',
    /** High 32 bits of the cheat sheet's digest; see {@link sandboxDigest}. */
    digestHi: 'u32',
    /** Low 32 bits of the same digest. */
    digestLo: 'u32',
    /** World tick the first cheat landed on, or `-1` if none ever has. */
    firstCheatTick: 'i32',
    /** World tick the most recent cheat landed on, or `-1`. */
    lastCheatTick: 'i32',
    /** How many cheats have been applied, saturating. */
    applications: 'u32',
  },
} as const satisfies ComponentSpec<ComponentFields>;

/** One row of {@link SANDBOX_BRAND}, as a reader sees it. */
export interface SandboxBrand {
  readonly version: number;
  readonly cheatMask: number;
  readonly digest: string;
  readonly firstCheatTick: number;
  readonly lastCheatTick: number;
  readonly applications: number;
  /** The names of every cheat in `cheatMask`, ascending by bit. */
  readonly cheats: readonly string[];
}

/**
 * The cheat kinds, one bit each.
 *
 * A bitmask rather than a list of strings because it has to live in a `u32`
 * component field and survive serialization; {@link sandboxBrandOf} renders it
 * back into names so nothing downstream has to know the numbering.
 */
export const SANDBOX_CHEAT = {
  /** A material stock was set outright. */
  setMaterial: 1 << 0,
  /** A material stock was added to. */
  grantMaterial: 1 << 1,
  /** A per-tick floor topped a stock up. The auto-satisfied consumer. */
  materialFloor: 1 << 2,
  /** A per-tick ceiling held a stock down. Starvation, on purpose. */
  materialCeiling: 1 << 3,
  favor: 1 << 4,
  favorCap: 1 << 5,
  prestige: 1 << 6,
  worship: 1 << 7,
  /** A technique or form was armed without paying for it. */
  armAxes: 1 << 8,
  edictBudget: 1 << 9,
  grantBudget: 1 << 10,
  /** A university's construction was finished outright. */
  completeConstruction: 1 << 11,
  /** A university and its library were founded from nothing. */
  foundUniversity: 1 << 12,
  /** Student seats were set on every university. */
  studentSeats: 1 << 13,
  /** A node was put in a mage's mind. */
  grantKnowledge: 1 << 14,
  /** A node was put on a library's shelf, book and all. */
  shelveKnowledge: 1 << 15,
} as const;

/** A cheat's name, by bit, ascending. */
const CHEAT_NAMES: readonly (readonly [number, string])[] = Object.freeze(
  Object.entries(SANDBOX_CHEAT)
    .map(([name, bit]) => [bit, name] as const)
    .sort((a, b) => a[0] - b[0]),
);

/**
 * The durability a sandbox-written grimoire gets.
 *
 * `scribe` rolls this on `RNG_STREAM.scribing`. This layer must not draw, so it
 * writes a stated constant instead — high enough that the book is not about to
 * crumble and therefore not a hidden second variable in whatever the operator
 * is watching. `fp(64)`.
 */
export const SANDBOX_GRIMOIRE_DURABILITY = 64 * 1024;

/* ----------------------------------------------------------- the cheat sheet */

/** A per-kind amount, in `fp`. Keys are {@link SANDBOX_MATERIAL_KINDS}. */
export type MaterialLevels = Readonly<Record<string, number>>;

/** One node handed to somebody, by content id. */
export interface KnowledgeGrant {
  readonly nodeId: ContentId;
  /**
   * Which holder, by index into the mages in slot order. Absent means the
   * first. Out of range is clamped rather than refused: an operator poking at a
   * universe should not have to know how many mages it has.
   */
  readonly holderIndex?: number;
  /** Mastery to grant, `fp`. Absent means {@link MASTERY_MAX}. */
  readonly mastery?: number;
}

/**
 * Everything the sandbox can do to a universe. Every field is optional, and an
 * empty sheet is a universe that is branded and otherwise untouched.
 *
 * Founding-time and per-tick fields are kept in one object on purpose: an
 * operator thinks in terms of *"the world I want to look at"*, not in terms of
 * when the write happens, and splitting them would make "grant vellum" and
 * "keep vellum topped up" look like unrelated features when they are the same
 * question asked once and asked forever.
 */
export interface SandboxSpec {
  /* -- founding ---------------------------------------------------------- */
  /** Stocks set outright at founding, by kind. */
  readonly setMaterials?: MaterialLevels;
  /** Stocks added to at founding, by kind. */
  readonly grantMaterials?: MaterialLevels;
  /** Favor set at founding. */
  readonly favor?: number;
  /**
   * Favor cap set at founding.
   *
   * Granting favor alone is safe — `applyRegeneration` never pulls a pool
   * *down* to the cap, it only refuses to add — but a god who is going to keep
   * spending wants the cap moved too, or regeneration stops contributing the
   * moment the grant is spent back down to it.
   */
  readonly favorCap?: number;
  /** Prestige set at founding. Also sets `prestigeEarned`, which §7 reads. */
  readonly prestige?: number;
  /** Worship pool set at founding. */
  readonly worship?: number;
  /** Worship tier set at founding. */
  readonly worshipTier?: number;
  /** Techniques armed at founding, as a bitmask ORed into the ruleset. */
  readonly armTechniques?: number;
  /** Forms armed at founding, as a bitmask ORed into the ruleset. */
  readonly armForms?: number;
  /**
   * Arm **every** technique and form the content declares — the whole seventy
   * cells rather than the v1 twelve.
   *
   * The masks are read from the content registry rather than written as
   * `0xff`/`0xffff`, so a universe opened this way holds exactly the axes that
   * exist and nothing that does not.
   */
  readonly armEverything?: boolean;
  /** Edict budget set at founding. */
  readonly edictBudget?: number;
  /** Founding-grant budget set at founding. */
  readonly grantBudget?: { readonly start?: number; readonly cap?: number };
  /** Finish every university's construction outright. */
  readonly completeConstruction?: boolean;
  /** Found this many extra universities, each with a library, free and finished. */
  readonly foundUniversities?: number;
  /** Student seats on every university. `0` makes the capacity rule bind. */
  readonly studentSeats?: number;
  /** Nodes put straight into mages' minds. */
  readonly grantKnowledge?: readonly KnowledgeGrant[];
  /** Nodes written into books and shelved in the first library. */
  readonly shelveKnowledge?: readonly ContentId[];

  /* -- every tick -------------------------------------------------------- */
  /**
   * Kinds held at or above a floor, every tick, **before any claimant runs**.
   *
   * This is the "auto-balance a consumer" verb in its honest form. Note what it
   * can and cannot promise: `consumeMaterials` tracks `remaining` **per kind**,
   * so the claimant order only ranks claimants that *share* a kind. Holding
   * vellum at a floor therefore satisfies `casting`, `libraryUpkeep` **and**
   * `scribing` — there is no way to feed the third without feeding the first
   * two, and a knob that implied otherwise would be lying about the economy.
   * {@link SandboxSpec.satisfy} is the same knob expressed in claimant names.
   */
  readonly materialFloor?: MaterialLevels;
  /**
   * Kinds held at or below a ceiling, every tick, before any claimant runs.
   *
   * The other direction, and it is the more useful half for the dead
   * mechanisms: vellum pinned at zero is how a person watches shelved knowledge
   * actually being destroyed, and food pinned at zero is how a person watches
   * the fertility brake bite.
   */
  readonly materialCeiling?: MaterialLevels;
  /**
   * Claimants whose demand is met every tick, named as claimants.
   *
   * Sugar over {@link SandboxSpec.materialFloor}: each claimant resolves
   * through {@link SANDBOX_CLAIMANT_KIND} to its kind, and that kind is floored
   * at {@link SandboxSpec.satisfyFloor}. Read the caveat on `materialFloor`
   * before believing a per-claimant reading of this.
   */
  readonly satisfy?: readonly ConsumptionKind[];
  /**
   * The floor {@link SandboxSpec.satisfy} uses, `fp`. Absent means
   * {@link SANDBOX_SATISFY_FLOOR}.
   */
  readonly satisfyFloor?: number;
}

/**
 * The stock a satisfied claimant's kind is held at when none is named.
 *
 * `fp(1,000,000)`. Arbitrary, and it does not need to be otherwise: the point
 * of a satisfied claimant is that it never runs short, and any number the
 * economy cannot spend in a tick achieves that. It is stated as a constant so
 * that a run which *did* run short at this level is a finding rather than a
 * mystery.
 */
export const SANDBOX_SATISFY_FLOOR = 1_000_000 * 1024;

/* ------------------------------------------------------------ normalization */

/** A cheat sheet reduced to canonical form, for hashing and for display. */
export interface NormalizedSandbox {
  readonly spec: SandboxSpec;
  /** 16 lowercase hex characters over the canonical spec. */
  readonly digest: string;
  /** Kind -> floor, `fp`, with {@link SandboxSpec.satisfy} folded in. */
  readonly floors: Readonly<Record<string, number>>;
  /** Kind -> ceiling, `fp`. */
  readonly ceilings: Readonly<Record<string, number>>;
  /** Whether anything at all is asked for beyond the brand. */
  readonly empty: boolean;
}

const knownKind = (kind: string): boolean => SANDBOX_MATERIAL_KINDS.includes(kind);

/**
 * Refuses a kind the world does not have.
 *
 * Loud rather than ignored, and this is the one place it matters most: a
 * console that let somebody grant `essence` on a three-kind build and reported
 * success would be the "checker that answers about the wrong input" shape this
 * repository has found five of. An operator who cannot grant a kind should be
 * told which kinds exist.
 */
function requireKinds(levels: MaterialLevels | undefined, where: string): void {
  for (const kind of Object.keys(levels ?? {})) {
    if (!knownKind(kind)) {
      throw new Error(
        `${where} names material kind "${kind}", which this content does not have. The kinds ` +
          `MATERIAL_STOCK declares are: ${SANDBOX_MATERIAL_KINDS.join(', ')}.`,
      );
    }
  }
}

/** Sorted, or `null` when there is nothing — so an empty object hashes as absent. */
function sortedLevels(levels: MaterialLevels | undefined): Record<string, number> | null {
  const keys = Object.keys(levels ?? {}).sort();
  if (keys.length === 0) return null;
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = Math.trunc((levels as MaterialLevels)[key] as number);
  return out;
}

/** Canonicalizes a cheat sheet: sorted keys, resolved sugar, one digest. */
export function normalizeSandbox(spec: SandboxSpec): NormalizedSandbox {
  requireKinds(spec.setMaterials, 'setMaterials');
  requireKinds(spec.grantMaterials, 'grantMaterials');
  requireKinds(spec.materialFloor, 'materialFloor');
  requireKinds(spec.materialCeiling, 'materialCeiling');
  for (const claimant of spec.satisfy ?? []) {
    if (!SANDBOX_CLAIMANTS.includes(claimant)) {
      throw new Error(
        `satisfy names claimant "${String(claimant)}", which is not one of the ` +
          `${String(SANDBOX_CLAIMANTS.length)} the consumption order declares: ` +
          `${SANDBOX_CLAIMANTS.join(', ')}.`,
      );
    }
  }

  const floors: Record<string, number> = {};
  for (const [kind, value] of Object.entries(spec.materialFloor ?? {})) {
    floors[kind] = Math.max(floors[kind] ?? 0, Math.trunc(value));
  }
  const satisfyAt = Math.trunc(spec.satisfyFloor ?? SANDBOX_SATISFY_FLOOR);
  for (const claimant of spec.satisfy ?? []) {
    const kind = SANDBOX_CLAIMANT_KIND[claimant];
    floors[kind] = Math.max(floors[kind] ?? 0, satisfyAt);
  }
  const ceilings: Record<string, number> = {};
  for (const [kind, value] of Object.entries(spec.materialCeiling ?? {})) {
    ceilings[kind] = Math.trunc(value);
  }
  // A kind both floored and capped below its floor is a contradiction, and the
  // floor runs second and would win every tick while the ceiling read as if it
  // were in force. Refused rather than resolved, for the reason
  // `foundingSpeciesMask` refuses a mask that selects nothing.
  for (const [kind, ceiling] of Object.entries(ceilings)) {
    const floor = floors[kind];
    if (floor !== undefined && ceiling < floor) {
      throw new Error(
        `Material kind "${kind}" is floored at ${String(floor)} and capped at ${String(ceiling)}. ` +
          'The floor runs second and would win every tick, so the ceiling would be recorded as in ' +
          'force while doing nothing.',
      );
    }
  }

  const canonical = {
    setMaterials: sortedLevels(spec.setMaterials),
    grantMaterials: sortedLevels(spec.grantMaterials),
    favor: spec.favor ?? null,
    favorCap: spec.favorCap ?? null,
    prestige: spec.prestige ?? null,
    worship: spec.worship ?? null,
    worshipTier: spec.worshipTier ?? null,
    armTechniques: spec.armTechniques ?? 0,
    armForms: spec.armForms ?? 0,
    armEverything: spec.armEverything === true,
    edictBudget: spec.edictBudget ?? null,
    grantBudget: spec.grantBudget ?? null,
    completeConstruction: spec.completeConstruction === true,
    foundUniversities: spec.foundUniversities ?? 0,
    studentSeats: spec.studentSeats ?? null,
    grantKnowledge: [...(spec.grantKnowledge ?? [])].map((grant) => ({
      nodeId: grant.nodeId,
      holderIndex: grant.holderIndex ?? 0,
      mastery: grant.mastery ?? MASTERY_MAX,
    })),
    shelveKnowledge: [...(spec.shelveKnowledge ?? [])],
    floors: sortedLevels(floors),
    ceilings: sortedLevels(ceilings),
  };

  const digest = canonicalHash(canonical, 'sandbox-cheat-sheet').slice(0, 16);
  const empty =
    canonical.setMaterials === null &&
    canonical.grantMaterials === null &&
    canonical.favor === null &&
    canonical.favorCap === null &&
    canonical.prestige === null &&
    canonical.worship === null &&
    canonical.worshipTier === null &&
    canonical.armTechniques === 0 &&
    canonical.armForms === 0 &&
    !canonical.armEverything &&
    canonical.edictBudget === null &&
    canonical.grantBudget === null &&
    !canonical.completeConstruction &&
    canonical.foundUniversities === 0 &&
    canonical.studentSeats === null &&
    canonical.grantKnowledge.length === 0 &&
    canonical.shelveKnowledge.length === 0 &&
    canonical.floors === null &&
    canonical.ceilings === null;

  return { spec, digest, floors, ceilings, empty };
}

/** The 16-hex digest of a cheat sheet. The scenario id and the brand carry it. */
export function sandboxDigest(spec: SandboxSpec): string {
  return normalizeSandbox(spec).digest;
}

/* ------------------------------------------------------------------- schema */

/**
 * The world schema a sandbox universe is built on: every world component, plus
 * the brand.
 *
 * `defineWorldStateSchema` cannot be reused because it closes over
 * `WORLD_COMPONENTS` by design — `state` owns the world's component set, and
 * this package has no business editing it. Building the schema here instead is
 * what keeps the brand out of every honest universe's snapshot.
 */
export function defineSandboxWorldSchema(systems: readonly System[] = []): WorldSchema {
  return defineWorld({
    components: [...WORLD_COMPONENTS, SANDBOX_BRAND],
    systems: [...systems],
  });
}

/** Whether a world declares the brand at all — i.e. whether it is a sandbox. */
export function isSandboxSchema(schema: WorldSchema): boolean {
  return schema.components.some((component) => component.name === SANDBOX_BRAND.name);
}

/* -------------------------------------------------------------------- brand */

const U32_MAX = 0xffff_ffff;

/**
 * The stock store, with its field names widened to `string`.
 *
 * One cast, in one place, with the reason written down. Every material cheat is
 * keyed by a kind that arrives as data — from an HTTP body, from a cheat sheet
 * a person typed — and `ComponentStore.set` is typed on the literal field
 * names. `requireKinds` has already refused any name `MATERIAL_STOCK` does not
 * declare, so the cast is checked; casting at each of the six call sites
 * instead would put six unexplained assertions in the file and make the
 * seven-kind economy a six-line edit rather than a no-op.
 */
interface LooseStore {
  has(handle: EntityHandle): boolean;
  get(handle: EntityHandle, name: string): number;
  set(handle: EntityHandle, name: string, value: number): void;
}

const stockOf = (state: SimState): LooseStore =>
  componentOf(state, MATERIAL_STOCK) as unknown as LooseStore;

/** Reads the brand, or `undefined` on an honest universe. */
export function sandboxBrandOf(state: SimState): SandboxBrand | undefined {
  if (!isSandboxSchema(state.schema)) return undefined;
  const row = collectRecords(state, SANDBOX_BRAND)[0]?.row;
  if (row === undefined) return undefined;
  const digest =
    row.digestHi.toString(16).padStart(8, '0') + row.digestLo.toString(16).padStart(8, '0');
  const cheats: string[] = [];
  for (const [bit, name] of CHEAT_NAMES) {
    if ((row.cheatMask & bit) !== 0) cheats.push(name);
  }
  return {
    version: row.version,
    cheatMask: row.cheatMask,
    digest,
    firstCheatTick: row.firstCheatTick,
    lastCheatTick: row.lastCheatTick,
    applications: row.applications,
    cheats,
  };
}

/** Attaches an unfired brand to the universe. Called once, inside `create`. */
function brandUniverse(state: SimState, universe: EntityHandle, digest: string): void {
  attachRecord(state, SANDBOX_BRAND, universe, {
    version: SANDBOX_BRAND_VERSION,
    digestHi: Number.parseInt(digest.slice(0, 8), 16),
    digestLo: Number.parseInt(digest.slice(8, 16), 16),
    cheatMask: 0,
    firstCheatTick: -1,
    lastCheatTick: -1,
    applications: 0,
  });
}

/**
 * Records that a cheat fired. **The only writer, and it only ever adds.**
 *
 * `cheatMask |=`, never `=`; `applications` saturates rather than wrapping, for
 * the reason `noteIllegalAction` saturates — a counter that wrapped would read
 * as *fewer cheats than happened*, which is the one direction this field must
 * never be wrong in.
 */
function noteCheat(state: SimState, bit: number, tick: number): void {
  const store = componentOf(state, SANDBOX_BRAND);
  const universe = findUniverse(state);
  if (universe === 0 || !store.has(universe)) return;
  store.set(universe, 'cheatMask', store.get(universe, 'cheatMask') | bit);
  if (store.get(universe, 'firstCheatTick') < 0) store.set(universe, 'firstCheatTick', tick);
  store.set(universe, 'lastCheatTick', tick);
  const applied = store.get(universe, 'applications');
  if (applied < U32_MAX) store.set(universe, 'applications', applied + 1);
}

/* ---------------------------------------------------------- founding cheats */

/** What a founding-time application needs beyond the state. */
export interface SandboxFoundingDeps {
  /** Every technique bit the content declares, ORed together. */
  readonly allTechniques: number;
  /** Every form bit the content declares, ORed together. */
  readonly allForms: number;
  /** Interned node count, for the knowledge subsystem. */
  readonly nodeCount: number;
}

/** A university and its library, free and finished. Returns the university. */
export function foundUniversity(state: SimState, capacity: number): EntityHandle {
  const library = state.entities.create();
  attachRecord(state, LIBRARY, library, { foundedTick: state.clock.worldTick });
  const university = state.entities.create();
  attachRecord(state, UNIVERSITY, university, {
    libraryId: library,
    capacity: Math.trunc(capacity),
    buildProgress: 1024,
  });
  return university;
}

/**
 * Puts nodes in minds and books on shelves.
 *
 * Split out because it is the one founding cheat that is also legal mid-run:
 * `KnowledgeSubsystem` is rebuilt from state on every call, exactly as the
 * world loop's own `knowledgeFor` rebuilds it every tick, so writing through a
 * fresh subsystem before the loop runs leaves nothing stale for the loop to
 * read.
 */
export function applyKnowledgeCheats(
  state: SimState,
  spec: SandboxSpec,
  nodeCount: number,
  tick: number,
): void {
  const grants = spec.grantKnowledge ?? [];
  const shelves = spec.shelveKnowledge ?? [];
  if (grants.length === 0 && shelves.length === 0) return;

  const knowledge = KnowledgeSubsystem.fromState(state, nodeCount);
  const mages = collectRecords(state, MAGE).map(({ handle }) => handle);
  for (const grant of grants) {
    const holder = mages[Math.min(Math.max(grant.holderIndex ?? 0, 0), mages.length - 1)];
    if (holder === undefined) continue;
    knowledge.createInstance({
      nodeId: grant.nodeId,
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      acquiredTick: tick,
      mastery: grant.mastery ?? MASTERY_MAX,
    });
    noteCheat(state, SANDBOX_CHEAT.grantKnowledge, tick);
  }

  const library = collectRecords(state, LIBRARY)[0]?.handle;
  if (library === undefined) return;
  for (const nodeId of shelves) {
    const grimoire = state.entities.create();
    attachRecord(state, GRIMOIRE, grimoire, {
      nodeId,
      durability: SANDBOX_GRIMOIRE_DURABILITY,
      holderKind: HOLDER_KIND.library,
      holderId: library,
    });
    const location = writtenInstanceLocation(grimoire, HOLDER_KIND.library, library);
    knowledge.createInstance({
      nodeId,
      locationKind: location.locationKind,
      locationId: location.locationId,
      acquiredTick: tick,
      // A book does not know its subject well or badly; it says what it says.
      // `scribe`'s wording, and its value.
      mastery: 0,
      grimoire,
    });
    noteCheat(state, SANDBOX_CHEAT.shelveKnowledge, tick);
  }
}

/**
 * Applies every founding-time cheat, in a fixed order, to a freshly built
 * state.
 *
 * Called from `Scenario.create` **after** `buildReferenceState` and before the
 * state is handed to anybody. It is a pure function of its arguments and draws
 * nothing, so a sandbox scenario stays reproducible from its coordinates the
 * way `Scenario.create` requires.
 */
export function applyFoundingCheats(
  state: SimState,
  normalized: NormalizedSandbox,
  deps: SandboxFoundingDeps,
): void {
  const { spec } = normalized;
  const universe = findUniverse(state);
  brandUniverse(state, universe, normalized.digest);
  const tick = state.clock.worldTick;

  const stock = stockOf(state);
  for (const [kind, value] of Object.entries(spec.setMaterials ?? {})) {
    stock.set(universe, kind, Math.trunc(value));
    noteCheat(state, SANDBOX_CHEAT.setMaterial, tick);
  }
  for (const [kind, value] of Object.entries(spec.grantMaterials ?? {})) {
    stock.set(universe, kind, stock.get(universe, kind) + Math.trunc(value));
    noteCheat(state, SANDBOX_CHEAT.grantMaterial, tick);
  }

  const uni = componentOf(state, UNIVERSE);
  if (spec.favor !== undefined) {
    uni.set(universe, 'favor', Math.trunc(spec.favor));
    noteCheat(state, SANDBOX_CHEAT.favor, tick);
  }
  if (spec.favorCap !== undefined) {
    uni.set(universe, 'favorCap', Math.trunc(spec.favorCap));
    noteCheat(state, SANDBOX_CHEAT.favorCap, tick);
  }
  if (spec.prestige !== undefined) {
    uni.set(universe, 'prestige', Math.trunc(spec.prestige));
    // `prestigeEarned` is the lifetime total §7 reads; leaving it at zero would
    // make a granted universe look like one that had spent everything it ever
    // earned, which is a different universe than the one that was asked for.
    uni.set(universe, 'prestigeEarned', Math.trunc(spec.prestige));
    noteCheat(state, SANDBOX_CHEAT.prestige, tick);
  }
  if (spec.worship !== undefined) {
    uni.set(universe, 'worship', Math.trunc(spec.worship));
    noteCheat(state, SANDBOX_CHEAT.worship, tick);
  }
  if (spec.worshipTier !== undefined) {
    uni.set(universe, 'worshipTier', Math.trunc(spec.worshipTier));
    noteCheat(state, SANDBOX_CHEAT.worship, tick);
  }
  if (spec.edictBudget !== undefined) {
    uni.set(universe, 'edictBudget', Math.trunc(spec.edictBudget));
    noteCheat(state, SANDBOX_CHEAT.edictBudget, tick);
  }

  const techniques =
    (spec.armEverything === true ? deps.allTechniques : 0) | (spec.armTechniques ?? 0);
  const forms = (spec.armEverything === true ? deps.allForms : 0) | (spec.armForms ?? 0);
  if (techniques !== 0 || forms !== 0) {
    uni.set(universe, 'permittedTechniques', uni.get(universe, 'permittedTechniques') | techniques);
    uni.set(universe, 'permittedForms', uni.get(universe, 'permittedForms') | forms);
    noteCheat(state, SANDBOX_CHEAT.armAxes, tick);
  }

  if (spec.grantBudget !== undefined) {
    const budget = componentOf(state, GRANT_BUDGET);
    if (budget.has(universe)) {
      if (spec.grantBudget.start !== undefined) {
        budget.set(universe, 'startingGrants', Math.trunc(spec.grantBudget.start));
      }
      if (spec.grantBudget.cap !== undefined) {
        budget.set(universe, 'cap', Math.trunc(spec.grantBudget.cap));
      }
      // Whatever has been spent is forgiven: a budget cheat that left
      // `grantsUsed` alone would raise a ceiling the god was already under and
      // read as having done nothing.
      budget.set(universe, 'grantsUsed', 0);
      noteCheat(state, SANDBOX_CHEAT.grantBudget, tick);
    }
  }

  const universities = collectRecords(state, UNIVERSITY);
  if (spec.completeConstruction === true) {
    const store = componentOf(state, UNIVERSITY);
    for (const { handle } of universities) store.set(handle, 'buildProgress', 1024);
    noteCheat(state, SANDBOX_CHEAT.completeConstruction, tick);
  }
  if (spec.studentSeats !== undefined) {
    const store = componentOf(state, UNIVERSITY);
    const seats = Math.trunc(spec.studentSeats);
    for (const { handle } of universities) store.set(handle, 'capacity', seats);
    noteCheat(state, SANDBOX_CHEAT.studentSeats, tick);
  }
  for (let index = 0; index < (spec.foundUniversities ?? 0); index += 1) {
    foundUniversity(state, spec.studentSeats ?? 64);
    noteCheat(state, SANDBOX_CHEAT.foundUniversity, tick);
  }

  applyKnowledgeCheats(state, spec, deps.nodeCount, tick);
}

/* ---------------------------------------------------------------- the system */

/**
 * The one per-tick cheat, installed **ahead of** the world loop.
 *
 * It holds each named kind between its ceiling and its floor, and does nothing
 * else. Ahead of the loop, because that is where a top-up has to happen for it
 * to be true of the tick the claimants are paid on: installed behind, the floor
 * would describe a stock that had already been spent, and every shortfall the
 * operator was trying to prevent would still be recorded.
 *
 * **It draws no randomness and requests no clock transition.** `step` keys
 * every stream on `(subsystemId, stepOrdinal)` rather than on a system's
 * position in the schema, so a system that never calls `ctx.rng` displaces no
 * other subsystem's sequence — the same argument `balanceTelemetrySystem`
 * makes, and the reason installing this one first is safe.
 */
export function sandboxSystem(normalized: NormalizedSandbox): System {
  const floors = Object.entries(normalized.floors);
  const ceilings = Object.entries(normalized.ceilings);
  return {
    name: 'sandbox-cheats',
    run(ctx: StepContext): void {
      if (floors.length === 0 && ceilings.length === 0) return;
      const state = ctx.state;
      const universe = findUniverse(state);
      if (universe === 0) return;
      const stock = stockOf(state);
      if (!stock.has(universe)) return;
      for (const [kind, ceiling] of ceilings) {
        if (stock.get(universe, kind) > ceiling) {
          stock.set(universe, kind, ceiling);
          noteCheat(state, SANDBOX_CHEAT.materialCeiling, ctx.tick);
        }
      }
      for (const [kind, floor] of floors) {
        if (stock.get(universe, kind) < floor) {
          stock.set(universe, kind, floor);
          noteCheat(state, SANDBOX_CHEAT.materialFloor, ctx.tick);
        }
      }
    },
  };
}

/* --------------------------------------------------------------- provenance */

/** The scenario id a cheated run records: never the reference one. */
export function sandboxScenarioId(referenceId: string, digest: string): string {
  return `sandbox:${referenceId}:${digest}`;
}

/**
 * Stamps a harness provenance block as sandboxed.
 *
 * The value is the cheat-sheet digest, so two cheated runs taken under
 * different sheets are distinguishable rather than both reading "sandbox". The
 * *presence* of the key is what `provenanceProblems` refuses on; the value is
 * for the human reading the refusal.
 */
export function sandboxProvenance(base: Provenance, digest: string): Provenance {
  return { ...base, sandbox: digest };
}
