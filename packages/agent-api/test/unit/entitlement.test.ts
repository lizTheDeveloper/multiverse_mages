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
import { ENGAGEMENT_COMPONENTS, MATERIAL_STOCK, WORLD_COMPONENTS } from '@mm/state';

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

import { FIXTURE_CATALOGUE, FP, engageWorld, firstUniverse } from './fixtures.js';

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
  it('covers the 112 traits the inventory counted, amended at revision 7', () => {
    let traits = 0;
    for (const spec of [...WORLD_COMPONENTS, ...ENGAGEMENT_COMPONENTS]) {
      traits += Object.keys(spec.fields).length;
    }
    expect(traits).toBe(112);

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
    // 70 at be446a6; 74 at revision 7 when `material-stock` gained four kinds
    // nobody had classified; and **70 again** now that `material-economy` task
    // 5.1's per-kind block on `PlayerState` exists and all seven are
    // `observable`. The round trip is a coincidence of arithmetic and not a
    // revert — the four rows that left this bucket are not the four that
    // entered it, and `material-stock` now contributes none.
    //
    // Nothing about the *vector* moved for it: `resources[39]` still carries
    // `food + stone + vellum` and `OBSERVATION_LAYOUT_DIGEST` is unchanged.
    // OBSERVABLE in this scheme means *projected into `PlayerState`*, which is
    // the first stage of `observation-entitlement.md`'s reducer; reaching a slot
    // is the second, and `DECLARED_UNENCODED` is where that half is recorded.
    expect(byReason.get('not-yet-decided')).toBe(70);
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

/**
 * `material-economy` task 5.1–5.2: the player may read every stock by name, and
 * the vector does not move for it.
 *
 * These are two halves of one claim and both are needed. The projection carrying
 * seven kinds is worth nothing if it cost a resize, and an unmoved digest is
 * worth nothing if the kinds did not actually arrive.
 */
describe('the player projection names every material kind', () => {
  const world = firstUniverse();
  const player = project({ state: world.state, catalogue: FIXTURE_CATALOGUE });

  it('exposes each of the seven kinds under its own name', () => {
    // Against `MATERIAL_STOCK.fields` rather than a transcribed list, so an
    // eighth kind added to the schema and forgotten here fails rather than
    // being silently dropped from every client.
    expect(Object.keys(player.resources.stocks).sort()).toEqual(
      Object.keys(MATERIAL_STOCK.fields).sort(),
    );
  });

  it('reads the stock the fixture actually seeded, not a zero-shaped placeholder', () => {
    // The positive control on the block. A projection that returned the right
    // *shape* full of zeros would satisfy the assertion above and tell a client
    // that a stocked universe is empty — `undefined === 0` is false, and so is
    // `0 === 500 * FP`, so this is the arm that discriminates.
    expect(player.resources.stocks.food).toBe(500 * FP);
    expect(player.resources.stocks.stone).toBe(0);
    expect(player.resources.stocks.insight).toBe(0);
  });

  it('keeps `materials` the documented food + stone + vellum sum', () => {
    // Not the sum of all seven. The observation's one slot carries this exact
    // quantity and a widened meaning here would make one field mean two things
    // depending on which side of the encoder read it.
    const { food, stone, vellum } = player.resources.stocks;
    expect(player.resources.materials).toBe(food + stone + vellum);
  });

  it('costs no observation slot, which is what makes the block cheap', () => {
    // Restated at the site that added the fields, rather than trusted from the
    // block above: this is the property `PlayerState` is allowed to grow under.
    expect(OBSERVATION_LAYOUT_DIGEST).toBe('46182c35d829b205');
    expect(OBSERVATION_SIZE).toBe(400);
  });
});
