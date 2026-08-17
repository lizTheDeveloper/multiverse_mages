/*
 * Multiverse Mages — magic rules package public surface.
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
 * `@mm/rules-magic` — grid legality, node prerequisites, dormancy, knowledge
 * instances, and the four tradition hooks.
 *
 * ## The boundary is the deliverable
 *
 * `contracts.md` §5 forbids this package from importing `@mm/rules-world` or
 * `@mm/agent-api`, and names the interaction that would otherwise create the
 * cycle: *"a mage learning a node"*. So a mage never arrives here. Every rate a
 * knowledge operation needs — `learnRate`, `retention`, `scribeAffinity`,
 * `rediscoveryAffinity`, scribe capacity, materials — arrives as a
 * caller-supplied parameter (`world-inputs.ts`), and mage, grimoire and library
 * identifiers are opaque handles this package never dereferences. The
 * dependency-graph test asserts the edges; `world-inputs.ts` is what makes them
 * satisfiable.
 *
 * ## Two rules that must not be re-implemented anywhere in here
 *
 * - **Availability is `permits(ruleset, cellId)` and nothing else.** No bitmask
 *   is evaluated against a cell in this package; no result is cached in state.
 * - **Dormancy is derived.** `!permits(ruleset, cellOf(nodeId))`, computed on
 *   demand, stored nowhere — so re-permitting a cell restores every surviving
 *   instance with no migration step.
 *
 * Both are enforced mechanically rather than asked for politely:
 * `packages/state/test/unit/arbitration-conformance.test.ts` and
 * `packages/rules-magic/test/unit/rules-path-conformance.test.ts`.
 */

export type { GridContent, CellView, HeldKnowledge, PrerequisiteStatus } from './grid.js';
export { MagicGrid, cellAxes, heldNodes } from './grid.js';

export type { DormancyRefusal, KnowledgeUseValue, UsablePrerequisiteStatus } from './dormancy.js';
export {
  KNOWLEDGE_USE,
  dormancyRefusal,
  isCellAvailable,
  isDormant,
  isUsable,
  prerequisiteStatusFor,
  usableHolding,
} from './dormancy.js';

export type {
  GrimoireHandle,
  LearnerRates,
  LibraryHandle,
  MageHandle,
  RediscoveryInputs,
  ScribeInputs,
  WorldInputs,
} from './world-inputs.js';

export * from './instances/index.js';
// `requireNode` exists in both subsystems over different catalog shapes — the
// instances one takes a NodeCatalog, the effects one a ContentRegistry. Exported
// under the effects name so the barrel is unambiguous without renaming either
// call site.
export {
  requireNode as requireRegistryNode,
} from './effects/registry-lookup.js';
export * from './effects/index.js';
export * from './traditions/index.js';
export * from './workings/index.js';
