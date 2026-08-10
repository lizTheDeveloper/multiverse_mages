/*
 * Multiverse Mages — the explain channel's shape. Types only, deliberately.
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
 * `docs/design/contracts.md` §4.4's explain channel — its shape, and the three
 * properties that are not negotiable about it.
 *
 * > **The explain channel** is a separate, optional projection carrying the
 * > reasons behind autonomous mage decisions — utility scores and the goal
 * > chosen. It exists because vision §7 makes mage autonomy a design pillar
 * > while §5 forbids the renderer computing rules: with no data path, a client
 * > can show what mages *did* but never why, and autonomy reads as randomness.
 * >
 * > It is **not** part of the RL observation. It is emitted on request, is
 * > never an input to any rules computation, and no simulation behaviour may
 * > depend on whether it was requested.
 *
 * ## Why this file has types and no code
 *
 * The channel carries *"utility scores and the goal chosen"*, and both come
 * from the utility-AI scoring functions §8 leaves to `rules-world` — which is a
 * skeleton. There are no scores to project. Writing a producer now would mean
 * inventing the goal vocabulary that `mages-and-species` owns, in the package
 * that is furthest downstream of it.
 *
 * What is worth pinning now is the *shape*, and one structural fact about it:
 * **the explain projection is not reachable from {@link AgentView}.** That is
 * not an oversight. §4.4's "not part of the RL observation" is enforced by the
 * observation having no field for it — a nullable `explain` on `AgentView`
 * would be a channel a policy could learn to read, and "no simulation behaviour
 * may depend on whether it was requested" would then rest on everybody
 * remembering. When `rules-world` can produce these records, they travel as a
 * separate return value from a separate call.
 */

/** One autonomous decision, as a client would render it. */
export interface ExplainedDecision {
  /** The mage who decided. A stable entity handle. */
  readonly actorHandle: number;
  /** The goal she chose. Vocabulary is `rules-world`'s to name. */
  readonly goalId: number;
  /**
   * The utility of each goal considered, as `fp`.
   *
   * Fixed-point, not normalized: this is a report of what the rules computed,
   * and the rules compute in `fp`. Converting here would put a second float
   * boundary in the package, and `./normalize.ts` argues at length for there
   * being exactly one.
   */
  readonly scores: ReadonlyMap<number, number>;
}

/** One tick's decisions, emitted only when asked for. */
export interface ExplainProjection {
  /** The tick these decisions were taken on, in the scale that was running. */
  readonly tick: number;
  readonly decisions: readonly ExplainedDecision[];
}
