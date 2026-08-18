/*
 * Multiverse Mages — a counting ablation mask, so a null result can be read.
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
 * An {@link AblationMask} that records what it was asked, and answers nothing
 * differently for having recorded it.
 *
 * ## Why this exists
 *
 * `ablation-reaches-the-world-loop.test.ts` and
 * `combat-ablation-reaches-a-raid.test.ts` both work the same way: run two
 * universes, one ablated, and assert they differ. That is the right shape and
 * it has one blind spot, which is the blind spot CLAUDE.md's *"a checker that
 * answers about the wrong input is worse than no checker"* is about.
 *
 * **When such a test reports "no difference", it cannot say which of three
 * things happened**, and they have opposite consequences:
 *
 * 1. The mask never reached {@link stackMagnitudes} at all — the seam from
 *    `ReferenceScenarioOptions.ablation` through `WorldStepDeps.ablation` is
 *    severed. Then *every* ablation number in this repository is void, because
 *    every arm ran the unablated universe. This is the defect
 *    `ablation-reaches-the-world-loop.test.ts` was written for after a counter
 *    reported **0 of 70,462** stacked magnitudes seeing a mask.
 * 2. The mask reached the arithmetic but the named primitive is never stacked
 *    in this run. Then the arm is a null *by construction* and reporting it as
 *    a measured effect of zero is a fabricated finding.
 * 3. The mask substituted the neutralization thousands of times and the
 *    universe absorbed it. Then the null is a real, reportable result.
 *
 * A pass/fail assertion on the census folds all three into "no". This mask is
 * the third exit — the local precedent is `scripts/w117-gate-check.sh`, whose
 * `0` / `42` / `1` exits keep *"the probe is broken"* out of *"the answer is
 * no"*.
 *
 * ## Why it is inert, and why that is asserted rather than argued
 *
 * {@link countingMask} with a `target` no primitive has answers `false` to
 * every question, so `stackMagnitudes` takes the identical unmasked branch it
 * always takes and the run is byte-identical to a run with no mask at all.
 * `ablation-mask-is-consulted.test.ts` asserts that against a snapshot hash,
 * because a probe that perturbed the universe would be censusing a different
 * universe than the one the ablation tests measure.
 *
 * ## Deliberately not production code
 *
 * A counter inside `stackMagnitudes` would be the other way to do this, and it
 * would put mutable per-run state on the hottest function in the rules path for
 * the benefit of one test. `AblationMask` is an interface with two members and
 * the scenario already threads a caller-supplied one end to end, so a test can
 * observe the seam from outside without production carrying the instrument.
 */

import type { AblationMask } from '@mm/coordination';

/** An {@link AblationMask} that also reports what the rules path asked it. */
export interface CountingMask extends AblationMask {
  /**
   * Every primitive id `stackMagnitudes` asked about, and how often.
   *
   * One entry per `stackMagnitudes` call, so the *keys* are the census of which
   * primitives a run stacks at all — which is the question distinguishing
   * reading 1 from reading 2 above. An empty map is reading 1.
   */
  readonly asked: ReadonlyMap<string, number>;
  /** How many of those asks this mask answered `true` — i.e. neutralized. */
  neutralizations(): number;
  /** `asked` summed. Zero means the mask never reached the arithmetic. */
  consultations(): number;
}

/**
 * A mask neutralizing `target`, counting every question it is asked.
 *
 * @param target - The primitive to neutralize. Pass {@link UNMATCHABLE} for an
 * inert probe that censuses a run without changing it.
 */
export function countingMask(target: string): CountingMask {
  const asked = new Map<string, number>();
  let hits = 0;
  return {
    neutralizedPrimitiveId: target,
    neutralizes(candidate: string): boolean {
      asked.set(candidate, (asked.get(candidate) ?? 0) + 1);
      if (candidate !== target) return false;
      hits += 1;
      return true;
    },
    asked,
    neutralizations: () => hits,
    consultations: () => {
      let total = 0;
      for (const count of asked.values()) total += count;
      return total;
    },
  };
}

/**
 * A primitive id no content can declare, for the inert probe.
 *
 * `primitive.schema.json` constrains ids to lower-case words and hyphens, so
 * the underscores here cannot collide with a real primitive however content
 * grows. Not the empty string: `neutralizing` refuses that, deliberately, and
 * this value has to survive being handed to the same seam a real arm uses.
 */
export const UNMATCHABLE = '__no_such_primitive__';
