/*
 * Multiverse Mages — the primitive-consumption check, failed in every direction.
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
 * The check's own failure paths, over synthetic recorders.
 *
 * These tests never build a real universe: `@mm/rules-magic` may not import
 * `@mm/scenario`, and a checker that could only be tested through the
 * composition root would be a checker whose failure branches nobody had run.
 * The recorder is an ordinary value, so every direction is reachable by handing
 * the checker one that was populated on purpose.
 *
 * That the *shipped wiring* actually registers what it claims is a different
 * question, and it is asked where it can be — in
 * `packages/scenario/test/unit/primitive-consumption.test.ts`, which builds the
 * real thing.
 */

import { describe, expect, it } from 'vitest';

import type { ConsumptionRecorder } from '../../src/effects/index.js';
import {
  PRIMITIVE_CONSUMPTION_EXCLUSIONS,
  PRIMITIVE_COVERAGE_EXCLUSIONS,
  checkPrimitiveConsumption,
  createConsumptionRecorder,
  formatPrimitiveConsumptionReport,
  nodeEffectMagnitudes,
} from '../../src/effects/index.js';

import { registryWith, shippedRegistry } from './effect-fixtures.js';

/**
 * The shipped content with one primitive authored on no node at all.
 *
 * Effects are *relabelled* rather than deleted because the schema requires
 * every node to declare at least one, and a fixture that fails validation tests
 * the loader instead of the check. `knowledge-steal` and `direct-damage` are
 * both engagement-scale, so the swap leaves the content otherwise coherent.
 *
 * Every one of the sixteen primitives is carried by at least two of the three
 * hundred authored nodes, so there is no naturally empty one to borrow.
 */
function registryWithNoKnowledgeStealNodes(): ReturnType<typeof shippedRegistry> {
  return registryWith((documents) => {
    for (const node of documents['node.json'] as Record<string, unknown>[]) {
      for (const effect of node['effects'] as Record<string, unknown>[]) {
        if (effect['primitive'] === 'knowledge-steal') effect['primitive'] = 'direct-damage';
      }
    }
  });
}

/**
 * Every primitive the registry declares, minus the exclusions.
 *
 * The default is {@link PRIMITIVE_CONSUMPTION_EXCLUSIONS} — **empty** since
 * `lifespan` and `fertility` gained a node-driven consumer — and no longer
 * `coverage.ts`'s list. The two are different questions and now give different
 * answers; `consumption.ts` records why the split was forced.
 */
function required(exclusions: readonly string[] = PRIMITIVE_CONSUMPTION_EXCLUSIONS): string[] {
  return shippedRegistry()
    .primitives.map((entry) => entry.record.id)
    .filter((id) => !exclusions.includes(id))
    .sort();
}

/**
 * A recorder in which every required primitive has a node consumer.
 *
 * Built by actually calling {@link nodeEffectMagnitudes}, not by pushing
 * registrations: the accessor is the thing under test, and a fixture that
 * fabricated registrations would pass even if the accessor recorded nothing.
 */
function fullyConsumed(): { recorder: ConsumptionRecorder; registry: ReturnType<typeof shippedRegistry> } {
  const registry = shippedRegistry();
  const recorder = createConsumptionRecorder();
  for (const primitiveId of required()) {
    nodeEffectMagnitudes(registry, primitiveId, `test/${primitiveId}.sink`, recorder);
  }
  return { recorder, registry };
}

describe('the accessor records the fetch, because that is the whole mechanism', () => {
  it('registers a node consumer with the count of nodes it found', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    const found = nodeEffectMagnitudes(registry, 'worship-yield', 'test.sink', recorder);

    expect(recorder.registrations()).toEqual([
      { primitiveId: 'worship-yield', consumer: 'test.sink', kind: 'node', nodeCount: found.size },
    ]);
    expect(found.size).toBeGreaterThan(0);
  });

  it('hands back magnitudes unstacked, one list per node', () => {
    const registry = shippedRegistry();
    const found = nodeEffectMagnitudes(
      registry,
      'worship-yield',
      'test.sink',
      createConsumptionRecorder(),
    );
    for (const magnitudes of found.values()) {
      expect(Array.isArray(magnitudes)).toBe(true);
      expect(magnitudes.length).toBeGreaterThan(0);
    }
  });

  it('registers even when it finds nothing, so a dead wire is visible', () => {
    const recorder = createConsumptionRecorder();
    const found = nodeEffectMagnitudes(
      registryWithNoKnowledgeStealNodes(),
      'knowledge-steal',
      'test.sink',
      recorder,
    );

    expect(found.size).toBe(0);
    expect(recorder.registrations()).toEqual([
      { primitiveId: 'knowledge-steal', consumer: 'test.sink', kind: 'node', nodeCount: 0 },
    ]);
  });

  it('scans the whole grid, exactly as the wiring it replaced did', () => {
    // `lifespan` is a declared *coverage* exclusion — no **v1** node carries it —
    // and seventeen non-v1 nodes in the pre-authored grid do. The accessor must
    // still find those seventeen, because the production helper it replaced
    // (`scenario`'s `nodesCarrying`) scanned every node and legality is decided
    // later, per node, by `permits()`. Filtering to v1 here would be a silent
    // behaviour change dressed up as a check.
    const found = nodeEffectMagnitudes(
      shippedRegistry(),
      'lifespan',
      'test.sink',
      createConsumptionRecorder(),
    );
    expect(found.size).toBe(17);
  });

  it('keeps two consumers of one primitive rather than deduplicating them away', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    nodeEffectMagnitudes(registry, 'portal', 'test.first', recorder);
    nodeEffectMagnitudes(registry, 'portal', 'test.second', recorder);

    const report = checkPrimitiveConsumption(registry, recorder);
    const portal = report.consumed.find((entry) => entry.primitiveId === 'portal');
    expect(portal?.consumers).toEqual(['test.first', 'test.second']);
  });

  it('gives each recorder its own registrations — there is no shared global', () => {
    const registry = shippedRegistry();
    const first = createConsumptionRecorder();
    const second = createConsumptionRecorder();
    nodeEffectMagnitudes(registry, 'portal', 'test.sink', first);

    expect(first.registrations()).toHaveLength(1);
    expect(second.registrations()).toEqual([]);
  });
});

describe('a fully consumed universe passes, and says who consumes what', () => {
  it('passes when every required primitive has a node consumer', () => {
    const { recorder, registry } = fullyConsumed();
    const report = checkPrimitiveConsumption(registry, recorder);

    expect(report.unconsumed).toEqual([]);
    expect(report.consumedExclusions).toEqual([]);
    expect(report.unknownExclusions).toEqual([]);
    expect(report.unknownPrimitives).toEqual([]);
    expect(report.ok).toBe(true);
    expect(formatPrimitiveConsumptionReport(report)).toContain('consumption check PASSED');
  });

  it('names the consumer of every consumed primitive on success, not only on failure', () => {
    const { recorder, registry } = fullyConsumed();
    const text = formatPrimitiveConsumptionReport(checkPrimitiveConsumption(registry, recorder));

    // The point of constraint 4: a reviewer watching consumption erode one
    // primitive at a time needs the passing output to carry the addresses.
    for (const primitiveId of required()) {
      expect(text).toContain(`test/${primitiveId}.sink`);
    }
  });

  it('reports the node count beside each consumer, as the coverage check does', () => {
    const { recorder, registry } = fullyConsumed();
    const report = checkPrimitiveConsumption(registry, recorder);
    const researchRate = report.consumed.find((entry) => entry.primitiveId === 'research-rate');

    expect(researchRate?.nodeCount).toBeGreaterThan(0);
    expect(formatPrimitiveConsumptionReport(report)).toContain(
      `research-rate`.padEnd(18) + ` ${String(researchRate?.nodeCount)} node(s)`,
    );
  });

  it('sorts consumed primitives, so the report is a diff a reviewer can read', () => {
    const { recorder, registry } = fullyConsumed();
    const ids = checkPrimitiveConsumption(registry, recorder).consumed.map(
      (entry) => entry.primitiveId,
    );
    expect(ids).toEqual([...ids].sort());
  });
});

describe('direction one: a primitive has no node-driven consumer', () => {
  it('fails and names it', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    for (const primitiveId of required()) {
      if (primitiveId === 'research-rate') continue;
      nodeEffectMagnitudes(registry, primitiveId, `test/${primitiveId}.sink`, recorder);
    }

    const report = checkPrimitiveConsumption(registry, recorder);
    expect(report.ok).toBe(false);
    expect(report.unconsumed).toEqual(['research-rate']);
    expect(formatPrimitiveConsumptionReport(report)).toContain(
      'FAIL: primitive(s) with no node-driven consumer: research-rate',
    );
  });
});

describe('direction two: a god consumer does not count as coverage', () => {
  it('fails a primitive that only a non-node source moves', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    for (const primitiveId of required()) {
      if (primitiveId === 'research-rate') continue;
      nodeEffectMagnitudes(registry, primitiveId, `test/${primitiveId}.sink`, recorder);
    }
    // The exact shape of the bug being guarded against: something plainly reads
    // `research-rate` every tick, and no amount of research changes it.
    recorder.register({
      primitiveId: 'research-rate',
      consumer: 'test/god.blessing',
      kind: 'non-node',
      nodeCount: 0,
    });

    const report = checkPrimitiveConsumption(registry, recorder);
    expect(report.ok).toBe(false);
    expect(report.unconsumed).toContain('research-rate');
    expect(report.nonNode.map((entry) => entry.primitiveId)).toContain('research-rate');

    const text = formatPrimitiveConsumptionReport(report);
    expect(text).toContain('Consumed, but never from node effects');
    expect(text).toContain('test/god.blessing');
  });

  it('stops reporting a primitive as non-node once a node consumer arrives', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    for (const primitiveId of required()) {
      nodeEffectMagnitudes(registry, primitiveId, `test/${primitiveId}.sink`, recorder);
    }
    recorder.register({
      primitiveId: 'research-rate',
      consumer: 'test/god.blessing',
      kind: 'non-node',
      nodeCount: 0,
    });

    const report = checkPrimitiveConsumption(registry, recorder);
    expect(report.ok).toBe(true);
    expect(report.nonNode.map((entry) => entry.primitiveId)).not.toContain('research-rate');
  });
});

describe('direction three: a wire with no authored content behind it', () => {
  it('fails, and separates "starved" from "never wired"', () => {
    // No node carries `knowledge-steal`, but the consumer still asks for it.
    const registry = registryWithNoKnowledgeStealNodes();
    const recorder = createConsumptionRecorder();
    for (const primitiveId of required()) {
      nodeEffectMagnitudes(registry, primitiveId, `test/${primitiveId}.sink`, recorder);
    }

    const report = checkPrimitiveConsumption(registry, recorder);
    expect(report.ok).toBe(false);
    expect(report.unconsumed).toEqual(['knowledge-steal']);
    expect(report.starved.map((entry) => entry.primitiveId)).toEqual(['knowledge-steal']);

    const text = formatPrimitiveConsumptionReport(report);
    expect(text).toContain('a wire with nothing behind it');
    expect(text).toContain('test/knowledge-steal.sink');
  });
});

describe('direction four: an excluded primitive gains a node consumer', () => {
  it('fails, so closing the gap is a deliberate diff', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    for (const primitiveId of required()) {
      nodeEffectMagnitudes(registry, primitiveId, `test/${primitiveId}.sink`, recorder);
    }
    // An exclusion that quietly becomes covered is the failure `coverage.ts`
    // argues about at length, and it rots the same way here.
    //
    // The exclusion list is passed explicitly, because the shipped one is empty
    // — which is the campaign's exit condition and not a reason to stop testing
    // the direction. `direct-damage` stands in for whatever the next parked
    // primitive would be.
    const report = checkPrimitiveConsumption(registry, recorder, ['direct-damage']);
    expect(report.ok).toBe(false);
    expect(report.consumedExclusions).toEqual(['direct-damage']);
    expect(formatPrimitiveConsumptionReport(report)).toContain(
      'FAIL: excluded primitive(s) now node-driven: direct-damage',
    );
  });
});

describe('direction five: an exclusion or a consumer names a primitive that is not there', () => {
  it('fails on an exclusion naming no registry primitive', () => {
    const { recorder, registry } = fullyConsumed();
    const report = checkPrimitiveConsumption(registry, recorder, ['fertility', 'lifespan', 'mana']);

    expect(report.ok).toBe(false);
    expect(report.unknownExclusions).toEqual(['mana']);
    expect(formatPrimitiveConsumptionReport(report)).toContain(
      'FAIL: exclusion(s) naming no registry primitive: mana',
    );
  });

  it('fails on a consumer registered against no registry primitive', () => {
    const { recorder, registry } = fullyConsumed();
    // How a rename survives as a silent no-op: the consumer keeps asking for the
    // old id, gets an empty answer forever, and nothing goes red.
    nodeEffectMagnitudes(registry, 'reserch-rate', 'test/typo.sink', recorder);

    const report = checkPrimitiveConsumption(registry, recorder);
    expect(report.ok).toBe(false);
    expect(report.unknownPrimitives).toEqual(['reserch-rate']);
    expect(formatPrimitiveConsumptionReport(report)).toContain(
      'FAIL: consumer(s) registered against no registry primitive: reserch-rate',
    );
  });
});

describe('direction six: nothing registered at all', () => {
  it('fails rather than passing vacuously', () => {
    const report = checkPrimitiveConsumption(shippedRegistry(), createConsumptionRecorder());

    expect(report.ok).toBe(false);
    expect(report.registrationCount).toBe(0);
    expect(formatPrimitiveConsumptionReport(report)).toContain(
      'FAIL: no consumers registered at all',
    );
  });

  it('is not rescued by a recorder holding only non-node registrations', () => {
    const registry = shippedRegistry();
    const recorder = createConsumptionRecorder();
    for (const primitiveId of required()) {
      recorder.register({
        primitiveId,
        consumer: `test/god.${primitiveId}`,
        kind: 'non-node',
        nodeCount: 0,
      });
    }

    const report = checkPrimitiveConsumption(registry, recorder);
    expect(report.ok).toBe(false);
    expect(report.unconsumed).toEqual(required());
  });
});

describe('the two checks no longer share one exclusion list', () => {
  it('defaults to an empty consumption list, which is the campaign’s exit condition', () => {
    const { recorder, registry } = fullyConsumed();
    expect(checkPrimitiveConsumption(registry, recorder).exclusions).toEqual([]);
    expect([...PRIMITIVE_CONSUMPTION_EXCLUSIONS]).toEqual([]);
  });

  it('leaves the coverage list standing, because its question is the other one', () => {
    // `lifespan` and `fertility` have a node-driven consumer *and* no v1 node
    // authoring them. One list cannot hold both answers, and this is the pair
    // of assertions that says so out loud.
    expect([...PRIMITIVE_COVERAGE_EXCLUSIONS]).toEqual(['fertility', 'lifespan']);
    const { recorder, registry } = fullyConsumed();
    expect(checkPrimitiveConsumption(registry, recorder).consumed.map((e) => e.primitiveId)).toContain(
      'lifespan',
    );
  });

  it('states the exclusions in the formatted report, so a reader sees the gap', () => {
    const { recorder, registry } = fullyConsumed();
    const text = formatPrimitiveConsumptionReport(
      checkPrimitiveConsumption(registry, recorder, ['fertility', 'lifespan']),
    );
    expect(text).toContain('Declared exclusions: fertility, lifespan');
  });
});
