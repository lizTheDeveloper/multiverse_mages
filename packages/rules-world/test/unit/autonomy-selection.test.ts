/*
 * Multiverse Mages — selection is deterministic, ties draw from stream 7, and
 * affiliation is one field write.
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
 * The stream-7 requirement has a clause that is easy to satisfy accidentally
 * and hard to satisfy on purpose: *"adding a draw in another subsystem does not
 * change it."* A tie-break that used `rng.stream(7)` rather than
 * `rng.actorStream(7, mage)` would pass a determinism test, pass a "which
 * stream" test, and still re-roll every mage's tie the moment somebody inserted
 * a mage earlier in the loop. So the draws are counted, and the stream identity
 * is asserted against the recording RNG's issue log rather than inferred.
 */

import { describe, expect, it } from 'vitest';

import { RNG_STREAM } from '@mm/sim-core';

import { GOAL, argmaxWithTieBreak, chooseTarget, completeAffiliation, selectGoal } from '../../src/index.js';
import type { GoalScore } from '../../src/index.js';

import { outlook, richOutlook, target } from './autonomy-fixtures.js';
import { mageRow, recordingRng, stepRng } from './mage-fixtures.js';

const scored = (goal: number, score: number): GoalScore => ({
  goal: goal as GoalScore['goal'],
  score,
  terms: { base: score, role: 0, species: 0, personality: 0, age: 0, opportunity: 0 },
  rawTotal: score,
  clamped: false,
});

describe('the argmax takes the highest score', () => {
  it('needs no draw when there is a single leader', () => {
    const rng = recordingRng(4242, 0);
    const { winner, tiedAtTop } = argmaxWithTieBreak(
      [scored(GOAL.idle, 0), scored(GOAL.teach, 700), scored(GOAL.scribe, 300)],
      rng,
      17,
    );
    expect(winner.goal).toBe(GOAL.teach);
    expect(tiedAtTop).toBe(1);
    expect(rng.drawsOn(RNG_STREAM.autonomy)).toBe(0);
  });

  it('refuses an empty score list rather than inventing a goal', () => {
    expect(() => argmaxWithTieBreak([], stepRng(1, 0), 1)).toThrow(/empty score list/u);
  });
});

describe('ties are broken on stream 7, keyed on the mage', () => {
  const tie = [scored(GOAL.teach, 700), scored(GOAL.scribe, 700)];

  it('draws exactly once, from the autonomy stream', () => {
    const rng = recordingRng(4242, 0);
    argmaxWithTieBreak(tie, rng, 17);
    expect(rng.drawsOn(RNG_STREAM.autonomy)).toBe(1);
    expect(rng.issued).toEqual([{ subsystemId: RNG_STREAM.autonomy, actorKey: 17 }]);
  });

  it('touches no other subsystem', () => {
    const rng = recordingRng(4242, 0);
    argmaxWithTieBreak(tie, rng, 17);
    for (const stream of Object.values(RNG_STREAM)) {
      if (stream === RNG_STREAM.autonomy) continue;
      expect(rng.drawsOn(stream)).toBe(0);
    }
  });

  it('keys the stream on the mage, so one mage cannot shift another', () => {
    // The property that fails if the implementation uses a whole-tick stream:
    // there, the answer for a given mage would depend on how many mages were
    // resolved before her.
    const first = argmaxWithTieBreak(tie, stepRng(4242, 0), 17).winner.goal;
    const again = argmaxWithTieBreak(tie, stepRng(4242, 0), 17).winner.goal;
    expect(again).toBe(first);

    const differentMages = new Set(
      [11, 12, 13, 14, 15, 16, 17, 18].map(
        (mage) => `${String(mage)}:${String(argmaxWithTieBreak(tie, stepRng(4242, 0), mage).winner.goal)}`,
      ),
    );
    // Eight mages, two possible answers -- the set of "mage:goal" strings has
    // eight members either way; what matters is that at least two *goals*
    // appear, i.e. the mage key reaches the draw.
    expect(differentMages.size).toBe(8);
    const goals = new Set(
      [11, 12, 13, 14, 15, 16, 17, 18].map(
        (mage) => argmaxWithTieBreak(tie, stepRng(4242, 0), mage).winner.goal,
      ),
    );
    expect(goals.size).toBeGreaterThan(1);
  });

  it('reports how many goals were tied, so a run of ties is visible', () => {
    expect(argmaxWithTieBreak(tie, stepRng(1, 0), 3).tiedAtTop).toBe(2);
  });
});

describe('identical runs select identical goals', () => {
  it('reproduces every decision from the same root seed', () => {
    const decide = (): string[] => {
      const trace: string[] = [];
      for (let tick = 0; tick < 24; tick += 1) {
        for (let mage = 1; mage <= 12; mage += 1) {
          const selection = selectGoal({
            outlook: richOutlook({ mage }),
            worldTick: tick,
            incumbent: undefined,
            rng: stepRng(20260811, tick),
          });
          trace.push(`${String(selection.commitment.goal)}/${String(selection.commitment.targetNodeId)}`);
        }
      }
      return trace;
    };
    expect(decide()).toEqual(decide());
  });
});

describe('targets are chosen cheapest first', () => {
  it('picks the cheapest candidate and breaks cost ties on node id', () => {
    const state = richOutlook({
      discoveryTargets: [target(9, 1, 100), target(4, 1, 100), target(2, 1, 900)],
    });
    expect(chooseTarget(GOAL.researchNode, state)).toBe(4);
  });

  it('returns the absent reference for a goal that needs no node', () => {
    expect(chooseTarget(GOAL.idle, richOutlook())).toBe(0);
    expect(chooseTarget(GOAL.wardDuty, richOutlook())).toBe(0);
  });

  it('re-points a goal whose committed target has gone', () => {
    const first = selectGoal({
      outlook: richOutlook({ mage: 3, discoveryTargets: [target(11, 1, 10)] }),
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(7, 0),
    });
    expect(first.commitment.targetNodeId).toBe(11);

    const gone = selectGoal({
      outlook: richOutlook({ mage: 3, discoveryTargets: [target(12, 1, 10)] }),
      worldTick: 1,
      incumbent: first.commitment,
      rng: stepRng(7, 1),
    });
    // The old target is no longer a candidate, so the incumbent is infeasible
    // and the mage re-evaluates in that same tick rather than working toward a
    // node that is not there.
    expect(gone.reason).toBe('infeasible');
    expect(gone.commitment.targetNodeId).not.toBe(11);
  });
});

describe('affiliation completes in the tick it completes', () => {
  it('writes universityId and nothing else', () => {
    const mage = mageRow({ universityId: 3, roleId: 2, curiosity: 777 });
    const moved = completeAffiliation(mage, richOutlook({ preferredUniversity: 9 }));
    expect(moved).toBe(9);
    expect(mage.universityId).toBe(9);
    expect(mage.roleId).toBe(2);
    expect(mage.curiosity).toBe(777);
  });

  it('leaves a mage where she is when the outlook offers nowhere better', () => {
    const mage = mageRow({ universityId: 3 });
    expect(completeAffiliation(mage, outlook({ betterAffiliationAvailable: false }))).toBe(3);
    expect(mage.universityId).toBe(3);
  });

  it('introduces no intermediate state between the two universities', () => {
    // There is nothing to assert *for* here, so the assertion is about the
    // shape: the mage record has ten fields, none of them a journey, and the
    // move is one assignment. A `travellingTo` field would fail this.
    const mage = mageRow({ universityId: 3 });
    const before = Object.keys(mage).sort();
    completeAffiliation(mage, richOutlook({ preferredUniversity: 9 }));
    expect(Object.keys(mage).sort()).toEqual(before);
  });
});
