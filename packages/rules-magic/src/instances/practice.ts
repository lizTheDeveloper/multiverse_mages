/*
 * Multiverse Mages — practice: the one operation that gives mastery back.
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
 * The operation `decay.ts` named and nobody wrote.
 *
 * > *"Nothing in this subsystem restores mastery; **practice does, and practice
 * > is an operation somebody has to perform.**"* — `decay.ts`, about itself
 *
 * Until this file, that sentence described a hole. Mastery fell every tick for
 * every held instance and **nothing anywhere raised it**, so the game shipped
 * the perish half of publish-or-perish and none of the publish half:
 * `ages-of-magic.md` §2c records the consequence, 93.4% of held instances below
 * the teach threshold and 28 of 51 nodes with no teachable copy anywhere, at an
 * instant when every redundancy metric reported the library healthy.
 *
 * ## Restoration lives here and not in `decay.ts`, and that is the whole point
 *
 * `decayedMastery` is *"a monotonically non-increasing function of mastery,
 * unconditionally"*, and it is that way because the alternative was a live
 * exploit: a fragment that survived an interdiction being clamped back **up** to
 * an ordinary retention floor the first non-dormant sweep after the god
 * relented, worth over a hundred ticks of forgetting, for free. Relaxing the
 * clamp to let mastery come back would reopen exactly that. So restoration is a
 * separate operation with a separate cost, in a separate file, and `decay.ts` is
 * untouched by this change.
 *
 * ## Practice is a project, not a per-tick top-up
 *
 * It accrues mage-months against a requirement and pays out once, the same shape
 * as research, teaching and scribing — because the design's claim is that
 * practice **competes for the month**. `ages-of-magic.md` §2b calls the
 * stationed set the tightest coupling in the design; a free per-tick refresh
 * would have added a fourth thing a mage does *without* taking anything away
 * from the other three, which is not a mechanic, it is a rebate.
 *
 * ## The requirement scales with tier, so mages drill their fundamentals
 *
 * A first-tier node is cheap to keep sharp and a seventh-tier one is not. With
 * `target-appeal.ts`' effort term preferring the cheaper candidate, that makes a
 * mage's practice load fall on the low tiers by default — which is
 * `ages-of-magic.md` §2c's own reading of what maintenance is for: *"it is the
 * prerequisites, the low tiers, the fundamentals, which is exactly the mass that
 * marooning eats."* The deep node she is famous for is expensive to maintain,
 * and letting it go is a decision she can be made to face.
 *
 * ## A forbidden cell cannot be practised, and that gate is load-bearing
 *
 * `refusePractice` checks `permits()` first. Without it the god's interdiction
 * would be reversible by the universe's own labour — issue an interdiction,
 * watch dormant decay run floorless toward destruction, and have the holder
 * practise the fragment back up. That is the same recovery `decay.ts` closed,
 * re-opened through a different door. An interdicted cell is one a mage may not
 * *work in*, which is what makes an interdiction cost anything.
 *
 * ## No draw, deliberately — and the reason is not `decay.ts`'s
 *
 * `decay.ts` takes no `rng` because a decay roll would jostle draw ordinals for
 * every instance in the universe. Practice takes none for a narrower reason:
 * `research.ts` argues that *"a subsystem that never draws is a subsystem whose
 * stream isolation nothing has ever exercised"*, and that argument is about
 * subsystems that own a stream. Practice owns none and inserts none. It adds no
 * ordinal to any existing stream either, so `rng-insertion-invariance` has
 * nothing new to test and every committed balance baseline's stream sequences
 * are untouched by this file. A restore quantum that was randomised would have
 * had to belong to somebody's stream, and there is no question here that
 * randomness answers: the mage did the months, she gets the mastery.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { permits } from '@mm/state';
import { FP_ONE, div } from '@mm/sim-core';

import type { CellResolver, KnowledgeNode, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import { MASTERY_MAX, PRACTICE_COST_PER_TIER, PRACTICE_MASTERY_RESTORE } from './constants.js';
import type { KnowledgeRefusal } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isHeldLocation } from './subsystem.js';

/** What one step of practice reads. */
export interface PracticeInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /**
   * The practitioner. An opaque handle, exactly as `research` takes one: it is
   * the instance's `locationId` and is never dereferenced into a mage record.
   */
  readonly subject: Handle;
  readonly nodeId: ContentId;
  readonly worldTick: Tick;
  /** Months accumulated before this step. The caller owns storing it. */
  readonly progress: Fp;
  /** Work applied this step. */
  readonly effort: Fp;
  /**
   * The **already stacked** `practice-rate` multiplier.
   *
   * Divides the requirement rather than multiplying the progress, for
   * `research.ts`' reason: *"a quick learner needs less progress rather than
   * earning more per step, which keeps a step's progress a function of the
   * effort supplied and nothing else — one place for rates to apply instead of
   * two."* Already stacked and already capped by the caller; a second fold here
   * is how two `+20%` bonuses come to mean different things in two packages.
   */
  readonly practiceRate?: Fp;
}

/** What one step of practice did. */
export interface PracticeOutcome {
  /** Present exactly when nothing changed. */
  readonly refusal?: KnowledgeRefusal;
  /** Months after this step. Unchanged from the input on a refusal. */
  readonly progress: Fp;
  /** Months this node needs to restore one quantum, under this subject's rate. */
  readonly required: Fp;
  readonly completed: boolean;
  /** The instance whose mastery moved, or `0`. */
  readonly instance: Handle;
  /** Mastery actually restored, after the clamp at {@link MASTERY_MAX}. */
  readonly restored: Fp;
}

/**
 * Mage-months one restore quantum of a node costs, under a practice rate.
 *
 * Exported because the outlook builder quotes it as a candidate's
 * `remainingCost` and the gateway charges it, and a price quoted in one place
 * and charged in another is how True Naming's halved teaching came to be
 * invisible to every mage deciding whether to seek a teacher.
 */
export function practiceRequirement(node: KnowledgeNode, practiceRate: Fp = FP_ONE): Fp {
  const base = PRACTICE_COST_PER_TIER * node.tier;
  // A zero rate is a mage who cannot practise at all rather than one who
  // practises instantly, and `div()` by zero is not a question the rules path
  // asks. Same guard, same wording, as `researchRequirement`.
  if (practiceRate <= 0) return base;
  return div(base, practiceRate);
}

/**
 * The instance this practice would sharpen: the subject's stalest copy.
 *
 * A mage may hold more than one instance of a node — the Art of Memory's palace
 * slots are the shipped case — and practising has to name one. The lowest
 * mastery is chosen because that is what maintenance means, and ties fall to the
 * lower handle, which is a total order over stable identities rather than over
 * whatever order the index happened to build.
 *
 * Exported for the outlook builder, which needs the same answer to quote a
 * candidate's staleness without duplicating the choice rule.
 */
export function stalestHeldInstance(
  knowledge: KnowledgeSubsystem,
  subject: Handle,
  nodeId: ContentId,
): Handle {
  let best: Handle = 0;
  let bestMastery = 0;
  for (const handle of knowledge.instancesHeldBy(subject)) {
    const row = knowledge.read(handle);
    if (row.nodeId !== nodeId) continue;
    if (!isHeldLocation(row.locationKind)) continue;
    if (best === 0 || row.mastery < bestMastery) {
      best = handle;
      bestMastery = row.mastery;
    }
  }
  return best;
}

/** What stops a practice step, or `undefined`. */
function refusePractice(inputs: PracticeInputs): KnowledgeRefusal | undefined {
  const cellId = inputs.cells.cellOf(inputs.nodeId);
  if (!permits(inputs.ruleset, cellId)) {
    return { reason: 'forbidden-cell', nodeId: inputs.nodeId, cellId };
  }
  const instance = stalestHeldInstance(inputs.knowledge, inputs.subject, inputs.nodeId);
  if (instance === 0) {
    return { reason: 'node-not-held', nodeId: inputs.nodeId, subject: inputs.subject };
  }
  if (inputs.knowledge.read(instance).mastery >= MASTERY_MAX) {
    return {
      reason: 'mastery-at-maximum',
      nodeId: inputs.nodeId,
      subject: inputs.subject,
      mastery: MASTERY_MAX,
    };
  }
  return undefined;
}

/**
 * Spends mage-months keeping a node sharp, and restores mastery on the tick the
 * requirement is met.
 *
 * A refusal leaves the stored total exactly where it was and changes no mastery,
 * which is `contributeResearch`' property and is what makes an interdiction
 * survivable: re-permitting the cell restores the project along with the
 * instances rather than needing a migration.
 */
export function practice(inputs: PracticeInputs): PracticeOutcome {
  const node = requireNode(inputs.catalog, inputs.nodeId);
  const required = practiceRequirement(node, inputs.practiceRate ?? FP_ONE);

  const refusal = refusePractice(inputs);
  if (refusal !== undefined) {
    return { refusal, progress: inputs.progress, required, completed: false, instance: 0, restored: 0 };
  }

  const progress = inputs.progress + inputs.effort;
  if (progress < required) {
    return { progress, required, completed: false, instance: 0, restored: 0 };
  }

  const instance = stalestHeldInstance(inputs.knowledge, inputs.subject, inputs.nodeId);
  const before = inputs.knowledge.read(instance).mastery;
  const after = Math.min(before + PRACTICE_MASTERY_RESTORE, MASTERY_MAX);
  inputs.knowledge.setMastery(instance, after);
  return { progress, required, completed: true, instance, restored: after - before };
}

/**
 * Whether a node is worth practising for this subject right now.
 *
 * The outlook builder's gate, kept beside the refusal it mirrors so the two
 * cannot drift: a candidate this returns `false` for is one `practice` would
 * refuse, and offering it would let a mage commit a month to a project that can
 * never complete — the "career quietly evaporates" failure `feasibility.ts`
 * rejects by name.
 */
export function isPractisable(
  knowledge: KnowledgeSubsystem,
  cells: CellResolver,
  ruleset: Ruleset,
  subject: Handle,
  nodeId: ContentId,
): boolean {
  if (!permits(ruleset, cells.cellOf(nodeId))) return false;
  const instance = stalestHeldInstance(knowledge, subject, nodeId);
  if (instance === 0) return false;
  return knowledge.read(instance).mastery < MASTERY_MAX;
}
