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
 * Not a test of `knowledge-model` at all. It exists to prove the adversarial
 * directory is discovered by `vitest.config.ts`'s explicit include list and
 * that the shared `test/support/scenario.ts` fixtures import cleanly from
 * here, before any red test in this directory is trusted to be red for the
 * right reason.
 */

import { describe, expect, it } from 'vitest';

import { ROOT_NODE, testCatalog } from '../support/scenario.js';

describe('adversarial suite infrastructure', () => {
  it('is discovered and can import the shared scenario fixtures', () => {
    const catalog = testCatalog();
    expect(catalog.node(ROOT_NODE)).toBeDefined();
  });
});
