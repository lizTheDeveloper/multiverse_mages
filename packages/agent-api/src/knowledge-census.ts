/*
 * Multiverse Mages — where the physical knowledge is kept. A read, not a channel.
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
 * The **knowledge census** — vision §5 made visible.
 *
 * > A **knowledge instance** is one copy of a node, existing at exactly one of:
 * > `mind:<mageId>` … `grimoire:<itemId>` … `library:<universityId>` …
 * > `palace:<mageId>` … A node **exists in your universe** while at least one
 * > instance does.
 *
 * §1.5 defines existence as instance count ≥ 1. This module is that number,
 * **disaggregated**: per node, per location kind, and per mage.
 *
 * ## Why this is not in the observation vector
 *
 * §4.1's `knowledge` block is 70 cells × 3 — nodes known, deepest tier, instance
 * redundancy. It is per *cell*, never per *node*, and it carries no location
 * split at all, so nothing an agent can see distinguishes a node held by forty
 * mages from one held by a single dying archivist, and nothing distinguishes
 * knowledge in minds from knowledge on shelves. That is the gap this module
 * closes, and it closes it **without touching the vector**.
 *
 * The vector is a fixed-width contract with a published layout digest, and
 * `gym-bridge` refuses to start when the digest moves — precisely so a trained
 * policy is never handed differently-shaped numbers. A per-node channel for 300
 * nodes is not affordable at that width, and a fixed-width fragility digest,
 * which would be, is not worth spending width on **today**: the reference
 * universe holds zero single-instance nodes at tick 2400, at a minimum
 * redundancy of 4 and a mean of 42.6 copies per node, so the channel would
 * export a column that is zero almost everywhere. `docs/superpowers/plans/
 * w22-observability.md` prices the widening exactly — four slots, one digest
 * bump, every trained policy invalidated — so that deferring it stays a decision
 * somebody made rather than a thing that quietly never happened.
 *
 * ## What it is instead: §4.4's second projection
 *
 * `contracts.md` §4.4 already licenses this shape, for these reasons:
 *
 * > It is **not** part of the RL observation. It is emitted on request, is never
 * > an input to any rules computation, and no simulation behaviour may depend on
 * > whether it was requested.
 *
 * The census is a sibling of `./explain.ts` under that contract, not a use of
 * it: `ExplainedDecision` is decision-shaped — `goalId`, utility `scores` — and
 * waits on `rules-world`'s goal vocabulary. Both share the guarantees. Like the
 * explain projection, **the census is deliberately unreachable from
 * {@link AgentView}**: a nullable field on the observation would be a channel a
 * policy could learn to read, and §4.4's guarantee would then rest on everybody
 * remembering.
 *
 * ## Why this one reads state directly, when `scenario/census.ts` refuses to
 *
 * `@mm/scenario`'s census decodes the observation rather than reading state, and
 * its reasoning is right and stands: *"reading world state directly would let a
 * bot see what an RL agent cannot, and every measurement taken with such a bot
 * would overstate what the observation space supports."* That argument binds
 * **bot inputs and committed baselines**. It does not bind an inspection
 * channel, and applying it here would make the §4.1 gap unmeasurable using the
 * very projection that has the gap. So the rule this module holds to is the
 * narrower, checkable one: *nothing here may be fed to a policy, and no balance
 * baseline may be computed from it.* Both are enforced by the census having no
 * path into {@link AgentView}, no path into `@mm/mc-harness`, and no reachable
 * caller inside any rules package.
 *
 * ## Cost model
 *
 * One pass over the `knowledge-instance` column store and one over `mage`. No
 * allocation per instance — the tally reads three columns by row index, the way
 * `coordination/src/outlook.ts` does, because a `collectRecords` here would
 * build a five-field object for each of tens of thousands of instances.
 * {@link mageContainment} is O(m²) in mages holding knowledge and is therefore a
 * separate call, so its cost is the caller's decision and not a tax on every
 * census.
 *
 * Every list this module returns is in **ascending id order**, never row order.
 * Rows move under swap-removal, so row order depends on how the state was
 * reached rather than on what it is (`state/src/records.ts` makes the same
 * point). A census whose output depended on destruction history would be a
 * measurement of the past.
 */

import type { SimState } from '@mm/sim-core';
import { floorDiv } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE, componentOf } from '@mm/state';

/** Instances of one node, and where each of them lives. */
export interface NodeCensusEntry {
  readonly nodeId: number;
  /** Total instances. §1.5's existence test is this being ≥ 1. */
  readonly total: number;
  /** `mind:<mageId>` — fast to use, dies with the mage. */
  readonly mind: number;
  /** `grimoire:<itemId>` — portable, lootable, burnable. */
  readonly grimoire: number;
  /** `library:<universityId>` — a single high-value raid objective. */
  readonly library: number;
  /** `palace:<mageId>` — unburnable, unlootable, lost utterly with its holder. */
  readonly palace: number;
  /**
   * Distinct `(locationKind, locationId)` pairs holding this node.
   *
   * `1` is the sharpest fragility statement §5 supports that a raw instance
   * count cannot make: forty copies in one library is one fire from loss, and
   * three copies in one mage's palace is one funeral from it.
   */
  readonly distinctLocations: number;
}

/** The author's question — *where is the physical knowledge kept* — as counts. */
export interface LocationSplit {
  readonly mind: number;
  readonly grimoire: number;
  readonly library: number;
  readonly palace: number;
  /**
   * Instances whose `locationKind` is not one of §1.5's four.
   *
   * §0's null convention makes kind `0` a malformed record rather than a valid
   * one, and `state/src/enums.ts` says so. Reported rather than dropped: a
   * census that silently discarded rows would make a corruption look like a
   * smaller universe.
   */
  readonly malformed: number;
}

/** What one mage knows. §5's `mind:<mageId>` and `palace:<mageId>`, together. */
export interface MageRepertoire {
  readonly mageHandle: number;
  readonly alive: boolean;
  /** Distinct nodes this mage personally holds, ascending. */
  readonly nodeIds: readonly number[];
  /** Instances in her mind. Lost on death. */
  readonly mindInstances: number;
  /** Instances in her memory palace. Also lost on death, and unrecoverable. */
  readonly palaceInstances: number;
}

/** One reading of what a universe knows, and where it keeps it. */
export interface KnowledgeCensus {
  readonly worldTick: number;
  /** Every knowledge instance in the universe. */
  readonly instanceTotal: number;
  /** Distinct nodes with at least one instance — §1.5's "exists in your universe". */
  readonly nodesHeld: number;
  /** Ascending by `nodeId`. */
  readonly byNode: readonly NodeCensusEntry[];
  /** The aggregate the author asked for. */
  readonly whereKept: LocationSplit;
  /** Nodes at exactly one instance, ascending. The last copy. */
  readonly fragileNodeIds: readonly number[];
  /**
   * Nodes with no written copy at all — every instance in a mind or a palace.
   *
   * Distinct from {@link fragileNodeIds} and, in a redundant universe, far more
   * informative: a node held by forty mages and no book is not one copy from
   * loss, but it is one generation from it, and it is exactly the list an
   * archivist would scribe from.
   */
  readonly unwrittenNodeIds: readonly number[];
  /**
   * Nodes whose every instance sits at a single `(kind, id)` location.
   *
   * One death, one fire, or one successful raid loses these outright regardless
   * of how many copies they have.
   */
  readonly singleLocationNodeIds: readonly number[];
  /** Fewest instances of any held node; `0` when the universe holds nothing. */
  readonly minRedundancy: number;
  /** Most instances of any held node; `0` when the universe holds nothing. */
  readonly maxRedundancy: number;
  /** Ascending by handle. Mages holding nothing are included, with an empty set. */
  readonly repertoires: readonly MageRepertoire[];
}

const KINDS = [LOCATION_KIND.mind, LOCATION_KIND.grimoire, LOCATION_KIND.library, LOCATION_KIND.palace];

interface NodeTally {
  total: number;
  mind: number;
  grimoire: number;
  library: number;
  palace: number;
  /** `kind * 2^32 + id`, exact for `u8` × `u32` in a double. */
  locations: Set<number>;
}

function emptyTally(): NodeTally {
  return { total: 0, mind: 0, grimoire: 0, library: 0, palace: 0, locations: new Set<number>() };
}

/**
 * Read the universe's knowledge, disaggregated. **Mutates nothing.**
 *
 * Inertness is not a claim this doc-comment can settle, so it is a committed
 * test: `test/unit/census-inertness.test.ts` runs the same seed with and
 * without census calls interleaved and requires identical `snapshotHash()`.
 */
export function knowledgeCensus(state: SimState): KnowledgeCensus {
  const instances = componentOf(state, KNOWLEDGE_INSTANCE);
  const nodeIds = instances.field('nodeId');
  const locationKinds = instances.field('locationKind');
  const locationIds = instances.field('locationId');

  const byNode = new Map<number, NodeTally>();
  const perMage = new Map<number, { nodes: Set<number>; mind: number; palace: number }>();
  const whereKept = { mind: 0, grimoire: 0, library: 0, palace: 0, malformed: 0 };
  let instanceTotal = 0;

  instances.forEach((row) => {
    const nodeId = nodeIds[row] as number;
    const kind = locationKinds[row] as number;
    const locationId = locationIds[row] as number;
    instanceTotal += 1;

    let tally = byNode.get(nodeId);
    if (tally === undefined) {
      tally = emptyTally();
      byNode.set(nodeId, tally);
    }
    tally.total += 1;
    tally.locations.add(kind * 0x1_0000_0000 + locationId);

    switch (kind) {
      case LOCATION_KIND.mind:
        tally.mind += 1;
        whereKept.mind += 1;
        break;
      case LOCATION_KIND.grimoire:
        tally.grimoire += 1;
        whereKept.grimoire += 1;
        break;
      case LOCATION_KIND.library:
        tally.library += 1;
        whereKept.library += 1;
        break;
      case LOCATION_KIND.palace:
        tally.palace += 1;
        whereKept.palace += 1;
        break;
      default:
        // Counted in `total` and in `malformed`, and in no kind. §0's null
        // convention: kind 0 is a malformed record, not a fifth location.
        whereKept.malformed += 1;
        break;
    }

    // §5 puts both personal locations on a mage handle. A grimoire in her hands
    // is *not* one of them: §1.5 gives grimoires their own holder field, the
    // book outlives her, and counting it here would make her repertoire lie
    // about what dies with her.
    if (kind === LOCATION_KIND.mind || kind === LOCATION_KIND.palace) {
      let held = perMage.get(locationId);
      if (held === undefined) {
        held = { nodes: new Set<number>(), mind: 0, palace: 0 };
        perMage.set(locationId, held);
      }
      held.nodes.add(nodeId);
      if (kind === LOCATION_KIND.mind) held.mind += 1;
      else held.palace += 1;
    }
  });

  const orderedNodeIds = [...byNode.keys()].sort((a, b) => a - b);
  const entries: NodeCensusEntry[] = [];
  const fragile: number[] = [];
  const unwritten: number[] = [];
  const singleLocation: number[] = [];
  let minRedundancy = 0;
  let maxRedundancy = 0;

  for (const nodeId of orderedNodeIds) {
    const tally = byNode.get(nodeId) as NodeTally;
    entries.push({
      nodeId,
      total: tally.total,
      mind: tally.mind,
      grimoire: tally.grimoire,
      library: tally.library,
      palace: tally.palace,
      distinctLocations: tally.locations.size,
    });
    if (tally.total === 1) fragile.push(nodeId);
    if (tally.grimoire === 0 && tally.library === 0) unwritten.push(nodeId);
    if (tally.locations.size === 1) singleLocation.push(nodeId);
    if (minRedundancy === 0 || tally.total < minRedundancy) minRedundancy = tally.total;
    if (tally.total > maxRedundancy) maxRedundancy = tally.total;
  }

  // Every mage, not only the ones holding something: "this mage knows nothing"
  // is a fact a client has to be able to render, and it is the same reason §4.1
  // gives the mage block eight tier slots rather than seven.
  const mages = componentOf(state, MAGE);
  const alive = mages.field('alive');
  const repertoires: MageRepertoire[] = [];
  const handles: number[] = [];
  const aliveByHandle = new Map<number, boolean>();
  mages.forEach((row, handle) => {
    handles.push(handle);
    aliveByHandle.set(handle, (alive[row] as number) !== 0);
  });
  // Knowledge can outlive its mage row only through a defect, but a census that
  // dropped such a row would hide it. Orphans are surfaced as `alive: false`
  // repertoires under handles the mage component no longer carries.
  for (const handle of perMage.keys()) {
    if (!aliveByHandle.has(handle)) {
      handles.push(handle);
      aliveByHandle.set(handle, false);
    }
  }
  handles.sort((a, b) => a - b);
  for (const handle of handles) {
    const held = perMage.get(handle);
    repertoires.push({
      mageHandle: handle,
      alive: aliveByHandle.get(handle) ?? false,
      nodeIds: held === undefined ? [] : [...held.nodes].sort((a, b) => a - b),
      mindInstances: held?.mind ?? 0,
      palaceInstances: held?.palace ?? 0,
    });
  }

  return {
    worldTick: state.clock.worldTick,
    instanceTotal,
    nodesHeld: entries.length,
    byNode: entries,
    whereKept,
    fragileNodeIds: fragile,
    unwrittenNodeIds: unwritten,
    singleLocationNodeIds: singleLocation,
    minRedundancy,
    maxRedundancy,
    repertoires,
  };
}

/**
 * How the census's counts read as a location split, without the caller
 * rediscovering which kinds exist.
 *
 * Returns parts per thousand, floored, of instances at each kind — integers, so
 * that a number crossing into a report or a log never depends on float
 * formatting. The remainder from flooring is not redistributed: four floors that
 * sum to 997 is an honest statement about 997, and rounding one of them up to
 * reach 1000 would invent a copy.
 */
export function locationSharePerMille(split: LocationSplit): {
  readonly mind: number;
  readonly grimoire: number;
  readonly library: number;
  readonly palace: number;
} {
  const total = split.mind + split.grimoire + split.library + split.palace + split.malformed;
  if (total === 0) return { mind: 0, grimoire: 0, library: 0, palace: 0 };
  // `floorDiv`, not `Math.floor` of a quotient: `sim-core`'s integer division,
  // which is the one the lint rule leaves standing and the one that does not
  // route an exact ratio through a float on its way to an integer.
  return {
    mind: floorDiv(split.mind * 1000, total),
    grimoire: floorDiv(split.grimoire * 1000, total),
    library: floorDiv(split.library * 1000, total),
    palace: floorDiv(split.palace * 1000, total),
  };
}

/**
 * Whether the mages of one universe hold **incomparable** knowledge.
 *
 * This is the measurement W20 (compositional content, anti-requisites, per-mage
 * coverage) and W21 (technique envelopes as cost curves) will be judged by, and
 * it is here rather than in either of their tools so that both read the same
 * number off the same definition.
 *
 * Two mages are **comparable** when one's node set contains the other's; they
 * are **incomparable** when each holds something the other does not. W15
 * measured containment 1.000 for every cross-*strategy* pair — the strategies
 * nested rather than diverged — and the per-*mage* version of that question has
 * never been asked. A universe whose mages all nest is a universe with one
 * curriculum and no specialists, however many nodes it holds.
 *
 * Mages holding nothing are excluded: the empty set is contained in everything,
 * so counting the untaught would drive containment to 1 by arithmetic. That
 * exclusion is the whole reason this is a function and not a caller's loop.
 */
export interface ContainmentReport {
  /** Mages holding at least one node. The population the pairs are drawn from. */
  readonly holders: number;
  /** `holders * (holders - 1) / 2`. */
  readonly pairs: number;
  /** Neither set contains the other. The interesting number. */
  readonly incomparablePairs: number;
  /** One set strictly contains the other. */
  readonly strictContainmentPairs: number;
  /** The two mages hold exactly the same nodes. */
  readonly identicalPairs: number;
  /** Incomparable *and* sharing no node at all. */
  readonly disjointPairs: number;
  /** Distinct nodes held by at least one mage personally. */
  readonly unionSize: number;
  /** Nodes held by every holder. */
  readonly intersectionSize: number;
  readonly largestRepertoire: number;
  readonly smallestRepertoire: number;
}

export function mageContainment(
  census: KnowledgeCensus,
  options: { readonly livingOnly?: boolean } = {},
): ContainmentReport {
  const livingOnly = options.livingOnly ?? true;
  const sets = census.repertoires
    .filter((r) => r.nodeIds.length > 0 && (!livingOnly || r.alive))
    .map((r) => r.nodeIds);

  const holders = sets.length;
  let incomparable = 0;
  let strict = 0;
  let identical = 0;
  let disjoint = 0;

  const membership = sets.map((nodes) => new Set(nodes));
  for (let i = 0; i < holders; i += 1) {
    const left = membership[i] as Set<number>;
    for (let j = i + 1; j < holders; j += 1) {
      const right = membership[j] as Set<number>;
      let leftExtra = false;
      let rightExtra = false;
      let shared = 0;
      for (const node of left) {
        if (right.has(node)) shared += 1;
        else leftExtra = true;
      }
      for (const node of right) {
        if (!left.has(node)) {
          rightExtra = true;
          break;
        }
      }
      if (leftExtra && rightExtra) {
        incomparable += 1;
        if (shared === 0) disjoint += 1;
      } else if (leftExtra || rightExtra) strict += 1;
      else identical += 1;
    }
  }

  const union = new Set<number>();
  for (const set of membership) for (const node of set) union.add(node);
  let intersection = 0;
  if (holders > 0) {
    const first = membership[0] as Set<number>;
    for (const node of first) {
      if (membership.every((set) => set.has(node))) intersection += 1;
    }
  }

  const sizes = sets.map((s) => s.length);
  return {
    holders,
    // `floorDiv`, not `/`: this package's float-boundary test bans division
    // outside `normalize.ts`, and the product is always even so nothing is lost.
    pairs: floorDiv(holders * (holders - 1), 2),
    incomparablePairs: incomparable,
    strictContainmentPairs: strict,
    identicalPairs: identical,
    disjointPairs: disjoint,
    unionSize: union.size,
    intersectionSize: intersection,
    largestRepertoire: sizes.length === 0 ? 0 : Math.max(...sizes),
    smallestRepertoire: sizes.length === 0 ? 0 : Math.min(...sizes),
  };
}

/** The four §1.5 location kinds, in document order. Exported so a renderer need not restate them. */
export const CENSUS_LOCATION_KINDS: readonly number[] = Object.freeze(KINDS);
