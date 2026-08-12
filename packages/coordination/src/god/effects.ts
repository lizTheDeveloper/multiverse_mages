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
 * A blessing contributes to `research-rate`, `teach-rate` and `lifespan`; an
 * encouragement contributes to `research-rate` for one cell. All four go
 * through `stackMagnitudes`, so they share the `(1 + Σ)` channel and the cap
 * with every other source. That is what keeps a blessing visible to
 * `winRateByPrimitive`'s ablation runs: an effect with its own private
 * multiplier is an effect the sweep cannot attribute, which is the exact hole
 * vision §4a's four-hook cap exists to prevent on the tradition side.
 */

import type { PrimitiveRecord } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { FP_ONE, fromInt } from '@mm/sim-core';
import { stackMagnitudes } from '@mm/primitives';
import type { CellResolver } from '@mm/rules-magic';
import { activeBlessings, activeEncouragements } from '@mm/state';

import type { GodConstants } from './constants.js';
import { emphasisAt } from './interventions.js';

/** The primitives a god effect contributes through. All three already exist. */
export interface GodEffectPrimitives {
  readonly researchRate: PrimitiveRecord;
  readonly teachRate: PrimitiveRecord;
  readonly lifespan: PrimitiveRecord;
}

/** What {@link godEffectHooks} needs. */
export interface GodEffectDeps {
  readonly constants: GodConstants;
  readonly primitives: GodEffectPrimitives;
  readonly cells: CellResolver;
}

/** The three callbacks `WorldStepDeps` takes. */
export interface GodEffectHooks {
  readonly researchMultiplierFor: (
    state: SimState,
    worldTick: number,
    mage: number,
    nodeId: number,
  ) => Fixed;
  readonly teachMultiplierFor: (state: SimState, worldTick: number, mage: number) => Fixed;
  readonly lifespanEffectsFor: (
    state: SimState,
    worldTick: number,
    mage: number,
  ) => readonly Fixed[];
}

/** One tick's god-side effects, cached per state. */
interface GodEffects {
  readonly worldTick: number;
  readonly blessed: ReadonlySet<number>;
  readonly emphasis: ReadonlyMap<number, Fixed>;
}

/**
 * Builds the three hooks over one per-run cache.
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
    researchMultiplierFor: (state, worldTick, mage, nodeId) => {
      const effects = effectsFor(state, worldTick);
      const sources: Fixed[] = [];
      if (effects.blessed.has(mage)) sources.push(deps.constants.blessResearchRate);
      const emphasis = effects.emphasis.get(deps.cells.cellOf(nodeId));
      if (emphasis !== undefined && emphasis > 0) sources.push(emphasis);
      // `fp(1024)` for an unaffected mage — a month is a month — rather than
      // routing an empty list through the stacker, which would answer the same
      // and pay for a call per mage per tick to do it.
      if (sources.length === 0) return FP_ONE;
      return stackMagnitudes(deps.primitives.researchRate, sources).value;
    },

    teachMultiplierFor: (state, worldTick, mage) =>
      effectsFor(state, worldTick).blessed.has(mage)
        ? stackMagnitudes(deps.primitives.teachRate, [deps.constants.blessTeachRate]).value
        : FP_ONE,

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
