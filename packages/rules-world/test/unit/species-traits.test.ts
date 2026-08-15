/*
 * Multiverse Mages — the six species load, and their traits point one way.
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
 * Covers the `species-traits` capability's first four requirements: the six
 * species exist as validated content, the schema carries the three fields
 * `mages-and-species` adds, every `fp` trait is higher-is-better, and the
 * effective rediscovery multiplier has a floor under it.
 *
 * **The direction check is mechanical, not a table of expectations.** The spec
 * asks that direction be "asserted, not assumed", and a test listing which
 * traits multiply and which divide would be a second copy of the registry —
 * green whenever the two copies agree, including when both are wrong. Instead
 * the property below sweeps trait values through one shared application site
 * and asserts that *advantage* never decreases, which is the sentence the spec
 * actually writes. It covers the divisor trait without knowing that it is one.
 *
 * **Nothing here asserts a magnitude is well chosen.** Every species number is
 * an untuned placeholder (`release-plan.md`: no balance claim before 0.5.0), so
 * the assertions are about ordering, direction, and arithmetic — never about a
 * value being right.
 */

import { describe, expect, it } from 'vitest';

import { loadContent, shippedContentSource } from '@mm/content';
import type { ContentRegistry } from '@mm/content';
import {
  REDISCOVERY_FLOOR,
  createRediscoveryClampCounter,
  effectiveRediscoveryMultiplier,
  speciesRediscoveryMultiplier,
} from '@mm/primitives';
import { FP_ONE } from '@mm/sim-core';

import {
  SPECIES_FP_TRAITS,
  SPECIES_TRAIT_REGISTRY,
  advantageOf,
  applySpeciesTrait,
  traitValueOf,
} from '@mm/rules-world';
import type { SpeciesFpTrait } from '@mm/rules-world';

import {
  brokenSource,
  expectHardFail,
  speciesById,
  speciesSchemaProperties,
} from './species-fixtures.js';

const registry: ContentRegistry = loadContent(shippedContentSource());

/** Vision §6's six, sorted, so a silent addition or removal fails here. */
const SPECIES_IDS = ['draconic', 'dwarf', 'elf', 'gnome', 'human', 'orc'];

describe('the six species are validated content', () => {
  it('interns exactly the six species vision §6 names', () => {
    expect(registry.counts.species).toBe(SPECIES_IDS.length);
    expect(registry.species.map((entry) => entry.record.id).sort()).toEqual(SPECIES_IDS);
  });

  it('gives every species the three fields mages-and-species adds', () => {
    for (const entry of registry.species) {
      const species = entry.record;
      expect(Number.isInteger(species.maturityMonths)).toBe(true);
      expect(species.maturityMonths).toBeGreaterThan(0);
      expect(species.maturityMonths).toBeLessThan(species.lifespanMonths);
      expect(species.mageAptitude).toBeGreaterThan(0);
      expect(species.laborAffinity).toBeGreaterThan(0);
    }
  });

  it('carries no martial or soldier-effectiveness trait', () => {
    // `mages-and-species` declined a fourth field on purpose: soldier
    // effectiveness is only observable inside a raid, and raids belong to
    // `raid-engagement`. A trait shipped now would be tuned against no
    // measurement at all, and would pre-empt a capability with more information
    // than this one has. Asserted rather than trusted, because "we decided not
    // to add it" is not a thing a schema remembers.
    for (const entry of registry.species) {
      for (const field of Object.keys(entry.record)) {
        expect(field).not.toMatch(/martial|soldier|combat|prowess/iu);
      }
    }
  });

  it('marks every species as untuned', () => {
    for (const entry of registry.species) expect(entry.record.tuningStatus).toBe('untuned');
  });

  it('reproduces the contracts.md §2.4 dwarf example verbatim', () => {
    // The contract's worked example is normative: "where this table and that
    // example could differ, the contract wins" (design.md). Pinning it here
    // means a data edit that drifts from the document fails in this package
    // rather than in a reader's memory.
    const dwarf = speciesById(registry, 'dwarf');
    expect({
      lifespanMonths: dwarf.lifespanMonths,
      lifespanVarianceMonths: dwarf.lifespanVarianceMonths,
      curiosity: dwarf.curiosity,
      depthCeiling: dwarf.depthCeiling,
      learnRate: dwarf.learnRate,
      retention: dwarf.retention,
      fertility: dwarf.fertility,
      scribeAffinity: dwarf.scribeAffinity,
      rediscoveryAffinity: dwarf.rediscoveryAffinity,
      maturityMonths: dwarf.maturityMonths,
      mageAptitude: dwarf.mageAptitude,
      laborAffinity: dwarf.laborAffinity,
      affinities: dwarf.affinities,
    }).toEqual({
      lifespanMonths: 3000,
      lifespanVarianceMonths: 360,
      curiosity: 512,
      depthCeiling: 5,
      learnRate: 1024,
      retention: 1536,
      fertility: 768,
      scribeAffinity: 1792,
      rediscoveryAffinity: 768,
      maturityMonths: 600,
      mageAptitude: 448,
      laborAffinity: 1280,
      // W20 added `nomen` and `limen`, the two v1-rectangle forms a dwarf has any
      // business with: §2.4's example moved with the data, and this pin moved with
      // both. Before that change the dwarf declared only `terram` and `ignem`, and
      // `ignem` is outside the v1 rectangle — so a dwarf brought exactly one
      // readable affinity to a v1 run, and human and gnome brought none at all.
      affinities: { terram: 1536, ignem: 1152, nomen: 1280, limen: 960 },
    });
  });

  it('differentiates the species on every fp trait it declares', () => {
    // The 0.4.0 claim is *differentiation*, and trait data is what makes it
    // true or false. A trait every species shares is a column the balance
    // harness will sweep for nothing, and — more to the point — a species pair
    // identical on every axis cannot differ in time-to-tier by more than noise.
    // This asserts the data has distinct values, not that the values are good.
    for (const trait of SPECIES_FP_TRAITS) {
      const values = new Set(registry.species.map((entry) => traitValueOf(entry.record, trait)));
      expect(values.size, `every species shares one value for ${trait}`).toBeGreaterThan(1);
    }
    const ceilings = new Set(registry.species.map((entry) => entry.record.depthCeiling));
    expect(ceilings.size).toBeGreaterThan(1);
    expect(Math.min(...ceilings)).toBe(3); // the orc floor the tier-3 claim relies on
  });
});

describe('a species record that breaks its invariants fails the load', () => {
  // Every rejection below has a passing control: the same fixture pipeline
  // without the mutation must load, or the test proves only that the pipeline
  // is broken.

  it('loads the unmutated fixture — the control for everything below', () => {
    expect(loadContent(brokenSource(() => undefined)).counts.species).toBe(SPECIES_IDS.length);
  });

  it('rejects a species missing a required field', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        delete speciesRecordOf(documents, 'gnome')['mageAptitude'];
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.file).toBe('species.json');
    expect(diagnostics[0]?.message).toContain('gnome');
    expect(diagnostics[0]?.message).toContain('mageAptitude');
  });

  it('rejects maturity at or beyond lifespan, naming the species', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        const orc = speciesRecordOf(documents, 'orc');
        orc['maturityMonths'] = orc['lifespanMonths'];
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('species-invariant');
    expect(diagnostics[0]?.file).toBe('species.json');
    expect(diagnostics[0]?.pointer).toMatch(/^\/\d+\/maturityMonths$/u);
    expect(diagnostics[0]?.message).toContain('orc');
  });

  it('rejects an affinity naming neither a form nor a cell, with file, pointer, and id', () => {
    const diagnostics = expectHardFail(
      brokenSource((documents) => {
        speciesRecordOf(documents, 'elf')['affinities'] = { basalt: 1536 };
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('unknown-reference');
    expect(diagnostics[0]?.file).toBe('species.json');
    expect(diagnostics[0]?.pointer).toMatch(/^\/\d+\/affinities\/basalt$/u);
    expect(diagnostics[0]?.message).toContain('elf');
    expect(diagnostics[0]?.message).toContain('basalt');
  });
});

describe('every fp trait is higher-is-better', () => {
  it('registers exactly the fp traits the species schema declares', () => {
    // Completeness matters more than it looks: a trait with no descriptor has
    // no declared direction, and the property below would never sweep it. The
    // registry is compared against the *schema*, not against a list here, so
    // adding a trait to the contract without registering it fails.
    const declared = fpTraitsInSchema();
    expect([...SPECIES_FP_TRAITS].sort()).toEqual([...declared].sort());
  });

  it('declares the direction on every descriptor', () => {
    for (const trait of SPECIES_FP_TRAITS) {
      expect(SPECIES_TRAIT_REGISTRY[trait].direction).toBe('higher-is-better');
      expect(SPECIES_TRAIT_REGISTRY[trait].trait).toBe(trait);
    }
  });

  it('never lowers a species advantage when a trait value rises', () => {
    // The mechanical form of "higher is better", swept through the one
    // application site. `rediscoveryAffinity` divides and the other seven
    // multiply, and this passes for all eight without being told which is
    // which — so an application site that inverted the sense would fail here
    // even though its own arithmetic looked self-consistent.
    const base = FP_ONE * 8;
    for (const trait of SPECIES_FP_TRAITS) {
      const descriptor = SPECIES_TRAIT_REGISTRY[trait];
      let previous = Number.NEGATIVE_INFINITY;
      for (let value = 64; value <= FP_ONE * 2; value += 64) {
        const advantage = advantageOf(descriptor, applySpeciesTrait(descriptor, base, value));
        expect(advantage, `${trait} lost advantage as its value rose to ${String(value)}`)
          .toBeGreaterThanOrEqual(previous);
        previous = advantage;
      }
    }
  });

  it('leaves a quantity untouched at the neutral value, multiplier or divisor', () => {
    const base = FP_ONE * 3;
    for (const trait of SPECIES_FP_TRAITS) {
      expect(applySpeciesTrait(SPECIES_TRAIT_REGISTRY[trait], base, FP_ONE)).toBe(base);
    }
  });

  it('refuses a non-positive trait value with a species-shaped message', () => {
    // Unreachable from valid content — the schema floors fp traits at 1 — but a
    // divisor of zero is the one input that would surface as "div by zero" from
    // three frames away.
    expect(() => applySpeciesTrait(SPECIES_TRAIT_REGISTRY.rediscoveryAffinity, FP_ONE, 0)).toThrow(
      /species trait rediscoveryAffinity/u,
    );
  });
});

describe('the effective rediscovery multiplier', () => {
  it('makes the better rediscoverer pay strictly less', () => {
    const counter = createRediscoveryClampCounter();
    const gnome = speciesById(registry, 'gnome');
    const orc = speciesById(registry, 'orc');
    expect(gnome.rediscoveryAffinity).toBeGreaterThan(orc.rediscoveryAffinity);

    // Above the floor for both, so the trait — not the clamp — decides.
    const base = FP_ONE * 8;
    expect(speciesRediscoveryMultiplier(base, gnome, counter)).toBeLessThan(
      speciesRediscoveryMultiplier(base, orc, counter),
    );
    expect(counter.floored).toBe(0);
    expect(counter.evaluated).toBe(2);
  });

  it('holds the fp(3072) floor against the best affinity in the game', () => {
    // The spec's worked case: a node authored at exactly the floor, rediscovered
    // by the strongest rediscoverer. Without the clamp this is fp(1755) — 1.71×
    // — and `release-plan.md`'s shipped 0.3.0 claim of "at least 3×" is false.
    const counter = createRediscoveryClampCounter();
    const gnome = speciesById(registry, 'gnome');
    expect(gnome.rediscoveryAffinity).toBe(1792);
    expect(effectiveRediscoveryMultiplier(3072, gnome.rediscoveryAffinity, counter)).toBe(
      REDISCOVERY_FLOOR,
    );
    expect(counter.floored).toBe(1);
  });

  it('lets affinity operate above the floor', () => {
    const counter = createRediscoveryClampCounter();
    expect(effectiveRediscoveryMultiplier(6144, 1792, counter)).toBe(3510);
    expect(counter.floored).toBe(0);
  });

  it('never returns less than the floor, for any shipped species or node', () => {
    const counter = createRediscoveryClampCounter();
    for (const speciesEntry of registry.species) {
      for (const nodeEntry of registry.nodes) {
        expect(
          speciesRediscoveryMultiplier(
            nodeEntry.record.rediscoveryMultiplier,
            speciesEntry.record,
            counter,
          ),
        ).toBeGreaterThanOrEqual(REDISCOVERY_FLOOR);
      }
    }
    expect(counter.evaluated).toBe(registry.species.length * registry.nodes.length);
  });

  it('never clamps on shipped content, so the trait is doing something', () => {
    // A clamp that fires everywhere is a trait that does not exist: every
    // species would pay exactly the floor. `contracts.md` §2.3 authors v1 nodes
    // above the 5376 break-even precisely so this count stays zero, and the
    // count is the evidence rather than the intention.
    const counter = createRediscoveryClampCounter();
    for (const speciesEntry of registry.species) {
      for (const nodeEntry of registry.nodes) {
        speciesRediscoveryMultiplier(
          nodeEntry.record.rediscoveryMultiplier,
          speciesEntry.record,
          counter,
        );
      }
    }
    expect(counter.floored).toBe(0);
  });

  /**
   * **This is the check that stops the two-implementations bug recurring.**
   *
   * `rediscoveryAffinity` was once computed in two packages at once — as a
   * divisor in `rules-world` and as a multiplier in `rules-magic` — and both
   * suites were green because `contracts.md` §5 rule 3 forbids those two
   * packages importing each other, so nothing ever compared them. The
   * arithmetic now lives once, in `@mm/primitives`, which both may reach.
   *
   * What survives *here* is the **declaration**: `SPECIES_TRAIT_REGISTRY` is
   * the eight-row table whose whole purpose is that a trait's direction is data
   * rather than convention, and it still says `rediscoveryAffinity` divides.
   * `@mm/primitives` sits below this package and cannot import that table, so
   * the declaration and the arithmetic are two artefacts that could drift.
   * This test is the tie: wherever the floor is not binding, the shared helper
   * must return exactly what applying the registry descriptor returns. Flip
   * either one and this fails.
   */
  it('computes what the trait registry declares, above the floor', () => {
    const descriptor = SPECIES_TRAIT_REGISTRY.rediscoveryAffinity;
    expect(descriptor.application).toBe('divisor');

    const counter = createRediscoveryClampCounter();
    let comparisons = 0;
    for (const base of [5376, 6144, 8192, 16384]) {
      for (const affinity of [512, 768, 896, 1024, 1536, 1792]) {
        const declared = applySpeciesTrait(descriptor, base, affinity);
        // Only where the clamp is idle; where it bites, the floor is the
        // answer and the registry has nothing to say about it.
        if (declared < REDISCOVERY_FLOOR) continue;
        expect(
          effectiveRediscoveryMultiplier(base, affinity, counter),
          `registry and @mm/primitives disagree at base ${String(base)}, affinity ${String(affinity)}`,
        ).toBe(declared);
        comparisons += 1;
      }
    }
    expect(comparisons).toBeGreaterThan(0);
    expect(counter.floored).toBe(0);
  });
});

/** The species record inside a mutable parsed content set, by id. */
function speciesRecordOf(
  documents: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const records = documents['species.json'];
  if (!Array.isArray(records)) throw new Error('species.json fixture is not an array');
  const found = records.find(
    (record: unknown) => (record as Record<string, unknown>)['id'] === id,
  ) as Record<string, unknown> | undefined;
  if (found === undefined) throw new Error(`no species "${id}" in the fixture`);
  return found;
}

/**
 * The `fp`-typed properties of the shipped species schema.
 *
 * Read from the schema rather than listed, so the registry-completeness check
 * above compares two artefacts that are maintained separately. A trait added to
 * the schema and not to the registry has no declared direction, and the
 * monotonicity property would silently never sweep it.
 */
function fpTraitsInSchema(): SpeciesFpTrait[] {
  return Object.entries(speciesSchemaProperties())
    .filter(([, value]) => (value as { readonly $ref?: string }).$ref === '#/$defs/fp')
    .map(([key]) => key as SpeciesFpTrait);
}
