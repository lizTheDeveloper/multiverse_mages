/*
 * Multiverse Mages — the knowledge lifecycle's public surface.
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
 * Knowledge as state: acquired, held, decayed, transmitted, written, lost, and
 * — expensively — rediscovered.
 *
 * `openspec/changes/knowledge-model` task group 4. The two claims 0.3.0 makes
 * about this package both live here: a node ceases to exist in a universe when
 * its last instance is destroyed, and rediscovering it costs at least three
 * times its original research cost.
 *
 * `packages/rules-magic/src/index.ts` re-exports this module; it is a separate
 * barrel so that the grid, the effect pipeline, and the traditions can land
 * beside it without four capabilities editing one file.
 */

export type {
  CellResolver,
  ExclusionEdge,
  ExclusionResolver,
  KnowledgeNode,
  KnowledgeRng,
  NodeCatalog,
} from './catalog.js';
export { catalogFromRegistry, catalogOf, requireNode } from './catalog.js';

export {
  DEFAULT_INITIAL_MASTERY,
  DEFAULT_TEACH_THRESHOLD,
  MASTERY_DECAY_PER_TICK,
  MASTERY_FLOOR_SHARE,
  MASTERY_MAX,
  RESEARCH_JITTER_SPAN,
  SCRIBE_CAPACITY_PER_TIER,
  SCRIBE_DURABILITY_BASE,
  SCRIBE_DURABILITY_ROLL_SPAN,
  TEACHING_JITTER_SPAN,
} from './constants.js';

export type { KnowledgeLossEvent, KnowledgeRefusal } from './outcomes.js';
export { describeRefusal } from './outcomes.js';

export type { InstanceSpec } from './subsystem.js';
export {
  KnowledgeSubsystem,
  isHeldLocation,
  isWrittenLocation,
  writtenInstanceLocation,
} from './subsystem.js';

export type { RequirementInputs, ResearchInputs, ResearchOutcome } from './research.js';
export {
  holdsUsable,
  isRediscovery,
  personalLocationKind,
  personalStoreFull,
  research,
  researchRequirement,
  unsatisfiedPrerequisite,
} from './research.js';

export type { TeachingInputs, TeachingOutcome } from './teaching.js';
export { heldMastery, teach, transmittedMastery } from './teaching.js';

export type { ScribingInputs, ScribingOutcome, StoreHook } from './scribing.js';
export { PALACE_STORE, STANDARD_STORE, scribe, scribeCapacityCost } from './scribing.js';

export type { CorruptionValue, Fidelity } from './fidelity.js';
export {
  BOOK_MASTERY_FLOOR,
  BOOK_MASTERY_SPAN,
  CORRUPTION,
  CORRUPTION_READ_BASE,
  CORRUPTION_READ_PER_TIER,
  FIDELITY_PLATEAU_END,
  FIDELITY_ZERO_AT,
  GENERATION_STEP_BASE,
  GENERATION_STEP_MAX,
  GENERATION_STEP_MIN,
  KNOWLEDGE_KIND_STEP,
  PRISTINE,
  SCRIBAL_ERROR_BASE,
  SCRIBAL_ERROR_MAX,
  canDiscoverCorruption,
  corruptionReadBar,
  fidelityAt,
  fidelityOf,
  generationStep,
  isCorruptionValue,
  masteryFromBook,
  readsThroughCorruption,
  scribalErrorChance,
  setFidelity,
} from './fidelity.js';

export type { StudyInputs, StudyOutcome } from './study.js';
export { study } from './study.js';

export {
  destroyGrimoire,
  destroyLibrary,
  disownGrimoire,
  grimoiresIn,
  shelveGrimoire,
  withdrawGrimoire,
} from './location.js';

export type { DecayInputs } from './decay.js';
export { decayHeldKnowledge, decayedMastery, masteryDecayPerTick, masteryFloor } from './decay.js';

export type { LibraryDepthInputs } from './library-depth.js';
export { libraryDepth } from './library-depth.js';
