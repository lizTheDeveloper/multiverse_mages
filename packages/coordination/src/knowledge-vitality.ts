/*
 * Multiverse Mages — what a universe's knowledge is worth to its bodies.
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
 * ## The two primitives that were parked, and the reason that expired
 *
 * `lifespan` and `fertility` were **declared exclusions** in
 * `rules-magic/effects/consumption.ts`. The written reason was that both sit on
 * non-v1 nodes and are moved by species traits and blessing constants rather
 * than by anything a mage learns, so *"no academic can move it"* held either
 * way. Seventeen authored nodes declare `lifespan` and five declare
 * `fertility`, and none of it reached the simulation: `world-step.ts` passed
 * `fertilityBonuses: []` — a hardcoded empty array, the same shape
 * `universe-effects.ts` was written to remove from `resourceYieldBonuses` — and
 * a mage's `effectMagnitudes` came from god blessings alone.
 *
 * This module is the wire. It is the sibling of `universe-effects.ts` and is
 * deliberately a separate file rather than two more entries in that module's
 * `ECONOMIC_PRIMITIVES` set: that one is documented end to end as *the
 * economy*, it routes magnitudes to material kinds by form, and neither routing
 * nor the material vocabulary means anything to a lifespan.
 *
 * ## The gate is `gatherEffects`', not a second copy of it
 *
 * The four questions that decide whether a held instance contributes — held in
 * a mind or a palace, mastery at or above the activation threshold, cell
 * permitted *now*, primitive's scale applies in this clock mode — are asked by
 * `gatherEffects` and by nothing here. `universe-effects.ts` argues that at
 * length and the argument is not repeated: two implementations of
 * knowledge-to-effect would diverge, and the one with the adversarial test
 * would not have been the one the simulation used.
 *
 * What this file does before calling it is a **content** filter, not a gate: an
 * instance whose node authors neither primitive cannot produce a contribution
 * either module wants, so it is not collected. That is the same question
 * {@link vitalityIndex} answers once per content load, and it keeps the
 * per-tick pass proportional to the instances that can matter rather than to
 * every instance in the universe. Under v1 content it collects nothing at all,
 * which is the honest answer and is discussed below.
 *
 * ## Why the walk is grouped by holder
 *
 * `EffectContribution` carries a `nodeId` and no source. That is right for the
 * economy, where a contribution belongs to the universe, and wrong for
 * `lifespan`, where `target: "self"` means *the mage who can cast this lives
 * longer* and the answer differs per mage. Rather than widen the contribution
 * shape — which every other consumer would then have to ignore — the instances
 * are partitioned by `locationId` and gathered per holder. A written copy's
 * `locationId` is its grimoire or its library, and `gatherEffects` drops those
 * groups on question 1, so the partition cannot smuggle a book onto a shelf
 * into somebody's lifespan.
 *
 * ## The three targets, and the one that is left alone
 *
 * Of the seventeen authored `lifespan` nodes, eight are `target: "self"`, four
 * are `"universe"` and five are `"single"`. The first two are wired:
 *
 * - **`self`** — the holder's own effective lifespan. *The Long Body* is a mage
 *   keeping her own body going, and it is worth nothing to anyone else.
 * - **`universe`** — every living mage of the universe. *The Mended Decade* is
 *   public medicine: one scholar who can cast it lengthens lives that are not
 *   hers.
 *
 * **`single` is deliberately not wired**, and this is the decision in this file
 * that belongs to the author rather than to the wiring. A `single` effect names
 * one other body, and there is no mechanism anywhere in the simulation by which
 * a mage selects another individual and spends a month on her — `GOAL.applyMagic`
 * casts at the *world*, and the raid arbiter's targeting exists only inside an
 * engagement. Inventing a targeting rule here to make five nodes count would be
 * this module authoring a mechanic, which is exactly the failure the
 * consumption check exists to catch, one layer up. The five nodes are reported
 * by {@link VitalityIndex.lifespanNodeCount} and consume nothing.
 *
 * `fertility` needs none of that: all five authored nodes are
 * `target: "universe"`, which is also the only reading its unit
 * (*multiplier-on-cohort-birth-rate*) will take — a cohort is not an individual
 * and cannot be one (`contracts.md` §1.3).
 *
 * ## §4b's invariant is the cap, and the cap is already there
 *
 * `vision.md` §4b: *"Extension therefore returns **logarithmically**, so that
 * buying more life never makes a species' own lifespan irrelevant; the draconic
 * 1,500 years must stay worth having next to a human who has bought her way
 * upward."* It then says of the shipped primitive that its
 * `fraction-of-species-base 512` cap *"is the same instinct written as a ceiling
 * rather than as a curve."*
 *
 * So this module adds **no curve of its own**, and that is a decision rather
 * than an omission. The magnitudes go into `effectiveLifespan`, which routes
 * them through `stackMagnitudes` with `speciesBase` supplied, and the cap binds
 * the *bonus* at half the species base — a human who learns every extension
 * node in the grid reaches 1,440 months against a dragon's unaided 18,000. A
 * second dampening applied here would be a private rule on one of the two
 * sources of the primitive, so a blessing and a book would obey different
 * arithmetic, and `winRateByPrimitive`'s ablation runs could not attribute
 * either. `packages/coordination/test/unit/knowledge-vitality.test.ts` pins the
 * invariant by execution against the shipped content.
 *
 * ## A negative magnitude is a curse and is not clamped from below
 *
 * `contracts.md` §3 caps `lifespan` above and deliberately not below, and
 * `caps.ts` says so in as many words: *"a magnitude below it — including a
 * negative one from a debuff — is left exactly as it is."* Signed magnitudes
 * are being built on another branch, so this is worth stating rather than
 * leaving to fall out of the arithmetic: a negative authored `lifespan` sums
 * with every other source, and the only floor is
 * `MIN_EFFECTIVE_LIFESPAN_MONTHS`, which exists to keep the hazard's division
 * defined and not to protect anybody. A curse that outweighs a species' base is
 * a mage who dies next month, which is what a curse is.
 *
 * ## What this is worth today, stated plainly
 *
 * It was **zero in any v1 universe**, and the check this wire satisfies never
 * claimed otherwise: all twenty-two authored nodes sat outside the twelve
 * enabled cells, so `permits()` refused every one of them and `gatherEffects`
 * returned nothing. The green that produced was exactly as strong as `portal`'s:
 * *the assembled simulation fetched these node magnitudes and holds them*.
 *
 * **That condition is now met.** This paragraph named its own remedy — *"a
 * content decision: an authored `lifespan` or `fertility` effect on a v1 node,
 * or a v1 rectangle that includes Corpus"* — and `material-economy` opened all
 * seventy cells, so the second of the two is what happened. `permits()` accepts
 * the Corpus and Animal cells the twenty-two are authored in, and this wire
 * carries real magnitudes for the first time. `checkPrimitiveCoverage` is the
 * check that will say
 * so, because both primitives stay on its list until a **v1** node declares
 * one.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import type { CellResolver, ConsumptionRecorder, EffectSourceInstance } from '@mm/rules-magic';
import { gatherEffects, nodeEffectRecords } from '@mm/rules-magic';
import type { Ruleset } from '@mm/state';
import { KNOWLEDGE_INSTANCE, collectRecords } from '@mm/state';

/** The primitive whose magnitudes are months on one body. */
const LIFESPAN = 'lifespan';
/** The primitive whose magnitudes multiply a cohort's births. */
const FERTILITY = 'fertility';

/**
 * Which authored nodes carry either primitive at all. A pure projection of the
 * content set, built once per load.
 */
export interface VitalityIndex {
  readonly registry: ContentRegistry;
  /** Nodes declaring at least one `lifespan` effect, at any target. */
  readonly lifespanNodes: ReadonlySet<ContentId>;
  /** Nodes declaring at least one `fertility` effect. */
  readonly fertilityNodes: ReadonlySet<ContentId>;
  /** `lifespanNodes.size`, for diagnostics and for the consumption report. */
  readonly lifespanNodeCount: number;
  /** `fertilityNodes.size`. */
  readonly fertilityNodeCount: number;
}

/**
 * Builds the index, and **registers the fetch**.
 *
 * The magnitudes are fetched through `nodeEffectRecords` rather than by
 * filtering `registry.nodes` here, for the mechanism that function exists to
 * provide: registration is a side effect of asking for the data, never a
 * parallel declaration a maintainer could leave untrue. A local filter would be
 * invisible to `npm run check:consumption`, which is the check this wire is
 * built to satisfy — and satisfying it with a declaration rather than a fetch is
 * the failure that check was written to catch.
 *
 * @param recorder - Optional only so a unit test may build an index without
 * caring. The composition root always passes one.
 */
export function vitalityIndex(
  registry: ContentRegistry,
  recorder?: ConsumptionRecorder,
): VitalityIndex {
  const consumer = 'coordination/knowledge-vitality.vitalityBonuses';
  const lifespanNodes = new Set<ContentId>(
    recorder === undefined
      ? nodesCarrying(registry, LIFESPAN)
      : nodeEffectRecords(registry, LIFESPAN, consumer, recorder).keys(),
  );
  const fertilityNodes = new Set<ContentId>(
    recorder === undefined
      ? nodesCarrying(registry, FERTILITY)
      : nodeEffectRecords(registry, FERTILITY, consumer, recorder).keys(),
  );

  return {
    registry,
    lifespanNodes,
    fertilityNodes,
    lifespanNodeCount: lifespanNodes.size,
    fertilityNodeCount: fertilityNodes.size,
  };
}

/**
 * The same walk `nodeEffectRecords` does, for the recorder-less case.
 *
 * Not a second way to reach the data a consumer uses: this branch is taken only
 * when no recorder was supplied, which is a test building an index in
 * isolation. The production path — `worldDeps` in `packages/scenario` — always
 * passes one, so the fetch the check watches always happens.
 */
function nodesCarrying(registry: ContentRegistry, primitiveId: string): ContentId[] {
  const found: ContentId[] = [];
  for (const entry of registry.nodes) {
    if (entry.record.effects.some((effect) => effect.primitive === primitiveId)) {
      found.push(entry.contentId);
    }
  }
  return found;
}

/** What a universe's castable, permitted knowledge is worth to its bodies this tick. */
export interface VitalityBonuses {
  /** `fertility` magnitudes at `target: "universe"`, for every cohort. */
  readonly fertility: readonly Fixed[];
  /** `lifespan` months at `target: "universe"`, for every living mage. */
  readonly lifespanUniverse: readonly Fixed[];
  /** `lifespan` months at `target: "self"`, by the holder they belong to. */
  readonly lifespanBySelf: ReadonlyMap<number, readonly Fixed[]>;
  /**
   * Contributions that reached a body this tick, one per contributing instance.
   *
   * Emitted for the reason `UniverseEconomyBonuses.contributingNodes` is: *"the
   * economy did not move"* and *"nothing reached it"* look identical in every
   * other series, and the whole history of this seam is a bonus list nobody
   * noticed was empty.
   */
  readonly contributingNodes: number;
}

/** Nothing castable, nothing permitted, or no content carrying either primitive. */
export const NO_VITALITY_BONUSES: VitalityBonuses = {
  fertility: [],
  lifespanUniverse: [],
  lifespanBySelf: new Map(),
  contributingNodes: 0,
};

/** What {@link vitalityBonuses} reads. */
export interface VitalityDeps {
  readonly index: VitalityIndex;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
}

const cached = new WeakMap<SimState, VitalityBonuses>();

/**
 * The lifespan and fertility a universe's knowledge earns it this tick.
 *
 * Memoized on the `SimState` object, the pattern `god/effects.ts` and
 * `universe-effects.ts` both use and for the same reason: `step` clones the
 * state every tick, so a new state is a new key, an old state is collectable,
 * and there is no invalidation rule for anyone to forget. The ruleset is fixed
 * for the length of a tick — an axis change is a god action applied at the top
 * of the step — so a cached answer cannot have been computed under a ruleset
 * that has since moved.
 *
 * `TIME_MODE.world` rather than the step's own mode, matching
 * `universeEconomyBonuses`: both primitives declare `scale: "world"`, the world
 * loop is the only caller, and gathering in raid mode would return nothing and
 * quietly stop a universe's medicine during an engagement.
 */
export function vitalityBonuses(state: SimState, deps: VitalityDeps): VitalityBonuses {
  const hit = cached.get(state);
  if (hit !== undefined) return hit;

  const { lifespanNodes, fertilityNodes } = deps.index;
  if (lifespanNodes.size === 0 && fertilityNodes.size === 0) {
    cached.set(state, NO_VITALITY_BONUSES);
    return NO_VITALITY_BONUSES;
  }

  // Ascending entity order, which is what `collectRecords` walks, and the
  // insertion order of the map below inherits it. Nothing sorts: `gatherEffects`
  // documents contribution order as instances-in-order, and the one place order
  // genuinely must not matter — the fold over magnitudes — is `@mm/primitives`'
  // and is solved there.
  const byHolder = new Map<number, EffectSourceInstance[]>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (!lifespanNodes.has(row.nodeId) && !fertilityNodes.has(row.nodeId)) continue;
    const instance: EffectSourceInstance = {
      nodeId: row.nodeId,
      locationKind: row.locationKind,
      mastery: row.mastery,
    };
    const group = byHolder.get(row.locationId);
    if (group === undefined) byHolder.set(row.locationId, [instance]);
    else group.push(instance);
  }

  const fertility: Fixed[] = [];
  const lifespanUniverse: Fixed[] = [];
  const lifespanBySelf = new Map<number, Fixed[]>();
  let contributingNodes = 0;

  for (const [holder, instances] of byHolder) {
    const contributions = gatherEffects(instances, {
      registry: deps.index.registry,
      ruleset: deps.ruleset,
      mode: TIME_MODE.world,
      cellOf: (nodeId) => deps.cells.cellOf(nodeId),
    });

    for (const contribution of contributions) {
      if (contribution.primitiveId === FERTILITY) {
        // A cohort is not an individual, so `self` and `single` have no reading
        // here and are dropped rather than folded into the universe channel.
        if (contribution.target !== 'universe') continue;
        fertility.push(contribution.magnitude);
        contributingNodes += 1;
        continue;
      }
      if (contribution.primitiveId !== LIFESPAN) continue;

      if (contribution.target === 'universe') {
        lifespanUniverse.push(contribution.magnitude);
        contributingNodes += 1;
        continue;
      }
      if (contribution.target !== 'self') continue;
      // `single` falls out here. See the module note: naming another body is a
      // mechanic, not a wire.
      const own = lifespanBySelf.get(holder);
      if (own === undefined) lifespanBySelf.set(holder, [contribution.magnitude]);
      else own.push(contribution.magnitude);
      contributingNodes += 1;
    }
  }

  const built: VitalityBonuses = {
    fertility,
    lifespanUniverse,
    lifespanBySelf,
    contributingNodes,
  };
  cached.set(state, built);
  return built;
}

/**
 * Every `lifespan` magnitude that applies to one mage, unstacked.
 *
 * One list rather than two channels, because `contracts.md` §3's cap bounds
 * *the stack*: a universe-wide contribution and a mage's own extension share
 * one `additive` fold and one `fraction-of-species-base` ceiling, exactly as a
 * god's blessing already does. Two separately-capped channels would be the
 * *"4.0 × 2.0 without anyone deciding it should be 8.0"* that
 * `mages-and-species/design.md` rejects, written in months.
 *
 * Returns the shared empty array when there is nothing, so the ordinary case
 * allocates nothing per mage per tick.
 */
export function lifespanBonusesFor(
  bonuses: VitalityBonuses,
  mage: number,
): readonly Fixed[] {
  const own = bonuses.lifespanBySelf.get(mage);
  if (own === undefined) return bonuses.lifespanUniverse;
  if (bonuses.lifespanUniverse.length === 0) return own;
  return [...bonuses.lifespanUniverse, ...own];
}
