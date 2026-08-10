/*
 * Multiverse Mages — shared world state package public surface.
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
 * `@mm/state` — the single set of world-state type definitions, component
 * layouts, and the one ruleset arbitration function, per
 * `docs/design/contracts.md` §1.
 *
 * ## Why this package exists, when §5 did not originally list it
 *
 * `state-schema` requires *"a single set of TypeScript type definitions for
 * world state"* that every rules package consumes. The §5 package list had
 * nowhere to put them:
 *
 * - `sim-core` must stay content-agnostic — its own design note says the entity
 *   store *"is generic; it knows nothing about magic"* — so §1's mage, cohort,
 *   and grimoire layouts cannot live there without making the substrate depend
 *   on the game.
 * - `rules-magic` would work, and would force `rules-world` to import it for
 *   the mage layout, which is precisely the cycle §5 rule 3 forbids.
 *
 * So the types live here, below every `rules-*` package and above `sim-core`.
 * This is a genuine deviation from §5's original diagram, and it is recorded
 * beside that diagram rather than left to be rediscovered.
 *
 * ## What this package is not
 *
 * It holds no rules. Nothing here decides how research progresses, how combat
 * resolves, or what worship is worth — those are `rules-*` and are deliberately
 * left open by §8. What is here is shapes, plus the two pieces of logic §1
 * insists must exist exactly once: {@link permits} and the derived node-existence
 * index.
 */

export {
  AXIS_KIND,
  COMBATANT_SOURCE_KIND,
  EDICT_BUDGET_MAX,
  EDICT_KIND,
  HOLDER_KIND,
  LOCATION_KIND,
  MAGE_ROLE,
  OBJECTIVE_KIND_UNSPECIFIED,
  OBJECTIVE_STATUS,
  OCCUPATION,
  RAID_SIDE,
  TERMINAL_REASON,
} from './enums.js';
export type {
  AxisKindValue,
  CombatantSourceKindValue,
  EdictKindValue,
  HolderKindValue,
  LocationKindValue,
  MageRoleValue,
  ObjectiveStatusValue,
  OccupationValue,
  RaidSideValue,
  TerminalReasonValue,
} from './enums.js';

export {
  GRID_CELL_COUNT,
  GRID_FORM_COUNT,
  GRID_TECHNIQUE_COUNT,
  NULL_CELL_ID,
  cellAxesOf,
  cellIdAt,
  formBitOf,
  isCellId,
  techniqueBitOf,
} from './grid.js';

export type { Edict, Ruleset, RulesetSnapshot } from './permits.js';
export { assertNoEdictConflict, findEdictConflict, permits } from './permits.js';

export type {
  AxisChangeCounterRecord,
  Bool8,
  CombatantRecord,
  ContentId,
  EdictComponentRecord,
  EncouragedCellRecord,
  Enum8,
  EverKnownRecord,
  Fp,
  GrimoireRecord,
  Handle,
  KeysMatch,
  KnowledgeInstanceRecord,
  LibraryRecord,
  MageRecord,
  ObjectiveRecord,
  PopulaceCohortRecord,
  PreparedSpellRecord,
  Tick,
  UniverseRecord,
  UniversityRecord,
  UniversityStaffRecord,
} from './components.js';
export {
  AXIS_CHANGE_COUNTER,
  COMBATANT,
  EDICT,
  ENCOURAGED_CELL,
  ENGAGEMENT_COMPONENTS,
  ENGAGEMENT_MAX_SLOTS,
  EVER_KNOWN,
  GRIMOIRE,
  KNOWLEDGE_INSTANCE,
  LIBRARY,
  MAGE,
  OBJECTIVE,
  POPULACE_COHORT,
  POSITION_FIELD_NAMES,
  PREPARED_SPELL,
  UNIVERSE,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  WORLD_COMPONENTS,
  assertNoWorldPositions,
  componentOf,
  defineEngagementSchema,
  defineWorldStateSchema,
  worldComponentsWithPosition,
} from './components.js';

export type { RowOf } from './records.js';
export { attachRecord, collectRecords, readRecord } from './records.js';

export {
  canIssueEdict,
  captureRuleset,
  readRulesetForObservation,
  createUniverse,
  currentEra,
  findUniverse,
  readEdicts,
  readUniverse,
} from './universe.js';

export type { BeginEngagementOptions, Engagement, RaidState } from './engagement.js';
export {
  beginEngagement,
  decayPortal,
  endEngagement,
  inEngagement,
  raidHasEnded,
} from './engagement.js';

export { NodeExistenceIndex } from './node-index.js';
