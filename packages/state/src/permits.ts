/*
 * Multiverse Mages — the single ruleset arbitration function.
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
 * `contracts.md` §1.1's `permits(universe, cellId)`, implemented **once**.
 *
 * ```
 * permits(universe, cellId) =
 *     if edicts contains (cellId, interdiction) -> false
 *     if edicts contains (cellId, dispensation) -> true
 *     else techniqueBit(cellId) ∈ permittedTechniques AND formBit(cellId) ∈ permittedForms
 * ```
 *
 * **Why one implementation, when the rule is three lines.** The rule is three
 * lines *today*. The design doc puts it plainly: the moment a fourth precedence
 * case appears, four copies drift, and the one that drifts is the client's — so
 * the player is told they can cast something the server refuses. Divergent rule
 * copies are how strategy games ship unactionable bug reports. The research
 * system, the raid engine, the agent legality mask, and the renderer's
 * graying-out all call this.
 *
 * **It takes a ruleset, not a live universe.** §1.1 requires a raid to evaluate
 * against an immutable snapshot captured at portal open, because `rules-raid`
 * may not depend on `agent-api` (§5) and therefore has no action mask to lean
 * on: a raid that read live universe state would have *no* mechanism preventing
 * mid-raid rule changes. Making the snapshot the parameter type is what makes
 * the vision's frozen-policy rule structural. A live universe is read into the
 * same shape by {@link captureRuleset}, so there is still one code path.
 *
 * **Legality gates acquisition and casting; it is not an invariant over stored
 * knowledge.** §1.1 is explicit: a mage may hold knowledge her universe has
 * since forbidden, and it lies dormant rather than being erased. Nothing here
 * may be used to delete instances.
 */

import { EDICT_KIND } from './enums.js';
import { GRID_CELL_COUNT, formBitOf, isCellId, techniqueBitOf } from './grid.js';

/** One edict: a cell, and whether it is a dispensation or an interdiction. */
export interface Edict {
  /** Interned cell id, `1..70`. */
  readonly cellId: number;
  /** {@link EDICT_KIND}. */
  readonly kind: number;
}

/**
 * The part of a universe that decides legality.
 *
 * Structural rather than nominal so that a live universe reading, a captured
 * raid snapshot, and a hand-built test fixture are all the same input to
 * {@link permits}. There is deliberately no way to ask it about `favor` or a
 * tick: legality depends on the ruleset and nothing else.
 */
export interface Ruleset {
  /** `uint8` bitmask, one bit per technique (`contracts.md` §1.1). */
  readonly permittedTechniques: number;
  /** `uint16` bitmask, one bit per form. */
  readonly permittedForms: number;
  /** In issue order. Order does not affect the result — interdiction always wins. */
  readonly edicts: readonly Edict[];
}

/**
 * A ruleset frozen at a moment in time, as a raid captures it at portal open.
 *
 * `contentRevision` is carried because §0 forbids two universes from
 * interacting at all unless theirs are equal, and the refusal has to name both
 * values. It is a `uint32` here, matching `SimState.contentRevision`; the
 * content loader currently computes a 128-bit hex revision, and narrowing one
 * to the other is `agent-interface`'s to pin.
 */
export interface RulesetSnapshot extends Ruleset {
  /** `contracts.md` §1.1: exactly one tradition, never 0. */
  readonly traditionId: number;
  readonly contentRevision: number;
}

/**
 * Whether a universe's ruleset permits a cell.
 *
 * @throws RangeError if `cellId` does not name a cell. Returning `false` for a
 * nonsense id would be worse than throwing: a caller that computed a cell id
 * wrongly would see every spell in that cell quietly become illegal, which
 * reads as a balance change rather than as a bug.
 */
export function permits(ruleset: Ruleset, cellId: number): boolean {
  if (!isCellId(cellId)) {
    throw new RangeError(
      `permits() was asked about cell id ${String(cellId)}, which is not a cell. Cell ids are ` +
        `1..${GRID_CELL_COUNT}; 0 is the reserved null (contracts.md §0).`,
    );
  }

  // One pass, and interdiction wins outright — checking dispensation first and
  // returning would make precedence depend on the order edicts were issued in.
  let dispensed = false;
  for (const edict of ruleset.edicts) {
    if (edict.cellId !== cellId) continue;
    if (edict.kind === EDICT_KIND.interdiction) return false;
    if (edict.kind === EDICT_KIND.dispensation) dispensed = true;
  }
  if (dispensed) return true;

  const techniqueAllowed = (ruleset.permittedTechniques & (1 << techniqueBitOf(cellId))) !== 0;
  const formAllowed = (ruleset.permittedForms & (1 << formBitOf(cellId))) !== 0;
  return techniqueAllowed && formAllowed;
}

/**
 * The first cell carrying both an interdiction and a dispensation, or `0`.
 *
 * §1.1: *"a cell may not carry both, and the loader rejects content that tries."*
 * {@link permits} stays total regardless — it resolves the conflict the way the
 * precedence rule says, so a conflicted state can never produce two different
 * answers on two machines — but a conflict is still a defect, and this is what
 * finds it.
 */
export function findEdictConflict(edicts: readonly Edict[]): number {
  const interdicted = new Set<number>();
  const dispensed = new Set<number>();
  for (const edict of edicts) {
    if (edict.kind === EDICT_KIND.interdiction) interdicted.add(edict.cellId);
    else if (edict.kind === EDICT_KIND.dispensation) dispensed.add(edict.cellId);
  }
  // Ascending cell id, not set-insertion order: the caller may report this in a
  // diagnostic, and a diagnostic whose text depends on issue order is a
  // diagnostic two machines disagree about.
  const conflicts = [...interdicted].filter((cellId) => dispensed.has(cellId)).sort((a, b) => a - b);
  return conflicts[0] ?? 0;
}

/**
 * Throws if any cell carries both kinds of edict.
 *
 * Named as an assertion rather than folded into {@link permits} because the two
 * answer different questions. `permits` is asked thousands of times per tick
 * and must be cheap and total; this is asked once, when a ruleset is built,
 * loaded, or captured for a raid.
 */
export function assertNoEdictConflict(edicts: readonly Edict[]): void {
  const conflict = findEdictConflict(edicts);
  if (conflict !== 0) {
    throw new Error(
      `Cell ${conflict} carries both an interdiction and a dispensation. contracts.md §1.1 ` +
        'forbids that: interdiction beats dispensation, so the pair is not a tie to be broken ' +
        'but a ruleset that says two things at once.',
    );
  }
}
