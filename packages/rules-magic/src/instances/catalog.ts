/*
 * Multiverse Mages — what a knowledge operation is allowed to know.
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
 * The three things every knowledge operation reads, and nothing else: the node
 * graph, which cell a node sits in, and a seeded random source.
 *
 * ## Why these are parameters rather than imports
 *
 * `contracts.md` §5 forbids `rules-magic` from importing `rules-world`, and
 * names "a mage learning a node" as precisely the interaction that must live in
 * a coordinating layer instead of a cycle. Every world-side value an operation
 * here needs — a species' `learnRate`, `retention`, `scribeAffinity`,
 * `rediscoveryAffinity`, how many scribe cohorts are free this month, how many
 * materials the treasury holds — is `rules-world` data. So the operations take
 * them as explicit parameters and treat mage, grimoire, and library identifiers
 * as opaque handles they never dereference.
 *
 * The consequence is testable and is tested: a teaching operation invoked with
 * handles that name no registered mage anywhere still resolves, because it only
 * ever asks the instance index what lives at those handles.
 *
 * ## The one interface owned by another module
 *
 * {@link CellResolver} is `magic-grid`'s `cellOf(nodeId)` in interface form.
 * Taking it as a parameter rather than importing the function is deliberate:
 * the grid is the authority on node-to-cell addressing, and a second copy of
 * that mapping in this file would be a second source of truth about which cell
 * a node is interdicted by. Wiring is `{ cellOf }` at the call site.
 */

import type { ContentId, ContentRegistry, Fp, KnowledgeKind, NodeRecord } from '@mm/content';
import type { RngStream } from '@mm/sim-core';

/**
 * The part of a node this package reads.
 *
 * A projection of `contracts.md` §2.3's node record rather than the record
 * itself, holding **interned** prerequisite ids. `NodeRecord.prerequisites`
 * carries author-facing strings, and interning them on every prerequisite check
 * would put string hashing inside the research loop the Monte Carlo harness
 * runs millions of times. It also keeps the effects list out of reach: effect
 * gathering is task group 5's, and a type that cannot see `effects` cannot
 * quietly start applying them here.
 */
export interface KnowledgeNode {
  readonly nodeId: ContentId;
  /** `contracts.md` §2.3, `1..5`. Weights library depth; never gates anything. */
  readonly tier: number;
  /** Interned node ids. Cross-cell prerequisites are ordinary, not special. */
  readonly prerequisites: readonly ContentId[];
  readonly researchCost: Fp;
  readonly teachCost: Fp;
  readonly scribeCost: Fp;
  /** At least `@mm/primitives`' `REDISCOVERY_FLOOR`; the loader enforces it. */
  readonly rediscoveryMultiplier: Fp;
  /**
   * `contracts.md` §2.3's authored kind: can this survive being written down?
   *
   * Shipped on all three hundred nodes since `knowledge-model` — 271 `episteme`,
   * 29 `metis` — and read by nothing in the rules path until scribing fidelity
   * gave it one. It scales how much copy distance a scribing costs; see
   * `fidelity.ts`'s `KNOWLEDGE_KIND_STEP`.
   */
  readonly knowledgeKind: KnowledgeKind;
}

/** The loaded node graph, addressed by interned id. */
export interface NodeCatalog {
  /** Highest node id in the catalog. Sizes the instance index. */
  readonly nodeCount: number;
  /** The node behind an id, or `undefined` for an id this content does not declare. */
  node(nodeId: ContentId): KnowledgeNode | undefined;
}

/**
 * `magic-grid`'s node-to-cell addressing, as an interface.
 *
 * Structural, so `{ cellOf }` binds the grid module's free function with no
 * adapter. Every legality question this package asks is `permits(ruleset,
 * cellOf(nodeId))`, and a node whose cell is not permitted is dormant.
 */
export interface CellResolver {
  /** The interned cell id a node belongs to. */
  cellOf(nodeId: ContentId): ContentId;
}

/**
 * One authored anti-requisite, reduced to what the rules path needs.
 *
 * The `reason` is deliberately absent: it is load-bearing at *validation* time,
 * where §4b makes symmetry follow from it, and it is not a rule input. Carrying
 * it here would invite a rule to branch on prose.
 */
export interface ExclusionEdge {
  readonly cell: ContentId;
  readonly resolution: 'refused' | 'destructive';
}

/**
 * `cellOf` plus the exclusions authored on a cell (`vision.md` §4b).
 *
 * Structural, like {@link CellResolver} beside it, so a call site binds the grid
 * module's function and a lookup over `cell.json` with no class to construct.
 */
export interface ExclusionResolver extends CellResolver {
  /** The cells this one excludes. Empty for every cell that excludes nothing. */
  excludedBy(cellId: ContentId): readonly ExclusionEdge[];
}

/**
 * The seeded randomness a knowledge operation may draw from.
 *
 * Structurally `@mm/sim-core`'s `StepRng`, restated here because that type is
 * reachable only through `StepContext` and an operation should be callable
 * without fabricating a whole step. **Neither method takes a tick**: the source
 * a step hands out is already bound to that step, which removes the
 * correct-tick discipline a rules author would otherwise have to remember.
 *
 * Every draw in this package names a stream from `contracts.md` §6 — research
 * `3`, teaching `4`, scribing `5` — and derives it fresh. Nothing here holds a
 * cursor across operations, which is what makes adding a draw to one operation
 * incapable of moving another's sequence.
 */
export interface KnowledgeRng {
  /** A subsystem's stream for this step. */
  stream(subsystemId: number): RngStream;
  /**
   * One actor's stream within a subsystem, for this step. `actorKey` must be a
   * stable entity handle — never an array index or a visit position, or
   * inserting a mage shifts every later mage's rolls.
   */
  actorStream(subsystemId: number, actorKey: number): RngStream;
}

/**
 * Builds a catalog from an explicit list of nodes.
 *
 * The list is not sorted, deduplicated, or otherwise repaired: ids come from
 * `@mm/content`'s interning, which is already a deterministic function of the
 * content set, and quietly renumbering them here would make a catalog disagree
 * with the registry that produced it.
 *
 * @throws RangeError naming a node id outside `1..n`. Id `0` is the reserved
 * null (`contracts.md` §0) and never names a node.
 */
export function catalogOf(nodes: readonly KnowledgeNode[]): NodeCatalog {
  let nodeCount = 0;
  const byId = new Map<ContentId, KnowledgeNode>();
  for (const node of nodes) {
    if (!Number.isInteger(node.nodeId) || node.nodeId < 1) {
      throw new RangeError(
        `Node id ${String(node.nodeId)} is not a content id. Ids are interned from 1; 0 is the ` +
          'reserved null (contracts.md §0).',
      );
    }
    byId.set(node.nodeId, node);
    if (node.nodeId > nodeCount) nodeCount = node.nodeId;
  }
  return {
    nodeCount,
    node: (nodeId) => byId.get(nodeId),
  };
}

/**
 * Projects a loaded content registry into a catalog, interning every
 * prerequisite once.
 *
 * Built once per content load rather than per operation. The registry is the
 * authority; this holds no value the registry does not, which is why it is a
 * projection and not a cache — there is nothing here that can go stale without
 * the content revision changing.
 */
export function catalogFromRegistry(registry: ContentRegistry): NodeCatalog {
  const nodes: KnowledgeNode[] = [];
  for (const entry of registry.nodes) {
    nodes.push(projectNode(entry.contentId, entry.record, registry));
  }
  return catalogOf(nodes);
}

function projectNode(
  nodeId: ContentId,
  record: NodeRecord,
  registry: ContentRegistry,
): KnowledgeNode {
  const prerequisites: ContentId[] = [];
  for (const prerequisite of record.prerequisites) {
    prerequisites.push(registry.intern('node', prerequisite));
  }
  return {
    nodeId,
    tier: record.tier,
    prerequisites,
    researchCost: record.researchCost,
    teachCost: record.teachCost,
    scribeCost: record.scribeCost,
    rediscoveryMultiplier: record.rediscoveryMultiplier,
    knowledgeKind: record.knowledgeKind,
  };
}

/**
 * The node behind an id, or a thrown error naming the id.
 *
 * Operations use this rather than tolerating `undefined`, because every other
 * reading is worse: refusing silently would make a mistyped node id look like a
 * balance rule, and proceeding with a zero-cost node would let it be researched
 * instantly.
 */
export function requireNode(catalog: NodeCatalog, nodeId: ContentId): KnowledgeNode {
  const node = catalog.node(nodeId);
  if (node === undefined) {
    throw new RangeError(
      `No node with id ${String(nodeId)} is loaded. A knowledge operation was given a node id ` +
        'this content set does not declare — check the content revision the state was built ' +
        'against (contracts.md §0).',
    );
  }
  return node;
}
