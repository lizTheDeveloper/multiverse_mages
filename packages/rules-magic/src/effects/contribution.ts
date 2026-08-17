/*
 * Multiverse Mages — what a gathered effect contribution is, and is not.
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
 * ## The shape is the requirement
 *
 * `magic-primitives` states it as a scenario rather than as a type: *"every
 * entry in it is already legal, and no legality field is carried forward for a
 * consumer to re-test."* {@link EffectContribution} is that sentence as a
 * record. There is no `legal`, no `permitted`, no `dormant`, and no `cellId` —
 * nothing a downstream consumer could read as an invitation to re-decide a
 * question that was settled when the contribution was gathered.
 *
 * This matters more than it looks. A `legal: true` field costs nothing to add
 * and reads as helpful, and the failure it causes is not that someone re-tests
 * it — it is that two consumers end up testing it *differently*, one treating
 * `false` as "skip" and the other as "already skipped", and the disagreement is
 * invisible in both call sites. Absence is the only version of the rule that
 * cannot be misread.
 *
 * ## And the magnitude is carried, not combined
 *
 * A contribution holds one source's raw magnitude in the primitive's own units.
 * Combining them is `@mm/primitives`' job and nothing here may anticipate it —
 * see `stack.ts`.
 */

import type { ContentId, EffectTarget, GradeRequirement } from '@mm/content';
import type { Fixed } from '@mm/sim-core';
import { LOCATION_KIND } from '@mm/state';

/**
 * One legal, in-scale, above-threshold source of one primitive.
 *
 * Every field is data the stacker or its caller needs. Legality is not among
 * them, deliberately — see this module's opening note.
 */
export interface EffectContribution {
  /** The node the effect was declared on, for attribution and diagnostics. */
  readonly nodeId: ContentId;
  /** The registry primitive id, which selects the stacking rule and the cap. */
  readonly primitiveId: string;
  /** This source's magnitude, in the primitive's own units. Never pre-combined. */
  readonly magnitude: Fixed;
  readonly target: EffectTarget;
  readonly durationTicks: number;
  /**
   * Which of the node's effects this is, `0`-based and in authored order.
   *
   * Carried so that two effects of one node stay distinguishable downstream —
   * `cig-the-standing-furnace` declares both an `area-denial` and a
   * `resource-yield`, and only the second is gated on ore. Without an index the
   * pair collapses to one node id and a consumer cannot say which effect it is
   * holding.
   */
  readonly effectIndex: number;
  /**
   * Refined material this effect must be holding to contribute, if any.
   *
   * Passed through untouched. `gatherEffects` deliberately does not decide
   * whether the requirement is met: it has no view of a material stock and
   * `contracts.md` §5 keeps `rules-magic` out of the economy. The consumer that
   * *does* hold the stock — `coordination`'s `universe-effects.ts` — is the one
   * that gates. Absent means unconditional, which is what every effect authored
   * before grades existed means.
   */
  readonly requires?: GradeRequirement;
}

/**
 * The part of a knowledge instance that effect gathering reads.
 *
 * Structural rather than an import of `KnowledgeInstanceRecord`, so a component
 * row, a snapshot reading, and a hand-built test fixture are all the same input
 * — and so that this file does not depend on how task group 4 chooses to store
 * instances. It reads three fields and writes none.
 */
export interface EffectSourceInstance {
  readonly nodeId: ContentId;
  /** {@link LOCATION_KIND}. */
  readonly locationKind: number;
  /** `0` just learned, `fp(1024)` teachable without loss (`contracts.md` §1.5). */
  readonly mastery: Fixed;
}

/**
 * The two locations a held instance can contribute from.
 *
 * Mind and palace, and emphatically not grimoire or library. `magic-primitives`
 * requires that written instances produce no direct contribution and that a
 * library's influence appear *solely* through the published library-depth
 * function — which is what stops books being a second, invisible source of
 * power that no balance assertion is written over. A shelf full of
 * `research-rate` grimoires that nobody has read is exactly as magical as a
 * shelf.
 *
 * `LOCATION_KIND.palace` is here because the Art of Memory stores its
 * instances there instead of in a mind; a palace is a mind by another spelling,
 * not a book.
 */
export const CONTRIBUTING_LOCATION_KINDS: ReadonlySet<number> = new Set([
  LOCATION_KIND.mind,
  LOCATION_KIND.palace,
]);

/**
 * The mastery at which a held instance starts contributing its node's effects.
 *
 * The design decision behind it: *"a civilization that learns broadly and
 * shallowly holds a great deal of knowledge that does nothing yet."* Without a
 * threshold, the tick a research operation completes the mage delivers full
 * magnitude, and mastery becomes a stat that governs only teaching fidelity.
 *
 * **Untuned, and half of full mastery is a placeholder, not a finding.** It
 * lives here as a constant rather than in `node.json` because `contracts.md`
 * §2.3 declares no field for it and this change may not add one; every entry
 * point takes it as an option so a caller — and, at 0.5.0, the balance harness
 * — can move it without touching this file.
 */
export const MASTERY_ACTIVATION_THRESHOLD: Fixed = 512;
