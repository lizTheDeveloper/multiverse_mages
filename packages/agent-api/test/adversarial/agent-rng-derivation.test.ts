/*
 * Multiverse Mages — adversarial: the agent generator's coordinate derivation.
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
 * # DEFECT 5 — the agent-RNG coordinate string is ambiguous
 *
 * Two tests here **fail on purpose**.
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `agentRng` derives from the text
 * `` `${AGENT_DOMAIN}/${runSeed}/${agentSlotIndex}/${strategyId}` `` and `fork`
 * appends `` `/fork/${label}` ``. `/` is the delimiter, and `assertLabel`
 * permits it — it checks only that the string is non-empty and ASCII. So the
 * delimiter can appear inside a field, and two structurally different
 * generators flatten to one string:
 *
 * ```
 * agentRng({ …, strategyId: 'greedy' }).fork('explore')
 *   → 'mm-agent-rng/1/7/0/greedy/fork/explore'
 * agentRng({ …, strategyId: 'greedy/fork/explore' })
 *   → 'mm-agent-rng/1/7/0/greedy/fork/explore'
 * ```
 *
 * and likewise `fork('a').fork('b')` equals `fork('a/fork/b')`. Both pairs draw
 * byte-identical sequences, verified below.
 *
 * ## (b) What says otherwise
 *
 * `src/agent-rng.ts` on the namespace prefix, which is the module's own
 * statement of the property being broken:
 *
 * > Present so that the text hashed here **can never coincide with anything else
 * > hashed with the same function**, and versioned so that changing the
 * > derivation is a visible act rather than a silent re-seed of every recorded
 * > tournament.
 *
 * `src/agent-rng.ts` again, in `assertLabel`'s own refusal message, naming this
 * exact consequence as the reason a label may not be empty:
 *
 * > It is part of the derivation, and an empty one **would make two
 * > differently-named uses draw the same numbers**.
 *
 * And on `fork`:
 *
 * > A pure function of this generator's coordinates and the label, so forking
 * > order does not matter and **adding a fork does not disturb an existing one**.
 *
 * ## (c) Why the asserted value is right
 *
 * A generator's identity is `(runSeed, agentSlotIndex, strategyId)` plus a fork
 * path — four coordinates the spec names — and two different coordinate tuples
 * are two different generators. `assertLabel` already refuses an empty label
 * *because* two differently-named uses must not coincide; a label containing the
 * delimiter produces the same coincidence by a different route, so refusing one
 * and permitting the other is inconsistent rather than a considered tradeoff.
 *
 * The consequence is the one §6 is written to prevent, one layer out: a
 * tournament that runs `greedy` with an `explore` fork alongside a strategy
 * registered as `greedy/fork/explore` gets two arms that are not independent,
 * and nothing anywhere reports it. The probability of hitting it by accident is
 * low — it needs the literal infix `/fork/` — and the cost of closing it is one
 * character-class check in `assertLabel` or a length-prefixed encoding, so the
 * expected-value case for fixing is strong even though the expected-frequency
 * case is weak. That asymmetry is worth stating plainly rather than dressing
 * the finding up as likely.
 *
 * The assertions are over **sequences**, not single draws: each compares
 * thirty-two consecutive `nextUint32` values, so a pass cannot come from one
 * lucky coincidence and a failure cannot come from one unlucky one.
 */

import type { AgentRng } from '@mm/agent-api';
import { agentRng } from '@mm/agent-api';
import { describe, expect, it } from 'vitest';

/** Thirty-two consecutive draws. A sequence, never one sample. */
function sequence(rng: AgentRng): number[] {
  return Array.from({ length: 32 }, () => rng.nextUint32());
}

describe('DEFECT 5 — two distinct agent generators draw identical sequences', () => {
  it('FAILS ON PURPOSE: a strategy id containing the fork delimiter collides with a fork', () => {
    const forked = agentRng({ runSeed: 7, agentSlotIndex: 0, strategyId: 'greedy' }).fork('explore');
    const named = agentRng({ runSeed: 7, agentSlotIndex: 0, strategyId: 'greedy/fork/explore' });
    expect(sequence(named)).not.toEqual(sequence(forked));
  });

  it('FAILS ON PURPOSE: a fork label containing the delimiter collides with a fork chain', () => {
    const base = (): AgentRng =>
      agentRng({ runSeed: 7, agentSlotIndex: 0, strategyId: 'narrow-depth' });
    const chained = base().fork('exploration').fork('tie-break');
    const flattened = base().fork('exploration/fork/tie-break');
    expect(sequence(flattened)).not.toEqual(sequence(chained));
  });

  it('HOLDS: the three named coordinates each separate generators', () => {
    // The control, and the reason the two failures are about the *delimiter*
    // and not about the derivation being broken generally. runSeed and
    // agentSlotIndex are stringified integers and cannot contain the delimiter,
    // so no ambiguity is reachable through them.
    const base = { runSeed: 7, agentSlotIndex: 0, strategyId: 'narrow-depth' } as const;
    const reference = sequence(agentRng(base));
    expect(sequence(agentRng({ ...base, runSeed: 8 }))).not.toEqual(reference);
    expect(sequence(agentRng({ ...base, agentSlotIndex: 1 }))).not.toEqual(reference);
    expect(sequence(agentRng({ ...base, strategyId: 'narrow-depth2' }))).not.toEqual(reference);
    expect(sequence(agentRng({ ...base }))).toEqual(reference);
  });

  it('HOLDS: forking is order-independent and does not disturb an existing fork', () => {
    const base = { runSeed: 11, agentSlotIndex: 2, strategyId: 'wide' } as const;
    const first = sequence(agentRng(base).fork('a'));
    // Draw a different fork in between; the first fork's sequence must not move.
    const parent = agentRng(base);
    sequence(parent.fork('z'));
    expect(sequence(parent.fork('a'))).toEqual(first);
  });

  it('HOLDS: a fork is not the parent, and parent draws do not advance a fork', () => {
    const parent = agentRng({ runSeed: 11, agentSlotIndex: 2, strategyId: 'wide' });
    const forkBefore = sequence(parent.fork('a'));
    sequence(parent);
    expect(sequence(parent.fork('a'))).toEqual(forkBefore);
  });

  it('HOLDS: nextBelow is in range across a large sample, and is not constant', () => {
    // An expectation over many draws, never one sample: the assertion is on the
    // support of the distribution and on the sample not collapsing, both of
    // which hold for any correct unbiased generator.
    const rng = agentRng({ runSeed: 3, agentSlotIndex: 0, strategyId: 'sampler' });
    const seen = new Set<number>();
    for (let draw = 0; draw < 4_096; draw += 1) {
      const value = rng.nextBelow(16);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(16);
      seen.add(value);
    }
    // 4096 draws over 16 buckets: the chance any bucket is empty is about
    // 16 * (15/16)^4096, which is smaller than 1e-110. Asserting full coverage
    // is safe in a way that asserting any individual draw would not be.
    expect(seen.size).toBe(16);
  });
});
