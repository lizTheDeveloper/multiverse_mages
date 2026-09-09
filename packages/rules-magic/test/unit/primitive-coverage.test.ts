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

import { effectsOf, nodeDocuments, registryWith, shippedRegistry, v1CellIds } from './effect-fixtures.js';

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

  // Was 'except lifespan and fertility'. The exclusion list is empty now, so the
  // filter below removes nothing and the claim is the stronger one: every
  // primitive the registry declares is exercised by enabled content.
  it('exercises every registry primitive', () => {
    const registry = shippedRegistry();
    const report = checkPrimitiveCoverage(registry);
    const exercised = new Set(report.exercised.map((entry) => entry.primitiveId));
    const expected = registry.primitives
      .map((entry) => entry.record.id)
      .filter((id) => !PRIMITIVE_COVERAGE_EXCLUSIONS.includes(id));

    expect([...exercised].sort()).toEqual([...expected].sort());
  });

  // Was 'declares exactly the two exclusions the design accepted', asserting
  // `['fertility', 'lifespan']`. Enabling all seventy cells covered both — 5
  // nodes carry `fertility` and 17 carry `lifespan` — and the check fails in that
  // direction on purpose, so the list is empty. The assertion is kept exact
  // rather than deleted: an entry reappearing is a claim that some primitive is
  // unmeasurable at 0.5.0, and it should still be hard to make quietly.
  it('declares no exclusions, because enabled content covers every primitive', () => {
    expect([...PRIMITIVE_COVERAGE_EXCLUSIONS]).toEqual([]);
  });

  it('states the exclusions in the formatted report, so a reader sees the gap', () => {
    // Two halves, because the shipped list is empty and a report of nothing
    // cannot demonstrate that the report would name a gap. The first asserts the
    // line is still printed — a reader must be able to see that the list is empty
    // rather than infer it from silence — and the second passes exclusions
    // explicitly, which is the same argument the check itself takes.
    const shipped = formatPrimitiveCoverageReport(checkPrimitiveCoverage(shippedRegistry()));
    expect(shipped).toContain('Declared exclusions:');
    expect(shipped).not.toMatch(/Declared exclusions: \w/u);

    const withGap = formatPrimitiveCoverageReport(
      checkPrimitiveCoverage(shippedRegistry(), ['fertility', 'lifespan']),
    );
    expect(withGap).toContain('fertility');
    expect(withGap).toContain('lifespan');
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
    // This direction fired for real: the shipped list held `fertility` and
    // `lifespan`, enabling all seventy cells covered both, `npm run check:coverage`
    // went red, and the fix was to empty the list. So the exclusion is now passed
    // explicitly rather than read from the shipped default, which is empty and
    // could not express the case. `lifespan` is still the primitive, and the v1
    // filter below still matters: the check reads only flagged content, and a
    // fixture that mutated an unflagged node would assert the opposite of what it
    // means the day a content set flags a proper subset again.
    const v1 = v1CellIds(shippedRegistry());
    const registry = registryWith((documents) => {
      const first = nodeDocuments(documents).find((node) => v1.has(node['cell'] as string));
      if (first === undefined) throw new Error('node.json declares no v1 node');
      effectsOf(first).push({
        primitive: 'lifespan',
        magnitude: 12,
        target: 'self',
        durationTicks: 0,
      });
    });

    const report = checkPrimitiveCoverage(registry, ['lifespan']);
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
    // A v1 cell that is not rego-limen, for the same reason as above: portal
    // authored in a non-v1 cell is invisible to a check scoped to v1 content, so
    // the stray has to be somewhere the check actually reads.
    const v1 = v1CellIds(shippedRegistry());
    const registry = registryWith((documents) => {
      const stray = nodeDocuments(documents).find(
        (node) => node['cell'] !== PORTAL_HOME_CELL_ID && v1.has(node['cell'] as string),
      );
      if (stray === undefined) throw new Error('every v1 node is in rego-limen; fixture impossible');
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
