/*
 * Multiverse Mages — practice: the one operation that raises mastery.
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
 * The missing operation, named by the module that could not perform it.
 *
 * `decay.ts` about itself: *"Nothing in this subsystem restores mastery;
 * **practice does, and practice is an operation somebody has to perform.**"*
 * This is that operation. Until it existed `setMastery` had exactly one
 * rules-path caller — the decay sweep — and that caller only ever lowered, so
 * the knowledge lifecycle was a strict descent:
 *
 * - research creates an instance at `DEFAULT_INITIAL_MASTERY` (256),
 * - `DEFAULT_TEACH_THRESHOLD` (512) is the mastery below which nobody may teach,
 * - and `MASTERY_ACTIVATION_THRESHOLD` (512) is the mastery below which nobody
 *   may cast.
 *
 * **The interval was empty.** A node a mage worked out for herself could never
 * be taught, never be cast, and never reach the economy: it sat in one head at
 * 256, declined to her species' floor, and died with her. Every teachable
 * instance in a universe descended from a god's founding grant at 1024 and was
 * sliding back down. `tools/w196/mastery-crossings.mjs` measured the
 * consequence over the reference scenario rather than deriving it: **zero**
 * upward crossings of the threshold, across every seed, while 31–150 nodes per
 * run were *born* above it from grants.
 *
 * ## Why practice and not use, teaching, study, or tenure
 *
 * `docs/design/metis-from-use-results.md` §6 recommends exactly this operation
 * and the recommendation survives its own ruling — see that document's
 * re-decision section. The short form of why the alternatives lose:
 *
 * - **Applied use** (`GOAL.applyMagic`) cannot bootstrap. `castableNodes` gates
 *   casting at `MASTERY_ACTIVATION_THRESHOLD`, which *is* 512, so a
 *   self-researched node at 256 is not castable either. Casting does raise
 *   mastery now — it is practice with a product — but it can only maintain what
 *   something else lifted.
 * - **Teaching and study create instances**; neither raises one already held.
 *   Teaching from a below-threshold teacher is forbidden by the same threshold,
 *   so a universe with nothing above it has nothing to transmit.
 * - **Time at an institution** is a passive per-tick accrual, which is the shape
 *   `metis-from-use-results` §2 measured and rejected: it ranks a god by how
 *   little it interferes (1.0001× for the idle bot, 877× against the active
 *   one). A goal spends a month, so an idle universe does not get it for free.
 *
 * ## The ceiling is what keeps a population stratified
 *
 * Mastery rising must not mean every mage converges on mastery of everything.
 * The design is explicit that low-tier casters have to stay in the population —
 * *"you need low level spell casters to stay in the population to continuously
 * cast, like, identify objects"* — so practice is bounded by
 * {@link practiceCeiling}, and the bound is **per mage, per node**: it depends
 * on how much room the mage's species `depthCeiling` leaves above the node's
 * tier.
 *
 * At `PRACTICE_CEILING_BASE` = the teach threshold and
 * `PRACTICE_CEILING_PER_TIER` = 256, the rule reads:
 *
 * | headroom (`depthCeiling − tier`) | ceiling | what it means |
 * |---|---|---|
 * | 0 — at her limit | 512 | teachable only *while she keeps practising*; one tick of decay takes it back |
 * | 1 | 768 | teachable, with a window |
 * | ≥2 — well within reach | 1024 | full mastery; teachable and lossless |
 *
 * So an orc (`depthCeiling` 3) masters tier-1 utility magic completely and
 * teaches it forever, and is permanently incapable of teaching tier 3 without
 * standing at the desk every month. A draconic scholar (`depthCeiling` 7) is
 * the only creature in the shipped six who can practise a tier-7 node at all,
 * and even she can only hold it at exactly the threshold. Deep knowledge stays
 * rare and fragile; shallow knowledge becomes common and durable. **That is the
 * stratification, and it falls out of one subtraction.**
 *
 * ## Nothing here draws
 *
 * No RNG stream, no new stream id, and deliberately: `RNG_STREAM` is a
 * committed enumeration and a new draw re-rolls every baseline that follows it.
 * Practice is a deterministic function of effort, species and the node's tier.
 * Research's jitter already exercises stream isolation for this package.
 */

import type { ContentId, Fp } from '@mm/content';
import { FP_ONE, mul } from '@mm/sim-core';
import type { Handle, Ruleset } from '@mm/state';
import { permits } from '@mm/state';

import type { CellResolver, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import {
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_MAX,
  PRACTICE_CEILING_BASE,
  PRACTICE_CEILING_PER_TIER,
  PRACTICE_GAIN_PER_MONTH,
} from './constants.js';
import type { KnowledgeRefusal } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isHeldLocation } from './subsystem.js';

/**
 * The highest mastery practice can carry one mage's copy of one node to.
 *
 * `min(MASTERY_MAX, base + perTier × max(0, depthCeiling − tier))`.
 *
 * The subtraction is the whole rule and the clamp at zero is what makes it safe
 * to call for a node the mage should not be able to hold at all: a negative
 * headroom is treated as none, so the ceiling is the base rather than something
 * below it. A node above her `depthCeiling` is refused elsewhere — by the
 * gateway's frontier and by the teachability scan — and this function does not
 * duplicate that judgement, it merely declines to reward it.
 *
 * **Untuned**, like everything else in `constants.ts`, but two properties are
 * claims rather than placeholders and `practice.test.ts` pins both: it is
 * monotone non-decreasing in headroom, and it never exceeds {@link MASTERY_MAX}.
 */
export function practiceCeiling(
  tier: number,
  depthCeiling: number,
  base: Fp = PRACTICE_CEILING_BASE,
  perTier: Fp = PRACTICE_CEILING_PER_TIER,
): Fp {
  const headroom = Math.max(0, depthCeiling - tier);
  return Math.min(MASTERY_MAX, base + perTier * headroom);
}

/**
 * Mastery after one contribution of practice. Pure, and **never lower than the
 * mastery it was given**.
 *
 * The mirror of `decayedMastery`'s monotonicity, and for the same reason that
 * function gives: an operation named for one direction that can move the other
 * way is a bug nobody reads as one. A mage already above her ceiling — which a
 * god's grant at 1024 puts her, for any node at her limit — keeps every unit of
 * it. Practice does not level knowledge down to what she could have reached on
 * her own; it only declines to add.
 */
export function practicedMastery(current: Fp, ceiling: Fp, gain: Fp): Fp {
  if (gain <= 0) return current;
  if (current >= ceiling) return current;
  return Math.min(ceiling, current + gain);
}

export interface PracticeInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /** The mage at the desk. Her own copy is the one that improves. */
  readonly subject: Handle;
  readonly nodeId: ContentId;
  /** Mage-months spent, `fp`. `FP_ONE` is one month. */
  readonly effort: Fp;
  /**
   * Species `learnRate` (`contracts.md` §2.4), `fp(1024)` neutral.
   *
   * A multiplier on the gain rather than a divisor on a requirement, which is
   * the opposite of what `research.ts` does with the same trait — and the
   * difference is real rather than an inconsistency. Research has a
   * *requirement* to scale; practice has no project and no completion, only a
   * rate of improvement, so the only place a rate can apply is the increment.
   */
  readonly learnRate?: Fp;
  /** Species `depthCeiling` (`contracts.md` §2.4). Sets {@link practiceCeiling}. */
  readonly depthCeiling: number;
  /** Defaults to {@link PRACTICE_GAIN_PER_MONTH}. */
  readonly gainPerMonth?: Fp;
  /**
   * Defaults to {@link DEFAULT_TEACH_THRESHOLD}.
   *
   * **Reported against only.** It decides
   * {@link PracticeOutcome.crossedTeachThreshold} and nothing else — it does
   * not move the ceiling, which comes from {@link PRACTICE_CEILING_BASE}. The
   * two are equal in the shipped constants on purpose, so a caller who raises
   * this one alone will get an outcome that can never report a crossing. Raise
   * both or neither.
   */
  readonly teachThreshold?: Fp;
}

export interface PracticeOutcome {
  readonly refusal?: KnowledgeRefusal;
  /** The instance that improved, or `0`. */
  readonly instance: Handle;
  /** Her mastery after the month. On a refusal, what she had. */
  readonly mastery: Fp;
  /** Units added. `0` for a mage already at her ceiling — not a refusal. */
  readonly gained: Fp;
  /** The ceiling this month was bounded by, for reporting and for tests. */
  readonly ceiling: Fp;
  /**
   * Whether this contribution carried the instance **up** across the teach
   * threshold.
   *
   * The event the whole change exists to make possible, reported so that a
   * caller can count it without diffing state. `false` when she was already
   * above it: a crossing is a transition, not a level.
   */
  readonly crossedTeachThreshold: boolean;
}

/**
 * Spends effort improving a node the subject already holds.
 *
 * Refuses on a forbidden cell — practice is a *use* of magic and an interdicted
 * art cannot be used, which is the same gate `castableNodes` applies and the
 * reason a dormant instance decays instead of being drilled back up — and on a
 * node she does not hold in mind or palace. A book on her shelf is not
 * practice: reading one is `study`, and it creates an instance rather than
 * improving one.
 *
 * Takes the **best** copy she holds, matching `teach`'s rule for the same
 * situation: *"a mage with two instances of one node is unusual but reachable
 * through raid theft, and teaching from the worse copy would be a rule nobody
 * wrote down."*
 */
export function practice(inputs: PracticeInputs): PracticeOutcome {
  const node = requireNode(inputs.catalog, inputs.nodeId);
  const threshold = inputs.teachThreshold ?? DEFAULT_TEACH_THRESHOLD;

  const cellId = inputs.cells.cellOf(inputs.nodeId);
  if (!permits(inputs.ruleset, cellId)) {
    return refuse({ reason: 'forbidden-cell', nodeId: inputs.nodeId, cellId });
  }

  const best = bestHeldInstance(inputs.knowledge, inputs.subject, inputs.nodeId);
  if (best === undefined) {
    return refuse({ reason: 'node-not-held', nodeId: inputs.nodeId, subject: inputs.subject });
  }

  const ceiling = practiceCeiling(node.tier, inputs.depthCeiling);
  const effort = Math.max(0, inputs.effort);
  const gain = mul(
    mul(inputs.gainPerMonth ?? PRACTICE_GAIN_PER_MONTH, effort),
    inputs.learnRate ?? FP_ONE,
  );
  const mastery = practicedMastery(best.mastery, ceiling, gain);
  if (mastery !== best.mastery) inputs.knowledge.setMastery(best.instance, mastery);

  return {
    instance: best.instance,
    mastery,
    gained: mastery - best.mastery,
    ceiling,
    crossedTeachThreshold: best.mastery < threshold && mastery >= threshold,
  };
}

/** The best copy of one node a subject holds in mind or palace, with its handle. */
function bestHeldInstance(
  knowledge: KnowledgeSubsystem,
  subject: Handle,
  nodeId: ContentId,
): { instance: Handle; mastery: Fp } | undefined {
  let best: { instance: Handle; mastery: Fp } | undefined;
  for (const instance of knowledge.instancesHeldBy(subject)) {
    const view = knowledge.read(instance);
    if (view.nodeId !== nodeId || !isHeldLocation(view.locationKind)) continue;
    if (best === undefined || view.mastery > best.mastery) best = { instance, mastery: view.mastery };
  }
  return best;
}

function refuse(refusal: KnowledgeRefusal): PracticeOutcome {
  return { refusal, instance: 0, mastery: 0, gained: 0, ceiling: 0, crossedTeachThreshold: false };
}
