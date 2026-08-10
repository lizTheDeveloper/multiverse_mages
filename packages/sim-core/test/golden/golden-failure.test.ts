/*
 * Multiverse Mages — what the golden harness says when a fixture stops
 * reproducing, asserted on the failing path.
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
 * Covers `deterministic-replay` → "Nondeterminism fails the build":
 *
 * > **WHEN** the golden suite replays a fixture against a world whose systems
 * > differ from the recorded ones from tick `T` onward
 * > **THEN** the replay reports divergence at exactly tick `T`, and the rendered
 * > failure message contains the fixture's filename and `T`
 *
 * The failure message was previously handed straight to `expect(…)` and
 * rendered only on a failing run — which, in a green repository, is never. So
 * the one piece of the determinism gate that carries information rather than a
 * boolean had no test at all, and could have rotted into "expected true to be
 * false" without anything going red. It would have rotted on the exact run
 * where someone needed it.
 *
 * Nothing here reads or writes the committed fixtures except to replay them.
 */

import { describe, expect, it } from 'vitest';

import { checkFixture, describeDivergence, readFixture } from './harness.js';
import { ACADEMY_WORLD_ID, academyDriftingFrom, worldById } from './worlds.js';

const FIXTURE = 'world-time-only.json';

/**
 * The tick the drifted world changes its rules at.
 *
 * `world-time-only` has an empty prelude and never changes time mode, so its
 * initial snapshot sits at world tick 0 and `step` hands each system the tick
 * the state arrived with. Step ordinal and world tick are therefore the same
 * number for this fixture, and only for a fixture shaped like it — which is why
 * this test names one fixture rather than looping over the directory.
 *
 * Five is late enough that the fixture's scholars have been enrolled (they
 * arrive on ticks 0 and 1) and early enough that none has run out of vitality,
 * so the drift is guaranteed to change the tick-5 hash and not some later one.
 */
const DRIFT_TICK = 5;

describe('a fixture replayed against changed rules', () => {
  const drifted = checkFixture(FIXTURE, {
    resolveWorld: () => academyDriftingFrom(DRIFT_TICK),
  });

  it('is reported as diverged at exactly the tick the rules changed', () => {
    expect(drifted.result.diverged).toBe(true);
    expect(drifted.result.tick).toBe(DRIFT_TICK);
  });

  it('renders a message naming the fixture file and the diverging tick', () => {
    // The two facts the message exists to carry. Asserted as the rendered
    // phrases rather than as bare substrings: the message also prints the root
    // seed and the tick count, so looking for "5" on its own would pass on a
    // message that had lost the tick entirely.
    expect(drifted.detail).toContain(`"${FIXTURE}"`);
    expect(drifted.detail).toContain(`diverging tick: ${DRIFT_TICK}`);
  });

  it('renders the context a reader needs to act on it', () => {
    const fixture = readFixture(FIXTURE);
    expect(drifted.detail).toContain(fixture.description);
    expect(drifted.detail).toContain(ACADEMY_WORLD_ID);
    expect(drifted.detail).toContain(String(fixture.rootSeed));
    // Not decoration. Without it the next step after a red build is a guess,
    // and the most tempting guess is to regenerate until it goes green.
    expect(drifted.detail).toContain('npm run goldens:regen');
    expect(drifted.detail).toContain('behaviour changed on purpose');
  });

  it('quotes the hashes that disagreed', () => {
    expect(drifted.detail).toContain(readFixture(FIXTURE).tickHashes[DRIFT_TICK] as string);
  });
});

describe('the same fixture against the real world', () => {
  it('does not diverge, so the drift above is what failed it', () => {
    // The control. Without it, every assertion above would still pass if the
    // fixture were simply broken, and the test would be proving nothing about
    // the harness's ability to localise a rules change.
    const control = checkFixture(FIXTURE, { resolveWorld: worldById });
    expect(control.result.diverged).toBe(false);
    expect(control.result.tick).toBeNull();
    expect(control.detail).toBe('');
  });
});

describe('when the diverging tick cannot be located', () => {
  it('says so instead of printing a tick that does not exist', () => {
    // `replayAndLocate` returns `tick: null` when a recording carries no
    // per-tick hashes. Printing `null` — or worse, `0` — would send a reader to
    // the wrong tick, which is more expensive than admitting the run cannot be
    // localised.
    const message = describeDivergence(FIXTURE, readFixture(FIXTURE), {
      state: null as never,
      diverged: true,
      tick: null,
      reason: 'no per-tick hashes',
    });
    expect(message).toContain('diverging tick: (not located)');
    expect(message).not.toContain('diverging tick: null');
  });
});
