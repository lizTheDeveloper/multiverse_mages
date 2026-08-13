/*
 * Multiverse Mages — what a cast is, and where concealment lives.
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
 * `firstCastableNode` filtered candidates on `direct-damage` alone. The safety
 * check was right and its test was too narrow by four primitives: `area-denial`,
 * `blink` and `summon` are all things `resolveOneCast` places, so a node
 * carrying one of them and no damage was refused a candidacy it would have
 * honoured.
 *
 * Both halves are pinned below, because a change that made all seven combat
 * primitives castable would pass a test that only checked the three. The second
 * describe block is the one that keeps being rediscovered: `concealment` has no
 * cast form and no world-scale implementation, and a test is a cheaper way of
 * recording that than another investigation.
 */

import { describe, expect, it } from 'vitest';

import { CastArbiter } from '@mm/rules-raid';

import { grid, nodeId, registry, ruleset, tuning } from './raid-fixture.js';

function arbiterFor(): CastArbiter {
  return new CastArbiter({ hostRuleset: ruleset({}), grid, registry, tuning });
}

describe('what a cast is, after the selector stopped asking only about damage', () => {
  it.each([
    ['pm-blunt-the-edge', 'direct-damage'],
    ['pt-open-the-ground', 'area-denial'],
    ['rl-step-across', 'blink'],
    ['rn-call-by-name', 'summon'],
  ])('%s places %s on the field', (node) => {
    expect(arbiterFor().castProfile(nodeId(node)).placesEffects).toBe(true);
  });

  it.each([
    ['rl-hold-the-door', 'ward — passive, read once at portal open'],
    ['rn-keep-the-name-close', 'concealment — passive, and the same reason'],
    ['im-read-the-surface', 'knowledge-steal — the theft intent owns it'],
    ['rl-open-the-portal', 'portal — a gate on raiding, not a thing released in a field'],
  ])('%s stays uncastable: %s', (node) => {
    // The negative half, and it is the half a careless fix breaks. A combatant
    // who selects one of these declares a cast, pays for it, and changes
    // nothing — precisely the failure the filter exists to prevent, arriving
    // through a resolution instead of a refusal.
    expect(arbiterFor().castProfile(nodeId(node)).placesEffects).toBe(false);
  });

  it('needs a target only for damage', () => {
    const arbiter = arbiterFor();
    expect(arbiter.castProfile(nodeId('pm-blunt-the-edge')).requiresTarget).toBe(true);
    expect(arbiter.castProfile(nodeId('rn-call-by-name')).requiresTarget).toBe(false);
    expect(arbiter.castProfile(nodeId('pt-open-the-ground')).requiresTarget).toBe(false);
  });

  it('marks a summon-only node, and does not mark one that also damages', () => {
    const arbiter = arbiterFor();
    expect(arbiter.castProfile(nodeId('rn-call-by-name')).summonOnly).toBe(true);
    // `rn-the-bound-servant` carries `summon` beside `knowledge-steal`, and is
    // still summon-only as far as the *field* is concerned: theft is not
    // something `resolveOneCast` places, so at the summon cap this node would
    // also spend vigor for nothing.
    expect(arbiter.castProfile(nodeId('rn-the-bound-servant')).summonOnly).toBe(true);
    // And the case that must not be declined at the cap: a node that damages as
    // well still has work to do when no summon can be created.
    expect(arbiter.castProfile(nodeId('pl-nothing-holds')).summonOnly).toBe(false);
    expect(arbiter.castProfile(nodeId('pl-nothing-holds')).placesEffects).toBe(true);
  });

  it('agrees with the applier about a world primitive, which places nothing', () => {
    // `it-taste-the-soil` is `resource-yield`, a world primitive. §3's scale
    // column says a world primitive on a node cast in an engagement does
    // nothing, and the profile has to agree or the selector will offer it.
    expect(arbiterFor().castProfile(nodeId('it-taste-the-soil')).placesEffects).toBe(false);
  });
});

/**
 * `concealment` is a raid-scale primitive and nothing else, whatever
 * `primitive.json` says.
 *
 * The record declares `"scale": "both"`, and the world half has never been
 * built: there is no screening, detection, surveillance or population-security
 * subsystem anywhere outside `packages/rules-raid`, and `concealment`'s only
 * consumer is the evasion roll in `arbitration.ts`. Anything proposing to make a
 * ruleset choice change how well a universe *sees* would therefore be inventing
 * a world-scale subsystem rather than modifying one.
 *
 * Pinned as a test rather than written in a comment because the declaration and
 * the implementation disagree, and a disagreement recorded only in prose is a
 * disagreement that gets rediscovered.
 */
describe('concealment is raid-scale only, whatever its record declares', () => {
  it('declares both scales in content', () => {
    const record = registry.primitives.find((entry) => entry.record.id === 'concealment');
    expect(record?.record.scale).toBe('both');
  });

  it('has no cast form: of 48 carriers, the 3 castable ones are castable for something else', () => {
    const arbiter = arbiterFor();
    const carriers = registry.nodes.filter((entry) =>
      entry.record.effects.some((effect) => effect.primitive === 'concealment'),
    );
    expect(carriers.length).toBe(48);

    const castable = carriers.filter((entry) => arbiter.castProfile(entry.contentId).placesEffects);
    // Three, and all three in Umbra — `cu-the-unlit-hall` and `ru-the-held-dark`
    // pair concealment with `area-denial`, `mu-trade-shadows` with `blink`.
    // They became castable with this change, and none of them became castable
    // *for its concealment*: `#effectsOf` does not put concealment on the field,
    // so what the cast places is the field or the displacement and the
    // concealment stays exactly what it was — a passive value read at portal
    // open. That is the distinction this whole block exists to record.
    expect(castable.map((entry) => entry.record.id).sort()).toEqual([
      'cu-the-unlit-hall',
      'mu-trade-shadows',
      'ru-the-held-dark',
    ]);
    for (const entry of castable) {
      const placed = entry.record.effects
        .map((effect) => effect.primitive)
        .filter((id) => id === 'area-denial' || id === 'blink');
      expect(placed.length).toBeGreaterThan(0);
    }
  });

  it('reaches the field only as a passive defence, gated by the host ruleset', () => {
    // The one live path. `passiveDefences` is what puts a number on a
    // combatant, and it asks `permits()` per instance — so a raider's
    // concealment is dormant in a sky that forbids its cell. That, and the
    // evasion roll it feeds, is the whole of what `concealment` currently does.
    const defences = arbiterFor().passiveDefences(
      [{ nodeId: nodeId('rn-keep-the-name-close'), locationKind: 1, mastery: 1024 }],
      1024,
      0,
    );
    expect(defences.concealment).toBeGreaterThan(0);

    const forbidding = new CastArbiter({
      hostRuleset: ruleset({ permittedForms: 0 }),
      grid,
      registry,
      tuning,
    });
    expect(
      forbidding.passiveDefences(
        [{ nodeId: nodeId('rn-keep-the-name-close'), locationKind: 1, mastery: 1024 }],
        1024,
        0,
      ).concealment,
    ).toBe(0);
  });
});
