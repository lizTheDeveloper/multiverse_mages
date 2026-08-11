/*
 * Multiverse Mages — the knowledge lifecycle's magnitude placeholders.
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
 * Every number the knowledge lifecycle needs that content does not declare.
 *
 * ## All of these are untuned, and saying so is the point
 *
 * `docs/design/release-plan.md` sets the measurement pivot at 0.5.0: the Monte
 * Carlo harness does not exist yet, so nothing here can be known to be
 * balanced. Each constant below is therefore a *placeholder chosen to make the
 * mechanism observable*, not a value anybody measured — a decay rate picked so
 * that a scenario test can watch mastery fall within a few hundred ticks, a
 * jitter span picked so that two seeds visibly differ.
 *
 * They live in one file, as named exports, for two reasons. The first is that
 * every operation takes them as defaults a caller may override, so a tuning
 * pass at 0.5.0 moves values rather than rewriting call sites. The second is
 * that a magic number buried in a function is a magnitude nobody can find when
 * the harness finally says it is wrong.
 *
 * Every constant here is a placeholder. The one number this file used to carry
 * that was **not** — `REDISCOVERY_MULTIPLIER_FLOOR`, 0.3.0's headline claim in
 * numeric form — has moved to `@mm/primitives` as `REDISCOVERY_FLOOR`, next to
 * the arithmetic that applies it. It was one of three copies of the same
 * release claim, and the other two disagreed about what it was clamping.
 * Import it from `@mm/primitives`.
 */

/**
 * Mastery an instance is created at when nothing else is declared. **Untuned.**
 *
 * Deliberately well below `fp(1024)`: `contracts.md` §1.5 makes full mastery
 * mean "teachable without loss", so a node that arrived at full mastery on the
 * tick it was discovered would make practice meaningless and teaching lossless
 * from the first instance. The tradition hook `acquire: true-name` overrides
 * this to `fp(1024)` on purpose, which is only a distinguishable behaviour
 * because the default is not already there.
 */
export const DEFAULT_INITIAL_MASTERY = 256;

/**
 * `contracts.md` §1.5's `TEACH_THRESHOLD`: the mastery below which a mage may
 * not teach a node at all. **Untuned.**
 *
 * §1.5 names the constant and does not give it a value, and the design's open
 * question — "is `fp(1024)` the right threshold, or should it sit below full
 * mastery?" — is unanswerable before the harness exists. It sits below full
 * mastery here so that the interesting case, a teacher who *can* teach but
 * transmits with loss, is reachable at all; at `fp(1024)` the loss rule would
 * be dead code.
 */
export const DEFAULT_TEACH_THRESHOLD = 512;

/**
 * Half-width of research's per-step progress jitter, in fixed-point. **Untuned.**
 *
 * A step's progress is multiplied by `fp(1024) ± this`, drawn from RNG stream 3.
 * This is the only stochastic element research has at 0.3.0, and it exists
 * because a subsystem that never draws is a subsystem whose stream isolation
 * nothing has ever exercised — the insertion-invariance property is only
 * testable against operations that actually roll.
 */
export const RESEARCH_JITTER_SPAN = 128;

/**
 * Half-width of teaching's fidelity jitter, applied **to the shortfall only**.
 * **Untuned.**
 *
 * Scaling the shortfall rather than the transmitted mastery is what keeps
 * `knowledge-instances`' requirement literally true: a teacher at `fp(1024)`
 * has no shortfall, so the jitter has nothing to act on and the student's
 * instance carries no reduction — while the draw still happens, so the stream's
 * draw ordinals do not depend on the teacher's mastery.
 */
export const TEACHING_JITTER_SPAN = 256;

/**
 * Grimoire durability at `fp(1024)` scribe affinity, before the roll. **Untuned.**
 */
export const SCRIBE_DURABILITY_BASE = 1024;

/**
 * Width of the durability roll drawn from RNG stream 5. **Untuned.**
 *
 * Strictly smaller than the affinity spread it sits on top of, so that
 * `knowledge-instances`' "scribe affinity raises durability" scenario holds for
 * *every* seed rather than usually: a roll wide enough to overturn the affinity
 * difference would make the requirement a statistical claim, and a statistical
 * claim is not what that scenario says.
 */
export const SCRIBE_DURABILITY_ROLL_SPAN = 256;

/**
 * Scribe capacity one tier of a node costs to write out. **Untuned.**
 *
 * `contracts.md` §2.3 gives a node a `scribeCost` in materials and no capacity
 * cost at all, so the capacity requirement is derived here from tier — deeper
 * books take longer to copy. What a unit of capacity *is* belongs to
 * `mages-and-species`, which owns scribe cohorts; this package only consumes
 * the number a caller hands it and reports what it used.
 */
export const SCRIBE_CAPACITY_PER_TIER = 1024;

/** Full mastery, `contracts.md` §1.5. Mastery is never written above this. */
export const MASTERY_MAX = 1024;

/**
 * The share of `retention` that becomes an instance's decay floor. **Untuned.**
 *
 * `fp(256)` — a quarter — so that a species at `fp(1024)` retention settles at
 * a quarter mastery and a dwarf at `fp(1536)` settles higher, which is the
 * differentiation `mages-and-species` gets for free from this rule. The floor
 * is what makes "a mage who genuinely learned something does not silently
 * forget it" true; a **dormant** instance has no floor at all, which is how a
 * forbidden body of magic is actually lost.
 */
export const MASTERY_FLOOR_SHARE = 256;

/**
 * Mastery lost per world tick at `fp(1024)` retention. **Untuned.**
 *
 * A world tick is one month (`contracts.md` §0), so eight units a month takes a
 * fully masterful instance to a unit-retention floor in roughly six years of
 * fictional time. Fast enough that a scenario test does not have to simulate a
 * century, slow enough that it is not the dominant term in anything.
 */
export const MASTERY_DECAY_PER_TICK = 8;
