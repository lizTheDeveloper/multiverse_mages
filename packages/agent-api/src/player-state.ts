/*
 * Multiverse Mages — what a player is entitled to observe, named rather than positional.
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
 * `docs/design/observation-entitlement.md`'s reducer: the world projected to
 * what its player may see, as **named fields** rather than as 400 anonymous
 * slots.
 *
 * ## Why a named intermediate exists at all
 *
 * `ObservationSlot` carries `index`, `block`, `blockIndex` and `descriptor` —
 * how a channel is *scaled*, never what it *is*. `OBSERVATION_LAYOUT_DIGEST`
 * hashes positions and normalization rules, so it would catch a slot moving and
 * would **not** notice every slot being about the wrong thing. A strategy author
 * reads `observation[36]` and has to already know that is favor.
 *
 * So {@link PlayerState} states the entitlement and {@link encodePlayerState}
 * states the encoding, and the two are separately reviewable. Three consequences
 * the design names:
 *
 * 1. A strategy reads `player.resources.favor`, not `observation[36]`.
 * 2. Withholding becomes expressible. Today absence and oversight are
 *    indistinguishable; `docs/design/observable-trait-inventory.md` counts 76
 *    withheld traits, 70 of them for no recorded reason at all.
 * 3. Renormalizing a channel moves the digest, not the entitlement.
 *
 * ## This file deliberately duplicates `./observation.ts`
 *
 * {@link project} re-derives every aggregate rather than calling
 * `rawObservation` and decoding it. That is the whole value of the round-trip
 * test: if the projection delegated to the encoder, byte-identity would be true
 * by construction and would prove nothing about whether the reducer is faithful.
 * It is an independent implementation checked against the shipped one.
 *
 * The duplication is intended to be temporary. Once the entitlement is the
 * definition rather than a parallel description, `rawObservation` becomes
 * `encodePlayerState(project(input))` and this note comes out. Doing that
 * inversion *now* would delete the only evidence that the two agree.
 *
 * ## Saturation is replicated exactly, including where it is absent
 *
 * `saturate` is applied by the encoder at *specific* points, and they are not
 * uniform: the population and mage histograms saturate on every accumulation
 * step, while `institutions[1]` sums university capacity in a plain `number` and
 * saturates only the total. Those differ once a sum passes 2^31. Every
 * saturation point below matches `./observation.ts` line for line, because a
 * reducer that clamped in a different place would be byte-identical on every
 * fixture anyone thought to write and wrong on the universe that overflowed.
 *
 * ## No second float path
 *
 * The design sketches `encode(PlayerState): Float64Array`. What ships here is
 * `Int32Array` — the *raw* vector — because `./normalize.ts` already owns the
 * one permitted float boundary and `normalizedObservation` turns a raw vector
 * into the exported one. A second normalizer would be a second place for a
 * descriptor to be applied, which is the divergence `layout.ts` exists to
 * prevent. `normalizedObservation(encodePlayerState(project(input)))` is the
 * float path, and it is the existing one.
 */

import type { SimState } from '@mm/sim-core';
import { TIME_MODE, eraOf } from '@mm/sim-core';
import type { Edict, MaterialStockRecord, Ruleset } from '@mm/state';
import {
  COMBATANT,
  EDICT_BUDGET_MAX,
  GRID_CELL_COUNT,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  MATERIAL_STOCK,
  OBJECTIVE,
  POPULACE_COHORT,
  PREPARED_SPELL,
  RAID_SIDE,
  UNIVERSITY,
  collectRecords,
  componentOf,
  findUniverse,
  readEdicts,
  readUniverse,
} from '@mm/state';

import type { ContentCatalogue } from './catalogue.js';
import type { ObservationInput } from './observation.js';
import {
  MAGE_TIER_SLOTS,
  OBSERVATION_OBJECTIVE_CHANNELS,
  OBSERVATION_OBJECTIVE_SLOTS,
  OBSERVATION_OCCUPATION_COUNT,
  OBSERVATION_SIDE_CHANNELS,
  OBSERVATION_SIZE,
  OBSERVATION_SPECIES_COUNT,
  UNTAUGHT_TIER_SLOT,
  cohortSlot,
  knowledgeSlot,
  mageTierSlot,
  observationBlock,
  saturate,
} from './layout.js';

// ---------------------------------------------------------------------------
// The entitlement, as types.
// ---------------------------------------------------------------------------

/*
 * There is deliberately no `PlayerRuleset` type here. `@mm/state` already
 * exports `Ruleset` — `{permittedTechniques, permittedForms, edicts}` — and
 * `packages/state/test/unit/schema-duplication.test.ts` rejects a second
 * declaration of it by shape, naming the reason exactly: *"a hand-rolled
 * {permittedTechniques, permittedForms, edicts} is step one of a second
 * permits()"*. It caught the first draft of this file, which expanded the two
 * bitfields into flag arrays.
 *
 * Consuming the shared type is the better design anyway, and the guard is what
 * made that obvious. **Expanding a bitmask into nineteen slots is an *encoding*
 * decision, not an entitlement one** — the design's third stated reason for a
 * named intermediate is that encoding stays free to change — so the expansion
 * belongs in `encodePlayerState` and the entitlement is the ruleset itself. The
 * practical payoff: a strategy holding a `PlayerState` can call
 * `permits(player.ruleset, cellId)` directly, rather than reimplementing
 * interdiction precedence against a flag array.
 *
 * `universe.edictBudget` is still absent, and that is the deliberate part: the
 * inventory records it withheld, so a player sees the edicts standing and not
 * how many more may be issued. `PlayerState.ruleset.edicts` is truncated at
 * `EDICT_BUDGET_MAX` because that is what actually reaches a player, not merely
 * what fits.
 */

/**
 * §1.1's five resource channels, plus the seven stocks held under their names.
 *
 * `materials` stays the **sum of `food`, `stone` and `vellum`** and means
 * exactly what it always meant, because the §4.1 *observation* carries one slot
 * for it and widening that slot is a contract change nobody has scheduled —
 * vision §6: *"a resize invalidates every trained agent."* That constraint is
 * the encoder's and it is real.
 *
 * It is **not** this projection's constraint, and conflating the two is what
 * left a client unable to draw numbers the world plainly holds. This type is
 * what a *player* may see; `encodePlayerState` is what an *agent* is handed, and
 * only the latter is bound by the vector's width. So the stocks are carried here
 * individually **and** the three land kinds are summed into `materials`, the
 * encoder keeps writing that one sum into its one slot, and `OBSERVATION_SIZE`,
 * `OBSERVATION_LAYOUT_DIGEST` and `OBSERVATION_SCHEMA_VERSION` do not move. That
 * unchanged digest is the property that makes this cheap, and
 * `entitlement.test.ts` pins it.
 *
 * The consequence for an agent is unchanged and still recorded in
 * `entitlement.ts` as `aggregated('resources[39]')`: a *policy* cannot tell a
 * food shortage from a vellum one. A *client* can.
 *
 * `materials` deliberately does **not** grow to seven kinds. It is a documented
 * quantity with a fixed meaning that the observation slot must keep matching,
 * and four of the seven are not land yield at all — `insight` is what a faculty
 * teaches out of and `passage` is what a threshold is held open with. Summing
 * them into a number labelled *"food + stone + vellum"* would make one field
 * mean two things depending on which side of the encoder read it.
 *
 * `favorCap` is withheld, so `favor` is readable and its ceiling is not.
 *
 * ## Why {@link stocks} is a nested `MaterialStockRecord` and not seven fields
 *
 * An earlier draft inlined the kinds here as siblings of `materials`.
 * `state`'s `schema-duplication` check refused it, and it was right to: a type
 * whose fields are a superset of a `@mm/state` record is a second declaration of
 * a §1 entity however it is named, and two declarations of one entity drift.
 * Consuming `MaterialStockRecord` instead means an eighth kind — the schema is
 * `MATERIAL_STOCK`'s to change — arrives here without anyone editing this file,
 * rather than being silently dropped from every client by a projection that had
 * transcribed the field list. That is exactly what happened when the record grew
 * from three kinds to seven: this file needed no edit.
 */
export interface PlayerResources {
  readonly favor: number;
  readonly worship: number;
  readonly worshipTier: number;
  /** `food + stone + vellum`. What the observation's one slot carries. */
  readonly materials: number;
  /** The carried-in stock. `prestigeEarned` is withheld. */
  readonly prestige: number;
  /**
   * Every material kind under its own name. `@mm/state`'s own record, consumed
   * rather than copied — see the note above. Reaches no observation slot.
   */
  readonly stocks: MaterialStockRecord;
}

/** One cell's three knowledge channels. */
export interface PlayerKnowledgeCell {
  readonly nodesKnown: number;
  readonly deepestTier: number;
  /** §4.1's "instance redundancy": the raw count, not the surplus. */
  readonly instances: number;
}

/**
 * What every university, library and grimoire in the universe amounts to.
 *
 * Four numbers over four components holding ten fields between them — the
 * lossiest mapping in the vector, and the inventory's third surprising row.
 * `libraryDepth` is distinct nodes at `locationKind === library`, derived from
 * `knowledge-instance` and **not** from the `LIBRARY` component, which
 * `agent-api` never reads: how many libraries exist is not observable at all.
 */
export interface PlayerInstitutions {
  readonly universityCount: number;
  /** Summed across every university, finished or not. */
  readonly universityCapacity: number;
  /** Distinct nodes held in libraries. */
  readonly libraryDepth: number;
  readonly grimoireCount: number;
}

/** Where in the run the player is. No component backs any of these. */
export interface PlayerClock {
  readonly worldTick: number;
  readonly era: number;
  readonly inEngagement: boolean;
}

/** One side of an engagement, in {@link ENGAGEMENT_SIDE_CHANNELS} order. */
export interface PlayerSide {
  readonly combatantCount: number;
  readonly hpTotal: number;
  readonly maxHpTotal: number;
  readonly vigorTotal: number;
  readonly maxVigorTotal: number;
  /** Summed for the enemy side too — the one aggregate that crosses the line. */
  readonly concealmentTotal: number;
  readonly preparedSpellCount: number;
}

/** One objective slot. `capturedBy` reaches the player only as {@link captured}. */
export interface PlayerObjective {
  readonly kind: number;
  readonly statusKind: number;
  readonly valueFp: number;
  /** Whether *anyone* holds it. The captor's identity is withheld. */
  readonly captured: boolean;
}

/** The raid, from the observing universe's side. */
export interface PlayerEngagement {
  readonly own: PlayerSide;
  readonly enemy: PlayerSide;
  /** The `OBSERVATION_OBJECTIVE_SLOTS` most valuable, most valuable first. */
  readonly objectives: readonly PlayerObjective[];
  readonly portalStability: number;
  readonly stabilityDecayPerTick: number;
}

/**
 * Everything a player is entitled to observe, named.
 *
 * One field per entitled trait — the classification in
 * `docs/design/observable-trait-inventory.md` is what decides membership, and a
 * trait that is WITHHELD there has no field here. That is the point: absence
 * from this type is now a *statement*, where absence from the 400-slot vector
 * was indistinguishable from an oversight.
 */
export interface PlayerState {
  /** `@mm/state`'s shared `Ruleset`, so `permits()` takes it as-is. */
  readonly ruleset: Ruleset;
  /** §1.1: exactly one is held, never `0`. */
  readonly traditionId: number;
  readonly resources: PlayerResources;
  /** `OBSERVATION_SPECIES_COUNT × OBSERVATION_OCCUPATION_COUNT`, in `cohortSlot` order. */
  readonly population: readonly number[];
  /** `OBSERVATION_SPECIES_COUNT × MAGE_TIER_SLOTS`, in `mageTierSlot` order. Bucket 0 knows nothing. */
  readonly mages: readonly number[];
  /** `GRID_CELL_COUNT` cells, ascending by cell id. */
  readonly knowledge: readonly PlayerKnowledgeCell[];
  readonly institutions: PlayerInstitutions;
  readonly clock: PlayerClock;
  /** Absent at world scale, where the engagement block is zero-filled. */
  readonly engagement: PlayerEngagement | undefined;
}

// ---------------------------------------------------------------------------
// The reducer.
// ---------------------------------------------------------------------------

/**
 * The same single-pass knowledge digest `./observation.ts` builds.
 *
 * Re-derived rather than shared, for the reason at the top of this file. The
 * per-cell arrays saturate on each increment and `deepestTier` does not, which
 * matches the encoder exactly — a tier is `1..7` and could not saturate anyway,
 * but the shapes agreeing is what makes the round-trip test meaningful.
 */
interface ProjectedKnowledge {
  readonly nodesKnown: Int32Array;
  readonly deepestTier: Int32Array;
  readonly instances: Int32Array;
  readonly libraryDepth: number;
  readonly mageHighestTier: ReadonlyMap<number, number>;
}

function projectKnowledge(state: SimState, catalogue: ContentCatalogue): ProjectedKnowledge {
  const nodesKnown = new Int32Array(GRID_CELL_COUNT);
  const deepestTier = new Int32Array(GRID_CELL_COUNT);
  const instances = new Int32Array(GRID_CELL_COUNT);
  const seenNodes = new Set<number>();
  const libraryNodes = new Set<number>();
  const mageHighestTier = new Map<number, number>();

  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    const node = catalogue.node(row.nodeId);
    // A node the catalogue does not name is skipped, not thrown on. §0's
    // `contentRevision` is the mechanism for a state/content mismatch, and
    // throwing here would crash a Monte Carlo worker over a stale catalogue.
    if (node === undefined) continue;
    const cellIndex = node.cellId - 1;
    if (cellIndex < 0 || cellIndex >= GRID_CELL_COUNT) continue;

    instances[cellIndex] = saturate((instances[cellIndex] ?? 0) + 1);
    if (!seenNodes.has(node.nodeId)) {
      seenNodes.add(node.nodeId);
      nodesKnown[cellIndex] = saturate((nodesKnown[cellIndex] ?? 0) + 1);
    }
    if (node.tier > (deepestTier[cellIndex] ?? 0)) {
      deepestTier[cellIndex] = node.tier;
    }

    if (row.locationKind === LOCATION_KIND.library) {
      libraryNodes.add(node.nodeId);
    }
    // §1.5: `mind` and `palace` are both "this mage knows it" — the palace is
    // the Art of Memory `store` hook, and reading only `mind` would see every
    // Art of Memory mage as knowing nothing.
    if (row.locationKind === LOCATION_KIND.mind || row.locationKind === LOCATION_KIND.palace) {
      const current = mageHighestTier.get(row.locationId) ?? 0;
      if (node.tier > current) mageHighestTier.set(row.locationId, node.tier);
    }
  }

  return { nodesKnown, deepestTier, instances, libraryDepth: libraryNodes.size, mageHighestTier };
}

function emptySide(): PlayerSide {
  return {
    combatantCount: 0,
    hpTotal: 0,
    maxHpTotal: 0,
    vigorTotal: 0,
    maxVigorTotal: 0,
    concealmentTotal: 0,
    preparedSpellCount: 0,
  };
}

/** Mutable accumulator for one side; frozen into a {@link PlayerSide} at the end. */
interface SideTotals {
  combatantCount: number;
  hpTotal: number;
  maxHpTotal: number;
  vigorTotal: number;
  maxVigorTotal: number;
  concealmentTotal: number;
  preparedSpellCount: number;
}

function projectEngagement(input: ObservationInput): PlayerEngagement | undefined {
  const engaged = input.engagement;
  if (engaged === undefined) return undefined;
  const { engagement, ownSide } = engaged;
  const entities = engagement.entities;

  const totals = new Map<number, SideTotals>([
    [RAID_SIDE.attacker, { ...emptySide() }],
    [RAID_SIDE.defender, { ...emptySide() }],
  ]);
  const sideOfCombatant = new Map<number, number>();

  for (const { handle, row } of collectRecords(entities, COMBATANT)) {
    const side = totals.get(row.side);
    // A side outside {0,1} is `rules-raid`'s bug, not a channel. Dropped rather
    // than bucketed, exactly as the encoder drops it.
    if (side === undefined) continue;
    sideOfCombatant.set(handle, row.side);
    side.combatantCount = saturate(side.combatantCount + 1);
    side.hpTotal = saturate(side.hpTotal + row.hp);
    side.maxHpTotal = saturate(side.maxHpTotal + row.maxHp);
    side.vigorTotal = saturate(side.vigorTotal + row.vigor);
    side.maxVigorTotal = saturate(side.maxVigorTotal + row.maxVigor);
    side.concealmentTotal = saturate(side.concealmentTotal + row.concealment);
  }

  for (const { row } of collectRecords(entities, PREPARED_SPELL)) {
    const owner = sideOfCombatant.get(row.combatantId);
    if (owner === undefined) continue; // prepared by a combatant that is gone
    const side = totals.get(owner);
    if (side === undefined) continue;
    side.preparedSpellCount = saturate(side.preparedSpellCount + 1);
  }

  const enemySide = ownSide === RAID_SIDE.attacker ? RAID_SIDE.defender : RAID_SIDE.attacker;

  // Most valuable first, ties broken by ascending handle — identity-keyed, so
  // that two peers agreeing on every value fill the twelve slots the same way.
  const ranked = collectRecords(entities, OBJECTIVE)
    .map(({ handle, row }) => ({ handle, ...row }))
    .sort((a, b) => (b.valueFp !== a.valueFp ? b.valueFp - a.valueFp : a.handle - b.handle))
    .slice(0, OBSERVATION_OBJECTIVE_SLOTS);

  return {
    own: { ...(totals.get(ownSide) ?? emptySide()) },
    enemy: { ...(totals.get(enemySide) ?? emptySide()) },
    objectives: ranked.map((objective) => ({
      kind: saturate(objective.kind),
      statusKind: saturate(objective.statusKind),
      valueFp: saturate(objective.valueFp),
      captured: objective.capturedBy !== 0,
    })),
    portalStability: saturate(engagement.raid.portalStability),
    stabilityDecayPerTick: saturate(engagement.raid.stabilityDecayPerTick),
  };
}

/**
 * The world, reduced to what its player may see.
 *
 * Takes {@link ObservationInput} rather than the design's `project(state)`:
 * the knowledge block is unreconstructable without `catalogue.node(nodeId)` for
 * a node's cell and tier, and the engagement block needs the caller-supplied
 * `ownSide` because "own" is not recoverable from an `Engagement`. That is the
 * signature the shipped encoder already forces, and the inventory records the
 * correction against the design doc.
 *
 * A world with no universe entity yields a zeroed ruleset, tradition and
 * resources — the same early return `writeRuleset` takes — rather than throwing.
 * A half-built test world is a world, and it should observe as an empty one.
 */
/** Every kind at zero — a world with no universe, or one never stepped. */
function zeroStocks(): MaterialStockRecord {
  const stocks = {} as Record<keyof MaterialStockRecord, number>;
  for (const kind of Object.keys(MATERIAL_STOCK.fields) as (keyof MaterialStockRecord)[]) {
    stocks[kind] = 0;
  }
  return stocks;
}

export function project(input: ObservationInput): PlayerState {
  const { state, catalogue } = input;
  const digest = projectKnowledge(state, catalogue);
  const universe = findUniverse(state);

  let permittedTechniques = 0;
  let permittedForms = 0;
  const edicts: Edict[] = [];
  let traditionId = 0;
  let resources: PlayerResources = {
    favor: 0,
    worship: 0,
    worshipTier: 0,
    materials: 0,
    prestige: 0,
    // Built from the schema rather than written out, for the reason the read
    // path below is: a kind added to `MATERIAL_STOCK` must not be able to reach
    // a client through one branch and be absent on the other.
    stocks: zeroStocks(),
  };

  // A world with no universe leaves an empty ruleset — both masks zero and no
  // edicts — which is the same early return `writeRuleset` takes.
  if (universe !== 0) {
    const record = readUniverse(state, universe);
    permittedTechniques = record.permittedTechniques;
    permittedForms = record.permittedForms;
    // Truncated at the budget maximum rather than trusted to fit: an unbounded
    // list would otherwise report a ninth edict's cell id as the tradition.
    for (const edict of readEdicts(state).slice(0, EDICT_BUDGET_MAX)) {
      edicts.push({ cellId: saturate(edict.cellId), kind: saturate(edict.kind) });
    }
    traditionId = saturate(record.traditionId);

    // Summed in a plain number and saturated once, matching the encoder. A
    // missing row is all-zero, which is what "never stepped" means.
    //
    // Every kind is read once and carried, and `materials` is then derived from
    // the same three reads that `food`, `stone` and `vellum` report — so the
    // sum and its parts cannot disagree, which is the failure `layout.ts` names
    // when it refuses to store one constant under two names.
    //
    // The field list comes from `MATERIAL_STOCK.fields` rather than being
    // transcribed here. A transcribed list is how a kind added to the schema
    // gets silently dropped from every client, and this record has already
    // grown from three kinds to seven once.
    const store = componentOf(state, MATERIAL_STOCK);
    const held = store.has(universe);
    const stocks = {} as Record<keyof MaterialStockRecord, number>;
    for (const kind of Object.keys(MATERIAL_STOCK.fields) as (keyof MaterialStockRecord)[]) {
      // Saturated individually as well as in the sum. A single stock cannot
      // overflow an int32 while the sum does not, but saturating the parts keeps
      // every field of this type under one guarantee rather than two, and
      // `saturate` throws on a non-integer — the check that would catch a float
      // reaching the projection.
      stocks[kind] = saturate(held ? store.get(universe, kind) : 0);
    }
    resources = {
      favor: saturate(record.favor),
      worship: saturate(record.worship),
      worshipTier: saturate(record.worshipTier),
      // The three land kinds only, and deliberately: this is the documented
      // meaning the observation's one slot must keep matching.
      materials: saturate(stocks.food + stocks.stone + stocks.vellum),
      prestige: saturate(record.prestige),
      stocks,
    };
  }

  const population = new Array<number>(
    OBSERVATION_SPECIES_COUNT * OBSERVATION_OCCUPATION_COUNT,
  ).fill(0);
  for (const { row } of collectRecords(state, POPULACE_COHORT)) {
    const slot = cohortSlot(row.speciesId, row.occupation);
    population[slot] = saturate((population[slot] ?? 0) + row.count);
  }

  const mages = new Array<number>(OBSERVATION_SPECIES_COUNT * MAGE_TIER_SLOTS).fill(0);
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    const tier = digest.mageHighestTier.get(handle) ?? UNTAUGHT_TIER_SLOT;
    const slot = mageTierSlot(row.speciesId, tier);
    mages[slot] = saturate((mages[slot] ?? 0) + 1);
  }

  const knowledge: PlayerKnowledgeCell[] = [];
  for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
    const index = cellId - 1;
    knowledge.push({
      nodesKnown: saturate(digest.nodesKnown[index] ?? 0),
      deepestTier: saturate(digest.deepestTier[index] ?? 0),
      instances: saturate(digest.instances[index] ?? 0),
    });
  }

  const universities = collectRecords(state, UNIVERSITY);
  let capacity = 0;
  for (const { row } of universities) capacity += row.capacity;

  return {
    ruleset: { permittedTechniques, permittedForms, edicts },
    traditionId,
    resources,
    population,
    mages,
    knowledge,
    institutions: {
      universityCount: saturate(universities.length),
      universityCapacity: saturate(capacity),
      libraryDepth: saturate(digest.libraryDepth),
      grimoireCount: saturate(collectRecords(state, GRIMOIRE).length),
    },
    clock: {
      worldTick: saturate(state.clock.worldTick),
      era: saturate(eraOf(state.clock.worldTick)),
      inEngagement: state.clock.mode === TIME_MODE.engagement,
    },
    engagement: projectEngagement(input),
  };
}

// ---------------------------------------------------------------------------
// The encoding.
// ---------------------------------------------------------------------------

/**
 * A {@link PlayerState} scattered into §4.1's positions.
 *
 * **This function does no summing and no saturation.** Every value it writes is
 * already the integer the channel carries — {@link project} did the summing and
 * the clamping, at the points `./observation.ts` does them. The one computation
 * left here is expanding the two ruleset bitfields into nineteen flag slots,
 * which is placement rather than aggregation: it is exactly the kind of choice
 * that should move the layout digest without touching the entitlement. That split is
 * what makes the pair reviewable: an entitlement question is answered by reading
 * {@link PlayerState}, and a layout question by reading this function, and
 * neither can quietly become the other.
 */
export function encodePlayerState(player: PlayerState): Int32Array {
  const view = new Int32Array(OBSERVATION_SIZE);

  const ruleset = observationBlock('ruleset').offset;
  // The one place a bitfield becomes slots. This is an encoding decision and it
  // lives here rather than in `project` — see the note where `PlayerRuleset`
  // would have been.
  for (let bit = 0; bit < GRID_TECHNIQUE_COUNT; bit += 1) {
    view[ruleset + bit] = (player.ruleset.permittedTechniques & (1 << bit)) === 0 ? 0 : 1;
  }
  for (let bit = 0; bit < GRID_FORM_COUNT; bit += 1) {
    view[ruleset + GRID_TECHNIQUE_COUNT + bit] =
      (player.ruleset.permittedForms & (1 << bit)) === 0 ? 0 : 1;
  }
  const edictBase = ruleset + GRID_TECHNIQUE_COUNT + GRID_FORM_COUNT;
  for (let slot = 0; slot < EDICT_BUDGET_MAX; slot += 1) {
    const edict = player.ruleset.edicts[slot];
    if (edict === undefined) continue;
    view[edictBase + slot * 2] = edict.cellId;
    view[edictBase + slot * 2 + 1] = edict.kind;
  }

  view[observationBlock('tradition').offset] = player.traditionId;

  const resources = observationBlock('resources').offset;
  view[resources] = player.resources.favor;
  view[resources + 1] = player.resources.worship;
  view[resources + 2] = player.resources.worshipTier;
  view[resources + 3] = player.resources.materials;
  view[resources + 4] = player.resources.prestige;

  const population = observationBlock('population').offset;
  for (let slot = 0; slot < player.population.length; slot += 1) {
    view[population + slot] = player.population[slot] ?? 0;
  }

  const mages = observationBlock('mages').offset;
  for (let slot = 0; slot < player.mages.length; slot += 1) {
    view[mages + slot] = player.mages[slot] ?? 0;
  }

  const knowledge = observationBlock('knowledge').offset;
  for (let cellId = 1; cellId <= GRID_CELL_COUNT; cellId += 1) {
    const cell = player.knowledge[cellId - 1];
    if (cell === undefined) continue;
    const base = knowledge + knowledgeSlot(cellId);
    view[base] = cell.nodesKnown;
    view[base + 1] = cell.deepestTier;
    view[base + 2] = cell.instances;
  }

  const institutions = observationBlock('institutions').offset;
  view[institutions] = player.institutions.universityCount;
  view[institutions + 1] = player.institutions.universityCapacity;
  view[institutions + 2] = player.institutions.libraryDepth;
  view[institutions + 3] = player.institutions.grimoireCount;

  const clock = observationBlock('clock').offset;
  view[clock] = player.clock.worldTick;
  view[clock + 1] = player.clock.era;
  view[clock + 2] = player.clock.inEngagement ? 1 : 0;

  // Absent leaves the block zero-filled, which §4.1 marks "(zeroed at world
  // scale)" and §4.3 explains: one agent plays both scales.
  if (player.engagement !== undefined) {
    encodeEngagement(view, player.engagement);
  }

  return view;
}

function encodeEngagement(view: Int32Array, engagement: PlayerEngagement): void {
  const offset = observationBlock('engagement').offset;
  // Always own-first. A block laid out attacker-first would mean opposite
  // things to the two participants of one raid.
  const sides = [engagement.own, engagement.enemy];
  for (let side = 0; side < sides.length; side += 1) {
    const totals = sides[side] ?? emptySide();
    const base = offset + side * OBSERVATION_SIDE_CHANNELS;
    view[base] = totals.combatantCount;
    view[base + 1] = totals.hpTotal;
    view[base + 2] = totals.maxHpTotal;
    view[base + 3] = totals.vigorTotal;
    view[base + 4] = totals.maxVigorTotal;
    view[base + 5] = totals.concealmentTotal;
    view[base + 6] = totals.preparedSpellCount;
  }

  const objectiveBase = offset + 2 * OBSERVATION_SIDE_CHANNELS;
  for (let slot = 0; slot < OBSERVATION_OBJECTIVE_SLOTS; slot += 1) {
    const objective = engagement.objectives[slot];
    if (objective === undefined) continue;
    const base = objectiveBase + slot * OBSERVATION_OBJECTIVE_CHANNELS;
    view[base] = objective.kind;
    view[base + 1] = objective.statusKind;
    view[base + 2] = objective.valueFp;
    view[base + 3] = objective.captured ? 1 : 0;
  }

  const portalBase = objectiveBase + OBSERVATION_OBJECTIVE_SLOTS * OBSERVATION_OBJECTIVE_CHANNELS;
  view[portalBase] = engagement.portalStability;
  view[portalBase + 1] = engagement.stabilityDecayPerTick;
}

/**
 * Every named field the projection carries, as dotted paths.
 *
 * The seed for `unencodedObservables()`: this is the *entitlement* side of the
 * gate, against which the declared unencoded gaps are checked.
 *
 * **Walked from a value, not written down.** A hand-maintained list here would
 * be the hand-maintained checklist the whole design exists to replace — it would
 * forget exactly the field somebody added and did not think about, which is the
 * failure mode being closed. So a field added to {@link PlayerState} *and*
 * populated by {@link project} appears here on its own, and one added to the
 * type but never populated does not, which is itself worth knowing.
 *
 * Fixed-width collections are leaves, named by their block rather than
 * enumerated per index: `population` is one entitled trait realized as 30 slots,
 * not 30 traits. A per-index walk would be 400 rows saying nothing the layout
 * does not already say — the granularity failure
 * `docs/design/observation-entitlement.md` rejects for the strategy gate.
 *
 * @param player - A projection to walk. Pass one taken **during an engagement**
 * for the full set: at world scale `engagement` is `undefined` and contributes
 * one bare leaf rather than seventeen. The entitlement does not change with the clock
 * mode — zero-filling the block is an encoding decision — so a caller that only
 * ever walked a world-scale projection would have a gate that went quiet about
 * the raid channels exactly when nobody was looking.
 */
export function playerStateFields(player: PlayerState): string[] {
  const fields: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      ArrayBuffer.isView(value)
    ) {
      fields.push(path);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      walk(child, path === '' ? key : `${path}.${key}`);
    }
  };
  walk(player, '');
  return fields;
}
