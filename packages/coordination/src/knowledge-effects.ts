/*
 * Multiverse Mages — what the knowledge a universe holds is worth to the
 * universe itself, in one world tick.
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
 * The seam `rules-magic/src/effects/` documented and nobody wired.
 *
 * `gatherEffects` and `stackContributions` describe a pipeline —
 * `instances → gatherEffects → contributions → stackContributions → outcomes`
 * — and until this file, every reference to either lived inside that directory
 * or its own tests. A mage holding a `research-rate` node got nothing from it:
 * the world-tick bonus arrays `world-step.ts` feeds `@mm/rules-world` were fed
 * by god blessings and library depth only, and content a universe *chose* had
 * no consequence a run could measure. This file is the missing caller of
 * `gatherEffects`. It is deliberately not a caller of `stackContributions`:
 * see "Unstacked, on purpose" below.
 *
 * ## Same shape as `god/effects.ts`, on purpose
 *
 * That file is the other half of the same seam — *"the two seams `world-
 * step.ts` had already named as `god-agency`'s, filled in"* — and this one
 * copies its structure, its caching discipline and its comment style rather
 * than inventing a second convention for one package to hold two of. Where
 * the two differ, the difference is real: a blessing and an encouragement are
 * *per-mage* magnitudes, chosen by the god for one mage or one cell, while
 * what a universe's held knowledge contributes at world scale does not vary
 * by which mage is asking — vision §1.6's `universe`-target effects apply to
 * the civilization, not to whoever happens to be working this month. So
 * `KnowledgeEffectHooks` exposes one per-tick bundle rather than four
 * per-mage callbacks.
 *
 * ## World scale only — `target: 'universe'`
 *
 * `@mm/content`'s `EffectTarget` is `'self' | 'single' | 'area' | 'side' |
 * 'universe'`. Only `'universe'` is this file's business: it is the target
 * that feeds the six world-tick quantities `WorldStepDeps` names
 * (`resourceYieldBonuses`, `fertilityBonuses`, `scribeRateBonuses`, and the
 * world-scale half of `research-rate`/`teach-rate`/`lifespan`), computed once
 * per tick over every instance the universe holds, independent of which mage
 * is being evaluated. A `self`-target effect is a different mechanism — it
 * would need gathering per mage, against that mage's own held instances,
 * which is a per-mage-per-candidate cost this file's caching discipline
 * exists specifically to avoid (see the cache note below) — and is out of
 * this change's scope.
 *
 * ## Unstacked, on purpose
 *
 * Exactly the reason `god/effects.ts` gives: *"the caller owns the one
 * `(1 + Σ)` channel and the one cap."* A blessing and a library both feed
 * `research-rate` through one `stackMagnitudes` call in `@mm/rules-world`;
 * since vision §1.6 a held node is a third source of the same primitives, and
 * a third stacked-and-capped multiplier folded into the other two would be a
 * second `(1 + Σ)` channel and a second `fp(4096)` cap on one quantity — the
 * exact failure `mages-and-species/design.md` names. So this file groups
 * magnitudes by primitive and stops. `stackContributions` (`@mm/rules-magic`)
 * does the arithmetic this file refuses to duplicate; it is not called here
 * because its caller stacks *one* target's sources into a finished outcome,
 * and this file's whole job is to hand back sources for someone else's
 * accumulator to fold in alongside the god's and the library's.
 *
 * ## `remove` and `control`: a sign lookup, not arithmetic
 *
 * `gatherEffects` marks every contribution with the technique's envelope
 * (`compositional-content.md` §3.3), and every contribution's `magnitude` is
 * authored **positive** regardless of mode — `node.schema.json` requires
 * `minimum: 1` on every effect. A `remove`-mode (Perdo) effect lowers a rate
 * by contributing `−magnitude`: this file negates it with a plain unary
 * minus before grouping, which is the same one-line lookup
 * `rules-magic/src/effects/stack.ts`'s `signedMagnitudes` performs for its
 * own caller and states outright is *"a sign lookup, not arithmetic on a
 * magnitude"* — not exported for this file to share, so restated here rather
 * than duplicated by omission. Once negated, a Perdo node lowers a rate by
 * joining the same array a Creo node raises it in; `additive` and `additive-
 * into-multiplier` already handle a negative term.
 *
 * `reveal` and `control` contribute no magnitude at all (`gatherEffects`'
 * contract): a `reveal` effect exists only to unlock another effect's `when`
 * and is never itself a source, and a `control` effect is Rego's floor/
 * ceiling gate rather than a magnitude. `control` contributions are combined
 * instead through `combineControls` (`@mm/primitives`) into the one clamp
 * `contracts.md` §3's `stackMagnitudes` already knows how to apply — this file
 * does not implement floor-vs-ceiling precedence a second time.
 *
 * `transform` contributions are excluded from the plain magnitude group for
 * a related reason: turning one `transform` contribution into two signed
 * magnitudes on two different primitives is `stackContributions`' documented
 * job, and no v1 content authors a `transform` effect on any of the six
 * primitives this file feeds. Reimplementing the split here for content that
 * does not exist would be a second, untested opinion about what `transform`
 * means.
 *
 * ## Why the cache is keyed on the state object
 *
 * Exactly `god/effects.ts`'s reasoning, restated because it is worth restating
 * rather than only linking to: `step` clones the state every tick, so a new
 * state is a new key, an old state is collectable, and there is no
 * invalidation rule for anyone to forget. Without it, every phase that reads a
 * world-scale bonus — production, births, scribing, research, teaching,
 * lifespan — would each re-walk every knowledge instance in the universe, and
 * the reference run holds on the order of three thousand of them.
 */

import type { ContentId, ContentRegistry } from '@mm/content';
import type { Fixed, SimState } from '@mm/sim-core';
import { TIME_MODE } from '@mm/sim-core';
import { findUniverse, readRulesetForObservation } from '@mm/state';
import type { CellResolver, KnowledgeSubsystem } from '@mm/rules-magic';
import { gatherEffects } from '@mm/rules-magic';
import type { EffectControl } from '@mm/primitives';
import { combineControls } from '@mm/primitives';

/** What {@link knowledgeEffectHooks} needs. Mirrors `GodEffectDeps`'s shape. */
export interface KnowledgeEffectDeps {
  readonly registry: ContentRegistry;
  /** `magic-grid`'s node-to-cell addressing, for `gatherEffects`' legality gate. */
  readonly cells: CellResolver;
  /**
   * A knowledge subsystem over the state being stepped.
   *
   * A factory rather than an instance, for the same reason `WorldStepDeps`
   * takes one: `step` clones the state every tick, and a subsystem built
   * against last tick's state would index rows the clone no longer has.
   */
  readonly knowledgeFor: (state: SimState) => KnowledgeSubsystem;
}

/** No source of a bonus applies. Shared so the empty case allocates nothing. */
const NO_BONUSES: readonly Fixed[] = Object.freeze([]);

/** No `control`-mode contribution touched this primitive. */
const NO_CONTROL: EffectControl = Object.freeze({});

/**
 * One tick's world-scale knowledge effects, grouped by the six primitives
 * `WorldStepDeps` names.
 *
 * Every array is **unstacked magnitudes** — see this file's "Unstacked, on
 * purpose" note — and `controlFor` is the combined Rego clamp for a primitive,
 * ready to pass as `StackOptions.clamp`.
 */
export interface KnowledgeWorldEffects {
  readonly researchRateBonuses: readonly Fixed[];
  readonly teachRateBonuses: readonly Fixed[];
  readonly resourceYieldBonuses: readonly Fixed[];
  readonly fertilityBonuses: readonly Fixed[];
  readonly scribeRateBonuses: readonly Fixed[];
  readonly lifespanBonuses: readonly Fixed[];
  /** The combined `{floor?, ceiling?}` clamp for one primitive. `{}` for none. */
  readonly controlFor: (primitiveId: string) => EffectControl;
}

/** The all-empty answer, for a state with no universe yet or nothing held. */
const EMPTY_EFFECTS: KnowledgeWorldEffects = Object.freeze({
  researchRateBonuses: NO_BONUSES,
  teachRateBonuses: NO_BONUSES,
  resourceYieldBonuses: NO_BONUSES,
  fertilityBonuses: NO_BONUSES,
  scribeRateBonuses: NO_BONUSES,
  lifespanBonuses: NO_BONUSES,
  controlFor: () => NO_CONTROL,
});

/** The one callback `WorldStepDeps` takes. */
export interface KnowledgeEffectHooks {
  readonly knowledgeEffectsFor: (state: SimState, worldTick: number) => KnowledgeWorldEffects;
}

/** One tick's cache entry: the tick it was built for, and the built answer. */
interface CacheEntry {
  readonly worldTick: number;
  readonly effects: KnowledgeWorldEffects;
}

/** The six primitives this file feeds, and the content id each groups under. */
const RESEARCH_RATE = 'research-rate';
const TEACH_RATE = 'teach-rate';
const RESOURCE_YIELD = 'resource-yield';
const FERTILITY = 'fertility';
const SCRIBE_RATE = 'scribe-rate';
const LIFESPAN = 'lifespan';

function pushBonus(magnitudes: Map<string, Fixed[]>, primitiveId: string, magnitude: Fixed): void {
  const existing = magnitudes.get(primitiveId);
  if (existing === undefined) magnitudes.set(primitiveId, [magnitude]);
  else existing.push(magnitude);
}

function pushControl(controls: Map<string, EffectControl[]>, primitiveId: string, control: EffectControl): void {
  const existing = controls.get(primitiveId);
  if (existing === undefined) controls.set(primitiveId, [control]);
  else existing.push(control);
}

/**
 * Builds the one hook `WorldStepDeps.knowledgeEffectsFor` takes, over one
 * per-run cache — see this file's header for why the cache is keyed on the
 * `SimState` object.
 */
export function knowledgeEffectHooks(deps: KnowledgeEffectDeps): KnowledgeEffectHooks {
  const cache = new WeakMap<SimState, CacheEntry>();

  const cellOf = (nodeId: ContentId): ContentId => deps.cells.cellOf(nodeId);

  const build = (state: SimState): KnowledgeWorldEffects => {
    const universe = findUniverse(state);
    if (universe === 0) return EMPTY_EFFECTS;
    const ruleset = readRulesetForObservation(state, universe);

    const knowledge = deps.knowledgeFor(state);
    const instances = knowledge.instances().map((handle) => knowledge.read(handle));

    // The single legality point, the mastery threshold and the scale gate are
    // all `gatherEffects`' — see this file's header. Nothing below re-tests
    // any of them.
    const contributions = gatherEffects(instances, {
      registry: deps.registry,
      ruleset,
      mode: TIME_MODE.world,
      cellOf,
    });

    const magnitudes = new Map<string, Fixed[]>();
    const controls = new Map<string, EffectControl[]>();

    for (const contribution of contributions) {
      // World scale only — see this file's header. A `self`/`single`/`area`/
      // `side` contribution is a different mechanism and not this file's.
      if (contribution.target !== 'universe') continue;

      if (contribution.mode === 'control') {
        if (contribution.control !== undefined) {
          pushControl(controls, contribution.primitiveId, contribution.control);
        }
        continue;
      }
      // `reveal` carries no magnitude by contract, and no v1 content authors
      // `transform` on these six primitives — see the header note on both.
      if (contribution.mode === 'reveal' || contribution.mode === 'transform') continue;

      // The mode-to-sign lookup `compositional-content.md` §3.3 states and
      // `rules-magic/src/effects/stack.ts`'s `signedMagnitudes` also performs:
      // a `remove` (Perdo) effect is authored with a positive `magnitude` —
      // `node.schema.json` requires `minimum: 1` on every effect regardless of
      // mode — and lowers a rate by contributing `−magnitude`, not by content
      // authoring a negative number. This is a sign lookup, not arithmetic on
      // a magnitude, so it is not the inline stacking `BAN_INLINE_PRIMITIVE_
      // STACKING` exists to catch — the same reasoning `stack.ts` states for
      // its own copy of this switch, which is not exported for this file to
      // share.
      const signed = contribution.mode === 'remove' ? -contribution.magnitude : contribution.magnitude;
      pushBonus(magnitudes, contribution.primitiveId, signed);
    }

    const combined = new Map<string, EffectControl>();
    const controlFor = (primitiveId: string): EffectControl => {
      const cached = combined.get(primitiveId);
      if (cached !== undefined) return cached;
      const built = combineControls(controls.get(primitiveId) ?? []);
      combined.set(primitiveId, built);
      return built;
    };

    return {
      researchRateBonuses: magnitudes.get(RESEARCH_RATE) ?? NO_BONUSES,
      teachRateBonuses: magnitudes.get(TEACH_RATE) ?? NO_BONUSES,
      resourceYieldBonuses: magnitudes.get(RESOURCE_YIELD) ?? NO_BONUSES,
      fertilityBonuses: magnitudes.get(FERTILITY) ?? NO_BONUSES,
      scribeRateBonuses: magnitudes.get(SCRIBE_RATE) ?? NO_BONUSES,
      lifespanBonuses: magnitudes.get(LIFESPAN) ?? NO_BONUSES,
      controlFor,
    };
  };

  return {
    knowledgeEffectsFor: (state, worldTick) => {
      const cached = cache.get(state);
      if (cached !== undefined && cached.worldTick === worldTick) return cached.effects;
      const effects = build(state);
      cache.set(state, { worldTick, effects });
      return effects;
    },
  };
}
