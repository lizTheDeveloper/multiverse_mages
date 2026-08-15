/*
 * Multiverse Mages — rituals are a hard load failure or nothing.
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
 * `contracts.md` §2.13's self-enforcing gate: a ritual whose caster roles are
 * not mutually exclusive tracks is refused at load, because such a "ritual" is
 * satisfiable by one sufficiently patient mage and is just an expensive spell.
 * Every case here takes the real shipped content and breaks exactly one thing,
 * the same discipline `compositional-schema.test.ts` uses for the track graph
 * this construct is built on top of.
 */

import { describe, expect, it } from 'vitest';

import { ContentValidationError, loadContent, validateContent } from '@mm/content';
import type { ContentDiagnostic, ContentDiagnosticCode } from '@mm/content';

import { brokenSource, recordById, recordsOf, shippedDocuments, sourceOf } from './fixtures.js';

/** Loads and returns the diagnostics, asserting the load threw. */
function expectHardFail(source: Parameters<typeof loadContent>[0]): readonly ContentDiagnostic[] {
  let thrown: unknown;
  try {
    loadContent(source);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ContentValidationError);
  const error = thrown as ContentValidationError;

  // No partially populated registry exists on any path.
  expect(validateContent(source).registry).toBeUndefined();
  expect(error.diagnostics.length).toBeGreaterThan(0);
  return error.diagnostics;
}

/** Every diagnostic of one code, asserting at least one was found. */
function only(diagnostics: readonly ContentDiagnostic[], code: ContentDiagnosticCode): readonly ContentDiagnostic[] {
  const matching = diagnostics.filter((d) => d.code === code);
  expect(matching.length, `expected at least one "${code}" diagnostic, found none`).toBeGreaterThan(0);
  return matching;
}

const RITUAL_ID = 'read-the-sealed-shelf';

describe('the shipped rituals load clean', () => {
  it('accepts the real content set unmodified', () => {
    expect(validateContent(sourceOf(shippedDocuments())).diagnostics).toEqual([]);
    expect(() => loadContent(sourceOf(shippedDocuments()))).not.toThrow();
  });

  it('ships two rituals, each on the shipped mutually exclusive track pairs', () => {
    const registry = loadContent(sourceOf(shippedDocuments()));
    // `loadContent` always populates `rituals` — it is optional on the type
    // only so a `ContentRegistry` fixture built before rituals existed keeps
    // compiling (see the field's own doc). A real registry never omits it.
    const rituals = registry.rituals;
    expect(rituals).toBeDefined();
    expect((rituals ?? []).map((entry) => entry.record.id).sort()).toEqual([
      'found-the-hollow-hall',
      'read-the-sealed-shelf',
    ]);
    for (const entry of rituals ?? []) {
      expect(entry.record.roles.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('contracts.md §2.13: ritual-castable-by-one is the self-enforcing gate', () => {
  it('refuses a ritual whose roles declare no exclusion between their tracks at all', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        const roles = ritual['roles'] as Record<string, unknown>[];
        // "the-standing-gate" excludes "the-nameless-road", not
        // "the-sealed-mind" — no exclusion edge connects the two roles at all.
        roles[0]!['track'] = 'the-standing-gate';
      }),
    );
    const bad = only(diagnostics, 'ritual-castable-by-one');
    expect(bad[0]?.message).toContain(RITUAL_ID);
    expect(bad[0]?.message).toContain('the-standing-gate');
    expect(bad[0]?.message).toContain('declares no exclusion');
  });

  it('refuses a ritual whose role minNodes sits below the threshold that closes the other role', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        const roles = ritual['roles'] as Record<string, unknown>[];
        // the-open-mind / the-sealed-mind exclude each other at threshold 2.
        // minNodes 1 is below it: a mage could hold one node of each track
        // without either exclusion ever engaging, and fill both roles herself.
        roles[1]!['minNodes'] = 1;
      }),
    );
    const bad = only(diagnostics, 'ritual-castable-by-one');
    expect(bad[0]?.message).toContain(RITUAL_ID);
    expect(bad[0]?.message).toContain('below the 2 needed');
  });

  it('accepts a role whose minNodes sits exactly at the closing threshold', () => {
    // The boundary case, proving the check is `<`, not `<=`.
    expect(
      validateContent(
        brokenSource((documents) => {
          const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
          const roles = ritual['roles'] as Record<string, unknown>[];
          roles[1]!['minNodes'] = 2;
        }),
      ).diagnostics,
    ).toEqual([]);
  });
});

describe('contracts.md §2.13: the other three ritual diagnostics', () => {
  it('refuses a role naming no track.json record', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        const roles = ritual['roles'] as Record<string, unknown>[];
        roles[0]!['track'] = 'the-imaginary-mind';
      }),
    );
    const bad = only(diagnostics, 'ritual-role-track-unknown');
    expect(bad[0]?.message).toContain('the-imaginary-mind');
  });

  it('refuses a ritual with only one caster role, naming why two is the minimum', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        (ritual['roles'] as unknown[]).length = 1;
      }),
    );
    const bad = only(diagnostics, 'ritual-too-few-roles');
    expect(bad[0]?.message).toContain('expensive spell');
  });

  it('refuses two roles on the same track', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        const roles = ritual['roles'] as Record<string, unknown>[];
        roles[1]!['track'] = roles[0]!['track'];
      }),
    );
    const bad = only(diagnostics, 'ritual-duplicate-role-track');
    expect(bad[0]?.message).toContain('one role authored twice');
  });

  it('refuses an effect naming a primitive primitive.json does not define', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        const effects = ritual['effects'] as Record<string, unknown>[];
        effects[0]!['primitive'] = 'not-a-real-primitive';
      }),
    );
    const bad = only(diagnostics, 'unknown-reference');
    expect(bad[0]?.message).toContain(RITUAL_ID);
    expect(bad[0]?.message).toContain('not-a-real-primitive');
  });

  it('rejects every diagnostic as a hard failure, never a partial registry', () => {
    // The control every case above already exercises individually —
    // asserted once more, directly, so the claim is visible without reading
    // every case's assertions.
    for (const mutate of [
      (documents: ReturnType<typeof shippedDocuments>) => {
        const ritual = recordById(documents, 'ritual.json', RITUAL_ID);
        (ritual['roles'] as unknown[]).length = 1;
      },
    ]) {
      const source = brokenSource(mutate);
      expect(() => loadContent(source)).toThrow(ContentValidationError);
      expect(validateContent(source).registry).toBeUndefined();
    }
  });
});

describe('sanity: recordsOf still finds ritual.json in the shipped set', () => {
  it('has at least two records to mutate', () => {
    expect(recordsOf(shippedDocuments(), 'ritual.json').length).toBeGreaterThanOrEqual(2);
  });
});
