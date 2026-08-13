/*
 * Multiverse Mages — the definitionVersion conformance check: a pinned constant
 * cannot change without a version bump. Task 6.13.
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
 * ## Why the pins live in a test file rather than beside the registry
 *
 * A digest computed from the registry and stored in the registry checks nothing:
 * it would move with whatever it was supposed to be guarding. The pin has to be
 * a **separate committed artifact** whose update is a deliberate act — the same
 * reasoning `sim-core-foundation` used for golden replay fixtures, and the same
 * consequence: this table is never regenerated to make a test pass.
 *
 * A test file is that artifact. Changing `KNOWLEDGE_CENSUS_INTERVAL_TICKS` from
 * 12 to 6 fails here with a message naming `knowledgeHalfLife` and
 * `libraryDependence`, and the only way to green is to bump both
 * `definitionVersion`s and edit the two lines below — which a reviewer reads as
 * exactly what it is: a redefinition that invalidates every baseline for those
 * two metrics.
 */

import type { DefinitionPins } from '@mm/mc-harness';
import {
  BALANCE_METRIC_REGISTRY,
  definitionDigest,
  definitionVersionConformance,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

/**
 * The committed pins: each metric's `definitionVersion` and the digest over its
 * normative definition, scope, aggregation, unit and every constant this change
 * pinned for it.
 *
 * **Do not regenerate this table to make a test pass.** A moved digest is a
 * claim that a metric now measures something else, and a reviewer reads it as
 * one.
 */
const COMMITTED_PINS: DefinitionPins = {
  ascensionRate: {
    definitionVersion: 1,
    digest: '35b224f02bbf086b90bf9d6918748337d325930d78eb759665c934124c015d97',
  },
  capitalSnowball: {
    definitionVersion: 1,
    digest: '1afc93fe54fe9aed0bbe6ac2efc3ee52e82ea7cc82a54d451e22f0a6a463d688',
  },
  illegalActionRate: {
    definitionVersion: 1,
    digest: 'e905fef1f73fd20a6544822a973aafd6d96e03b6674c3458029e29ec5d5aeee4',
  },
  inboundRaidTempoLoss: {
    definitionVersion: 1,
    digest: 'fcaed17b884013dfcebb009910eea226713a625fafc48452e93ae06efce218f9',
  },
  knowledgeHalfLife: {
    definitionVersion: 1,
    digest: 'a504e0f922b52bc57c62faef6e9934c62a9ae9d15fedb58561656c8899058372',
  },
  libraryDependence: {
    definitionVersion: 1,
    digest: '65f18d4984a02fb786917f86f51892d0c458a3d57f5f819c1e9f8305f692a4ca',
  },
  lossShockRecovery: {
    definitionVersion: 1,
    digest: '76340c1f6e15c834c63a6f369ce1dabd84015233941a3206e3b48d262554caee',
  },
  prestigeAdvantage: {
    definitionVersion: 2,
    digest: '87609d4538435b4b3410b41b89622ef5cde7e54520ec813f4ae9b3514bf871e2',
  },
  raidInitiationCost: {
    definitionVersion: 1,
    digest: '570f474fc53c13ed1fae1b6f6274b8fe6b85da1a9d51de57db4fa3283f9050c2',
  },
  raidLengthDistribution: {
    definitionVersion: 1,
    digest: '312340d88bf5dad245acc5c09e09a5607d126316d068a732039c2242e1b5f54b',
  },
  roleAssignmentDemographicCost: {
    definitionVersion: 1,
    digest: 'ffc68286151c84955578f99968bca6921cbab6bb51c6f048ac5898bd77cc3a84',
  },
  speciesGridVersatility: {
    definitionVersion: 1,
    digest: 'a7903901cf08d9221732d6d2f56907b27badb346e587f2ce5d3fd4d093598eac',
  },
  timeToTierBySpecies: {
    definitionVersion: 1,
    digest: 'af19e7a8c52842476c0ee43d9222d891f079b368327d4b9f4c56286a69b84951',
  },
  winRateByPrimitive: {
    definitionVersion: 2,
    digest: '52943601b98d6ff400c8965f8fe1492977c6cc6620a98c8e44bb4d32ddc197f1',
  },
  worshipSnowball: {
    definitionVersion: 2,
    digest: 'a33987823d4d24af4c9444fb89984ee5131c4498ddb8dcc2d26378437ca67ec9',
  },
};

/** The registry with one metric's definition altered, standing in for an edit. */
function registryWith(
  metricId: string,
  patch: Partial<{ definitionVersion: number; pinnedConstants: Record<string, unknown> }>,
): typeof BALANCE_METRIC_REGISTRY {
  const definitions = BALANCE_METRIC_REGISTRY.definitions.map((definition) =>
    definition.id === metricId ? { ...definition, ...patch } : definition,
  ) as typeof BALANCE_METRIC_REGISTRY.definitions;
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return {
    ids: [...byId.keys()].sort(),
    definitions,
    has: (id: string) => byId.has(id),
    get: (id: string) => byId.get(id),
    balance: (id: string) => byId.get(id),
  };
}

describe('the committed pins match the registry', () => {
  it('conforms as committed', () => {
    const report = definitionVersionConformance(BALANCE_METRIC_REGISTRY, COMMITTED_PINS);
    expect(report.problems).toEqual([]);
    expect(report.conforms).toBe(true);
  });

  it('pins every registered metric, and pins nothing else', () => {
    expect(Object.keys(COMMITTED_PINS).sort()).toEqual([...BALANCE_METRIC_REGISTRY.ids]);
  });
});

describe('changing a pinned constant without a version bump fails (task 6.13)', () => {
  it('fails when the census interval moves from 12 to 6 and the version does not', () => {
    // The capability spec's scenario, exactly.
    const registry = registryWith('knowledgeHalfLife', {
      pinnedConstants: {
        censusIntervalTicks: 6,
        censusStartTick: 0,
        quantile: 0.5,
        estimator: 'kaplan-meier',
        censoring: 'right-censored at run termination',
        cohorts: 'pooled',
      },
    });
    const report = definitionVersionConformance(registry, COMMITTED_PINS);
    expect(report.conforms).toBe(false);
    expect(report.problems.join(' ')).toContain('knowledgeHalfLife');
    expect(report.problems.join(' ')).toContain('still 1');
  });

  it('passes once the version is bumped alongside the constant', () => {
    // And the pin must then be updated too — the failure below names the digest
    // to record, which is the reviewed act.
    const registry = registryWith('knowledgeHalfLife', {
      definitionVersion: 2,
      pinnedConstants: { censusIntervalTicks: 6 },
    });
    const report = definitionVersionConformance(registry, COMMITTED_PINS);
    const complaints = report.problems.filter((problem) =>
      problem.startsWith('knowledgeHalfLife'),
    );
    // No "changed without a bump" complaint remains; the version moved with it.
    expect(complaints.join(' ')).not.toContain('still 1');
  });

  it('names the new digest in the failure, so the reviewed update is mechanical', () => {
    const registry = registryWith('ascensionRate', { pinnedConstants: { targetBandMax: 0.5 } });
    const definition = registry.balance('ascensionRate');
    const report = definitionVersionConformance(registry, COMMITTED_PINS);
    expect(report.problems.join(' ')).toContain(
      definitionDigest(definition as NonNullable<typeof definition>),
    );
  });

  it('reports a version bump with nothing behind it', () => {
    // It invalidates every baseline for that metric and buys nothing; it is
    // usually a bump applied to the wrong line.
    const report = definitionVersionConformance(
      registryWith('libraryDependence', { definitionVersion: 2 }),
      COMMITTED_PINS,
    );
    expect(report.problems.join(' ')).toContain('nothing about the definition changed');
  });

  it('reports a version that went backwards', () => {
    const pins: DefinitionPins = {
      ...COMMITTED_PINS,
      capitalSnowball: { definitionVersion: 5, digest: 'stale' },
    };
    const report = definitionVersionConformance(BALANCE_METRIC_REGISTRY, pins);
    expect(report.problems.join(' ')).toContain('went backwards');
  });

  it('reports a registered metric with no pin', () => {
    const pins = { ...COMMITTED_PINS } as Record<string, DefinitionPins[string]>;
    delete pins['worshipSnowball'];
    const report = definitionVersionConformance(BALANCE_METRIC_REGISTRY, pins);
    expect(report.problems.join(' ')).toContain('has no committed definition pin');
  });

  it('reports a pin for a metric that is no longer registered', () => {
    const pins: DefinitionPins = {
      ...COMMITTED_PINS,
      researchThroughput: { definitionVersion: 1, digest: 'orphan' },
    };
    const report = definitionVersionConformance(BALANCE_METRIC_REGISTRY, pins);
    expect(report.problems.join(' ')).toContain('researchThroughput');
    expect(report.problems.join(' ')).toContain('not in the registry');
  });
});

describe('the digest covers meaning, not implementation', () => {
  it('changes when the normative definition text changes', () => {
    const registry = BALANCE_METRIC_REGISTRY.definitions.map((definition) =>
      definition.id === 'ascensionRate'
        ? { ...definition, definition: `${definition.definition} And another thing.` }
        : definition,
    );
    const altered = registry.find((definition) => definition.id === 'ascensionRate');
    const original = BALANCE_METRIC_REGISTRY.balance('ascensionRate');
    expect(definitionDigest(altered as NonNullable<typeof original>)).not.toBe(
      definitionDigest(original as NonNullable<typeof original>),
    );
  });

  it('does not change when only the collector function does', () => {
    // A bug fix that makes the collector compute the stated definition
    // correctly is not a redefinition, and forcing a version bump for it would
    // make every fix invalidate every baseline whether or not numbers moved.
    const original = BALANCE_METRIC_REGISTRY.balance('libraryDependence');
    const patched = {
      ...(original as NonNullable<typeof original>),
      collectRun: () => ({ status: 'measured', value: 0 }) as const,
    };
    expect(definitionDigest(patched)).toBe(
      definitionDigest(original as NonNullable<typeof original>),
    );
  });
});
