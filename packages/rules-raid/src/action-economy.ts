/*
 * Multiverse Mages — what a combat node is actually worth: action economy,
 * measured in combatant-ticks denied rather than in hit points removed.
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
 * ## Why damage is the wrong primary measure
 *
 * {@link OutcomeLedger.primitiveApplication} records *magnitude put on the
 * field*, per primitive, per side. It is what `winRateByPrimitive`'s ablation
 * needs and it is not what a combat node is **for**. Two measured findings say
 * so:
 *
 * - Over twenty seeds, the share of hit points removed ran to roughly half for
 *   `area-denial`, roughly half for summons and soldier detachments, and under
 *   two percent for cast `direct-damage`. A node whose whole text is a bolt
 *   contributes a rounding error to the quantity that names it.
 * - Survival-regret across the same seeds measured zero on every seed: the
 *   raider took the objectives and left before any cast killed anybody. *Combat
 *   does not decide the raid*, so a measure of combat that only counts damage is
 *   measuring the wrong side of the thing.
 *
 * What a combat node buys is **enemy action it does not get to take**. That is
 * the quantity here, and its unit is the **combatant-tick**: one combatant
 * acting for one engagement tick.
 *
 * ## The three channels, and why "removed from action" is wider than "killed"
 *
 * Control dominates damage on this tuning, so a measure that only counted
 * corpses would report the same near-zero it is meant to replace. A combatant
 * stops contributing in three ways this engine can produce:
 *
 * 1. **Removal.** Hit points reach zero. The denial is every tick from that
 *    moment to the raid's resolution, credited across the sources that removed
 *    the hit points, in proportion to how many each removed *over the
 *    combatant's whole life* — not over the killing tick alone, which would hand
 *    the credit to whoever happened to land last and call timing a definition.
 * 2. **A defensive save.** `ward` scaling a lethal tick down to a survivable
 *    one, or `concealment` causing the cast that would have finished the target
 *    to miss. The denial is the enemy's removal, and it is measured as the ticks
 *    the saved combatant went on to act for — a real quantity, bounded by what
 *    actually happened, rather than a counterfactual raid nobody ran.
 * 3. **A decoy.** An attack spent on a summon. A summon has no world-scale
 *    source (`sourceId: 0`) and writes nothing back, so an enemy tick spent on
 *    one is an enemy tick that bought nothing: one combatant-tick denied.
 *
 * **A fourth channel — displacement — is declared absent rather than reported
 * as zero.** `blink` in this engine moves only the caster, and an `area-denial`
 * field damages without pushing; no code path displaces an enemy off an
 * objective. A metric with a channel that is structurally incapable of moving
 * is the failure mode this project has hit four times already, so the channel is
 * named in {@link ActionEconomyReport.unimplementedChannels} and the metric
 * layer pins that list. Implementing displacement is a `definitionVersion` bump.
 *
 * ## Summon removals are counted apart
 *
 * Killing a summon is real work and it is **not** in the primary scalar. A
 * summon costs its owner nothing at world scale, so crediting its removal to the
 * primitive that did it would let damage farm denial on free bodies — invisible
 * inflation of exactly the number this module exists to make honest.
 * {@link ActionEconomyReport.summonsRemoved} reports it alongside, so the
 * exclusion's failure mode is visible rather than silent.
 *
 * ## This module observes and never decides
 *
 * Nothing here draws randomness, writes a component, or changes a branch. It
 * cannot: a measurement that moved the simulation would re-roll every stream
 * downstream of it and rot every committed baseline. The one arithmetic it
 * repeats — the ward multiply, for the save counterfactual — goes through
 * {@link CastArbiter.observeWardApplication}, which is the same formula with the
 * clamp counters left out, because counting a clamp twice would move
 * `RaidOutcome.capClamps` and that *is* a behaviour change.
 */

import type { EntityHandle, Fixed } from '@mm/sim-core';
import { floorDiv } from '@mm/sim-core';
import type { RaidSideValue } from '@mm/state';

/**
 * The attribution keys a combatant-tick can be credited to.
 *
 * Finer than `contracts.md` §3's primitive list in exactly one place, and the
 * split is the point: `raid.ts` logs a summon's and a detachment's intrinsic
 * attacks into the ledger as `direct-damage`, which makes "the bolt is worth
 * 1.9%" and "summons and soldiers are worth 48.4%" the *same row*. A measure
 * that cannot separate a cast from a body cannot answer the question that
 * prompted it.
 */
export const COMBAT_SOURCE = Object.freeze({
  /** `direct-damage` released by a resolved cast. Magic, and only magic. */
  directDamage: 'direct-damage',
  /** An `area-denial` field's per-tick application. */
  areaDenial: 'area-denial',
  /** A summoned combatant's intrinsic attack. Not a cast; consults no ruleset. */
  summonIntrinsic: 'summon-intrinsic',
  /** A soldier detachment's intrinsic attack. */
  soldierIntrinsic: 'soldier-intrinsic',
  /** `ward`, scaling a lethal tick to a survivable one. */
  ward: 'ward',
  /** `concealment`, making the cast that would have finished a target miss. */
  concealment: 'concealment',
  /** A summon soaking an attack aimed at a body that costs its owner nothing. */
  summonDecoy: 'summon-decoy',
});

/** Channels `contracts.md` §3 permits that this engine has no code path for. */
export const UNIMPLEMENTED_CHANNELS: readonly string[] = Object.freeze([
  // `blink` displaces the caster toward its own target and nothing else; an
  // `area-denial` field applies damage in a radius and pushes nobody. There is
  // no path by which a combatant is moved off an objective by an enemy.
  'displacement',
]);

/** A per-side pair. Index by {@link RaidSideValue}. */
export type BySide = readonly [number, number];

/** Attempt outcomes for one source. The threshold-efficiency numerator and denominator. */
export interface AttemptCounts {
  /** Attempts that damaged a target which reached zero hit points on a tick they fed. */
  readonly removing: number;
  /** Attempts that removed hit points and left the target standing. */
  readonly hurting: number;
  /**
   * Attempts that resolved and landed nothing — evaded, or warded to zero.
   *
   * Reported, and in neither the numerator nor the denominator: an attempt that
   * never touched the target says nothing about whether the source crosses a
   * removal threshold, and folding it into the denominator would make
   * `concealment` on the *enemy* look like a threshold failure of the caster.
   */
  readonly spent: number;
}

/** Everything one raid's action economy came to. Frozen at resolution. */
export interface ActionEconomyReport {
  /** Combatant-ticks denied, by {@link COMBAT_SOURCE} key, ascending. */
  readonly deniedTicks: readonly (readonly [string, BySide])[];
  /**
   * Hit points actually removed, by source, ascending. **Secondary**, and kept
   * because it is the quantity the earlier finding was stated in: a reader
   * comparing "1.9% of hit points" against this module needs the same number in
   * the same record. Overkill is excluded — a blow for more than the target had
   * left removes only what was there.
   */
  readonly hpRemoved: readonly (readonly [string, BySide])[];
  /** Attempts, by source, ascending. */
  readonly attempts: readonly (readonly [string, AttemptCounts])[];
  /**
   * Combatant-ticks this raid contained: for every combatant, the ticks from
   * its entry to its removal or to resolution. The denominator that turns a
   * level into a rate comparable across raids of different lengths.
   */
  readonly totalCombatantTicks: number;
  /** Removals of world-scale combatants — mages and soldier detachments — by side losing them. */
  readonly removals: BySide;
  /** Summons removed, by side losing them. Deliberately outside the primary scalar. */
  readonly summonsRemoved: BySide;
  /** Defensive saves, by the side saved. */
  readonly saves: BySide;
  /** {@link UNIMPLEMENTED_CHANNELS}, carried into the record so a reader sees it. */
  readonly unimplementedChannels: readonly string[];
}

/** What `raid.ts` hands back at cleanup for one target that took something. */
export interface TargetSettlement {
  readonly handle: EntityHandle;
  /** Hit points before this tick's damage was applied. */
  readonly hpBefore: Fixed;
  /** Damage summed across sources, before the one ward application. */
  readonly rawTotal: Fixed;
  /** What the engine actually subtracted — `applyWardOnce(rawTotal)`. */
  readonly appliedTotal: Fixed;
  /**
   * The same ward multiply, **without** the clamp counters, for the save
   * counterfactual. Supplied as a function rather than as a number because the
   * counterfactual asks it of a different raw total.
   */
  readonly observeWard: (raw: Fixed) => Fixed;
}

interface SaveEvent {
  readonly handle: EntityHandle;
  readonly tick: number;
  readonly source: string;
  readonly side: RaidSideValue;
}

/** A combatant, as far as attribution needs to care. */
interface Registered {
  readonly side: RaidSideValue;
  /** `COMBATANT_SOURCE_KIND`. Summons are excluded from the primary scalar. */
  readonly worldScale: boolean;
  readonly entryTick: number;
  removalTick: number | undefined;
}

function emptyPair(): [number, number] {
  return [0, 0];
}

/**
 * Splits `total` across `weights` in proportion, in integers, conserving the
 * total exactly.
 *
 * Floor each share, then hand the remainder to the largest weight, ties on the
 * ascending key. Deterministic, and it conserves: the sum of the returned shares
 * equals `total` whenever the weights sum above zero. A proportional split that
 * did not conserve would make "denied combatant-ticks" a quantity that changes
 * when you regroup the rows, which is the shape of a metric nobody can check.
 */
export function apportion(
  total: number,
  weights: readonly (readonly [string, number])[],
): (readonly [string, number])[] {
  const sum = weights.reduce((running, entry) => running + entry[1], 0);
  if (sum <= 0 || total <= 0) return weights.map((entry) => [entry[0], 0] as const);

  // `floorDiv` rather than a division: the rules path bans floating-point Math,
  // and the shared helper rounds toward negative infinity everywhere in the
  // project rather than in two directions depending on sign.
  const shares = weights.map((entry) => [entry[0], floorDiv(total * entry[1], sum)] as const);
  let assigned = 0;
  for (const share of shares) assigned += share[1];

  const remainder = total - assigned;
  if (remainder <= 0) return shares;

  // The largest weight takes the remainder; among equal weights the ascending
  // key wins, because `weights` arrives sorted by key and the comparison is
  // strict. Two peers therefore hand the remainder to the same row.
  let best = 0;
  for (let at = 1; at < weights.length; at += 1) {
    if ((weights[at] as readonly [string, number])[1] > (weights[best] as readonly [string, number])[1]) {
      best = at;
    }
  }
  return shares.map((share, at) => (at === best ? ([share[0], share[1] + remainder] as const) : share));
}

/**
 * The accumulator. One per raid, filled as it runs, read once at resolution.
 *
 * Every method is an observation of something the engine had already decided.
 * None of them may branch the engine, and the conformance test names this file
 * as the only place in `rules-raid` permitted to hold a per-combatant damage
 * history.
 */
export class ActionEconomyLedger {
  readonly #combatants = new Map<EntityHandle, Registered>();
  /** Hit points this source has removed from this target, over its whole life. */
  readonly #lifetimeHp = new Map<EntityHandle, Map<string, Fixed>>();
  /** This tick's raw damage to this target, by source. Cleared every tick. */
  readonly #tickRaw = new Map<EntityHandle, Map<string, Fixed>>();
  /** This tick's attempts that touched this target. Cleared every tick. */
  readonly #tickAttempts = new Map<EntityHandle, Set<number>>();
  /** Magnitude this tick's `concealment` evasions kept off this target. */
  readonly #tickEvaded = new Map<EntityHandle, Fixed>();

  readonly #attemptSource = new Map<number, string>();
  readonly #attemptDamaged = new Set<number>();
  readonly #attemptRemoving = new Set<number>();
  readonly #saveEvents: SaveEvent[] = [];
  readonly #hpRemoved = new Map<string, [number, number]>();
  readonly #decoyTicks: [number, number] = [0, 0];
  #nextAttempt = 1;

  /**
   * Declares a combatant and the tick it entered on.
   *
   * Called for the opening rosters at portal open and for each summon as it is
   * created. An unregistered combatant contributes no span and can hold no
   * removal, which would understate the denominator silently — so
   * {@link report} throws rather than guessing when it settles a target it never
   * saw.
   */
  register(handle: EntityHandle, side: RaidSideValue, worldScale: boolean, tick: number): void {
    if (this.#combatants.has(handle)) return;
    this.#combatants.set(handle, { side, worldScale, entryTick: tick, removalTick: undefined });
  }

  /** Opens an attempt: one resolved cast per primitive, or one intrinsic attack. */
  beginAttempt(source: string): number {
    const id = this.#nextAttempt;
    this.#nextAttempt += 1;
    this.#attemptSource.set(id, source);
    return id;
  }

  /** Records raw damage headed at a target this tick, before the ward multiply. */
  damage(target: EntityHandle, source: string, magnitude: Fixed, attempt: number): void {
    const bySource = this.#tickRaw.get(target) ?? new Map<string, Fixed>();
    bySource.set(source, (bySource.get(source) ?? 0) + magnitude);
    this.#tickRaw.set(target, bySource);

    const attempts = this.#tickAttempts.get(target) ?? new Set<number>();
    attempts.add(attempt);
    this.#tickAttempts.set(target, attempts);
  }

  /**
   * Records magnitude a `concealment` evasion kept off a target this tick.
   *
   * The attempt is registered against the target so that a cast which evaded and
   * did nothing else is counted `spent` rather than vanishing from the attempt
   * table — an attempt nobody counted is an attempt that flatters every ratio it
   * was not in.
   */
  evaded(target: EntityHandle, magnitude: Fixed, attempt: number): void {
    this.#tickEvaded.set(target, (this.#tickEvaded.get(target) ?? 0) + magnitude);
    const attempts = this.#tickAttempts.get(target) ?? new Set<number>();
    attempts.add(attempt);
    this.#tickAttempts.set(target, attempts);
  }

  /** Records one enemy attack spent on a summon. One combatant-tick denied. */
  decoyed(summonSide: RaidSideValue): void {
    this.#decoyTicks[summonSide] += 1;
  }

  /** Every target this tick touched, damaged or merely aimed at. */
  pendingTargets(): EntityHandle[] {
    const handles = new Set<EntityHandle>([...this.#tickRaw.keys(), ...this.#tickEvaded.keys()]);
    return [...handles].sort((a, b) => a - b);
  }

  /**
   * Settles one tick for one target: apportions the hit points it actually lost,
   * marks its attempts, and records a removal or a save.
   *
   * Must be called with `hpBefore` read before the engine wrote the new value,
   * and with `appliedTotal` being what the engine actually subtracted — not a
   * recomputation, which could disagree by a rounding step and make the ledger's
   * hit points differ from the battlefield's.
   */
  settle(settlement: TargetSettlement, tick: number): void {
    const target = this.#combatants.get(settlement.handle);
    if (target === undefined) {
      throw new Error(
        `The action-economy ledger settled combatant ${String(settlement.handle)}, which was never ` +
          'registered. An unregistered combatant contributes no span to the denominator and can ' +
          'hold no removal, so guessing here would understate the metric silently.',
      );
    }

    const raw = this.#tickRaw.get(settlement.handle);
    const weights = raw === undefined ? [] : sortedEntries(raw);
    const rawTotal = weights.reduce((running, entry) => running + entry[1], 0);
    const hpLost = Math.min(settlement.appliedTotal, settlement.hpBefore);
    const died = settlement.hpBefore - settlement.appliedTotal <= 0;

    // ---- Hit points, apportioned across the sources that arrived this tick. ----
    const dealerSide = target.side === 0 ? 1 : 0;
    const lifetime = this.#lifetimeHp.get(settlement.handle) ?? new Map<string, Fixed>();
    for (const [source, share] of apportion(hpLost, weights)) {
      if (share <= 0) continue;
      lifetime.set(source, (lifetime.get(source) ?? 0) + share);
      const pair = this.#hpRemoved.get(source) ?? emptyPair();
      pair[dealerSide] += share;
      this.#hpRemoved.set(source, pair);
    }
    this.#lifetimeHp.set(settlement.handle, lifetime);

    // ---- Attempts. Damage is judged on raw, not on the apportioned share: a
    // share floored to zero is a rounding artefact, not an attempt that missed.
    for (const attempt of this.#tickAttempts.get(settlement.handle) ?? []) {
      const source = this.#attemptSource.get(attempt);
      if (source === undefined) continue;
      const contributed = raw?.get(source) ?? 0;
      if (contributed > 0 && hpLost > 0) {
        this.#attemptDamaged.add(attempt);
        if (died) this.#attemptRemoving.add(attempt);
      }
    }

    if (died) {
      target.removalTick = tick;
      return;
    }

    // ---- The save counterfactual. At most one per combatant-tick. ----
    const evaded = this.#tickEvaded.get(settlement.handle) ?? 0;
    if (evaded > 0 && settlement.hpBefore - settlement.observeWard(rawTotal + evaded) <= 0) {
      // Restore what concealment kept off, keep the ward, and the target dies:
      // the evasion was *necessary*, so the credit is concealment's.
      this.#saveEvents.push({
        handle: settlement.handle,
        tick,
        source: COMBAT_SOURCE.concealment,
        side: target.side,
      });
      return;
    }
    if (settlement.hpBefore - rawTotal <= 0) {
      // Unwarded, this tick was lethal; warded, it was not. Reached only when
      // concealment was not necessary, so ward was the sufficient one.
      this.#saveEvents.push({
        handle: settlement.handle,
        tick,
        source: COMBAT_SOURCE.ward,
        side: target.side,
      });
    }
  }

  /** Clears the per-tick state. Called once, after every target has settled. */
  endTick(): void {
    this.#tickRaw.clear();
    this.#tickAttempts.clear();
    this.#tickEvaded.clear();
  }

  /**
   * The report, computed once at resolution because two of the three channels
   * need `resolutionTick` and neither could be known while the raid ran.
   */
  report(resolutionTick: number): ActionEconomyReport {
    const denied = new Map<string, [number, number]>();
    const credit = (source: string, side: RaidSideValue, ticks: number): void => {
      if (ticks <= 0) return;
      const pair = denied.get(source) ?? emptyPair();
      pair[side] += ticks;
      denied.set(source, pair);
    };

    let totalCombatantTicks = 0;
    const removals: [number, number] = [0, 0];
    const summonsRemoved: [number, number] = [0, 0];

    for (const [handle, combatant] of [...this.#combatants.entries()].sort((a, b) => a[0] - b[0])) {
      const end = combatant.removalTick ?? resolutionTick;
      totalCombatantTicks += Math.max(0, end - combatant.entryTick);
      if (combatant.removalTick === undefined) continue;

      if (!combatant.worldScale) {
        summonsRemoved[combatant.side] += 1;
        continue;
      }
      removals[combatant.side] += 1;

      // Channel 1. The ticks this combatant will not act for, split across the
      // sources that took its hit points — over its life, not over the last tick.
      const span = Math.max(0, resolutionTick - combatant.removalTick);
      const lifetime = this.#lifetimeHp.get(handle);
      if (lifetime === undefined || span === 0) continue;
      const killerSide: RaidSideValue = combatant.side === 0 ? 1 : 0;
      for (const [source, ticks] of apportion(span, sortedEntries(lifetime))) {
        credit(source, killerSide, ticks);
      }
    }

    // Channel 2. Each save owns the span from itself to the next save of the
    // same combatant, or to that combatant's removal, or to resolution.
    // Partitioned rather than overlapping: two saves of one mage bought her one
    // stretch of life between them, not two copies of the rest of the raid.
    const saves: [number, number] = [0, 0];
    const byCombatant = new Map<EntityHandle, SaveEvent[]>();
    for (const event of this.#saveEvents) {
      const list = byCombatant.get(event.handle) ?? [];
      list.push(event);
      byCombatant.set(event.handle, list);
    }
    for (const [handle, events] of [...byCombatant.entries()].sort((a, b) => a[0] - b[0])) {
      const combatant = this.#combatants.get(handle);
      const end = combatant?.removalTick ?? resolutionTick;
      const ordered = [...events].sort((a, b) => a.tick - b.tick);
      for (let at = 0; at < ordered.length; at += 1) {
        const event = ordered[at] as SaveEvent;
        const next = ordered[at + 1];
        const until = next === undefined ? end : Math.min(next.tick, end);
        saves[event.side] += 1;
        credit(event.source, event.side, Math.max(0, until - event.tick));
      }
    }

    // Channel 3. One combatant-tick per enemy attack that a summon soaked.
    credit(COMBAT_SOURCE.summonDecoy, 0, this.#decoyTicks[0]);
    credit(COMBAT_SOURCE.summonDecoy, 1, this.#decoyTicks[1]);

    return Object.freeze({
      deniedTicks: freezePairs(denied),
      hpRemoved: freezePairs(this.#hpRemoved),
      attempts: this.#attemptTable(),
      totalCombatantTicks,
      removals: Object.freeze(removals) as BySide,
      summonsRemoved: Object.freeze(summonsRemoved) as BySide,
      saves: Object.freeze(saves) as BySide,
      unimplementedChannels: UNIMPLEMENTED_CHANNELS,
    });
  }

  #attemptTable(): readonly (readonly [string, AttemptCounts])[] {
    const table = new Map<string, { removing: number; hurting: number; spent: number }>();
    for (const [attempt, source] of [...this.#attemptSource.entries()].sort((a, b) => a[0] - b[0])) {
      const entry = table.get(source) ?? { removing: 0, hurting: 0, spent: 0 };
      if (this.#attemptRemoving.has(attempt)) entry.removing += 1;
      else if (this.#attemptDamaged.has(attempt)) entry.hurting += 1;
      else entry.spent += 1;
      table.set(source, entry);
    }
    return Object.freeze(
      [...table.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([source, counts]) => Object.freeze([source, Object.freeze({ ...counts })] as const)),
    );
  }
}

function sortedEntries(map: ReadonlyMap<string, number>): (readonly [string, number])[] {
  return [...map.entries()]
    .map(([key, value]) => [key, value] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function freezePairs(map: ReadonlyMap<string, readonly [number, number]>): readonly (readonly [string, BySide])[] {
  return Object.freeze(
    [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, pair]) => Object.freeze([key, Object.freeze([pair[0], pair[1]]) as BySide] as const)),
  );
}
