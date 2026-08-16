/*
 * Multiverse Mages — helpers for the mage-autonomy tests.
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
 * The autonomy tests are built around **real species records and a synthetic
 * situation**, and the split is deliberate.
 *
 * Species come from the shipped content, because the differentiation scenarios
 * are claims about the six species the game actually has — a hand-written
 * species with `curiosity: 2048` would prove the scoring function responds to
 * its input and nothing about whether the shipped content differentiates.
 *
 * Situations are synthetic, because an outlook assembled from a live universe
 * would make every scoring test depend on the economy, the knowledge graph, and
 * the coordinating layer — none of which exists yet, and all of which would
 * make a failing score test ambiguous about which of five subsystems moved.
 */

import type { SpeciesRecord } from '@mm/content';
import { MAGE_ROLE } from '@mm/state';
import type { MageRoleValue } from '@mm/state';

import type {
  KnowledgeTarget,
  MageOutlook,
  SpeciesAffinities,
  TargetAppealWeights,
} from '../../src/index.js';
import { readTargetAppeal, resolveSpeciesAffinities } from '../../src/index.js';

import { shippedRegistry } from './mage-fixtures.js';

/**
 * The shipped species, loaded once for the whole file.
 *
 * Cached because `loadContent` parses and validates every content file, and the
 * determinism test below builds hundreds of outlooks. An uncached lookup turned
 * that one test into three seconds of JSON schema validation, which is time
 * spent proving something no autonomy test is about.
 */
const registry = shippedRegistry();

const speciesById = new Map<string, SpeciesRecord>(
  registry.species.map((entry) => [entry.record.id, entry.record]),
);

/** One shipped species record, by id. */
export function speciesNamed(id: string): SpeciesRecord {
  const found = speciesById.get(id);
  if (found === undefined) throw new Error(`no species "${id}" in the shipped registry`);
  return found;
}

/**
 * The target-appeal weights, read once from the shipped content.
 *
 * Read rather than hand-written for the same reason species are: a fabricated
 * weight table would prove the score responds to its inputs and nothing about
 * whether the shipped content differentiates anything.
 */
export const appealWeights: TargetAppealWeights = readTargetAppeal(registry);

const affinityCache = new Map<string, SpeciesAffinities>();

/**
 * One species' resolved affinity table, by species id.
 *
 * Memoized for the reason {@link speciesNamed} is: `shippedRegistry()` parses
 * and validates every content file on **every call**, and the stampede test
 * builds one outlook per mage per tick for two hundred ticks. Resolving
 * affinities uncached turned that test from milliseconds into a timeout —
 * scoring is a pure function of a table that never changes, and paying for the
 * table per mage is paying for it in the wrong place.
 */
export function affinitiesOf(id: string): SpeciesAffinities {
  const cached = affinityCache.get(id);
  if (cached !== undefined) return cached;
  const resolved = resolveSpeciesAffinities(speciesNamed(id), registry);
  affinityCache.set(id, resolved);
  return resolved;
}

/**
 * A knowledge target, with everything the scoring path reads.
 *
 * The three content-shaped fields default to "no cell, no form, no effects",
 * which scores as neutral on the affinity and role terms — so a test that does
 * not care about them gets a target that behaves exactly as it did before those
 * terms existed.
 */
export function target(
  nodeId: number,
  tier = 1,
  remainingCost = 1024,
  facets: Partial<Pick<KnowledgeTarget, 'cellId' | 'formId' | 'primitives'>> = {},
): KnowledgeTarget {
  return {
    nodeId,
    tier,
    remainingCost,
    cellId: facets.cellId ?? 0,
    formId: facets.formId ?? 0,
    primitives: facets.primitives ?? [],
  };
}

/**
 * A neutral outlook: a prime-aged, unaffiliated, average-personality mage with
 * nothing to do.
 *
 * Every field is set explicitly rather than defaulted through `??`, so that a
 * test asserting a difference between two outlooks is comparing two records
 * that differ only where it says they do.
 */
export function outlook(overrides: Partial<MageOutlook> = {}): MageOutlook {
  const base: MageOutlook = {
    mage: 1,
    species: speciesNamed('human'),
    affinities: affinitiesOf('human'),
    personality: { curiosity: 1024, ambition: 1024, caution: 1024 },
    roleId: MAGE_ROLE.researcher as MageRoleValue,
    // fp(512) — the middle of the prime band for every species, and the
    // normalized age the spec's own cross-species scenario uses.
    normalizedAge: 512,
    universityId: 0,
    discoveryTargets: [],
    rediscoveryTargets: [],
    teachableToMe: [],
    teachableByMe: [],
    scribableTargets: [],
    applicableTargets: [],
    practiceTargets: [],
    materials: 0,
    scribeThroughput: 0,
    betterAffiliationAvailable: false,
    preferredUniversity: 0,
    wardPressure: 0,
    raidPressure: 0,
  };
  return { ...base, ...overrides };
}

/**
 * An outlook in which every goal is feasible.
 *
 * Used wherever a test is about scoring rather than about masking: scoring a
 * goal the mask would have removed is arithmetic nobody would ever see, and a
 * test that did it would be asserting over an unreachable branch.
 */
export function richOutlook(overrides: Partial<MageOutlook> = {}): MageOutlook {
  return outlook({
    universityId: 7,
    discoveryTargets: [target(11), target(12)],
    rediscoveryTargets: [target(21)],
    teachableToMe: [target(31)],
    teachableByMe: [target(41)],
    scribableTargets: [target(51, 1, 512)],
    // `remainingCost` zero, because an applicable node is one she already knows
    // — there is no project left to pay for.
    applicableTargets: [target(61, 1, 0)],
    // `remainingCost` zero for the same reason: practice has no project, only a
    // mastery that is higher this month than last.
    practiceTargets: [target(71, 1, 0)],
    materials: 4096,
    scribeThroughput: 1024,
    betterAffiliationAvailable: true,
    preferredUniversity: 9,
    ...overrides,
  });
}
