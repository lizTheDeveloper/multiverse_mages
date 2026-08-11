/*
 * Multiverse Mages — adversarial suite infrastructure smoke test.
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
 * Not a test of `mages-and-species` at all. It proves that
 * `packages/rules-world/test/adversarial` is picked up by `vitest.config.ts`'s
 * explicit include list and that the unit suite's fixtures import cleanly from
 * one directory over, before any red test here is trusted to be red for the
 * reason its header claims.
 *
 * **This file passes.** Every other file in this directory fails on purpose;
 * each one names the behaviour it believes is wrong, quotes the line that says
 * it should be otherwise, and argues for the value it asserts.
 */

import { describe, expect, it } from 'vitest';

import { outlook } from '../unit/autonomy-fixtures.js';
import { GOAL, maskGoals } from '../../src/index.js';

describe('adversarial suite infrastructure', () => {
  it('is discovered and can import the unit suite fixtures', () => {
    expect(maskGoals(outlook()).feasible).toContain(GOAL.idle);
  });
});
