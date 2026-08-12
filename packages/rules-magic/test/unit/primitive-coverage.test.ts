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

import type { ContentFileName } from '@mm/content';

import { effectsOf, nodeDocuments, registryWith, shippedRegistry, v1CellIds } from './effect-fixtures.js';

/**
 * A v1 node in a `perdo`-technique cell, as a raw document.
 *
 * `remove` is the only W20 effect mode that needs no extra payload
 * (`node.schema.json`'s `mode-payload-missing`/`mode-payload-extraneous`; see
 * `TECHNIQUE_TO_MODE`/`MODE_PAYLOADS` in `load.ts`), and every v1 cell is
 * intellego, perdo or rego (`compositional-content.md` §3.3's v1 rectangle),
 * so `perdo` is the one technique these fixtures can push a bare
 * `{ mode: 'remove' }` effect into without also authoring a `reveals` or
 * `control` payload to stay coherent with the cell it lands in.
 */
function firstPerdoV1Node(
  documents: Record<ContentFileName, unknown>,
): Record<string, unknown> {
  const cells = documents['cell.json'] as Record<string, unknown>[];
  const perdoCells = new Set(
    cells.filter((cell) => cell['technique'] === 'perdo' && cell['v1'] === true).map((cell) => cell['id']),
  );
  const found = nodeDocuments(documents).find((node) => perdoCells.has(node['cell']));
  if (found === undefined) throw new Error('node.json declares no v1 node in a perdo cell');
  return found;
}

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

  it('exercises every registry primitive except fertility', () => {
    const registry = shippedRegistry();
    const report = checkPrimitiveCoverage(registry);
    const exercised = new Set(report.exercised.map((entry) => entry.primitiveId));
    const expected = registry.primitives
      .map((entry) => entry.record.id)
      .filter((id) => !PRIMITIVE_COVERAGE_EXCLUSIONS.includes(id));

    expect([...exercised].sort()).toEqual([...expected].sort());
  });

  it('declares exactly the one exclusion the design accepted', () => {
    // `lifespan` left this list in W20: a life-extension ladder is now
    // authored in rego-nomen, and content exercising it is the whole point.
    expect([...PRIMITIVE_COVERAGE_EXCLUSIONS]).toEqual(['fertility']);
  });

  it('states the exclusion in the formatted report, and lifespan as exercised rather than excluded', () => {
    const report = checkPrimitiveCoverage(shippedRegistry());
    const text = formatPrimitiveCoverageReport(report);
    expect(text).toContain('fertility');
    expect(text).toContain('Declared exclusions: fertility');
    expect(report.exercised.map((entry) => entry.primitiveId)).toContain('lifespan');
    expect(report.coveredExclusions).toEqual([]);
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
    // Deliberately a *v1* node, and specifically one in a perdo cell -- see
    // `firstPerdoV1Node`'s doc for why. `fertility` is the one exclusion left
    // (W20 moved `lifespan` off this list: rego-nomen now authors it for
    // real).
    const registry = registryWith((documents) => {
      const first = firstPerdoV1Node(documents);
      effectsOf(first).push({
        primitive: 'fertility',
        magnitude: 12,
        target: 'self',
        durationTicks: 0,
        mode: 'remove',
        gloss: 'test fixture: an extra effect pushed onto a real v1 node to cover an exclusion.',
      });
    });

    const report = checkPrimitiveCoverage(registry);
    expect(report.ok).toBe(false);
    expect(report.coveredExclusions).toEqual(['fertility']);
    const text = formatPrimitiveCoverageReport(report);
    expect(text).toContain('fertility');
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
    // the stray has to be somewhere the check actually reads. A perdo cell,
    // specifically, so `mode: 'remove'` needs no extra payload to stay
    // coherent -- see `firstPerdoV1Node`'s doc.
    const registry = registryWith((documents) => {
      const stray = firstPerdoV1Node(documents);
      effectsOf(stray).push({
        primitive: PORTAL_PRIMITIVE_ID,
        magnitude: 1024,
        target: 'universe',
        durationTicks: 0,
        mode: 'remove',
        gloss: 'test fixture: portal authored outside its mandated cell.',
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
