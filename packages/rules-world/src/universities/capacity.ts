/*
 * Multiverse Mages — capacity refuses; it does not truncate.
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

import type { UniversityRecord } from '@mm/state';

import { effectiveCapacity } from './construction.js';

/**
 * ## Refusal and truncation are the same arithmetic and different information
 *
 * The `universities` spec: *"Admission beyond capacity MUST be refused rather
 * than silently truncated, and the refused demand MUST be observable."* Both
 * implementations admit `min(requested, free)` students. The difference is
 * entirely in what is left behind — a truncating one leaves nothing, and a
 * universe that is short of seats then looks exactly like a universe with no
 * appetite for study.
 *
 * That distinction is the same one `demand.ts` makes about unmet occupation
 * demand and `caps.ts` makes about clamps, and it is worth stating a third time
 * because it is the one thing a "make it work" implementation always drops: a
 * bound that is never observed to bind is a bound nobody can tune.
 *
 * ## Capacity is concurrent, not cumulative
 *
 * `contracts.md` §1.4 gives a university `capacity` — "students supportable" —
 * and the spec's second scenario says graduation frees it *in the same tick*.
 * So nothing here records who has ever studied; admission is a function of the
 * hosted count now, and a graduating cohort is a subtraction the caller makes
 * before the next admission pass.
 */

/** One admission decision. */
export interface AdmissionOutcome {
  /** Students taken. Never more than the free seats. */
  readonly admitted: number;
  /** Students turned away. The number the spec requires to be observable. */
  readonly refused: number;
  /** Hosted count after the decision. */
  readonly hosted: number;
}

/** A per-university tally of admissions refused, accumulated over a run. */
export class AdmissionRefusals {
  private readonly byUniversity = new Map<number, number>();
  private refusedTotal = 0;

  /** Records `count` refusals at one university. Zero is a legitimate no-op. */
  record(university: number, count: number): void {
    if (count <= 0) return;
    this.byUniversity.set(university, (this.byUniversity.get(university) ?? 0) + count);
    this.refusedTotal += count;
  }

  /** Refusals at one university. */
  at(university: number): number {
    return this.byUniversity.get(university) ?? 0;
  }

  /** Refusals everywhere. The universe-level unmet demand for seats. */
  get total(): number {
    return this.refusedTotal;
  }

  /** Universities that refused anyone, ascending by handle. */
  universities(): readonly number[] {
    return [...this.byUniversity.keys()].sort((a, b) => a - b);
  }
}

/**
 * Admits as many of `requested` as there are seats, and reports the rest.
 *
 * @param hosted - Students currently in residence.
 * @throws RangeError on a negative or non-integer count. A hosted count above
 * capacity is *not* an error — a university whose designed capacity was reduced
 * would legitimately be over-full, and this function's answer for it is that
 * nobody else gets in.
 */
export function admitStudents(
  university: UniversityRecord,
  hosted: number,
  requested: number,
): AdmissionOutcome {
  for (const [name, value] of [
    ['hosted', hosted],
    ['requested', requested],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer, received ${String(value)}`);
    }
  }

  const free = Math.max(0, effectiveCapacity(university) - hosted);
  const admitted = Math.min(requested, free);
  return { admitted, refused: requested - admitted, hosted: hosted + admitted };
}
