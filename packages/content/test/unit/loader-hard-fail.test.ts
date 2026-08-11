/*
 * Multiverse Mages — malformed content fails the load rather than being skipped.
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
 * Every case here takes the real shipped content and breaks exactly one thing.
 *
 * Each asserts three properties, not one: the load **throws**, the registry is
 * **not** returned in any partial form, and the message **names the ids
 * involved**. A loader that skipped the record would satisfy none of them, and
 * the reason that matters is in `contracts.md` §2 — a silently-dropped node is a
 * balance defect discovered weeks later in a Monte Carlo baseline, with nothing
 * pointing at the content.
 */

import { describe, expect, it } from 'vitest';

import {
  ContentValidationError,
  V1_REDISCOVERY_AUTHORING_FLOOR,
  WORST_REDISCOVERY_AFFINITY,
  loadContent,
  validateContent,
} from '@mm/content';
import type { ContentDiagnostic } from '@mm/content';

import { brokenSource, recordById, recordsOf } from './fixtures.js';

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

function messages(diagnostics: readonly ContentDiagnostic[]): string {
  return diagnostics.map((d) => d.message).join('\n');
}

describe('invalid content is a hard load failure', () => {
  it('rejects a node missing a required field, naming the field', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'rl-open-the-portal');
        delete node['researchCost'];
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('schema');
    expect(diagnostics[0]?.file).toBe('node.json');
    // The spec asks for the node id and the field, not just a pointer: content
    // is edited and discussed by id, and "index 38" makes the author count.
    expect(diagnostics[0]?.message).toContain('rl-open-the-portal');
    expect(diagnostics[0]?.message).toContain('researchCost');
    // The pointer locates the record, so an author can find it without counting.
    expect(diagnostics[0]?.pointer).toMatch(/^\/\d+$/u);
  });

  it('rejects a node with a float magnitude', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'rt-set-the-stone');
        (node['effects'] as Record<string, unknown>[])[0]!['magnitude'] = 192.5;
      }),
    );
    expect(messages(diagnostics)).toContain('expected integer, got a non-integer number');
  });

  it('rejects an unknown prerequisite, naming node and prerequisite', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'rl-step-across');
        node['prerequisites'] = ['rl-hold-the-door', 'rl-unhinge-the-sky'];
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('unknown-reference');
    expect(diagnostics[0]?.message).toContain('rl-step-across');
    expect(diagnostics[0]?.message).toContain('rl-unhinge-the-sky');
    expect(diagnostics[0]?.pointer).toContain('/prerequisites/1');
  });

  it('rejects a prerequisite cycle, naming the ring', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // A -> B -> A, at equal tiers so that the tier check does not fire too.
        recordById(documents, 'node.json', 'rm-hold-the-attention')['prerequisites'] = [
          'rm-the-patient-lesson',
        ];
        recordById(documents, 'node.json', 'rm-the-patient-lesson')['tier'] = 1;
      }),
    );
    const cycle = diagnostics.filter((d) => d.code === 'prerequisite-cycle');
    expect(cycle).toHaveLength(1);
    expect(cycle[0]?.message).toContain('rm-hold-the-attention');
    expect(cycle[0]?.message).toContain('rm-the-patient-lesson');
    expect(cycle[0]?.message).toContain('->');
  });

  it('rejects an inverted tier, naming both nodes with their tiers', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // A tier-3 node now lists a tier-4 node as a prerequisite.
        recordById(documents, 'node.json', 'im-follow-the-thought')['tier'] = 4;
      }),
    );
    // Scoped to the pair under test rather than the whole run. Deepening one node
    // inverts it against every node that gates on it, and the grid is pre-authored,
    // so that count grows with content. Asserting a global count here would make
    // this test fail whenever someone writes an unrelated spell.
    const inverted = diagnostics.filter(
      (d) => d.code === 'inverted-tier' && d.message.includes('im-read-the-surface'),
    );
    expect(inverted).toHaveLength(1);
    expect(inverted[0]?.message).toContain('im-follow-the-thought');
    expect(inverted[0]?.message).toContain('is tier 3');
    expect(inverted[0]?.message).toContain('tier 4');
  });

  it('rejects a cell carrying both an interdiction and a dispensation', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'perdo-mentem')['edicts'] = [
          'dispensation',
          'interdiction',
        ];
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('edict-conflict');
    expect(diagnostics[0]?.message).toContain('perdo-mentem');
    expect(diagnostics[0]?.pointer).toContain('/edicts');
  });

  it('accepts a cell carrying one edict', () => {
    const source = brokenSource((documents) => {
      recordById(documents, 'cell.json', 'perdo-mentem')['edicts'] = ['interdiction'];
    });
    expect(validateContent(source).diagnostics).toEqual([]);
  });

  it('rejects a thirteenth v1 cell, naming it and the expected count', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'creo-ignem')['v1'] = true;
      }),
    );
    const subset = diagnostics.filter((d) => d.code === 'v1-subset');
    expect(subset.length).toBeGreaterThanOrEqual(1);
    expect(messages(subset)).toContain('creo-ignem');
    expect(messages(subset)).toContain('exactly 12');
  });

  it('rejects a v1 set that is not a rectangle, naming the uneven axes and the cells on them', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // Swap one cell out of the rectangle for one outside it: still twelve.
        recordById(documents, 'cell.json', 'perdo-terram')['v1'] = false;
        recordById(documents, 'cell.json', 'creo-ignem')['v1'] = true;
      }),
    );
    const subset = diagnostics.filter((d) => d.code === 'v1-subset');
    expect(messages(subset)).toContain('rectangle');
    expect(messages(subset)).toContain('technique "creo" covers 1 forms');
    expect(messages(subset)).toContain('form "ignem" covers 1 techniques');
    // tasks.md 2.2 asks the error to name the offending *cells*, not only the
    // axes. An author reading "technique creo covers 1 forms" still has to grep
    // cell.json to find which one; naming it closes that gap. The intact axes
    // stay unnamed, so the message points at the defect rather than listing the
    // whole subset back.
    expect(messages(subset)).toContain('creo-ignem');
    expect(messages(subset)).not.toContain('rego-limen');
  });

  it('rejects a v1 node below the rediscovery authoring floor, naming node and floor', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // fp(4096) clears the schema's hard fp(3072) invariant, so this reaches
        // phase 3 rather than dying at schema — which is exactly the case that
        // matters. contracts.md §2.3 rejects fp(4096) *by name*: the best
        // rediscoverer (gnome, affinity fp(1792)) turns it into 2340, below the
        // hard floor, so the trait clamps flat and stops existing.
        recordById(documents, 'node.json', 'rl-open-the-portal')['rediscoveryMultiplier'] = 4096;
      }),
    );
    const invariant = diagnostics.filter((d) => d.code === 'content-invariant');
    expect(invariant).toHaveLength(1);
    expect(invariant[0]?.file).toBe('node.json');
    expect(invariant[0]?.message).toContain('rl-open-the-portal');
    expect(invariant[0]?.message).toContain('4096');
    expect(invariant[0]?.message).toContain('5376');
    expect(invariant[0]?.pointer).toContain('/rediscoveryMultiplier');
  });

  it('accepts a node authored exactly at the rediscovery authoring floor', () => {
    // The passing control: the floor is inclusive, so the rejection above is
    // about being below it rather than about the field having been touched.
    const source = brokenSource((documents) => {
      recordById(documents, 'node.json', 'rl-open-the-portal')['rediscoveryMultiplier'] =
        V1_REDISCOVERY_AUTHORING_FLOOR;
    });
    expect(validateContent(source).diagnostics).toEqual([]);
  });

  it('rejects a node whose rediscovery cost overflows fixed point', () => {
    // `researchRequirement` computes mul(researchCost, effectiveMultiplier), and
    // mul throws rather than saturating -- deliberately, since a silently
    // saturated cost is a balance change nobody authored. The schema admits
    // researchCost up to fp(1073741823), so without this check the loader
    // accepts a node that makes the simulation throw the first time anyone
    // rediscovers it. Checked at the worst species affinity, not fp(1024): the
    // requirement is per-species, so a node that only overflows for orcs still
    // overflows.
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'node.json', 'rl-open-the-portal')['researchCost'] = 400_000_000;
      }),
    );
    const invariant = diagnostics.filter((d) => d.code === 'content-invariant');
    expect(invariant).toHaveLength(1);
    expect(invariant[0]?.message).toContain('rl-open-the-portal');
    expect(invariant[0]?.message).toContain(String(WORST_REDISCOVERY_AFFINITY));
    expect(invariant[0]?.pointer).toContain('/researchCost');
  });

  it('accepts the largest researchCost that still computes', () => {
    // The passing control, so the rejection above is about the arithmetic rather
    // than about the field having been touched at all. Derived from the shipped
    // multiplier rather than hardcoded, so it stays the boundary if content moves.
    let largest = 0;
    const atBoundary = brokenSource((documents) => {
      const node = recordById(documents, 'node.json', 'rl-open-the-portal');
      const effective = Math.max(
        Math.floor(((node['rediscoveryMultiplier'] as number) * 1024) / WORST_REDISCOVERY_AFFINITY),
        3072,
      );
      largest = Math.floor((2147483647 * 1024) / effective);
      node['researchCost'] = largest;
    });
    expect(validateContent(atBoundary).diagnostics).toEqual([]);
    expect(largest).toBeGreaterThan(0);

    // And one unit past it is rejected, so the control is pinned to the boundary
    // rather than merely being some value that happens to pass.
    const pastBoundary = brokenSource((documents) => {
      recordById(documents, 'node.json', 'rl-open-the-portal')['researchCost'] = largest + 1;
    });
    expect(
      validateContent(pastBoundary).diagnostics.filter((d) => d.code === 'content-invariant'),
    ).toHaveLength(1);
  });

  it('rejects removing rego-limen from the v1 subset', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'cell.json', 'rego-limen')['v1'] = false;
      }),
    );
    expect(messages(diagnostics)).toContain('rego-limen');
    expect(messages(diagnostics)).toContain('portal');
  });

  // Authoring outside the v1 subset is permitted -- the grid holds seventy cells and
  // only twelve are enabled, so the rest are written but inert. What is NOT permitted
  // is a playable node sitting behind content the release does not enable: it would be
  // permanently unreachable, and nothing else in the pipeline would notice.
  it('rejects a v1 node whose prerequisite lies outside the v1 subset', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        // Park a fresh node in a non-v1 cell, then make a playable node depend on it.
        const donor = recordById(documents, 'node.json', 'rt-set-the-stone');
        const stranded = { ...donor, id: 'ct-stranded-course', cell: 'creo-terram' };
        (documents['node.json'] as unknown[]).push(stranded);
        recordById(documents, 'cell.json', 'creo-terram')['nodes'] = ['ct-stranded-course'];
        const playable = recordById(documents, 'node.json', 'rt-raise-the-course');
        playable['prerequisites'] = ['ct-stranded-course'];
      }),
    );
    const unreachable = diagnostics.filter((d) => d.code === 'v1-unreachable-prerequisite');
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]?.message).toContain('rt-raise-the-course');
    expect(unreachable[0]?.message).toContain('creo-terram');
  });

  it('rejects an effect naming a primitive the registry does not define', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const node = recordById(documents, 'node.json', 'rl-open-the-portal');
        node['effects'] = [
          { primitive: 'portal-stability', magnitude: 1024, target: 'universe', durationTicks: 0 },
        ];
      }),
    );
    // contracts.md §1.6: no effect primitive may modify portalStability, and the
    // closed registry is the mechanism that makes that unauthorable.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('unknown-reference');
    expect(diagnostics[0]?.message).toContain('portal-stability');
    expect(diagnostics[0]?.message).toContain('portalStability');
  });

  it('rejects a duplicate node id rather than letting the last one win', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const nodes = recordsOf(documents, 'node.json');
        const clone = { ...recordById(documents, 'node.json', 'rt-set-the-stone') };
        clone['researchCost'] = 1;
        nodes.push(clone);
        const cell = recordById(documents, 'cell.json', 'rego-terram');
        cell['nodes'] = [...(cell['nodes'] as string[])];
      }),
    );
    const duplicates = diagnostics.filter((d) => d.code === 'duplicate-id');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.message).toContain('rt-set-the-stone');
  });

  it('rejects a non-dense technique bit assignment', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'technique.json', 'muto')['bit'] = 4;
      }),
    );
    const bits = diagnostics.filter((d) => d.code === 'bit-assignment');
    expect(messages(bits)).toContain('claimed by both');
    expect(messages(bits)).toContain('bit 2 is unassigned');
  });

  it('rejects a species maturing after it dies', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'species.json', 'orc')['maturityMonths'] = 720;
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('species-invariant');
    expect(diagnostics[0]?.message).toContain('orc');
  });

  it('rejects a species affinity naming something that is not a form or cell', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        recordById(documents, 'species.json', 'dwarf')['affinities'] = { granite: 1536 };
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('unknown-reference');
    expect(diagnostics[0]?.pointer).toBe('/2/affinities/granite');
  });

  it('rejects a missing content file rather than loading a partial set', () => {
    const source = brokenSource((documents) => {
      documents['node.json'] = undefined;
    });
    const diagnostics = expectHardFail({
      origin: source.origin,
      read: (name) => (name === 'node.json' ? undefined : source.read(name)),
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('file-missing');
  });

  it('rejects unparsable JSON, naming the file', () => {
    const source = brokenSource(() => undefined);
    const diagnostics = expectHardFail({
      origin: source.origin,
      read: (name) => (name === 'species.json' ? '[{,]' : source.read(name)),
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('file-unparsable');
    expect(diagnostics[0]?.file).toBe('species.json');
  });
});

describe('tradition hooks are a closed enumeration', () => {
  it('rejects a fifth hook, naming the disallowed key', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const tradition = recordById(documents, 'tradition.json', 'true-naming');
        (tradition['hooks'] as Record<string, unknown>)['mortality'] = { kind: 'standard' };
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('schema');
    expect(diagnostics[0]?.message).toContain('mortality');
  });

  it('rejects a missing hook, naming it', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const tradition = recordById(documents, 'tradition.json', 'vancian-memorization');
        delete (tradition['hooks'] as Record<string, unknown>)['cost'];
      }),
    );
    expect(messages(diagnostics)).toContain('cost');
  });

  it('rejects an unimplemented kind and lists the permitted kinds', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const tradition = recordById(documents, 'tradition.json', 'true-naming');
        (tradition['hooks'] as Record<string, Record<string, unknown>>)['acquire'] = {
          kind: 'pact',
        };
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('hook-kind');
    expect(diagnostics[0]?.message).toContain('pact');
    expect(diagnostics[0]?.message).toContain('standard, true-name');
  });

  it('rejects a kind that belongs to a different hook, and says which', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const tradition = recordById(documents, 'tradition.json', 'art-of-memory');
        (tradition['hooks'] as Record<string, Record<string, unknown>>)['store'] = {
          kind: 'prepared',
          params: { slotsPerMage: 4 },
        };
      }),
    );
    expect(diagnostics[0]?.code).toBe('hook-kind');
    expect(diagnostics[0]?.message).toContain('"prepared" is a "cast" kind');
  });

  it('rejects an unknown or mistyped hook param', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const tradition = recordById(documents, 'tradition.json', 'art-of-memory');
        (tradition['hooks'] as Record<string, Record<string, unknown>>)['store'] = {
          kind: 'palace',
          params: { slotsPerMage: 12, lootable: false, burnable: 'no', shelves: 3 },
        };
      }),
    );
    const params = diagnostics.filter((d) => d.code === 'hook-params');
    // Three problems at once: a missing param, a mistyped one, an unknown one.
    expect(params).toHaveLength(3);
    expect(messages(params)).toContain('libraryDepthCoefficient');
    expect(messages(params)).toContain('"burnable" must be a boolean');
    expect(messages(params)).toContain('declares no param "shelves"');
  });
});
