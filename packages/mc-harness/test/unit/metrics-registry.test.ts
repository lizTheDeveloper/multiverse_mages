/*
 * Multiverse Mages — the balance metric registry and its conformance to
 * contracts.md §7. Tasks 6.1 and 6.2.
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
 * §7 is the registry of metric *names*, and it says plainly that "a CI check
 * asserts the implemented registry's keys equal this list exactly". Equality in
 * both directions is the whole point: a subset check passes a registry that
 * quietly dropped `raidInitiationCost`, and a superset check passes one that
 * invented `researchThroughput` and started baselining it.
 *
 * The list is parsed out of the document rather than retyped here. A copy in
 * this file would drift from §7 the first time someone edited one of them, and
 * the test would then assert that the registry matches a stale copy — which is
 * the failure mode the check exists to prevent, reproduced inside the check.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BALANCE_METRIC_REGISTRY,
  METRIC_SCOPE,
  contractSection7MetricIds,
  registryConformance,
} from '@mm/mc-harness';

/** From packages/mc-harness/test/unit/ up to the repository root. */
const repoRoot = new URL('../../../../', import.meta.url);

function contractsMarkdown(): string {
  return readFileSync(fileURLToPath(new URL('docs/design/contracts.md', repoRoot)), 'utf8');
}

describe('the §7 table parser', () => {
  it('finds exactly the fourteen metric names §7 tabulates', () => {
    const ids = contractSection7MetricIds(contractsMarkdown());
    expect(ids).toEqual([
      'ascensionRate',
      'capitalSnowball',
      // The two combat metrics. §7 described combat only in units of magnitude
      // applied, and measured raids say that ranks the wrong thing.
      'combatActionEconomy',
      'combatThresholdEfficiency',
      'illegalActionRate',
      'inboundRaidTempoLoss',
      'knowledgeHalfLife',
      'libraryDependence',
      'prestigeAdvantage',
      'raidInitiationCost',
      'raidLengthDistribution',
      'timeToTierBySpecies',
      'winRateByPrimitive',
      'worshipSnowball',
    ]);
  });

  it('refuses a document with no §7 rather than reporting an empty list', () => {
    expect(() => contractSection7MetricIds('# Something else\n\nNo section seven here.\n')).toThrow(
      /Balance Metrics/,
    );
  });

  it('reads the table and not the surrounding prose', () => {
    // §7's prose mentions `mechanic-absent` and `definitionVersion` in backticks.
    // A parser that scraped every code span would pick them up as metric names.
    const ids = contractSection7MetricIds(contractsMarkdown());
    expect(ids).not.toContain('mechanic-absent');
    expect(ids).not.toContain('definitionVersion');
  });
});

describe('the registry equals §7, in both directions', () => {
  it('reports no difference against the live document', () => {
    const report = registryConformance(BALANCE_METRIC_REGISTRY, contractsMarkdown());
    expect(report.problems).toEqual([]);
    expect(report.conforms).toBe(true);
  });

  it('names a metric the registry omits', () => {
    const trimmed = contractsMarkdown().replace('| `ascensionRate` |', '| `ascensionRate2` |');
    const report = registryConformance(BALANCE_METRIC_REGISTRY, trimmed);
    expect(report.conforms).toBe(false);
    // Both directions are named: one missing from the registry, one extra in it.
    expect(report.problems.join(' ')).toContain('ascensionRate2');
    expect(report.problems.join(' ')).toContain('ascensionRate');
  });

  it('names a metric the registry invented', () => {
    const document = contractsMarkdown().replace(/^\| `winRateByPrimitive` \|.*$/m, '');
    const report = registryConformance(BALANCE_METRIC_REGISTRY, document);
    expect(report.conforms).toBe(false);
    expect(report.problems.join(' ')).toContain('winRateByPrimitive');
  });
});

describe('every registered metric carries the seven fields task 6.1 names', () => {
  it('has an identifier, a definition, a collector, a scope, an aggregation, a unit and a version', () => {
    for (const definition of BALANCE_METRIC_REGISTRY.definitions) {
      expect(definition.id, 'identifier').toMatch(/^[a-z][A-Za-z]+$/);
      expect(definition.definition.length, `${definition.id}: normative definition`).toBeGreaterThan(
        40,
      );
      expect([METRIC_SCOPE.perRun, METRIC_SCOPE.perArm]).toContain(definition.scope);
      expect(['mean', 'sum', 'min', 'max']).toContain(definition.aggregation);
      expect(definition.unit.length, `${definition.id}: unit`).toBeGreaterThan(0);
      expect(Number.isInteger(definition.definitionVersion)).toBe(true);
      expect(definition.definitionVersion).toBeGreaterThanOrEqual(1);
      if (definition.scope === METRIC_SCOPE.perRun) {
        expect(typeof definition.collectRun, `${definition.id}: per-run collector`).toBe('function');
      } else {
        expect(typeof definition.collectArm, `${definition.id}: per-arm collector`).toBe('function');
      }
    }
  });

  it('exposes the same ids through the harness-facing registry interface', () => {
    // `aggregate.ts` and `sweep-spec.ts` know only `MetricRegistry`. The balance
    // registry has to satisfy that interface or a sweep could not name a metric.
    for (const definition of BALANCE_METRIC_REGISTRY.definitions) {
      expect(BALANCE_METRIC_REGISTRY.has(definition.id)).toBe(true);
      expect(BALANCE_METRIC_REGISTRY.get(definition.id)?.unit).toBe(definition.unit);
    }
    expect([...BALANCE_METRIC_REGISTRY.ids].sort()).toEqual(BALANCE_METRIC_REGISTRY.ids);
  });

  it('gives each metric a distinct normative definition', () => {
    // Copy-pasted definitions are how two metrics end up measuring one thing.
    const definitions = BALANCE_METRIC_REGISTRY.definitions.map((entry) => entry.definition);
    expect(new Set(definitions).size).toBe(definitions.length);
  });
});
