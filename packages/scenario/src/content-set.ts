/*
 * Multiverse Mages — the shipped content, read once and projected into the
 * shapes a universe and an observation need.
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
 * Everything here is a **projection of `packages/content/data`**, never a
 * decision. `CLAUDE.md` is explicit that content — grid cells, nodes, species,
 * primitives, traditions — lives in validated data files and is never
 * hardcoded, so nothing below names a technique, a form, a node or a tradition
 * by its string id. What a universe *starts with* is a different question and is
 * answered in `reference-universe.ts`, where every chosen number is written down
 * beside its reason.
 *
 * ## The registry is loaded once per process, and that is not a hidden input
 *
 * `agent-api`'s `Scenario.create` must be a pure function of `(runSeed, config)`
 * and warns against module-level caches. The warning is about caches that can
 * *differ between calls* — a counter, a clock, a memo of a previous run's state.
 * {@link shippedContent} memoizes a value that is a pure function of files on
 * disk, is never written to, and is therefore the same object for every call in
 * the process and an equal object in every other. Reloading three hundred nodes
 * per run would cost a Monte Carlo worker its throughput and buy nothing.
 *
 * The property that actually matters is checked rather than argued: the sweep
 * suite asserts that a run executed inline and the same run executed in a fresh
 * worker produce byte-identical records.
 */

import type { ContentId, ContentRegistry, PrimitiveRecord, SpeciesRecord } from '@mm/content';
import { loadContent, shippedContentSource } from '@mm/content';
import type { RngStream, SimState } from '@mm/sim-core';
import { nextBounded } from '@mm/sim-core';
import type { Ruleset } from '@mm/state';
import { permits } from '@mm/state';
import type { CatalogueNode, ContentCatalogue } from '@mm/agent-api';
import { buildCatalogue } from '@mm/agent-api';
import type {
  AcquirePolicy,
  ExclusionResolver,
  ConsumptionRecorder,
  NodeCatalog,
  StorePolicy,
} from '@mm/rules-magic';
import {
  KnowledgeSubsystem,
  MagicGrid,
  acquirePolicy,
  catalogFromRegistry,
  createConsumptionRecorder,
  hookFor,
  nodeEffectMagnitudes,
  registerNonNodeConsumer,
  storePolicy,
  traditionTableFrom,
} from '@mm/rules-magic';
import type { SpeciesAffinities } from '@mm/rules-world';
import {
  readGoalAppeal,
  readApplicationWeights,
  readCastingWeights,
  readTargetAppeal,
  resolveSpeciesAffinities,
  territoryExtent,
  territoryYieldShares,
} from '@mm/rules-world';
import type { CombatEffectIndex } from '@mm/rules-raid';
import { combatEffectIndex } from '@mm/rules-raid';
import type { WorldStepDeps } from '@mm/coordination';
import {
  academicEffectIndex,
  envelopeResolver,
  godEffectHooks,
  nodeFacetsFrom,
  resolveGodContent,
  universeEffectIndex,
  vitalityIndex,
} from '@mm/coordination';

/** The permitted-axis halves of a ruleset (`contracts.md` §1.1). */
export interface RulesetAxes {
  readonly permittedTechniques: number;
  readonly permittedForms: number;
}

let cached: ContentRegistry | undefined;

/**
 * The shipped content set, loaded on first use.
 *
 * @throws ContentValidationError when the shipped data does not validate, which
 * is a build problem rather than a scenario problem and is left to propagate.
 */
export function shippedContent(): ContentRegistry {
  cached ??= loadContent(shippedContentSource());
  return cached;
}

/**
 * Species records by interned id, and the ids ascending.
 *
 * Ascending rather than in file order because the order species are seeded in
 * is the order their cohorts and mages get entity handles, and handle order
 * reaches the snapshot hash. A seeding order that tracked the file would make
 * every recorded run depend on how `species.json` happens to be sorted.
 */
export function speciesTable(registry: ContentRegistry): {
  speciesOf: (speciesId: number) => SpeciesRecord | undefined;
  ids: readonly number[];
} {
  const byId = new Map<number, SpeciesRecord>(
    registry.species.map((entry) => [entry.contentId, entry.record]),
  );
  return {
    speciesOf: (speciesId) => byId.get(speciesId),
    ids: Object.freeze([...byId.keys()].sort((a, b) => a - b)),
  };
}

/** A primitive record by its content id. */
export function primitiveNamed(registry: ContentRegistry, id: string): PrimitiveRecord {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) {
    throw new Error(
      `The shipped primitive registry declares no "${id}". The world loop needs it by name, and a ` +
        'scenario that silently ran without it would report a universe with no mortality, no ' +
        'harvest, no books, or no children.',
    );
  }
  return found.record;
}

/**
 * The ruleset the **v1 rectangle** implies: every technique and every form that
 * a `v1` cell occupies.
 *
 * `contracts.md` §2.2 makes the v1 subset exactly twelve cells forming a
 * 3-technique × 4-form rectangle, and the loader refuses content where it is
 * anything else. So OR-ing the axes of the flagged cells re-derives precisely
 * those twelve and permits no thirteenth — the rectangle property is what makes
 * an axis mask able to express the subset at all, and it is content's to keep,
 * not this file's to assume.
 *
 * Written this way rather than as two literals so that the day content moves the
 * rectangle, the reference universe moves with it instead of quietly permitting
 * cells that hold no v1 nodes and forbidding cells that do.
 */
export function v1RulesetAxes(registry: ContentRegistry): RulesetAxes {
  const techniqueBits = new Map(registry.techniques.map((entry) => [entry.record.id, entry.record.bit]));
  const formBits = new Map(registry.forms.map((entry) => [entry.record.id, entry.record.bit]));

  let permittedTechniques = 0;
  let permittedForms = 0;
  let cells = 0;
  for (const { record } of registry.cells) {
    if (record.v1 !== true) continue;
    cells += 1;
    const techniqueBit = techniqueBits.get(record.technique);
    const formBit = formBits.get(record.form);
    if (techniqueBit === undefined || formBit === undefined) {
      throw new Error(
        `Cell ${record.id} names an axis the registry does not hold. The loader interns both axes ` +
          'before a cell is accepted, so this is a loader change, not a content typo.',
      );
    }
    permittedTechniques |= 1 << techniqueBit;
    permittedForms |= 1 << formBit;
  }

  if (cells === 0) {
    throw new Error(
      'No shipped cell is flagged "v1": true, so the reference universe would permit nothing and ' +
        'every mage in it would be idle forever. The loader enforces exactly twelve.',
    );
  }
  return { permittedTechniques, permittedForms };
}

/**
 * How many techniques and how many forms a universe is founded holding.
 *
 * The **opening square** (`campaign-plan.md`, "The 2×2 opening"): a universe
 * does not begin with the grid, it begins with a sub-rectangle of it, and the
 * rest is reached by permitting further axes.
 *
 * There is deliberately no third field naming *which* axes. Two ways to say
 * that already exist and both are expressible without one — {@link
 * explicitOpeningAxes} for a god who chose, {@link seededOpeningAxes} for a
 * harness that wants divergence it did not have to author — and a spec that
 * could say it a third way would be a third notion of what a universe starts
 * with.
 */
export interface OpeningSquareSize {
  /** Techniques permitted at founding, `1..registry.techniques.length`. */
  readonly techniqueCount: number;
  /** Forms permitted at founding, `1..registry.forms.length`. */
  readonly formCount: number;
}

/**
 * The axis masks a set of technique and form bits implies.
 *
 * The whole opening-square mechanic is this function's output and nothing else.
 * `permits()` in `@mm/state` is `technique ∈ mask AND form ∈ mask` modulo
 * edicts, so an opening *is* a pair of masks — there is no second notion of
 * "is this cell open" to keep in step, no component to remember the founding
 * square, and no world-schema revision. Growing the square is `permitTechnique`
 * and `permitForm`, which `god/interventions.ts` already prices in favor.
 */
function axesFromBits(techniqueBits: Iterable<number>, formBits: Iterable<number>): RulesetAxes {
  let permittedTechniques = 0;
  let permittedForms = 0;
  for (const bit of techniqueBits) permittedTechniques |= 1 << bit;
  for (const bit of formBits) permittedForms |= 1 << bit;
  return { permittedTechniques, permittedForms };
}

/**
 * Refuses a size the registry cannot supply.
 *
 * Refuses rather than clamps. A clamped 9-technique square would run to
 * completion as a 5-technique one and be recorded as a distinct arm, which is
 * the same defect `readCount` refuses in `reference-universe.ts`: a level the
 * scenario cannot honour produces a cell identical to its neighbour and a
 * record claiming the two differ.
 */
function assertSquareFits(registry: ContentRegistry, size: OpeningSquareSize): void {
  const techniques = registry.techniques.length;
  const forms = registry.forms.length;
  if (
    !Number.isInteger(size.techniqueCount) ||
    size.techniqueCount < 1 ||
    size.techniqueCount > techniques ||
    !Number.isInteger(size.formCount) ||
    size.formCount < 1 ||
    size.formCount > forms
  ) {
    throw new Error(
      `An opening square of ${String(size.techniqueCount)} techniques × ${String(size.formCount)} ` +
        `forms does not fit the ${String(techniques)} × ${String(forms)} grid, and a square with ` +
        'no techniques or no forms permits nothing at all. Both counts are at least 1.',
    );
  }
}

/**
 * A uniformly random permutation of `0..count-1`, integer-only.
 *
 * Fisher–Yates backwards, which draws exactly `count - 1` times **whatever the
 * caller intends to keep**. That fixed cost is the point rather than an
 * incidental: a sweep takes the first *k* entries as its square, so drawing a
 * whole permutation and slicing it makes the 1×1 arm's square a prefix of the
 * 2×2 arm's at the same seed. The arms are then *nested*, and a size sweep
 * varies size alone. Drawing only the *k* axes each arm needs would move the
 * square's position as well as its size and confound the two.
 */
function axisPermutation(stream: RngStream, count: number): number[] {
  const order = Array.from({ length: count }, (_unused, index) => index);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = nextBounded(stream, i + 1);
    const swap = order[i] as number;
    order[i] = order[j] as number;
    order[j] = swap;
  }
  return order;
}

/**
 * An opening square drawn from the universe's own seed.
 *
 * **The harness answer to "who chooses the opening square".** A seeded square
 * guarantees divergence across a sweep without relying on the strategy pool to
 * produce it, which is exactly what a dimensionality measurement needs: two
 * universes that begin at different squares have no queue in common to walk.
 *
 * Both axes are drawn from `RNG_STREAM.openingSquare` and nothing else touches
 * that stream, so adding this draw re-rolls no mortality, no research and no
 * founding personality. That is not an argument — `test/unit/opening-square.test.ts`
 * asserts a seeded build and an explicit build of the same square agree on the
 * snapshot hash, which they can only do if the draw is invisible to every other
 * subsystem.
 */
export function seededOpeningAxes(
  registry: ContentRegistry,
  size: OpeningSquareSize,
  stream: RngStream,
): RulesetAxes {
  assertSquareFits(registry, size);
  // Both permutations come off one stream, techniques first. The order is
  // arbitrary and permanent: swapping it would move every seeded square ever
  // recorded without changing a single rule.
  const techniqueOrder = axisPermutation(stream, registry.techniques.length);
  const formOrder = axisPermutation(stream, registry.forms.length);
  const techniqueBits = registry.techniques.map((entry) => entry.record.bit);
  const formBits = registry.forms.map((entry) => entry.record.bit);
  return axesFromBits(
    techniqueOrder.slice(0, size.techniqueCount).map((index) => techniqueBits[index] as number),
    formOrder.slice(0, size.formCount).map((index) => formBits[index] as number),
  );
}

/**
 * An opening square named outright, by content id.
 *
 * **The play answer to the same question.** A god who picks her universe's
 * first techniques and forms is making the most path-dependent decision in the
 * game, and this is the shape that decision arrives in. Named by content id
 * rather than by bit, for the reason `referenceContent` names a tradition by
 * string: a bit is a fact about the order of a data file, so a caller that
 * asked for bit 2 would be asking for something else the day a technique is
 * inserted.
 */
export function explicitOpeningAxes(
  registry: ContentRegistry,
  techniqueIds: readonly string[],
  formIds: readonly string[],
): RulesetAxes {
  const techniqueBits = new Map(registry.techniques.map((e) => [e.record.id, e.record.bit]));
  const formBits = new Map(registry.forms.map((e) => [e.record.id, e.record.bit]));
  const resolve = (ids: readonly string[], table: Map<string, number>, axis: string): number[] =>
    ids.map((id) => {
      const bit = table.get(id);
      if (bit === undefined) {
        throw new Error(
          `The registry holds no ${axis} "${id}", so an opening square naming it would silently ` +
            'permit one axis fewer than the god asked for.',
        );
      }
      return bit;
    });
  if (techniqueIds.length === 0 || formIds.length === 0) {
    throw new Error(
      'An opening square must name at least one technique and at least one form. A square with ' +
        'neither permits no cell, and every mage in the universe would be idle forever.',
    );
  }
  return axesFromBits(
    resolve(techniqueIds, techniqueBits, 'technique'),
    resolve(formIds, formBits, 'form'),
  );
}

/**
 * The order a god's opening square grows in, when nobody names one.
 *
 * **The v1 rectangle's own axes first, ascending by content id, then every
 * remaining axis ascending.** Two properties follow from that ordering and both
 * are load-bearing:
 *
 * 1. **The prefix at the v1 rectangle's own size *is* the v1 rectangle**, so
 *    the largest standard opening is today's universe and a size sweep has a
 *    real control rather than a re-implementation of one. Asserted in
 *    `test/unit/opening-square.test.ts` against {@link v1RulesetAxes} rather
 *    than argued from this comment.
 * 2. **Smaller openings nest inside larger ones**, so a sweep over sizes varies
 *    size alone — the same property {@link seededOpeningAxes} buys by drawing a
 *    whole permutation and slicing it.
 *
 * Ascending content id is a **reproducible** order, not a ranking: nothing here
 * claims `intellego` is the technique a god should take first. It is the same
 * order {@link foundingCandidates} deals in, and for the same reason — a
 * starting position that depended on file order would not be reproducible from
 * its own description.
 */
export function standardOpeningOrder(registry: ContentRegistry): {
  readonly techniqueIds: readonly string[];
  readonly formIds: readonly string[];
} {
  const order = (
    all: readonly string[],
    inRectangle: ReadonlySet<string>,
  ): readonly string[] => {
    const ascending = [...all].sort();
    return Object.freeze([
      ...ascending.filter((id) => inRectangle.has(id)),
      ...ascending.filter((id) => !inRectangle.has(id)),
    ]);
  };
  const v1Cells = registry.cells.filter((entry) => entry.record.v1 === true);
  return {
    techniqueIds: order(
      registry.techniques.map((entry) => entry.record.id),
      new Set(v1Cells.map((entry) => entry.record.technique)),
    ),
    formIds: order(
      registry.forms.map((entry) => entry.record.id),
      new Set(v1Cells.map((entry) => entry.record.form)),
    ),
  };
}

/**
 * The opening square a god takes when she has not named one herself.
 *
 * **The default answer to "who chooses the opening square" is the god, not the
 * RNG.** A size is a choice a sweep or a client can express as two integers;
 * {@link standardOpeningOrder} turns it into named axes, and
 * {@link explicitOpeningAxes} — the play verb — turns those into the masks
 * `permits()` reads. Nothing here draws, so a standard opening adds no RNG
 * stream and forces no re-baseline event.
 *
 * A god who wants a *different* square of the same size calls
 * {@link explicitOpeningAxes} directly. This function is the default, not the
 * only shape a square comes in.
 */
export function standardOpeningAxes(
  registry: ContentRegistry,
  size: OpeningSquareSize,
): RulesetAxes {
  assertSquareFits(registry, size);
  const { techniqueIds, formIds } = standardOpeningOrder(registry);
  return explicitOpeningAxes(
    registry,
    techniqueIds.slice(0, size.techniqueCount),
    formIds.slice(0, size.formCount),
  );
}

/**
 * The opening square, in the shape `permits()` takes.
 *
 * **Membership in the square is asked of the one arbitration function and
 * nowhere else.** This file used to answer it itself — two lines of
 * `axes.permittedTechniques & (1 << techniqueBit)` — and
 * `state/test/unit/arbitration-conformance.test.ts` caught it, correctly: a
 * second implementation of legality is a second implementation, however small,
 * and the part every reimplementation drops is edict precedence. A square with
 * an interdiction inside it would then deal a founding grant in a cell the
 * universe forbids.
 *
 * No edicts, because an opening square is the axis halves of a ruleset and a
 * universe has issued nothing at tick zero. Passing the empty list rather than
 * skipping `permits()` is what keeps the day edicts *are* part of a founding
 * position a one-line change here instead of a second rule.
 */
function openingRuleset(axes: RulesetAxes): Ruleset {
  return {
    permittedTechniques: axes.permittedTechniques,
    permittedForms: axes.permittedForms,
    edicts: [],
  };
}

/**
 * Interned node ids inside the opening square that have no prerequisites,
 * ascending.
 *
 * These are the only nodes a founding grant can usefully name: a node whose
 * prerequisites nobody holds can be granted, but it can never be taught onward
 * and never rediscovered, so a universe founded on one starts and stays stuck.
 * Ascending id, because a founding grant is part of the starting position and a
 * starting position that depended on file order would not be reproducible from
 * its own description.
 *
 * **Read off the axes rather than the `v1` flag**, because under an opening
 * square the flag no longer says what a universe starts with — it says what the
 * *standard* opening is, which is one square among 910 two-by-twos. A grant
 * dealt from the v1 cells into a universe that does not permit them would be a
 * founding endowment nobody could cast, teach or rediscover.
 *
 * **This can legitimately return fewer candidates than `foundingNodes` asks
 * for.** Every one of the seventy cells happens to hold exactly one
 * prerequisite-free node in shipped content, so a 1×1 square offers exactly
 * one; a universe asking for four gets one. `buildReferenceState` deals what
 * exists rather than refusing, because a refused run punches a hole in a paired
 * seed grid while a thinly-founded run is data.
 */
export function foundingCandidates(
  registry: ContentRegistry,
  axes: RulesetAxes = v1RulesetAxes(registry),
): readonly ContentId[] {
  const ruleset = openingRuleset(axes);
  // A cell's interned `contentId` *is* its grid cell id — `@mm/content` interns
  // it as `techniqueBit × 14 + formBit + 1`, which is what `permits()` expects,
  // and `state/test/unit/grid-agrees-with-content.test.ts` pins the two together
  // for all seventy.
  const openCells = new Set(
    registry.cells
      .filter((entry) => permits(ruleset, entry.contentId))
      .map((entry) => entry.record.id),
  );
  return Object.freeze(
    registry.nodes
      .filter((entry) => openCells.has(entry.record.cell) && entry.record.prerequisites.length === 0)
      .map((entry) => entry.contentId)
      .sort((a, b) => a - b),
  );
}

/**
 * A shipped tradition whose `store` hook keeps written copies.
 *
 * Chosen by asking the hook rather than by naming a tradition, for the reason
 * `coordination`'s fixtures give: content ids are interned, so "the first
 * tradition" is not the first in the file, and the one that happens to come
 * first is the Art of Memory — which writes nothing down and caps a mage at
 * twelve nodes. A reference universe under it would report zero grimoires
 * forever, and the reader would be left to guess whether that is the tradition
 * or a broken scribing path.
 */
export function scribingTraditionId(registry: ContentRegistry): ContentId {
  for (const entry of registry.traditions) {
    if (storeHookOf(registry, entry.contentId).scribingAvailable) return entry.contentId;
  }
  throw new Error(
    'No shipped tradition keeps written copies, so nothing in this universe could ever be ' +
      'scribed and `libraryDependence` would be measuring an empty shelf.',
  );
}

/**
 * The interned id of the tradition a sweep *named*, or a refusal.
 *
 * The counterpart to {@link scribingTraditionId}, which picks a tradition by
 * asking the hooks a question. This one is told which tradition to use, and
 * exists because `vision.md` §4a makes the tradition an axis of play — *"a
 * universe has exactly one tradition, chosen by the god"* — and an axis nobody
 * can select is an axis nobody can measure.
 *
 * **Refuses an unknown name rather than falling back.** A sweep arm labelled
 * `art-of-memory` that quietly ran the default would produce a table of three
 * columns, two of them the same universe, reported as a comparison of three
 * traditions. That is the specific failure this whole measurement exists to
 * avoid, so the error names every tradition the content set actually ships.
 */
export function traditionIdNamed(registry: ContentRegistry, name: string): ContentId {
  for (const entry of registry.traditions) {
    if (entry.record.id === name) return entry.contentId;
  }
  const shipped = registry.traditions.map((entry) => entry.record.id).join(', ');
  throw new Error(
    `No shipped tradition has the id ${JSON.stringify(name)}. The content set ships: ${shipped}. ` +
      'Refusing rather than defaulting: an arm that silently ran another tradition would be ' +
      'reported as a measurement of the one it names.',
  );
}

/** A tradition's resolved `store` hook (`contracts.md` §2.5's four extension points). */
export function storeHookOf(registry: ContentRegistry, traditionId: ContentId): StorePolicy {
  const table = traditionTableFrom(registry);
  return storePolicy(hookFor('store', traditionId, traditionId, table));
}

/**
 * A tradition's resolved `acquire` hook — what learning costs, and what a fresh
 * instance is worth.
 *
 * Written beside {@link storeHookOf} rather than folded into it, because the two
 * hooks are resolved from the same id and are otherwise unrelated: `hookFor`
 * arbitrates each one separately, and a portal will one day resolve them from
 * different universes (`vision.md` §4a puts both on world-time today, which is
 * an answer, not an accident).
 */
export function acquireHookOf(registry: ContentRegistry, traditionId: ContentId): AcquirePolicy {
  const table = traditionTableFrom(registry);
  return acquirePolicy(hookFor('acquire', traditionId, traditionId, table));
}

/**
 * The §4.1 catalogue: every node's cell and tier, plus the tradition ids.
 *
 * This is the projection `agent-api` asks callers to build for it, and building
 * it here is the whole reason this package exists — `agent-api` may not import
 * `@mm/content` because its public surface re-exports a filesystem loader and
 * the observation layer has to run in a browser.
 */
export function contentCatalogue(registry: ContentRegistry): ContentCatalogue {
  const nodes: CatalogueNode[] = registry.nodes.map((entry) => ({
    nodeId: entry.contentId,
    cellId: registry.intern('cell', entry.record.cell),
    tier: entry.record.tier,
  }));
  // The cost table travels with the catalogue so that `agent-api`'s mask can
  // answer affordability without importing `@mm/content` — which it refuses to
  // do on purpose, because that package's surface re-exports a filesystem
  // loader and the observation layer has to run in a browser. Projected here,
  // where loading is legal, and decided nowhere.
  const god = resolveGodContent(registry);
  return buildCatalogue(nodes, registry.traditions.map((entry) => entry.contentId), {
    byAction: god.costs.byAction,
    foundUniversity: god.costs.foundUniversity,
    hysteresisStep: god.constants.hysteresisStep,
    // `sound-design.md` §5.2's eight bars. The mask reprices every action
    // itself, so these travel with the prices — an action the mask calls
    // affordable and the resolver refuses is not a cost, it is an
    // illegal-action counter.
    uneaseBars: god.constants.uneaseBars,
    uneaseStep: god.constants.uneaseStep,
    midRaidRevertMultiplier: god.constants.midRaidRevertMultiplier,
  });
}

/** The node catalog and the node-to-cell addressing the world loop resolves against. */
export function catalogAndCells(registry: ContentRegistry): {
  catalog: NodeCatalog;
  cells: ExclusionResolver;
} {
  return { catalog: catalogFromRegistry(registry), cells: MagicGrid.from(registry) };
}

/**
 * The deps a world simulation is built from, over shipped content.
 *
 * The six primitives are named because `WorldStepDeps` names them: lifespan
 * gates mortality, resource-yield the harvest, scribe-rate the scriptorium,
 * fertility the births, and research-rate and teach-rate the accumulator vision
 * §6a's library contributes into. Everything else the loop needs it reads out of
 * state.
 *
 * ## The recorder, and why this function is the place it is threaded
 *
 * `recorder` collects which primitives this wiring actually pulled node effects
 * for. `scripts/check-primitive-consumption.mjs` builds a universe with a fresh
 * one and asserts every primitive has a node-driven consumer — the *consumption*
 * question, as against `check:coverage`'s *authorship* question. See
 * `packages/rules-magic/src/effects/consumption.ts` for the argument.
 *
 * It is threaded here rather than anywhere else because this is the function
 * that decides what a running universe is made of. A read in a package nothing
 * assembles registers nothing, which is the correct answer and not a limitation.
 *
 * That sentence used to end *"…so `@mm/rules-raid`'s seven combat primitives are
 * not reachable by knowledge in any simulation that exists today"*, and it had
 * been false since `raids.ts` was written: this package depends on
 * `@mm/rules-raid`, installs its raid system in the reference world loop by
 * default, and `arbitration.ts` has always turned a held node into damage. What
 * was missing was the *fetch* — arbitration read `registry.nodes` itself, so the
 * recorder saw nothing and the check reported seven live consumers as absent.
 * `combat` below is that fetch, and it is handed to the arbiter as a required
 * argument so the wire cannot be cut without a type error.
 *
 * Defaulted so every existing caller keeps working and discards the recording.
 * Nothing is conditional on it — the same data is fetched either way — so a
 * caller that ignores it cannot get different behaviour, only less information.
 */
export function worldDeps(
  registry: ContentRegistry,
  traditionId: ContentId,
  recorder: ConsumptionRecorder = createConsumptionRecorder(),
): WorldStepDeps & { readonly combat: CombatEffectIndex } {
  const { catalog, cells } = catalogAndCells(registry);
  const { speciesOf, ids: speciesIds } = speciesTable(registry);
  // `cells` is the exclusion resolver as well as the cell resolver: `MagicGrid`
  // satisfies both, so the anti-requisites content authored (`vision.md` §4b)
  // reach the acquisition path without a second lookup table to keep in step.
  const knowledgeFor = (state: SimState): KnowledgeSubsystem =>
    KnowledgeSubsystem.fromState(state, catalog.nodeCount, cells);

  const god = resolveGodContent(registry);
  const lifespan = primitiveNamed(registry, 'lifespan');
  // How much a blessing or an encouragement is worth is a *rule*, so it lives
  // in the coordinating layer beside the rest of `god-agency` rather than here:
  // §5 does not grant `scenario` an edge to `@mm/primitives`, and the
  // dependency-graph test is right to refuse one. This file wires; it does not
  // compute.
  const effects = godEffectHooks({ constants: god.constants, cells });

  // Species affinities are resolved once per species, not once per mage per
  // tick: six records against potentially thousands of mages, and the answer is
  // a pure function of the species record and the registry.
  const affinityCache = new Map<string, SpeciesAffinities>();

  // The god hooks stack blessing and encouragement *constants*, never a node's
  // authored magnitude — a blessed mage researches faster because the god blessed
  // her, not because anyone discovered anything. Recorded so a reader of the
  // report can tell the god's contribution apart from the knowledge-driven one
  // beside it. A non-node registration never counts toward consumption; it only
  // explains, which is why these three stay here now that two of the primitives
  // they name have a node-driven consumer as well.
  //
  // **An encouragement is no longer among them.** It used to be a second source
  // of `research-rate` here; it is now the emphasis term in `target-appeal.ts`,
  // which consumes no primitive at all because what it changes is *which node a
  // mage picks*, not how fast any rate runs. So `research-rate`'s god-side
  // consumer is the blessing and nothing else.
  registerNonNodeConsumer(
    recorder,
    'research-rate',
    'coordination/god/effects.researchBonusesFor (blessing constants)',
  );
  registerNonNodeConsumer(
    recorder,
    'teach-rate',
    'coordination/god/effects.teachBonusesFor (blessing constants)',
  );
  registerNonNodeConsumer(
    recorder,
    'lifespan',
    'coordination/god/effects.lifespanEffectsFor (blessing + curse constants)',
  );
  // Species content, not node content: `carrying-capacity` scales births by the
  // species record's own `fertility`, which no amount of research changes.
  registerNonNodeConsumer(
    recorder,
    'fertility',
    'rules-world/economy/carrying-capacity (species.fertility)',
  );
  // `scribe-rate` used to be named here as *deliberately unregistered*, because
  // `world-step.ts` passed it `NO_BONUSES` — a literal empty source list — so it
  // stacked to the identity every tick and nothing, node or god, could move it.
  // W18 ended that: the scribe goal now takes `academic.scribeRate(mage)`, and
  // `research-rate` and `teach-rate` take the same treatment on top of the god's
  // constants. All three register from `academicEffectIndex` below, at the line
  // that reads the authored magnitudes.
  //
  // `resource-yield` used to be in that sentence and no longer is. W29 wired
  // the economy: `world-step.ts` now passes `economy.resourceYield` and
  // `economy.buildRate` from `universeEconomyBonuses`, which gathers
  // `target: "universe"` node effects gated on the node being *known* and its
  // cell *permitted*. Both register from that fetch site — see
  // `coordination/universe-effects.ts` — and the measurement that says it is
  // real rather than plumbed is in the W29 commit: resource-yield moved yields
  // +214% to +294%, and build-rate cut time-to-build by 57%.
  //
  // w107 gave `resource-yield` a **second** node-driven consumer, and the two
  // are different mechanisms rather than one written twice. W29's is *ambient*:
  // a castable, permitted node raises what every laborer cohort produces, and it
  // costs the mage who knows it nothing. `GOAL.applyMagic` is the other: she
  // spends the month casting one node she holds, and the materials are hers.
  // Both reach the loop through `universeEffects`, whose index is built from the
  // registry directly, so neither adds a registration here.

  return {
    speciesOf,
    catalog,
    cells,
    // The wire from knowledge to a raid, built here for the same reason
    // `universeEffects` is: this is the function that decides what a running
    // universe is made of, and the fetch is what registers a consumer.
    //
    // It is **not** part of `WorldStepDeps`, and that is a §5 boundary rather
    // than a stylistic call: `coordination` may not import `@mm/rules-raid` —
    // a raid's consequences land in world state *through* `coordination`, so
    // the edge runs the other way — and typing the field there would need the
    // import. `raids.ts` reads it off `content.deps`, which is
    // `ReturnType<typeof worldDeps>` and so picks the widening up for free.
    combat: combatEffectIndex(registry, recorder),
    // `sound-design.md` §4.1's shape, per technique. Built here because this is
    // where a registry is in hand; the arithmetic that reads it is
    // `@mm/primitives`' and the resolution is `@mm/coordination`'s. This file
    // wires; it does not compute.
    envelopes: envelopeResolver(registry, cells),
    facets: nodeFacetsFrom(registry),
    affinitiesOf: (species) => {
      const cached = affinityCache.get(species.id);
      if (cached !== undefined) return cached;
      const resolved = resolveSpeciesAffinities(species, registry);
      affinityCache.set(species.id, resolved);
      return resolved;
    },
    appeal: readTargetAppeal(registry),
    goalAppeal: readGoalAppeal(registry),
    application: readApplicationWeights(registry),
    casting: readCastingWeights(registry),
    store: storeHookOf(registry, traditionId),
    acquire: acquireHookOf(registry, traditionId),
    territory: territoryExtent(registry.territories.map((entry) => entry.record)),
    // The content half of `contracts.md` §2.7's split, in interned order — a
    // code-unit sort of the ids (`intern.ts`), so the handles the world step
    // allocates for holdings are a function of content and of nothing else.
    territoryKinds: registry.territories.map((entry) => ({
      kindId: entry.contentId,
      landUnits: entry.record.landUnits,
      capacityPerLandUnit: entry.record.capacityPerLandUnit,
      libraryUpkeepMultiplier: entry.record.libraryUpkeepMultiplier,
    })),
    // The same records the extent is summed from, read for their yield mix
    // instead of their capacity. Both are fixed for the length of a run.
    yieldShares: territoryYieldShares(registry.territories.map((entry) => entry.record)),
    // The wire from knowledge to the economy. Built here, at the composition
    // root, because it is a pure projection of the content set — see
    // `universe-effects.ts`, which explains at length what was not connected
    // before it existed.
    universeEffects: universeEffectIndex(registry, recorder),
    // The same wire for the three rates a scholar's own knowledge moves. Built
    // here for the same reason and registered from the same place — see
    // `academic-effects.ts` for why a per-mage effect could not travel through
    // `universeEffects`, and for the ten `target: "universe"` `research-rate`
    // effects it deliberately does not route.
    academicEffects: academicEffectIndex(registry, recorder),
    // The same wire, one primitive pair over: `lifespan` and `fertility`. Both
    // were declared exclusions in the consumption check, parked with a written
    // reason — *"both sit on non-v1 nodes and are moved by species traits and
    // blessing constants rather than by anything a mage can learn"* — and that
    // reason has expired. The index is built here for the reason every other
    // one is: this is the function that decides what a running universe is made
    // of, and the fetch is what registers the consumer.
    //
    // The two `registerNonNodeConsumer` calls above stay, and stay true: a
    // blessing still contributes months from a constant, and a cohort's births
    // still scale by its species' own `fertility`. What changes is that they
    // are no longer the *only* sources — so the check will stop printing these
    // two under *"consumed, but never from node effects"*, which is the line
    // this campaign exists to shorten.
    vitality: vitalityIndex(registry, recorder),
    primitives: {
      lifespan,
      resourceYield: primitiveNamed(registry, 'resource-yield'),
      buildRate: primitiveNamed(registry, 'build-rate'),
      researchRate: primitiveNamed(registry, 'research-rate'),
      teachRate: primitiveNamed(registry, 'teach-rate'),
      scribeRate: primitiveNamed(registry, 'scribe-rate'),
      practiceRate: primitiveNamed(registry, 'practice-rate'),
      fertility: primitiveNamed(registry, 'fertility'),
    },
    knowledgeFor,
    god: {
      content: god,
      catalog,
      cells,
      knowledgeFor,
      worshipYield: primitiveNamed(registry, 'worship-yield'),
      // Both of these go through `nodeEffectMagnitudes` rather than a local
      // helper so the fetch is recorded. These are the two places in the whole
      // assembled simulation where a node's authored magnitudes become
      // something the loop reads: `yieldSources` gates each node's worship
      // magnitudes on `knowledge.instanceCount(nodeId) > 0`, and `portalPlan`
      // gates the raid entry point on a living mage holding a portal node.
      worshipYieldNodes: nodeEffectMagnitudes(
        registry,
        'worship-yield',
        'coordination/god/system.yieldSources',
        recorder,
      ),
      portalNodes: new Set(
        nodeEffectMagnitudes(
          registry,
          'portal',
          'coordination/god/interventions.portalPlan',
          recorder,
        ).keys(),
      ),
      // Every species the content declares, because the roster is a fact about
      // the multiverse rather than about this universe's arm — the same shape
      // `portalTargets` has. What varies between the arms of the alliance
      // measurement is whether the god *uses* action 16, not whether anyone
      // would answer; a roster resolved per worker could not have expressed the
      // latter anyway (see `contracts.md` §1.1 on `grantBudget`), and pretending
      // otherwise would have put a swept parameter behind a shared frozen
      // struct.
      //
      // `invitePlan` still refuses a species already living here, so this being
      // "all six" is a ceiling and not a permission.
      invitableSpecies: new Set(speciesIds),
      speciesOf,
      // `nodesLostThisTick` is deliberately absent: `defineWorldSimulation`
      // supplies it from the world loop's own report closure, because that is
      // the one place that knows which tick a loss count belongs to.
    },
    ...effects,
  };
}

// `nodesCarrying` used to live here — a local helper that filtered
// `registry.nodes` by primitive. It moved to `@mm/rules-magic` as
// `nodeEffectMagnitudes`, unchanged except that it now takes a recorder and
// registers the fetch. The move is the mechanism, not tidying: a local helper
// can be copied into a second file and the consumption check would never know,
// whereas the shared accessor cannot hand over node magnitudes without saying
// who asked. Its note about returning magnitudes **unstacked** — summing them
// here would be inline stacking by another spelling, and the registry's
// declared `stacking` rule is `stackMagnitudes`'s alone to apply — travelled
// with it.
