/*
 * Multiverse Mages — what a scholar's own knowledge is worth to her month.
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
 * ## The second wire that was never run
 *
 * `universe-effects.ts` opens by describing a `target: "universe"` effect that
 * reached nothing. This is the same defect one target over, and it survived the
 * fix for the first one because it does not look like it: `research-rate` and
 * `teach-rate` *were* consumed. `check:consumption` reported them under
 * **"Consumed, but never from node effects — knowledge cannot move these"**,
 * with `coordination/god/effects` as the only address. `scribe-rate` was worse
 * and more honest — `world-step.ts` passed it a literal `NO_BONUSES`.
 *
 * Stated as behaviour: **a god could bless a mage into productivity, and a
 * century of scholarship could not.** Sixteen authored effects inside the v1
 * rectangle — seven `research-rate`, five `teach-rate`, four `scribe-rate` —
 * were reachable, learnable, teachable, and moved no number. That is the lever
 * missing from under publish-or-perish, and vision §6a's compounding loop had
 * only one of its two halves: a library accelerated a scholar, and what the
 * scholar knew did not.
 *
 * ## Why this is not `universeEconomyBonuses` with a different filter
 *
 * Because the content does not say `universe`. Across the shipped grid these
 * three primitives are authored at **personal** targets and almost nowhere else:
 * `research-rate` 45× at `self`, `scribe-rate` 19× at `self`, `teach-rate` 19×
 * at `single`. Inside the twelve v1 cells the split is total — every one of the
 * sixteen is `self` or `single`.
 *
 * A personal target is a per-mage question, and the economy's is a per-universe
 * one. Routing these through `universeEconomyBonuses` would have made one
 * scholar's private study accelerate every scholar alive, which is neither what
 * the effect says nor what any balance assertion is written over.
 *
 * So the shape here is the seam that already existed and had one supplier.
 * `capitalRateMultiplier`'s second parameter is named `nodeBonuses` and
 * documented *"Bonuses from nodes and effects, in `fp`"*; `world-step.ts` filled
 * it with the god's magnitudes and nothing else. This module is the missing
 * supplier for that parameter, and the magnitudes it returns join the god's in
 * **one array**, through **one** `stackMagnitudes`, under **one** `fp(4096)`
 * cap. `mages-and-species/design.md` rejects the alternative by name: *"two caps
 * on the same quantity is how a rate ends up at 4.0 × 2.0 without anyone
 * deciding it should be 8.0."*
 *
 * ## The gate is `gatherEffects`', for the reason `universe-effects.ts` gives
 *
 * Known means **castable**: held at a mind or a memory palace, at or above
 * `MASTERY_ACTIVATION_THRESHOLD`, in a cell the ruleset **permits at
 * application time**. All four questions are `gatherEffects`', asked once, and
 * this module does not re-ask any of them. A second implementation of
 * knowledge-to-effect would diverge, and the one with the adversarial test would
 * not have been the one the academics used.
 *
 * The consequence is deliberate and matches the economy's: **a grimoire on a
 * shelf accelerates nobody.** A book is not a contributing location, so a
 * library full of `research-rate` treatises raises no one's rate directly — its
 * influence arrives solely through `libraryRateMultiplier`'s depth term, which
 * is `magic-primitives`' requirement that a library act through the published
 * depth function and nowhere else. A mage who has *read* one holds an instance
 * at her mind, and that instance is what counts.
 *
 * ## `self` is the holder; `single` is read as the teacher
 *
 * `self` needs no interpretation: the mage who holds it works faster.
 *
 * `single` does. Every `teach-rate` effect in the grid carries it, and read
 * literally it names one other person — the student. The throughput it buys is
 * nonetheless credited to the **mage spending the month**, because that is what
 * a lesson is in `contracts.md` §2.3: a project with two people pushing it, each
 * advancing her own half at her own rate. A teacher who knows *The Patient
 * Lesson* pushes her half faster; a student who knows it pushes hers. Crediting
 * it to the counterparty instead would make a mage's own knowledge accelerate
 * work she is not doing, and would need a second addressing rule that §2.3 does
 * not supply.
 *
 * That is the same asymmetry `world-step.ts` already documents at
 * `GOAL.seekTeaching`, where the *student's* library accelerates the student's
 * half. This module follows it rather than inventing a second reading.
 *
 * ## What this module does not route, and why that is written down
 *
 * Ten `research-rate` effects in the shipped grid are authored at
 * `target: "universe"` — a scholar whose discovery accelerates *everyone's*
 * research. **None of them is inside a v1 cell**, so none is reachable in any
 * universe this release can run, and routing them would be authoring a
 * per-universe research semantics against content nothing can currently
 * exercise. They are dropped here, deliberately, and this paragraph is the
 * record so that whoever opens those cells finds the question already asked
 * rather than discovering a silent zero. `gatherEffects` is the general
 * gatherer; every consumer filters; this one filters to personal targets.
 *
 * ## Cost
 *
 * One `gatherEffects` pass per world tick over the same instance set
 * `universeEconomyBonuses` already walks, memoized on the `SimState` object —
 * the `WeakMap`-keyed-on-state pattern `god/effects.ts` and `universe-effects.ts`
 * both use, and for the same reason: `step` clones the state every tick, so a new
 * state is a new key, an old state is collectable, and there is no invalidation
 * rule for anyone to forget.
 *
 * It is computed **eagerly**, per tick, rather than lazily per mage. Laziness
 * would be cheaper and would make {@link AcademicRateBonuses.contributingNodes}
 * a number that depended on who happened to ask — and the entire history of this
 * seam is a bonus list nobody noticed was empty. A counter that is only correct
 * if every mage is queried is a counter that reports zero for the exact reason
 * it exists to detect.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import type { CellResolver, ConsumptionRecorder, EffectSourceInstance } from '@mm/rules-magic';
import { gatherEffects } from '@mm/rules-magic';
import type { Handle, Ruleset } from '@mm/state';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, collectRecords } from '@mm/state';

/**
 * The three rates a scholar's own knowledge may move.
 *
 * The same three `libraryRateMultiplier` is documented against — *"`research-rate`,
 * `teach-rate`, or `scribe-rate`. Any of the three; the routing is identical,
 * which is the point."* Keeping the sets identical is what stops a fourth rate
 * arriving on one side only.
 */
const ACADEMIC_PRIMITIVES = new Set(['research-rate', 'teach-rate', 'scribe-rate']);

/**
 * The effect targets that name the mage holding the instance.
 *
 * `self` is her. `single` is one other person, and the module docstring records
 * why the throughput it buys is nonetheless the holder's. `universe` is
 * excluded, and that exclusion is also in the docstring rather than only here.
 */
const PERSONAL_TARGETS = new Set(['self', 'single']);

/**
 * The location kinds an instance must sit at to be *addressed to a mage*.
 *
 * `contracts.md` §5 puts both personal locations on a mage handle, so
 * `locationId` is the mage for exactly these two — which is what makes a
 * per-mage grouping possible at all. It is a strict subset of
 * `CONTRIBUTING_LOCATION_KINDS`; `gatherEffects` re-checks the contribution
 * question itself, and this set answers only the addressing one.
 */
const MAGE_ADDRESSED_KINDS = new Set<number>([LOCATION_KIND.mind, LOCATION_KIND.palace]);

/**
 * The content facts the per-tick pass needs, resolved once per content load.
 *
 * The registry rides along because `gatherEffects` takes one — this is the
 * object a composition root builds so that the world loop does not have to hold
 * a content registry of its own, which is exactly what {@link
 * import('./universe-effects.js').UniverseEffectIndex} is for the economy.
 */
export interface AcademicEffectIndex {
  readonly registry: ContentRegistry;
  /** How many nodes carry a personally-targeted academic effect at all. For diagnostics. */
  readonly weightedNodeCount: number;
}

/**
 * Builds the index, and registers the fetch.
 *
 * Registration happens **here**, at the line that actually reads the authored
 * magnitudes, and not at the composition root — `universe-effects.ts` gives the
 * reason and it is the mechanism `consumption.ts` depends on: *"a registration
 * made anywhere else would be a declaration that happens to be true today; made
 * here it cannot drift from the fetch it describes."*
 *
 * The count is of nodes whose effect is personally targeted, not of every node
 * mentioning the primitive. A `target: "universe"` `research-rate` effect never
 * reaches a mage's month through this file, and counting it would overstate what
 * knowledge can move — the precise overstatement this check exists to catch.
 */
export function academicEffectIndex(
  registry: ContentRegistry,
  recorder?: ConsumptionRecorder,
): AcademicEffectIndex {
  let weightedNodeCount = 0;
  const contributingNodes = new Map<string, number>();

  for (const node of registry.nodes) {
    const academic = new Set(
      node.record.effects
        .filter(
          (effect) =>
            PERSONAL_TARGETS.has(effect.target) && ACADEMIC_PRIMITIVES.has(effect.primitive),
        )
        .map((effect) => effect.primitive),
    );
    if (academic.size > 0) weightedNodeCount += 1;
    for (const primitive of academic) {
      contributingNodes.set(primitive, (contributingNodes.get(primitive) ?? 0) + 1);
    }
  }

  if (recorder !== undefined) {
    for (const primitive of [...ACADEMIC_PRIMITIVES].sort()) {
      recorder.register({
        primitiveId: primitive,
        consumer: 'coordination/academic-effects.academicRateBonuses',
        kind: 'node',
        nodeCount: contributingNodes.get(primitive) ?? 0,
      });
    }
  }

  return { registry, weightedNodeCount };
}

/**
 * One tick's per-mage academic magnitudes, unstacked.
 *
 * **Unstacked on purpose.** Combining them here would be a second `(1 + Σ)`
 * channel beside the one `libraryRateMultiplier` already owns, and
 * `contracts.md` §3 permits exactly one. The consumer hands these to
 * `stackMagnitudes` together with the god's, once.
 */
export interface AcademicRateBonuses {
  /** `research-rate` magnitudes this mage's own castable knowledge earns her. */
  researchRate(mage: Handle): readonly Fixed[];
  /** `teach-rate` magnitudes, credited to whichever half of the lesson she pushes. */
  teachRate(mage: Handle): readonly Fixed[];
  /** `scribe-rate` magnitudes, for the mage at the desk. */
  scribeRate(mage: Handle): readonly Fixed[];
  /**
   * Contributions that reached a mage's month this tick, one per contributing
   * instance.
   *
   * Emitted for the reason `UniverseEconomyBonuses.contributingNodes` is: *"the
   * economy did not move"* and *"nothing reached it"* look identical in every
   * other series, and this seam spent four releases at zero without anyone
   * noticing. It falls when a mage dies, when mastery decays below the
   * threshold, and when a cell is interdicted.
   */
  readonly contributingNodes: number;
}

/** Nothing castable, nothing permitted, or no index supplied. */
export const NO_ACADEMIC_BONUSES: AcademicRateBonuses = {
  researchRate: () => NO_MAGNITUDES,
  teachRate: () => NO_MAGNITUDES,
  scribeRate: () => NO_MAGNITUDES,
  contributingNodes: 0,
};

/** Shared, and never written to. */
const NO_MAGNITUDES: readonly Fixed[] = Object.freeze([]);

/** What {@link academicRateBonuses} reads. */
export interface AcademicRateDeps {
  readonly index: AcademicEffectIndex;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
}

/** One mage's three magnitude lists. */
interface MageMagnitudes {
  research: Fixed[];
  teach: Fixed[];
  scribe: Fixed[];
}

const cached = new WeakMap<SimState, AcademicRateBonuses>();

/**
 * The academic rate magnitudes every mage's own castable knowledge earns her.
 *
 * Memoized per state object. The ruleset is fixed for the length of a tick — an
 * axis change is a god action applied at the top of the step — so caching on the
 * state cannot serve an answer computed under a ruleset that has since changed.
 *
 * `TIME_MODE.world` is passed rather than the step's own mode for the reason
 * `universeEconomyBonuses` gives: the world loop is the only caller and has
 * already refused to run in any other mode, and all three primitives declare
 * `scale: "world"`, so gathering in raid mode would silently return nothing.
 */
export function academicRateBonuses(
  state: SimState,
  deps: AcademicRateDeps,
): AcademicRateBonuses {
  const hit = cached.get(state);
  if (hit !== undefined) return hit;

  // Grouped by holder before gathering, because `gatherEffects` answers "what
  // does this instance contribute" and never "whose instance is it" — the
  // contribution carries a `nodeId`, not a location. Ascending entity order,
  // which is what `collectRecords` walks; nothing sorts, for the reason
  // `universe-effects.ts` gives.
  const byMage = new Map<Handle, EffectSourceInstance[]>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (!MAGE_ADDRESSED_KINDS.has(row.locationKind)) continue;
    const held = byMage.get(row.locationId);
    const instance: EffectSourceInstance = {
      nodeId: row.nodeId,
      locationKind: row.locationKind,
      mastery: row.mastery,
    };
    if (held === undefined) byMage.set(row.locationId, [instance]);
    else held.push(instance);
  }

  const magnitudes = new Map<Handle, MageMagnitudes>();
  let contributingNodes = 0;

  for (const [mage, instances] of byMage) {
    const contributions = gatherEffects(instances, {
      registry: deps.index.registry,
      ruleset: deps.ruleset,
      mode: TIME_MODE.world,
      cellOf: (nodeId: ContentId) => deps.cells.cellOf(nodeId),
    });

    let held: MageMagnitudes | undefined;
    for (const contribution of contributions) {
      if (!PERSONAL_TARGETS.has(contribution.target)) continue;
      if (!ACADEMIC_PRIMITIVES.has(contribution.primitiveId)) continue;
      // A zero magnitude is authored content saying "nothing", and pushing it
      // would inflate `contributingNodes` without moving a rate. The content
      // loader refuses to author one at all, so this is a guard against a
      // hand-built registry rather than against the shipped grid.
      //
      // **A negative one is a cost and belongs here.** This filter read
      // `<= 0` for as long as `node.schema.json` said `"minimum": 1` — under
      // which the two conditions were indistinguishable, so the wider one was
      // free. It is not free now: dropping a negative here would let a node
      // author a teaching cost that validates, ships, reads correctly in its
      // gloss and moves no number, which is the same defect this module was
      // written to end, one sign over. `stackMagnitudes` floors the `(1 + Σ)`
      // at zero, so what arrives downstream is bounded whatever the sum is.
      if (contribution.magnitude === 0) continue;
      contributingNodes += 1;
      if (held === undefined) {
        held = { research: [], teach: [], scribe: [] };
        magnitudes.set(mage, held);
      }
      if (contribution.primitiveId === 'research-rate') held.research.push(contribution.magnitude);
      else if (contribution.primitiveId === 'teach-rate') held.teach.push(contribution.magnitude);
      else held.scribe.push(contribution.magnitude);
    }
  }

  const built: AcademicRateBonuses = {
    researchRate: (mage) => magnitudes.get(mage)?.research ?? NO_MAGNITUDES,
    teachRate: (mage) => magnitudes.get(mage)?.teach ?? NO_MAGNITUDES,
    scribeRate: (mage) => magnitudes.get(mage)?.scribe ?? NO_MAGNITUDES,
    contributingNodes,
  };
  cached.set(state, built);
  return built;
}
