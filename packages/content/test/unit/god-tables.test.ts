/*
 * Multiverse Mages — the god-agency cost and constant tables, and the checks a
 * JSON Schema cannot make.
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
 * `god-agency` tasks 1.5, 1.6 and 1.7.
 *
 * Each check below is exercised twice: once against the shipped tables, which
 * must be clean, and once against a document deliberately broken in exactly the
 * way the check exists to catch. A validator that only ever runs against a
 * healthy tree cannot tell "found nothing" from "looks for nothing", and this
 * file is the difference.
 */

import { describe, expect, it } from 'vitest';

import type { GodConstantRecord, GodCostRecord } from '@mm/content';
import {
  GOD_ACTION_ID_MAX,
  REQUIRED_GOD_CONSTANTS,
  checkGodConstants,
  checkGodCosts,
  loadContent,
  memorySource,
  shippedContentSource,
} from '@mm/content';

import { shippedDocuments, sourceOf } from './fixtures.js';

const registry = loadContent(shippedContentSource());

function costs(): GodCostRecord[] {
  return shippedDocuments()['god-cost.json'] as unknown as GodCostRecord[];
}

function constants(): GodConstantRecord[] {
  return shippedDocuments()['god-constant.json'] as unknown as GodConstantRecord[];
}

describe('the shipped god tables', () => {
  it('declares exactly one cost per action id in §4.2', () => {
    const declared = registry.godCosts.map((entry) => entry.record.actionId).sort((a, b) => a - b);
    expect(declared).toEqual(
      Array.from({ length: GOD_ACTION_ID_MAX + 1 }, (_value, index) => index),
    );
  });

  it('leaves the no-op and the ascension declaration free', () => {
    expect(registry.godCost(0)?.favorCost).toBe(0);
    expect(registry.godCost(15)?.favorCost).toBe(0);
  });

  it('prices permitting and forbidding identically on both axes', () => {
    expect(registry.godCost(1)?.favorCost).toBe(registry.godCost(2)?.favorCost);
    expect(registry.godCost(3)?.favorCost).toBe(registry.godCost(4)?.favorCost);
  });

  it('makes assigning a role strictly the cheapest non-zero intervention', () => {
    const assign = registry.godCost(10)?.favorCost ?? 0;
    expect(assign).toBeGreaterThan(0);
    for (const entry of registry.godCosts) {
      if (entry.record.actionId === 10 || entry.record.favorCost === 0) continue;
      expect(entry.record.favorCost).toBeGreaterThan(assign);
    }
  });

  it('declares every constant the rules read, and nothing else', () => {
    const declared = registry.godConstants.map((entry) => entry.record.id).sort();
    expect(declared).toEqual([...REQUIRED_GOD_CONSTANTS].sort());
  });

  it('marks every magnitude untuned, because nothing below 0.5.0 may claim balance', () => {
    for (const entry of registry.godCosts) expect(entry.record.tuningStatus).toBe('untuned');
    for (const entry of registry.godConstants) expect(entry.record.tuningStatus).toBe('untuned');
  });

  it('reads a constant by name and refuses one nobody declared', () => {
    expect(registry.godConstant('worship-lag-rise')).toBe(51);
    expect(() => registry.godConstant('worship-lag-sideways')).toThrow(/no god-agency constant/iu);
  });

  it('holds the prestige identity that makes the carry-over ceiling arithmetic', () => {
    const cap = registry.godConstant('prestige-cap');
    const retention = registry.godConstant('prestige-retention');
    const earnMax = registry.godConstant('prestige-earn-max');
    expect(cap * (1024 - retention)).toBe(earnMax * 1024);
  });

  it('holds the worship ceiling as the sum of the class caps', () => {
    expect(
      registry.godConstant('worship-mage-cap') +
        registry.godConstant('worship-university-cap') +
        registry.godConstant('worship-populace-cap'),
    ).toBe(registry.godConstant('worship-max'));
  });
});

describe('the cost table checks catch what a schema cannot', () => {
  it('passes the shipped table', () => {
    expect(checkGodCosts(costs())).toEqual([]);
  });

  it('fails a table missing an action', () => {
    const table = costs().filter((record) => record.actionId !== 13);
    const found = checkGodCosts(table);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toMatch(/action id 13/u);
  });

  it('fails a table declaring one action twice', () => {
    const table = costs();
    const found = checkGodCosts([...table, { ...(table[5] as GodCostRecord), id: 'a-second-one' }]);
    expect(found.map((entry) => entry.code)).toEqual(['content-invariant']);
  });

  it('fails a table where forbidding is cheaper than permitting', () => {
    const table = costs().map((record) =>
      record.actionId === 2 ? { ...record, favorCost: 4096 } : record,
    );
    expect(checkGodCosts(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/permitting a technique costs/u),
    ]);
  });

  it('fails a table where some other action is as cheap as assigning a role', () => {
    const table = costs().map((record) =>
      record.actionId === 12 ? { ...record, favorCost: 256 } : record,
    );
    expect(checkGodCosts(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/strictly the cheapest/u),
    ]);
  });

  it('refuses the whole load, not just the check, when an action is uncovered', () => {
    // Renumbered rather than deleted: the schema's `minItems: 16` catches a
    // short table on its own, and a test that tripped that would prove nothing
    // about the covering check. Sixteen records with a gap in them is the case
    // only the covering check can see.
    const documents = shippedDocuments();
    const table = documents['god-cost.json'] as Record<string, unknown>[];
    const blessing = table.find((record) => record['actionId'] === 9);
    if (blessing === undefined) throw new Error('fixture drifted');
    blessing['actionId'] = 14;
    expect(() => loadContent(sourceOf(documents, 'broken-costs'))).toThrow(/action id 9/u);
  });
});

describe('the constant table checks catch what a schema cannot', () => {
  it('passes the shipped table', () => {
    expect(checkGodConstants(constants())).toEqual([]);
  });

  it('fails a table missing a constant the rules read', () => {
    const table = constants().filter((record) => record.id !== 'worship-lag-fall');
    // Two problems, and both are real: the constant is absent, and the
    // rise/fall asymmetry can no longer be checked either. The second is not
    // noise — a set that cannot prove its own damping is a set that must not
    // load.
    expect(checkGodConstants(table).map((entry) => entry.message)).toContainEqual(
      expect.stringMatching(/"worship-lag-fall" is not declared/u),
    );
  });

  it('fails a table declaring a constant nothing reads', () => {
    const table = [
      ...constants(),
      {
        id: 'worship-vibes',
        value: 1024,
        unit: 'fp',
        gloss: 'A knob nobody turns.',
        tuningStatus: 'untuned',
      } satisfies GodConstantRecord,
    ];
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/nothing reads it/u),
    ]);
  });

  it('fails a retune that breaks the prestige recurrence identity', () => {
    const table = constants().map((record) =>
      record.id === 'prestige-retention' ? { ...record, value: 512 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/analytic limit of the carry-over recurrence/u),
    ]);
  });

  it('fails a retention of 1, where the carry-over would not converge at all', () => {
    const table = constants().map((record) =>
      record.id === 'prestige-retention' ? { ...record, value: 1024 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/only converges while retention is strictly below 1/u),
    ]);
  });

  it('fails a stated worship ceiling that the class caps cannot reach', () => {
    const table = constants().map((record) =>
      record.id === 'worship-mage-cap' ? { ...record, value: 2048 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/the three class caps sum to/u),
    ]);
  });

  it('fails a worship loop whose fall is no faster than its rise', () => {
    const table = constants().map((record) =>
      record.id === 'worship-lag-fall' ? { ...record, value: 51 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/must exceed worship-lag-rise/u),
    ]);
  });

  // The ascension achievement constants. Each check below pins a setting that
  // would make a summit *unreachable* rather than merely hard — the failure
  // mode that costs a whole 2400-tick sweep to notice, because every run simply
  // truncates and the rate reads a flat zero that looks like a balance result.

  it('fails a summit that no cell can stand at, because zero copies is not mastery', () => {
    const table = constants().map((record) =>
      record.id === 'ascension-summit-copies' ? { ...record, value: 0 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/satisfied by a node nobody holds/u),
    ]);
  });

  it('fails a Path A that asks for no mastered cell at all', () => {
    // At zero the apotheosis path is a worship-tier clock, which is exactly the
    // defect the constant was introduced to close.
    const table = constants().map((record) =>
      record.id === 'ascension-summit-cells' ? { ...record, value: 0 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/worship-tier clock/u),
    ]);
  });

  it('fails a canon asked to span more cells than it holds nodes', () => {
    // Unsatisfiable by arithmetic rather than by difficulty: a universe cannot
    // know nodes in more cells than it knows nodes.
    const table = constants().map((record) =>
      record.id === 'ascension-canon-cells' ? { ...record, value: 100_000 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/cannot know nodes in more cells than it knows nodes/u),
    ]);
  });

  it('fails a loss allowance outside the unit interval, at either end', () => {
    for (const value of [-1, 1025]) {
      const table = constants().map((record) =>
        record.id === 'ascension-loss-fraction' ? { ...record, value } : record,
      );
      expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
        expect.stringMatching(/outside \[0, fp\(1024\)\]/u),
      ]);
    }
  });

  it('fails an encouragement that never decays', () => {
    const table = constants().map((record) =>
      record.id === 'encourage-decay-per-tick' ? { ...record, value: 0 } : record,
    );
    expect(checkGodConstants(table).map((entry) => entry.message)).toEqual([
      expect.stringMatching(/must be positive/u),
    ]);
  });

  it('refuses the whole load when the identity is broken', () => {
    const documents = shippedDocuments();
    const table = documents['god-constant.json'] as Record<string, unknown>[];
    const retention = table.find((record) => record['id'] === 'prestige-retention');
    if (retention === undefined) throw new Error('fixture drifted');
    retention['value'] = 512;
    expect(() => loadContent(sourceOf(documents, 'broken-constants'))).toThrow(/analytic limit/u);
  });

  /**
   * `material-economy` task 4.1. The cost table may now name a **material**
   * price beside the favor one, and the invariant that matters is the one a
   * schema alone cannot give a useful message for: *which action* named a kind
   * that does not exist.
   *
   * `additionalProperties: false` on `materialCost` already refuses the
   * document, and its message names a JSON pointer. This check names the action
   * and the key, because a table of seventeen rows and a pointer of `/8` is the
   * failure that makes a reader count records.
   */
  it('fails a material cost naming a kind the economy does not have', () => {
    const table = costs().map((record) =>
      record.actionId === 14
        ? { ...record, materialCost: { passage: 1024, gold: 512 } as Record<string, number> }
        : record,
    );
    const messages = checkGodCosts(table as GodCostRecord[]).map((entry) => entry.message);
    expect(messages.join('\n')).toContain('open-portal');
    expect(messages.join('\n')).toContain('gold');
  });

  it('accepts a table where some actions name a material cost and others do not', () => {
    // The positive control for the check above. Seventeen rows, two of them
    // priced in materials: an unpriced verb is one that makes nothing out of
    // anything, and refusing the mixed table would be refusing the shipped one.
    const table = costs().map((record) =>
      record.actionId === 14 ? { ...record, materialCost: { passage: 1024 } } : record,
    );
    expect(checkGodCosts(table as GodCostRecord[])).toEqual([]);
  });

  it('fails a material cost that is empty, which is a price nobody wrote', () => {
    const table = costs().map((record) =>
      record.actionId === 14 ? { ...record, materialCost: {} } : record,
    );
    expect(checkGodCosts(table as GodCostRecord[]).map((entry) => entry.message).join('\n')).toContain(
      'open-portal',
    );
  });

  it('rejects a negative cost at the schema, before any of this runs', () => {
    const documents = shippedDocuments();
    const table = documents['god-cost.json'] as Record<string, unknown>[];
    (table[1] as Record<string, unknown>)['favorCost'] = -1;
    const files: Record<string, string> = {};
    for (const [name, document] of Object.entries(documents)) {
      files[name] = JSON.stringify(document);
    }
    expect(() => loadContent(memorySource(files, 'negative-cost'))).toThrow(/god-cost\.json/u);
  });
});
