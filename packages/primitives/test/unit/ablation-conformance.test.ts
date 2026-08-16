/*
 * Multiverse Mages — every primitive in §3 must have a neutralization rule.
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
 * A primitive with no neutralization rule is worse than an unimplemented
 * feature, because it does not look like one. The ablation arm runs, the sweep
 * completes, the metric is emitted with a confidence interval, and the number
 * describes an arm in which the primitive was never actually removed — or, if
 * the missing rule defaulted to `0`, an arm in which every world-scale rate was
 * multiplied by zero. Both come back looking like findings.
 *
 * So the check is over the whole registry, it is end-to-end rather than a table
 * lookup, and it fails rather than defaults.
 *
 * **The link to `contracts.md` §3.** The registry data is proved equal to the
 * §3 table, in both directions, by
 * `packages/content/test/unit/primitive-contract.test.ts`. This file does not
 * re-derive that table — a third copy would be a third thing to drift — but it
 * does read the §3 ids straight out of the document and require the report to
 * cover every one of them, so "every primitive in §3" is checked here rather
 * than inferred from another suite passing.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FP_ONE } from '@mm/sim-core';
import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry, PrimitiveRecord, PrimitiveStacking } from '@mm/content';
import { NEUTRALIZED_MAGNITUDE, ablationConformance } from '@mm/primitives';

const registry: ContentRegistry = loadContent(shippedContentSource());
const shipped: readonly PrimitiveRecord[] = registry.primitives.map((entry) => entry.record);

/** From packages/primitives/test/unit/ up to the repository root. */
const contracts = readFileSync(
  fileURLToPath(new URL('../../../../docs/design/contracts.md', import.meta.url)),
  'utf8',
);

/**
 * The primitive ids of the §3 table, read from the document.
 *
 * Only the ids, deliberately: units, scales, caps and stacking phrases are
 * `primitive-contract.test.ts`'s job, and duplicating its parser here would
 * duplicate its maintenance. What this file needs from the document is the
 * *census* — which primitives exist — because the failure it guards against is
 * a primitive nobody neutralized.
 */
function contractPrimitiveIds(): readonly string[] {
  const section = contracts.slice(contracts.indexOf('## 3. Effect Primitive Semantics'));
  const table = section.slice(0, section.indexOf('\n\n**Why the caps exist'));
  const ids: string[] = [];
  for (const line of table.split('\n')) {
    const match = /^\|\s*`([a-z-]+)`\s*\|/.exec(line);
    if (match?.[1] !== undefined) {
      ids.push(match[1]);
    }
  }
  return ids;
}

describe('the ablation conformance check over shipped content', () => {
  const report = ablationConformance(shipped);

  it('covers every primitive the contract table names', () => {
    const fromDocument = contractPrimitiveIds();
    // Guard against the parser silently matching nothing and the check below
    // then passing over an empty set.
    expect(fromDocument.length).toBe(16);
    expect([...report.checked].map((row) => row.primitiveId).sort()).toEqual(
      [...fromDocument].sort(),
    );
  });

  it('passes, with a declared neutralization for all five stacking classes', () => {
    expect(report.problems).toEqual([]);
    expect(report.conformant).toBe(true);
    expect(new Set(report.checked.map((row) => row.stacking))).toEqual(
      new Set(Object.keys(NEUTRALIZED_MAGNITUDE)),
    );
  });

  it('records what each primitive neutralizes to, matching its class', () => {
    for (const row of report.checked) {
      expect(row.neutralizedTo).toBe(NEUTRALIZED_MAGNITUDE[row.stacking]);
    }
    const byId = new Map(report.checked.map((row) => [row.primitiveId, row.neutralizedTo]));
    // Spot-checked against `contracts.md` §3 by hand, because a loop that
    // compares the implementation to itself would agree with any answer.
    expect(byId.get('research-rate')).toBe(FP_ONE);
    expect(byId.get('ward')).toBe(0);
    expect(byId.get('knowledge-steal')).toBe(0);
    expect(byId.get('portal')).toBe(0);
    expect(byId.get('direct-damage')).toBe(0);
  });

  it('proves the mask observably changed each primitive, not merely ran', () => {
    // A mask that silently did nothing would produce a clean report from a
    // table lookup. The check probes each primitive with real sources and
    // requires the ablated value to differ from the unablated one.
    for (const row of report.checked) {
      expect(row.unablated).not.toBe(row.neutralizedTo);
    }
  });
});

describe('a primitive without a rule fails the check rather than defaulting', () => {
  function withStacking(stacking: string): PrimitiveRecord {
    return {
      id: 'geomancy',
      unit: 'invented-for-this-test',
      scale: 'world',
      stacking: stacking as PrimitiveStacking,
      cap: { kind: 'none' },
    };
  }

  it('names the primitive and its unhandled class', () => {
    const report = ablationConformance([...shipped, withStacking('geometric-mean')]);
    expect(report.conformant).toBe(false);
    expect(report.problems).toHaveLength(1);
    const [problem] = report.problems;
    expect(problem?.primitiveId).toBe('geomancy');
    expect(problem?.stacking).toBe('geometric-mean');
    expect(problem?.reason).toMatch(/neutralization/i);
  });

  it('does not quietly neutralize it to zero, which is right four times in five', () => {
    const report = ablationConformance([withStacking('geometric-mean')]);
    expect(report.checked).toEqual([]);
    expect(report.conformant).toBe(false);
  });

  it('still reports the conformant primitives beside the failure', () => {
    // A check that stops at the first problem tells whoever added a stacking
    // class one thing at a time.
    const report = ablationConformance([...shipped, withStacking('geometric-mean')]);
    expect(report.checked).toHaveLength(shipped.length);
  });

  it('rejects a duplicate primitive id, since one arm would shadow the other', () => {
    const first = shipped[0];
    if (first === undefined) throw new Error('shipped content has no primitives');
    const report = ablationConformance([...shipped, first]);
    expect(report.conformant).toBe(false);
    expect(report.problems.map((problem) => problem.reason).join('\n')).toMatch(/duplicate/i);
  });
});
