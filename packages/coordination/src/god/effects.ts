/*
 * Multiverse Mages — what a blessing and an encouragement are worth to one mage
 * in one month.
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
 * The two seams `world-step.ts` had already named as `god-agency`'s, filled in.
 *
 * `MAGE_MONTHS_PER_TICK` says every multiplier that should eventually scale a
 * mage's month *"belongs to a mechanism that is not built"*, and `lifespanMonths`
 * says `lifespan` effects *"come from blessings and curses, which are
 * `god-agency`'s to issue"*. These are those mechanisms.
 *
 * ## The rules live here, not in the composition root
 *
 * An earlier draft computed these in `packages/scenario`, which is the natural
 * place for wiring and the wrong place for arithmetic: §5 does not grant
 * `scenario` an edge to `@mm/primitives`, and the dependency-graph test says so.
 * That refusal is doing its job. *How much faster a blessed mage researches* is
 * a rule, it goes through the shared stacking arithmetic and its caps, and it
 * belongs beside the rest of the capability rather than in the file that decides
 * what a universe holds at tick zero.
 *
 * ## Existing primitives only
 *
 * A blessing contributes to `research-rate`, `teach-rate` and `lifespan`. All
 * three are **magnitudes**, handed to a caller that puts them through `stackMagnitudes`
 * alongside every other source of the same primitive — a library's contribution
 * above all — so they share one `(1 + Σ)` channel and one cap with it. That is
 * what keeps a blessing visible to
 * `winRateByPrimitive`'s ablation runs: an effect with its own private
 * multiplier is an effect the sweep cannot attribute, which is the exact hole
 * vision §4a's four-hook cap exists to prevent on the tradition side.
 */

import type { Fixed, SimState } from '@mm/sim-core';
import type { CellResolver } from '@mm/rules-magic';
import { fromInt } from '@mm/sim-core';
import { activeBlessings, activeEncouragements } from '@mm/state';

import type { GodConstants } from './constants.js';
import { emphasisAt } from './interventions.js';

/**
 * What {@link godEffectHooks} needs.
 *
 * **No primitive records.** It used to take three, because it stacked its own
 * sources and handed back a finished multiplier. Since vision §6a's library
 * became a second source of `research-rate` and `teach-rate`, every hook here
 * returns unstacked magnitudes and the *caller* owns the one `(1 + Σ)` channel
 * and the one cap — so the registry records moved to `WorldStepDeps.primitives`
 * with them. Keeping them here as well would be a dep nothing reads, which in
 * this codebase is how a tuning knob comes to do nothing.
 *
 * **The `CellResolver` was removed here on `w52/emphasis-reorders`, and put
 * back on the Group F merge, 2026-08-16.** W52's reason was sound and is
 * quoted rather than deleted: *"It was here to answer 'which cell is this node
 * in' while an encouragement multiplied research on that node. The emphasis map
 * is now handed out keyed by cell and the node-to-cell question is asked by the
 * party that holds the candidate — which already carries its `cellId` — so the
 * dep would be an unread one."*
 *
 * Its premise is false on this tree. `w53/practice` landed one row earlier in
 * the same group and gave `practiceBonusesFor` an emphasis term keyed on the
 * node's cell, so the dep **is** read. The removal auto-merged without a
 * conflict while its one remaining user stayed, which is how a dropped
 * dependency gets installed silently — the merge did not fail, the typecheck
 * did.
 *
 * The two branches compose to an asymmetry worth stating rather than resolving
 * inside a merge: an encouraged cell now reaches **practice twice** — once as
 * `target-appeal.ts`'s preference term and once as a rate bonus here — and
 * **research once**, as the preference only. W52's argument (*what an
 * encouragement changes is which node a mage picks, not how fast a rate runs*)
 * generalises to practice, and W53's channel is the thing it would delete.
 * Neither branch measured the other, so this merge composes what each shipped
 * and leaves the asymmetry for the owner.
 */
export interface GodEffectDeps {
  readonly constants: GodConstants;
  /** Node-to-cell, for `practiceBonusesFor`'s emphasis term. See the note above. */
  readonly cells: CellResolver;
}

/** The callbacks `WorldStepDeps` takes. */
export interface GodEffectHooks {
  readonly researchBonusesFor: (
    state: SimState,
    worldTick: number,
    mage: number,
  ) => readonly Fixed[];
  /**
   * Which cells carry a live emphasis this tick, and how strongly.
   *
   * The whole of what `encourageResearch` now buys. It is handed to the outlook
   * rather than to the work phase because an encouragement is a statement about
   * **what to study**, and the only place that decision is made is
   * `target-appeal.ts`.
   */
  readonly emphasisFor: (state: SimState, worldTick: number) => ReadonlyMap<number, Fixed>;
  readonly teachBonusesFor: (
    state: SimState,
    worldTick: number,
    mage: number,
  ) => readonly Fixed[];
  /**
   * The god's contribution to a mage's `practice-rate` on one node.
   *
   * Takes a `nodeId`, unlike the teaching hook and like the research one,
   * because an encouragement is keyed on a **cell** and practice happens in one.
   * That is the only channel through which `encourageResearch` reaches
   * maintenance at all: a god who pushes attention onto Rego Terram makes its
   * spells both cheaper to derive and cheaper to keep, which is what pushing
   * attention onto a subject does.
   */
  readonly practiceBonusesFor: (
    state: SimState,
    worldTick: number,
    mage: number,
    nodeId: number,
  ) => readonly Fixed[];
  readonly lifespanEffectsFor: (
    state: SimState,
    worldTick: number,
    mage: number,
  ) => readonly Fixed[];
}

/**
 * One tick's god-side effects, cached per state.
 *
 * `emphasis` is keyed by **cell** id and valued in `fp`, and it is now read by
 * target selection rather than by the work phase. See {@link GodEffectHooks}.
 */
interface GodEffects {
  readonly worldTick: number;
  readonly blessed: ReadonlySet<number>;
  readonly emphasis: ReadonlyMap<number, Fixed>;
}

/**
 * Builds the four hooks over one per-run cache.
 *
 * The cache is keyed on the `SimState` object rather than on the tick, because
 * `step` clones the state every tick: a new state is a new key, an old state is
 * collectable, and there is no invalidation rule for anyone to forget. Without
 * it the work phase's per-mage question would be a scan of every blessing and
 * every emphasis, which is O(mages × effects) inside the loop the throughput
 * benchmark measures.
 */
export function godEffectHooks(deps: GodEffectDeps): GodEffectHooks {
  const cache = new WeakMap<SimState, GodEffects>();

  const effectsFor = (state: SimState, worldTick: number): GodEffects => {
    const cached = cache.get(state);
    if (cached !== undefined && cached.worldTick === worldTick) return cached;
    const blessed = new Set<number>();
    for (const entry of activeBlessings(state, worldTick)) blessed.add(entry.mage);
    const emphasis = new Map<number, Fixed>();
    for (const entry of activeEncouragements(state, worldTick)) {
      emphasis.set(entry.cellId, emphasisAt(entry.expiryTick, worldTick, deps.constants));
    }
    const built: GodEffects = { worldTick, blessed, emphasis };
    cache.set(state, built);
    return built;
  };

  return {
    // Magnitudes, unstacked. These used to hand back a stacked, capped
    // multiplier, which was right while a blessing was the only source of
    // `research-rate` in the loop. Vision §6a's library is a second source of
    // the same primitive, and two stacked multipliers multiplied together are
    // two `(1 + Σ)` channels and two `fp(4096)` caps on one quantity — the
    // *"4.0 × 2.0 without anyone deciding it should be 8.0"* that
    // `mages-and-species/design.md` rejects. The caller sums the sources and
    // clamps them once; this function's job is to say what the god contributed.
    //
    // Blessing only, now. An encouragement used to push `research-rate` for its cell
    // from here, and it does not any more: vision §7's *"encourage a research
    // direction"* is the god's one *ordinal* verb — it names a cell rather than a
    // mage or an axis, so it is a preference — and
    // spending it on a speed left the queue's order identical in every universe,
    // which `strategy-dimensionality.md` measured as containment 1.000 for every
    // cross-strategy pair. It is now a term in `target-appeal.ts` instead, and
    // deliberately not both: a verb that is simultaneously a preference and a
    // speed cannot be attributed by an ablation.
    researchBonusesFor: (state, worldTick, mage) =>
      effectsFor(state, worldTick).blessed.has(mage) ? [deps.constants.blessResearchRate] : [],

    emphasisFor: (state, worldTick) => effectsFor(state, worldTick).emphasis,

    teachBonusesFor: (state, worldTick, mage) =>
      effectsFor(state, worldTick).blessed.has(mage) ? [deps.constants.blessTeachRate] : [],

    // The same two sources as research, against a different constant. Written
    // out rather than delegated to `researchBonusesFor`, because aliasing two
    // primitives onto one channel is how an ablation sweep comes to report a
    // `research-rate` effect that was half `practice-rate` all along.
    practiceBonusesFor: (state, worldTick, mage, nodeId) => {
      const effects = effectsFor(state, worldTick);
      const sources: Fixed[] = [];
      if (effects.blessed.has(mage)) sources.push(deps.constants.blessPracticeRate);
      const emphasis = effects.emphasis.get(deps.cells.cellOf(nodeId));
      if (emphasis !== undefined && emphasis > 0) sources.push(emphasis);
      return sources;
    },

    // `lifespan` is `additive` in months rather than a multiplier, so this hands
    // back magnitudes for `effectiveLifespan` to stack rather than a stacked
    // value — the caller already routes them through the same arithmetic, and
    // stacking twice would apply the species cap to a number that had already
    // been capped against it.
    lifespanEffectsFor: (state, worldTick, mage) =>
      effectsFor(state, worldTick).blessed.has(mage)
        ? [fromInt(deps.constants.blessLifespanMonths)]
        : [],
  };
}
