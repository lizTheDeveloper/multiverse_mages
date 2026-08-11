/*
 * Multiverse Mages — teaching, mind to mind, with the loss that makes it matter.
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
 * One mage teaching another, and the reason a civilization that teaches faster
 * than it masters ends up with a wide, shallow, fragile body of magic.
 *
 * `contracts.md` §1.5 says `fp(1024)` mastery means "teachable without loss"
 * and never defines the loss. The resolution this change applies, and reports:
 * below a declared eligibility threshold a mage cannot teach the node at all;
 * at or above it but below full mastery she teaches successfully and the
 * student's instance is created at a reduced mastery; at `fp(1024)` there is no
 * reduction.
 *
 * The consequence is deliberate and is the point. Knowledge degrades across a
 * chain of mediocre teachers, so `knowledgeHalfLife` and `libraryDependence`
 * have something to detect — and with lossless teaching they would not, because
 * a single archmage could seed an entire academy at full strength in a month.
 *
 * ## The draw always happens, and usually does nothing
 *
 * Stream 4's draw jitters the teacher's **shortfall**, not the transmitted
 * mastery. A teacher at full mastery has no shortfall, so the jitter has
 * nothing to act on and the requirement "carries no transmission reduction"
 * holds exactly rather than on average — while the draw still occurs, so the
 * stream's ordinals do not depend on how good the teacher happened to be.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { LOCATION_KIND, permits } from '@mm/state';
import { FP_ONE, RNG_STREAM, mul, nextBounded } from '@mm/sim-core';

import type { CellResolver, KnowledgeRng, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import { DEFAULT_TEACH_THRESHOLD, MASTERY_MAX, TEACHING_JITTER_SPAN } from './constants.js';
import type { KnowledgeRefusal } from './outcomes.js';
import { unsatisfiedPrerequisite } from './research.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isHeldLocation } from './subsystem.js';

export interface TeachingInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  readonly rng: KnowledgeRng;
  /** The teacher. Opaque, and the actor key for stream 4. */
  readonly teacher: Handle;
  /** The student. Opaque; the created instance's `locationId`. */
  readonly student: Handle;
  readonly nodeId: ContentId;
  readonly worldTick: Tick;
  /** `contracts.md` §1.5's `TEACH_THRESHOLD`. Defaults to the placeholder. */
  readonly threshold?: Fp;
  /** Where the student's instance lands. `mind` unless the tradition says palace. */
  readonly locationKind?: number;
}

export interface TeachingOutcome {
  readonly refusal?: KnowledgeRefusal;
  /** The student's new instance, or `0`. */
  readonly instance: Handle;
  /** The mastery it was created at. */
  readonly mastery: Fp;
  /** The mastery it was transmitted from. */
  readonly teacherMastery: Fp;
}

/**
 * What a student receives from a teacher at a given mastery.
 *
 * `mul(teacherMastery, retained)` where `retained` is full mastery less the
 * jittered shortfall. Two properties are load-bearing and both are asserted:
 * at `fp(1024)` the result is `fp(1024)` exactly, and anywhere in
 * `0 < mastery < fp(1024)` the result is strictly lower than the teacher's own
 * mastery — which is what makes degradation *compound* down a chain rather
 * than settle at a plateau. (At mastery `0` there is nothing to lose; that
 * teacher is refused by the eligibility threshold long before reaching here.)
 *
 * ## Why the naive `mul` cannot express "strictly lossy"
 *
 * `mul(a, b)` floors `(a * b) / FP_ONE`, and flooring destroys the property at
 * the one place it is easiest to reach. A teacher one unit below full mastery
 * has `shortfall === 1`, and `mul(1, factor)` is `0` for **every** factor
 * strictly below `FP_ONE` — so any negative jitter, roughly half the real
 * `[-TEACHING_JITTER_SPAN, TEACHING_JITTER_SPAN]` draw range, rounds the whole
 * shortfall away before it can act. `jittered === 0` makes `retained ===
 * MASTERY_MAX`, and `mul(capped, MASTERY_MAX) === capped` exactly: teaching
 * became lossless for a teacher who is *not* fully masterful. A mastery around
 * `1020` is one ordinary decay tick away from full, not a contrived input, so
 * this was reachable in play and would have flattened the compounding chain.
 *
 * The fix is to floor the *loss* at one unit — the finest thing fixed point at
 * 1/1024 can represent — rather than at zero, whenever the teacher is short of
 * full at all. `jittered >= 1` with `capped >= 1` makes
 * `capped * (MASTERY_MAX - jittered) / MASTERY_MAX` strictly less than `capped`
 * as a real number, so its floor is at most `capped - 1`. A teacher at exactly
 * `MASTERY_MAX` still has `shortfall === 0`, and the clamp does not apply to
 * her: losslessness at the top stays exact rather than becoming "usually".
 *
 * **Untuned.** That this curve is the right one is not a claim 0.3.0 can make;
 * that it is monotone and lossless at the top is.
 */
export function transmittedMastery(teacherMastery: Fp, jitter: Fp): Fp {
  const capped = Math.min(teacherMastery, MASTERY_MAX);
  const shortfall = MASTERY_MAX - capped;
  if (shortfall <= 0) return capped;

  const scaled = mul(shortfall, FP_ONE + jitter);
  // At least one unit: see the docstring. Zero here would mean "taught without
  // loss by a teacher who has not mastered it", which the spec forbids.
  const jittered = Math.min(Math.max(scaled, 1), MASTERY_MAX);
  const retained = MASTERY_MAX - jittered;
  return mul(capped, retained);
}

/**
 * Teaches a node from one mage to another.
 *
 * The teacher's mastery is the highest she holds of that node — a mage with two
 * instances of one node is unusual but reachable through raid theft, and
 * teaching from the worse copy would be a rule nobody wrote down.
 */
export function teach(inputs: TeachingInputs): TeachingOutcome {
  const node = requireNode(inputs.catalog, inputs.nodeId);
  const threshold = inputs.threshold ?? DEFAULT_TEACH_THRESHOLD;

  if (!inputs.knowledge.exists(inputs.nodeId)) {
    return refuse({ reason: 'node-lost', nodeId: inputs.nodeId });
  }

  const cellId = inputs.cells.cellOf(inputs.nodeId);
  if (!permits(inputs.ruleset, cellId)) {
    return refuse({ reason: 'forbidden-cell', nodeId: inputs.nodeId, cellId });
  }

  const teacherMastery = heldMastery(inputs.knowledge, inputs.teacher, inputs.nodeId);
  if (teacherMastery === undefined) {
    return refuse({ reason: 'node-not-held', nodeId: inputs.nodeId, subject: inputs.teacher });
  }
  if (teacherMastery < threshold) {
    return refuse(
      { reason: 'teacher-below-threshold', nodeId: inputs.nodeId, mastery: teacherMastery, threshold },
      teacherMastery,
    );
  }

  const missing = unsatisfiedPrerequisite(
    {
      knowledge: inputs.knowledge,
      cells: inputs.cells,
      ruleset: inputs.ruleset,
      subject: inputs.student,
      nodeId: inputs.nodeId,
    },
    node,
  );
  if (missing !== undefined) return refuse(missing, teacherMastery);

  const stream = inputs.rng.actorStream(RNG_STREAM.teaching, inputs.teacher);
  const jitter = nextBounded(stream, TEACHING_JITTER_SPAN * 2 + 1) - TEACHING_JITTER_SPAN;
  const mastery = transmittedMastery(teacherMastery, jitter);

  const instance = inputs.knowledge.createInstance({
    nodeId: inputs.nodeId,
    locationKind: inputs.locationKind ?? LOCATION_KIND.mind,
    locationId: inputs.student,
    acquiredTick: inputs.worldTick,
    mastery,
  });
  return { instance, mastery, teacherMastery };
}

/**
 * The highest mastery a mage holds of a node in mind or palace, or `undefined`.
 *
 * Written instances are excluded deliberately: a mage reading from a grimoire
 * has not learned the node, and letting a book teach would delete the whole
 * reason mastery exists. Copying a book is a scribing operation in the other
 * direction, and reading one into a mind is `mages-and-species`' study loop.
 */
export function heldMastery(
  knowledge: KnowledgeSubsystem,
  subject: Handle,
  nodeId: ContentId,
): Fp | undefined {
  let best: Fp | undefined;
  for (const instance of knowledge.instancesHeldBy(subject)) {
    const view = knowledge.read(instance);
    if (view.nodeId !== nodeId || !isHeldLocation(view.locationKind)) continue;
    if (best === undefined || view.mastery > best) best = view.mastery;
  }
  return best;
}

function refuse(refusal: KnowledgeRefusal, teacherMastery: Fp = 0): TeachingOutcome {
  return { refusal, instance: 0, mastery: 0, teacherMastery };
}
