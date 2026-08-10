/*
 * Multiverse Mages — the primitive-coverage check, failed in both directions.
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
 * A coverage check that can only fail one way rots silently. The interesting
 * case is not "a primitive stopped being exercised" — that one is obvious once
 * you have written it — it is "an exclusion quietly became covered", because
 * the check keeps passing while the declared exclusion list becomes a lie about
 * the content. So both directions are mutated here and both are asserted to
 * fail, by name.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  PRIMITIVE_COVERAGE_EXCLUSIONS,
  PORTAL_HOME_CELL_ID,
  PORTAL_PRIMITIVE_ID,
  checkPrimitiveCoverage,
  formatPrimitiveCoverageReport,
} from '../../src/effects/index.js';

import { effectsOf, nodeDocuments, registryWith, shippedRegistry, v1CellIds } from './fixtures.js';

describe('the v1 subset exercises every primitive but the declared exclusions', () => {
  it('passes on the shipped content', () => {
    const report = checkPrimitiveCoverage(shippedRegistry());
    expect(formatPrimitiveCoverageReport(report)).toContain('coverage check PASSED');
    expect(report.ok).toBe(true);
    expect(report.unexercised).toEqual([]);
    expect(report.coveredExclusions).toEqual([]);
    expect(report.unknownExclusions).toEqual([]);
    expect(report.misplacedPortalNodes).toEqual([]);
  });

  it('exercises every registry primitive except lifespan and fertility', () => {
    const registry = shippedRegistry();
    const report = checkPrimitiveCoverage(registry);
    const exercised = new Set(report.exercised.map((entry) => entry.primitiveId));
    const expected = registry.primitives
      .map((entry) => entry.record.id)
      .filter((id) => !PRIMITIVE_COVERAGE_EXCLUSIONS.includes(id));

    expect([...exercised].sort()).toEqual([...expected].sort());
  });

  it('declares exactly the two exclusions the design accepted', () => {
    expect([...PRIMITIVE_COVERAGE_EXCLUSIONS]).toEqual(['fertility', 'lifespan']);
  });

  it('states the exclusions in the formatted report, so a reader sees the gap', () => {
    const text = formatPrimitiveCoverageReport(checkPrimitiveCoverage(shippedRegistry()));
    expect(text).toContain('fertility');
    expect(text).toContain('lifespan');
  });
});

describe('direction one: a primitive stops being exercised', () => {
  it('fails and names the primitive', () => {
    const registry = registryWith((documents) => {
      // Re-point every v1 knowledge-steal effect at an already-covered
      // primitive rather than deleting nodes: deleting one would orphan a
      // prerequisite and the loader would reject the fixture for the wrong
      // reason, which is a test that proves the loader works.
      for (const node of nodeDocuments(documents)) {
        for (const effect of effectsOf(node)) {
          if (effect['primitive'] === 'knowledge-steal') effect['primitive'] = 'concealment';
        }
      }
    });

    const report = checkPrimitiveCoverage(registry);
    expect(report.ok).toBe(false);
    expect(report.unexercised).toEqual(['knowledge-steal']);
    const text = formatPrimitiveCoverageReport(report);
    expect(text).toContain('knowledge-steal');
    expect(text).toContain('coverage check FAILED');
  });
});

describe('direction two: an exclusion becomes covered', () => {
  it('fails and says the exclusion list must be updated deliberately', () => {
    const registry = registryWith((documents) => {
      const nodes = nodeDocuments(documents);
      const first = nodes[0];
      if (first === undefined) throw new Error('node.json is empty');
      effectsOf(first).push({
        primitive: 'lifespan',
        magnitude: 12,
        target: 'self',
        durationTicks: 0,
      });
    });

    const report = checkPrimitiveCoverage(registry);
    expect(report.ok).toBe(false);
    expect(report.coveredExclusions).toEqual(['lifespan']);
    const text = formatPrimitiveCoverageReport(report);
    expect(text).toContain('lifespan');
    expect(text).toMatch(/exclusion list/i);
  });
});

describe('the exclusion list must name real primitives', () => {
  it('fails on an exclusion the registry does not declare', () => {
    const report = checkPrimitiveCoverage(shippedRegistry(), ['lifespan', 'no-such-primitive']);
    expect(report.ok).toBe(false);
    expect(report.unknownExclusions).toEqual(['no-such-primitive']);
  });
});

describe('portal belongs to the mandated cell', () => {
  it('finds every portal-declaring node in rego-limen', () => {
    const registry = shippedRegistry();
    const report = checkPrimitiveCoverage(registry);
    expect(report.misplacedPortalNodes).toEqual([]);

    const portalNodes = registry.nodes.filter((node) =>
      node.record.effects.some((effect) => effect.primitive === PORTAL_PRIMITIVE_ID),
    );
    expect(portalNodes.length).toBeGreaterThan(0);
    expect(portalNodes.every((node) => node.record.cell === PORTAL_HOME_CELL_ID)).toBe(true);
  });

  it('fails when portal is authored anywhere else', () => {
    const registry = registryWith((documents) => {
      const stray = nodeDocuments(documents).find((node) => node['cell'] !== PORTAL_HOME_CELL_ID);
      if (stray === undefined) throw new Error('every node is in rego-limen; fixture impossible');
      effectsOf(stray).push({
        primitive: PORTAL_PRIMITIVE_ID,
        magnitude: 1024,
        target: 'universe',
        durationTicks: 0,
      });
    });

    const report = checkPrimitiveCoverage(registry);
    expect(report.ok).toBe(false);
    expect(report.misplacedPortalNodes.length).toBe(1);
    expect(formatPrimitiveCoverageReport(report)).toContain(PORTAL_HOME_CELL_ID);
  });
});

describe('coverage is computed over v1 content, not over a hardcoded list', () => {
  it('reads the exercised set from the loaded registry', () => {
    const registry = shippedRegistry();
    const report = checkPrimitiveCoverage(registry);
    const v1 = v1CellIds(registry);

    for (const entry of report.exercised) {
      const declaring = registry.nodes.filter(
        (node) =>
          v1.has(node.record.cell) &&
          node.record.effects.some((effect) => effect.primitive === entry.primitiveId),
      );
      expect(entry.nodeCount).toBe(declaring.length);
      expect(entry.nodeCount).toBeGreaterThan(0);
    }
  });
});

describe('the check is wired into CI', () => {
  it('is part of npm run verify', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(manifest.scripts['check:coverage']).toBeDefined();
    expect(manifest.scripts['verify']).toContain('check:coverage');
  });

  it('is a step in the GitHub Actions workflow, in both jobs', () => {
    const workflow = readFileSync(
      new URL('../../../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    );
    const steps = workflow.split('\n').filter((line) => line.includes('npm run check:coverage'));
    expect(steps.length).toBe(2);
  });

  it('runs on the self-hosted runner through the same verify gate', () => {
    const script = readFileSync(new URL('../../../../scripts/ci-check.sh', import.meta.url), 'utf8');
    expect(script).toContain('npm run verify');
  });
});
