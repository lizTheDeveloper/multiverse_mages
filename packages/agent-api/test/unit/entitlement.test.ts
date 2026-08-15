/*
 * Multiverse Mages — the entitlement gates, and the positive controls for them.
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
 * Steps 2 and 3 of `docs/design/observation-entitlement.md`.
 *
 * **Every gate here gets a positive control.** A checker that answers about the
 * wrong input is worse than no checker, and "the list of problems is empty" is
 * exactly the shape that passes when the checker is broken — an
 * `unclassifiedTraits()` that walked an empty registry would report clean
 * forever. So each `expect(...).toEqual([])` is paired with an input the gate
 * *must* reject, and the rejection is asserted to name the thing that is wrong.
 */

import { describe, expect, it } from 'vitest';

import type { ComponentFields, ComponentSpec } from '@mm/sim-core';
import { ENGAGEMENT_COMPONENTS, WORLD_COMPONENTS } from '@mm/state';

import type { TraitClassification } from '@mm/agent-api';
import {
  DECLARED_UNENCODED,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SIZE,
  TRAIT_CLASSIFICATION,
  assertAllTraitsClassified,
  assertNoUndeclaredGaps,
  playerStateFields,
  project,
  unclassifiedTraits,
  unencodedObservables,
} from '@mm/agent-api';
import { RAID_SIDE } from '@mm/state';

import { FIXTURE_CATALOGUE, engageWorld, firstUniverse } from './fixtures.js';

/** A projection taken during a raid, so the engagement fields are present. */
function engagedProjection() {
  const world = firstUniverse();
  const engagement = engageWorld(world);
  return project({
    state: world.state,
    catalogue: FIXTURE_CATALOGUE,
    engagement: { engagement, ownSide: RAID_SIDE.attacker },
  });
}

describe('unclassifiedTraits (step 2)', () => {
  it('is empty: every component field is classified', () => {
    expect(unclassifiedTraits()).toEqual([]);
    expect(() => {
      assertAllTraitsClassified();
    }).not.toThrow();
  });

  /**
   * The positive control the empty-list assertion needs. A registry the
   * classification has never seen must be rejected — otherwise the test above
   * is a statement about a gate that cannot fail.
   */
  it('rejects a component nobody has classified', () => {
    const invented: ComponentSpec<ComponentFields> = {
      name: 'ley-line',
      fields: { potency: 'i32', discoveredTick: 'i32' },
    };
    const problems = unclassifiedTraits([...WORLD_COMPONENTS, invented]);
    expect(problems).toContain('component "ley-line" has no classification at all');
    expect(() => {
      assertAllTraitsClassified([...WORLD_COMPONENTS, invented]);
    }).toThrow(/ley-line/);
  });

  /**
   * A field added to an existing component is the commoner failure, and the one
   * the gate is really for: `universe` is classified, so nothing about the
   * component looks new, and only the field is missing.
   *
   * The whole registry is passed with `universe` substituted rather than
   * `[widened]` alone — the gate reports in both directions, so a one-element
   * list would also, correctly, report all twenty-two other components as rows
   * about things that are not components, and the assertion would be about that
   * noise instead of about the new field.
   */
  it('rejects a new field on a component that is otherwise classified', () => {
    const widened: ComponentSpec<ComponentFields> = {
      name: 'universe',
      fields: { ...WORLD_COMPONENTS[0]?.fields, chaosAffinity: 'i32' },
    };
    const problems = unclassifiedTraits([
      widened,
      ...WORLD_COMPONENTS.slice(1),
      ...ENGAGEMENT_COMPONENTS,
    ]);
    expect(problems).toEqual(['universe.chaosAffinity is unclassified']);
  });

  /** Withholding without a reason is silence wearing a label. */
  it('rejects a withheld trait carrying no reason', () => {
    const problems = unclassifiedTraits(
      [{ name: 'library', fields: { foundedTick: 'i32' } }],
      { library: { foundedTick: { cls: 'withheld' } as TraitClassification } },
    );
    expect(problems).toEqual(['library.foundedTick is withheld with no reason']);
  });

  /** And an observable trait that names no slot says nothing checkable either. */
  it('rejects an observable trait that names no slot', () => {
    const problems = unclassifiedTraits(
      [{ name: 'library', fields: { foundedTick: 'i32' } }],
      { library: { foundedTick: { cls: 'observable' } as TraitClassification } },
    );
    expect(problems).toEqual(['library.foundedTick is observable but names no slot or aggregate']);
  });

  /**
   * The other rot, and it matters as much: a row about a field that no longer
   * exists is a decision nobody can act on, and it inflates the table's
   * apparent coverage.
   */
  it('rejects a stale row about a field that has been removed', () => {
    const problems = unclassifiedTraits([{ name: 'library', fields: {} }], {
      library: { foundedTick: { cls: 'withheld', reason: 'not-yet-decided' } },
    });
    expect(problems).toEqual(['classification names library.foundedTick, which is not a field']);
  });

  /**
   * The inventory's headline number, asserted rather than described. If this
   * moves, `docs/design/observable-trait-inventory.md` is stale and its date and
   * ref line are lying about the tree.
   */
  it('covers the 110 traits the inventory counts, and says what moved it', () => {
    let traits = 0;
    for (const spec of [...WORLD_COMPONENTS, ...ENGAGEMENT_COMPONENTS]) {
      traits += Object.keys(spec.fields).length;
    }
    // **110, where the inventory was taken at 108.** `w190/scribing-fidelity`
    // added `knowledge-fidelity` — world-schema revision 7, two fields — and
    // this assertion is the mechanism working rather than a number needing a
    // nudge: a component added to `@mm/state` and not classified turns
    // `unclassifiedTraits` red, and this says the *count* moved too so the
    // inventory document cannot quietly go stale beside it. Both were updated
    // in the same commit; the document keeps `be446a6` as the ref its prose was
    // read at and records this delta beneath it.
    expect(traits).toBe(110);

    let classified = 0;
    for (const rows of Object.values(TRAIT_CLASSIFICATION)) {
      classified += Object.keys(rows).length;
    }
    expect(classified).toBe(traits);
  });

  /**
   * The finding the inventory leads with, kept honest. `not-yet-decided`
   * dominating is not a failure of the exercise — it *is* the exercise. This
   * assertion exists so that a later change that quietly reclassifies rows to
   * make the number look better has to say so in a diff.
   */
  it('records that most withheld traits are undecided rather than justified', () => {
    const byReason = new Map<string, number>();
    for (const rows of Object.values(TRAIT_CLASSIFICATION)) {
      for (const entry of Object.values(rows)) {
        if (entry.cls !== 'withheld') continue;
        const reason = entry.reason ?? 'missing';
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }
    }
    // 72, from 70: `knowledge-fidelity`'s two fields are both `undecided()`.
    // `corruption` is the one worth pausing on and the reason it is not
    // classified either way is written beside it in `entitlement.ts` — an
    // observation channel carrying "this book is corrupt" would delete the
    // mechanic, while one carrying "a reader has marked it" would be legitimate
    // and does not exist. Two entitlement questions, one field, and
    // `scribing-fidelity.md` decides neither.
    expect(byReason.get('not-yet-decided')).toBe(72);
    expect(byReason.get('internal-bookkeeping')).toBe(6);
    // Unused until there is an opponent-facing projection to hide anything
    // from. Asserted at zero so that the day it stops being zero is a diff.
    expect(byReason.get('hidden-from-opponent')).toBeUndefined();
  });
});

describe('unencodedObservables (step 3)', () => {
  it('is empty: every entitled field is encoded or declared', () => {
    const player = engagedProjection();
    expect(unencodedObservables(player)).toEqual([]);
    expect(() => {
      assertNoUndeclaredGaps(player);
    }).not.toThrow();
  });

  /**
   * Action cost is the gap the design says must land here. Declared, with a
   * reason, and **not** encoded — the whole point of step 3 is that the hole is
   * named rather than closed, because closing it moves the digest.
   */
  it('declares action cost as an unencoded gap with a reason', () => {
    const declared = DECLARED_UNENCODED.map((gap) => gap.field);
    expect(declared).toContain('catalogue.costs.byAction');
    expect(declared).toContain('catalogue.costs.foundUniversity');
    expect(declared).toContain('catalogue.costs.hysteresisStep');

    for (const gap of DECLARED_UNENCODED) {
      expect(gap.because.length).toBeGreaterThan(0);
    }

    // And it is genuinely not encoded: no PlayerState field carries a price.
    const fields = playerStateFields(engagedProjection());
    expect(fields.filter((field) => field.includes('cost'))).toEqual([]);
  });

  /** Positive control: a declaration about something that is in fact encoded. */
  it('rejects a declared gap that actually reaches a slot', () => {
    const problems = unencodedObservables(engagedProjection(), [
      { field: 'resources.favor', because: 'a stale claim that favor is invisible' },
    ]);
    expect(problems).toEqual([
      'resources.favor is declared unencoded but is a PlayerState field, and so reaches a slot',
    ]);
  });

  /** Positive control: a declaration with nothing said. */
  it('rejects a declared gap with an empty reason', () => {
    const problems = unencodedObservables(engagedProjection(), [
      { field: 'catalogue.costs.byAction', because: '   ' },
    ]);
    expect(problems).toEqual(['catalogue.costs.byAction is declared unencoded with an empty reason']);
    expect(() => {
      assertNoUndeclaredGaps(engagedProjection(), [
        { field: 'catalogue.costs.byAction', because: '' },
      ]);
    }).toThrow(/empty reason/);
  });

  /**
   * The field list is walked from a value rather than written down, so this is
   * the assertion that the walk actually reaches the blocks. A walker that
   * silently returned `[]` would make every check above vacuous.
   */
  it('walks a field for each of the nine blocks', () => {
    const fields = playerStateFields(engagedProjection());
    for (const prefix of [
      'ruleset.',
      'traditionId',
      'resources.',
      'population',
      'mages',
      'knowledge',
      'institutions.',
      'clock.',
      'engagement.',
    ]) {
      expect(fields.some((field) => field.startsWith(prefix))).toBe(true);
    }
    // Seventeen engagement leaves during a raid — seven channels for each side,
    // the objective list, and the two portal channels — against one bare
    // `engagement` leaf when there is no raid. The walk descends into `own` and
    // `enemy` exactly as it descends into `resources`, so a side channel is
    // named rather than hidden inside a block.
    expect(fields.filter((field) => field.startsWith('engagement.')).length).toBe(17);
    expect(fields).toContain('engagement.own.concealmentTotal');
    const world = firstUniverse();
    const atWorldScale = playerStateFields(
      project({ state: world.state, catalogue: FIXTURE_CATALOGUE }),
    );
    expect(atWorldScale).toContain('engagement');
  });
});

describe('steps 1 to 3 move no baseline', () => {
  /**
   * The gate the change is measured by. `OBSERVATION_LAYOUT_DIGEST` was
   * `46182c35d829b205` at `be446a6`, recorded in
   * `docs/design/observable-trait-inventory.md` **before** any of this code was
   * written, so this compares against a captured value rather than against
   * whatever the digest happens to be at the end.
   *
   * The design's scope note is the claim being kept: *"No change to
   * `OBSERVATION_SIZE`, block order, or normalization. Purely additive; the
   * digest and every baseline hold."*
   *
   * `layout-digest.test.ts` pins the same literal as `EXPECTED_DIGEST`, and the
   * two **agree**. That is a duplicate on purpose and not a second rottable
   * copy: that one asserts the layout is what the contract says, this one
   * asserts *this change did not move it*. They would be edited for different
   * reasons, and a change that moved the digest legitimately would have to
   * update both and say why in the same diff.
   */
  it('leaves OBSERVATION_LAYOUT_DIGEST at its pre-change value', () => {
    expect(OBSERVATION_LAYOUT_DIGEST).toBe('46182c35d829b205');
    expect(OBSERVATION_SIZE).toBe(400);
  });
});
