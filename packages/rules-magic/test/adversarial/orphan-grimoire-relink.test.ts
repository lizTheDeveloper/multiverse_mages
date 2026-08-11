/*
 * Multiverse Mages — adversarial: a burnt book's cover claims the next book's pages.
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
 * # FAILING ON PURPOSE — finding 3 of 3
 *
 * Two defects that compose. The first leaves a grimoire entity behind; the
 * second lets that leftover steal a live instance from a real book on the next
 * load. Each `it` below isolates one of them, so a fix to either can be seen.
 *
 * ## (a) The behaviour believed to be incorrect
 *
 * **First half.** `changeTradition()` returns `destroyed: readonly number[]` —
 * *instance* handles, and only instance handles. Its documented contract is that
 * *"the caller applies the whole result or none of it"*, and the one composition
 * anywhere in this repository that applies it, in
 * `test/adversarial/tradition-change-loss-composition.test.ts`, does the obvious
 * thing: `KnowledgeSubsystem.destroyAll(plan.destroyed, tick)`. That destroys the
 * instances and, by design, nothing else — `destroyInstance` unlinks the grimoire
 * from the subsystem index but never destroys the grimoire entity; only
 * `destroyGrimoire()` does that, and the plan names no grimoires for the caller
 * to pass it. So switching a universe to the Art of Memory leaves one `GRIMOIRE`
 * component row per book, holding `holderKind: library`, with no contents.
 *
 * **Second half.** `KnowledgeSubsystem.#relinkShelvedGrimoires` reconstructs the
 * shelved pairing after a load by matching each library-held grimoire against
 * *any* unclaimed instance of the same node in that library, in row order. It
 * has no way to tell a grimoire whose instance was destroyed from one whose
 * instance is merely shelved, so the leftover — being the older row — matches
 * first and takes the newer book's instance. The real book is then paired with
 * nothing.
 *
 * ## (b) The lines that say it should be otherwise
 *
 * `openspec/changes/knowledge-model/specs/knowledge-instances/spec.md`,
 * "Requirement: Instance location follows its grimoire's holder", verbatim:
 *
 * > ... the grimoire-to-instance association MUST live in a subsystem-owned
 * > index keyed on the grimoire handle, never in a state field.
 *
 * > #### Scenario: Destroying a shelved grimoire destroys its instance
 * > - **WHEN** a grimoire shelved in a library is destroyed
 * > - **THEN** the instance whose `locationId` was that library and which the
 * >   index associates with that grimoire is destroyed, and no other instance is
 * >   affected
 *
 * After the round trip below, destroying the real shelved grimoire throws
 * `RangeError: Cannot destroy grimoire N: the knowledge subsystem associates no
 * instance with it` instead.
 *
 * And `openspec/changes/knowledge-model/specs/magic-traditions/spec.md`,
 * "Requirement: Changing a tradition is total", verbatim:
 *
 * > Changing a universe's tradition SHALL leave no knowledge instance in a state
 * > the incoming `store` kind does not define. The operation MUST resolve every
 * > instance whose location kind the new `store` kind cannot hold, MUST report
 * > what it resolved, and MUST NOT leave an instance addressable at an undefined
 * > location.
 *
 * `traditions/change.ts`'s own header states the failure it exists to prevent in
 * the plainest possible terms, verbatim:
 *
 * > A universe switches to the Art of Memory, **its grimoires are neither
 * > destroyed nor moved**, and every later query that iterates instances by
 * > location finds books in a tradition that has no concept of a book.
 *
 * That is exactly the residue: the instances go, the grimoires stay.
 *
 * ## (c) Why the asserted values are the right ones
 *
 * The first `it` asserts zero `GRIMOIRE` rows after a tradition change into a
 * store kind that admits no written copy. Zero is the number the Art of Memory
 * means — `release-claim-0.3.0-traditions.test.ts` already asserts
 * `grimoiresInWorld === 0` for a universe *born* under it, and a universe that
 * switched into it is supposed to be indistinguishable afterwards; the whole
 * point of the operation being *total* is that the two states agree. Reporting
 * the grimoires (a `destroyedGrimoires` field beside `destroyed`) or destroying
 * them is the caller-facing fix; the assertion is on the outcome either way.
 *
 * The second `it` asserts that a book's own grimoire handle still resolves to
 * its own instance after a save and load, and that destroying it destroys that
 * instance. Those are the spec scenario's words. Note that this half is a defect
 * on its own terms: any grimoire row that has outlived its instance will hijack
 * the next same-node instance shelved in the same library, and a tradition
 * change is only the shortest route to producing one. `#relinkShelvedGrimoires`
 * already documents an *acceptable* ambiguity — two identical books of one node
 * on one shelf may swap `acquiredTick` — and it is worth being clear that this
 * is a different thing: here a grimoire is bound to an instance that was never
 * its contents, and the observable difference is not a tick but whether the real
 * book can be burned at all.
 */

import { describe, expect, it } from 'vitest';

import { deserializeState, serializeState } from '@mm/sim-core';
import { GRIMOIRE, LOCATION_KIND, componentOf, defineWorldStateSchema } from '@mm/state';

import { MASTERY_MAX } from '../../src/instances/constants.js';
import { destroyGrimoire, grimoiresIn, shelveGrimoire } from '../../src/instances/location.js';
import { STANDARD_STORE, scribe } from '../../src/instances/scribing.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import type { InstanceView } from '../../src/traditions/index.js';
import { changeTradition, hooksOfTradition } from '../../src/traditions/index.js';
import { ART_OF_MEMORY, TRADITIONS, VANCIAN } from '../unit/tradition-fixtures.js';
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

/** Writes {@link ROOT_NODE} into a new grimoire and shelves it in {@link LIBRARY}. */
function shelveANewBook(knowledge: KnowledgeSubsystem, tick: number): number {
  const written = scribe({
    knowledge,
    catalog: testCatalog(),
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(5, tick),
    scribe: ARCHMAGE,
    nodeId: ROOT_NODE,
    worldTick: tick,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 1024 * 16,
    materials: 1024 * 16,
  });
  expect(written.refusal).toBeUndefined();
  shelveGrimoire(knowledge, written.grimoire, LIBRARY);
  return written.grimoire;
}

/** Every live instance, in the shape `changeTradition` asks for. */
function viewsOf(knowledge: KnowledgeSubsystem): InstanceView[] {
  return knowledge.instances().map((instance) => {
    const view = knowledge.read(instance);
    return {
      instanceId: instance,
      nodeId: view.nodeId,
      locationKind: view.locationKind as InstanceView['locationKind'],
      locationId: view.locationId,
    };
  });
}

/** Plans and applies a switch into the Art of Memory, the one documented way. */
function switchToTheArtOfMemory(knowledge: KnowledgeSubsystem, worldTick: number) {
  const plan = changeTradition({
    outgoingStore: hooksOfTradition(VANCIAN, TRADITIONS).store,
    incomingStore: hooksOfTradition(ART_OF_MEMORY, TRADITIONS).store,
    instances: viewsOf(knowledge),
    worldTick,
  });
  expect(plan.applied).toBe(true);
  knowledge.destroyAll(plan.destroyed, worldTick);
  return plan;
}

describe('changing tradition into the Art of Memory', () => {
  it('leaves no grimoire behind in a universe that has no concept of a book', () => {
    const knowledge = universeKnowing();
    shelveANewBook(knowledge, 10);
    expect(componentOf(knowledge.state, GRIMOIRE).size).toBe(1);

    switchToTheArtOfMemory(knowledge, 20);

    // The instances did go — that half works, and is asserted so the failure
    // below cannot be mistaken for the operation not running.
    expect(knowledge.instancesAt(LOCATION_KIND.library, LIBRARY)).toEqual([]);
    expect(
      knowledge.instances().map((instance) => knowledge.read(instance).locationKind),
    ).toEqual([LOCATION_KIND.mind]);

    expect(componentOf(knowledge.state, GRIMOIRE).size).toBe(0);
  });
});

describe('a grimoire that outlived its instance', () => {
  it('does not claim a later book’s instance across a save and load', () => {
    const knowledge = universeKnowing();
    const burnt = shelveANewBook(knowledge, 10);
    switchToTheArtOfMemory(knowledge, 20);

    // The universe changes its mind, relearns the node, and writes it out again.
    knowledge.createInstance({
      nodeId: ROOT_NODE,
      locationKind: LOCATION_KIND.mind,
      locationId: ARCHMAGE,
      acquiredTick: 30,
      mastery: MASTERY_MAX,
    });
    const real = shelveANewBook(knowledge, 31);
    expect(real).not.toBe(burnt);
    expect(knowledge.instanceForGrimoire(real)).not.toBe(0);

    const after = KnowledgeSubsystem.fromState(
      deserializeState(serializeState(knowledge.state), defineWorldStateSchema()),
      TEST_NODE_COUNT,
    );

    // The real book still owns its own pages...
    const itsInstance = after.instanceForGrimoire(real);
    expect(itsInstance).not.toBe(0);
    expect(after.read(itsInstance).locationKind).toBe(LOCATION_KIND.library);
    // ...and the leftover owns nothing.
    expect(after.instanceForGrimoire(burnt)).toBe(0);
    expect(grimoiresIn(after, LIBRARY)).toEqual([real]);

    // The spec scenario, verbatim: destroying a shelved grimoire destroys its
    // instance. Today this throws instead.
    expect(destroyGrimoire(after, real, 40)).toEqual({
      nodeId: ROOT_NODE,
      worldTick: 40,
      location: LOCATION_KIND.library,
    });
    expect(after.instanceCount(ROOT_NODE)).toBe(1);
  });
});
