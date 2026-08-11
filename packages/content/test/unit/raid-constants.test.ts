/*
 * Multiverse Mages — the raid content table, and the load-time proof that a
 * raid can end.
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
 * `raid-engagement` tasks 7.6, 7.7 and 7.8.
 *
 * Every case below breaks exactly one thing in the *shipped* content set, so
 * that what is proven is "the loader rejects this defect" rather than "a
 * hand-written stub was never valid". The three that matter most are not
 * tuning hygiene:
 *
 * - a decay of `0` — the raid that runs forever, with no error and no symptom;
 * - a bound above `MAX_ENGAGEMENT_TICKS` — a ceiling content can legally reach
 *   is a ceiling that says nothing when the engine hits it;
 * - a radius beyond the spatial index's cell — a query that silently stops
 *   finding combatants at the edge of an effect.
 *
 * The positive control is first: the shipped set loads. Without it, every
 * assertion below would also pass if the checker rejected everything.
 */

import { describe, expect, it } from 'vitest';

import type { RaidConstantRecord } from '@mm/content';
import {
  ContentValidationError,
  MAX_ENGAGEMENT_TICKS,
  REQUIRED_RAID_CONSTANTS,
  checkRaidConstants,
  engagementTickBound,
  loadContent,
  shippedContentSource,
} from '@mm/content';

import { brokenSource, recordById, recordsOf, shippedDocuments } from './fixtures.js';

const registry = loadContent(shippedContentSource());

function shippedRaidConstants(): RaidConstantRecord[] {
  return shippedDocuments()['raid-constant.json'] as unknown as RaidConstantRecord[];
}

/** Every diagnostic message a broken content set produced, joined for matching. */
function refusalFor(mutate: (documents: Record<string, unknown>) => void): string {
  let thrown: unknown;
  try {
    loadContent(brokenSource(mutate as never));
  } catch (error) {
    thrown = error;
  }
  if (!(thrown instanceof ContentValidationError)) {
    throw new Error('the content set loaded when it should have been refused');
  }
  return thrown.diagnostics.map((entry) => entry.message).join('\n');
}

function setValue(documents: Record<string, unknown>, id: string, value: number): void {
  recordById(documents as never, 'raid-constant.json', id)['value'] = value;
}

describe('the shipped raid table', () => {
  it('loads, and declares exactly the set the rules read', () => {
    const declared = registry.raidConstants.map((entry) => entry.record.id).sort();
    expect(declared).toEqual([...REQUIRED_RAID_CONSTANTS].sort());
  });

  it('marks every magnitude untuned, because nothing before 0.5.0 may claim balance', () => {
    for (const entry of registry.raidConstants) {
      expect(entry.record.tuningStatus).toBe('untuned');
    }
  });

  it('authors a decay of at least 1 and a bound under the ceiling', () => {
    const initial = registry.raidConstant('portal-stability-initial');
    const jitter = registry.raidConstant('portal-stability-jitter');
    const decay = registry.raidConstant('stability-decay-per-tick');

    expect(decay).toBeGreaterThanOrEqual(1);
    expect(engagementTickBound(initial + jitter, decay)).toBeLessThanOrEqual(MAX_ENGAGEMENT_TICKS);
  });

  it('reads a named constant and refuses an invented one', () => {
    expect(registry.raidConstant('cast-range')).toBe(51200);
    // A silent 0 here would be a cast that reaches nowhere, which no assertion
    // in this project distinguishes from a balance result.
    expect(() => registry.raidConstant('cast-radius')).toThrow(/cast-radius/u);
  });
});

describe('the loader refuses a raid that cannot end', () => {
  it('rejects a decay of zero, and says why', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'stability-decay-per-tick', 0);
    });
    expect(message).toContain('stability-decay-per-tick is 0');
    expect(message).toContain('runs forever');
  });

  it('rejects a bound above the compile-time ceiling, reporting both numbers', () => {
    // The decay stays legal; only the opening stability moves. This is the
    // realistic version of the mistake — nobody authors a zero decay on
    // purpose, and everybody is tempted to make a raid "a bit longer".
    const decay = registry.raidConstant('stability-decay-per-tick');
    const overshoot = (MAX_ENGAGEMENT_TICKS + 100) * decay;
    const message = refusalFor((documents) => {
      setValue(documents, 'portal-stability-initial', overshoot);
      setValue(documents, 'portal-stability-jitter', 0);
    });
    expect(message).toContain(String(MAX_ENGAGEMENT_TICKS));
    expect(message).toContain(String(MAX_ENGAGEMENT_TICKS + 100));
  });

  it('counts the jitter into the bound, so a bound that holds on average is refused', () => {
    // Nominal length is legal; the jitter is what pushes the worst case over.
    // A checker that read only the nominal value would pass this content and
    // then produce raids longer than the declared ceiling, occasionally.
    const decay = registry.raidConstant('stability-decay-per-tick');
    const message = refusalFor((documents) => {
      setValue(documents, 'portal-stability-initial', (MAX_ENGAGEMENT_TICKS - 10) * decay);
      setValue(documents, 'portal-stability-jitter', 100 * decay);
    });
    expect(message).toContain(String(MAX_ENGAGEMENT_TICKS + 90));
  });

  it('rejects a portal that collapses before anyone acts', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'portal-stability-initial', 0);
      setValue(documents, 'portal-stability-jitter', 0);
    });
    expect(message).toContain('collapses before anyone acts');
  });

  it('refuses to compute a bound from a zero decay rather than returning Infinity', () => {
    expect(() => engagementTickBound(1000, 0)).toThrow(/at least 1/u);
    expect(engagementTickBound(1000, 3)).toBe(334);
  });
});

describe('the loader refuses a raid table that is missing or overgrown', () => {
  it('names a constant the rules read and content does not declare', () => {
    const message = refusalFor((documents) => {
      const records = recordsOf(documents as never, 'raid-constant.json');
      const at = records.findIndex((record) => record['id'] === 'cast-range');
      records.splice(at, 1);
    });
    expect(message).toContain('"cast-range" is not declared');
  });

  it('names a constant content declares and nothing reads', () => {
    const message = refusalFor((documents) => {
      recordsOf(documents as never, 'raid-constant.json').push({
        id: 'portal-second-wind',
        value: 1024,
        unit: 'raw',
        gloss: 'A knob nobody turns.',
        tuningStatus: 'untuned',
      });
    });
    expect(message).toContain('nothing reads it');
  });

  it('names a constant declared twice', () => {
    const records = shippedRaidConstants();
    const duplicate = records.find((record) => record.id === 'cast-range');
    if (duplicate === undefined) throw new Error('fixture drifted');
    const problems = checkRaidConstants([...records, duplicate]);
    expect(problems.map((entry) => entry.message).join('\n')).toContain('declared twice');
  });
});

describe('the loader refuses geometry that would break the spatial index', () => {
  it('rejects a radius beyond the index cell size', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'cast-range', registry.raidConstant('max-interaction-radius') + 1);
    });
    expect(message).toContain('cast-range');
    expect(message).toContain('nine cells');
  });

  it('rejects a battlefield that is not a whole number of terrain cells', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'battlefield-extent', registry.raidConstant('battlefield-extent') + 1);
    });
    expect(message).toContain('not a whole number');
  });

  it('rejects terrain that is entirely impassable', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'terrain-impassable-chance', 1024);
    });
    expect(message).toContain('no deployment position');
  });

  it('rejects a probability above fp(1024)', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'terrain-rough-chance', 2048);
    });
    expect(message).toContain('cannot exceed it');
  });
});

describe('the loader refuses caps that would not bind', () => {
  it('rejects a summon cap above the per-side cap', () => {
    const message = refusalFor((documents) => {
      setValue(documents, 'max-summons-per-side', registry.raidConstant('max-combatants-per-side') + 1);
    });
    expect(message).toContain('is decorative');
  });

  it('rejects a victory threshold outside 1..fp(1024)', () => {
    expect(
      refusalFor((documents) => {
        setValue(documents, 'victory-threshold-fraction', 0);
      }),
    ).toContain('wins by arriving');
    expect(
      refusalFor((documents) => {
        setValue(documents, 'victory-threshold-fraction', 1025);
      }),
    ).toContain('taking everything on the field');
  });
});
