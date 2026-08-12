/*
 * Multiverse Mages — mastery that rises, so that teaching can happen at all.
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
 * ## The defect this closes
 *
 * `setMastery` had exactly one caller in the rules path — `decay.ts` — and it
 * only ever lowers. A researched instance is created at
 * {@link DEFAULT_INITIAL_MASTERY} (`fp(256)`), teaching requires
 * {@link DEFAULT_TEACH_THRESHOLD} (`fp(512)`), and nothing in the build could
 * move a number between the two. So **only knowledge the god granted was ever
 * teachable**, at `fp(1024)`, and it was taught out inside twenty world years.
 *
 * Measured on the 200-year reference run before this file existed: lessons per
 * twenty-year window ran 831 in the first and then collapsed, and the run's own
 * test file carried the finding as a tripwire — *"nothing a mage researches
 * clears the `fp(512)` teach threshold, so only founding grants are ever
 * teachable and they are taught out."*
 *
 * `vision.md` §5 lists teaching beside research and scribing as a first-class
 * operation — *"Teaching — mind → mind. Fast. Requires a living teacher and a
 * student with prerequisites"* — so a build in which it is unreachable in normal
 * play is not a tuning state, it is a missing rule.
 *
 * ## What rises, and why it is *this*
 *
 * **A mage deepens what she builds on.** Every world tick she spends deriving a
 * node, every prerequisite of that node which she holds in mind gains mastery.
 * Nothing else here does anything.
 *
 * The alternative — raising `DEFAULT_INITIAL_MASTERY` above the threshold — is
 * the null option and it deletes the distinction the threshold exists to draw.
 * `constants.ts` says so where the constant is declared: full mastery on the
 * tick of discovery *"would make practice meaningless and teaching lossless from
 * the first instance"*, and it names **practice** as the thing that was missing.
 * This is that practice, and it is derived rather than invented:
 *
 * - **§4** makes a node's prerequisites the structure of the grid. Working at
 *   the frontier is, mechanically, exercising everything under it.
 * - **§6** tunes species on `learnRate` *and* `retention` as separate traits.
 *   Retention already gates decay. With no gain path at all, `learnRate` gated
 *   only how fast a cost was paid and half the species table said nothing about
 *   how knowledge behaves once held. Here it gates gain, which is what a learn
 *   rate is.
 * - **§6a** wants a university that *"trains better mages"*. Mastery that only
 *   ever falls cannot express "better".
 *
 * The behaviour it produces is a rule a player can state: **you can teach what
 * you have moved past.** A mage's frontier node sits at its initial mastery
 * until she builds something on top of it, and then it becomes something she can
 * pass on. Founding grants arrive teachable and bootstrap the first generation;
 * from there the teaching graph runs one tier behind the research graph, which
 * is what a faculty is.
 *
 * ## It takes no draw
 *
 * Deliberately. `contracts.md` §6 makes adding a draw in one subsystem a thing
 * that must not re-roll another, and the cheapest way to honour that is not to
 * add one: practice is a deterministic function of the work already accounted
 * for. Research's stream-3 jitter is untouched, and every committed baseline
 * moves because *behaviour* moved rather than because the ordinals shifted
 * underneath it.
 *
 * ## Decay's floor is untouched, and still means what it said
 *
 * `decay.ts` argues its floor is deliberate — *"a mage who genuinely learned
 * something does not silently forget it"* — and nothing here contradicts that.
 * The floor is where an *unpractised* instance settles; this is what an instance
 * she is still using does instead. The two meet in the ordinary case: a mage
 * working past a node gains {@link MASTERY_GAIN_PER_TICK} scaled by her learn
 * rate and loses `masteryDecayPerTick(retention)` in the same tick, and the net
 * is positive for every shipped species — which is the arithmetic that makes
 * "practice beats forgetting while you are practising" true rather than hoped.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle } from '@mm/state';
import { mul } from '@mm/sim-core';

import { MASTERY_MAX } from './constants.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isHeldLocation } from './subsystem.js';

/**
 * Mastery a mage gains per world tick in a node she is actively building on,
 * at `fp(1024)` learn rate. **Untuned.**
 *
 * Four times `MASTERY_DECAY_PER_TICK`, and the ratio is the point rather than
 * either number: practice has to out-run forgetting for every shipped species or
 * the mechanism is decorative, and `retention` runs from `fp(512)` to
 * `fp(1536)` while `learnRate` runs from `fp(768)` to `fp(1280)`, so the worst
 * pairing still gains. At this value a mage crosses the `fp(256)` from a
 * researched instance to a teachable one in **roughly a year of fictional
 * time** spent on the tier above it.
 *
 * Declared here rather than in content, beside `MASTERY_DECAY_PER_TICK` and
 * against the local convention that magnitudes live in data. The pair is one
 * decision: a gain in a JSON file and a loss in a TypeScript constant is how the
 * two come to be retuned separately and to disagree about whether an instance
 * settles, rises or oscillates. The whole of `instances/constants.ts` is marked
 * untuned for the same reason and moves to content together or not at all.
 */
export const MASTERY_GAIN_PER_TICK: Fp = 32;

/** What one tick of practice did, for the explain channel. */
export interface PracticeOutcome {
  /** Instances whose mastery this call raised. */
  readonly deepened: number;
  /** Instances that crossed a threshold from below it to at-or-above it. */
  readonly crossed: number;
}

/**
 * Deepens every instance of `nodeIds` this subject holds in mind or palace.
 *
 * @param threshold - Reported against, never enforced. Supplying
 * `DEFAULT_TEACH_THRESHOLD` is what makes {@link PracticeOutcome.crossed} the
 * count of mages who became able to teach something this tick, which is the one
 * number that says whether this file is doing its job.
 * @returns What was raised. A projection; nothing in the rules path reads it.
 */
export function practise(
  knowledge: KnowledgeSubsystem,
  subject: Handle,
  nodeIds: readonly ContentId[],
  learnRate: Fp,
  threshold: Fp,
): PracticeOutcome {
  if (nodeIds.length === 0) return { deepened: 0, crossed: 0 };
  const gain = mul(MASTERY_GAIN_PER_TICK, Math.max(0, learnRate));
  if (gain <= 0) return { deepened: 0, crossed: 0 };

  const wanted = new Set<ContentId>(nodeIds);
  let deepened = 0;
  let crossed = 0;
  // Held instances only. A book on a shelf does not get better at being a book,
  // and `heldMastery` gives the same reason for excluding written copies from
  // teaching: *"letting a book teach would delete the whole reason mastery
  // exists."*
  for (const instance of knowledge.instancesHeldBy(subject)) {
    const view = knowledge.read(instance);
    if (!wanted.has(view.nodeId) || !isHeldLocation(view.locationKind)) continue;
    if (view.mastery >= MASTERY_MAX) continue;
    const raised = Math.min(MASTERY_MAX, view.mastery + gain);
    if (raised === view.mastery) continue;
    knowledge.setMastery(instance, raised);
    deepened += 1;
    if (view.mastery < threshold && raised >= threshold) crossed += 1;
  }
  return { deepened, crossed };
}
