/*
 * Multiverse Mages — the shipped v1 content set loads and says what it is.
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
 * This file is the content package's CI gate. `.github/workflows/ci.yml` runs
 * `npm test` rather than `npm run verify`, so a validation command wired only
 * into `verify` would not run in CI at all — validating the shipped set from a
 * test is what actually puts it in front of every push.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_CONTENT_NODES,
  REQUIRED_V1_CELL,
  V1_CELL_COUNT,
  V1_REDISCOVERY_AUTHORING_FLOOR,
  WORST_REDISCOVERY_AFFINITY,
  loadContent,
  shippedContentSource,
} from '@mm/content';
import type { ContentRegistry } from '@mm/content';

const registry: ContentRegistry = loadContent(shippedContentSource());

/**
 * The enabled subset, spelled out so a silent swap fails.
 *
 * It was the twelve `knowledge-model` chose — `{intellego, perdo, rego} ×
 * {limen, mentem, nomen, terram}` — and is now all seventy. Still spelled out
 * rather than derived from `registry.cells`: a list read back out of the object
 * under test cannot fail, and the thing worth catching here is a cell quietly
 * losing its flag, which a derived list would agree with.
 */
const V1_CELLS = [
  'creo-animal',
  'creo-aquam',
  'creo-auram',
  'creo-corpus',
  'creo-fatum',
  'creo-herbam',
  'creo-ignem',
  'creo-imaginem',
  'creo-limen',
  'creo-mentem',
  'creo-nomen',
  'creo-terram',
  'creo-umbra',
  'creo-vim',
  'intellego-animal',
  'intellego-aquam',
  'intellego-auram',
  'intellego-corpus',
  'intellego-fatum',
  'intellego-herbam',
  'intellego-ignem',
  'intellego-imaginem',
  'intellego-limen',
  'intellego-mentem',
  'intellego-nomen',
  'intellego-terram',
  'intellego-umbra',
  'intellego-vim',
  'muto-animal',
  'muto-aquam',
  'muto-auram',
  'muto-corpus',
  'muto-fatum',
  'muto-herbam',
  'muto-ignem',
  'muto-imaginem',
  'muto-limen',
  'muto-mentem',
  'muto-nomen',
  'muto-terram',
  'muto-umbra',
  'muto-vim',
  'perdo-animal',
  'perdo-aquam',
  'perdo-auram',
  'perdo-corpus',
  'perdo-fatum',
  'perdo-herbam',
  'perdo-ignem',
  'perdo-imaginem',
  'perdo-limen',
  'perdo-mentem',
  'perdo-nomen',
  'perdo-terram',
  'perdo-umbra',
  'perdo-vim',
  'rego-animal',
  'rego-aquam',
  'rego-auram',
  'rego-corpus',
  'rego-fatum',
  'rego-herbam',
  'rego-ignem',
  'rego-imaginem',
  'rego-limen',
  'rego-mentem',
  'rego-nomen',
  'rego-terram',
  'rego-umbra',
  'rego-vim',
];

describe('shipped content', () => {
  it('loads and reports its counts', () => {
    expect(registry.counts).toEqual({
      techniques: 5,
      forms: 14,
      cells: 70,
      // Was 12. Every cell now carries "v1": true; see the comment on V1_CELLS.
      v1Cells: 70,
      nodes: 300,
      species: 6,
      traditions: 3,
      territories: 5,
      primitives: 17,
      // One per action id in contracts.md §4.2, and one per magnitude the
      // god-agency rules read by name. Both coverings are checked by the
      // loader; these are the counts they come out at.
      godCosts: 16,
      godConstants: 73,
      // One per magnitude the raid rules read by name, checked in both
      // directions by the loader for the reason the god constants are. Five of
      // them are the composition root's rather than the engine's — how many
      // rivals hang in the sky, how they are armed, how often one arrives, and
      // how long after a raid the next may not — because §1.1 keeps the
      // multiverse out of state and something has to say who is on the other
      // end of the portal.
      raidConstants: 46,
      // **Forty on this integration branch, and neither side of the merge said
      // so.** Both #134 and the `apply-magic` work on `main` raised this from
      // thirty-six to thirty-eight, for two different pairs of weights, and the
      // literal `38` auto-merged as common text while only the comment above it
      // conflicted. Taking either side would have pinned a count four short of
      // the set the loader actually validates.
      //
      // The four: `apply-output-per-month` and `apply-ration-per-month` price
      // what applied work makes and eats;
      // `goal-affiliate-first-opportunity` and
      // `goal-affiliate-transfer-opportunity` price whether to join an
      // institution at all. All four are scalars rather than role-appeal rows,
      // and all four are in `REQUIRED_AUTONOMY_WEIGHTS`, so the loader checks
      // the set in both directions exactly as it does for the target weights.
      autonomyWeights: 40,
    });
  });

  it('pins technique and form bit assignments', () => {
    // These are serialized into snapshots (contracts.md §2.1). Changing one is
    // a breaking content change, so it is asserted rather than derived.
    expect(registry.techniques.map((entry) => [entry.record.id, entry.record.bit])).toEqual([
      ['creo', 0],
      ['intellego', 1],
      ['muto', 2],
      ['perdo', 3],
      ['rego', 4],
    ]);
    expect(registry.forms.map((entry) => [entry.record.id, entry.record.bit])).toEqual([
      ['animal', 0],
      ['aquam', 1],
      ['auram', 2],
      ['corpus', 3],
      ['herbam', 4],
      ['ignem', 5],
      ['imaginem', 6],
      ['mentem', 7],
      ['terram', 8],
      ['vim', 9],
      ['umbra', 10],
      ['fatum', 11],
      ['limen', 12],
      ['nomen', 13],
    ]);
  });

  it('addresses all seventy cells, and every technique/form pair resolves', () => {
    const seen = new Set<number>();
    for (let technique = 1; technique <= 5; technique += 1) {
      for (let form = 1; form <= 14; form += 1) {
        const cellId = registry.cellAt(technique, form);
        expect(cellId).toBeGreaterThan(0);
        expect(registry.cell(cellId)).toBeDefined();
        seen.add(cellId);
      }
    }
    expect(seen.size).toBe(70);
  });

  // This test used to read the other way round: `creo-ignem` was addressable and
  // populated but *unflagged*, and the separation was called the whole point of
  // pre-authoring — the world is deeper than the playable slice, and enabling a
  // cell later is a flag change rather than a content project. That claim has now
  // been cashed: the flag change happened and there is no unflagged cell left to
  // assert against. `creo-ignem` is kept as the witness rather than swapped for
  // some other cell, because it is the one the old assertion named, and because
  // it is where dwarf `ignem 1152` and draconic `ignem 1792` finally have
  // somewhere to act.
  it('resolves a formerly non-v1 cell as addressable, authored and now flagged', () => {
    const cellId = registry.intern('cell', 'creo-ignem');
    const cell = registry.cell(cellId);
    expect(cell?.nodes.length).toBeGreaterThan(0);
    expect(cell?.v1).toBe(true);
  });

  it('flags every cell of the grid, including rego-limen', () => {
    const flagged = registry.cells
      .filter((entry) => entry.record.v1 === true)
      .map((entry) => entry.record.id)
      .sort();
    expect(flagged).toEqual([...V1_CELLS].sort());
    expect(flagged).toHaveLength(V1_CELL_COUNT);
    expect(flagged).toContain(REQUIRED_V1_CELL);
  });

  // All seventy cells carry spells; only twelve are enabled. Authoring ahead of the
  // release is the point -- what would be a defect is a *playable* node gated behind
  // a cell the release does not enable, which no amount of play could ever reach.
  it('never gates a v1 node behind content outside the v1 subset', () => {
    const cellOf = new Map(registry.nodes.map((entry) => [entry.record.id, entry.record.cell]));
    for (const entry of registry.nodes) {
      if (!V1_CELLS.includes(entry.record.cell)) continue;
      for (const prerequisiteId of entry.record.prerequisites) {
        const cell = cellOf.get(prerequisiteId);
        expect(cell, `${entry.record.id} requires ${prerequisiteId}`).toBeDefined();
        expect(V1_CELLS, `${entry.record.id} requires ${prerequisiteId}`).toContain(cell);
      }
    }
  });

  it('carries authored spells in every cell of the grid', () => {
    const withContent = new Set(registry.nodes.map((entry) => entry.record.cell));
    expect(withContent.size).toBe(70);
  });

  it('sits inside the frontier-scan budget with room to grow', () => {
    // Every node is potentially on every mage's frontier every tick, because a
    // god may permit all seventy cells — so this count is a per-tick cost, and
    // `MAX_CONTENT_NODES` is where that cost is argued about. Headroom is
    // asserted rather than merely the bound, so that content arriving at the
    // ceiling is noticed here, in a test that can explain it, rather than in a
    // build failure a month later.
    expect(registry.counts.nodes).toBeLessThanOrEqual(MAX_CONTENT_NODES);
    expect(registry.counts.nodes * 3).toBeLessThan(MAX_CONTENT_NODES);
  });

  it('marks every authored magnitude as untuned', () => {
    for (const entry of registry.nodes) expect(entry.record.tuningStatus).toBe('untuned');
    for (const entry of registry.species) expect(entry.record.tuningStatus).toBe('untuned');
    for (const entry of registry.forms) expect(entry.record.tuningStatus).toBe('untuned');
    for (const entry of registry.territories) expect(entry.record.tuningStatus).toBe('untuned');
  });

  /**
   * The material-kinds content layer: a single undifferentiated materials
   * stock split into `food`, `stone`, and `vellum`, routed by form
   * (`sound-design.md` §4.2) and produced in differing mixes by territory.
   *
   * The third assertion is the one that guards against a typo silently making
   * a whole kind unproducible: `yieldWeights` bounds are per-field and a
   * schema pass does not by itself prove every kind is ever reached, only
   * that no field is out of range. A content set where every form authored
   * `vellum: 0` by mistake would still load clean.
   */
  it('routes a resource-yield magnitude to food, stone, and vellum without leaving any unreachable', () => {
    for (const entry of registry.forms) {
      const weights = entry.record.yieldWeights;
      for (const kind of ['food', 'stone', 'vellum'] as const) {
        expect(weights[kind], `${entry.record.id}.yieldWeights.${kind}`).toBeGreaterThanOrEqual(0);
        expect(weights[kind], `${entry.record.id}.yieldWeights.${kind}`).toBeLessThanOrEqual(1024);
      }
    }

    for (const entry of registry.territories) {
      expect(entry.record.yieldPerLandUnit, `${entry.record.id} carries yieldPerLandUnit`).toBeDefined();
    }

    for (const kind of ['food', 'stone', 'vellum'] as const) {
      expect(
        registry.forms.some((entry) => entry.record.yieldWeights[kind] > 0),
        `no form routes any weight to "${kind}" — that material kind is unproducible`,
      ).toBe(true);
    }
  });

  it('never authors a mētis node cheaper to rediscover than an episteme peer', () => {
    // metis-knowledge's proposal makes rediscovery of a mētis node costlier
    // "expressed through the existing rediscoveryMultiplier, not a new
    // mechanism" — there is no text to work from. Nothing in the rules path may
    // branch on knowledgeKind to compute that cost, so the only place the claim
    // can be true is the authored data, and the only place it can be checked is
    // here. Compared within a cell and tier, because the multiplier already
    // varies along both and a cross-cell comparison would fail on that instead.
    for (const cell of registry.cells) {
      const inCell = registry.nodes.filter((entry) => entry.record.cell === cell.record.id);
      for (const tier of new Set(inCell.map((entry) => entry.record.tier))) {
        const peers = inCell.filter((entry) => entry.record.tier === tier);
        const episteme = peers.filter((entry) => entry.record.knowledgeKind === 'episteme');
        if (episteme.length === 0) continue;
        const dearest = Math.max(...episteme.map((entry) => entry.record.rediscoveryMultiplier));
        for (const entry of peers.filter((e) => e.record.knowledgeKind === 'metis')) {
          expect([entry.record.id, entry.record.rediscoveryMultiplier >= dearest]).toEqual([
            entry.record.id,
            true,
          ]);
        }
      }
    }
  });

  it('authors mētis somewhere inside the v1 subset, or the mechanic is unreachable', () => {
    // A marking that puts every mētis node outside the twelve enabled cells is
    // a marking with no consequence in the shipped game: nothing could be
    // refused scribing, nothing could be lost to succession, and
    // metisSuccessionRisk would read zero forever while looking healthy.
    //
    // Only non-emptiness is asserted. The count is an authoring output —
    // docs/design/metis-authoring.md gives it as 6 of 51 and shows its working —
    // and pinning it here would turn every future content judgement into a test
    // edit, which is exactly the pressure that makes an author stop judging.
    const v1Metis = registry.nodes.filter(
      (entry) => V1_CELLS.includes(entry.record.cell) && entry.record.knowledgeKind === 'metis',
    );
    expect(v1Metis.length).toBeGreaterThan(0);
  });

  it('authors rediscovery multipliers above the floor so affinity can differentiate', () => {
    for (const entry of registry.nodes) {
      expect(entry.record.rediscoveryMultiplier).toBeGreaterThanOrEqual(
        V1_REDISCOVERY_AUTHORING_FLOOR,
      );
    }
    // contracts.md §2.3 asks v1 to author at or above fp(5376) so that "species
    // affinity has room to differentiate above the floor rather than being
    // clamped flat", and rejects fp(4096) by name: the gnome's fp(1792) affinity
    // turns 4096 into 2340, below the hard fp(3072) floor, so the strongest
    // instance of the trait does nothing. fp(5376) is the break-even,
    // 3072 × 1792 / 1024. The loader enforces that floor; this assertion is the
    // one that notices if the *species* side moves, because break-even is a
    // function of the best affinity and the loader constant is a literal.
    const bestAffinity = Math.max(
      ...registry.species.map((entry) => entry.record.rediscoveryAffinity),
    );
    const cheapest = Math.min(
      ...registry.nodes.map((entry) => entry.record.rediscoveryMultiplier),
    );
    expect(Math.floor((cheapest * 1024) / bestAffinity)).toBeGreaterThan(3072);
  });

  it('authors no node whose rediscovery cost the rules path cannot compute', () => {
    // `researchRequirement` evaluates mul(researchCost, effectiveMultiplier), and
    // mul throws rather than saturating. The loader rejects content that would
    // overflow, using WORST_REDISCOVERY_AFFINITY as a literal; this assertion is
    // the one that notices if the *species* side moves under it, because the
    // worst case is a function of the lowest affinity actually authored.
    const worstAffinity = Math.min(
      ...registry.species.map((entry) => entry.record.rediscoveryAffinity),
    );
    expect(worstAffinity).toBeGreaterThanOrEqual(WORST_REDISCOVERY_AFFINITY);

    for (const entry of registry.nodes) {
      const scaled = Math.floor(
        (entry.record.rediscoveryMultiplier * 1024) / WORST_REDISCOVERY_AFFINITY,
      );
      const effective = Math.max(scaled, 3072);
      expect(entry.record.researchCost * effective).toBeLessThanOrEqual(2147483647 * 1024);
    }
  });

  it('exercises, cell by cell, the primitives the v1 subset was chosen to deliver', () => {
    // The global coverage assertion below says every primitive is exercised
    // *somewhere*. That is not the claim `knowledge-model` design.md §"The v1
    // subset" makes: it justifies each cell by the primitives it carries, and a
    // primitive drifting to a different cell would silently falsify the
    // permit/forbid asymmetry table without changing the global set at all.
    const primitivesOf = (...cells: readonly string[]): readonly string[] => {
      const found = new Set<string>();
      for (const entry of registry.nodes) {
        if (!cells.includes(entry.record.cell)) continue;
        for (const effect of entry.record.effects) found.add(effect.primitive);
      }
      return [...found].sort();
    };
    const expectCovers = (cells: readonly string[], required: readonly string[]): void => {
      const found = primitivesOf(...cells);
      for (const primitive of required) expect(found).toContain(primitive);
    };

    // tasks.md 2.4 — the mandated cell, and the only source of `portal`.
    expectCovers(['rego-limen'], ['portal', 'blink', 'ward']);
    // tasks.md 2.5 — `knowledge-steal` from *both* canonical theft cells
    // separately, so a universe can close exactly one vector.
    expectCovers(['intellego-mentem'], ['knowledge-steal']);
    expectCovers(['rego-nomen'], ['knowledge-steal']);
    expectCovers(
      ['intellego-mentem', 'rego-nomen'],
      ['research-rate', 'scribe-rate', 'summon', 'concealment'],
    );
    // tasks.md 2.6, 2.7, 2.8.
    expectCovers(['rego-terram', 'intellego-terram'], ['build-rate', 'resource-yield']);
    expectCovers(['rego-mentem', 'intellego-nomen'], ['teach-rate', 'worship-yield']);
    expectCovers(
      ['perdo-mentem', 'perdo-nomen', 'perdo-terram', 'perdo-limen'],
      ['direct-damage', 'area-denial'],
    );
  });

  it('keeps concealment inside the nomen form, as the forbid-cost table promises', () => {
    // design.md's asymmetry table prices forbidding `nomen` as "no scribing
    // bonus, no summoning, no concealment". `intellego-limen` also carries a
    // concealment node, so the promise is not that nomen is the *only* source —
    // it is that closing nomen removes a real share of it. Both nomen cells in
    // the subset carry concealment, which is what makes the price non-trivial.
    const cellsWithConcealment = new Set(
      registry.nodes
        .filter((entry) => entry.record.effects.some((effect) => effect.primitive === 'concealment'))
        .map((entry) => entry.record.cell),
    );
    expect(cellsWithConcealment).toContain('perdo-nomen');
    expect(cellsWithConcealment).toContain('rego-nomen');
  });

  // Was 'except the two that await Corpus and Animal'. lifespan and fertility were the
  // only unexercised primitives because both are Corpus/Animal-bound; pre-authoring the
  // rest of the grid is what finally gave them somewhere to live.
  it('exercises every primitive in the registry', () => {
    const declared = new Set<string>();
    for (const entry of registry.nodes) {
      for (const effect of entry.record.effects) declared.add(effect.primitive);
    }
    const registered = registry.primitives.map((entry) => entry.record.id);
    const uncovered = registered.filter((id) => !declared.has(id)).sort();
    // `library-legacy` is the one primitive no node carries, and the exclusion
    // is the claim rather than an oversight: its magnitude is a count of titles
    // on a shelf, which is a property of the civilization and not of a working,
    // so a node authoring it would be authoring the wrong thing. The reasoning
    // lives with the coverage exclusion in `rules-magic/effects/coverage.ts`;
    // this assertion is narrowed to the same one name so that a *second*
    // uncarried primitive still fails here.
    expect(uncovered).toEqual(['library-legacy']);
  });

  it('confines the portal primitive to rego-limen', () => {
    const cellsWithPortal = new Set(
      registry.nodes
        .filter((entry) => entry.record.effects.some((effect) => effect.primitive === 'portal'))
        .map((entry) => entry.record.cell),
    );
    expect([...cellsWithPortal]).toEqual(['rego-limen']);
  });

  it('declares no primitive that could touch portal stability', () => {
    // contracts.md §1.6: the absence is load-bearing. Any primitive whose id
    // mentions stability would downgrade the raid termination guarantee from a
    // proof to an observation.
    for (const entry of registry.primitives) {
      expect(entry.record.id).not.toMatch(/stabilit/u);
    }
  });

  it('ships the six species from vision §6', () => {
    expect(registry.species.map((entry) => entry.record.id).sort()).toEqual(
      ['draconic', 'dwarf', 'elf', 'gnome', 'human', 'orc'].sort(),
    );
  });

  it('ships the three v1 traditions, each declaring exactly four hooks', () => {
    expect(registry.traditions.map((entry) => entry.record.id).sort()).toEqual([
      'art-of-memory',
      'true-naming',
      'vancian-memorization',
    ]);
    for (const entry of registry.traditions) {
      expect(Object.keys(entry.record.hooks).sort()).toEqual(['acquire', 'cast', 'cost', 'store']);
    }
  });

  it('gives each tradition the hook kinds knowledge-model specified', () => {
    const kindsOf = (id: string): Record<string, string> => {
      const record = registry.traditions.find((entry) => entry.record.id === id)?.record;
      if (record === undefined) throw new Error(`missing tradition ${id}`);
      return {
        acquire: record.hooks.acquire.kind,
        store: record.hooks.store.kind,
        cast: record.hooks.cast.kind,
        cost: record.hooks.cost.kind,
      };
    };
    expect(kindsOf('vancian-memorization')).toEqual({
      acquire: 'standard',
      store: 'standard',
      cast: 'prepared',
      cost: 'prepaid',
    });
    expect(kindsOf('true-naming')).toEqual({
      acquire: 'true-name',
      store: 'standard',
      cast: 'standard',
      cost: 'standard',
    });
    expect(kindsOf('art-of-memory')).toEqual({
      acquire: 'standard',
      store: 'palace',
      cast: 'standard',
      cost: 'standard',
    });
  });

  it('authors displacement only where a v1 universe can measure it', () => {
    // The field is optional and the rule for using it is a content judgement,
    // so it is asserted here rather than in the schema: displacement is only
    // authored on effects the twelve enabled cells can actually deliver, and
    // only at `target: "universe"`, because a cost with no consumer is a cost
    // that reads as balance and measures nothing.
    //
    // The episodes that argue for displacement hardest — food and labour magic
    // in *Creo* over *Herbam* and *Aquam* — are deliberately **not** authored.
    // The v1 subset has neither that technique nor those forms, so a cost
    // written there could not be measured, tuned, or falsified before the grid
    // opens.
    const v1Cells = new Set(
      registry.cells.filter((entry) => entry.record.v1 === true).map((entry) => entry.record.id),
    );
    const displacing = registry.nodes.filter((entry) =>
      entry.record.effects.some((effect) => effect.displacement !== undefined),
    );

    expect(displacing.length).toBeGreaterThan(0);
    for (const node of displacing) {
      expect(v1Cells.has(node.record.cell)).toBe(true);
      for (const effect of node.record.effects) {
        if (effect.displacement === undefined) continue;
        expect(effect.target).toBe('universe');
        expect(effect.displacement.role).toBe('laborer');
        expect(effect.displacement.fraction).toBeGreaterThan(0);
      }
    }
  });

  it('leaves the overwhelming majority of effects the pure bonuses they were authored as', () => {
    // The migration that was explicitly not wanted: three hundred nodes were
    // authored under "an effect has no cost field", and all but a handful still
    // are. If this ratio ever inverts it should be a decision somebody made,
    // not a drift nobody noticed.
    const effects = registry.nodes.flatMap((entry) => entry.record.effects);
    const withCost = effects.filter((effect) => effect.displacement !== undefined);

    expect(effects.length).toBeGreaterThan(300);
    expect(withCost.length).toBeLessThan(effects.length / 20);
  });

  it('keeps classical labels off the mechanical path', () => {
    // The labels exist and are non-empty somewhere, so the assertion that they
    // are display-only is about something rather than vacuous.
    const labelled = registry.cells.filter((entry) => entry.record.classicalLabels.length > 0);
    expect(labelled.length).toBeGreaterThan(0);
    expect(
      registry.cells.find((entry) => entry.record.id === 'rego-mentem')?.record.classicalLabels,
    ).toEqual(['enchantment']);
  });
});
