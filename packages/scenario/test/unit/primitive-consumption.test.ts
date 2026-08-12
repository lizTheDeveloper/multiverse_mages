/*
 * Multiverse Mages — what the composition root actually asks the content for.
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
 * `check:consumption` is only worth anything if the recorder is genuinely
 * threaded through the wiring — a recorder that stayed empty because nobody
 * passed it would report every primitive as unconsumed and would be right by
 * accident, which is indistinguishable from being right on purpose until the
 * day the wire lands and the check stays red.
 *
 * So this file builds the real universe and asserts the properties that must
 * hold whatever the state of the effect pipeline. The failure *directions* are
 * exercised over synthetic recorders in
 * `packages/rules-magic/test/unit/primitive-consumption.test.ts`; this one is
 * about provenance.
 *
 * Deliberately absent: any assertion that the check currently fails. That fact
 * is the script's to state, and pinning it here would mean the change that
 * connects the pipeline has to delete a test that reads like it wanted the bug.
 */

import {
  checkPrimitiveConsumption,
  createConsumptionRecorder,
  formatPrimitiveConsumptionReport,
} from '@mm/rules-magic';
import { scribingTraditionId, shippedContent, worldDeps } from '@mm/scenario';
import { describe, expect, it } from 'vitest';

function recorded(): {
  recorder: ReturnType<typeof createConsumptionRecorder>;
  registry: ReturnType<typeof shippedContent>;
} {
  const registry = shippedContent();
  const recorder = createConsumptionRecorder();
  worldDeps(registry, scribingTraditionId(registry), recorder);
  return { recorder, registry };
}

describe('the recorder is threaded through the composition root', () => {
  it('collects registrations when a universe is assembled', () => {
    expect(recorded().recorder.registrations().length).toBeGreaterThan(0);
  });

  it('registers no primitive the registry does not declare', () => {
    // The invariant that catches a rename: a consumer asking for an id nothing
    // declares gets an empty answer forever and would otherwise go unnoticed.
    const { recorder, registry } = recorded();
    expect(checkPrimitiveConsumption(registry, recorder).unknownPrimitives).toEqual([]);
  });

  it('keeps working for callers that do not want the recording', () => {
    const registry = shippedContent();
    expect(() => worldDeps(registry, scribingTraditionId(registry))).not.toThrow();
  });
});

describe('the two node-driven paths in the assembled simulation', () => {
  it('records worship-yield against the worship loop, with the nodes it found', () => {
    const { recorder } = recorded();
    const entry = recorder
      .registrations()
      .find((registration) => registration.primitiveId === 'worship-yield');

    expect(entry?.kind).toBe('node');
    expect(entry?.consumer).toBe('coordination/god/system.yieldSources');
    // `yieldSources` gates each node's authored magnitudes on
    // `knowledge.instanceCount(nodeId) > 0`, which is the whole point: this is a
    // rate the academics move by knowing things.
    expect(entry?.nodeCount).toBeGreaterThan(0);
  });

  it('records portal against the raid entry point', () => {
    const { recorder } = recorded();
    const entry = recorder
      .registrations()
      .find((registration) => registration.primitiveId === 'portal');

    expect(entry?.kind).toBe('node');
    expect(entry?.consumer).toBe('coordination/god/interventions.portalPlan');
    expect(entry?.nodeCount).toBeGreaterThan(0);
  });
});

describe('god-driven consumption is recorded, and does not count', () => {
  it.each(['research-rate', 'teach-rate', 'lifespan'])(
    'records %s as non-node, because a blessing is not a discovery',
    (primitiveId) => {
      const { recorder } = recorded();
      const entry = recorder
        .registrations()
        .find((registration) => registration.primitiveId === primitiveId);

      expect(entry?.kind).toBe('non-node');
      expect(entry?.nodeCount).toBe(0);
    },
  );

  it('leaves a non-node primitive out of the consumed set', () => {
    const { recorder, registry } = recorded();
    const report = checkPrimitiveConsumption(registry, recorder);
    const consumed = report.consumed.map((entry) => entry.primitiveId);

    // The failure this whole check exists to prevent: `research-rate` is stacked
    // every tick from blessing constants, and counting that as coverage would
    // report the pipeline connected while no mage's knowledge moved a rate.
    expect(consumed).not.toContain('research-rate');
  });

  it('explains itself in the report rather than leaving a reader guessing', () => {
    const { recorder, registry } = recorded();
    const text = formatPrimitiveConsumptionReport(checkPrimitiveConsumption(registry, recorder));

    expect(text).toContain('Consumed, but never from node effects');
    expect(text).toContain('coordination/god/effects.researchMultiplierFor');
  });
});
