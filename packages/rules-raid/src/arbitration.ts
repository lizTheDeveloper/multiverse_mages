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
 *
 * ## Effect modes, at engagement scale
 *
 * `compositional-content.md` §3.3 gives every effect a `mode` — the
 * technique's envelope, made mechanical — and this file is where engagement
 * scale reads it. Every place that used to read `effect.magnitude` off a raw
 * `.primitive` match now goes through {@link gatherPrimitive} or
 * {@link gatherAreaDenial}, which apply exactly this table:
 *
 * - **`remove`** (Perdo) — `magnitude`, unchanged. This is "two scales, one
 *   verb" (§3.3): at engagement scale Perdo subtracts hit points and always
 *   did, so there is nothing to negate here — the magnitude *is* the
 *   subtraction, applied by the caller (`addDamage`, `applyWardOnce`).
 * - **`create`** (Creo) — `+magnitude`, exactly as every effect already
 *   worked before `mode` existed. Creo is not gridded into v1, so this is the
 *   path the non-v1 nodes take.
 * - **`control`** (Rego) — **no magnitude.** A `control` effect contributes a
 *   `{floor, ceiling}` clamp instead, combined across sources by `@mm/
 *   primitives`' `combineControls` and applied by `stackMagnitudes`'/
 *   `rollStackedProbability`'s own `clamp` stage — never reimplemented here
 *   (`BAN_INLINE_PRIMITIVE_STACKING`). This is the bug this change closes: a
 *   placeholder `magnitude` on a `control` effect (Rego's payload is its
 *   `control` bound, not its `magnitude`) must never reach a stack as if it
 *   were a source. A ward with only a `control` source therefore stacks to
 *   whatever its clamp allows, not to a guaranteed near-total prevention, and
 *   a `knowledge-steal` with only a `control` source is not a guaranteed
 *   theft.
 * - **`transform`** (Muto) — splits across two primitives: `-magnitude`
 *   leaves the effect's own `primitive`, `+magnitude` arrives at its
 *   `transformTo`. Muto is not gridded into v1, so nothing here is exercised
 *   by shipped content yet; it is implemented and tested anyway so enabling a
 *   Muto cell is a content change, not a code one.
 * - **`reveal`** (Intellego) — **no magnitude, ever.** "No impact at all… a
 *   filter opens" (`sound-design.md` §4.1).
 *
 * ## The reveal/latent decision
 *
 * §3.4 gives `effect.when` a `{kind:"revealed"}` value: an effect that
 * contributes only while a held `reveal` effect names it — the other half of
 * Intellego, the "something becomes audible that was always present" half.
 *
 * **This file never activates one.** A raid is engagement time, frozen at
 * portal open; a reveal is world-time scholarship — the kind of thing that
 * changes what a mage's *research* uncovers, not what her *spell* does
 * mid-combat. Wiring reveal-activation in here would mean tracking, per
 * combatant, which descriptors her held `reveal` effects name, matching them
 * against every other held node's `when` on every gather, and keeping that
 * live across an engagement whose ruleset is otherwise frozen — real
 * machinery with no v1 content to exercise it (Muto and the reveal/latent
 * pairing are not gridded onto anything raid-relevant in v1 either).
 *
 * So {@link isAlwaysOn} skips every effect whose `when` is anything but the
 * default outright, at the one place every combat primitive is gathered — a
 * latent effect never fires in a raid by accident, in one gather function and
 * not another. If a later change gives engagement scale a real use for a
 * latent effect, this is the one predicate that decision has to change, and
 * changing it here changes it everywhere at once.
 */

import type { ContentId, ContentRegistry, EffectRecord, PrimitiveRecord } from '@mm/content';
import type { Fixed, RngStream } from '@mm/sim-core';
import { FP_ONE, floorDiv, nextBounded } from '@mm/sim-core';
import type { AblationMask, ClampCounters, EffectControl } from '@mm/primitives';
import {
  combineControls,
  neutralizedMagnitude,
  rollStackedProbability,
  stackMagnitudes,
} from '@mm/primitives';
import type { RulesetSnapshot } from '@mm/state';
import { LOCATION_KIND, permits } from '@mm/state';
import type { CastPolicy, ConsumptionRecorder, CostPolicy, MagicGrid } from '@mm/rules-magic';
import { castCost, expendOnCast, nodeEffectRecords, requireRegistryNode } from '@mm/rules-magic';

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

 * Whether an effect contributes at all right now — `when` absent or
 * `{kind:"always"}`. See the module docblock's "reveal/latent decision":
 * this file never activates a latent (`{kind:"revealed"}`) or conditional
 * (`{kind:"holds-cell"}`) effect, so every non-`always` effect is inert here.
 */
function isAlwaysOn(effect: EffectRecord): boolean {
  return effect.when === undefined || effect.when.kind === 'always';
}

/**
 * One node's engagement-scale contribution to one primitive: the magnitudes
 * that stack normally, and the `control` envelopes that clamp the stack
 * instead of joining it. See the module docblock's effect-modes table.
 *
 * The only place `effect.magnitude` and `effect.control` are read for the
 * combat primitives below — {@link CastArbiter.passiveDefences},
 * {@link CastArbiter.theftMagnitudes}/`theftControls`, and
 * {@link CastArbiter.resolveCast}'s effect gathering all go through this one
 * function (or {@link gatherAreaDenial}, its `durationTicks`-carrying
 * sibling), which is what keeps that read centralized as the existing
 * `theftMagnitudes` docblock already promised.
 */
function gatherPrimitive(
  effects: readonly EffectRecord[],
  primitiveId: string,
): { readonly magnitudes: Fixed[]; readonly controls: EffectControl[] } {
  const magnitudes: Fixed[] = [];
  const controls: EffectControl[] = [];
  for (const effect of effects) {
    if (!isAlwaysOn(effect)) continue;
    switch (effect.mode) {
      case 'create':
      case 'remove':
        if (effect.primitive === primitiveId) magnitudes.push(effect.magnitude);
        break;
      case 'transform':
        if (effect.primitive === primitiveId) magnitudes.push(-effect.magnitude);
        else if (effect.transformTo === primitiveId) magnitudes.push(effect.magnitude);
        break;
      case 'control':
        if (effect.primitive === primitiveId && effect.control !== undefined) {
          controls.push(effect.control);
        }
        break;
      case 'reveal':
        break;
    }
  }
  return { magnitudes, controls };
}

/**
 * `area-denial`'s contribution, mode-aware exactly like {@link
 * gatherPrimitive} — kept as a sibling rather than a case inside it because a
 * denial field also carries `durationTicks`, which a bare magnitude does not.
 * `area-denial` has no `control` payload in v1 and none is invented here: a
 * `control`-mode area-denial effect contributes nothing, symmetrically with
 * every other primitive, until a real use for clamping a denial field exists.
 */
function gatherAreaDenial(
  effects: readonly EffectRecord[],
): { readonly magnitude: Fixed; readonly durationTicks: number }[] {
  const denials: { magnitude: Fixed; durationTicks: number }[] = [];
  for (const effect of effects) {
    if (!isAlwaysOn(effect)) continue;
    switch (effect.mode) {
      case 'create':
      case 'remove':
        if (effect.primitive === COMBAT_PRIMITIVES.areaDenial) {
          denials.push({ magnitude: effect.magnitude, durationTicks: effect.durationTicks });
        }
        break;
      case 'transform':
        if (effect.primitive === COMBAT_PRIMITIVES.areaDenial) {
          denials.push({ magnitude: -effect.magnitude, durationTicks: effect.durationTicks });
        } else if (effect.transformTo === COMBAT_PRIMITIVES.areaDenial) {
          denials.push({ magnitude: effect.magnitude, durationTicks: effect.durationTicks });
        }
        break;
      case 'control':
      case 'reveal':
        break;
    }
  }
  return denials;
}

/**
 * Whether one effect would contribute *some* magnitude to `primitiveId`
 * through {@link gatherPrimitive} — without computing what that magnitude is.
 *
 * `raid.ts` uses this for two decisions that only need presence, never the
 * value: whether a node is worth selecting as "the direct-damage spell to
 * cast" or "the knowledge-steal node to attempt", before arbitration ever
 * turns it into effects. Answering those with a bare `effect.primitive ===
 * id` check (the pre-`mode` code) would let a `control`- or `reveal`-mode
 * effect get a node selected for a magnitude it can never produce — a wasted
 * action, not a legality bug, but one this file can rule out for free by
 * asking the same mode question {@link gatherPrimitive} answers.
 */
export function contributesMagnitude(effect: EffectRecord, primitiveId: string): boolean {
  if (!isAlwaysOn(effect)) return false;
  switch (effect.mode) {
    case 'create':
    case 'remove':
      return effect.primitive === primitiveId;
    case 'transform':
      return effect.primitive === primitiveId || effect.transformTo === primitiveId;
    case 'control':
    case 'reveal':
      return false;
  }
}

/**
 * Whether one effect opens a `presence`-stacked gate like `portal`.
 *
 * `portal`'s stacking rule is `presence` (`@mm/primitives`' `presence()`),
 * whose own doc is written against this exact design: a positive source
 * opens the gate and a negative one suppresses it outright. This function is
 * the mode-to-sign question for a presence primitive specifically, and it
 * reads differently from {@link gatherPrimitive} on one mode:
 *
 * - **`create`** — opens the gate. Not gridded onto `rego-limen` in v1, but
 *   the general rule, unchanged from every other `create` effect.
 * - **`control`** — **also opens the gate.** Rego *is* the portal cell
 *   (`sound-design.md` §4.3 — *"Rego Limen … the portal cell: a hard lock,
 *   and then you are somewhere else"*), and a boolean gate has no continuous
 *   range for a `{floor, ceiling}` clamp to bound. The general "`control`
 *   contributes no magnitude" reading (§3.3) is about a fraction or a
 *   probability being pushed to false certainty — a hazard a presence
 *   primitive cannot have, since it is never a magnitude in the first place.
 *   So for `portal` specifically, `control` behaves like `create`.
 * - **`remove`** — **never opens the gate.** *"Perdo's signature is a hole"*
 *   (`sound-design.md` §4.1): a Perdo Limen node unmakes a gate rather than
 *   opening one, so it must never itself satisfy the check a `create` or
 *   `control` node would — whatever else is true of the raider's knowledge.
 * - **`reveal`** — never opens the gate. Intellego's "no impact at all".
 *
 * Latent effects (`isAlwaysOn` false) never open the gate either.
 */
export function enablesGate(effect: EffectRecord, primitiveId: string): boolean {
  return (
    effect.primitive === primitiveId &&
    isAlwaysOn(effect) &&
    (effect.mode === 'create' || effect.mode === 'control')
  );
}

/**
 * Every combat primitive's authored node effects, fetched once and recorded.
 *
 * ## Why this exists at all, when the arbiter could read the registry
 *
 * It did, and the reading was correct — this index changes no magnitude and no
 * dispatch. What it changes is **who asked**, and that is the whole point.
 *
 * `rules-magic`'s consumption check does not ask "does any code read this
 * primitive"; it asks whether *the code that assembles a running simulation*
 * fetched a primitive's node magnitudes. Registration is a side effect of the
 * fetch, so it cannot be claimed by a maintainer and left untrue. An arbiter
 * that read `registry.nodes` itself, inside a raid, at the bottom of a call
 * stack the composition root never traverses at build time, registered nothing —
 * and seven primitives that a mage can learn, hold, and work were reported as
 * unreachable by knowledge while they were, in fact, reachable.
 *
 * So the index is built **at the composition root**, by `scenario`'s
 * `worldDeps`, and handed to {@link CastArbiter} as a required constructor
 * argument. Required, not optional: an arbiter that could build its own would
 * let the wire from the composition root be deleted without a type error, and
 * the check would stay green over a dead wire. That failure mode — a green
 * light with nothing behind it — is precisely the one the consumption check was
 * written to end.
 *
 * ## What the green means, stated so nobody has to infer it
 *
 * That the assembled simulation holds these magnitudes. **Not** that a raid
 * happened: the check builds a universe and throws it away, and it opens no
 * portal — exactly as it opens none for `portal` itself. Evidence that a mage
 * who knows combat magic fights better is a measurement, and it is in
 * `packages/rules-raid/test/unit/combat-knowledge.test.ts`.
 */
export interface CombatEffectIndex {
  /**
   * Authored effects per node, per combat primitive.
   *
   * Keyed by primitive id first because that is the shape the fetch produces,
   * one recorded call per primitive, and a per-node shape would have to be
   * assembled from the same seven calls anyway.
   */
  readonly byPrimitive: ReadonlyMap<string, ReadonlyMap<ContentId, readonly EffectRecord[]>>;
}

/**
 * Fetches every combat primitive's node effects, registering each fetch.
 *
 * Seven calls, seven registrations, one per primitive in {@link COMBAT_PRIMITIVES}
 * except `portal` — which is a world-scale presence gate already fetched by
 * `coordination/god/interventions.portalPlan`, and a second registration for it
 * would claim a second consumer that does not exist.
 *
 * The consumer address on each registration names the method that applies the
 * magnitudes rather than this function, because a reader chasing a registration
 * wants the place the number does something.
 */
export function combatEffectIndex(
  registry: ContentRegistry,
  recorder: ConsumptionRecorder,
): CombatEffectIndex {
  const byPrimitive = new Map<string, ReadonlyMap<ContentId, readonly EffectRecord[]>>();
  for (const [primitiveId, consumer] of COMBAT_CONSUMERS) {
    byPrimitive.set(primitiveId, nodeEffectRecords(registry, primitiveId, consumer, recorder));
  }
  return Object.freeze({ byPrimitive });
}

/**
 * Where each combat primitive's magnitudes are applied, as `package/file.symbol`.
 *
 * Written out rather than derived from {@link COMBAT_PRIMITIVES} so that each
 * address is the truth about one primitive: `ward` and `concealment` are read
 * once at portal open and never cast, `knowledge-steal` is the theft intent's,
 * and the other four are placed by a resolved cast. A single generic address
 * would be shorter and would tell a reader chasing a failure nothing.
 */
const COMBAT_CONSUMERS: readonly (readonly [string, string])[] = Object.freeze([
  [COMBAT_PRIMITIVES.directDamage, 'rules-raid/arbitration.CastArbiter.resolveCast'],
  [COMBAT_PRIMITIVES.areaDenial, 'rules-raid/arbitration.CastArbiter.resolveCast'],
  [COMBAT_PRIMITIVES.blink, 'rules-raid/arbitration.CastArbiter.resolveCast'],
  [COMBAT_PRIMITIVES.summon, 'rules-raid/arbitration.CastArbiter.resolveCast'],
  [COMBAT_PRIMITIVES.ward, 'rules-raid/arbitration.CastArbiter.passiveDefences'],
  [COMBAT_PRIMITIVES.concealment, 'rules-raid/arbitration.CastArbiter.passiveDefences'],
  [COMBAT_PRIMITIVES.knowledgeSteal, 'rules-raid/arbitration.CastArbiter.theftMagnitudes'],
]);

/** No authored effects, for a node the index has never heard of. */
const NO_RECORDS: readonly EffectRecord[] = Object.freeze([]);

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
  readonly #combat: CombatEffectIndex;
  readonly #tuning: { readonly castVigorBase: Fixed; readonly castVigorPerTier: Fixed };
  readonly #counters: ClampCounters | undefined;
  readonly #ablation: AblationMask | undefined;
  readonly #faults: ArbitrationFaults;
  readonly #castProfiles = new Map<ContentId, CastProfile>();
  readonly #castEffects = new Map<ContentId, CastEffects>();
  #forbiddenCastsBlocked = 0;

  constructor(options: {
    readonly hostRuleset: RulesetSnapshot;
    readonly grid: MagicGrid;
    readonly registry: ContentRegistry;
    /**
     * The composition root's fetch of every combat primitive's node effects.
     *
     * Required. See {@link combatEffectIndex} for why an arbiter that could
     * build its own would defeat the check this argument exists to satisfy.
     */
    readonly combat: CombatEffectIndex;
    readonly tuning: { readonly castVigorBase: Fixed; readonly castVigorPerTier: Fixed };
    readonly counters?: ClampCounters;
    /**
     * §9's mask for this arm, or absent for a control run.
     *
     * Absent rather than {@link NO_ABLATION} on purpose, matching
     * `world-step.ts`: an absent mask takes the byte-identical branch every
     * committed baseline and every golden fixture was recorded on.
     */
    readonly ablation?: AblationMask | undefined;
    readonly faults?: ArbitrationFaults;
  }) {
    this.#hostRuleset = options.hostRuleset;
    this.#grid = options.grid;
    this.#registry = options.registry;
    this.#combat = options.combat;
    this.#tuning = options.tuning;
    this.#counters = options.counters;
    this.#ablation = options.ablation;
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
   *
   * Mode-aware via {@link gatherPrimitive}: a `control`-mode ward or
   * concealment effect (Rego's placeholder `magnitude` included) contributes
   * a clamp rather than a source, so it can bound the stack — a floor bought,
   * a ceiling sold — but can never *be* the stack. Before this, a `magnitude:
   * 1024` control effect on `ward` stacked as a 100%-prevention source
   * (capped to the §3 ceiling of 90%); now it stacks to nothing at all unless
   * some `create`/`remove`/`transform` source also applies.
   */
  passiveDefences(
    held: Iterable<HeldInstance>,
    activationThreshold: Fixed,
    baseConcealment: Fixed,
  ): { readonly ward: Fixed; readonly concealment: Fixed } {
    const wardMagnitudes: Fixed[] = [];
    const wardControls: EffectControl[] = [];
    const concealmentMagnitudes: Fixed[] = baseConcealment > 0 ? [baseConcealment] : [];
    const concealmentControls: EffectControl[] = [];

    for (const instance of held) {
      if (instance.locationKind !== LOCATION_KIND.mind && instance.locationKind !== LOCATION_KIND.palace) {
        continue;
      }
      if (instance.mastery < activationThreshold) continue;
      if (!this.#permitsNode(instance.nodeId)) continue;
      const ward = gatherPrimitive(
        this.#authored(COMBAT_PRIMITIVES.ward, instance.nodeId),
        COMBAT_PRIMITIVES.ward,
      );
      wardMagnitudes.push(...ward.magnitudes);
      wardControls.push(...ward.controls);

      const concealment = gatherPrimitive(
        this.#authored(COMBAT_PRIMITIVES.concealment, instance.nodeId),
        COMBAT_PRIMITIVES.concealment,
      );
      concealmentMagnitudes.push(...concealment.magnitudes);
      concealmentControls.push(...concealment.controls);
    }

    return {
      ward: this.#stack(COMBAT_PRIMITIVES.ward, wardMagnitudes, wardControls),
      concealment: this.#stack(COMBAT_PRIMITIVES.concealment, concealmentMagnitudes, concealmentControls),
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
      this.#stackOptions(),
    ).succeeded;
  }

  /**
   * A theft attempt, on stream 9, gated by the **host's** ruleset.
   *
   * The gate is the host's for the same reason casting is: it is magic worked
   * inside the host's sky. A raider whose home forbids `rego-nomen` may still
   * read a name in a universe that permits it, and a host that forbids `mentem`
   * cannot be mind-read by anybody, including its own defenders.
   *
   * `controls` is `theftControls(nodeId)`, threaded through by the caller
   * rather than re-read here — see `theftMagnitudes`' docblock on keeping the
   * effect read centralized. A `control`-mode `knowledge-steal` effect
   * therefore bounds the rolled probability (a floor bought, a ceiling sold)
   * instead of becoming a magnitude in its own right: before this, a
   * `magnitude: 1024` control effect rolled as fp(1024) — a guaranteed
   * steal — regardless of the fp(1024) cap on the roll ever meaning "certain
   * on purpose".
   */
  attemptTheft(
    nodeId: ContentId,
    magnitudes: readonly Fixed[],
    stream: RngStream,
    controls: readonly EffectControl[] = [],
  ): boolean {
    if (!this.#permitsNode(nodeId)) {
      this.#forbiddenCastsBlocked += 1;
      return false;
    }
    return rollStackedProbability(
      this.#primitive(COMBAT_PRIMITIVES.knowledgeSteal),
      magnitudes,
      stream,
      {
        ...this.#stackOptions(),
        ...(controls.length > 0 ? { clamp: combineControls(controls) } : {}),
      },
    ).succeeded;
  }

  /**
   * The `knowledge-steal` magnitudes a node carries — `create`/`remove`/
   * `transform` sources only; see {@link gatherPrimitive}.
   *
   * Here rather than at the theft call site so that `effect.magnitude` is read
   * in exactly one file. The conformance check enforces that, and the rule it
   * enforces is the interesting one: a magnitude read anywhere else is a second
   * place where a node's effects become numbers, which is the shape a bypassed
   * legality check actually takes.
   */
  theftMagnitudes(nodeId: ContentId): readonly Fixed[] {
    return gatherPrimitive(
      this.#authored(COMBAT_PRIMITIVES.knowledgeSteal, nodeId),
      COMBAT_PRIMITIVES.knowledgeSteal,
    ).magnitudes;
  }

  /**
   * The `knowledge-steal` `control` envelopes a node carries — the other half
   * of `theftMagnitudes`, split out because {@link attemptTheft} needs both
   * but combines the controls itself (via `combineControls`), same as
   * `passiveDefences` does for `ward`/`concealment`.
   */
  theftControls(nodeId: ContentId): readonly EffectControl[] {
    return gatherPrimitive(
      this.#authored(COMBAT_PRIMITIVES.knowledgeSteal, nodeId),
      COMBAT_PRIMITIVES.knowledgeSteal,
    ).controls;
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

  /**
   * The same ward multiply as {@link applyWardOnce}, **without** the clamp
   * counters. For observation only.
   *
   * `action-economy.ts` has to ask what a tick would have done to a combatant
   * had `concealment` not evaded a cast, or had the ward not been there. That is
   * one more evaluation of the identical formula, and routing it through
   * {@link applyWardOnce} would increment `ClampCounters` a second time for the
   * same tick — moving `RaidOutcome.capClamps`, which is a behaviour change
   * dressed as a measurement. A measurement that perturbs what it measures is
   * the one thing this file may not ship.
   */
  observeWardApplication(rawDamage: Fixed, wardSources: readonly Fixed[]): Fixed {
    const ward = stackMagnitudes(
      this.#primitive(COMBAT_PRIMITIVES.ward),
      wardSources,
      this.#ablation === undefined ? {} : { ablation: this.#ablation },
    ).value;
    return floorDiv(rawDamage * (FP_ONE - ward), FP_ONE);
  }

  /**
   * The effective, capped value of one primitive's sources, optionally bounded
   * by the `control` envelopes the same node authored.
   *
   * Two independent modifiers meet here and neither subsumes the other. §9's
   * ablation mask comes from {@link #stackOptions} and answers *"is this
   * primitive switched off for this arm"*; a `control` envelope comes from the
   * content and answers *"what floor and ceiling did a Rego effect buy"*. An
   * ablated primitive is neutralized upstream in {@link #authored}, so a clamp
   * that survives here bounds a stack that is already zero — which is the
   * correct reading, not a special case.
   */
  #stack(
    primitiveId: string,
    magnitudes: readonly Fixed[],
    controls: readonly EffectControl[] = [],
  ): Fixed {
    return stackMagnitudes(this.#primitive(primitiveId), magnitudes, {
      ...this.#stackOptions(),
      ...(controls.length > 0 ? { clamp: combineControls(controls) } : {}),
    }).value;
  }

  /**
   * The options every stack and every roll in this file passes, so that §9's
   * mask reaches `@mm/primitives` through **one** expression.
   *
   * Both fields are spread conditionally rather than passed as `undefined`,
   * which keeps a control run's call byte-identical to what it was before the
   * mask was threaded — the same discipline `world-step.ts` keeps at its three
   * `deps.ablation === undefined` sites, and for the same reason: the baselines.
   */
  #stackOptions(): { counters?: ClampCounters; ablation?: AblationMask } {
    return {
      ...(this.#counters === undefined ? {} : { counters: this.#counters }),
      ...(this.#ablation === undefined ? {} : { ablation: this.#ablation }),
    };
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

  /**
   * The authored effects one node carries for one primitive, **after** §9's
   * mask, straight out of the composition root's index.
   *
   * ## An ablated magnitude is neutralized in place, never removed
   *
   * A neutralized effect keeps its slot in the list. That is not tidiness: the
   * lists' *lengths* decide control flow that draws randomness. An empty
   * `directDamage` skips the evasion roll on stream 8; an empty `blink` skips
   * the displacement; `castProfile.placesEffects` is computed from the same
   * lengths and decides whether a combatant declares a cast at all. Dropping
   * the entries would give the ablation arm a different stream position from
   * its paired control on the first cast, and every later draw in the raid
   * would differ for a reason that has nothing to do with the primitive.
   *
   * So an ablated combatant selects the same node, pays the same vigor, spends
   * the same preparation and draws the same numbers — and puts
   * {@link neutralizedMagnitude} on the field, which for every combat primitive
   * in §3's table is zero. That is what makes a win-rate delta attributable to
   * the primitive rather than to the schedule.
   *
   * `durationTicks` is left alone. A zero-magnitude field that persists is
   * still a field doing nothing; shortening it would be a second, unrelated
   * change riding along inside the mask.
   */
  #authored(primitiveId: string, nodeId: ContentId): readonly EffectRecord[] {
    const authored = this.#combat.byPrimitive.get(primitiveId)?.get(nodeId) ?? NO_RECORDS;
    if (authored.length === 0) return authored;
    if (this.#ablation?.neutralizes(primitiveId) !== true) return authored;
    const neutral = neutralizedMagnitude(this.#primitive(primitiveId).stacking);
    return authored.map((effect) => ({ ...effect, magnitude: neutral }));
  }

  /**
   * A node's engagement-scale effects, grouped by primitive, mode-aware via
   * {@link gatherPrimitive}/{@link gatherAreaDenial}. Memoised per raid.
   *
   * Memoised for the same reason {@link castProfile} is — selection asks for it
   * once per held node per combatant per tick — and safely, because the answer
   * depends on the index and the mask, both fixed for the arbiter's lifetime.
   *
   * The records come from {@link #authored}, so §9's mask has already been
   * applied by the time the mode split runs. The two are orthogonal: ablation
   * decides *whether a primitive contributes at all on this arm*, the mode
   * decides *which of a node's authored effects were ever a magnitude for this
   * primitive*. A `control`- or `reveal`-mode effect contributes none either
   * way.
   *
   * `control` envelopes on these five primitives are read (so a `control`
   * effect correctly contributes no magnitude here) but not applied: unlike
   * `ward`, `concealment` and `knowledge-steal`, none of
   * `direct-damage`/`area-denial`/`blink`/`summon` are stacked through
   * `@mm/primitives` on the per-cast path — `raid.ts` ledgers damage and denial
   * by hand and takes `blink`'s max and `summon`'s count at the point of use.
   * So a `control`-mode effect on one of these correctly stops contributing a
   * magnitude but its clamp has no consumer yet; nothing in v1 authors one.
   */
  #effectsOf(nodeId: ContentId): CastEffects {
    const cached = this.#castEffects.get(nodeId);
    if (cached !== undefined) return cached;

    const effects: CastEffects = {
      directDamage: gatherPrimitive(
        this.#authored(COMBAT_PRIMITIVES.directDamage, nodeId),
        COMBAT_PRIMITIVES.directDamage,
      ).magnitudes,
      areaDenial: gatherAreaDenial(this.#authored(COMBAT_PRIMITIVES.areaDenial, nodeId)),
      blink: gatherPrimitive(this.#authored(COMBAT_PRIMITIVES.blink, nodeId), COMBAT_PRIMITIVES.blink)
        .magnitudes,
      summon: gatherPrimitive(
        this.#authored(COMBAT_PRIMITIVES.summon, nodeId),
        COMBAT_PRIMITIVES.summon,
      ).magnitudes,
      knowledgeSteal: gatherPrimitive(
        this.#authored(COMBAT_PRIMITIVES.knowledgeSteal, nodeId),
        COMBAT_PRIMITIVES.knowledgeSteal,
      ).magnitudes,
    };
    this.#castEffects.set(nodeId, effects);
    return effects;
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
