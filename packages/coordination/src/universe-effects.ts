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
 * the five. Across shipped content **46 of the 70 cells** carry a
 * `resource-yield` or `build-rate` effect at `target: "universe"` — *Rego
 * Terram* alone carries three build-rate nodes, vision §4's own worked example
 * (*"Rego Terram letting universities go up faster is not a special case in code
 * — it is a node weighted toward `build-rate`"*) written out as data.
 *
 * Before this module, grepping `rules-world`, `rules-magic` and `coordination`
 * for a consumer of a universe-targeted effect returned **nothing**.
 * `world-step.ts` passed `resourceYieldBonuses: []` — hardcoded empty — and
 * `build-rate`'s only consumer, `advanceConstruction`, had no caller outside its
 * own tests. The content was authored; the wire was missing.
 *
 * That answers *"why do the god's verbs produce no marginal value over
 * autonomous mage behaviour?"* — **the economy had no idea what anyone knew.**
 * Permitting a technique changed which nodes could be researched and nothing a
 * laborer did, so no ruleset was worth choosing and no spell worth casting.
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
 * — an instance exists anywhere — wrong twice, and wrong in a way worth
 * recording: the exact failure class this change exists to fix, reintroduced
 * inside the fix for it.
 *
 * Wrong against the spec. `magic-primitives` requires written instances to
 * produce no direct contribution and a library's influence to appear *solely*
 * through the published library-depth function. `contribution.ts` puts it best —
 * *"a shelf full of `research-rate` grimoires that nobody has read is exactly as
 * magical as a shelf."* Presence-gating would let a shelved book raise the
 * harvest: a second, invisible source of power no balance assertion covers.
 *
 * Wrong against the rest of the design too. With no mastery term, a node
 * discovered last tick sits at `DEFAULT_INITIAL_MASTERY` and would deliver
 * **full** economic yield immediately, while decay toward the floor reduced
 * nothing. Retention, decay, teaching fidelity and marooning would all be
 * economically inert on the one path just connected.
 *
 * So this module does not implement the gate. It calls `gatherEffects` and
 * filters to `target: "universe"` — what that function's shape invites, since it
 * carries `target` through on every contribution and never filters, because
 * filtering is the consumer's job. **Two implementations of knowledge-to-effect
 * would diverge, and the one with the adversarial test is not the one the
 * economy would have used.**
 *
 * The correct gate's cost, stated plainly because it is a design consequence and
 * not a free win: a universe's economy now depends on living, practising mages.
 * Kill them and the harvest falls though every book survives. §6a's compounding
 * loop still runs through the library — a deep shelf trains the mages who cast —
 * but the library is not itself a factory.
 *
 * ## `resource-yield` is gated on **work performed**; `build-rate` is not
 *
 * This module used to read the instance table and nothing else, which made
 * *knowing* a spell identical to *applying* it. W49 measured what that costs:
 * `permit-then-idle` — a bot that presses two buttons for 140 of 2400 ticks and
 * then does literally nothing — scored **1.0001×** `permissive-breadth` on
 * applied use. Idle is the ablation of breadth, and 2,260 ticks of doing nothing
 * cost it 0.01%. An economy that reads what a universe *holds* cannot respond to
 * what a universe *does*, and every god verb aimed at it was therefore
 * decoration.
 *
 * So a `resource-yield` contribution now requires a **practitioner**: the
 * instance's holder must be committed to `GOAL.practice` on that node. Vision
 * §4's *"magic would be everywhere in universes it was in"* becomes a claim
 * about mage-months rather than about a census — the harvest spell raises the
 * harvest while somebody is casting it, and stops when she moves on.
 *
 * The commitment read here is the one written **last** tick, because this phase
 * runs before autonomy and before the work phase. That is `spendTheMonth`'s own
 * convention — *"only a held commitment is worked"* — applied to the same
 * boundary: the economy counts the mages who are about to spend this month
 * casting, and the same mages then spend it.
 *
 * **`build-rate` is deliberately left ungated, and this is one change, not two.**
 * Its consumer is `advanceConstruction`, its unit is a multiplier on a
 * *construction site's* progress, and the design's worked example for it is
 * institutional — *"Rego Terram letting universities go up faster"*. Gating it
 * on an individual's month would stall half-built universities behind one
 * mage's goal switch, which is a second balance movement mixed into the
 * measurement of the first. One primitive moves per change, so the delta is
 * attributable; `build-rate` is the control.
 *
 * ## Per contributing instance, not once per node
 *
 * Three archmages who know the harvest spell contribute three magnitudes, and
 * `stackMagnitudes` folds them under `contracts.md` §3's one cap — the
 * pipeline's semantics everywhere else, and deviating would be this module's
 * second private rule. It also makes a universe's economy a function of how many
 * people can actually cast, which is what *"magic would be everywhere in
 * universes it was in"* is trying to say.
 *
 * ## `resource-yield` is routed by form; `build-rate` is not
 *
 * `resource-yield`'s unit is *"multiplier-on-materials-per-world-tick"*, and
 * materials have kinds, so the magnitude must say **which**. `kinds.ts` routes
 * it by the node's form, out of `sound-design.md` §4.2's material column.
 * Without that, permitting *Creo Herbam* and *Rego Terram* would be
 * interchangeable and two universes could not differ economically at all.
 *
 * `build-rate`'s unit is *"multiplier-on-construction-progress"* — a rate, not a
 * material — so it is **not** routed and stacks universe-wide. A per-kind
 * reading would be this module authoring a semantics `contracts.md` §3 withheld.
 *
 * ## Cost
 *
 * The index builds once per content load. The per-tick pass is one
 * `gatherEffects` over the universe's knowledge instances, memoized on the
 * `SimState` object — `god/effects.ts`'s `WeakMap`-keyed-on-state pattern, same
 * reason: `step` clones state every tick, so a new state is a new key, an old
 * one is collectable, and there is no invalidation rule to forget.
 */

import type { ContentId, ContentRegistry, FormRecord } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import type { CellResolver, ConsumptionRecorder, EffectSourceInstance } from '@mm/rules-magic';
import { gatherEffects } from '@mm/rules-magic';
import type { MaterialAmounts, MaterialKind } from '@mm/rules-world';
import {
  MATERIAL_KINDS,
  NO_YIELD_BONUSES,
  formRoutesToMaterials,
  routeYieldByForm,
  zeroAmounts,
} from '@mm/rules-world';
import type { Handle, Ruleset } from '@mm/state';
import { KNOWLEDGE_INSTANCE, collectRecords } from '@mm/state';
import { GOAL, readCommitment } from '@mm/rules-world';
import { standingWorkingsOf } from './standing-workings.js';
import { isHeldLocation } from '@mm/rules-magic';

/**
 * The content lookups the economy needs and `gatherEffects` does not do.
 *
 * `gatherEffects` hands back a `nodeId` and a magnitude; routing it to a
 * material kind needs the node's **form**, a grid question. Resolved once per
 * content load rather than per contribution per tick.
 *
 * The registry rides along because `gatherEffects` takes one — this is what a
 * composition root builds so the world loop holds no registry of its own.
 */
export interface UniverseEffectIndex {
  readonly registry: ContentRegistry;
  /** The form record behind a node's cell, or `undefined` for an unknown node. */
  formOf(nodeId: ContentId): FormRecord | undefined;
  /** How many nodes carry a universe-scoped economic effect at all. For diagnostics. */
  readonly weightedNodeCount: number;
  /**
   * What a mage gets for spending a month casting this node at the world, or
   * `undefined` if she would get nothing.
   *
   * `undefined` collapses three nothings deliberately, since a mage cannot spend
   * a month on any: no `resource-yield` effect at `target: "universe"`; the
   * content set does not declare the node; or its form's `yieldWeights` are all
   * zero, `kinds.ts`' intended reading of a form whose material is not a
   * material. Shadow magic feeds nobody, and a mage should not be able to commit
   * a career to finding that out.
   *
   * A projection of the **authored** content, asking nothing about knowledge or
   * permission — `castableNodes` is the gateway's half, composed with this by
   * whoever builds an outlook.
   */
  appliedYieldOf(nodeId: ContentId): AppliedNodeYield | undefined;
  /** How many nodes are applicable at all, ignoring ruleset and knowledge. */
  readonly applicableNodeCount: number;
}

/** One node's authored answer to *"what does casting this at the world make?"* */
export interface AppliedNodeYield {
  /** The node's form. Decides which kinds the output lands in. */
  readonly form: FormRecord;
  /** Its authored `resource-yield` magnitudes at `target: "universe"`, `fp`. */
  readonly magnitudes: readonly Fixed[];
}

/**
 * The primitives this module spends.
 *
 * Every *other* primitive's universe-targeted contribution is gathered and
 * dropped here, its consumer elsewhere or unbuilt. Correct — `gatherEffects` is
 * the general gatherer and every consumer filters — but this file will not be
 * the only consumer forever.
 */
const ECONOMIC_PRIMITIVES = new Set(['resource-yield', 'build-rate']);

/**
 * Builds the index from a loaded content registry.
 *
 * The node-to-form walk goes through the **cell**, where the grid keeps the
 * association: a node declares its cell, a cell declares its technique and form.
 * Resolving once here keeps the per-tick path free of string interning.
 */
export function universeEffectIndex(
  registry: ContentRegistry,
  recorder?: ConsumptionRecorder,
): UniverseEffectIndex {
  const formById = new Map(registry.forms.map((form) => [form.contentId, form.record]));
  const formByCell = new Map<ContentId, FormRecord>();
  for (const cell of registry.cells) {
    const form = formById.get(registry.intern('form', cell.record.form));
    if (form !== undefined) formByCell.set(cell.contentId, form);
  }

  const forms = new Map<ContentId, FormRecord>();
  const applicable = new Map<ContentId, AppliedNodeYield>();
  let weightedNodeCount = 0;
  // Per-primitive, because the consumption recorder asks a per-primitive
  // question and `weightedNodeCount` deliberately does not: a node weighted
  // toward both counts once there and once for each primitive here.
  const contributingNodes = new Map<string, number>();
  for (const node of registry.nodes) {
    const form = formByCell.get(registry.intern('cell', node.record.cell));
    if (form !== undefined) forms.set(node.contentId, form);

    const economic = new Set(
      node.record.effects
        .filter((effect) => effect.target === 'universe' && ECONOMIC_PRIMITIVES.has(effect.primitive))
        .map((effect) => effect.primitive),
    );
    if (economic.size > 0) weightedNodeCount += 1;
    for (const primitive of economic) {
      contributingNodes.set(primitive, (contributingNodes.get(primitive) ?? 0) + 1);
    }

    // The applied channel spends `resource-yield` alone. `build-rate` is a rate
    // on somebody else's construction, not a quantity a mage can hand over at
    // the end of a month, and a material reading of it here would be this module
    // authoring a semantics §3 withheld.
    if (form === undefined || !formRoutesToMaterials(form)) continue;
    const magnitudes = node.record.effects
      .filter((effect) => effect.target === 'universe' && effect.primitive === 'resource-yield')
      .map((effect) => effect.magnitude);
    if (magnitudes.length > 0) {
      applicable.set(node.contentId, { form, magnitudes: Object.freeze(magnitudes) });
    }
  }

  // Registered here rather than at the composition root, because this is the
  // line that reads the magnitudes. Anywhere else it would be a declaration that
  // happens to be true today; here it cannot drift from the fetch it describes.
  //
  // Counts nodes whose effect is `target: "universe"`, not every node mentioning
  // the primitive: a combat-targeted `resource-yield` never reaches the economy
  // and counting it would overstate what knowledge can move.
  if (recorder !== undefined) {
    for (const primitive of [...ECONOMIC_PRIMITIVES].sort()) {
      recorder.register({
        primitiveId: primitive,
        consumer: 'coordination/universe-effects.universeEconomyBonuses',
        kind: 'node',
        nodeCount: contributingNodes.get(primitive) ?? 0,
      });
    }
  }

  return {
    registry,
    formOf: (nodeId) => forms.get(nodeId),
    weightedNodeCount,
    appliedYieldOf: (nodeId) => applicable.get(nodeId),
    applicableNodeCount: applicable.size,
  };
}

/** What the world loop hands to production and construction this tick. */
export interface UniverseEconomyBonuses {
  /** `resource-yield` magnitudes, per kind, for `stackMagnitudes`. */
  readonly resourceYield: Readonly<Record<MaterialKind, readonly Fixed[]>>;
  /** `build-rate` magnitudes, for `stackMagnitudes`. */
  readonly buildRate: readonly Fixed[];
  /**
   * Instances whose holder is practising them this tick — the gate
   * `resource-yield` passes through, reported so that "nobody is practising" and
   * "practice produces nothing" are distinguishable series.
   */
  readonly practisedInstances: number;
  /**
   * Contributions that reached the economy this tick.
   *
   * Emitted because "the economy did not move" and "nothing reached it" look
   * identical in every other series, and this seam's whole history is a bonus
   * list nobody noticed was empty for three releases. One per contributing
   * *instance*, so it falls when a mage dies as well as when a cell is
   * interdicted.
   */
  readonly contributingNodes: number;
}

/** Nothing castable, or nothing permitted. */
export const NO_ECONOMY_BONUSES: UniverseEconomyBonuses = {
  resourceYield: NO_YIELD_BONUSES,
  buildRate: [],
  contributingNodes: 0,
  practisedInstances: 0,
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
 * Memoized per state object. The ruleset is fixed for a tick — an axis change is
 * a god action applied at the top of the step — so caching on the state cannot
 * serve an answer computed under a ruleset that has since changed.
 *
 * `TIME_MODE.world` rather than the step's own mode because the world loop is
 * the only caller and has already refused any other. Both primitives here
 * declare `scale: "world"`, so gathering in raid mode would return nothing and
 * the economy would silently stop during a raid — plausible-looking behaviour
 * nobody chose.
 */
export function universeEconomyBonuses(
  state: SimState,
  deps: UniverseEconomyDeps,
): UniverseEconomyBonuses {
  const hit = cached.get(state);
  if (hit !== undefined) return hit;

  // Ascending entity order, what `collectRecords` walks. Nothing sorts:
  // `gatherEffects` documents contribution order as instances-in-order, and the
  // one place order must not matter — the fold over magnitudes — is
  // `@mm/primitives`' and solved there.
  //
  // Two lists, and the second is a subset of the first. `gatherEffects` drops
  // the holder — `EffectSourceInstance` carries a location *kind* and no
  // *id* — so the practitioner gate cannot be applied to its output and has to
  // be applied to its input. Two calls rather than one, over the same
  // memoized-per-state pass, because the alternative is index-mapping
  // contributions back to instances and a node carrying two economic primitives
  // makes that mapping wrong in a way no assertion here would catch.
  const instances: EffectSourceInstance[] = [];
  const practised: EffectSourceInstance[] = [];
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    const source: EffectSourceInstance = {
      nodeId: row.nodeId,
      holder: row.locationId,
      locationKind: row.locationKind,
      mastery: row.mastery,
    };
    instances.push(source);
    // Only a held instance has a mage behind its `locationId`; a shelved book's
    // is a library, and a library does not practise. `gatherEffects` would drop
    // it on its own location gate, but asking here keeps the handle we look up
    // meaningful rather than merely harmless.
    if (isHeldLocation(row.locationKind) && practisesNode(state, row.locationId, row.nodeId)) {
      practised.push(source);
    }
  }

  const gatherDeps = {
    registry: deps.index.registry,
    ruleset: deps.ruleset,
    mode: TIME_MODE.world,
    cellOf: (nodeId: ContentId) => deps.cells.cellOf(nodeId),
    // The fourth gate. Every world-scale effect in the shipped grid is authored
    // `durationTicks: 0` and therefore never asks this view anything — which is
    // what makes wiring it a provable no-op until a duration is authored. A
    // node that *does* declare one contributes only while its holder is keeping
    // it up.
    standing: standingWorkingsOf(state),
  };

  const resourceYield = Object.fromEntries(
    MATERIAL_KINDS.map((kind) => [kind, [] as Fixed[]]),
  ) as Record<MaterialKind, Fixed[]>;
  const buildRate: Fixed[] = [];
  let contributingNodes = 0;

  for (const contribution of gatherEffects(instances, gatherDeps)) {
    if (contribution.target !== 'universe') continue;
    if (contribution.primitiveId !== 'build-rate') continue;
    contributingNodes += 1;
    // Nonzero, not positive. The twin of the filter in `academic-effects.ts`,
    // and it was correct for exactly as long as `node.schema.json` said
    // `"minimum": 1`: "zero" and "negative" were the same empty set, so the
    // wider test was free. `permitsNegativeMagnitude` covers **every**
    // `additive-into-multiplier` primitive, `build-rate` included, so a node
    // authoring a construction cost would otherwise validate, ship, and be
    // silently swallowed here. `stackMagnitudes` floors the `(1 + Sigma)` at
    // zero, so what leaves this list is bounded however negative the sum is.
    //
    // Restored on the Group F merge of `w53/practice`, 2026-08-16: the branch
    // split this single loop in two so that resource-yield could gate on
    // practice, and its copy of the build-rate half predates W201's signed
    // magnitudes and still read `> 0`. The split auto-merged without a
    // conflict, so the sign test would have been reverted silently.
    if (contribution.magnitude !== 0) buildRate.push(contribution.magnitude);
  }

  for (const contribution of gatherEffects(practised, gatherDeps)) {
    if (contribution.target !== 'universe') continue;
    if (contribution.primitiveId !== 'resource-yield') continue;
    contributingNodes += 1;

    const form = deps.index.formOf(contribution.nodeId);
    if (form === undefined) continue;
    const routed = routeYieldByForm(form, contribution.magnitude);
    for (const kind of MATERIAL_KINDS) {
      // Zero, not positive: a negative routed amount is this node's cost to
      // that material kind, and dropping it here would undo `routeYieldByForm`
      // one line downstream. The bound is `stackingFloor`'s `fp(0)` on the
      // stacked multiplier, not a sign test at the door.
      if (routed[kind] !== 0) resourceYield[kind].push(routed[kind]);
    }
  }

  const built: UniverseEconomyBonuses = {
    resourceYield,
    buildRate,
    contributingNodes,
    practisedInstances: practised.length,
  };
  cached.set(state, built);
  return built;
}

/**
 * Whether this holder is committed to practising this node right now.
 *
 * The commitment component is the one autonomy wrote last tick; see the module
 * note on why last tick's is the right one to read here. A holder with no
 * commitment row — a mage created this tick, a library — answers `false`, which
 * is the §0 absent-value reading and not a special case.
 */
function practisesNode(state: SimState, holder: Handle, nodeId: ContentId): boolean {
  const commitment = readCommitment(state, holder);
  if (commitment === undefined) return false;
  return commitment.goalId === GOAL.practice && commitment.targetNodeId === nodeId;
}

/** Sums a routed basket, for tests and diagnostics that want one number. */
export function summedYield(bonuses: UniverseEconomyBonuses): MaterialAmounts {
  const total = zeroAmounts();
  for (const kind of MATERIAL_KINDS) {
    for (const magnitude of bonuses.resourceYield[kind]) total[kind] += magnitude;
  }
  return total;
}
