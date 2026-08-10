/*
 * Multiverse Mages — scaffolding smoke test.
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

import { describe, expect, it } from 'vitest';

import { SIM_CORE_SCAFFOLD_ONLY } from '@mm/sim-core';

describe('sim-core scaffold', () => {
  it('resolves the package barrel', () => {
    expect(SIM_CORE_SCAFFOLD_ONLY).toBe(true);
  });
});
