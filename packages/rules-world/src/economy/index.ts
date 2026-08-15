/*
 * Multiverse Mages — the three-input economy's public surface.
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
 * Populace, materials, and knowledge-as-capital — the three inputs, and no
 * fourth.
 *
 * Three rules run through the directory:
 *
 * - **One stock, one writer** (`materials.ts`). Construction, scribing, upkeep
 *   and subsistence each report what they would spend; the priority order
 *   decides who is paid, and the stock cannot go negative because nothing else
 *   touches it.
 * - **A brake, not a ceiling** (`carrying-capacity.ts`). Population approaches
 *   `K` because births fall to nothing there, not because a birth is ever
 *   refused — a refusal makes population a sawtooth and every derived rate
 *   inherits it. And `K` itself comes from **territory**, the one economic
 *   quantity a run cannot manufacture, so the bound is a property of the world
 *   rather than of how long the world has been running.
 * - **Worship is somebody else's** (`counts.ts`). The counts are exposed; the
 *   formula is `god-agency`'s, and a helpful `worshipFrom()` here would be a
 *   formula authored by a capability with no way to measure it.
 *
 * Every magnitude is **untuned** (`docs/design/release-plan.md`).
 */

export type {
  ApplicationInput,
  ApplicationWeightSource,
  ApplicationWeights,
} from './application.js';
export {
  APPLICATION_TUNING_STATUS,
  REQUIRED_APPLICATION_WEIGHTS,
  appliedYield,
  applicationRations,
  formRoutesToMaterials,
  readApplicationWeights,
} from './application.js';

export type { CastingWeights, CastingWeightSource } from './casting.js';
export {
  affordableMageMonths,
  castingDemand,
  readCastingWeights,
} from './casting.js';

export type { BirthInput, CapacityInput, TerritoryExtent } from './carrying-capacity.js';
export {
  BIRTHS_PER_MEMBER,
  BIRTH_RATE_ONE,
  BIRTH_RATE_SHIFT,
  MATERIALS_PROVISION_CAP,
  MATERIALS_PROVISION_SATURATION,
  MAX_PROVISIONING,
  MAX_SUBSISTENCE_PENALTY,
  NO_TERRITORY,
  SEATS_PROVISION_CAP,
  SEATS_PROVISION_SATURATION,
  carryingCapacity,
  cohortBirths,
  expectedBirths,
  fertilityBrake,
  maxCarryingCapacity,
  territoryExtent,
} from './carrying-capacity.js';

export type { EconomicInput, WorshipInputs } from './counts.js';
export { ECONOMIC_INPUTS, worshipInputs } from './counts.js';

export type { MaterialAmounts, MaterialKind } from './kinds.js';
export {
  MATERIAL_KINDS,
  NO_MATERIALS,
  addAmounts,
  routeYieldByForm,
  territoryYieldShares,
  totalAmount,
  zeroAmounts,
} from './kinds.js';

export type { ConsumptionDemand, ConsumptionKind, ConsumptionOutcome, ProductionInput } from './materials.js';
export {
  CLAIMANT_KIND,
  CONSUMPTION_ORDER,
  MATERIALS_PER_LABORER,
  NO_YIELD_BONUSES,
  SUBSISTENCE_PER_PERSON,
  assertMaterialsNonNegative,
  consumeMaterials,
  materialsProduced,
  resourceYieldMultiplier,
  subsistenceDemand,
} from './materials.js';
