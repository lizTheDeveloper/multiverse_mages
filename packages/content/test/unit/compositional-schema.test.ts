/*
 * Multiverse Mages — W20's compositional graph is a hard load failure or nothing.
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
 * Every case here takes the real shipped content — already authored to the
 * compositional standard `docs/design/compositional-content.md` §5 states —
 * and breaks exactly one thing, the same discipline `loader-hard-fail.test.ts`
 * uses for the checks that predate W20. Each proves the loader **throws**, the
 * registry is **not** returned in any partial form, and the diagnostic carries
 * the exact code §5's table names. The accepting case at the top proves the
 * inverse: unmodified, the compositional graph loads clean, so every rejection
 * below is provably about the one thing each test breaks and nothing else.
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

describe('the shipped compositional graph loads clean', () => {
  it('accepts the real content set unmodified', () => {
    expect(validateContent(sourceOf(shippedDocuments())).diagnostics).toEqual([]);
    expect(() => loadContent(sourceOf(shippedDocuments()))).not.toThrow();
  });
});

describe('compositional-content.md §5: every diagnostic is a hard load failure', () => {
  it('rejects mode-technique-incoherent, naming the cell technique and the offending mode', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // "rego-limen" is v1 and rego's coherent mode is "control"; "reveal" is
        // Intellego's, not Rego's.
        const node = recordById(documents, 'node.json', 'rl-hold-the-door');
        (node['effects'] as Record<string, unknown>[])[0]!['mode'] = 'reveal';
      }),
    );
    const bad = only(diagnostics, 'mode-technique-incoherent');
    expect(bad[0]?.message).toContain('rl-hold-the-door');
    expect(bad[0]?.message).toContain('rego-limen');
    expect(bad[0]?.message).toContain('"control"');
    expect(bad[0]?.message).toContain('check extends to any cell the moment it is flagged');
  });

  it('accepts an effect mode that matches its cell technique', () => {
    // The passing control for mode-technique-incoherent: rl-hold-the-door's
    // real "control" mode, untouched, must not trip the check that rejected it
    // above.
    const source = brokenSource(() => {
      /* no mutation */
    });
    expect(validateContent(source).diagnostics).toEqual([]);
  });

  it('rejects mode-payload-missing, naming the mode and the payload it requires', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'rl-hold-the-door');
        delete (node['effects'] as Record<string, unknown>[])[0]!['control'];
      }),
    );
    const bad = only(diagnostics, 'mode-payload-missing');
    expect(bad[0]?.message).toContain('rl-hold-the-door');
    expect(bad[0]?.message).toContain('"control"');
  });

  it('rejects mode-payload-extraneous, naming the mode and the payload it does not take', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // "create" (Creo) takes no payload at all — creo-animal is not v1, but
        // this check binds mode to payload everywhere, not only in v1 cells.
        const node = recordById(documents, 'node.json', 'can-mend-the-beast');
        (node['effects'] as Record<string, unknown>[])[0]!['control'] = { ceiling: 1024 };
      }),
    );
    const bad = only(diagnostics, 'mode-payload-extraneous');
    expect(bad[0]?.message).toContain('can-mend-the-beast');
    expect(bad[0]?.message).toContain('"create"');
    expect(bad[0]?.pointer).toContain('/control');
  });

  it('rejects mentem-is-not-in-the-world, for a Mentem effect targeting the universe', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // "rego-mentem" is v1, but the check binds to the form everywhere —
        // sound-design.md §4.2 says Mentem never reverberates into the world.
        const node = recordById(documents, 'node.json', 'im-weigh-the-attention');
        (node['effects'] as Record<string, unknown>[])[0]!['target'] = 'universe';
      }),
    );
    const bad = only(diagnostics, 'mentem-is-not-in-the-world');
    expect(bad[0]?.message).toContain('im-weigh-the-attention');
    expect(bad[0]?.message).toContain('intellego-mentem');
  });

  it('rejects antirequisite-unknown, naming the node and the missing id', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'il-count-the-doors');
        node['antirequisites'] = ['not-a-real-node'];
      }),
    );
    const bad = only(diagnostics, 'antirequisite-unknown');
    expect(bad[0]?.message).toContain('il-count-the-doors');
    expect(bad[0]?.message).toContain('not-a-real-node');
  });

  it('rejects antirequisite-self, naming the self-excluding node', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'il-count-the-doors');
        node['antirequisites'] = ['il-count-the-doors'];
      }),
    );
    const bad = only(diagnostics, 'antirequisite-self');
    expect(bad[0]?.message).toContain('il-count-the-doors');
  });

  it('rejects antirequisite-contradicts-prerequisite, for a node that could never be researched', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // il-count-the-doors already antirequires il-count-the-absences
        // (real content). Making it a direct prerequisite too means
        // researching il-count-the-doors would require already holding the
        // one node it may never be held alongside.
        recordById(documents, 'node.json', 'il-count-the-doors')['prerequisites'] = [
          'il-count-the-absences',
        ];
      }),
    );
    const bad = only(diagnostics, 'antirequisite-contradicts-prerequisite');
    expect(bad[0]?.message).toContain('il-count-the-doors');
    expect(bad[0]?.message).toContain('il-count-the-absences');
  });

  it('rejects track-unknown, for a node naming an undeclared track', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'node.json', 'il-read-the-binding')['track'] = 'not-a-real-track';
      }),
    );
    const bad = only(diagnostics, 'track-unknown');
    expect(bad[0]?.file).toBe('node.json');
    expect(bad[0]?.message).toContain('il-read-the-binding');
    expect(bad[0]?.message).toContain('not-a-real-track');
  });

  it('rejects track-unknown, for an exclusion naming an undeclared track', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const track = recordById(documents, 'track.json', 'the-open-mind');
        (track['excludes'] as Record<string, unknown>[])[0]!['track'] = 'not-a-real-track';
      }),
    );
    const bad = only(diagnostics, 'track-unknown');
    expect(bad[0]?.file).toBe('track.json');
    expect(bad[0]?.message).toContain('the-open-mind');
    expect(bad[0]?.message).toContain('not-a-real-track');
  });

  it('rejects track-exclusion-self, naming the self-excluding track', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const track = recordById(documents, 'track.json', 'the-open-mind');
        (track['excludes'] as Record<string, unknown>[])[0]!['track'] = 'the-open-mind';
      }),
    );
    const bad = only(diagnostics, 'track-exclusion-self');
    expect(bad[0]?.message).toContain('the-open-mind');
  });

  it('exclusion-reason-missing rejects a placeholder gloss', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const track = recordById(documents, 'track.json', 'the-open-mind');
        (track['excludes'] as Record<string, unknown>[])[0]!['gloss'] = 'nah';
      }),
    );
    const bad = only(diagnostics, 'exclusion-reason-missing');
    expect(bad[0]?.message).toContain('the-open-mind');
  });

  it('rejects track-exclusion-unsatisfiable, for a node whose prerequisite sits on a track its own track excludes', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // "the-standing-gate" excludes "the-nameless-road" (symmetric, real
        // content). il-read-the-binding is on "the-standing-gate";
        // il-read-the-unmarked-door is on "the-nameless-road". Gating the
        // first behind the second makes the first unresearchable.
        recordById(documents, 'node.json', 'il-read-the-binding')['prerequisites'] = [
          'il-read-the-unmarked-door',
        ];
      }),
    );
    const bad = only(diagnostics, 'track-exclusion-unsatisfiable');
    expect(bad[0]?.message).toContain('il-read-the-binding');
    expect(bad[0]?.message).toContain('the-standing-gate');
    expect(bad[0]?.message).toContain('the-nameless-road');
  });

  it('rejects track-excluded-by-trunk, when the excluded track gains a tier-1/2 node', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // "the-standing-gate" excludes "the-nameless-road". Moving a tier-2
        // node onto "the-nameless-road" means nearly every mage would touch
        // it early, making "the-standing-gate" unreachable in practice.
        const node = recordById(documents, 'node.json', 'il-count-the-absences');
        expect(node['tier']).toBe(2);
        node['track'] = 'the-nameless-road';
      }),
    );
    const bad = only(diagnostics, 'track-excluded-by-trunk');
    expect(bad[0]?.message).toContain('the-standing-gate');
    expect(bad[0]?.message).toContain('the-nameless-road');
  });

  it('rejects track-unreachable-from-trunk, for a track with no escape from what excludes it', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // A fresh track excluding "the-open-mind", with two members whose
        // only prerequisite sits on "the-open-mind" — every door in is a door
        // through the one thing that closes this track.
        const tracks = recordsOf(documents, 'track.json');
        tracks.push({
          id: 'zz-fixture-unreachable',
          name: 'Fixture: Unreachable',
          gloss: 'A track authored on purpose to have no reachable member, for the loader test.',
          excludes: [
            {
              track: 'the-open-mind',
              threshold: 1,
              symmetric: false,
              gloss: 'Test fixture exclusion, deliberately one-directional and long enough to pass.',
            },
          ],
          tuningStatus: 'untuned',
        });

        const template = recordById(documents, 'node.json', 'rm-kindle-devotion');
        const nodes = recordsOf(documents, 'node.json');
        const cellNodes = recordById(documents, 'cell.json', 'rego-mentem')['nodes'] as string[];
        for (const id of ['zz-fixture-stranded-a', 'zz-fixture-stranded-b']) {
          nodes.push({
            ...template,
            id,
            track: 'zz-fixture-unreachable',
            prerequisites: ['rm-kindle-devotion'],
          });
          cellNodes.push(id);
        }
      }),
    );
    const bad = only(diagnostics, 'track-unreachable-from-trunk');
    expect(bad[0]?.message).toContain('zz-fixture-unreachable');
  });

  it('rejects research-cost-is-tier-alone, for a v1 tier collapsed to one cost', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const cellById = new Map(
          recordsOf(documents, 'cell.json').map((cell) => [cell['id'] as string, cell]),
        );
        let touched = 0;
        for (const node of recordsOf(documents, 'node.json')) {
          const cell = cellById.get(node['cell'] as string);
          if (cell?.['v1'] !== true || node['tier'] !== 1) continue;
          node['researchCost'] = 2048;
          touched += 1;
        }
        // The real v1 tier-1 set has several nodes; this fails vacuously —
        // proving nothing — if content ever shrinks tier 1 to fewer than two.
        expect(touched).toBeGreaterThanOrEqual(2);
      }),
    );
    const bad = only(diagnostics, 'research-cost-is-tier-alone');
    expect(bad[0]?.message).toContain('tier 1');
    expect(bad[0]?.message).toContain('2048');
  });

  it('rejects effect-gloss-missing, for an ungloosed effect in a v1 cell', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'rl-hold-the-door');
        delete (node['effects'] as Record<string, unknown>[])[0]!['gloss'];
      }),
    );
    const bad = only(diagnostics, 'effect-gloss-missing');
    expect(bad[0]?.message).toContain('rl-hold-the-door');
    expect(bad[0]?.message).toContain('rego-limen');
  });

  it('accepts an effect with no gloss outside a v1 cell', () => {
    // The passing control: can-mend-the-beast (creo-animal, not v1) really
    // does carry no effect gloss in shipped content, and that is fine.
    const source = brokenSource(() => {
      /* no mutation */
    });
    expect(validateContent(source).diagnostics).toEqual([]);
  });
});
