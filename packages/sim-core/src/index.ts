/*
 * Multiverse Mages — simulation core public surface.
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
 * Scaffolding placeholder.
 *
 * This package is deliberately empty of behaviour: task group 1 of
 * `sim-core-foundation` establishes the toolchain and the purity enforcement
 * only. Fixed-point arithmetic, the splittable PRNG, the entity store, the
 * clock, snapshots, and replay land in task groups 2 through 8 and are exported
 * from here.
 *
 * The value exists so the barrel has something to export and so the toolchain
 * (typecheck, lint, test) is exercised against a real module rather than an
 * empty file. Delete it once the first real module lands.
 */
export const SIM_CORE_SCAFFOLD_ONLY = true;

export * from './handle.js';
