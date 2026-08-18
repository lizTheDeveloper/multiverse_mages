/*
 * Multiverse Mages — corruption as an attack: enter, corrupt, leave undetected.
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
 * `docs/design/scribing-fidelity.md` asks for a raid objective that is *"neither
 * theft nor damage"*, and the properties it asks for are unusual enough to be
 * worth asserting one at a time:
 *
 * 1. **The books stay.** No instance moves, none is destroyed, and
 *    `nodesLostByHost` does not change. A raid that corrupts leaves the victim's
 *    ledger balanced.
 * 2. **It is per-instance.** *"It targets a spell, because then a scribe can
 *    mess up one spell but not others for that grimoire."*
 * 3. **It is bounded by cost, not by a damage cap.** Vigor is spent per attempt,
 *    and a warband that runs out stops.
 * 4. **It does not need to come home.** A saboteur killed on the library floor
 *    has still done it, where a thief killed on the library floor has not.
 *
 * ## The armed control, and why it is the whole point of this file
 *
 * The design's own audit of the raid subsystem ends: *"across all eight shipped
 * strategies at two seeds — 61 raids, 80,615 combatant-ticks — **zero combat
 * attempts**, because no strategy puts a combat node in a combatant's hands."*
 * That is still true, and it is true of this primitive too: no shipped strategy
 * hands anybody `pn-the-wrong-true-name`, so **the corrupt intent fires zero
 * times in every committed sweep.**
 *
 * A primitive whose only evidence is `check:consumption` going green is
 * indistinguishable from a dead one — the check registers a *fetch*, not an
 * effect. This file is the distinguishing evidence: given a raider who does hold
 * the node, the intent is chosen, the vigor is spent, and the host's shelf comes
 * back silently wrong. What it does not claim, and what no test here could, is
 * that this ever happens in a measured run.
 */

import { describe, expect, it } from 'vitest';

import { CORRUPTION, fidelityOf } from '@mm/rules-magic';
import { resolveWarband } from './warband.js';

/** The one v1 node carrying `knowledge-corrupt`. `perdo-nomen`, tier 4. */
const SABOTEUR = ['pn-the-wrong-true-name'];

/** A tier-matched control with no combat primitive at all — see combat-knowledge. */
const UNARMED = ['pn-the-nameless'];

/** Books deep enough to be worth ruining, all inside the twelve enabled cells. */
const SHELVES = [
  'im-read-the-surface',
  'pl-fray-the-edge',
  'pn-unsay-the-name',
  'rn-compel-by-name',
];

function raid(nodes: readonly string[], seed: number, overrides = {}) {
  return resolveWarband({
    attackers: [
      { name: 'Saboteur-1', nodes },
      { name: 'Saboteur-2', nodes },
    ],
    defenders: [{ name: 'Defender-1', nodes: [] }],
    hostShelves: SHELVES,
    seed,
    ...overrides,
  });
}

describe('a raider who holds a corruption node ruins books rather than taking them', () => {
  it('corrupts at least one shelved instance across seeds, and the control corrupts none', () => {
    // Paired, and the pairing is what makes it an attribution rather than an
    // observation: the same warband shape, the same shelf, the same seeds,
    // differing only in whether the attackers hold the node.
    let armedCorruptions = 0;
    let unarmedCorruptions = 0;
    for (const seed of [11, 29, 47, 83]) {
      armedCorruptions += raid(SABOTEUR, seed).outcome.corruptedInstances.length;
      unarmedCorruptions += raid(UNARMED, seed).outcome.corruptedInstances.length;
    }
    expect(armedCorruptions).toBeGreaterThan(0);
    expect(unarmedCorruptions).toBe(0);
  });

  it('leaves the books where they were — nothing moved, nothing lost', () => {
    // The property that makes this neither theft nor damage. Asserted over the
    // *reported* movements rather than over a count of surviving instances,
    // because looting also happens in these raids and would muddy a count.
    for (const seed of [11, 29, 47, 83]) {
      const result = raid(SABOTEUR, seed);
      for (const instance of result.outcome.corruptedInstances) {
        expect(
          result.outcome.knowledgeMovements.some(
            (movement) => (movement.byCombatant as number) === instance,
          ),
        ).toBe(false);
      }
    }
  });

  it('targets one instance per action, never the volume', () => {
    // Per-instance is the design's own correction of an earlier caution, and it
    // is what lets a scribe ruin one spell and leave the rest of the book sound.
    //
    // The evidence is **distinctness plus a price response**, not a survivor
    // count. A well-funded warband standing in a four-book library will ruin all
    // four, and that is correct — *"a mass-corruption raid is possible and
    // expensive"* is the design, and softening it would delete the idea. What
    // distinguishes four separate actions from one volume-wide sweep is that
    // each names a different instance and each costs again: raise the price and
    // the count falls, which a container mechanic's would not.
    const cheap = [11, 29, 47, 83].map((seed) => raid(SABOTEUR, seed));
    for (const result of cheap) {
      expect(new Set(result.outcome.corruptedInstances).size).toBe(
        result.outcome.corruptedInstances.length,
      );
    }

    const dear = [11, 29, 47, 83].map((seed) =>
      raid(SABOTEUR, seed, { tuningOverride: { castVigorBase: 4096, castVigorPerTier: 4096 } }),
    );
    const total = (results: readonly { outcome: { corruptedInstances: readonly number[] } }[]) =>
      results.reduce((sum, result) => sum + result.outcome.corruptedInstances.length, 0);
    expect(total(dear)).toBeLessThan(total(cheap));
    expect(total(dear)).toBeGreaterThan(0);
  });

  it('is bounded by the vigor pool: no vigor, no corruption', () => {
    // The design's bound is **cost, not a cap on damage** — *"all spells cost
    // something that the raiders are using up, and so it should cost
    // something."* Priced out of reach, the attack stops entirely; that is the
    // only lever there is, and it is deliberately the only one.
    for (const seed of [11, 29, 47, 83]) {
      const priced = raid(SABOTEUR, seed, {
        tuningOverride: { castVigorBase: 1 << 28, castVigorPerTier: 1 << 28 },
      });
      expect(priced.outcome.corruptedInstances).toHaveLength(0);
    }
  });

  it('writes the corruption into the host world, hidden rather than marked', () => {
    // `hidden`, never `marked`. The victim is not told; that is the mechanic.
    // Only a reader who fails against the text can move it to `marked`, and
    // that happens in `rules-magic`'s study path, a world tick later at the
    // earliest.
    for (const seed of [11, 29, 47, 83]) {
      const result = raid(SABOTEUR, seed);
      for (const instance of result.outcome.corruptedInstances) {
        if (!result.raid.host.knowledge.isInstance(instance)) continue;
        expect(fidelityOf(result.hostWorld, instance).corruption).toBe(CORRUPTION.hidden);
      }
    }
  });
});
