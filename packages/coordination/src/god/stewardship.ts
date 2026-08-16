/*
 * Multiverse Mages — ruleset stewardship: the recurring drain on a broad
 * constitution, and the lapse that decides which family it starves.
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
 * The god's first **drain**, and the reason it is a drain rather than a price.
 *
 * ## The measured problem
 *
 * A `permit-then-idle` universe was instrumented tick by tick. It spends 56
 * favor between world tick 4 and world tick 43 to open all seventy cells of the
 * grid, and then submits nothing for the remaining 96% of the run. Over that
 * run the favor pool sits **at its cap from tick ~80 to termination**, and
 * 8,187 favor — 8.4 million in fixed point — is discarded by the cap and
 * recorded into a counter no rule reads.
 *
 * A cap is not a drain. Truncation at a ceiling removes the resource *and* the
 * signal, so nothing downstream can respond to the surplus and nothing can be
 * traded against it. A drain is an outflow something else competes for.
 *
 * ## Why a drain and not a higher price
 *
 * The obvious repair — charge more for `permitTechnique` — cannot work here, and
 * the arithmetic says so before any sweep does. `interventions.ts` refuses a
 * plan whose cost exceeds the *opening pool*, and the pool is capped at
 * `favor-cap-base + tier x favor-cap-per-tier`, which tops out at 70 favor at
 * worship tier 5. No god action can cost more than 70 favor and remain buyable
 * at all. Against a run that regenerates thousands of favor, a one-time toll
 * bounded by 70 is a rounding error however it is set: it buys tempo and
 * nothing else, because the pool refills to full within tens of ticks and stays
 * there. A price is paid once; a drain is paid every tick, and only the second
 * one can meet an income that grows.
 *
 * ## The two frictions, and why there are two
 *
 * {@link stewardshipUpkeep} in `favor.ts` sums a **breadth** term and a
 * **doctrine** term. The first is static friction — an automatic outflow
 * proportional to how much constitution is being kept legal. The second scales
 * with how much magic the universe actually knows, which is dynamic friction:
 * consumption that grows with the state of another element. Both are needed
 * because worship grows with populace without practical bound, and a fixed sink
 * against a growing source falls behind it forever.
 *
 * ## The lapse is the part that makes it a decision
 *
 * A uniform upkeep on its own is a tax bill. It regulates the stock and creates
 * no choice: the optimal policy stays *"permit everything, idle, pay the tax"*,
 * and the only thing that changes is that the number is smaller. The failure
 * signature is specific and worth naming so a later sweep can check for it —
 * outcome metrics move while **policy sensitivity does not**.
 *
 * So the drain has a competitor, and the competitor is the ruleset itself.
 * **Every permitted axis competes with every other permitted axis for the same
 * favor.** When the pool cannot meet the upkeep, one axis lapses — and the one
 * that lapses is the one the civilization uses least, measured in nodes it
 * actually knows. The tradeoff that produces is legible without reading any
 * code: *keeping this family legal is what starved that one.* Which family
 * survives depends on what the mages studied, which depends on the founding
 * species and on where the god pointed them, so the right ruleset is a decision
 * rather than a solved constant.
 *
 * ## Three rules the lapse obeys
 *
 * 1. **It lapses, it does not bill.** Unmet upkeep is reported and forgotten.
 *    A debt stock would absorb every unit of inflow before anything downstream
 *    could pull from it, which is how an institution ends up at zero for a
 *    thousand ticks with a healthy-looking income. A drain that cannot be paid
 *    must destroy capability, never create an obligation.
 * 2. **It never takes the shipped constitution.** No axis lapses while the
 *    permitted count is at or below `stewardship-free-axes`, which is the v1
 *    rectangle's seven switches. That is the weak static engine on the ruleset
 *    side: expansion is a running commitment, existence is not.
 * 3. **One axis per tick, and lapsing lowers the upkeep.** The loop is
 *    self-limiting and converges on the broadest constitution the universe's
 *    worship can actually carry, rather than oscillating.
 *
 * ## No draw
 *
 * Nothing here takes an `rng`, and the tie-break is the lowest axis index
 * rather than a roll, for the reason `decay.ts` gives: a draw would have to
 * belong to a stream, and every lapse would then jostle the ordinals of
 * whatever else shared it. A deterministic tie-break is also the legible one —
 * a player can predict which family goes.
 */

import type { Fixed } from '@mm/sim-core';

/** Which axis a lapse fell on. Mirrors `AXIS_KIND` in `interventions.ts`. */
export interface AxisRef {
  /** `AXIS_KIND.technique` or `AXIS_KIND.form`. */
  readonly kind: number;
  /** Zero-based bit within that axis's mask. */
  readonly bit: number;
  /** Known nodes the universe holds in permitted cells on this axis. */
  readonly knownNodes: number;
}

/** Population count of a 32-bit mask. */
export function axisCount(mask: number): number {
  let bits = 0;
  for (let value = mask >>> 0; value !== 0; value >>>= 1) bits += value & 1;
  return bits;
}

/** Permitted axes across both masks — the breadth the upkeep is charged on. */
export function permittedAxes(techniqueMask: number, formMask: number): number {
  return axisCount(techniqueMask) + axisCount(formMask);
}

/**
 * The permitted axis holding the fewest known nodes, or `undefined` when
 * nothing may lapse.
 *
 * `undefined` in two cases, and both are refusals rather than absences: the
 * permitted count is at or below `freeAxes`, so the shipped constitution is
 * protected; or no axis is permitted at all.
 *
 * Ties break toward techniques before forms and then toward the lower bit,
 * which is arbitrary and *stated* rather than emergent — an order that fell out
 * of iteration order would change the day someone reordered a loop.
 *
 * @param nodesOnAxis - Known nodes in permitted cells on `(kind, bit)`.
 */
export function axisToLapse(
  techniqueMask: number,
  formMask: number,
  freeAxes: number,
  techniqueKind: number,
  formKind: number,
  techniqueBits: number,
  formBits: number,
  nodesOnAxis: (kind: number, bit: number) => number,
): AxisRef | undefined {
  if (permittedAxes(techniqueMask, formMask) <= Math.max(freeAxes, 0)) return undefined;

  let best: AxisRef | undefined;
  const consider = (kind: number, bit: number, mask: number): void => {
    if ((mask & (1 << bit)) === 0) return;
    const knownNodes = nodesOnAxis(kind, bit);
    if (best !== undefined && knownNodes >= best.knownNodes) return;
    best = { kind, bit, knownNodes };
  };
  for (let bit = 0; bit < techniqueBits; bit += 1) consider(techniqueKind, bit, techniqueMask);
  for (let bit = 0; bit < formBits; bit += 1) consider(formKind, bit, formMask);
  return best;
}

/** What a tick of stewardship did, for the report. */
export interface StewardshipReport {
  /** Upkeep the ruleset asked for this tick. */
  readonly upkeep: Fixed;
  /** What the pool paid. */
  readonly drained: Fixed;
  /** What it could not pay. Reported, never owed. */
  readonly lapsed: Fixed;
  /** The axis that lapsed this tick, if one did. */
  readonly lapsedAxis: AxisRef | undefined;
}
