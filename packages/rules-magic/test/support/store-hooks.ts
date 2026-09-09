/*
 * Multiverse Mages — the two `store` hook shapes scribing tests write against.
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
 * These lived in `src/instances/scribing.ts` and were exported from the package.
 *
 * They had no production caller and could not acquire an honest one. A running
 * universe's `StoreHook` is *derived* from its resolved `store` policy —
 * `coordination/gateway.ts`'s `storeHookOf` reads `scribeAvailability(policy)`
 * — precisely so that nothing outside the four extension points decides what a
 * tradition kind means. A caller that reached for a named constant instead
 * would be branching on a kind, which is the fifth hook `vision.md` §4a caps
 * out.
 *
 * So the constants are what they always were: fixtures. They live here now,
 * where a test can have them and the reachability check does not have to be
 * told to ignore them.
 */

import type { StoreHook } from '../../src/instances/scribing.js';

/** The `store: standard` hook: grimoires and libraries as usual. */
export const STANDARD_STORE: StoreHook = { kind: 'standard', keepsWrittenCopies: true };

/** The `store: palace` hook: the Art of Memory, which writes nothing down. */
export const PALACE_STORE: StoreHook = { kind: 'palace', keepsWrittenCopies: false };
