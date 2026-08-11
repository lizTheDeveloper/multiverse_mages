/*
 * Multiverse Mages — documents an open ambiguity: standard raider, prepared host.
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
 * `packages/rules-magic/src/traditions/portal.ts`'s own docstring on
 * `populatePreparedSpells` names this exact case as an open question it
 * deliberately declines to answer:
 *
 *   > Under a `standard` home kind the list is empty, and that is not a gap...
 *   > what she can do in a `prepared` host sky is `raid-engagement`'s
 *   > question... Recorded as an open ambiguity for this change's closeout
 *   > rather than answered here by picking whichever reading was convenient.
 *
 * Per rule 4 of this task's instructions, an expectation the code's own
 * comments say is deliberately unresolved is not one this suite can defend as
 * "wrong" — so this is **not** a red test. It documents, and asserts, the
 * concrete consequence of the current (declared-open) reading: a mage whose
 * home tradition has no notion of preparation arrives at a `prepared` host
 * with an empty `preparedSpells` list and *no* way to cast anything there,
 * for the whole engagement, because there is no world time inside a raid in
 * which to prepare one. That total-refusal behaviour is worth having on
 * record precisely because it is a real, load-bearing consequence of an
 * "unanswered" question, not because it is asserted to be the intended
 * answer.
 *
 * Reported as category (c) in this task's write-up.
 */

import { describe, expect, it } from 'vitest';

import { hookFor, portalHookSet, resolvePortalHooks } from '../../src/traditions/index.js';
import { populatePreparedSpells, releaseAbroad } from '../../src/traditions/portal.js';
import { ART_OF_MEMORY, TRADITIONS, VANCIAN } from '../unit/tradition-fixtures.js';

describe('a standard-cast raider entering a prepared-cast host (documented open ambiguity)', () => {
  it('confirms the fixture premise: Art of Memory casts standard, Vancian casts prepared', () => {
    expect(hookFor('cast', ART_OF_MEMORY, ART_OF_MEMORY, TRADITIONS).kind).toBe('standard');
    expect(hookFor('cast', VANCIAN, VANCIAN, TRADITIONS).kind).toBe('prepared');
  });

  it('arrives with an empty preparedSpells list, even holding a usable, prepared-at-home node', () => {
    const hooks = resolvePortalHooks(portalHookSet(ART_OF_MEMORY, VANCIAN, TRADITIONS));
    const entry = populatePreparedSpells(hooks, [
      { nodeId: 42, locationKind: 1 /* mind */, usable: true, preparedAtHome: true },
    ]);

    // Not a bug per portal.ts's own comment: a `standard` home kind has no
    // preparation list to populate from, "and that is not a gap".
    expect(entry.preparedSpells).toEqual([]);
    expect(entry.spentFromPreparations).toBe(true); // the host is `prepared`
  });

  it('as a result, cannot cast the node at all under the host sky, for any baseCost', () => {
    const hooks = resolvePortalHooks(portalHookSet(ART_OF_MEMORY, VANCIAN, TRADITIONS));
    const entry = populatePreparedSpells(hooks, [
      { nodeId: 42, locationKind: 1, usable: true, preparedAtHome: true },
    ]);

    const outcome = releaseAbroad(hooks, entry.preparedSpells, 42, 1024);

    expect(outcome.cast).toBe(false);
    expect(outcome.cost).toBe(0);
    expect(outcome.refusal).toContain('is not prepared');
  });
});
