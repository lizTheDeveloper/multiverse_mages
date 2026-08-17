/*
 * Multiverse Mages — the succession layer: what one universe leaves the next.
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
 * The run boundary `coordination`'s legacy arithmetic was staged ahead of.
 *
 * ## Why this is a scenario concern and not a rule
 *
 * `contracts.md` §1.1 puts **one universe in one simulation instance** and says
 * the multiverse is not in state. A carry across an ascension therefore cannot
 * live inside `step()`: there is no second universe for a tick to write into,
 * and a run that could raise its own carried prestige mid-flight would be the
 * meta-game feeding the loop it exists to sit outside. `god/ascension.ts` says
 * exactly this beside {@link carriedPrestige} and names what is missing — *"a
 * succession layer above the world step"*. This is that layer.
 *
 * It is built as a **run-to-run artifact**, not a within-run loop:
 *
 * 1. A run ends. {@link legacyRecordOf} reads the ending off the universe row,
 *    closes the recurrence with {@link carriedPrestige} and converts the result
 *    into the four stock channels with {@link legacyGrant}.
 *    The result is a {@link LegacyRecord} — plain numbers and one string, so it
 *    survives `JSON.stringify` and can be written beside a run's other records.
 * 2. A *new* run is built from that record. {@link seedLegacy} spends the four
 *    channels into a tick-zero state, and `buildReferenceState` calls it as the
 *    last thing it does.
 *
 * Nothing here chains two runs automatically. An automatic chain would be a
 * mechanic nobody designed — the boundary is where a *caller* decides to found
 * a successor, which is what a meta-game is.
 *
 * ## Stocks, never rates
 *
 * {@link legacyGrant}'s doc comment carries the argument and this file obeys it:
 * every channel below lands as a quantity that is spent, eaten, aged out or
 * looted. Nothing here touches a regeneration rate, a cap, a budget or a species
 * trait, and `god-conformance.test.ts` asserts the same thing of the arithmetic
 * one package down.
 *
 * ## The four seeding decisions, which `legacyGrant` deliberately left open
 *
 * Its doc comment lists three of them as *"seeding decisions with balance
 * consequences… inventing them to give this function a call site would be
 * inventing the mechanic"*. They are made here, where a starting position is
 * allowed to be chosen, and each says why:
 *
 * - **materials** — split evenly across every field of `MATERIAL_STOCK`, driven
 *   off the component rather than a hardcoded kind list. See
 *   {@link splitLegacyMaterials}.
 * - **populace** — added to the cohorts the scenario already founded, never as
 *   new cohorts. See {@link seedLegacy}.
 * - **archive** — written copies in the founding library, chosen from inside the
 *   opening square at or below the authored tier cap. See
 *   {@link legacyArchiveCandidates}.
 * - **favor** — written straight onto the universe row's pool. It is the one
 *   channel that needed a check rather than a decision, and the check is in
 *   {@link seedLegacy}.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { floorDiv } from '@mm/sim-core';
import type { MaterialStockRecord } from '@mm/state';
import {
  GRIMOIRE,
  HOLDER_KIND,
  LIBRARY,
  LOCATION_KIND,
  MATERIAL_STOCK,
  POPULACE_COHORT,
  TERMINAL_REASON,
  UNIVERSE,
  attachRecord,
  collectRecords,
  componentOf,
  currentEra,
  findUniverse,
  permits,
  readGodState,
  readUniverse,
} from '@mm/state';
import { KnowledgeSubsystem, MASTERY_MAX, SCRIBE_DURABILITY_BASE } from '@mm/rules-magic';
import type { GodConstants, LegacyChannel } from '@mm/coordination';
import { LEGACY_CHANNELS, carriedPrestige, legacyGrant, prestigeEarned } from '@mm/coordination';

import type { RulesetAxes } from './content-set.js';

/**
 * The record's own version, carried in every record.
 *
 * A legacy record is the one artifact in this repository that is *meant* to
 * outlive the process that wrote it — that is the whole point of a run boundary
 * — so it has to be able to say which shape it is. `1` is the first.
 */
export const LEGACY_RECORD_SCHEMA = 1;

/**
 * What one finished universe leaves the next, serialisably.
 *
 * Every field is a number or a string: a record round-trips through
 * `JSON.stringify`/`JSON.parse` unchanged, which is what makes it a run-to-run
 * artifact rather than an in-memory handoff between two runs that happen to be
 * in the same process.
 *
 * The provenance fields are not decoration. A grant is arithmetic over three
 * authored baselines whose own glosses disown them as *"a measurement that has
 * not been taken"*; a record that could not say which content revision and which
 * reference tick produced it would be a head start nobody could reproduce or
 * disprove.
 */
export interface LegacyRecord {
  /** {@link LEGACY_RECORD_SCHEMA} as of writing. */
  readonly schema: number;
  /** The scenario the ending run was built from. */
  readonly scenarioId: string;
  /** That run's seed, so the ending is reproducible from its coordinates. */
  readonly runSeed: number;
  /** `contentRevision` — the 32-hex content hash the grant was resolved against. */
  readonly contentRevision: string;
  /** The world tick the run ended at. */
  readonly endedAtTick: number;
  /** `TERMINAL_REASON` of the ending. Never `none` — an unfinished run leaves nothing. */
  readonly terminalReason: number;
  /** What the ending was worth, `fp`. */
  readonly prestigeEarned: Fixed;
  /** `prestige × retention + earned`, clamped — the successor's `prestige`, `fp`. */
  readonly carriedPrestige: Fixed;
  /**
   * The four stock channels, keyed by {@link LEGACY_CHANNELS} and by nothing
   * else.
   *
   * Keyed off that list rather than spelled out so that the day a fifth channel
   * is authored, a record that does not carry it fails to type-check here
   * instead of silently granting three quarters of a legacy.
   *
   * `favor` and `materials` are `fp`; `populace` and `archive` are counts.
   */
  readonly channels: Readonly<Record<LegacyChannel, number>>;
  /** The deepest node tier an archived copy may be. Carried, not re-derived. */
  readonly archiveMaxTier: number;
  /**
   * `legacy-reference-tick` — the world tick the three `legacy-baseline-*`
   * placeholders behind `channels` claim to be medians at.
   *
   * Provenance, exactly as that constant's gloss says it is: *"a baseline
   * without the tick it was measured at is a magnitude nobody can reproduce or
   * disprove"*. Carried in the record because the record is the thing that
   * outlives the process, and a saved head start whose baselines cannot be
   * located in time is the same magnitude with the provenance thrown away.
   */
  readonly baselineReferenceTick: number;
}

/** What {@link legacyRecordOf} needs that state does not carry. */
export interface LegacyRecordInput {
  readonly constants: GodConstants;
  /** The ending run's scenario id, recorded as provenance. */
  readonly scenarioId: string;
  /** The ending run's seed, recorded as provenance. */
  readonly runSeed: number;
  /**
   * Whether the caller stopped this run at its world-tick cap.
   *
   * **The tick cap is not a fact the rules know.** `contracts.md` §1.1 has three
   * endings and `god-constant.json` prices all three — `prestige-base-ascended`,
   * `prestige-base-stagnated`, and `prestige-base-cutoff`, glossed *"what
   * reaching the tick cap without ascending is worth"*. The world loop writes
   * `prestigeEarned` for the first two, because a tick can detect them from
   * inside itself; it cannot write the third, because no tick knows it is the
   * last one. The caller does. Passing `true` here is that caller saying so, and
   * it is the only route by which the cutoff base is ever paid.
   *
   * Absent or `false` means an unfinished run leaves no legacy at all.
   */
  readonly endedAtCap?: boolean;
}

/**
 * The legacy one finished universe leaves, or `undefined` if it did not finish.
 *
 * `undefined` rather than a zeroed record, and the distinction is load-bearing:
 * every ending earns something non-zero by design — `prestigeEarned`'s own
 * comment calls a zero floor *"the runaway-leader failure with the sign
 * flipped"* — so a record full of zeroes could only mean a bug, and there must
 * be no value of this function that means *"the run is still going"* and *"the
 * run ended with nothing"* at the same time.
 *
 * ## Where each half of the arithmetic comes from
 *
 * - `prestigeEarned` is **read off the row** when the world loop terminated the
 *   run, never recomputed. `god/system.ts` writes it once, at termination, with
 *   the era and tier figures it held at that instant; re-deriving it here from a
 *   state one tick later would be a second answer to a settled question.
 * - It is **computed here** only for the cutoff — see
 *   {@link LegacyRecordInput.endedAtCap} — because the loop cannot write what it
 *   cannot detect.
 *
 * The carried-in `prestige` on the row is the other operand: that is what makes
 * this a recurrence rather than a per-run payout, and it is why a universe
 * seeded from a record and then ended again leaves a larger one.
 */
export function legacyRecordOf(state: SimState, input: LegacyRecordInput): LegacyRecord | undefined {
  const universe = findUniverse(state);
  if (universe === 0) return undefined;
  const row = readUniverse(state, universe);

  const ended = row.terminalReason !== TERMINAL_REASON.none;
  if (!ended && input.endedAtCap !== true) return undefined;

  const terminalReason = ended ? row.terminalReason : TERMINAL_REASON.truncated;
  const god = readGodState(state, universe);
  const earned = ended
    ? row.prestigeEarned
    : prestigeEarned(
        {
          terminalReason,
          deepestTier: god?.deepestTier ?? 0,
          erasSurvived: currentEra(state),
          peakWorshipTier: god?.peakWorshipTier ?? 0,
        },
        input.constants,
      );

  const carried = carriedPrestige(row.prestige, earned, input.constants);
  const grant = legacyGrant(carried, input.constants);

  // Built by walking `LEGACY_CHANNELS` rather than by writing four keys, so the
  // record's shape is that list and cannot drift from it.
  const source: Readonly<Record<LegacyChannel, number>> = {
    favor: grant.favor,
    materials: grant.materials,
    populace: grant.populace,
    archive: grant.archiveNodes,
  };
  const channels: Record<LegacyChannel, number> = {} as Record<LegacyChannel, number>;
  for (const channel of LEGACY_CHANNELS) channels[channel] = source[channel];

  return {
    schema: LEGACY_RECORD_SCHEMA,
    scenarioId: input.scenarioId,
    runSeed: input.runSeed,
    contentRevision: state.contentRevision,
    endedAtTick: state.clock.worldTick,
    terminalReason,
    prestigeEarned: earned,
    carriedPrestige: carried,
    channels: Object.freeze(channels),
    archiveMaxTier: grant.archiveMaxTier,
    baselineReferenceTick: input.constants.legacyReferenceTick,
  };
}

/**
 * The `materials` channel, split across every kind `MATERIAL_STOCK` declares.
 *
 * ## Evenly, and driven off the component
 *
 * `legacyGrant` produces **one** materials figure and `MATERIAL_STOCK` has more
 * than one field, so somebody has to decide the split. Evenly, for the reason
 * `STARTING_MATERIALS` already gives about the founding endowment: a legacy is
 * scaled from a baseline that is itself a placeholder, so any weighting would be
 * a claim about the relative worth of food, stone and vellum that nobody has
 * measured. An even split is the only division that asserts nothing.
 *
 * The kinds come from `Object.keys(MATERIAL_STOCK.fields)`, never from a list
 * written here. The economy has grown from one stock to three inside one release
 * and has seven authored on an unmerged branch; a hardcoded triple would grant
 * three sevenths of a legacy on the day the fourth kind lands, and would do it
 * silently.
 *
 * ## The remainder goes somewhere, and where is stated
 *
 * `floorDiv`, so three kinds sharing `fp(100)` get 33 each and one unit is left
 * over. That unit is dealt to the fields in declaration order rather than
 * dropped: dropping it would make the split lose up to `kinds − 1` units of a
 * quantity the record says it granted, which is a record that lies about itself.
 * Dealing in declaration order keeps the whole thing a pure function of the
 * component spec.
 */
export function splitLegacyMaterials(
  total: Fixed,
): Readonly<Record<MaterialKind, Fixed>> {
  const kinds = materialKinds();
  const amount = Math.max(total, 0);
  const each = floorDiv(amount, kinds.length);
  let remainder = amount - each * kinds.length;

  const split = {} as Record<MaterialKind, Fixed>;
  for (const kind of kinds) {
    split[kind] = each + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return Object.freeze(split);
}

/** A field name of `MATERIAL_STOCK`, whatever those turn out to be. */
export type MaterialKind = keyof MaterialStockRecord;

/**
 * Every material kind the component declares, in declaration order.
 *
 * One cast, in one place, and it is the only thing standing between this file
 * and a hardcoded `['food', 'stone', 'vellum']`. `MATERIAL_STOCK_FIELDS_MATCH`
 * is what makes it sound: `tsc` already fails the build if the component's
 * fields and {@link MaterialStockRecord}'s keys disagree, so the two key sets
 * are the same set by assertion rather than by hope.
 */
function materialKinds(): readonly MaterialKind[] {
  return Object.keys(MATERIAL_STOCK.fields) as readonly MaterialKind[];
}

/**
 * The nodes a legacy archive may hold, best first.
 *
 * ## Inside the opening square, and asked of `permits()`
 *
 * The same refusal `foundingCandidates` makes: a copy of a node in a cell this
 * universe forbids could never be read, taught or rediscovered, so it would be a
 * head start that is a decoration. Membership is asked of the one arbitration
 * function, never re-derived from the axis bits.
 *
 * ## At or below the authored tier, deepest first
 *
 * `legacy-archive-max-tier` exists because *"a legacy that could seed the summit
 * would be prestige buying the ascension condition"* — the cap **is** the guard,
 * so taking the deepest tier under it is the authored behaviour rather than an
 * abuse of it. Shallowest-first would have made the channel nearly a no-op: the
 * shallow nodes of an opening square are exactly what the founding grant already
 * deals and what a universe rediscovers first anyway.
 *
 * Ties break on ascending interned id, so the archive is a pure function of the
 * content and the square, not of file order.
 *
 * ## Never a node the founding grant already dealt
 *
 * `exclude` carries the founding grants. Without it the archive could hand a
 * universe a written copy of something a founder already holds at full mastery,
 * and the `archive` channel would sometimes be worth nothing at all while still
 * reporting a non-zero count — a null wearing a measurement's clothes.
 */
export function legacyArchiveCandidates(
  registry: ContentRegistry,
  axes: RulesetAxes,
  maxTier: number,
  exclude: ReadonlySet<ContentId>,
): readonly ContentId[] {
  const ruleset = { permittedTechniques: axes.permittedTechniques, permittedForms: axes.permittedForms, edicts: [] };
  const openCells = new Set(
    registry.cells
      .filter((entry) => permits(ruleset, entry.contentId))
      .map((entry) => entry.record.id),
  );
  return Object.freeze(
    registry.nodes
      .filter(
        (entry) =>
          openCells.has(entry.record.cell) &&
          entry.record.tier <= maxTier &&
          !exclude.has(entry.contentId),
      )
      .sort((a, b) => b.record.tier - a.record.tier || a.contentId - b.contentId)
      .map((entry) => entry.contentId),
  );
}

/** What {@link seedLegacy} needs beyond the record itself. */
export interface LegacySeedInput {
  readonly record: LegacyRecord;
  readonly registry: ContentRegistry;
  /** The opening square this universe was founded on. */
  readonly axes: RulesetAxes;
  /** The universe row's handle, so this does not re-scan for it. */
  readonly universe: EntityHandle;
  /** `catalog.nodeCount`, for the knowledge index. */
  readonly nodeCount: number;
  /** Node ids the founding grant already dealt, excluded from the archive. */
  readonly foundingNodeIds: ReadonlySet<ContentId>;
}

/** What a seeding actually placed, so a caller is not told to trust it. */
export interface LegacySeedOutcome {
  /** `fp` added to the universe's favor pool. */
  readonly favor: Fixed;
  /** `fp` added per material kind, keyed by `MATERIAL_STOCK` field name. */
  readonly materials: Readonly<Record<MaterialKind, Fixed>>;
  /** Heads added, summed over cohorts. Short of the grant if there were no cohorts. */
  readonly populace: number;
  /** Node ids shelved. Short of the grant if the square offered too few. */
  readonly archive: readonly ContentId[];
}

/**
 * Spends a legacy record into a tick-zero state.
 *
 * **Draw-free.** Every choice below is positional — cohorts by ascending handle,
 * archive nodes by tier then interned id — so seeding touches no RNG stream and
 * cannot re-roll a subsystem. `contracts.md` §6 makes that the difference
 * between a starting position and a re-baseline event.
 *
 * **Nothing here is a rate.** Favor lands in the pool, not in regeneration;
 * materials land in the stock, not in production; heads join cohorts, they do
 * not change a birth rate; books go on a shelf where they can be read, looted
 * and burned. That is {@link legacyGrant}'s whole model and this is the half of
 * it that touches state.
 *
 * ## The favor channel needed a check, not a decision
 *
 * A pool seeded above the cap would be the one channel that could silently
 * evaporate on tick 1, which would be exactly the null this wiring exists to
 * refuse. It does not: `applyRegeneration` caps *the result of regenerating*
 * — `favor + min(regenerated, max(cap − favor, 0))` — so a pool already above
 * the cap simply stops growing, and `god/system.ts` recomputes the cap from
 * worship every tick anyway. Checked in `favor.ts`, not assumed.
 *
 * ## Populace joins existing cohorts
 *
 * `contracts.md` §1.3 keys a cohort on `(speciesId, occupation, birthTickBucket)`
 * and requires one entity per key. Founding new cohorts would mean inventing a
 * birth bucket, and a bucket chosen here would be a claim about the age of a
 * legacy population that nothing else in the game makes. Adding to the cohorts
 * the scenario already founded needs no such claim, and round-robin by ascending
 * handle keeps the species and occupation mix the scenario chose.
 */
export function seedLegacy(state: SimState, input: LegacySeedInput): LegacySeedOutcome {
  const { record } = input;

  // ---- favor -------------------------------------------------------------
  const favor = Math.max(record.channels.favor, 0);
  setUniverseFavor(state, input.universe, favor);

  // ---- materials ---------------------------------------------------------
  const stocks = componentOf(state, MATERIAL_STOCK);
  const materials = splitLegacyMaterials(record.channels.materials);
  for (const kind of materialKinds()) {
    const amount = materials[kind];
    const current = stocks.get(input.universe, kind) ?? 0;
    stocks.set(input.universe, kind, current + amount);
  }

  // ---- populace ----------------------------------------------------------
  const cohorts = collectRecords(state, POPULACE_COHORT)
    .map(({ handle }) => handle)
    .sort((a, b) => a - b);
  const store = componentOf(state, POPULACE_COHORT);
  let placed = 0;
  const heads = Math.max(record.channels.populace, 0);
  for (let index = 0; index < heads && cohorts.length > 0; index += 1) {
    const cohort = cohorts[index % cohorts.length] as EntityHandle;
    store.set(cohort, 'count', (store.get(cohort, 'count') ?? 0) + 1);
    placed += 1;
  }

  // ---- archive -----------------------------------------------------------
  const archive = shelveArchive(state, input);

  return { favor, materials, populace: placed, archive };
}

/**
 * The favor write, split out so the pool is touched in exactly one place.
 *
 * `attachRecord` is not usable here — the universe row already exists — and a
 * second inline `componentOf(state, UNIVERSE)` in the middle of a four-channel
 * function is how one channel ends up written twice.
 */
function setUniverseFavor(state: SimState, universe: EntityHandle, favor: Fixed): void {
  if (favor === 0) return;
  const row = readUniverse(state, universe);
  componentOf(state, UNIVERSE).set(universe, 'favor', row.favor + favor);
}

/**
 * Shelves the archive channel as written copies in the founding library.
 *
 * A book, not a mind. `contracts.md` §1.5 keeps exactly one instance per written
 * copy and `KnowledgeSubsystem.createInstance` throws on a library-located
 * instance with no paired `GRIMOIRE`, so the pairing is made at creation the way
 * `rival-universe.ts` makes it.
 *
 * **Durability is `SCRIBE_DURABILITY_BASE`, and that is a citation rather than a
 * choice.** It is what the live scribing path produces for a scribe at unit
 * affinity before its roll — `scribing.ts` — so a legacy book is an ordinary
 * book, and no new magnitude enters the game to describe one. The roll is
 * omitted deliberately: taking it would mean drawing on the scribing stream at
 * tick zero, which is the one thing a starting position may not do.
 */
function shelveArchive(state: SimState, input: LegacySeedInput): readonly ContentId[] {
  const wanted = Math.max(input.record.channels.archive, 0);
  if (wanted === 0) return Object.freeze([]);

  const library = firstLibrary(state);
  if (library === 0) return Object.freeze([]);

  const candidates = legacyArchiveCandidates(
    input.registry,
    input.axes,
    input.record.archiveMaxTier,
    input.foundingNodeIds,
  ).slice(0, wanted);
  if (candidates.length === 0) return Object.freeze([]);

  // `fromState`: `buildReferenceState` has already written the founding grants
  // through their own subsystem, so a fresh index would start blind to them and
  // could re-mark an already-ever-known node.
  const knowledge = KnowledgeSubsystem.fromState(state, input.nodeCount);
  for (const nodeId of candidates) {
    const grimoire = state.entities.create();
    attachRecord(state, GRIMOIRE, grimoire, {
      nodeId,
      durability: SCRIBE_DURABILITY_BASE,
      holderKind: HOLDER_KIND.library,
      holderId: library,
    });
    knowledge.createInstance({
      nodeId,
      locationKind: LOCATION_KIND.library,
      locationId: library,
      acquiredTick: 0,
      // A book does not know its subject well or badly, and a written instance
      // never decays — the same pair of facts `scribing.ts` and
      // `rival-universe.ts` disagree about only in emphasis. Full, like a
      // shelved foreign book, because a legacy archive is a finished work.
      mastery: MASTERY_MAX,
      grimoire,
    });
  }
  return Object.freeze([...candidates]);
}

/** The founding library's handle, or `0`. `buildReferenceState` founds at least one. */
function firstLibrary(state: SimState): EntityHandle {
  const found = collectRecords(state, LIBRARY)
    .map(({ handle }) => handle)
    .sort((a, b) => a - b);
  return (found[0] ?? 0) as EntityHandle;
}
