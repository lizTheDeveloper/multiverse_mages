/*
 * Multiverse Mages — the single place a spell is allowed to work.
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
 * **The host universe's ruleset governs every spell cast inside it, for both
 * attacker and defender** (vision §3). This module is the whole of that rule,
 * and it is the only file in `@mm/rules-raid` permitted to call `permits()` or
 * to turn a node into effects.
 *
 * ## One choke point, enforced twice, and the second one is the measurement
 *
 * **Layer 1 — the legal-node mask.** At portal open, each combatant's held
 * nodes are intersected with the nodes whose cells the host's *frozen* ruleset
 * snapshot permits. Because the ruleset is frozen for the raid's duration, this
 * is computed once and never recomputed. An illegal spell is therefore not
 * merely refused — it is never a candidate, so a combatant's intent scoring
 * cannot see it and no tick is spent on a guaranteed refusal.
 *
 * **Layer 2 — the resolution assertion.** {@link resolveCast} re-evaluates
 * `permits()` before applying anything, and on `false` applies nothing, charges
 * nothing, draws no combat randomness, and increments
 * {@link CastArbiter.forbiddenCastsBlocked}.
 *
 * The second layer is redundant by construction and that is the point. The
 * 0.9.0 claim is that across 10,000 Monte Carlo raids a forbidden spell resolves
 * **zero** times, and a claim of zero is only worth anything if there is a
 * counter that *could* have been non-zero. A mask on its own makes the claim
 * unfalsifiable: a mask bug produces an illegal cast that nothing counts, and
 * the metric reports zero for the wrong reason. So the counter exists, and
 * `packages/rules-raid/test/unit/arbitration.test.ts` disables the mask under
 * fault injection and asserts the counter moves — because a counter that has
 * only ever read zero is indistinguishable from a check that never runs.
 *
 * ## The snapshot, never a live universe
 *
 * Every legality question here is asked of a {@link RulesetSnapshot} captured at
 * portal open. `contracts.md` §1.1 requires it: `rules-raid` may not depend on
 * `agent-api` (§5), so there is no action mask to lean on, and a raid that read
 * live universe state would have *no* mechanism at all preventing a mid-raid
 * rule change. Making the snapshot the parameter type is what turns the
 * vision's frozen-policy rule from a procedure into a structure.
 *
 * ## What legality does *not* gate
 *
 * Holding, acquiring, teaching, scribing, and stealing (§1.1). A raider may
 * steal a node her own universe forbids; it enters her universe, occupies a
 * mind, counts toward existence, and is simply inert at home until the god
 * permits its cell. Nothing in this file may be used to delete an instance.
 */

import type { ContentId, ContentRegistry, PrimitiveRecord } from '@mm/content';
import type { Fixed, RngStream } from '@mm/sim-core';
import { FP_ONE, floorDiv, nextBounded } from '@mm/sim-core';
import type { ClampCounters } from '@mm/primitives';
import { rollStackedProbability, stackMagnitudes } from '@mm/primitives';
import type { RulesetSnapshot } from '@mm/state';
import { LOCATION_KIND, permits } from '@mm/state';
import type { CastPolicy, CostPolicy, MagicGrid } from '@mm/rules-magic';
import { castCost, expendOnCast, requireRegistryNode } from '@mm/rules-magic';

/** The primitive ids a cast can put on the battlefield. */
export const COMBAT_PRIMITIVES = Object.freeze({
  directDamage: 'direct-damage',
  ward: 'ward',
  areaDenial: 'area-denial',
  blink: 'blink',
  summon: 'summon',
  concealment: 'concealment',
  knowledgeSteal: 'knowledge-steal',
  /**
   * The presence gate on raiding itself (`contracts.md` §3, *"boolean gate;
   * enables raid initiation"*). It has no magnitude that means anything and is
   * never stacked — a node either carries it or does not, which is what the
   * `presence` stacking class in `@mm/primitives` records.
   */
  portal: 'portal',
});

/** One node a combatant holds, as far as arbitration needs to care. */
export interface HeldInstance {
  readonly nodeId: ContentId;
  /** `contracts.md` §1.5 location kind. */
  readonly locationKind: number;
  readonly mastery: Fixed;
}

/** What one cast put on the battlefield, in primitive terms and nothing else. */
export interface CastEffects {
  /** `direct-damage` magnitudes, one per applying source. Summed by the caller. */
  readonly directDamage: readonly Fixed[];
  /** `area-denial` magnitudes and the ticks each field persists. */
  readonly areaDenial: readonly { readonly magnitude: Fixed; readonly durationTicks: number }[];
  /** `blink` magnitudes, one per source. Stacked by max by the caller. */
  readonly blink: readonly Fixed[];
  /** `summon` counts, one per source. */
  readonly summon: readonly Fixed[];
  /** `knowledge-steal` probabilities, one per source. */
  readonly knowledgeSteal: readonly Fixed[];
}

const NO_EFFECTS: CastEffects = Object.freeze({
  directDamage: Object.freeze([]),
  areaDenial: Object.freeze([]),
  blink: Object.freeze([]),
  summon: Object.freeze([]),
  knowledgeSteal: Object.freeze([]),
});

/**
 * What a cast of one node would put on the battlefield, as node selection needs
 * to know it.
 *
 * **Derived from {@link CastArbiter}'s `#effectsOf` and from nothing else.** The
 * selector and the applier answering the same question from two different reads
 * of `node.effects` is exactly the drift this package's conformance test exists
 * to prevent: a selector that believes a node does something the applier will
 * not apply produces a combatant who declares a cast every tick and changes
 * nothing.
 */
export interface CastProfile {
  /**
   * Whether a resolved cast places at least one effect.
   *
   * False for the two **passive** primitives — `ward` and `concealment` are read
   * once at portal open by {@link CastArbiter.passiveDefences} and have no cast
   * form, because §3 gives both a stacking rule and no trigger. False for
   * `knowledge-steal`, which the theft intent owns and `resolveOneCast` does not
   * apply. False for `portal`, which is a presence gate on raiding rather than
   * something a combatant releases in a field. A node carrying only those is
   * **not castable**, and making it castable would be the behavioural bug rather
   * than the fix.
   */
  readonly placesEffects: boolean;
  /**
   * Whether resolution needs an acquired target.
   *
   * `direct-damage` is the only effect that cannot be placed without one. An
   * area-denial field falls where the caster stands, a blink runs toward the
   * portal, and a summon needs no geometry at all.
   */
  readonly requiresTarget: boolean;
  /**
   * Whether summoning is the *only* thing it would place.
   *
   * A summon over the per-side cap is a no-op and the cost is still charged, so
   * a summon-only node held by a side at its cap spends vigor every tick and
   * changes nothing. Selection asks this so that it can decline — the same
   * reason the other three filters exist.
   */
  readonly summonOnly: boolean;
}

/** Why a cast produced nothing. `''` means it resolved. */
export type CastRefusal =
  | ''
  /** The host's frozen ruleset forbids the node's cell. The counted one. */
  | 'forbidden'
  /** The node is not in this combatant's legal mask — it should never have been offered. */
  | 'not-held'
  /** The host's `cast` hook found no readied preparation to spend. */
  | 'unprepared'
  /** The host's `cost` hook priced it above what the caster has left. */
  | 'unaffordable';

/** What one call to {@link CastArbiter.resolveCast} did. */
export interface CastResolution {
  readonly resolved: boolean;
  readonly refusal: CastRefusal;
  /** `preparedSpells` after the host `cast` hook spent one, if it did. */
  readonly preparedSpells: readonly number[];
  /** Vigor deducted by the host `cost` hook. Zero on any refusal. */
  readonly cost: Fixed;
  readonly effects: CastEffects;
}

/** Everything one cast attempt needs to say. */
export interface CastRequest {
  readonly nodeId: ContentId;
  /** The nodes this combatant may cast — layer 1, computed at portal open. */
  readonly legalNodes: ReadonlySet<ContentId>;
  /** The host's `cast` hook. Both sides use the host's (`contracts.md` §2.5). */
  readonly hostCast: CastPolicy;
  /** The host's `cost` hook. */
  readonly hostCost: CostPolicy;
  readonly preparedSpells: readonly number[];
  /** What the caster has left to spend. */
  readonly vigor: Fixed;
}

/** How a fault-injection test may weaken arbitration, and nothing else may. */
export interface ArbitrationFaults {
  /**
   * Skips layer 1, so a forbidden node reaches {@link CastArbiter.resolveCast}.
   *
   * The *only* legitimate use is the test that proves layer 2 is live. A
   * counter that has only ever read zero is indistinguishable from a check that
   * never runs, and "zero forbidden casts across 10,000 raids" is the strictest
   * claim in the release plan.
   */
  readonly disableSelectionMask?: boolean;
}

/**
 * The arbiter for one raid: one frozen host ruleset, one grid, one counter.
 *
 * Constructed at portal open and carried. Nothing may construct a second for
 * the same raid — two arbiters would be two counters, and the invariant is
 * about the raid rather than about a call site.
 */
export class CastArbiter {
  readonly #hostRuleset: RulesetSnapshot;
  readonly #grid: MagicGrid;
  readonly #registry: ContentRegistry;
  readonly #tuning: { readonly castVigorBase: Fixed; readonly castVigorPerTier: Fixed };
  readonly #counters: ClampCounters | undefined;
  readonly #faults: ArbitrationFaults;
  readonly #castProfiles = new Map<ContentId, CastProfile>();
  #forbiddenCastsBlocked = 0;

  constructor(options: {
    readonly hostRuleset: RulesetSnapshot;
    readonly grid: MagicGrid;
    readonly registry: ContentRegistry;
    readonly tuning: { readonly castVigorBase: Fixed; readonly castVigorPerTier: Fixed };
    readonly counters?: ClampCounters;
    readonly faults?: ArbitrationFaults;
  }) {
    this.#hostRuleset = options.hostRuleset;
    this.#grid = options.grid;
    this.#registry = options.registry;
    this.#tuning = options.tuning;
    this.#counters = options.counters;
    this.#faults = options.faults ?? {};
  }

  /**
   * The 0.9.0 invariant. Must read zero across any sweep in which the selection
   * mask is enabled; a non-zero value fails the balance gate.
   */
  get forbiddenCastsBlocked(): number {
    return this.#forbiddenCastsBlocked;
  }

  /** Whether the fault injector has disabled layer 1 for this raid. */
  get selectionMaskDisabled(): boolean {
    return this.#faults.disableSelectionMask === true;
  }

  /**
   * **Layer 1.** The nodes this combatant may cast inside the host universe:
   * what she usably holds, intersected with what the host's frozen snapshot
   * permits.
   *
   * Computed once per combatant at portal open. Recomputing it per tick would
   * be wasted work *and* a lie about the design — the ruleset is frozen, so
   * there is nothing that could have changed.
   *
   * A held instance in a book contributes nothing: `contracts.md` §1.5 and
   * `rules-magic`'s effect pipeline both say a written copy is exactly as
   * magical as a shelf. Mastery below the activation threshold is likewise not
   * castable, and that threshold is `rules-magic`'s to own.
   */
  legalNodeMask(held: Iterable<HeldInstance>, activationThreshold: Fixed): Set<ContentId> {
    const legal = new Set<ContentId>();
    for (const instance of held) {
      if (instance.locationKind !== LOCATION_KIND.mind && instance.locationKind !== LOCATION_KIND.palace) {
        continue;
      }
      if (instance.mastery < activationThreshold) continue;
      if (!this.#permitsNode(instance.nodeId)) continue;
      legal.add(instance.nodeId);
    }
    return legal;
  }

  /**
   * **Layer 2, and the single entry point at which a node becomes effects.**
   *
   * The order is `contracts.md`-shaped and fixed: legality, then cost, then the
   * host `cast` hook's expenditure, and only then the node's effects. Legality
   * first means a forbidden cast draws no randomness and spends nothing —
   * "applies nothing, charges nothing, draws no combat randomness" is three
   * separate promises and each is kept by this ordering rather than by three
   * separate guards.
   *
   * Cost before expenditure means an unaffordable cast keeps its preparation.
   * The reverse order would burn a Vancian raider's memorised spell on a price
   * she could not pay, which is a bug that reads as a tradition being weak.
   */
  resolveCast(request: CastRequest): CastResolution {
    // ---- The assertion. First statement, unconditional, counted. ----
    if (!this.#permitsNode(request.nodeId)) {
      this.#forbiddenCastsBlocked += 1;
      return refused('forbidden', request.preparedSpells);
    }

    // Layer 1's own check, restated here so that a caller who built its
    // candidate list some other way still cannot cast what it does not hold.
    // Not counted: a node absent from the mask because it is not held is an
    // ordinary miss, and folding it into the arbitration counter would make
    // that counter a routine number rather than an invariant.
    if (!this.selectionMaskDisabled && !request.legalNodes.has(request.nodeId)) {
      return refused('not-held', request.preparedSpells);
    }

    const node = requireRegistryNode(this.#registry, request.nodeId);
    const price = castCost(
      request.hostCost,
      this.#tuning.castVigorBase + this.#tuning.castVigorPerTier * node.tier,
    );
    if (price > request.vigor) return refused('unaffordable', request.preparedSpells);

    const expended = expendOnCast(request.hostCast, request.preparedSpells, request.nodeId);
    if (!expended.cast) return refused('unprepared', request.preparedSpells);

    return {
      resolved: true,
      refusal: '',
      preparedSpells: expended.preparedSpells,
      cost: price,
      effects: this.#effectsOf(request.nodeId),
    };
  }

  /**
   * A combatant's passive defensive values: effective `ward` and `concealment`.
   *
   * Passive because §3 gives both a stacking rule and no trigger — a warded
   * mage is warded whether or not she acts. They are gathered here rather than
   * in the combat module for the same reason casts are: this is the one file
   * that reads a node's effects, and a second reader would be a second place
   * where a forbidden cell could quietly become live.
   *
   * Both stack through `@mm/primitives`, so the caps in §3 and their clamp
   * counters behave exactly as they do everywhere else in the project.
   */
  passiveDefences(
    held: Iterable<HeldInstance>,
    activationThreshold: Fixed,
    baseConcealment: Fixed,
  ): { readonly ward: Fixed; readonly concealment: Fixed } {
    const wards: Fixed[] = [];
    const concealments: Fixed[] = baseConcealment > 0 ? [baseConcealment] : [];

    for (const instance of held) {
      if (instance.locationKind !== LOCATION_KIND.mind && instance.locationKind !== LOCATION_KIND.palace) {
        continue;
      }
      if (instance.mastery < activationThreshold) continue;
      if (!this.#permitsNode(instance.nodeId)) continue;
      for (const effect of requireRegistryNode(this.#registry, instance.nodeId).effects) {
        if (effect.primitive === COMBAT_PRIMITIVES.ward) wards.push(effect.magnitude);
        else if (effect.primitive === COMBAT_PRIMITIVES.concealment) concealments.push(effect.magnitude);
      }
    }

    return {
      ward: this.#stack(COMBAT_PRIMITIVES.ward, wards),
      concealment: this.#stack(COMBAT_PRIMITIVES.concealment, concealments),
    };
  }

  /**
   * The one evasion roll in combat, on stream 8.
   *
   * `contracts.md` §3 makes `concealment` a *probability of evading targeting
   * and detection*, and this change adds no accuracy statistic beside it — a
   * sixteenth combat statistic outside the primitive registry is precisely the
   * move that makes `winRateByPrimitive` stop meaning anything, because
   * contribution would flow through a channel ablation cannot switch off.
   *
   * The draw is spent whether or not the target is concealed, which is
   * `@mm/primitives`' guarantee and not this file's: a control run and its
   * paired ablation run leave the stream in the same place.
   */
  /**
   * What a cast of this node would put on the field. Memoised per raid.
   *
   * Memoised because node selection asks this of every held node of every
   * combatant on every tick, and `#effectsOf` allocates. The cache is keyed on a
   * node id and the answer depends on nothing else — not on the ruleset, not on
   * the tick — so a per-raid arbiter is exactly the right lifetime for it.
   */
  castProfile(nodeId: ContentId): CastProfile {
    const cached = this.#castProfiles.get(nodeId);
    if (cached !== undefined) return cached;
    const effects = this.#effectsOf(nodeId);
    const profile: CastProfile = Object.freeze({
      placesEffects:
        effects.directDamage.length > 0 ||
        effects.areaDenial.length > 0 ||
        effects.blink.length > 0 ||
        effects.summon.length > 0,
      requiresTarget: effects.directDamage.length > 0,
      summonOnly:
        effects.summon.length > 0 &&
        effects.directDamage.length === 0 &&
        effects.areaDenial.length === 0 &&
        effects.blink.length === 0,
    });
    this.#castProfiles.set(nodeId, profile);
    return profile;
  }

  evades(concealment: Fixed, stream: RngStream): boolean {
    return rollStackedProbability(
      this.#primitive(COMBAT_PRIMITIVES.concealment),
      concealment > 0 ? [concealment] : [],
      stream,
      this.#counters === undefined ? {} : { counters: this.#counters },
    ).succeeded;
  }

  /**
   * A theft attempt, on stream 9, gated by the **host's** ruleset.
   *
   * The gate is the host's for the same reason casting is: it is magic worked
   * inside the host's sky. A raider whose home forbids `rego-nomen` may still
   * read a name in a universe that permits it, and a host that forbids `mentem`
   * cannot be mind-read by anybody, including its own defenders.
   */
  attemptTheft(nodeId: ContentId, magnitudes: readonly Fixed[], stream: RngStream): boolean {
    if (!this.#permitsNode(nodeId)) {
      this.#forbiddenCastsBlocked += 1;
      return false;
    }
    return rollStackedProbability(
      this.#primitive(COMBAT_PRIMITIVES.knowledgeSteal),
      magnitudes,
      stream,
      this.#counters === undefined ? {} : { counters: this.#counters },
    ).succeeded;
  }

  /**
   * The `knowledge-steal` magnitudes a node carries.
   *
   * Here rather than at the theft call site so that `effect.magnitude` is read
   * in exactly one file. The conformance check enforces that, and the rule it
   * enforces is the interesting one: a magnitude read anywhere else is a second
   * place where a node's effects become numbers, which is the shape a bypassed
   * legality check actually takes.
   */
  theftMagnitudes(nodeId: ContentId): readonly Fixed[] {
    return requireRegistryNode(this.#registry, nodeId)
      .effects.filter((effect) => effect.primitive === COMBAT_PRIMITIVES.knowledgeSteal)
      .map((effect) => effect.magnitude);
  }

  /** The summed damage a target takes, after exactly one ward application. */
  applyWardOnce(rawDamage: Fixed, wardSources: readonly Fixed[]): Fixed {
    const ward = this.#stack(COMBAT_PRIMITIVES.ward, wardSources);
    // §3's `applied = raw × (1 - wardTotal)`, computed with the shared helper
    // that rounds toward negative infinity. Written as one multiply on the
    // summed damage, which is the whole of "one ward application": there is no
    // expression here in which a ward could be applied per source.
    return floorDiv(rawDamage * (FP_ONE - ward), FP_ONE);
  }

  /** The effective, capped value of one primitive's sources. */
  #stack(primitiveId: string, magnitudes: readonly Fixed[]): Fixed {
    return stackMagnitudes(
      this.#primitive(primitiveId),
      magnitudes,
      this.#counters === undefined ? {} : { counters: this.#counters },
    ).value;
  }

  #primitive(primitiveId: string): PrimitiveRecord {
    for (const entry of this.#registry.primitives) {
      if (entry.record.id === primitiveId) return entry.record;
    }
    throw new RangeError(
      `The primitive registry declares no "${primitiveId}". contracts.md §3's table is normative ` +
        'and primitive.json must match it, so a miss here is the wrong content set rather than a ' +
        'primitive this package should invent a default for.',
    );
  }

  /**
   * **The only legality question in this package**, and the only call to
   * `permits()` in it. `packages/rules-raid/test/unit/arbitration-conformance.test.ts`
   * fails naming any other file that asks one.
   */
  #permitsNode(nodeId: ContentId): boolean {
    return permits(this.#hostRuleset, this.#grid.cellOf(nodeId));
  }

  /** A node's engagement-scale effects, grouped by primitive. */
  #effectsOf(nodeId: ContentId): CastEffects {
    const directDamage: Fixed[] = [];
    const areaDenial: { magnitude: Fixed; durationTicks: number }[] = [];
    const blink: Fixed[] = [];
    const summon: Fixed[] = [];
    const knowledgeSteal: Fixed[] = [];

    for (const effect of requireRegistryNode(this.#registry, nodeId).effects) {
      switch (effect.primitive) {
        case COMBAT_PRIMITIVES.directDamage:
          directDamage.push(effect.magnitude);
          break;
        case COMBAT_PRIMITIVES.areaDenial:
          areaDenial.push({ magnitude: effect.magnitude, durationTicks: effect.durationTicks });
          break;
        case COMBAT_PRIMITIVES.blink:
          blink.push(effect.magnitude);
          break;
        case COMBAT_PRIMITIVES.summon:
          summon.push(effect.magnitude);
          break;
        case COMBAT_PRIMITIVES.knowledgeSteal:
          knowledgeSteal.push(effect.magnitude);
          break;
        default:
          // Everything else is world-scale, or is passive and read by
          // `passiveDefences`. A world primitive on a node cast in an
          // engagement does nothing, which is what §3's scale column means.
          break;
      }
    }

    return { directDamage, areaDenial, blink, summon, knowledgeSteal };
  }
}

function refused(refusal: CastRefusal, preparedSpells: readonly number[]): CastResolution {
  return { resolved: false, refusal, preparedSpells, cost: 0, effects: NO_EFFECTS };
}

/** The count of combatants one `summon` source creates. */
export function summonCount(magnitude: Fixed): number {
  // §3's unit is "count of combatants from a template", so the magnitude is a
  // count at fp scale and the whole number of combatants is the floor.
  return Math.max(0, floorDiv(magnitude, FP_ONE));
}

/** A uniform draw in `[0, bound)`, so that stream use stays inside this module. */
export function drawBelow(stream: RngStream, bound: number): number {
  return nextBounded(stream, bound);
}
