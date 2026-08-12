/*
 * Multiverse Mages — one observation: vector, mask, candidate lists, outcome.
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
 * What an agent receives on a step.
 *
 * §4.2 says *"every observation carries a boolean mask"* and §4.4 says *"each
 * observation carries, per parameterized action, a fixed-length list"* — so the
 * three travel together or the sentences are not true. Bundling them in one
 * function is also what keeps them derived from **one** state: an observation
 * from tick *n* paired with a mask from tick *n+1* would be internally
 * inconsistent in a way nothing downstream could detect.
 *
 * `contracts.md` §4.3 has the outcome record emitted *"alongside each
 * observation"*, so it is here too.
 */

import type { CandidateInput } from './candidates.js';
import { buildCandidates } from './candidates.js';
import type { CandidateLists } from './candidates.js';
import { legalityMask } from './mask.js';
import { normalizedObservation } from './normalize.js';
import type { ObservationInput } from './observation.js';
import { rawObservation } from './observation.js';
import type { OutcomeRecord } from './outcome.js';
import { outcomeOf } from './outcome.js';

/** Everything one step hands the agent. */
export interface AgentView {
  /**
   * The integer observation. **This is the reproducible artefact** — it is what
   * a golden fixture would pin and what two peers must agree on bit for bit.
   */
  readonly raw: Int32Array;
  /**
   * §4.1's pinned export: `Float64Array`, values in `[0, 1]`, `fp(1024)` → 1.0.
   * The one float on the way out.
   */
  readonly normalized: Float64Array;
  /** §4.2's mandatory legality mask, one byte per action id. */
  readonly mask: Uint8Array;
  /** §4.4's slot-indexed candidate lists, per parameterized action. */
  readonly candidates: CandidateLists;
  /** §4.3's outcome record. Carries no reward — see `./outcome.ts`. */
  readonly outcome: OutcomeRecord;
}

/** What {@link observe} reads. */
export interface ObserveInput extends ObservationInput, CandidateInput {
  /** The caller's step limit, if it has one. §4.3 puts truncation on the caller. */
  readonly truncated?: boolean;
}

/**
 * Builds one {@link AgentView} from one state.
 *
 * Pure with respect to the simulation: it reads state and allocates, and
 * changes nothing. The only thing in this package that writes to state is
 * `admit`, which increments the illegal-action counter §4.2 requires.
 */
export function observe(input: ObserveInput): AgentView {
  const candidates = buildCandidates(input);
  const raw = rawObservation(input);
  return {
    raw,
    normalized: normalizedObservation(raw),
    mask: legalityMask({ state: input.state, candidates, catalogue: input.catalogue }),
    candidates,
    outcome: outcomeOf({
      state: input.state,
      ...(input.truncated === undefined ? {} : { truncated: input.truncated }),
    }),
  };
}
