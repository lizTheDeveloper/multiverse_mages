/*
 * Multiverse Mages — target selection is a utility score, and these are the
 * four things vision §7 says it is shaped by.
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
 * Every assertion here is about **behaviour at the seam a mage's choice comes
 * out of** — `chooseTarget` — rather than about the arithmetic inside a term.
 *
 * The measurement that produced this file
 * (`docs/design/strategy-dimensionality.md`) found the strategy space had one
 * effective dimension because `compareTargets` ordered candidates by
 * `remainingCost` then `nodeId`, and in the v1 content set `researchCost` is a
 * pure function of tier. So the tests that matter are the ones that would still
 * have passed under the old code if the new code were merely *decorated* with
 * species and role: two outlooks differing in exactly one of §7's four inputs
 * must choose **different nodes from the same candidate list**.
 */

import { describe, expect, it } from 'vitest';
import { MAGE_ROLE } from '@mm/state';
import type { MageRoleValue } from '@mm/state';

import {
  TARGET_TERM_KINDS,
  chooseTarget,
  compareTargets,
  readTargetAppeal,
  targetAppeal,
} from '../../src/index.js';
import { GOAL } from '../../src/index.js';

import { shippedRegistry } from './mage-fixtures.js';
import { affinitiesOf, outlook, speciesNamed, target } from './autonomy-fixtures.js';

const registry = shippedRegistry();
const weights = readTargetAppeal(registry);

/** The interned id of a primitive, by its authored name. */
function primitive(id: string): number {
  const found = registry.primitives.find((entry) => entry.record.id === id);
  if (found === undefined) throw new Error(`no primitive "${id}"`);
  return found.contentId;
}

/** The interned id of a cell, by its authored name. */
function cell(id: string): number {
  return registry.intern('cell', id);
}

/** The interned id of a form, by its authored name. */
function form(id: string): number {
  return registry.intern('form', id);
}

describe('target selection is shaped by the standing role', () => {
  it('a warden and a raider choose different nodes from one candidate list', () => {
    // Same tier, same cost, adjacent ids: under the old cost-then-id order both
    // mages take node 10, whatever else is true about them.
    const candidates = [
      target(10, 2, 4096, { primitives: [primitive('ward')] }),
      target(11, 2, 4096, { primitives: [primitive('direct-damage')] }),
    ];
    const warden = outlook({
      roleId: MAGE_ROLE.warden as MageRoleValue,
      discoveryTargets: candidates,
    });
    const raider = outlook({
      roleId: MAGE_ROLE.raider as MageRoleValue,
      discoveryTargets: candidates,
    });

    expect(chooseTarget(GOAL.researchNode, warden, weights)).toBe(10);
    expect(chooseTarget(GOAL.researchNode, raider, weights)).toBe(11);
    // And the old order really would have tied them, so the difference is the
    // role and not the fixture.
    expect(compareTargets(candidates[0]!, candidates[1]!)).toBeLessThan(0);
  });

  it('a role does not make a mage cost-blind', () => {
    // Two nodes the raider values identically. Vision §7 is "you set the role;
    // they decide everything else" — the role says *what kind*, and everything
    // else still says *which one*, so the cheaper of two equally-loved nodes
    // wins.
    const candidates = [
      target(10, 1, 2048, { primitives: [primitive('direct-damage')] }),
      target(11, 4, 16384, { primitives: [primitive('direct-damage')] }),
    ];
    const raider = outlook({
      roleId: MAGE_ROLE.raider as MageRoleValue,
      discoveryTargets: candidates,
    });
    expect(chooseTarget(GOAL.researchNode, raider, weights)).toBe(10);
  });

  it('the role term is bounded, whatever a node declares', () => {
    // Three effects the raider loves, summing past the bound. The bound is what
    // the loader checks against the sum of the other five, so a term that could
    // exceed it would make that check a statement about nothing.
    const loaded = target(10, 1, 2048, {
      primitives: [primitive('direct-damage'), primitive('knowledge-steal'), primitive('portal')],
    });
    const raider = outlook({ roleId: MAGE_ROLE.raider as MageRoleValue });
    expect(targetAppeal(loaded, raider, weights).terms.role).toBe(weights.bound.role);
  });
});

describe('target selection is shaped by species', () => {
  it('the authored affinities table reorders a candidate list', () => {
    const candidates = [
      target(10, 2, 4096, { cellId: cell('rego-mentem'), formId: form('mentem') }),
      target(11, 2, 4096, { cellId: cell('rego-terram'), formId: form('terram') }),
    ];
    const elf = outlook({
      species: speciesNamed('elf'),
      affinities: affinitiesOf('elf'),
      discoveryTargets: candidates,
    });
    const dwarf = outlook({
      species: speciesNamed('dwarf'),
      affinities: affinitiesOf('dwarf'),
      discoveryTargets: candidates,
    });

    // Elf declares mentem 1280; dwarf declares terram 1536. Neither declares
    // the other's form, and both lists are otherwise identical.
    expect(chooseTarget(GOAL.researchNode, elf, weights)).toBe(10);
    expect(chooseTarget(GOAL.researchNode, dwarf, weights)).toBe(11);
  });

  it('gnome and human share a depth ceiling and still order the same list differently', () => {
    // The confirming test of `strategy-dimensionality.md` §5, inverted. Gnome
    // and human both have depthCeiling 4 and neither declares an affinity for
    // any v1 form, so if they still agree here nothing in this change can ever
    // separate them.
    const candidates = [
      target(10, 1, 2048, { cellId: cell('rego-limen'), formId: form('limen') }),
      target(11, 4, 16384, { cellId: cell('rego-limen'), formId: form('limen') }),
    ];
    const gnome = outlook({
      species: speciesNamed('gnome'),
      affinities: affinitiesOf('gnome'),
      discoveryTargets: candidates,
    });
    const human = outlook({
      species: speciesNamed('human'),
      affinities: affinitiesOf('human'),
      discoveryTargets: candidates,
    });

    expect(chooseTarget(GOAL.researchNode, gnome, weights)).not.toBe(
      chooseTarget(GOAL.researchNode, human, weights),
    );
  });
});

describe('target selection is shaped by age and by personality', () => {
  // One tier apart, at the authored v1 costs for those tiers. One tier is the
  // smallest step the content set has, so a term that moves a choice across it
  // is a term that can move a choice at all.
  const deepAndShallow = [
    target(10, 1, 2048, { cellId: cell('rego-limen'), formId: form('limen') }),
    target(11, 2, 4096, { cellId: cell('rego-limen'), formId: form('limen') }),
  ];

  it('a young and a senescent mage of one species disagree', () => {
    const base = {
      species: speciesNamed('elf'),
      affinities: affinitiesOf('elf'),
      discoveryTargets: deepAndShallow,
    };
    const young = outlook({ ...base, normalizedAge: 64 });
    const senescent = outlook({ ...base, normalizedAge: 1000 });
    expect(chooseTarget(GOAL.researchNode, young, weights)).not.toBe(
      chooseTarget(GOAL.researchNode, senescent, weights),
    );
  });

  it('ambition and caution pull opposite ways on the same list', () => {
    const base = {
      species: speciesNamed('elf'),
      affinities: affinitiesOf('elf'),
      discoveryTargets: deepAndShallow,
    };
    const ambitious = outlook({
      ...base,
      personality: { curiosity: 1024, ambition: 1280, caution: 768 },
    });
    const cautious = outlook({
      ...base,
      personality: { curiosity: 1024, ambition: 768, caution: 1280 },
    });
    expect(chooseTarget(GOAL.researchNode, ambitious, weights)).not.toBe(
      chooseTarget(GOAL.researchNode, cautious, weights),
    );
  });
});

describe("target selection is shaped by the god's emphasis", () => {
  /** A live emphasis on one cell, at a stated magnitude. */
  function emphasisOn(cellId: number, magnitude: number): ReadonlyMap<number, number> {
    return new Map([[cellId, magnitude]]);
  }

  it('an encouraged cell is chosen sooner, not merely researched faster', () => {
    // Same tier, same cost, adjacent ids: under the cost-then-id order the mage
    // takes node 10 in every universe, which is the whole of the finding this
    // term exists to break. `docs/design/strategy-dimensionality.md`: "a mage's
    // utility function never asks what a node is worth to hold - only what it
    // costs."
    const candidates = [
      target(10, 2, 4096, { cellId: cell('rego-mentem'), formId: form('mentem') }),
      target(11, 2, 4096, { cellId: cell('rego-terram'), formId: form('terram') }),
    ];
    const silent = outlook({ discoveryTargets: candidates });
    const encouraged = outlook({
      discoveryTargets: candidates,
      emphasis: emphasisOn(cell('rego-terram'), 256),
    });

    expect(chooseTarget(GOAL.researchNode, silent, weights)).toBe(10);
    expect(chooseTarget(GOAL.researchNode, encouraged, weights)).toBe(11);
    // And the tie-break really would have taken 10, so the difference is the
    // god's instruction and not the fixture.
    expect(compareTargets(candidates[0]!, candidates[1]!)).toBeLessThan(0);
  });

  it('reorders across depth, and not across all of it', () => {
    // Against the effort divisor of 64, a full emphasis of fp(256) is worth
    // fp(16384) of remaining cost - two tiers of the v1 cost ladder, which
    // doubles every tier from 2048. So an encouraged tier-3 node beats an
    // unencouraged tier-1 one, and an encouraged tier-5 node does not.
    const cheap = target(10, 1, 2048, { cellId: cell('rego-mentem') });
    const middling = target(11, 3, 8192, { cellId: cell('rego-terram') });
    const deepest = target(12, 5, 32768, { cellId: cell('rego-terram') });
    const mage = (targets: readonly ReturnType<typeof target>[]) =>
      outlook({
        discoveryTargets: targets,
        emphasis: emphasisOn(cell('rego-terram'), 256),
      });

    expect(chooseTarget(GOAL.researchNode, mage([cheap, middling]), weights)).toBe(11);
    expect(chooseTarget(GOAL.researchNode, mage([cheap, deepest]), weights)).toBe(10);
  });

  it('a cell nobody encouraged carries no instruction rather than a penalty', () => {
    const candidate = target(10, 2, 4096, { cellId: cell('rego-mentem') });
    const elsewhere = outlook({ emphasis: emphasisOn(cell('rego-terram'), 256) });
    const silent = outlook();
    expect(targetAppeal(candidate, elsewhere, weights).terms.emphasis).toBe(0);
    expect(targetAppeal(candidate, elsewhere, weights).appeal).toBe(
      targetAppeal(candidate, silent, weights).appeal,
    );
  });

  it('decays with the encouragement rather than holding until it lapses', () => {
    // `emphasisAt` is (expiry - now) x decay, so a half-spent encouragement is
    // worth half. The term reads that magnitude directly, which is what makes
    // the god's instruction fade instead of switching off.
    const candidate = target(10, 2, 4096, { cellId: cell('rego-terram') });
    const fresh = outlook({ emphasis: emphasisOn(cell('rego-terram'), 256) });
    const fading = outlook({ emphasis: emphasisOn(cell('rego-terram'), 128) });
    const lapsed = outlook({ emphasis: emphasisOn(cell('rego-terram'), 0) });
    expect(targetAppeal(candidate, fresh, weights).terms.emphasis).toBe(256);
    expect(targetAppeal(candidate, fading, weights).terms.emphasis).toBe(128);
    expect(targetAppeal(candidate, lapsed, weights).terms.emphasis).toBe(0);
  });

  it('is bounded, whatever magnitude reaches it', () => {
    // The bound is what the loader checks against the five mage-owned bounds, so
    // a term that could exceed it would make that check a statement about
    // nothing - the same argument the role term's bound test makes.
    const candidate = target(10, 2, 4096, { cellId: cell('rego-terram') });
    const shouting = outlook({ emphasis: emphasisOn(cell('rego-terram'), 1_000_000) });
    expect(targetAppeal(candidate, shouting, weights).terms.emphasis).toBe(
      weights.bound.emphasis,
    );
  });

  it('cannot outvote a mage whose own terms all point the other way', () => {
    // The invariant, exercised rather than asserted about the table: an
    // encouraged node that every mage-owned term dislikes still loses. Vision §7:
    // "You set the role; they decide everything else. You never issue direct
    // orders."
    const encouraged = target(10, 5, 32768, {
      cellId: cell('rego-terram'),
      formId: form('terram'),
      primitives: [primitive('direct-damage')],
    });
    const plain = target(11, 1, 2048, {
      cellId: cell('rego-mentem'),
      formId: form('mentem'),
      primitives: [primitive('ward')],
    });
    const warden = outlook({
      // Senescent, cautious, incurious, and a warden: five terms against.
      species: speciesNamed('human'),
      roleId: MAGE_ROLE.warden as MageRoleValue,
      normalizedAge: 960,
      personality: { curiosity: 1024, ambition: 768, caution: 1280 },
      discoveryTargets: [encouraged, plain],
      emphasis: emphasisOn(cell('rego-terram'), 256),
    });
    expect(chooseTarget(GOAL.researchNode, warden, weights)).toBe(11);
  });
});

describe('the order stays total and deterministic', () => {
  it('equal appeal falls to cost and then to node id', () => {
    // Two nodes indistinguishable in everything the score reads.
    const candidates = [target(21, 2, 4096), target(20, 2, 4096)];
    const mage = outlook({ discoveryTargets: candidates });
    expect(chooseTarget(GOAL.researchNode, mage, weights)).toBe(20);
  });

  it('scoring the same target twice returns the same number', () => {
    const candidate = target(10, 3, 8192, {
      cellId: cell('rego-terram'),
      formId: form('terram'),
      primitives: [primitive('build-rate'), primitive('resource-yield')],
    });
    const mage = outlook({ species: speciesNamed('dwarf'), affinities: affinitiesOf('dwarf') });
    const first = targetAppeal(candidate, mage, weights);
    const second = targetAppeal(candidate, mage, weights);
    expect(first.appeal).toBe(second.appeal);
    expect(Number.isInteger(first.appeal)).toBe(true);
  });

  it('every term is ablatable, and ablating one leaves the other six', () => {
    const candidate = target(10, 3, 8192, {
      cellId: cell('rego-terram'),
      formId: form('terram'),
      primitives: [primitive('ward')],
    });
    const mage = outlook({
      species: speciesNamed('dwarf'),
      affinities: affinitiesOf('dwarf'),
      roleId: MAGE_ROLE.warden as MageRoleValue,
      normalizedAge: 64,
      personality: { curiosity: 1024, ambition: 1280, caution: 768 },
    });
    const full = targetAppeal(candidate, mage, weights);
    for (const kind of TARGET_TERM_KINDS) {
      const ablated = targetAppeal(candidate, mage, weights, { ablate: kind });
      expect(ablated.terms[kind]).toBe(0);
      expect(ablated.appeal).toBe(full.appeal - full.terms[kind]);
    }
  });

  it('an empty candidate list still yields the null content id', () => {
    expect(chooseTarget(GOAL.researchNode, outlook(), weights)).toBe(0);
    expect(chooseTarget(GOAL.idle, outlook(), weights)).toBe(0);
  });
});

describe('the weight table is read from content, never from a literal', () => {
  it('every scalar the score reads is declared in autonomy-weight.json', () => {
    expect(weights.effortDivisor).toBeGreaterThan(0);
    expect(weights.ceiling).toBeGreaterThanOrEqual(
      TARGET_TERM_KINDS.reduce((sum, kind) => sum + weights.bound[kind], 0),
    );
  });

  it('the role bound cannot outvote the five mage-owned terms at their extremes', () => {
    expect(weights.bound.role).toBeLessThan(mageOwnedBounds());
  });

  // The same check, for the second term the god writes. It is against the same
  // five and deliberately not against a sum that includes the role bound: two
  // god-owned terms that could only be outvoted together are one puppeteer
  // wearing two names.
  it('the emphasis bound cannot outvote the five mage-owned terms at their extremes', () => {
    expect(weights.bound.emphasis).toBeLessThan(mageOwnedBounds());
  });
});

/** The five bounds a mage owns: what she can say back to either god-owned term. */
function mageOwnedBounds(): number {
  return TARGET_TERM_KINDS.filter((kind) => kind !== 'role' && kind !== 'emphasis').reduce(
    (sum, kind) => sum + weights.bound[kind],
    0,
  );
}
