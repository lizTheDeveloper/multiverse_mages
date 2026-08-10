/*
 * Multiverse Mages — raid rules package public surface.
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
 * `@mm/rules-raid` — the engagement space: combatants, combat resolution,
 * objectives, and the consequences a raid writes back into world state. Empty
 * until `raid-engagement`.
 *
 * This is the **coordinating layer** `contracts.md` §5 rule 3 points at. It is
 * the one rules package permitted to import both `@mm/rules-magic` and
 * `@mm/rules-world`, which is how a cross-cutting interaction gets implemented
 * without those two forming a cycle. It still may not import `@mm/agent-api`:
 * the dependency runs one way only.
 *
 * Combat resolution math beyond the primitive units in `contracts.md` §3 is
 * deliberately left open by §8 and is this package's to fix.
 */

export {};
