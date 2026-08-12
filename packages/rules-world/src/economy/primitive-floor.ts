/*
 * Multiverse Mages — the primitive's own floor, bridged through until
 * `@mm/content` types it.
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
 * `@mm/primitives`' `StackOptions.floor` doc names exactly this gap: *"the
 * caller reads `primitive.floor` and passes it here rather than
 * `stackMagnitudes` reading the registry record itself, because `@mm/content`'s
 * `PrimitiveRecord` type does not declare the field yet ... and this keeps
 * that gap from reaching into this package at all."* `primitive.json` already
 * authors a `floor` on `research-rate`, `teach-rate`, `scribe-rate`,
 * `resource-yield` and `fertility` — the five world-scale rates a Perdo
 * `remove` effect or a draining `transform` could otherwise walk to zero or
 * negative — and `load.ts` passes the parsed document through as a plain cast
 * (`raw.get('primitive.json') as readonly PrimitiveRecord[]`) rather than
 * reconstructing it field by field, so the value is real at runtime even
 * though the type does not carry it.
 *
 * This is the same bridge `rules-magic/src/effects/contribution.ts` used for
 * `node.schema.json`'s `mode`/`when`/`reveals`/`control`/`transformTo` before
 * `@mm/content` caught up, restated here for the one field that has not: read
 * the extra property off a structural extension of the typed record, in the
 * one place every caller in this package that stacks a world-scale rate can
 * share. Deleted the day `PrimitiveRecord` declares `floor` itself.
 *
 * `rules-magic/src/effects/stack.ts` bridges the identical gap for its own
 * caller (`stackContributions`) with a local `primitiveFloor` of the same
 * name and the same cast, resolved through `@mm/primitives`' `capLimit` —
 * this function does the same resolution, for the same reason: `floor` is
 * declared in the same shape as `cap`, so the function that already turns a
 * `cap` into a bound is the one that should turn a `floor` into one too,
 * rather than this file re-deciding what `{kind: 'fraction-of-species-base'}`
 * means a second time.
 */

import type { Fixed } from '@mm/sim-core';
import type { PrimitiveCap, PrimitiveRecord } from '@mm/content';
import { capLimit } from '@mm/primitives';

/** `primitive.json`'s `floor`, once `PrimitiveRecord` declares it. Same shape as `cap`. */
type PrimitiveRecordWithFloor = PrimitiveRecord & { readonly floor?: PrimitiveCap };

/**
 * The primitive's own authored floor, in `fp`, or `undefined` for a primitive
 * with none.
 *
 * `contracts.md` §3's Floor column is `fp` or absent for every world-scale
 * rate this package stacks, but the resolution goes through `capLimit` rather
 * than reading `.value` directly so a `fraction-of-species-base` floor — none
 * shipped today, but a shape `track.schema.json` does not forbid — resolves
 * correctly rather than silently reading as "no floor".
 */
export function primitiveFloor(primitive: PrimitiveRecord, speciesBase?: Fixed): Fixed | undefined {
  const floor = (primitive as PrimitiveRecordWithFloor).floor;
  if (floor === undefined) return undefined;
  return capLimit(floor, speciesBase === undefined ? {} : { speciesBase });
}
