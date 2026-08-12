/*
 * Multiverse Mages — contracts.md §4.2's action ids, as the god dispatch names them.
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
 * A module of its own, and not a const at the top of `interventions.ts` where it
 * used to live.
 *
 * `timing.ts` builds a frozen table keyed on these ids at module-evaluation
 * time, and `interventions.ts` calls into `timing.ts`. Left in one file the two
 * form an import cycle whose symptom is a temporal-dead-zone `ReferenceError`
 * at load, depending on which module was reached first — a failure invisible to
 * a type check and total at runtime. `interventions.ts` re-exports `ACTION` so
 * that nothing importing it from there has to change.
 *
 * `agent-api`'s `GOD_ACTION` is the same table, declared separately because
 * `contracts.md` §5 gives neither package an edge to the other.
 */
export const ACTION = {
  noop: 0,
  permitTechnique: 1,
  forbidTechnique: 2,
  permitForm: 3,
  forbidForm: 4,
  issueDispensation: 5,
  issueInterdiction: 6,
  revokeEdict: 7,
  grantFoundingKnowledge: 8,
  blessMage: 9,
  assignRole: 10,
  fundUniversity: 11,
  encourageResearch: 12,
  changeTradition: 13,
  openPortal: 14,
  declareAscension: 15,
} as const;
