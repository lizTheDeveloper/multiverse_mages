/*
 * Multiverse Mages — adversarial: contentRevision must be carried at its full width.
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
 * ## The defect this guards against
 *
 * `computeContentRevision` returns a 128-bit hash as 32 hex characters.
 * `SimState.contentRevision`, the snapshot header, and `RulesetSnapshot` all
 * used to store that value as a `uint32` — so three quarters of it were
 * discarded at the boundary, silently, with no conversion anywhere anyone
 * could point at.
 *
 * `docs/design/contracts.md` §0 makes equality of this value the gate on
 * whether two universes may interact at all: a raid, a match. There is no
 * partial-compatibility rule and no negotiation. Folded to 32 bits, "equal
 * revisions" therefore meant *probably* identical content — and the failure
 * mode of "probably" here is two genuinely incompatible universes admitted to
 * the same ranked match, which is a desync, which is the one thing 0.16.0
 * claims zero of.
 *
 * ## Why this test searches instead of asserting a constant
 *
 * The argument for the fix is a birthday bound: at 32 bits, a collision among
 * N distinct content sets becomes likely around N ≈ 2^16, roughly 65,000 —
 * an ordinary number of content sets once content is moddable, not an
 * adversarial one. That claim is checkable rather than rhetorical, so this
 * test checks it: it enumerates distinct content sets in order until two of
 * them agree on the first 32 bits of their revisions, and reports how many it
 * took. The pair it finds is exactly the input the old carrier could not tell
 * apart and the new one can.
 *
 * The search is deterministic — the same enumeration, in the same order, on
 * every machine — and terminates in well under the ceiling below. It is not a
 * randomized or flaky test.
 */

import { describe, expect, it } from 'vitest';

import type { RevisionEntry } from '@mm/content';
import { computeContentRevision } from '@mm/content';

/** How wide the field used to be, in hex characters. */
const FOLDED_HEX_LENGTH = 8;

/** How wide it is now, and what `computeContentRevision` has always produced. */
const FULL_HEX_LENGTH = 32;

/**
 * Far past the ~2^16 the birthday bound predicts, so the loop is bounded
 * without being tuned to the answer. If this ever runs out, the hash's
 * distribution has changed and that is worth knowing loudly.
 */
const SEARCH_CEILING = 1_000_000;

const REVISION_SHAPE = /^[0-9a-f]{32}$/;

/** One distinct content set: a single node record, numbered. */
function contentSet(index: number): readonly RevisionEntry[] {
  return [{ namespace: 'node', contentId: index, record: { id: `node-${index}`, tier: 1 } }];
}

/** What the field used to keep of a revision. */
const folded = (revision: string): string => revision.slice(0, FOLDED_HEX_LENGTH);

/**
 * The first two distinct content sets, in enumeration order, whose revisions
 * agree on their top 32 bits.
 */
function findFoldCollision(): {
  readonly low: string;
  readonly high: string;
  readonly examined: number;
} {
  const byFold = new Map<string, string>();
  for (let index = 0; index < SEARCH_CEILING; index += 1) {
    const revision = computeContentRevision(contentSet(index));
    const previous = byFold.get(folded(revision));
    if (previous !== undefined && previous !== revision) {
      return { low: previous, high: revision, examined: index + 1 };
    }
    byFold.set(folded(revision), revision);
  }
  throw new Error(
    `No two of ${SEARCH_CEILING} distinct content sets shared the first ${FOLDED_HEX_LENGTH} hex ` +
      'characters of their revision. That contradicts the birthday bound this test exists to ' +
      'demonstrate, so the hash has changed in a way worth investigating.',
  );
}

const collision = findFoldCollision();

describe('contentRevision is carried at 128 bits, not folded to 32', () => {
  it('two ordinary content sets collide in the top 32 bits well inside the birthday bound', () => {
    expect(collision.low).not.toBe(collision.high);
    expect(folded(collision.low)).toBe(folded(collision.high));

    // The whole argument for the fix, as a number: not an adversarial input,
    // just more content sets than a modded install would find remarkable.
    expect(collision.examined).toBeLessThan(300_000);
  });

  it('the full-width revisions differ, so the two sets are distinguishable', () => {
    // Below the fold is the only place they differ — which is precisely the
    // part a uint32 carrier discarded.
    expect(collision.low.slice(FOLDED_HEX_LENGTH)).not.toBe(
      collision.high.slice(FOLDED_HEX_LENGTH),
    );
  });

  it('renders the full 128 bits as 32 lowercase hex characters', () => {
    // The shape `SimState.contentRevision` and the snapshot header validate
    // against. Stated here too, because content is where the value is born and
    // a change to the rendering would reach them as a load-time failure with
    // no obvious cause.
    expect(collision.low).toMatch(REVISION_SHAPE);
    expect(collision.high).toMatch(REVISION_SHAPE);
    expect(collision.low).toHaveLength(FULL_HEX_LENGTH);
  });

  it('is stable: the same content set hashes the same way twice', () => {
    // Rules out the degenerate way to pass the tests above — a revision that
    // varied per call would never collide and would also never be a
    // compatibility gate.
    expect(computeContentRevision(contentSet(1))).toBe(computeContentRevision(contentSet(1)));
    expect(computeContentRevision(contentSet(1))).not.toBe(computeContentRevision(contentSet(2)));
  });
});
