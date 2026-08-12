/*
 * Multiverse Mages — adversarial: a cost bound that changes behaviour, by
 * making a mage abandon a project that is still perfectly possible.
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
 * # THIS TEST FAILS ON PURPOSE
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `select.ts`'s `targetStillAvailable` decides that a mage's committed goal has
 * become **infeasible** when the node it is pointed at is absent from the
 * matching list on `MageOutlook`. Those lists are not "everything the mage
 * could work on" — they are the truncated output of `candidates.ts`'s
 * `gatherFrontier`, capped at `MAX_CANDIDATE_TARGETS` and ordered cheapest
 * first.
 *
 * So a mage who commits to researching a moderately expensive node is thrown
 * off it the moment sixteen cheaper nodes exist, even though nothing about that
 * node changed: not its prerequisites, not the mage's depth ceiling, not the
 * universe's materials. `reevaluationReason` returns `'infeasible'`, which
 * outranks both the evaluation phase and the minimum commitment period, so the
 * mage re-evaluates in that same tick, re-targets, resets `adoptedTick`, and
 * reports a goal switch.
 *
 * Nothing anywhere records that the "infeasibility" was an artefact of a
 * truncation. It is indistinguishable in the emitted histogram from a mage
 * whose research genuinely became impossible.
 *
 * ## (b) The lines that say it should be otherwise
 *
 * The `mage-autonomy` spec, "Evaluation is staggered and goals are held with
 * hysteresis":
 *
 *   > a newly adopted goal MUST be held for a minimum commitment period
 *   > **unless it completes or becomes infeasible**.
 *
 * and its scenario:
 *
 *   > #### Scenario: Infeasibility interrupts commitment
 *   > - **WHEN** a mage's committed goal becomes infeasible before its minimum
 *   >   commitment elapses
 *
 * The committed goal here has not become infeasible. `feasibility.ts`'s own
 * header is explicit that infeasibility is meant to be a real state a mage is
 * in — *"infeasibility becomes a state you can count rather than a behaviour
 * you have to infer"* — not a side effect of how many candidates were sampled.
 *
 * `candidates.ts` states plainly that the bound is a **cost** device and says
 * what it is supposed to buy:
 *
 *   > A constant makes adding a hundred nodes a content decision rather than a
 *   > performance regression discovered in a 200-year run.
 *
 * Adding a hundred nodes is not a content decision if it also makes every mage
 * in the universe drop what she was doing. `design.md` makes the same promise
 * for the other half of the same mechanism — the stagger divides the hot loop
 * *"with no loss of fidelity"* — which is the standard an optimisation is held
 * to here.
 *
 * ## (c) Why the asserted values are the right ones
 *
 * The test asserts that a mage who committed to node `900` on tick 0 is still
 * committed to goal `research-node` and target `900` on tick 1, when node `900`
 * is still returned by the gateway's unbounded frontier and is still within her
 * species' `depthCeiling` — i.e. still researchable in every sense the spec
 * gives the word. The only thing that changed is that thirty-two cheaper nodes
 * appeared, so the bounded gather no longer surfaces it.
 *
 * The three assertions are mutually satisfiable: an implementation that keeps
 * the committed target in view (either by seeding the bounded gather with it,
 * or by not equating "absent from a truncated list" with "infeasible") returns
 * `reason` `'held'`, `switched` `false`, and `targetNodeId` `900` together. The
 * control assertion first shows that node `900` *is* still on the unbounded
 * frontier, so nothing here asks for a target that has genuinely gone.
 *
 * Note this is a seam defect: the fix may belong in `candidates.ts`, in
 * whatever assembles a `MageOutlook`, or in `select.ts`. The test is written
 * against the composition on purpose, and drives the real `gatherFrontier`
 * rather than hand-building a truncated list, so that it cannot be dismissed as
 * an outlook a caller would never produce.
 */

import { describe, expect, it } from 'vitest';

import type { ContentId } from '@mm/content';

import {
  GOAL,
  MAX_CANDIDATE_TARGETS,
  MIN_COMMITMENT_TICKS,
  gatherFrontier,
  selectGoal,
} from '../../src/index.js';
import type { MageGoalCommitment, KnowledgeGateway, KnowledgeTarget } from '../../src/index.js';

import { appealWeights, outlook, speciesNamed, target } from '../unit/autonomy-fixtures.js';
import { stepRng } from '../unit/mage-fixtures.js';

/** The node the mage commits to. Tier 1, so no depth ceiling can exclude it. */
const COMMITTED_NODE: ContentId = 900;

/**
 * A gateway that answers `researchFrontier` the way any sane implementation
 * would: the `limit` cheapest things the mage could work on.
 *
 * That ordering is what makes the truncation bite. It is not adversarial — it
 * is the same "cheapest first" order `candidates.ts` itself imposes downstream,
 * and `select.ts` justifies as *"the cheapest target is the one that completes
 * soonest"*.
 */
function gatewayOver(all: readonly KnowledgeTarget[]): KnowledgeGateway {
  const byCost = [...all].sort((a, b) => a.remainingCost - b.remainingCost || a.nodeId - b.nodeId);
  return {
    instanceCount: () => 1,
    everKnown: () => false,
    knows: () => false,
    researchFrontier: (_mage, limit) => byCost.slice(0, limit),
    canTeach: () => false,
    teachableTo: () => undefined,
    scribableBy: () => undefined,
    contributeResearch: () => undefined,
    contributeTeaching: () => undefined,
    contributeScribing: () => undefined,
    onMageDied: () => undefined,
  };
}

describe('a bounded candidate scan must not end a commitment', () => {
  it('keeps a mage on a node that only fell out of the cheapest sixteen', () => {
    const species = speciesNamed('human');
    const mage = 1;

    // Tick 0: one thing to research, and the mage commits to it.
    const alone = gatewayOver([target(COMMITTED_NODE, 1, 4096)]);
    const first = selectGoal({
      appeal: appealWeights,
      outlook: outlook({
        mage,
        discoveryTargets: gatherFrontier(alone, mage, species).discovery,
      }),
      worldTick: 0,
      incumbent: undefined,
      rng: stepRng(4242, 0),
    });
    expect(first.commitment.goalId).toBe(GOAL.researchNode);
    expect(first.commitment.targetNodeId).toBe(COMMITTED_NODE);

    const committed: MageGoalCommitment = first.commitment;

    // Tick 1, well inside the minimum commitment period. Thirty-two cheaper
    // nodes have appeared — new content, or other mages' progress. Nothing has
    // happened to node 900.
    const crowded: KnowledgeTarget[] = [target(COMMITTED_NODE, 1, 4096)];
    for (let index = 0; index < MAX_CANDIDATE_TARGETS * 2; index += 1) {
      crowded.push(target(100 + index, 1, 64 + index));
    }
    const later = gatewayOver(crowded);

    // Control: node 900 is still researchable. An unbounded ask still returns
    // it, so this test is not asking the mage to keep a target that has gone.
    expect(later.researchFrontier(mage, crowded.length).map((entry) => entry.nodeId)).toContain(
      COMMITTED_NODE,
    );

    const worldTick = 1;
    expect(worldTick).toBeLessThan(MIN_COMMITMENT_TICKS);

    const second = selectGoal({
      appeal: appealWeights,
      outlook: outlook({
        mage,
        discoveryTargets: gatherFrontier(later, mage, species).discovery,
      }),
      worldTick,
      incumbent: committed,
      rng: stepRng(4242, worldTick),
    });

    expect(second.reason).toBe('held');
    expect(second.switched).toBe(false);
    expect(second.commitment.targetNodeId).toBe(COMMITTED_NODE);
  });
});
