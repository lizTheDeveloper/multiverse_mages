/*
 * Multiverse Mages — an authored teaching cost reaches the mage who paid it.
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
 * `academicRateBonuses` dropped every magnitude that was not strictly positive:
 *
 * ```
 * if (contribution.magnitude <= 0) continue;
 * ```
 *
 * That was free while `node.schema.json` said `"minimum": 1`, because "zero"
 * and "negative" were the same empty set. It is not free now. The filter would
 * have eaten the first authored cost in the grid — a node that validates,
 * ships, reads correctly in its gloss and moves no number, which is the exact
 * defect `academic-effects.ts` was written to end, one sign over.
 *
 * So the assertion is on the *magnitude list a mage is handed*, not on a stacked
 * multiplier: a stack that floors at zero would report the same number whether
 * the cost arrived or the whole list was empty, and this test has to be able to
 * tell those apart.
 *
 * The end-to-end statement is the second test. `pn-the-nameless` is a shipped
 * node in a v1 cell whose gloss already argued the cost in prose — *"ruinous to
 * explain to an heir, and the reason some archmages have no biography"* — and
 * carried none in data, because data could not hold one.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  attachRecord,
  componentOf,
  findUniverse,
  readRulesetForObservation,
} from '@mm/state';

import {
  academicEffectIndex,
  academicRateBonuses,
  buildWorkingDurations,
  defineWorldSimulation,
  establishOrRenewWorking,
} from '../../src/index.js';

import { catalogAndCells, registry, scribingTraditionId, seededWorld, worldDeps } from './world-fixtures.js';

/** `fp(1.0)` — full mastery, well above the activation threshold. */
const FULL_MASTERY = 1024;

/** The content id of a shipped node, by its authored id. */
function contentIdOf(nodeId: string): number {
  const found = registry().nodes.find((entry) => entry.record.id === nodeId);
  if (found === undefined) throw new Error(`shipped content has no node "${nodeId}"`);
  return found.contentId;
}

/**
 * One mage holding one node at full mastery, and the magnitudes she earns.
 *
 * `standing: true` lights a working over the node first. Since
 * `working-duration`, an effect authored with a non-zero `durationTicks`
 * contributes only while its holder is keeping it up — *The Nameless* is
 * authored at thirty-six months, from its own gloss's *"cheap to maintain"* —
 * so a fixture that only granted the instance would measure the standing gate
 * rather than the sign of the magnitude, which is what this file is about.
 *
 * Left `false` for the two zero-duration nodes below, which is what makes the
 * pair a control: same fixture, same gate, and only the durable one needs a
 * month spent on it.
 */
function bonusesFor(nodeId: string, standing = false): {
  research: readonly number[];
  teach: readonly number[];
  scribe: readonly number[];
  contributingNodes: number;
} {
  const traditionId = scribingTraditionId();
  const simulation = defineWorldSimulation(worldDeps(traditionId));
  const { state } = seededWorld(simulation.schema, { rootSeed: 0x0004_2000, traditionId });

  const mages = componentOf(state, MAGE);
  let holder: EntityHandle | undefined;
  mages.forEach((_row, handle) => {
    holder ??= handle;
  });
  if (holder === undefined) throw new Error('the fixture seeded no mages');

  const instance = state.entities.create();
  attachRecord(state, KNOWLEDGE_INSTANCE, instance, {
    nodeId: contentIdOf(nodeId),
    locationKind: LOCATION_KIND.mind,
    locationId: holder,
    acquiredTick: 0,
    mastery: FULL_MASTERY,
  });

  if (standing) {
    establishOrRenewWorking(
      state,
      holder,
      contentIdOf(nodeId),
      state.clock.worldTick,
      buildWorkingDurations(registry()).durationOf(contentIdOf(nodeId)),
    );
  }

  const bonuses = academicRateBonuses(state, {
    index: academicEffectIndex(registry()),
    cells: catalogAndCells().cells,
    ruleset: readRulesetForObservation(state, findUniverse(state)),
  });

  return {
    research: bonuses.researchRate(holder),
    teach: bonuses.teachRate(holder),
    scribe: bonuses.scribeRate(holder),
    contributingNodes: bonuses.contributingNodes,
  };
}

describe('a cost reaches the mage who holds it', () => {
  it('hands The Nameless its authored teaching cost, sign intact', () => {
    const bonuses = bonusesFor('pn-the-nameless', true);
    expect(bonuses.teach).toEqual([-192]);
    expect(bonuses.contributingNodes).toBe(1);
  });

  it('hands her nothing at all when the unnaming is not being held up', () => {
    // The same node, the same mastery, the same ruleset — and no working. *"Hold
    // your own unnaming indefinitely. Cheap to maintain"* is the gloss, and this
    // is what "maintain" costs when nobody pays it. It is also the arm that
    // makes the assertion above about the *sign* rather than about the gate.
    const bonuses = bonusesFor('pn-the-nameless');
    expect(bonuses.teach).toEqual([]);
    expect(bonuses.contributingNodes).toBe(0);
  });

  it('still hands an ordinary bonus through unchanged', () => {
    // The positive control. A filter change that broke the ordinary path would
    // otherwise pass the test above by accident.
    const bonuses = bonusesFor('rm-hold-the-attention');
    expect(bonuses.teach).toEqual([128]);
  });

  it('gives a mage who holds neither nothing at all', () => {
    const bonuses = bonusesFor('pl-fray-the-edge');
    expect(bonuses.teach).toEqual([]);
    expect(bonuses.research).toEqual([]);
    expect(bonuses.scribe).toEqual([]);
    expect(bonuses.contributingNodes).toBe(0);
  });
});
