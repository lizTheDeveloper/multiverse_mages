/*
 * Multiverse Mages — adversarial: the economy's twin of the academic
 * negative-magnitude swallow, still open after the sibling was fixed.
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
 * ## What changed, and what did not
 *
 * `campaign/signed-magnitudes` (commit `4d836d2`) loosened `node.schema.json`'s
 * `magnitude` to `[-1073741823, 1073741823]` for `additive-into-multiplier`
 * primitives, added a `fp(0)` floor to `@mm/primitives`' `(1 + Σ)` stacking
 * (`caps.ts`), and — in the same commit — fixed
 * `packages/coordination/src/academic-effects.ts`'s per-contribution filter
 * from `magnitude <= 0` to `magnitude === 0`, with a comment explicit about
 * why: *"dropping a negative here would let a node author a teaching cost that
 * validates, ships, reads correctly in its gloss and moves no number."*
 *
 * `resource-yield` and `build-rate` are `additive-into-multiplier` too — the
 * same commit's own `contracts.md` addition says the sign is meaningful
 * "under `additive-into-multiplier` and nowhere else," which names both of
 * them by stacking rule — and `packages/coordination/src/universe-effects.ts`
 * is `academic-effects.ts`'s own sibling, sharing its architecture down to the
 * variable names in its doc comments. But `universe-effects.ts` was not part
 * of this commit's diff, and its two filters still read:
 *
 * ```
 * if (contribution.magnitude > 0) buildRate.push(contribution.magnitude);
 * …
 * if (routed[kind] > 0) resourceYield[kind].push(routed[kind]);
 * ```
 *
 * (`universe-effects.ts` lines ~347 and ~351 as of this commit.) Exactly the
 * bug just fixed one file over, in the primitive the design note itself
 * points to.
 *
 * ## Why this matters as much as the one that got fixed
 *
 * `resource-yield` and `build-rate` are the two primitives
 * `check:consumption` already lists as node-consumed with the *largest*
 * shipped node counts (59 and 33 respectively, per a pre-campaign
 * `check:consumption` run) — more authored surface than `research-rate`,
 * `teach-rate` and `scribe-rate` combined. A "cost" node authored against
 * either — a building that raises upkeep, a working that taxes the granary —
 * would validate under the new schema, register as a node-driven consumer
 * (registration happens before any sign is read, exactly as in the fixed
 * file), and move the economy by nothing.
 *
 * This test proves it against the code as it stands after `4d836d2`, the same
 * way the sibling defect was proven before its fix: by loading real shipped
 * content and flipping one node's magnitude in memory, never touching disk or
 * the schema gate.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry } from '@mm/content';
import { TIME_MODE, createState } from '@mm/sim-core';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MATERIAL_STOCK,
  attachRecord,
  createUniverse,
} from '@mm/state';
import type { Ruleset } from '@mm/state';
import { MASTERY_MAX, MagicGrid, gatherEffects } from '@mm/rules-magic';
import type { CellResolver, EffectSourceInstance } from '@mm/rules-magic';

import { defineWorldSimulation, universeEconomyBonuses, universeEffectIndex } from '../../src/index.js';
import { worldDeps } from '../unit/world-fixtures.js';

function permissiveRuleset(): Ruleset {
  return { permittedTechniques: (1 << 5) - 1, permittedForms: (1 << 14) - 1, edicts: [] };
}

/** A fresh, independent registry with one universe-targeted `build-rate` node's magnitude negated. */
function registryWithNegatedBuildRate(): {
  registry: ContentRegistry;
  nodeContentId: number;
  negatedMagnitude: number;
} {
  const registry = loadContent(shippedContentSource());
  const found = registry.nodes.find((entry) =>
    entry.record.effects.some(
      (effect) => effect.primitive === 'build-rate' && effect.target === 'universe',
    ),
  );
  if (found === undefined) {
    throw new Error(
      'no node authors a universe-targeted build-rate effect; the fixture this test relies on is gone',
    );
  }
  const effect = found.record.effects.find(
    (candidate) => candidate.primitive === 'build-rate' && candidate.target === 'universe',
  );
  if (effect === undefined) throw new Error('unreachable: filtered for exactly this above');

  const negatedMagnitude = -Math.abs(effect.magnitude);
  (effect as { magnitude: number }).magnitude = negatedMagnitude;

  return { registry, nodeContentId: found.contentId, negatedMagnitude };
}

describe('DEFECT (still open post-4d836d2): a negative build-rate magnitude is gathered, then silently dropped by universeEconomyBonuses', () => {
  it('gatherEffects hands back the negative contribution unmodified — the gate is downstream, as with the fixed academic sibling', () => {
    const { registry, nodeContentId, negatedMagnitude } = registryWithNegatedBuildRate();
    const cells: CellResolver = MagicGrid.from(registry);
    const instance: EffectSourceInstance = {
      nodeId: nodeContentId,
      locationKind: LOCATION_KIND.mind,
      mastery: MASTERY_MAX,
    };

    const contributions = gatherEffects([instance], {
      registry,
      ruleset: permissiveRuleset(),
      mode: TIME_MODE.world,
      cellOf: (id) => cells.cellOf(id),
    });

    const buildContribution = contributions.find(
      (c) => c.primitiveId === 'build-rate' && c.target === 'universe',
    );
    expect(buildContribution?.magnitude).toBe(negatedMagnitude);
  });

  it('RED — universeEconomyBonuses should carry a negative build-rate magnitude through, not drop it, mirroring the fix already applied to academicRateBonuses', () => {
    const { registry, nodeContentId, negatedMagnitude } = registryWithNegatedBuildRate();
    const cells: CellResolver = MagicGrid.from(registry);
    const index = universeEffectIndex(registry);

    // Schema only — a structural component layout, independent of which
    // registry instance built it, exactly as the academic sibling test relies
    // on. Safe to build from the shared content even though the state below is
    // populated from the independent, mutated registry.
    const simulation = defineWorldSimulation(worldDeps(1));
    const state = createState({
      rootSeed: 0x0ec0_1000,
      schema: simulation.schema,
      contentRevision: registry.contentRevision,
    });
    const universe = createUniverse(state, {
      permittedTechniques: 0b11111,
      permittedForms: 0b11111111111111,
      edictBudget: 4,
      traditionId: 1,
      favor: 0,
      worship: 0,
      worshipTier: 0,
      prestige: 0,
      prestigeEarned: 0,
      terminalReason: 0,
      favorCap: 0,
      ascended: 0,
    });
    attachRecord(state, MATERIAL_STOCK, universe, { food: 0, stone: 0, vellum: 0 });

    const holder = state.entities.create();
    attachRecord(state, KNOWLEDGE_INSTANCE, holder, {
      nodeId: nodeContentId,
      locationKind: LOCATION_KIND.mind,
      locationId: holder,
      acquiredTick: 0,
      mastery: MASTERY_MAX,
    });

    const bonuses = universeEconomyBonuses(state, {
      index,
      cells,
      ruleset: permissiveRuleset(),
    });

    // Mirrors the assertion that now passes for `academicRateBonuses` after
    // `4d836d2`. It fails here because `universe-effects.ts` was not touched
    // by that commit.
    expect(bonuses.buildRate).toEqual([negatedMagnitude]);
  });
});
