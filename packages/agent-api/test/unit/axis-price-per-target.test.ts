/*
 * Multiverse Mages — an axis act is priced on the axis the god chose, in the mask and at the gate.
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
 * Stream 13 (PR #257): the permit/forbid mask checked affordability against
 * the **cheapest** axis's price — over every axis, including ones the act
 * would not change — while the resolver priced the chosen axis's own
 * hysteresis and surcharge. A toggle was offered, admitted, and then refused
 * at resolution: nothing charged, and the player's act silently did nothing
 * (three of sixteen toggles in one run). The mask must never be more
 * optimistic than the resolver.
 *
 * Both cases below fail on main `0cc40e9c`: the mask byte is lit for an act no
 * changeable axis can afford, and the gate admits an act on a dear axis.
 */

import { describe, expect, it } from 'vitest';

import { AXIS_CHANGE_COUNTER, AXIS_KIND, attachRecord, readUniverse } from '@mm/state';
import type { ContentCatalogue } from '@mm/agent-api';
import {
  ACTION_SPACE_SIZE,
  GOD_ACTION,
  admit,
  axisActionPrice,
  buildCandidates,
  buildCatalogue,
  isLegal,
  legalityMask,
} from '@mm/agent-api';

import { FIXTURE_CATALOGUE, firstUniverse } from './fixtures.js';

/** Every action priced at `price`, hysteresis +100% per outstanding change. */
function priced(price: number): ContentCatalogue {
  return buildCatalogue(FIXTURE_CATALOGUE.nodes, [...FIXTURE_CATALOGUE.traditionIds], {
    byAction: Array.from({ length: ACTION_SPACE_SIZE }, (_, action) =>
      action === GOD_ACTION.noop || action === GOD_ACTION.declareAscension ? 0 : price,
    ),
    foundUniversity: price * 2,
    hysteresisStep: 1024,
  });
}

function churn(state: Parameters<typeof attachRecord>[0], bit: number, changeCount: number): void {
  attachRecord(state, AXIS_CHANGE_COUNTER, state.entities.create(), {
    axisKind: AXIS_KIND.technique,
    axisBit: bit,
    changeCount,
  });
}

describe('an axis act is priced on its own axis', () => {
  // The fixture permits techniques 0b00111: permitting can change only bits 3
  // and 4 (axis ids 4 and 5), forbidding only bits 0–2.

  it('masks permitTechnique when every axis it could change is dearer than the pool', () => {
    const world = firstUniverse();
    const catalogue = priced(readUniverse(world.state, world.universe).favor);
    churn(world.state, 3, 3);
    churn(world.state, 4, 3);
    // Bits 0–2 are unchurned and at the pool's price — but permitting them
    // changes nothing, and main's mask priced the act at their multiplier.
    const candidates = buildCandidates({ state: world.state, catalogue });
    const mask = legalityMask({ state: world.state, candidates, catalogue });
    expect(isLegal(mask, GOD_ACTION.permitTechnique)).toBe(false);
    // Forbidding is unaffected: bits 0–2 are changeable and affordable.
    expect(isLegal(mask, GOD_ACTION.forbidTechnique)).toBe(true);
  });

  it('refuses a dear axis at the gate, with a reason, while admitting a cheap one', () => {
    const world = firstUniverse();
    const favor = readUniverse(world.state, world.universe).favor;
    const catalogue = priced(favor);
    churn(world.state, 3, 2); // axis id 4 costs three times the pool
    expect(axisActionPrice(world.state, catalogue.costs!, GOD_ACTION.permitTechnique, 4)).toBe(favor * 3);
    expect(axisActionPrice(world.state, catalogue.costs!, GOD_ACTION.permitTechnique, 5)).toBe(favor);
    expect(axisActionPrice(world.state, catalogue.costs!, GOD_ACTION.permitTechnique, 1)).toBeUndefined();

    const dear = admit({ state: world.state, catalogue }, [{ kind: GOD_ACTION.permitTechnique, params: [4] }]);
    expect(dear.admitted).toEqual([]);
    expect(dear.rejected.map((r) => r.reason)).toEqual(['unaffordable']);

    const noChange = admit({ state: world.state, catalogue }, [{ kind: GOD_ACTION.permitTechnique, params: [1] }]);
    expect(noChange.rejected.map((r) => r.reason)).toEqual(['not-a-change']);

    const cheap = admit({ state: world.state, catalogue }, [{ kind: GOD_ACTION.permitTechnique, params: [5] }]);
    expect(cheap.rejected).toEqual([]);
    expect(cheap.admitted).toEqual([{ kind: GOD_ACTION.permitTechnique, params: [5] }]);
  });
});

describe('the same principle for the other actions priced per target', () => {
  it('refuses founding at the gate when only funding is affordable', () => {
    const world = firstUniverse();
    const favor = readUniverse(world.state, world.universe).favor;
    // Founding costs twice the pool; funding costs the pool.
    const catalogue = priced(favor);
    const slots = buildCandidates({ state: world.state, catalogue }).get(GOD_ACTION.fundUniversity) ?? [];
    const found = slots.findIndex((c) => c.params[0] === 0);
    const fund = slots.findIndex((c) => c.params[0] !== 0);
    expect(found).toBeGreaterThanOrEqual(0);
    expect(fund).toBeGreaterThanOrEqual(0);
    const refused = admit({ state: world.state, catalogue }, [{ kind: GOD_ACTION.fundUniversity, params: [found] }]);
    expect(refused.rejected.map((r) => r.reason)).toEqual(['unaffordable']);
    const ok = admit({ state: world.state, catalogue }, [{ kind: GOD_ACTION.fundUniversity, params: [fund] }]);
    expect(ok.rejected).toEqual([]);
  });
});
