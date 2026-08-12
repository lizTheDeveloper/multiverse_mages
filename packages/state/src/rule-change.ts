/*
 * Multiverse Mages — the write side of the one arbitration rule.
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
 * Producing a ruleset, as `permits.ts` reads one.
 *
 * ## Why this is in `@mm/state` and not in the package that wanted it
 *
 * `docs/design/raid-engagement.md` §1 makes the ruleset changeable during a
 * raid. Something therefore has to *write* an axis bitmask and resolve an edict
 * against a standing one — and `contracts.md` §1.1's rule is that exactly one
 * place in the project knows edict precedence. Interdiction beats dispensation,
 * both beat the axis bits, and forgetting that is the specific mistake every
 * reimplementation of §1.1 makes.
 *
 * `rules-magic`'s rules-path conformance scan refuses any `rules-*` package that
 * touches `permittedTechniques` or `permittedForms`, and it is right to: a raid
 * changing the constitution under fire is exactly where a second implementation
 * would appear and exactly where a divergence would be hardest to notice. So the
 * write side lives here, beside the read side, and `rules-raid` calls it.
 *
 * ## Why it is a separate file from `permits.ts`
 *
 * `arbitration-conformance.test.ts` uses `permits.ts` as its **positive
 * control**: every legality site in that file must be cell-scoped, which is what
 * proves the classifier can still recognise arbitration when it sees it. The
 * functions here ask about an *axis* — "is the perdo bit set" — which is a
 * legitimate question and a different one, and folding them into `permits.ts`
 * would blunt the control that keeps the whole check honest. So they sit next
 * door and appear in that test's ledger of cleared axis-scoped readers, where
 * adding one is a visible diff in review.
 */

import { EDICT, UNIVERSE } from './components.js';
import { componentOf } from './components.js';
import { EDICT_KIND, RULE_CHANGE_KIND, RULE_SCOPE } from './enums.js';
import { GRID_FORM_COUNT, GRID_TECHNIQUE_COUNT, isCellId } from './grid.js';
import type { Edict, RulesetSnapshot } from './permits.js';
import { permits } from './permits.js';
import { attachRecord, collectRecords } from './records.js';
import type { EntityHandle, SimState } from '@mm/sim-core';
import { NULL_ENTITY } from '@mm/sim-core';

/**
 * A change to a ruleset, at one of the three scopes `contracts.md` §4.2 has
 * actions for.
 */
export interface RuleChange {
  /** `RULE_SCOPE`. */
  readonly scope: number;
  /** Technique bit, form bit, or cell id, by `scope`. */
  readonly targetId: number;
  /** `RULE_CHANGE_KIND`. */
  readonly kind: number;
}

/** Whether a change names a technique, a form, or a cell that exists. */
export function ruleTargetInRange(change: RuleChange): boolean {
  if (!Number.isInteger(change.targetId)) return false;
  if (change.scope === RULE_SCOPE.technique) {
    return change.targetId >= 0 && change.targetId < GRID_TECHNIQUE_COUNT;
  }
  if (change.scope === RULE_SCOPE.form) {
    return change.targetId >= 0 && change.targetId < GRID_FORM_COUNT;
  }
  if (change.scope === RULE_SCOPE.cell) return isCellId(change.targetId);
  return false;
}

/**
 * The ruleset a change produces, as a new frozen snapshot.
 *
 * Pure, and sharing no mutable structure with its input: a caller holding the
 * old snapshot must keep seeing the old one, or "what did this raid open under"
 * stops being answerable.
 *
 * The cell case removes any standing edict on the same cell before adding its
 * own. {@link assertNoEdictConflict} treats a cell carrying both kinds as a
 * defect rather than a tie to be broken, so an interdiction laid over a
 * dispensation has to replace it. Removing rather than refusing is the right
 * reading: forbidding a cell you had specially opened is a legitimate decision,
 * and the edict that opened it is what you are overruling.
 */
export function rulesetWith(ruleset: RulesetSnapshot, change: RuleChange): RulesetSnapshot {
  const forbidding = change.kind === RULE_CHANGE_KIND.forbid;

  if (change.scope === RULE_SCOPE.technique) {
    const bit = 1 << change.targetId;
    return Object.freeze({
      ...ruleset,
      permittedTechniques: forbidding
        ? ruleset.permittedTechniques & ~bit
        : ruleset.permittedTechniques | bit,
    });
  }

  if (change.scope === RULE_SCOPE.form) {
    const bit = 1 << change.targetId;
    return Object.freeze({
      ...ruleset,
      permittedForms: forbidding ? ruleset.permittedForms & ~bit : ruleset.permittedForms | bit,
    });
  }

  const kept: Edict[] = ruleset.edicts.filter((edict) => edict.cellId !== change.targetId);
  kept.push({
    cellId: change.targetId,
    kind: forbidding ? EDICT_KIND.interdiction : EDICT_KIND.dispensation,
  });
  return Object.freeze({ ...ruleset, edicts: Object.freeze(kept) });
}

/**
 * Whether a change would move legality for anything at all.
 *
 * An axis change is a change when the bit moves. A cell change is a change when
 * the *cell's legality* moves, which is not the same as "an edict was added": a
 * cell already forbidden by its technique row gains nothing from an
 * interdiction. Asking {@link permits} rather than inspecting the edict list is
 * the whole reason this lives here.
 */
export function changesLegality(ruleset: RulesetSnapshot, change: RuleChange): boolean {
  const forbidding = change.kind === RULE_CHANGE_KIND.forbid;

  if (change.scope === RULE_SCOPE.technique) {
    return ((ruleset.permittedTechniques & (1 << change.targetId)) !== 0) === forbidding;
  }
  if (change.scope === RULE_SCOPE.form) {
    return ((ruleset.permittedForms & (1 << change.targetId)) !== 0) === forbidding;
  }
  if (change.scope === RULE_SCOPE.cell) return permits(ruleset, change.targetId) === forbidding;
  return false;
}


/**
 * Writes a rule change into a live universe's own ruleset.
 *
 * The world-scale counterpart to {@link rulesetWith}, and here for the same
 * reason that is in `permits.ts`: it names the axis bitmask fields, and §1.1's
 * rule is that exactly one place in the project does. A `rules-*` package that
 * wrote `permittedTechniques` itself would be a second implementation of the
 * precedence, which is what the rules-path conformance scan exists to refuse.
 *
 * The cell case removes any standing edict on the cell before writing its own,
 * exactly as {@link rulesetWith} does, so a raid's change and the ruleset it was
 * fought under cannot disagree about a cell that carried a dispensation.
 *
 * A universe handle of {@link NULL_ENTITY} is a no-op: some worlds — every
 * hand-built raid fixture, for one — have no universe row, and absence is what
 * every other reader here treats it as.
 */
export function writeRuleChange(
  state: SimState,
  universe: EntityHandle,
  change: RuleChange,
): void {
  const forbidding = change.kind === RULE_CHANGE_KIND.forbid;

  if (change.scope === RULE_SCOPE.cell) {
    for (const entry of collectRecords(state, EDICT)) {
      if (entry.row.cellId === change.targetId) state.entities.destroy(entry.handle);
    }
    const handle = state.entities.create();
    attachRecord(state, EDICT, handle, {
      cellId: change.targetId,
      kind: forbidding ? EDICT_KIND.interdiction : EDICT_KIND.dispensation,
    });
    return;
  }

  if (universe === NULL_ENTITY) return;
  const field =
    change.scope === RULE_SCOPE.technique ? 'permittedTechniques' : 'permittedForms';
  const store = componentOf(state, UNIVERSE);
  const bit = 1 << change.targetId;
  const mask = store.get(universe, field);
  store.set(universe, field, forbidding ? mask & ~bit : mask | bit);
}
