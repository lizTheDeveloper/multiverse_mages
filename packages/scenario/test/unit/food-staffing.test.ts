/*
 * Multiverse Mages — the labour market staffs the food bill.
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
 * The gate for S4's finding 1, read off §4.4's flow ledger.
 *
 * The occupation demand used to divide a food-and-vellum bill by a laborer's
 * output of *all* kinds, so it asked for under half the farmers the populace
 * eats through. Measured on origin/main 95738881 at this seed and tick, land
 * food covered **52%** of subsistence (11,537 / 22,354 fp), the founding stock
 * had run out around world year 150, and it never came back. `laborObligation`
 * restates each bill at the land's own yield share.
 *
 * The claim this test holds: with no god input, at world tick 2160 (year 180),
 * the food the land grew that tick is at least 95% of what the populace owed.
 * It fails on origin/main 95738881 and passes on the branch that fixed it.
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession } from '@mm/agent-api';

import { referenceContent, referenceScenario } from '../../src/index.js';

const SEED = 20260813;
const TICK = 2160;

/** Generous, for the reason every long arm in this package gives. */
const TIMEOUT_MS = 600_000;

describe('the labour market staffs the food bill', () => {
  it(
    'grows at least 95% of subsistence from the land at world year 180',
    async () => {
      const run = referenceScenario(referenceContent(), { raids: true });
      const session = createSession({ scenario: run.scenario, strategyId: 'food-staffing' });
      session.reset(SEED, { worldTickCap: TICK + 1 });
      for (let tick = 1; tick <= TICK; tick += 1) {
        session.submit({ kind: GOD_ACTION.noop });
        // Hand the loop back once a world year, as every long arm here does.
        if (tick % 12 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const ledger = session.flowLedger();
      expect(ledger, 'the reference scenario reports a flow ledger').toBeDefined();
      if (ledger === undefined) return;
      const subsistence = ledger.claimants.find(
        (claimant) => claimant.claimant === 'subsistence' && claimant.kind === 'food',
      );
      expect(subsistence, 'a subsistence claim on food').toBeDefined();
      const owed = subsistence?.owed ?? 0;
      // A positive control on the instrument: a universe this old eats.
      expect(owed).toBeGreaterThan(0);
      expect((ledger.land.food ?? 0) * 100).toBeGreaterThanOrEqual(owed * 95);
    },
    TIMEOUT_MS,
  );
});
