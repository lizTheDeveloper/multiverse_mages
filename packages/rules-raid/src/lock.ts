/*
 * Multiverse Mages — the ruleset may change mid-raid, and every change locks.
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
 * `docs/design/raid-engagement.md` §1, which **repeals** the vision's
 * *"a raid in progress is frozen policy"* and replaces it with:
 *
 * > The ruleset may be changed during a raid, and every change locks until the
 * > raid ends. A cell forbidden mid-raid cannot be permitted again while the
 * > raid runs. A cell permitted mid-raid cannot be forbidden again.
 *
 * ## The lock is the whole design
 *
 * Without it, a mid-raid rule change is a reaction knob and the correct play is
 * to counter whatever you last saw. With it, every change is a commitment made
 * under uncertainty, which is the thing a strategy game is made of. So the lock
 * is not a rate limit bolted onto a verb — it is the reason the verb exists, and
 * it is enforced here before anything else is checked.
 *
 * ## What the repeal costs, stated rather than buried
 *
 * Two module notes elsewhere in this repository say the host ruleset is frozen
 * for a raid's duration and that the legal-node mask therefore never needs
 * recomputing. **Both were true and are now false by design.** They have been
 * amended in place — see `arbitration.ts` — rather than left to be read as an
 * invariant this file violates. What survives unchanged is the property those
 * notes were actually protecting: arbitration reads a *snapshot*, never a live
 * universe, and `permits()` is called from exactly one file. A mid-raid change
 * replaces the snapshot through one method on the arbiter; it does not open a
 * channel from world state into a running raid.
 *
 * ## Why the mask must be recomputed and not merely re-checked
 *
 * `raid.ts`'s `firstCastableNode` carries a warning written from an observed
 * failure: a combatant that keeps *selecting* a node the arbiter will refuse
 * declares a cast every tick, is refused every tick, and — because a declared
 * cast carries no movement goal — stands still for the rest of the raid. Two
 * spells thrown, then two thousand ticks of nobody moving.
 *
 * A mid-raid forbid that only amended the snapshot would reproduce that exactly,
 * and it would do it to the *defender's own* combatants, which is the sharpest
 * case in the design. So {@link applyRuleChange} amends the snapshot and
 * recomputes every affected combatant's mask in the same call, atomically. The
 * 0.9.0 invariant survives with it: `forbiddenCastsBlocked` stays zero in normal
 * operation, because layer 1 is brought back into agreement with layer 2 rather
 * than being left behind it.
 *
 * ## What a mid-raid change does *not* touch
 *
 * **Preparation.** A Vancian defender who memorised four spells at dawn and
 * whose god forbids one of their cells at noon does not get a replacement slot,
 * and a newly-permitted cell does not appear in her readied list. She prepared
 * what she prepared. `firstCastableNode` already intersects the readied list
 * with the mask on every tick, so a forbidden preparation is simply unusable —
 * which is the honest outcome, and it is where the design's *"your own
 * combatants lose Perdo for the duration"* actually bites.
 *
 * **Possession.** `contracts.md` §1.1 gates casting and never holding. Nothing
 * here deletes an instance, at either scale.
 */

import type { ContentId } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import type { RuleChange } from '@mm/state';
import { changesLegality, ruleTargetInRange, rulesetWith } from '@mm/state';
import { MASTERY_ACTIVATION_THRESHOLD } from '@mm/rules-magic';

import type { CastArbiter, HeldInstance } from './arbitration.js';
import type { CombatantBrief } from './combatants.js';

/** The mastery at which a held instance starts contributing. `rules-magic` owns it. */
const CASTABLE_MASTERY = MASTERY_ACTIVATION_THRESHOLD;

/**
 * Why a mid-raid rule change did nothing. `''` means it was applied.
 *
 * The arithmetic itself is not here. `@mm/state`'s `rulesetWith`,
 * `changesLegality` and `ruleTargetInRange` own it, beside `permits()`, because
 * edict precedence must have exactly one implementation and a function that
 * *produces* a ruleset needs the same precedence one that reads it does. What
 * this module owns is the **lock** and the mask recompute — the two things that
 * are about a raid rather than about a ruleset.
 */
export type LockRefusal =
  | ''
  /**
   * This scope and target were already changed in this raid. **The design's
   * central rule**: forbid something and you cannot permit it again while the
   * raid runs, and vice versa.
   */
  | 'locked'
  /** The target is not a technique bit, a form bit, or a cell id. */
  | 'out-of-range'
  /** The ruleset already says this, so there is nothing to commit to. */
  | 'not-a-change';

/** One change the lock is holding, with what it cost to make. */
export interface LockedChange extends RuleChange {
  /** The engagement tick it was made on. */
  readonly atTick: number;
  /** What the player paid for it, in the currency their side spends. */
  readonly paidCost: Fixed;
}

/**
 * Which scopes and targets a raid has already changed.
 *
 * Keyed on `(scope, targetId)` rather than on the direction, because the lock is
 * about the *knob* and not about which way it was turned. A god who forbids
 * `perdo` has spent the perdo knob for the raid; that the reverse would have
 * been a permit is exactly what the lock exists to refuse.
 */
export class RaidLock {
  readonly #taken = new Map<number, LockedChange>();

  /** A total, collision-free key. Cell ids reach 70; axis bits reach 19. */
  static keyOf(scope: number, targetId: number): number {
    return scope * 1024 + targetId;
  }

  /** Whether this scope and target are already spent for the raid. */
  holds(scope: number, targetId: number): boolean {
    return this.#taken.has(RaidLock.keyOf(scope, targetId));
  }

  /** Records a change. The caller has already checked {@link holds}. */
  take(change: LockedChange): void {
    this.#taken.set(RaidLock.keyOf(change.scope, change.targetId), change);
  }

  /**
   * Every change this raid locked, in the order the design reports them:
   * ascending scope, then ascending target. Insertion order would make the
   * outcome record depend on the order a player happened to click, which is a
   * diff two replays of the same decisions could disagree about.
   */
  changes(): readonly LockedChange[] {
    return [...this.#taken.values()].sort(
      (a, b) => a.scope - b.scope || a.targetId - b.targetId,
    );
  }

  get size(): number {
    return this.#taken.size;
  }
}

// ---------------------------------------------------------------------------
// Applying a change to a running raid.
// ---------------------------------------------------------------------------

/**
 * What one attempt to change the ruleset mid-raid did.
 *
 * `nodesUnmade` and `nodesRestored` are the change's own report, and they are
 * the reason this returns a record rather than a boolean. A god who forbids a
 * technique to protect a library needs to be told, in the moment, how many of
 * her **own** defenders' spells she just switched off — that is the whole of the
 * decision the design is asking her to make, and a mechanic nobody can observe
 * has repeatedly turned out to be doing nothing here.
 */
export interface RuleChangeResult {
  readonly applied: boolean;
  readonly refusal: LockRefusal;
  /** Nodes on the field that stopped being castable, ascending. Both sides. */
  readonly nodesUnmade: readonly ContentId[];
  /** Nodes on the field that became castable, ascending. Both sides. */
  readonly nodesRestored: readonly ContentId[];
  /** Combatants whose mask moved, by side: `[attacker, defender]`. */
  readonly combatantsAffected: readonly [number, number];
}

const NOTHING: RuleChangeResult = Object.freeze({
  applied: false,
  refusal: '' as LockRefusal,
  nodesUnmade: Object.freeze([]),
  nodesRestored: Object.freeze([]),
  combatantsAffected: Object.freeze([0, 0]) as unknown as readonly [number, number],
});

function refused(refusal: Exclude<LockRefusal, ''>): RuleChangeResult {
  return { ...NOTHING, refusal };
}

/** One combatant, as the recompute needs to see it. */
export interface MaskSubject {
  readonly brief: CombatantBrief;
  readonly held: readonly HeldInstance[];
}

/** Everything {@link applyRuleChange} needs, and deliberately no `Raid`. */
export interface RuleChangeContext {
  readonly arbiter: CastArbiter;
  readonly lock: RaidLock;
  readonly change: RuleChange;
  /** What the player paid, in the currency their side spends. */
  readonly paidCost: Fixed;
  /** The engagement tick this was decided on. */
  readonly atTick: number;
  /** Every mage combatant on the field, with what she holds. */
  readonly subjects: readonly MaskSubject[];
  /** `combatant-base-concealment`. */
  readonly baseConcealment: Fixed;
  /** Writes the recomputed passive concealment back onto the §1.6 row. */
  readonly setConcealment: (brief: CombatantBrief, value: Fixed) => void;
}

/**
 * Applies a rule change to a running raid, or refuses it, atomically.
 *
 * The order is the design's and it is not interchangeable:
 *
 * 1. **The lock first.** A locked knob is refused before the change is even
 *    examined, because the lock is about the knob and not about the change.
 * 2. **Range, then reality.** A change that moves nothing is refused rather
 *    than charged, for the reason `axisPlan` refuses a no-op toggle at world
 *    scale: it would spend an irreversible lock on nothing and charge for it.
 * 3. **Snapshot and masks together.** See this module's opening note.
 */
export function applyRuleChange(context: RuleChangeContext): RuleChangeResult {
  const { arbiter, lock, change } = context;

  if (lock.holds(change.scope, change.targetId)) return refused('locked');
  if (!ruleTargetInRange(change)) return refused('out-of-range');

  const before = arbiter.hostRuleset;
  if (!changesLegality(before, change)) return refused('not-a-change');

  arbiter.adoptRuleset(rulesetWith(before, change));

  // ---- The mask recompute, and the report that comes out of it. ----
  const unmade = new Set<ContentId>();
  const restored = new Set<ContentId>();
  const affected: [number, number] = [0, 0];

  for (const subject of context.subjects) {
    const { brief } = subject;
    const previous = brief.legalNodes;
    const next = arbiter.legalNodeMask(subject.held, CASTABLE_MASTERY);

    let moved = false;
    for (const nodeId of previous) {
      if (!next.has(nodeId)) {
        unmade.add(nodeId);
        moved = true;
      }
    }
    for (const nodeId of next) {
      if (!previous.has(nodeId)) {
        restored.add(nodeId);
        moved = true;
      }
    }
    if (moved) affected[brief.side] += 1;

    brief.legalNodes = next;

    // Passive defences are legality-filtered too, so a forbidden ward stops
    // warding. Recomputed from the same held set, through the same arbiter
    // method the deployment used — a second formula here would be a second
    // place a forbidden cell could quietly stay live.
    const defences = arbiter.passiveDefences(subject.held, CASTABLE_MASTERY, context.baseConcealment);
    brief.wardSources = defences.ward > 0 ? [defences.ward] : [];
    context.setConcealment(brief, defences.concealment);
  }

  lock.take({ ...change, atTick: context.atTick, paidCost: context.paidCost });

  return {
    applied: true,
    refusal: '',
    nodesUnmade: [...unmade].sort((a, b) => a - b),
    nodesRestored: [...restored].sort((a, b) => a - b),
    combatantsAffected: affected,
  };
}
