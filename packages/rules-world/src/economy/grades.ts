/*
 * Multiverse Mages — material grades: a ladder whose rungs move one step,
 * a demand that gates rather than drains, and no draw from the RNG at all.
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

import type { Fixed } from '@mm/sim-core';
import { FP_ONE, floorDiv, mul } from '@mm/sim-core';
import type { GradeEdgeRecord, GradeRequirement } from '@mm/content';

/**
 * ## The ladder is the primitive
 *
 * `mt-turn-the-poor-ore` specifies the whole mechanic in two sentences, and
 * this module is those sentences:
 *
 * > *"Change **worthless rock** into **ore that is merely bad**. Never into
 * > **good ore**: the working **improves a thing by one step** and has never
 * > once been made to take two."*
 *
 * A graded material, an ordinal on it, a converter that moves one step, and a
 * cap on how far one working can move. The cap is enforced twice, in two
 * different ways, because they refuse two different mistakes:
 *
 * - **`toGrade === fromGrade + 1` is a loader check** (`checkGradeEdges`). It
 *   refuses a rung *authored* to skip.
 * - **Rungs fire in descending `fromGrade` order**, here. It refuses a rung
 *   *composing* into a skip — without it, ore refined this tick would be
 *   available to the rung above it on the same tick, and a unit of worthless
 *   rock would reach iron in one tick through two legal one-step workings.
 *   That is the gloss's *"has never once been made to take two"* failing by
 *   arithmetic rather than by authoring, and nothing in the schema would catch
 *   it.
 *
 * ## Nothing here draws from the RNG, and that is deliberate
 *
 * **No stream id is added, and the registry stays dense 1..15.** `contracts.md`
 * §6's rule is that adding a draw in one subsystem must not re-roll any other,
 * and the cheapest way to satisfy it is to need no draw: refining is a
 * deterministic function of what a universe knows and what it holds. The
 * fiction that would want a draw — `mn-call-it-iron-until-it-is`' *"at roughly
 * the rate the claim goes unchallenged, and stops the moment anyone
 * successfully contradicts it"* — is modelled as a **ratio below one**, which
 * is the rate without the roll. An adversarial assayer is a mechanic the
 * writing asks for and this module does not build; see the change's report.
 *
 * ## Fixed point only
 *
 * Every quantity is `fp` at scale 1024. `mul` and `floorDiv` are `sim-core`'s;
 * there is no float in this file and `npm run check:purity` is what says so.
 */

/**
 * What a universe holds above grade 0, `fp`.
 *
 * Grade 0 is deliberately absent: it lives in `material-stock` and is the same
 * number it always was. **An absent holding reads as zero, never as a
 * shortage** — a universe with no `material-grade` row has refined nothing,
 * which is exactly what every save written before revision 12 means.
 */
export interface GradedStock {
  /** Grade 1 `stone` — *"ore that is merely bad"*. */
  readonly stoneWorked: Fixed;
  /** Grade 2 `stone` — the iron `mn-call-it-iron-until-it-is` waits for. */
  readonly stoneFine: Fixed;
}

/** Nothing refined. The reading for an absent component, and the identity here. */
export const NO_GRADED_STOCK: GradedStock = Object.freeze({ stoneWorked: 0, stoneFine: 0 });

/** A fresh mutable holding at zero. */
export function zeroGradedStock(): { stoneWorked: Fixed; stoneFine: Fixed } {
  return { stoneWorked: 0, stoneFine: 0 };
}

/** The `(kind, grade)` pairs this schema carries a column for. */
type GradedColumn = keyof GradedStock;

/**
 * Which column a `(kind, grade)` pair is held in, or `undefined` for a pair
 * nothing holds.
 *
 * A total function over the pairs content may author, and the loader has
 * already refused any other: `grade-edge.schema.json` admits only `stone`, and
 * `checkGradeEdges` refuses a demand for a grade no rung produces. `undefined`
 * here is therefore unreachable from shipped content and is still returned
 * rather than thrown, because the one caller that can reach it — a hand-built
 * test world — should get "nothing is held" rather than a crash.
 */
export function gradedColumn(kind: string, grade: number): GradedColumn | undefined {
  if (kind !== 'stone') return undefined;
  if (grade === 1) return 'stoneWorked';
  if (grade === 2) return 'stoneFine';
  return undefined;
}

/** One node's requirement, tagged with the node it came from. */
export interface ActiveDemand {
  /** The node whose effect this gates. Only for ordering and for reporting. */
  readonly nodeId: number;
  /** Which effect of that node, so two effects of one node stay distinct. */
  readonly effectIndex: number;
  readonly requires: GradeRequirement;
}

/** Which demands this tick can pay for, and what is left after paying them. */
export interface DemandOutcome {
  /** `"<nodeId>:<effectIndex>"` for each demand that was paid in full. */
  readonly met: ReadonlySet<string>;
  /** The holding after every met demand was deducted. Never negative. */
  readonly remaining: GradedStock;
}

/** The key a met demand is recorded under. One string, built in one place. */
export function demandKey(nodeId: number, effectIndex: number): string {
  return `${String(nodeId)}:${String(effectIndex)}`;
}

/**
 * Which gated effects a universe can afford to run this tick.
 *
 * `economy-flow-models.md` §1.1's **gate**, not its drain: *"A drain destroys
 * unconditionally and accumulates nothing. A gate accumulates nothing either
 * but destroys only as a side effect."* A demand that cannot be paid in full
 * contributes nothing and destroys nothing — the furnace does not run on half
 * an ore and does not eat it either.
 *
 * **All-or-nothing rather than partial**, and that is the difference between a
 * gate and a rate. A furnace paid half its ore for a half-sized yield would be
 * a smooth curve with no decision on it; a furnace that either runs or does not
 * is what makes *"a universe that never learned to improve its rock cannot run
 * foundries"* a fact a player can act on.
 *
 * **Walked in a fixed order and deducted as it goes**, so two effects wanting
 * the same grade cannot both be told yes out of one holding. The order is the
 * caller's list order, which is content order — a decision a reviewer checks,
 * not a property of how a set happened to iterate.
 *
 * Pure, and a pure function of `(holding, demands)` alone. Both the phase-1
 * gate and the phase-9 deduction call it with the *opening* holding, so what
 * the gate promised and what the tick charges are the same number by
 * construction rather than by two call sites agreeing.
 */
export function metDemands(
  holding: GradedStock,
  demands: readonly ActiveDemand[],
): DemandOutcome {
  const remaining = { stoneWorked: holding.stoneWorked, stoneFine: holding.stoneFine };
  const met = new Set<string>();

  for (const demand of demands) {
    const column = gradedColumn(demand.requires.kind, demand.requires.grade);
    if (column === undefined) continue;
    const wanted = demand.requires.amountPerTick;
    if (wanted <= 0 || remaining[column] < wanted) continue;
    remaining[column] -= wanted;
    met.add(demandKey(demand.nodeId, demand.effectIndex));
  }

  return { met, remaining: Object.freeze(remaining) };
}

/** What a tick's refining asks of the raw stock, per kind, `fp`. */
export function rawRefiningDemand(edges: readonly GradeEdgeRecord[]): Fixed {
  let wanted = 0;
  for (const edge of edges) {
    if (edge.fromGrade !== 0) continue;
    wanted += Math.max(0, edge.inputPerTick);
  }
  return wanted;
}

/** What one tick of refining did. */
export interface GradeSettlement {
  /** The holding afterwards. No column ever negative. */
  readonly closing: GradedStock;
  /** Grade-0 material actually consumed off the raw stock, `fp`. */
  readonly rawConsumed: Fixed;
  /**
   * What the rungs lost to their own ratios, `fp` — *"a field of straw becomes
   * a smaller field of grain"*, summed.
   *
   * Recorded rather than dropped, for the reason `applyStockCeiling` records a
   * spill: a conversion that loses silently is a hole in the ledger that reads
   * as a balance problem two hundred ticks later.
   */
  readonly convertedAway: Fixed;
}

/**
 * One tick of the ladder.
 *
 * @param opening What the universe held above grade 0 at the start of the tick.
 * @param edges Every rung whose working this universe knows, in content order.
 * @param demands Every gated effect asking to run, in content order.
 * @param rawPaid Grade-0 material the consumption order actually paid out for
 * refining, `fp`. It may be **less** than {@link rawRefiningDemand} asked for,
 * and that is a shortfall the caller has already recorded.
 *
 * The three phases and why they are in this order:
 *
 * 1. **Demands are paid first, out of the opening holding.** The phase-1 gate
 *    read the opening holding, so charging against anything else would let an
 *    effect contribute on the strength of ore that a rung then spent.
 * 2. **Rungs fire in descending `fromGrade`.** This is the one-step rule as
 *    arithmetic — see the module note. Reversing these two lines would let a
 *    unit of rock reach iron in a single tick, and every test in this file
 *    would still pass except the one written for it.
 * 3. **The `0 -> 1` rung adds last**, out of what consumption actually paid.
 *    Several rungs sharing grade 0 split the payment in proportion to what each
 *    asked for, so a partial payment is not silently given to whichever rung
 *    the content author happened to write first.
 */
export function settleGrades(
  opening: GradedStock,
  edges: readonly GradeEdgeRecord[],
  demands: readonly ActiveDemand[],
  rawPaid: Fixed,
): GradeSettlement & { readonly met: ReadonlySet<string> } {
  const demand = metDemands(opening, demands);
  const held = { stoneWorked: demand.remaining.stoneWorked, stoneFine: demand.remaining.stoneFine };
  let convertedAway = 0;

  // Phase 2: the upper rungs, highest first. Descending `fromGrade` is what
  // stops a unit climbing two grades in one tick.
  const climbing = [...edges].filter((edge) => edge.fromGrade > 0);
  climbing.sort((left, right) => right.fromGrade - left.fromGrade || left.id.localeCompare(right.id));
  for (const edge of climbing) {
    const from = gradedColumn(edge.kind, edge.fromGrade);
    const to = gradedColumn(edge.kind, edge.toGrade);
    if (from === undefined || to === undefined) continue;
    const drawn = Math.min(Math.max(0, edge.inputPerTick), held[from]);
    if (drawn <= 0) continue;
    const made = mul(drawn, edge.ratio);
    held[from] -= drawn;
    held[to] += made;
    convertedAway += drawn - made;
  }

  // Phase 3: the ground rung, out of what the consumption order actually paid.
  const asked = rawRefiningDemand(edges);
  const paid = Math.max(0, Math.min(rawPaid, asked));
  let rawConsumed = 0;
  if (asked > 0 && paid > 0) {
    const ground = edges.filter((edge) => edge.fromGrade === 0);
    for (const edge of ground) {
      const share = floorDiv(Math.max(0, edge.inputPerTick) * paid, asked);
      if (share <= 0) continue;
      const to = gradedColumn(edge.kind, edge.toGrade);
      if (to === undefined) continue;
      const made = mul(share, edge.ratio);
      held[to] += made;
      rawConsumed += share;
      convertedAway += share - made;
    }
  }

  return {
    closing: Object.freeze(held),
    rawConsumed,
    convertedAway,
    met: demand.met,
  };
}

/**
 * The unit a ratio of `fp(1024)` preserves exactly, for tests and for readers.
 *
 * Named rather than inlined because `mul(x, FP_ONE) === x` is the property
 * `ge-turn-the-poor-ore` relies on — its gloss states no loss, so its rung must
 * be lossless, and a ratio that quietly rounded would make *"the whole cost of
 * the rung is the raw stone it draws"* false by one part in 1024 per tick.
 */
export const LOSSLESS_RATIO: Fixed = FP_ONE;
