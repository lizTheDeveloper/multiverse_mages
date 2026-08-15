/*
 * Multiverse Mages — the audit's action names cannot fall behind the action space.
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
 * `strategy-audit.ts` carries a private array of §4.2 action names and reads it
 * through `actionName()`, which falls back to `` `action-${id}` `` for an id
 * nobody named. **The array is correct today** — sixteen names against
 * `ACTION_SPACE_SIZE` sixteen — and this file is not here to fix it. It is here
 * because nothing pinned the two together, and the fallback is what makes that
 * dangerous rather than merely untidy: the seventeenth action prints
 * `action-16` in every audit table a human reads, and no test fails. A defect
 * whose only symptom is a slightly worse-looking report is a defect that
 * survives review.
 *
 * ## Three assertions, and the third is the one that earns its keep
 *
 * A length check alone is not enough, because `ACTION_NAMES` is **positional**.
 * An action inserted into the middle of `GOD_ACTION` with a name appended to the
 * end of the array passes a length check while mislabelling every row after the
 * insertion — a table that is confidently wrong, which is worse than one that
 * says `action-16` and admits it. So the names are checked against the
 * `GOD_ACTION` keys **at their own ids**, which is the only check that survives
 * a reorder.
 *
 * If a display name should ever deliberately diverge from its identifier, this
 * file is where that decision gets recorded. That is the point: right now the
 * two agree by accident, and an accident is not a decision.
 *
 * ## The array stays private
 *
 * Everything below goes through `actionName()`. Exporting `ACTION_NAMES` to
 * test it would widen the module's surface to satisfy a test, and the fallback
 * probe gets the length bound without it — see the out-of-range case.
 */

import { describe, expect, it } from 'vitest';

import { ACTION_SPACE_SIZE, GOD_ACTION } from '@mm/agent-api';
import { actionName } from '@mm/scenario';

/** What `actionName()` returns for an id nobody named. */
const FALLBACK = /^action-\d+$/;

describe('the audit names every action the action space has', () => {
  it('names every id in GOD_ACTION, with no fallback', () => {
    for (const [key, id] of Object.entries(GOD_ACTION)) {
      expect(
        actionName(id),
        `action ${key} (id ${String(id)}) has no name in strategy-audit.ts's ACTION_NAMES, so ` +
          `every audit table prints its id instead. Add the name at index ${String(id)}.`,
      ).not.toMatch(FALLBACK);
    }
  });

  it('names each id with its own GOD_ACTION key, so a reorder cannot slide the table', () => {
    // Read as a map from id to key first, so the comparison is against the id
    // rather than against enumeration order — `Object.entries` order and the
    // numeric ids are two different things and only one of them is the contract.
    const keyOf = new Map<number, string>(
      Object.entries(GOD_ACTION).map(([key, id]) => [id as number, key]),
    );
    for (const [id, key] of [...keyOf].sort((a, b) => a[0] - b[0])) {
      expect(
        `${String(id)}: ${actionName(id)}`,
        `action id ${String(id)} is \`${key}\` in GOD_ACTION but \`${actionName(id)}\` in ` +
          `strategy-audit.ts. ACTION_NAMES is positional: if an action was inserted rather ` +
          `than appended, every name after it has slid by one.`,
      ).toBe(`${String(id)}: ${key}`);
    }
  });

  it('has no name beyond the action space, and the fallback probe works', () => {
    // The length bound, from the other side. If ACTION_NAMES grew past the
    // action space — a name added for an action that was then reverted — this
    // is what catches it.
    expect(actionName(ACTION_SPACE_SIZE)).toMatch(FALLBACK);

    // The positive control. Both assertions above are negatives against
    // `FALLBACK`, and a negative assertion against a pattern that never matches
    // anything passes for the wrong reason forever. This is the input the probe
    // must reject, and it is far outside any plausible action space.
    expect(actionName(9_999)).toBe('action-9999');
  });

  it('gives no two actions the same name', () => {
    const names = Object.values(GOD_ACTION).map((id) => actionName(id));
    expect(new Set(names).size, `duplicate action names: ${names.join(', ')}`).toBe(names.length);
  });
});
