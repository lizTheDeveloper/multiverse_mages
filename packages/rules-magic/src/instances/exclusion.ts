/*
 * Multiverse Mages — the two exclusion constructs, enforced where knowledge is
 * acquired.
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
 * `docs/design/compositional-content.md` §3.1–§3.2: the first construct that
 * makes a choice **irreversible**. A prerequisite graph is a partial order and
 * a long enough life climbs all of it; an exclusion makes two repertoires
 * mutually unreachable, which is what lets two mages in one universe end up
 * holding sets neither contains the other — `contracts.md`'s stated
 * acceptance criterion for this workstream.
 *
 * ## Scope is the mage, never the universe
 *
 * Both constructs below count **what one mind holds** —
 * `knowledge.holdsHeldNode`/`heldNodeIdsOf`, which read `mind:<mageId>` and
 * `palace:<mageId>` and nothing else (`vision.md` §5). This was corrected
 * mid-implementation: an earlier draft of `track.schema.json` carried a
 * `scope: "universe"` option, and the author struck it. The reason is
 * `compositional-content.md` §4's own argument turned the other way — *"a
 * 1,500-year draconic mage is a different piece rather than the same piece at
 * a different speed"* only if what she can reach is bounded by her own
 * commitments, not by what anyone else in her universe has ever touched. So:
 * a universe may accumulate every school across many mages and many
 * lifetimes; **one mind may not**, and a school the universe already holds
 * must never close a different, uncommitted mage out of the school that
 * excludes it. {@link acquisitionExclusion} takes a `subject`, never a
 * universe, and there is no path in this file that reads `instanceCount`.
 *
 * ## Dormancy is not loss
 *
 * `holdsHeldNode`/`heldNodeIdsOf` answer "does she hold it", not "could she
 * cast it" — unlike {@link unsatisfiedPrerequisite}'s `holdsUsable`, which
 * additionally requires the node's cell to be permitted. That difference is
 * deliberate here and would be a bug if copied. A commitment reopens only
 * when the mage **loses** the blocking knowledge (decay, death, theft) —
 * `compositional-content.md` §3.2 as corrected — and re-interdicting a cell
 * does not destroy the instances in it. Gating this check on `permits()` the
 * way `holdsUsable` does would let a god open the door by interdicting the
 * committing school and open it again by lifting the interdiction, which is
 * exactly the "researching through your own interdiction" backdoor
 * `research.ts` already refuses for prerequisites, reappearing here for
 * exclusions if this file made the same mistake.
 *
 * ## Symmetry is decided in exactly one place
 *
 * `compositional-content.md` §7 (as escalated) leaves symmetry an open
 * question rather than a settled one — a future answer might make exclusion
 * one-directional ("the sealed mind forecloses the open mind, and not the
 * reverse"). Implemented symmetric for now, because it is the only reading
 * under which "a mage cannot hold both" is true regardless of which she
 * reaches first, and because content is permitted to declare an exclusion on
 * one side only (`track.schema.json`: *"declaring it on one side is enough
 * and declaring it on both is not an error"*). Both the node-antirequisite
 * closure and the track-exclusion closure are computed through the single
 * {@link addSymmetricEdge} helper below, so a one-directional answer is a
 * one-line change at its two call sites and not a hunt through this file.
 *
 * ## Two enforcement points, on purpose
 *
 * This file's predicates are called from `gateway.ts` (`@mm/coordination`)
 * while candidates are gathered, so an excluded node never appears as
 * something a mage can choose to pursue — and from `research.ts`'s
 * `refuseResearch` and `teaching.ts`'s `teach`, so a caller that
 * bypasses candidate selection entirely (a test, a different composition
 * root, a future acquisition path) still cannot create an illegal instance.
 * The second is the one that matters for correctness; the first is the one
 * that matters for a mage's AI never being *tempted* by a door already shut.
 */

import type { ContentId, ContentRegistry, Interned } from '@mm/content';
import type { Handle } from '@mm/state';

import type { KnowledgeNode, NodeCatalog } from './catalog.js';
import type { KnowledgeRefusal } from './outcomes.js';
import type { KnowledgeSubsystem } from './subsystem.js';

/** One track's declared exclusion of another, at threshold. */
export interface TrackExclusion {
  readonly trackId: ContentId;
  readonly threshold: number;
}

/** The loaded track graph, addressed by interned id. */
export interface TrackCatalog {
  /**
   * A track's exclusions, ascending by excluded track id — already closed
   * symmetric (see the module note) regardless of which side declared it.
   * Empty for a track with no exclusions and for `trackId` `0`, the shared
   * body of magic every mage can reach.
   */
  excludesOf(trackId: ContentId): readonly TrackExclusion[];
}

/** A track with no declared exclusions. Shared, and never written to. */
const EMPTY_TRACK_EXCLUSIONS: readonly TrackExclusion[] = Object.freeze([]);

/** A node with no declared antirequisites. Shared, and never written to. */
export const EMPTY_ANTIREQUISITES: readonly ContentId[] = Object.freeze([]);

/**
 * Records a relation as holding in both directions, deduplicating.
 *
 * **This is the one place symmetry is decided.** See the module note. `keyOf`
 * lets one helper serve both callers below: a plain `ContentId` for node
 * antirequisites, and a `{trackId, threshold}` pair keyed on `trackId` for
 * track exclusions. To make the relation one-directional, delete the second
 * `addEdge` call at each of this function's two call sites
 * ({@link closeAntirequisites}, {@link trackCatalogFromRegistry}) — this
 * helper itself would not need to change.
 */
function addSymmetricEdge<K, V>(
  map: Map<K, V[]>,
  a: K,
  b: K,
  forward: V,
  backward: V,
  keyOf: (value: V) => K,
): void {
  addEdge(map, a, forward, keyOf);
  addEdge(map, b, backward, keyOf);
}

function addEdge<K, V>(map: Map<K, V[]>, from: K, value: V, keyOf: (value: V) => K): void {
  const list = map.get(from);
  if (list === undefined) {
    map.set(from, [value]);
    return;
  }
  if (!list.some((existing) => keyOf(existing) === keyOf(value))) list.push(value);
}

/**
 * A node's track, or `0` for the shared body of magic every mage can reach.
 *
 * `KnowledgeNode.trackId` is optional so that a fixture built before this
 * feature existed keeps compiling without it (`catalog.ts`'s note on the
 * field); this is the one place that decides what its absence means, so nine
 * different call sites cannot decide it nine different ways.
 */
export function trackIdOf(node: KnowledgeNode): ContentId {
  return node.trackId ?? 0;
}

/** A node's antirequisites, or empty. See {@link trackIdOf}'s note; same reason. */
export function antirequisitesOf(node: KnowledgeNode): readonly ContentId[] {
  return node.antirequisites ?? EMPTY_ANTIREQUISITES;
}

/**
 * Closes a node list's `antirequisites` over both directions.
 *
 * Declaring `a.antirequisites = [b]` alone is enough content (schema
 * comment: *"declaring it on one side is enough and declaring it on both is
 * not an error"*); this pass makes `b`'s own list carry `a` too, regardless
 * of whether the content author or an upstream loader already did. Run once
 * at catalog build time — never in the per-candidate hot path — because it
 * is a function of the content set alone.
 */
export function closeAntirequisites(nodes: readonly KnowledgeNode[]): KnowledgeNode[] {
  const closure = new Map<ContentId, ContentId[]>();
  for (const node of nodes) {
    for (const other of antirequisitesOf(node)) {
      addSymmetricEdge(closure, node.nodeId, other, other, node.nodeId, (id) => id);
    }
  }
  if (closure.size === 0) return nodes as KnowledgeNode[];

  return nodes.map((node) => {
    const extra = closure.get(node.nodeId);
    if (extra === undefined || extra.length === 0) return node;
    const merged = new Set<ContentId>(antirequisitesOf(node));
    for (const id of extra) merged.add(id);
    return { ...node, antirequisites: [...merged].sort((a, b) => a - b) };
  });
}

/**
 * `@mm/content`'s registry, once it exposes tracks (`compositional-content.md`
 * §3.1). `ContentRegistry` does not declare `tracks` or an `intern('track', …)`
 * namespace yet — another workstream is adding both to `packages/content`
 * while this file was written. The two bridging functions below name that gap
 * explicitly and narrowly, so the rest of this module is written and tested
 * against real behaviour now, and both bridges disappear (the casts become
 * unnecessary, not incorrect) the moment `@mm/content` lands the real shape.
 */
interface RegistryWithTracks {
  readonly tracks?: readonly Interned<{
    readonly id: string;
    readonly excludes: readonly { readonly track: string; readonly threshold: number }[];
  }>[];
}

function tracksOf(
  registry: ContentRegistry,
): readonly Interned<{
  readonly id: string;
  readonly excludes: readonly { readonly track: string; readonly threshold: number }[];
}>[] {
  return (registry as unknown as RegistryWithTracks).tracks ?? [];
}

/**
 * Interns a track id string onto `@mm/content`'s `'track'` namespace.
 *
 * `ContentNamespace` does not list `'track'` yet, so the cast below is the
 * bridge; see the note on {@link tracksOf}. Shared with `catalog.ts`'s node
 * projection, which interns `NodeRecord.track` through the same namespace.
 */
export function internTrack(registry: ContentRegistry, id: string): ContentId {
  const intern = registry.intern as unknown as (namespace: string, rawId: string) => ContentId;
  return intern('track', id);
}

/**
 * Builds a {@link TrackCatalog} from a loaded registry, closing `excludes`
 * over both directions.
 *
 * One `intern('track', …)` per declared exclusion, at load time — never in
 * the per-candidate or per-acquisition hot path, which reads only the
 * resulting `Map`.
 */
export function trackCatalogFromRegistry(registry: ContentRegistry): TrackCatalog {
  const closure = new Map<ContentId, TrackExclusion[]>();
  for (const entry of tracksOf(registry)) {
    const trackId = entry.contentId;
    for (const raw of entry.record.excludes) {
      const excludedId = internTrack(registry, raw.track);
      addSymmetricEdge(
        closure,
        trackId,
        excludedId,
        { trackId: excludedId, threshold: raw.threshold },
        { trackId, threshold: raw.threshold },
        (exclusion) => exclusion.trackId,
      );
    }
  }
  for (const list of closure.values()) list.sort((a, b) => a.trackId - b.trackId);

  return {
    excludesOf: (trackId) => closure.get(trackId) ?? EMPTY_TRACK_EXCLUSIONS,
  };
}

/**
 * How many of a subject's held nodes sit on `trackId`.
 *
 * Distinct nodes, by construction: {@link KnowledgeSubsystem.heldNodeIdsOf}
 * is already deduplicated, so a mage who holds two instances of one node
 * (reachable through raid theft) counts once toward a threshold, not twice.
 * `O(subject's distinct held nodes)`, bounded by how much one mage knows —
 * see `heldNodeIdsOf`'s own note on why that bound is the one that matters.
 */
export function heldTrackCount(
  catalog: NodeCatalog,
  heldNodeIds: readonly ContentId[],
  trackId: ContentId,
): number {
  let count = 0;
  for (const nodeId of heldNodeIds) {
    const node = catalog.node(nodeId);
    if (node !== undefined && trackIdOf(node) === trackId) count += 1;
  }
  return count;
}

/**
 * Whether `subject` may acquire `node` — research it, be taught it, or
 * rediscover it — under the two exclusion constructs, or the refusal naming
 * why not.
 *
 * Checked in declaration order — node antirequisites (ascending, so the
 * lowest-id blocker is reported deterministically) before track exclusion —
 * which matters only for which refusal a caller sees when both would fire;
 * neither check's *result* depends on the other.
 *
 * `subject` is deliberately the only mage this function ever reads. See the
 * module note: a universe-scale question would be a different function and
 * this file does not have one.
 */
export function acquisitionExclusion(
  knowledge: KnowledgeSubsystem,
  catalog: NodeCatalog,
  tracks: TrackCatalog | undefined,
  subject: Handle,
  node: KnowledgeNode,
): KnowledgeRefusal | undefined {
  for (const antirequisiteId of antirequisitesOf(node)) {
    if (knowledge.holdsHeldNode(subject, antirequisiteId)) {
      return {
        reason: 'antirequisite-held',
        nodeId: node.nodeId,
        antirequisiteId,
        subject,
      };
    }
  }

  const trackId = trackIdOf(node);
  if (trackId === 0 || tracks === undefined) return undefined;
  const exclusions = tracks.excludesOf(trackId);
  if (exclusions.length === 0) return undefined;

  const heldNodeIds = knowledge.heldNodeIdsOf(subject);
  for (const exclusion of exclusions) {
    const held = heldTrackCount(catalog, heldNodeIds, exclusion.trackId);
    if (held >= exclusion.threshold) {
      return {
        reason: 'track-excluded',
        nodeId: node.nodeId,
        trackId,
        excludedByTrackId: exclusion.trackId,
        threshold: exclusion.threshold,
        held,
        subject,
      };
    }
  }
  return undefined;
}
