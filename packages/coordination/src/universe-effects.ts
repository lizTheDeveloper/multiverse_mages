/*
 * Multiverse Mages — what a universe's knowledge is worth to its economy.
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
 * ## The wire that was never run
 *
 * `node.schema.json` gives every effect a `target`, and `"universe"` is one of
 * the five it may take. Across the shipped content, **46 of the 70 cells** carry
 * a `resource-yield` or `build-rate` effect at `target: "universe"` — *Rego
 * Terram* alone carries three build-rate nodes, which is vision §4's own worked
 * example (*"Rego Terram letting universities go up faster is not a special
 * case in code — it is a node weighted toward `build-rate`"*) written out as
 * data.
 *
 * Before this module, a grep of `rules-world`, `rules-magic` and `coordination`
 * for a consumer of a universe-targeted effect returned **nothing**.
 * `world-step.ts` passed `resourceYieldBonuses: []` — a hardcoded empty array —
 * and `build-rate`'s only consumer, `advanceConstruction`, had no caller outside
 * its own tests. The content was authored. The wire was missing.
 *
 * That is the answer to *"why do the god's verbs produce no marginal value over
 * autonomous mage behaviour?"* — **the economy had no idea what anyone knew.**
 * Permitting a technique changed which nodes could be researched and changed
 * nothing a laborer did, so no ruleset was worth choosing over another and no
 * spell was worth casting.
 *
 * ## Two gates, and both are the point
 *
 * A node contributes to the economy only if it is **known** and its cell is
 * **permitted**.
 *
 * - *Known* means **somebody can cast it**: an instance held at a mind or a
 *   memory palace, at or above `MASTERY_ACTIVATION_THRESHOLD`. Not "an instance
 *   exists somewhere".
 * - *Permitted* is `permits(ruleset, cellOf(nodeId))`, evaluated **at
 *   application time**, not at the moment the knowledge was acquired. An
 *   interdiction therefore switches the economy off without destroying what
 *   anyone knows, which is what an interdiction is: *"Mentem is open to my
 *   scholars, but none shall unmake a mind."*
 *
 * ## Both gates are `gatherEffects`', and that is the point of this file
 *
 * An earlier draft walked `KNOWLEDGE_INSTANCE` itself and gated on **presence**
 * — an instance exists anywhere — which was wrong twice, and wrong in a way
 * worth recording: it is the exact failure class this change exists to fix,
 * reintroduced inside the fix for it.
 *
 * It was wrong against the spec. `magic-primitives` requires that written
 * instances produce no direct contribution and that a library's influence appear
 * *solely* through the published library-depth function. `contribution.ts` puts
 * it best — *"a shelf full of `research-rate` grimoires that nobody has read is
 * exactly as magical as a shelf."* Presence-gating would have made a book on a
 * shelf raise the harvest: a second, invisible source of power that no balance
 * assertion is written over.
 *
 * And it was wrong against the rest of the design. With no mastery term, a node
 * discovered last tick sits at `DEFAULT_INITIAL_MASTERY` and would have
 * delivered **full** economic yield immediately, while decay toward the floor
 * reduced nothing. Retention, decay, teaching fidelity and marooning would all
 * have been economically inert on the one path that had just been connected.
 *
 * So this module does not implement the gate. It calls `gatherEffects` and
 * filters the result to `target: "universe"`, which is what that function's
 * shape already invites — it carries `target` through on every contribution and
 * never filters on it, because filtering is the consumer's job. **Two
 * implementations of knowledge-to-effect would diverge, and the one with the
 * adversarial test would not have been the one the economy used.**
 *
 * The cost of the correct gate is worth stating plainly, because it is a real
 * design consequence and not a free win: a universe's economy now depends on
 * living, practising mages. Kill them and the harvest falls, even though every
 * book survives. §6a's compounding-knowledge loop still runs through the
 * library — a deep shelf trains the mages who then cast — but the library is not
 * itself a factory.
 *
 * ## Per contributing instance, not once per node
 *
 * Three archmages who know the harvest spell contribute three magnitudes, and
 * `stackMagnitudes` folds them under `contracts.md` §3's one cap. That is the
 * pipeline's semantics everywhere else, and deviating from it here would be this
 * module's second private rule. It also makes a universe's economy a function of
 * how many people can actually cast, which is what *"magic would be everywhere
 * in universes it was in"* is trying to say.
 *
 * ## `resource-yield` is routed by form; `build-rate` is not
 *
 * `resource-yield`'s unit is *"multiplier-on-materials-per-world-tick"*, and
 * materials now have kinds, so the magnitude has to say **which** materials.
 * `kinds.ts` routes it by the node's form, out of `sound-design.md` §4.2's
 * material column. Without that routing, permitting *Creo Herbam* and permitting
 * *Rego Terram* would be interchangeable and two universes could not differ
 * economically at all.
 *
 * `build-rate`'s unit is *"multiplier-on-construction-progress"* — a rate, not a
 * material — so it is **not** routed and stacks universe-wide. Inventing a
 * per-kind reading of it would be this module authoring a semantics
 * `contracts.md` §3 did not give it.
 *
 * ## Cost
 *
 * The index is built once per content load. The per-tick pass is one
 * `gatherEffects` over the universe's knowledge instances, memoized on the
 * `SimState` object — the same `WeakMap`-keyed-on-state pattern
 * `god/effects.ts` uses, and for the same reason: `step` clones the state every
 * tick, so a new state is a new key, an old state is collectable, and there is
 * no invalidation rule for anyone to forget.
 */

import type { ContentId, ContentRegistry, FormRecord } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import type { CellResolver, EffectSourceInstance } from '@mm/rules-magic';
import { gatherEffects } from '@mm/rules-magic';
import type { MaterialAmounts, MaterialKind } from '@mm/rules-world';
import { MATERIAL_KINDS, routeYieldByForm, zeroAmounts } from '@mm/rules-world';
import type { Ruleset } from '@mm/state';
import { KNOWLEDGE_INSTANCE, collectRecords } from '@mm/state';

/**
 * The content lookups the economy needs and `gatherEffects` does not do.
 *
 * `gatherEffects` hands back a `nodeId` and a magnitude; routing that magnitude
 * to a material kind needs the node's **form**, which is a grid question. This
 * resolves it once per content load rather than per contribution per tick.
 *
 * The registry rides along because `gatherEffects` takes one — this is the
 * object a composition root builds so that the world loop does not have to hold
 * a content registry of its own.
 */
export interface UniverseEffectIndex {
  readonly registry: ContentRegistry;
  /** The form record behind a node's cell, or `undefined` for an unknown node. */
  formOf(nodeId: ContentId): FormRecord | undefined;
  /** How many nodes carry a universe-scoped economic effect at all. For diagnostics. */
  readonly weightedNodeCount: number;
}

/**
 * The primitives this module spends.
 *
 * Every *other* primitive's universe-targeted contribution is gathered and
 * dropped here, because its consumer is elsewhere or not built. Dropping them is
 * correct — `gatherEffects` is the general gatherer and every consumer filters —
 * but it is worth knowing that this file will not be the only consumer forever.
 */
const ECONOMIC_PRIMITIVES = new Set(['resource-yield', 'build-rate']);

/**
 * Builds the index from a loaded content registry.
 *
 * The node-to-form walk goes through the **cell**, because that is where the
 * grid keeps the association: a node declares its cell, and a cell declares its
 * technique and form. Resolving it once here keeps the per-tick path free of
 * string interning.
 */
export function universeEffectIndex(registry: ContentRegistry): UniverseEffectIndex {
  const formById = new Map(registry.forms.map((form) => [form.contentId, form.record]));
  const formByCell = new Map<ContentId, FormRecord>();
  for (const cell of registry.cells) {
    const form = formById.get(registry.intern('form', cell.record.form));
    if (form !== undefined) formByCell.set(cell.contentId, form);
  }

  const forms = new Map<ContentId, FormRecord>();
  let weightedNodeCount = 0;
  for (const node of registry.nodes) {
    const form = formByCell.get(registry.intern('cell', node.record.cell));
    if (form !== undefined) forms.set(node.contentId, form);
    if (
      node.record.effects.some(
        (effect) => effect.target === 'universe' && ECONOMIC_PRIMITIVES.has(effect.primitive),
      )
    ) {
      weightedNodeCount += 1;
    }
  }

  return { registry, formOf: (nodeId) => forms.get(nodeId), weightedNodeCount };
}

/** What the world loop hands to production and construction this tick. */
export interface UniverseEconomyBonuses {
  /** `resource-yield` magnitudes, per kind, for `stackMagnitudes`. */
  readonly resourceYield: Readonly<Record<MaterialKind, readonly Fixed[]>>;
  /** `build-rate` magnitudes, for `stackMagnitudes`. */
  readonly buildRate: readonly Fixed[];
  /**
   * Contributions that reached the economy this tick.
   *
   * Emitted because "the economy did not move" and "nothing reached it" look
   * identical in every other series, and the whole history of this seam is a
   * bonus list nobody noticed was empty for three releases. One per contributing
   * *instance*, so it falls when a mage dies as well as when a cell is
   * interdicted.
   */
  readonly contributingNodes: number;
}

/** Nothing castable, or nothing permitted. */
export const NO_ECONOMY_BONUSES: UniverseEconomyBonuses = {
  resourceYield: { food: [], stone: [], vellum: [] },
  buildRate: [],
  contributingNodes: 0,
};

/** What {@link universeEconomyBonuses} reads. */
export interface UniverseEconomyDeps {
  readonly index: UniverseEffectIndex;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
}

const cached = new WeakMap<SimState, UniverseEconomyBonuses>();

/**
 * The economic bonuses a universe's castable, permitted knowledge earns it.
 *
 * Memoized per state object. The ruleset is fixed for the length of a tick — an
 * axis change is a god action applied at the top of the step — so caching on the
 * state cannot serve an answer computed under a ruleset that has since changed.
 *
 * `TIME_MODE.world` is passed rather than the step's own mode because the world
 * loop is the only caller and has already refused to run in any other mode. Both
 * primitives here declare `scale: "world"`, so gathering in raid mode would
 * return nothing and the economy would silently stop during a raid — a
 * plausible-looking behaviour nobody chose.
 */
export function universeEconomyBonuses(
  state: SimState,
  deps: UniverseEconomyDeps,
): UniverseEconomyBonuses {
  const hit = cached.get(state);
  if (hit !== undefined) return hit;

  // Ascending entity order, which is what `collectRecords` walks. Nothing sorts:
  // `gatherEffects` documents contribution order as instances-in-order, and the
  // one place order genuinely must not matter — the fold over magnitudes — is
  // `@mm/primitives`' and is solved there.
  const instances: EffectSourceInstance[] = [];
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    instances.push({ nodeId: row.nodeId, locationKind: row.locationKind, mastery: row.mastery });
  }

  const contributions = gatherEffects(instances, {
    registry: deps.index.registry,
    ruleset: deps.ruleset,
    mode: TIME_MODE.world,
    cellOf: (nodeId) => deps.cells.cellOf(nodeId),
  });

  const resourceYield: Record<MaterialKind, Fixed[]> = { food: [], stone: [], vellum: [] };
  const buildRate: Fixed[] = [];
  let contributingNodes = 0;

  for (const contribution of contributions) {
    if (contribution.target !== 'universe') continue;
    if (!ECONOMIC_PRIMITIVES.has(contribution.primitiveId)) continue;
    contributingNodes += 1;

    if (contribution.primitiveId === 'build-rate') {
      if (contribution.magnitude > 0) buildRate.push(contribution.magnitude);
      continue;
    }

    const form = deps.index.formOf(contribution.nodeId);
    if (form === undefined) continue;
    const routed = routeYieldByForm(form, contribution.magnitude);
    for (const kind of MATERIAL_KINDS) {
      if (routed[kind] > 0) resourceYield[kind].push(routed[kind]);
    }
  }

  const built: UniverseEconomyBonuses = { resourceYield, buildRate, contributingNodes };
  cached.set(state, built);
  return built;
}

/** Sums a routed basket, for tests and diagnostics that want one number. */
export function summedYield(bonuses: UniverseEconomyBonuses): MaterialAmounts {
  const total = zeroAmounts();
  for (const kind of MATERIAL_KINDS) {
    for (const magnitude of bonuses.resourceYield[kind]) total[kind] += magnitude;
  }
  return total;
}
