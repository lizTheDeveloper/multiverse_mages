/*
 * Multiverse Mages — candidate scanning is bounded by a constant and gated by
 * depth before anything can score it.
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
 * Two spec scenarios meet in this file and they pull in opposite directions.
 * *"Candidate scanning is bounded"* wants the list short; *"depth ceiling is a
 * hard limit"* wants the deep entries gone. Applying them in the wrong order
 * satisfies both individually and produces a species that looks incurious: cut
 * the frontier to sixteen first, then drop everything above the ceiling, and a
 * low-ceiling species can end up with nothing to research in a universe full of
 * things it could research.
 *
 * So the order is asserted, not only the two properties.
 */

import { describe, expect, it } from 'vitest';

import type { ContentId } from '@mm/content';

import type { KnowledgeGateway, KnowledgeTarget, MageHandle } from '../../src/index.js';
import {
  MAX_CANDIDATE_TARGETS,
  boundCandidates,
  compareTargets,
  gatherFrontier,
  withinDepthCeiling,
} from '../../src/index.js';

import { speciesNamed, target } from './autonomy-fixtures.js';

/**
 * A gateway that answers from a fixed list.
 *
 * Everything the port offers beyond the two calls `gatherFrontier` makes throws
 * rather than returning a plausible default: a stub that quietly answers
 * questions the code under test should not be asking is a stub that hides a
 * widening of the port.
 */
function gatewayOver(
  frontier: readonly KnowledgeTarget[],
  lostIds: readonly ContentId[] = [],
): KnowledgeGateway & { asked: number[] } {
  const lost = new Set(lostIds);
  const asked: number[] = [];
  const refuse = (name: string): never => {
    throw new Error(`gatherFrontier called ${name}, which it has no business calling`);
  };
  return {
    asked,
    researchFrontier(_mage: MageHandle, limit: number): readonly KnowledgeTarget[] {
      asked.push(limit);
      return frontier;
    },
    rediscovery: (nodeId: ContentId) => lost.has(nodeId),
    instanceCount: () => refuse('instanceCount'),
    knows: () => refuse('knows'),
    canTeach: () => refuse('canTeach'),
    teachableTo: () => refuse('teachableTo'),
    scribableBy: () => refuse('scribableBy'),
    contributeResearch: () => refuse('contributeResearch'),
    contributeTeaching: () => refuse('contributeTeaching'),
    contributeScribing: () => refuse('contributeScribing'),
    onMageDied: () => refuse('onMageDied'),
  };
}

describe('the depth ceiling is a hard limit', () => {
  it('drops every target above a species ceiling', () => {
    const shallow = speciesNamed('orc');
    expect(shallow.depthCeiling).toBe(3);
    expect(withinDepthCeiling(target(1, 3), shallow)).toBe(true);
    expect(withinDepthCeiling(target(2, 4), shallow)).toBe(false);
  });

  it('keeps a deep node out of the frontier entirely, not merely low-scored', () => {
    const gateway = gatewayOver([target(1, 4), target(2, 7)]);
    const frontier = gatherFrontier(gateway, 1, speciesNamed('orc'));
    expect(frontier.discovery).toHaveLength(0);
    expect(frontier.rediscovery).toHaveLength(0);
  });

  it('lets the deepest species reach what the shallowest cannot', () => {
    const graph = [target(1, 3), target(2, 5), target(3, 7)];
    const deep = gatherFrontier(gatewayOver(graph), 1, speciesNamed('draconic'));
    const shallow = gatherFrontier(gatewayOver(graph), 1, speciesNamed('orc'));
    expect(deep.discovery).toHaveLength(3);
    expect(shallow.discovery).toHaveLength(1);
  });
});

describe('scanning is bounded by a documented constant', () => {
  it('returns no more than the limit per goal, from a large frontier', () => {
    const many = Array.from({ length: 400 }, (_unused, index) => target(index + 1, 1, index + 1));
    const frontier = gatherFrontier(gatewayOver(many), 1, speciesNamed('human'));
    expect(frontier.discovery.length).toBe(MAX_CANDIDATE_TARGETS);
  });

  it('asks the gateway for a bounded number too, not for everything', () => {
    // The port takes a limit for exactly this reason. Asking for the whole
    // graph and truncating afterwards would bound this package's cost and not
    // the coordinating layer's.
    const gateway = gatewayOver([target(1)]);
    gatherFrontier(gateway, 1, speciesNamed('human'));
    expect(gateway.asked).toHaveLength(1);
    expect(gateway.asked[0]).toBeLessThanOrEqual(MAX_CANDIDATE_TARGETS * 2);
  });

  it('gates by depth before spending the limit, not after', () => {
    // Twenty deep nodes first, then two shallow ones. Truncating first would
    // return nothing at all for a low-ceiling species; gating first returns
    // both shallow nodes.
    const graph = [
      ...Array.from({ length: 20 }, (_unused, index) => target(index + 1, 7, index + 1)),
      target(100, 1, 900),
      target(101, 2, 901),
    ];
    const frontier = gatherFrontier(gatewayOver(graph), 1, speciesNamed('orc'));
    expect(frontier.discovery.map((entry) => entry.nodeId)).toEqual([100, 101]);
  });

  it('refuses a non-positive limit rather than scanning without one', () => {
    expect(() => gatherFrontier(gatewayOver([]), 1, speciesNamed('human'), 0)).toThrow(
      /positive integer/u,
    );
  });
});

describe('discovery and rediscovery are separated by what the universe has lost', () => {
  /**
   * The stub answers `rediscovery`, not `everKnown`, and the difference is the
   * point rather than a rename. `gatherFrontier` used to bucket on the raw
   * ever-known mark, which is never cleared, so a node still standing in
   * somebody's head was filed as a lost art to be rediscovered. Only nodes
   * *known once and now gone* belong in the second list, which is the same
   * predicate `research()` prices at three times.
   */
  it('routes a node this universe has lost into rediscovery', () => {
    const gateway = gatewayOver([target(1), target(2), target(3)], [2]);
    const frontier = gatherFrontier(gateway, 1, speciesNamed('human'));
    expect(frontier.discovery.map((entry) => entry.nodeId)).toEqual([1, 3]);
    expect(frontier.rediscovery.map((entry) => entry.nodeId)).toEqual([2]);
  });

  it('bounds the two lists independently', () => {
    const many = Array.from({ length: 100 }, (_unused, index) => target(index + 1, 1, index + 1));
    const lost = many.filter((_unused, index) => index % 2 === 0).map((entry) => entry.nodeId);
    const frontier = gatherFrontier(gatewayOver(many, lost), 1, speciesNamed('human'));
    expect(frontier.discovery.length).toBeLessThanOrEqual(MAX_CANDIDATE_TARGETS);
    expect(frontier.rediscovery.length).toBeLessThanOrEqual(MAX_CANDIDATE_TARGETS);
  });
});

describe('candidate order depends only on the candidates', () => {
  it('orders cheapest first and breaks cost ties on node id', () => {
    expect(compareTargets(target(1, 1, 10), target(2, 1, 20))).toBeLessThan(0);
    expect(compareTargets(target(9, 1, 10), target(2, 1, 10))).toBeGreaterThan(0);
    expect(compareTargets(target(3, 1, 10), target(3, 1, 10))).toBe(0);
  });

  it('produces the same list whatever order the gateway answered in', () => {
    const graph = [target(5, 1, 300), target(2, 1, 100), target(9, 1, 100)];
    const forward = gatherFrontier(gatewayOver(graph), 1, speciesNamed('human'));
    const reversed = gatherFrontier(gatewayOver([...graph].reverse()), 1, speciesNamed('human'));
    expect(forward.discovery.map((entry) => entry.nodeId)).toEqual(
      reversed.discovery.map((entry) => entry.nodeId),
    );
    expect(forward.discovery.map((entry) => entry.nodeId)).toEqual([2, 9, 5]);
  });

  it('applies the same gate and the same bound to teaching and scribing lists', () => {
    const graph = [target(1, 7, 10), target(2, 1, 50), target(3, 1, 20)];
    const bounded = boundCandidates(graph, speciesNamed('orc'));
    expect(bounded.map((entry) => entry.nodeId)).toEqual([3, 2]);
    expect(boundCandidates(graph, speciesNamed('human'), 1)).toHaveLength(1);
  });
});
