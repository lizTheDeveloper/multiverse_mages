/*
 * Multiverse Mages — what a god is paid for, and what she is not paid for.
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
 * `yieldSources` is the only place a node's authored `worship-yield` becomes a
 * number the favor economy reads, and it makes two claims this file exists to
 * hold it to.
 *
 * 1. **A forbidden cell pays nothing.** It used to pay: the gate was the
 *    instance count alone, with no `permits()` anywhere in the function, so a
 *    god who outlawed a cell went on being worshipped for it for as long as one
 *    copy of the node survived. §1.1 makes `permits()` the single question
 *    *may this magic exist here*, and a ruleset that cannot stop a spell being
 *    worshipped is not a ruleset.
 *
 * 2. **Each magnitude is scaled by its cell's `dailyRelevance`.** Water and
 *    crops out-yield spectacle, and the difference is the cell's authored share
 *    of ordinary life rather than the node's power.
 *
 * Both are asserted through a **stepped universe** rather than by calling the
 * arithmetic, because both are claims about a wiring: the fix is one `permits`
 * call in one function, and a unit test of `favorRegeneration` would have gone
 * on passing with the defect in place — it did, for the whole time the defect
 * existed.
 *
 * ## The comparison is a same-seed pair, and the seeded instance is the point
 *
 * Nothing in the shipped starting position holds a `worship-yield` node at tick
 * zero: the two carriers inside the v1 rectangle are tier 3 and 4, and founding
 * grants deal root nodes. So each case seeds one instance directly and then
 * steps. Two runs differing only in the ruleset — or only in the relevance
 * table — are otherwise the same universe, which is what makes the difference
 * in the favor pool attributable.
 */

import { describe, expect, it } from 'vitest';

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { step } from '@mm/sim-core';
import type { ContentId } from '@mm/content';
import {
  EDICT,
  EDICT_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  attachRecord,
  findUniverse,
  readUniverse,
} from '@mm/state';
import { MASTERY_MAX } from '@mm/rules-magic';

import type { GodDeps } from '../../src/index.js';
import { defineWorldSimulation } from '../../src/index.js';

import { registry, seededWorld, sourceFor } from './world-fixtures.js';
import { cellRelevance, godDeps, godlyWorldDeps, nodesCarrying } from './god-fixtures.js';

const ROOT_SEED = 0x0006_0060;
const TICKS = 12;
const FP_ONE = 1024;

function traditionId(): number {
  return registry().traditions[0]?.contentId ?? 1;
}

/**
 * The carrier this file measures, resolved from content rather than named.
 *
 * `rm-kindle-devotion` is the node, and it is chosen for one reason: it is one
 * of the two `worship-yield` carriers inside the v1 rectangle, so it is the
 * carrier that moves the numbers anyone has already measured. Its id is looked
 * up rather than written down, because a content id is an interning artefact
 * and a test that hard-coded one would fail on the next content addition for a
 * reason that reads as a rules change.
 */
function carrier(): { nodeId: ContentId; cellId: ContentId } {
  const nodeId = [...nodesCarrying('worship-yield').keys()].find((id) => {
    const record = registry().nodes.find((entry) => entry.contentId === id)?.record;
    return record?.id === 'rm-kindle-devotion';
  });
  if (nodeId === undefined) throw new Error('no rm-kindle-devotion carrying worship-yield');
  const cellId = registry().cells.find((entry) => entry.record.id === 'rego-mentem')?.contentId;
  if (cellId === undefined) throw new Error('no rego-mentem in the registry');
  return { nodeId, cellId };
}

/** The authored relevance of the carrier's cell, from content. */
function carrierRelevance(): Fixed {
  const record = registry().cells.find((entry) => entry.record.id === 'rego-mentem')?.record;
  if (record === undefined) throw new Error('no rego-mentem in the registry');
  return record.dailyRelevance;
}

interface Case {
  /** Replaces the god deps' relevance table. Absent keeps the authored one. */
  readonly relevance?: ReadonlyMap<number, Fixed>;
  /** Cells interdicted at tick zero. */
  readonly interdicted?: readonly ContentId[];
  /** Whether to seed an instance of the carrier at all. */
  readonly seedInstance?: boolean;
}

/**
 * Steps a universe for {@link TICKS} world ticks and returns its favor pool.
 *
 * The pool rather than a per-tick reading, because regeneration is capped and a
 * single tick early in a run can be entirely absorbed by headroom. Twelve ticks
 * is a world year and is comfortably inside the horizon where the cap has not
 * yet bound in this fixture, which the `identical universes` case checks by
 * making the difference vanish when the input does.
 */
function favorAfter(options: Case): Fixed {
  const { nodeId } = carrier();
  const deps = godlyWorldDeps(traditionId());
  const god: GodDeps = {
    ...godDeps(),
    ...(options.relevance === undefined ? {} : { cellRelevance: options.relevance }),
  };
  const simulation = defineWorldSimulation({ ...deps, god });
  const { state } = seededWorld(simulation.schema, { rootSeed: ROOT_SEED });

  if (options.seedInstance !== false) seedCarrier(state, nodeId);
  for (const cellId of options.interdicted ?? []) {
    attachRecord(state, EDICT, state.entities.create(), {
      cellId,
      kind: EDICT_KIND.interdiction,
    });
  }

  let current = state;
  const source = sourceFor(ROOT_SEED);
  for (let tick = 0; tick < TICKS; tick += 1) current = step(current, [], source);
  return readUniverse(current, findUniverse(current)).favor;
}

/** One copy of the carrier, in the first mage's mind, at full mastery. */
function seedCarrier(state: SimState, nodeId: ContentId): void {
  const mage = firstMage(state);
  attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
    nodeId,
    locationKind: LOCATION_KIND.mind,
    locationId: mage,
    acquiredTick: 0,
    mastery: MASTERY_MAX,
  });
}

function firstMage(state: SimState): EntityHandle {
  const store = state.component('mage');
  let found: EntityHandle = 0;
  store?.forEach((_row, handle) => {
    if (found === 0) found = handle;
  });
  if (found === 0) throw new Error('the seeded world has no mage to hold the instance');
  return found;
}

/** Every cell at `fp(1024)` — the identity of the multiply, i.e. the old rule. */
function neutralRelevance(): Map<number, Fixed> {
  return new Map([...cellRelevance().keys()].map((cellId) => [cellId, FP_ONE]));
}

describe('a forbidden cell is not worshipped', () => {
  it('pays no worship-yield for a node whose cell the ruleset interdicts', () => {
    const { cellId } = carrier();
    const permitted = favorAfter({});
    const forbidden = favorAfter({ interdicted: [cellId] });
    const absent = favorAfter({ seedInstance: false, interdicted: [cellId] });

    // The instance exists in both runs and only one of them is paid for it.
    expect(forbidden).toBeLessThan(permitted);
    // And it is paid *exactly* nothing: an interdicted carrier is worth the
    // same as no carrier at all, which is the claim `permits()` makes. A
    // "reduced" reading would be the defect wearing a smaller number.
    expect(forbidden).toBe(absent);
  });

  it('still pays for a carrier in a cell the ruleset leaves alone', () => {
    const { cellId } = carrier();
    const otherCell = registry().cells.find(
      (entry) => entry.record.id === 'rego-terram',
    )?.contentId;
    expect(otherCell).toBeDefined();
    // Interdicting an unrelated cell must not disturb the carrier — otherwise
    // the gate would be "any edict at all" rather than this cell's.
    expect(favorAfter({ interdicted: [otherCell ?? 0] })).toBe(favorAfter({}));
    expect(cellId).not.toBe(otherCell);
  });
});

describe('daily relevance scales what the god is paid', () => {
  it('pays strictly less under the authored table than under a neutral one', () => {
    const authored = favorAfter({});
    const neutral = favorAfter({ relevance: neutralRelevance() });

    // `rego-mentem` is authored below the ceiling, so the authored table must
    // pay less. This is the assertion that would fail if the multiply were
    // dropped, mis-ordered, or applied to the stacked total instead of to each
    // magnitude — and it is stated as a strict inequality rather than an exact
    // figure because the exact figure is a tuning output.
    expect(carrierRelevance()).toBeLessThan(FP_ONE);
    expect(authored).toBeLessThan(neutral);
  });

  it('is the identity when every cell is fp(1024), which is the rule it replaced', () => {
    // The neutral table reproduces the pre-change behaviour exactly rather than
    // approximately: `mul(m, fp(1024)) === m`. So a run under it and a run
    // under a table this test does not supply at all must agree, and that is
    // what makes the neutral arm of `tools/w60/relevance-arms.mjs` a control
    // rather than a second treatment.
    const noTable = favorAfter({ relevance: new Map() });
    expect(favorAfter({ relevance: neutralRelevance() })).toBe(noTable);
  });

  it('pays nothing extra for a cell at relevance zero, and does not go negative', () => {
    const { cellId } = carrier();
    const zeroed = new Map(cellRelevance());
    zeroed.set(cellId, 0);
    const absent = favorAfter({ seedInstance: false });
    // A relevance of zero is a cell nobody's life touches. It contributes a
    // source of magnitude zero, which the additive `(1 + Σ)` channel absorbs —
    // so the god earns what she would have earned with no carrier, and not less.
    expect(favorAfter({ relevance: zeroed })).toBe(absent);
  });
});
