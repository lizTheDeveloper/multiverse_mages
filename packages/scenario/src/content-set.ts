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
import type { SimState } from '@mm/sim-core';
import type { CatalogueNode, ContentCatalogue } from '@mm/agent-api';
import { buildCatalogue } from '@mm/agent-api';
import type { AcquirePolicy, CellResolver, NodeCatalog, StorePolicy } from '@mm/rules-magic';
import {
  KnowledgeSubsystem,
  MagicGrid,
  acquirePolicy,
  catalogFromRegistry,
  hookFor,
  storePolicy,
  traditionTableFrom,
} from '@mm/rules-magic';
import type { SpeciesAffinities } from '@mm/rules-world';
import { readTargetAppeal, resolveSpeciesAffinities, territoryExtent } from '@mm/rules-world';
import type { WorldStepDeps } from '@mm/coordination';
import { godEffectHooks, nodeFacetsFrom, resolveGodContent } from '@mm/coordination';

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
 * Every axis the content declares — the whole 5 × 14 grid permitted at founding.
 *
 * ## Why this is separate from the `v1` flag rather than replacing it
 *
 * `v1: true` means *"inside the twelve-cell authoring rectangle"* and drives the
 * loader's authoring standards — mode/technique coherence, effect glosses, the
 * refusal of a tier whose `researchCost` is a single value. **Enablement is a
 * different question from authoring standard**, and conflating them would mean
 * that permitting a cell silently demanded its 249 nodes be re-authored, or
 * else that relaxing the authoring check was the price of permitting anything.
 *
 * So the flag keeps its meaning and this function answers the other question.
 * `checkV1Subset` still enforces exactly twelve flagged cells including
 * `rego-limen`; what changes is that a scenario may now start a universe that
 * permits more than those twelve.
 *
 * ## What it is for
 *
 * `docs/design/campaign-plan.md` records the campaign's confirmed root cause:
 * *"The 51-node passive baseline is content exhaustion, not a baseline"* — the
 * twelve enabled cells hold 51 of the authored nodes and an idle universe learns
 * all of them, in roughly a quarter of a 2,400-tick run. The other 249 nodes
 * exist, validate, and have never been executed. Permitting them is the only
 * lever that attacks the binding constraint directly rather than through a
 * mechanic.
 *
 * **The 249 have never been run.** `check:content` validates them; nothing has
 * stepped them. Expect the first wide sweep to surface authoring defects, and
 * expect that to be the point of running it.
 */
export function fullGridRulesetAxes(registry: ContentRegistry): RulesetAxes {
  let permittedTechniques = 0;
  let permittedForms = 0;
  for (const { record } of registry.techniques) permittedTechniques |= 1 << record.bit;
  for (const { record } of registry.forms) permittedForms |= 1 << record.bit;
  return { permittedTechniques, permittedForms };
}

/**
 * Interned node ids inside the v1 rectangle that have no prerequisites,
 * ascending.
 *
 * These are the only nodes a founding grant can usefully name: a node whose
 * prerequisites nobody holds can be granted, but it can never be taught onward
 * and never rediscovered, so a universe founded on one starts and stays stuck.
 * Ascending id, because a founding grant is part of the starting position and a
 * starting position that depended on file order would not be reproducible from
 * its own description.
 */
export function foundingCandidates(registry: ContentRegistry): readonly ContentId[] {
  const v1Cells = new Set(
    registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.id),
  );
  return Object.freeze(
    registry.nodes
      .filter((entry) => v1Cells.has(entry.record.cell) && entry.record.prerequisites.length === 0)
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
  });
}

/** The node catalog and the node-to-cell addressing the world loop resolves against. */
export function catalogAndCells(registry: ContentRegistry): {
  catalog: NodeCatalog;
  cells: CellResolver;
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
 */
export function worldDeps(registry: ContentRegistry, traditionId: ContentId): WorldStepDeps {
  const { catalog, cells } = catalogAndCells(registry);
  const { speciesOf } = speciesTable(registry);
  const knowledgeFor = (state: SimState): KnowledgeSubsystem =>
    KnowledgeSubsystem.fromState(state, catalog.nodeCount);

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

  return {
    speciesOf,
    catalog,
    cells,
    facets: nodeFacetsFrom(registry),
    affinitiesOf: (species) => {
      const cached = affinityCache.get(species.id);
      if (cached !== undefined) return cached;
      const resolved = resolveSpeciesAffinities(species, registry);
      affinityCache.set(species.id, resolved);
      return resolved;
    },
    appeal: readTargetAppeal(registry),
    store: storeHookOf(registry, traditionId),
    acquire: acquireHookOf(registry, traditionId),
    territory: territoryExtent(registry.territories.map((entry) => entry.record)),
    primitives: {
      lifespan,
      resourceYield: primitiveNamed(registry, 'resource-yield'),
      researchRate: primitiveNamed(registry, 'research-rate'),
      teachRate: primitiveNamed(registry, 'teach-rate'),
      scribeRate: primitiveNamed(registry, 'scribe-rate'),
      fertility: primitiveNamed(registry, 'fertility'),
    },
    knowledgeFor,
    god: {
      content: god,
      catalog,
      cells,
      knowledgeFor,
      worshipYield: primitiveNamed(registry, 'worship-yield'),
      worshipYieldNodes: nodesCarrying(registry, 'worship-yield'),
      portalNodes: new Set(nodesCarrying(registry, 'portal').keys()),
      // `nodesLostThisTick` is deliberately absent: `defineWorldSimulation`
      // supplies it from the world loop's own report closure, because that is
      // the one place that knows which tick a loss count belongs to.
    },
    ...effects,
  };
}

/**
 * Interned node ids that carry a primitive, and each node's magnitudes.
 *
 * The magnitudes are handed over as a **list per node, unstacked**. Summing
 * them here would be inline stacking by another spelling — the lint rule says
 * so in as many words — and it would also be the wrong arithmetic: how several
 * sources of one primitive combine is the registry's declared `stacking` rule,
 * and `stackMagnitudes` is the only thing permitted to apply it. Callers that
 * want one number ask that function for it.
 */
function nodesCarrying(
  registry: ContentRegistry,
  primitiveId: string,
): Map<number, readonly number[]> {
  const found = new Map<number, readonly number[]>();
  for (const entry of registry.nodes) {
    const magnitudes = entry.record.effects
      .filter((effect) => effect.primitive === primitiveId)
      .map((effect) => effect.magnitude);
    if (magnitudes.length > 0) found.set(entry.contentId, Object.freeze(magnitudes));
  }
  return found;
}
