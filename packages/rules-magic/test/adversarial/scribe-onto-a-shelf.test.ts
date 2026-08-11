/*
 * Multiverse Mages — adversarial: a book scribed straight onto a library shelf.
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
 * # FAILING ON PURPOSE — finding 1 of 3
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * `scribe()` takes an optional `holderKind`/`holderId` pair and writes them
 * straight onto the new grimoire's §1.5 record. It then *always* creates the
 * knowledge instance at `locationKind` **grimoire**, whatever holder kind it
 * was just told about:
 *
 * ```ts
 * attachRecord(..., GRIMOIRE, grimoire, { ..., holderKind: inputs.holderKind ?? HOLDER_KIND.mage, ... });
 * const instance = inputs.knowledge.createInstance({ ..., locationKind: LOCATION_KIND.grimoire, locationId: grimoire, ... });
 * ```
 *
 * So `scribe({ holderKind: HOLDER_KIND.library, holderId: LIBRARY })` produces a
 * grimoire whose own record says it is shelved in `LIBRARY`, paired with an
 * instance that says it is in a mage's hands. Three of the four `HOLDER_KIND`
 * values are consistent with `locationKind` grimoire — `unowned`, `mage` and
 * `inTransit` — and the fourth is not.
 *
 * ## (b) The line that says it should be otherwise
 *
 * `openspec/changes/knowledge-model/specs/knowledge-instances/spec.md`,
 * "Requirement: Instance location follows its grimoire's holder", verbatim:
 *
 * > Exactly one knowledge instance SHALL exist per written copy. That instance
 * > MUST carry `locationKind` grimoire with `locationId` set to the grimoire
 * > handle **while the grimoire is held by a mage or in transit**, and
 * > `locationKind` library with `locationId` set to the library handle **while
 * > the grimoire is shelved in a library**.
 *
 * The clause enumerates holder states, not call sites: a grimoire whose
 * `holderKind` is `library` *is* shelved in a library, and the codebase agrees —
 * `KnowledgeSubsystem.#relinkShelvedGrimoires` uses exactly
 * `holderKinds[row] === HOLDER_KIND.library` as its definition of "shelved" when
 * it rebuilds the association from a snapshot.
 *
 * The consequence is named by the same spec file:
 *
 * > #### Scenario: The last instance burns in a library
 * > - **WHEN** the only instance of a node is shelved in a library and that
 * >   library is destroyed
 * > - **THEN** the node ceases to exist and a loss event is emitted naming the
 * >   library location kind
 *
 * and by `instances/location.ts`'s own header, which justifies the whole
 * one-instance-with-a-rewritten-location design on the grounds that it keeps
 * *"library depth ... a count over `locationKind == 3` rather than a join
 * through every grimoire's holder"* and *"a destroyed library resolves to
 * 'every instance whose `locationId` is this library'"*. Both of those are false
 * for a book written directly onto the shelf.
 *
 * ## (c) Why the asserted values are the right ones
 *
 * The assertions below say only what the MUST says: if the grimoire's holder is
 * a library, the instance is at `(library, thatLibrary)`. Everything else
 * asserted here follows mechanically from that one field and is included because
 * a reader should see the cost rather than a schema mismatch — the library
 * reports zero depth for a book on its own shelves, `grimoiresIn` cannot see it,
 * and burning the library destroys nothing. A universe can therefore raze a
 * university's library and lose no knowledge at all, which makes
 * `libraryDependence` and `knowledgeHalfLife` — the two §7 metrics 0.3.0 exists
 * to make measurable — understate loss in the reassuring direction.
 *
 * **Two fixes are equally acceptable and this test is written not to prefer
 * one.** `scribe` may place the instance at `(library, holderId)` when the
 * holder kind is `library`, or it may refuse `HOLDER_KIND.library` outright and
 * force callers through `shelveGrimoire`, which already does the pair correctly.
 * The final `it` below states the refusal alternative separately so that a fix
 * choosing it turns this file green without editing the assertions.
 *
 * ## Reachability
 *
 * `holderKind` is an exported, documented parameter ("Who ends up holding the
 * book"), `HOLDER_KIND.library` is a legal value of it, and a university scribe
 * copying a treatise directly into the stacks is the obvious reason it exists.
 * Nothing guards it and no shipped test exercises it.
 */

import { describe, expect, it } from 'vitest';

import { deserializeState, serializeState } from '@mm/sim-core';
import { HOLDER_KIND, LOCATION_KIND, defineWorldStateSchema } from '@mm/state';

import { MASTERY_MAX } from '../../src/instances/constants.js';
import { libraryDepth } from '../../src/instances/library-depth.js';
import { destroyLibrary, grimoiresIn } from '../../src/instances/location.js';
import { STANDARD_STORE, scribe } from '../../src/instances/scribing.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import {
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

const ARCHMAGE = 500;
const LIBRARY = 900;

/** A universe whose archmage knows {@link ROOT_NODE} and nothing else does. */
function universeKnowing(): KnowledgeSubsystem {
  const knowledge = new KnowledgeSubsystem(testWorld(), TEST_NODE_COUNT);
  knowledge.createInstance({
    nodeId: ROOT_NODE,
    locationKind: LOCATION_KIND.mind,
    locationId: ARCHMAGE,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
  return knowledge;
}

/** One scribing, with the holder the caller names. */
function scribeHeldBy(knowledge: KnowledgeSubsystem, holderKind: number, holderId: number) {
  return scribe({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(5, 10),
    scribe: ARCHMAGE,
    nodeId: ROOT_NODE,
    worldTick: 10,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 1024 * 16,
    materials: 1024 * 16,
    holderKind,
    holderId,
  });
}

describe('a grimoire scribed with a library holder', () => {
  it('places its instance at the library, per §1.5', () => {
    const knowledge = universeKnowing();
    const written = scribeHeldBy(knowledge, HOLDER_KIND.library, LIBRARY);
    expect(written.refusal).toBeUndefined();

    const view = knowledge.read(written.instance);
    // The MUST: shelved in a library => (library, libraryHandle).
    expect(view.locationKind).toBe(LOCATION_KIND.library);
    expect(view.locationId).toBe(LIBRARY);
  });

  /**
   * The control, and the reason the assertion above is about the holder kind
   * rather than about `scribe` in general: the three holder kinds §1.5 pairs
   * with `locationKind` grimoire all come out right.
   */
  it('is correct for every other holder kind — this is not a blanket complaint', () => {
    for (const holderKind of [HOLDER_KIND.unowned, HOLDER_KIND.mage, HOLDER_KIND.inTransit]) {
      const knowledge = universeKnowing();
      const written = scribeHeldBy(knowledge, holderKind, ARCHMAGE);
      const view = knowledge.read(written.instance);
      expect(view.locationKind).toBe(LOCATION_KIND.grimoire);
      expect(view.locationId).toBe(written.grimoire);
    }
  });

  it('is on the shelf: it counts toward depth, is enumerable, and burns with the library', () => {
    const knowledge = universeKnowing();
    const written = scribeHeldBy(knowledge, HOLDER_KIND.library, LIBRARY);
    // The archmage dies; the book on the shelf is now the node's last instance.
    knowledge.destroyInstancesHeldBy(ARCHMAGE, 11);
    expect(knowledge.instanceCount(ROOT_NODE)).toBe(1);

    expect(
      libraryDepth({
        knowledge,
        catalog: testCatalog(),
        cells: testCells,
        ruleset: permissiveRuleset(),
        library: LIBRARY,
      }),
    ).toBeGreaterThan(0);
    expect(grimoiresIn(knowledge, LIBRARY)).toEqual([written.grimoire]);

    expect(destroyLibrary(knowledge, LIBRARY, 12)).toEqual([
      { nodeId: ROOT_NODE, worldTick: 12, location: LOCATION_KIND.library },
    ]);
    expect(knowledge.exists(ROOT_NODE)).toBe(false);
  });

  /**
   * Loading does not repair it either. `rebuild()`'s first pass claims every
   * `locationKind` grimoire instance for the grimoire its `locationId` names, so
   * `#relinkShelvedGrimoires` — the one place that reads `holderKind` — skips
   * this grimoire as already paired and never notices the disagreement.
   */
  it('is not repaired by a snapshot round trip', () => {
    const before = universeKnowing();
    scribeHeldBy(before, HOLDER_KIND.library, LIBRARY);
    before.destroyInstancesHeldBy(ARCHMAGE, 11);

    const after = KnowledgeSubsystem.fromState(
      deserializeState(serializeState(before.state), defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );

    const survivor = after.instances()[0] as number;
    expect(after.read(survivor).locationKind).toBe(LOCATION_KIND.library);
    expect(destroyLibrary(after, LIBRARY, 13)).toHaveLength(1);
    expect(after.exists(ROOT_NODE)).toBe(false);
  });

  /**
   * The alternative fix, stated so that choosing it also turns this file green.
   * If `scribe` refuses a library holder instead of placing the instance there,
   * this assertion holds and the four above become unreachable-by-construction
   * — which is a perfectly good way to satisfy the MUST.
   */
  it('or else the operation refuses a library holder outright', () => {
    const knowledge = universeKnowing();
    const written = scribeHeldBy(knowledge, HOLDER_KIND.library, LIBRARY);
    const placed = written.refusal === undefined ? knowledge.read(written.instance) : undefined;
    expect(
      written.refusal !== undefined || placed?.locationKind === LOCATION_KIND.library,
    ).toBe(true);
  });
});
