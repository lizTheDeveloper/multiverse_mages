/*
 * Multiverse Mages — adversarial: hookFor at its stated edges.
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
 * The task brief names four cases for `hookFor`: home == host, an unknown
 * tradition id, id 0, and a raider whose home has no notion of preparation
 * entering a `prepared` host. Home == host and the raider case are already
 * covered elsewhere (`tradition-fixtures.ts`'s `ownHook`, and this
 * directory's `standard-raider-in-prepared-host.test.ts`). This file closes
 * the two that were not yet exercised anywhere in this task's own test
 * files: id `0` and an id naming no loaded tradition.
 *
 * `hook-for.ts`'s own docstring states both are refused by design
 * (`contracts.md` §1.1: "a universe has exactly one traditionId and it is
 * never 0"), so these are expected to pass -- confirmation, not a defect
 * report.
 */

import { describe, expect, it } from 'vitest';

import { NO_TRADITION, hookFor } from '../../src/traditions/index.js';
import { ART_OF_MEMORY, TRADITIONS } from '../unit/tradition-fixtures.js';

const UNKNOWN_TRADITION_ID = 65535; // uint16 max, guaranteed unused by three-tradition v1 content

describe('hookFor at its documented edges', () => {
  it('rejects traditionId 0 on either side of the portal', () => {
    expect(() => hookFor('store', NO_TRADITION, ART_OF_MEMORY, TRADITIONS)).toThrow(RangeError);
    expect(() => hookFor('cast', ART_OF_MEMORY, NO_TRADITION, TRADITIONS)).toThrow(RangeError);
  });

  it('rejects an id naming no loaded tradition, and names it in the error', () => {
    expect(() => hookFor('store', UNKNOWN_TRADITION_ID, ART_OF_MEMORY, TRADITIONS)).toThrow(
      String(UNKNOWN_TRADITION_ID),
    );
    expect(() => hookFor('cast', ART_OF_MEMORY, UNKNOWN_TRADITION_ID, TRADITIONS)).toThrow(
      String(UNKNOWN_TRADITION_ID),
    );
  });
});
