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
import type { KnowledgeInstanceRecord } from '@mm/state';
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

/**
 * The decay arithmetic, **supplied rather than imported** (W26).
 *
 * ## Why this is an argument and not an import
 *
 * The same reasoning `./catalogue.ts` gives, with a harder edge. The floor and
 * the per-tick loss are `@mm/rules-magic`'s — `masteryFloor` and
 * `masteryDecayPerTick` in `instances/decay.ts`, and `DEFAULT_TEACH_THRESHOLD`
 * in `instances/constants.ts` — and `contracts.md` §5 runs the dependency the
 * other way: *rules packages never import this one*. Reversing it here would put
 * a cycle in the graph the module-boundaries test exists to forbid.
 *
 * Re-deriving the formula locally is the alternative, and it is the worse one.
 * `rediscoveryMultiplier` is the precedent nobody wants repeated: three copies
 * of one release claim, two of which disagreed about whether affinity
 * multiplied or divided, and the wrong one shipped. A second copy of the decay
 * curve would drift the same way and would drift *silently*, because a renderer
 * disagreeing with the rules by five mastery units looks like nothing.
 *
 * So the caller — the composition root, a tool, a test — hands across the
 * functions `rules-magic` already exports. There stays exactly one
 * implementation, and `@mm/scenario`'s marooning-agreement test checks that the
 * number this module publishes is the tick `teach()` actually starts refusing
 * on, over a real run.
 *
 * Nothing here may *decide* anything. If a value is wanted that `rules-magic`
 * does not compute, it belongs in `rules-magic`.
 */
export interface MasteryModel {
  /** `contracts.md` §1.5's `TEACH_THRESHOLD`. Teachable is `mastery >= this`. */
  readonly teachThreshold: number;
  /** Species `retention` (§2.4) by `speciesId`. `0` for a species not named. */
  retentionOfSpecies(speciesId: number): number;
  /** `rules-magic`'s `masteryFloor`. Never reimplemented here. */
  masteryFloor(retention: number, dormant: boolean): number;
  /** `rules-magic`'s `masteryDecayPerTick`. Never reimplemented here. */
  masteryDecayPerTick(retention: number): number;
  /**
   * Whether the current ruleset forbids this node's cell, so the instance has
   * no floor and decays to destruction.
   *
   * Optional because dormancy needs a node→cell map, which lives in content and
   * which this package receives as a catalogue rather than reads. Absent means
   * *nothing is dormant*, which is the right default for the reference universe
   * — a god issuing no edicts forbids nothing — and is stated in the summary so
   * a caller cannot mistake "not asked" for "measured zero".
   */
  isDormant?(nodeId: number): boolean;
}

/** Optional extras a caller can ask the census for. */
export interface CensusOptions {
  /**
   * Supplying this adds {@link KnowledgeCensus.marooning}. Omitting it leaves
   * the census exactly what it was before W26 — same fields, same allocations,
   * same cost — so a caller that only wants counts pays nothing for a
   * projection it did not ask for.
   */
  readonly mastery?: MasteryModel | undefined;
}

/**
 * One held instance, with the numbers that make its raw mastery legible.
 *
 * `sound-design.md` §0.1, from contracts §5: *"audio is a projection of state,
 * and computes no rules"*. That binds every view, not only the audio one. A
 * panel can render `704` today and nothing else, and `704` is "teachable, 25
 * ticks left" for a human and "teachable, 39 ticks left" for a dwarf. Deriving
 * that in a renderer would put the decay curve in a third place.
 *
 * Only **held** instances (mind, palace) get a row. A grimoire is written at
 * `mastery: 0` by construction (`rules-magic`'s `scribing.ts`) and does not
 * decay at all, so a floor and a countdown would be meaningless numbers a
 * renderer would then have to know to ignore. `locationKind` is therefore always
 * `mind` or `palace`, and `locationId` is always a mage handle.
 *
 * **Extends `@mm/state`'s record rather than restating it.** `state-schema`
 * requires one set of world-state type definitions that everything consumes —
 * a second declaration of §1.5's five fields would be free to drift from the
 * component layout, and `schema-duplication.test.ts` rejects one however it is
 * named. So the columns below are the derived numbers and nothing else.
 */
export interface InstanceMastery extends KnowledgeInstanceRecord {
  /** The instance's entity handle. Rows are ascending by this. */
  readonly instanceHandle: number;
  /** The holder's species `retention`; `0` when no mage row carries the holder. */
  readonly retention: number;
  /** `masteryFloor(retention, dormant)` — what it settles at and never passes. */
  readonly floor: number;
  /** `masteryDecayPerTick(retention)` — units lost per world tick. */
  readonly decayPerTick: number;
  /** Whether `teach()` would accept this instance's holder as a teacher now. */
  readonly teachable: boolean;
  /**
   * World ticks until `teach()` starts refusing **under decay alone**: `0` if it
   * already does, and `null` if the floor sits at or above the threshold so it
   * never will.
   *
   * **A lower bound, not a date.** `rules-magic`'s `practice`
   * (`w196/mastery-rises`) raises mastery, and this projection does not model it
   * — it cannot, because whether a mage goes back to the desk next month is a
   * decision the autonomy layer has not made yet. So an instance never stops
   * being teachable *sooner* than this says and often stops later.
   * `knowledge-census-marooning-agreement.test.ts` asserts exactly that
   * asymmetry, and counts the deferrals so the bound is not vacuously exact.
   *
   * **This is one more than the tick mastery reaches the threshold**, and that
   * is deliberate. `teaching.ts` refuses on `teacherMastery < threshold`, so a
   * human at exactly `512` can still teach; the first tick she cannot is the
   * one after. The published number is the one a view needs — *when does this
   * stop working* — not the one a subtraction produces.
   */
  readonly ticksToUnteachable: number | null;
  /**
   * Held, **not dormant**, and below the threshold — so nobody may teach it
   * *now*.
   *
   * ## This used to be permanent, and `w196/mastery-rises` is why it is not
   *
   * Until `rules-magic`'s `practice` existed, `setMastery` had exactly one
   * rules-path caller — `decay.ts` — and it only ever lowered. A marooned
   * instance was therefore marooned for good: `gateway.ts`'s `knows()` is set
   * membership at any mastery, so its holder was skipped as both a student and
   * a researcher for that node, and `scribing.ts` writes books at mastery `0`
   * with no path back into a mind. It was alive, uncountable by
   * `knowledgeHalfLife`, and would die with its holder having taught nobody.
   *
   * `GOAL.practice` is the exit. A mage who spends her months drilling carries
   * the instance back up to `practiceCeiling(tier, depthCeiling)`, which is at
   * or above the teach threshold for every node she can legally hold. So this
   * flag now reads *"stranded unless she goes and works on it"* rather than
   * *"stranded"* — which is still worth publishing, because the month she
   * spends is a month she is not researching, and a universe with many marooned
   * instances is one whose academy is about to stop discovering things.
   */
  readonly marooned: boolean;
  /**
   * Dormant: the god forbids this cell, so there is no floor and this instance
   * decays to zero and is destroyed.
   *
   * Kept strictly apart from {@link marooned}. Condemned knowledge has an exit
   * and emits the loss event `knowledgeHalfLife` is computed from; marooned
   * knowledge has neither, which is the entire reason it is worth publishing.
   */
  readonly condemned: boolean;
}

/** One node's held copies, split by whether any of them can still move. */
export interface NodeMastery {
  readonly nodeId: number;
  /** Copies in a mind or a palace. */
  readonly held: number;
  /** Held copies at or above the threshold — the ones that can still teach. */
  readonly teachable: number;
  /** Held, non-dormant, below the threshold. */
  readonly marooned: number;
  /** Held and dormant. */
  readonly condemned: number;
  /** Copies in a grimoire or on a shelf. Never teachable; see {@link InstanceMastery}. */
  readonly written: number;
}

/** What decay has already done to a universe's ability to move what it knows. */
export interface MarooningSummary {
  /** The threshold every judgement here was taken against. */
  readonly teachThreshold: number;
  /** `false` when the model supplied no `isDormant`, so `condemned` is *unasked*, not zero. */
  readonly dormancyEvaluated: boolean;
  /** Instances in a mind or a palace. */
  readonly heldInstances: number;
  /** Instances in a grimoire or on a shelf. */
  readonly writtenInstances: number;
  /** Instances whose `locationKind` is none of §1.5's four. */
  readonly malformedInstances: number;
  readonly teachableInstances: number;
  readonly maroonedInstances: number;
  readonly condemnedInstances: number;
  /** Ascending by node id. Nodes with at least one teachable held copy. */
  readonly teachableNodeIds: readonly number[];
  /**
   * Ascending by node id. Nodes the universe **holds and cannot transmit** —
   * not one copy anywhere is at or above the threshold.
   *
   * The number W26 exists to produce. Such a node cannot be taught, cannot be
   * read out of a book, and dies with its last holder — and no committed metric
   * sees it: `knowledgeHalfLife` counts it alive, `libraryDependence` counts it
   * held, and this module's own `fragileNodeIds` and `unwrittenNodeIds` both
   * call it healthy however many copies it has.
   *
   * It is **not** unrecoverable at the universe level, and the distinction is
   * worth keeping honest: a mage who does not already hold the node may still
   * research it, and at the *ordinary* price rather than the rediscovery one,
   * because `rules-magic`'s `isRediscovery` requires the node not to exist.
   */
  readonly untransmittableNodeIds: readonly number[];
  /** Ascending by node id, every node with at least one instance. */
  readonly byNode: readonly NodeMastery[];
  /** Ascending by instance handle. Held instances only. */
  readonly byInstance: readonly InstanceMastery[];
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
  /**
   * Present only when the caller supplied a {@link MasteryModel}.
   *
   * Optional rather than always-on because computing it needs facts this
   * package may not read — species retention lives in content, and the decay
   * curve lives in a rules package this one may not import.
   */
  readonly marooning?: MarooningSummary | undefined;
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
 * A held instance's raw columns, carried from the instance pass to the mage
 * pass. Extends the shared record for the reason {@link InstanceMastery} gives.
 */
interface HeldRow extends KnowledgeInstanceRecord {
  readonly instanceHandle: number;
}

/**
 * World ticks until `teach()` starts refusing, or `null` for never.
 *
 * `decayedMastery` is `max(mastery - decayPerTick * t, floor)`, so with a floor
 * below the threshold the smallest `t` satisfying `mastery - decayPerTick*t <
 * threshold` is `floor((mastery - threshold) / decayPerTick) + 1`. Exact
 * integer arithmetic, and `floorDiv` rather than `/` because this package's
 * float-boundary test bans division outside `normalize.ts`.
 *
 * `floor >= threshold` means decay settles at a teachable level and the answer
 * is genuinely *never* — unreachable under shipped content, where every species'
 * floor is below `512`, but `species.schema.json` admits retention up to
 * `fp(4096)` and a `null` is a better answer than a very large number.
 */
function ticksToUnteachable(
  mastery: number,
  threshold: number,
  floor: number,
  decayPerTick: number,
): number | null {
  if (mastery < threshold) return 0;
  if (floor >= threshold) return null;
  // A supplied model is not `rules-magic`'s if it returns this, which returns
  // `max(..., 1)`. Reported as "never" rather than dividing by zero.
  if (decayPerTick <= 0) return null;
  return floorDiv(mastery - threshold, decayPerTick) + 1;
}

/**
 * Read the universe's knowledge, disaggregated. **Mutates nothing.**
 *
 * Inertness is not a claim this doc-comment can settle, so it is a committed
 * test: `test/unit/census-inertness.test.ts` runs the same seed with and
 * without census calls interleaved and requires identical `snapshotHash()`.
 *
 * @param options supplying `mastery` adds {@link KnowledgeCensus.marooning} and
 * costs one row per **held** instance. Omitted, this function allocates exactly
 * what it allocated before W26.
 */
export function knowledgeCensus(state: SimState, options: CensusOptions = {}): KnowledgeCensus {
  const instances = componentOf(state, KNOWLEDGE_INSTANCE);
  const nodeIds = instances.field('nodeId');
  const locationKinds = instances.field('locationKind');
  const locationIds = instances.field('locationId');
  const masteries = instances.field('mastery');
  const acquiredTicks = instances.field('acquiredTick');

  const byNode = new Map<number, NodeTally>();
  const perMage = new Map<number, { nodes: Set<number>; mind: number; palace: number }>();
  const whereKept = { mind: 0, grimoire: 0, library: 0, palace: 0, malformed: 0 };
  let instanceTotal = 0;
  // Only materialized on the opt-in path, so W22's "no allocation per instance"
  // cost claim stays literally true for the base call. Marooning cannot be
  // decided inside this loop: it needs each holder's species, and the mage pass
  // that reads species runs after it.
  const heldRows: HeldRow[] | undefined = options.mastery === undefined ? undefined : [];

  instances.forEach((row, handle) => {
    const nodeId = nodeIds[row] as number;
    const kind = locationKinds[row] as number;
    const locationId = locationIds[row] as number;
    instanceTotal += 1;

    if (heldRows !== undefined && (kind === LOCATION_KIND.mind || kind === LOCATION_KIND.palace)) {
      heldRows.push({
        instanceHandle: handle,
        nodeId,
        locationKind: kind,
        locationId,
        mastery: masteries[row] as number,
        acquiredTick: acquiredTicks[row] as number,
      });
    }

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
  const speciesIds = mages.field('speciesId');
  const repertoires: MageRepertoire[] = [];
  const handles: number[] = [];
  const aliveByHandle = new Map<number, boolean>();
  // Only populated on the opt-in path, and only then read.
  const speciesByHandle = heldRows === undefined ? undefined : new Map<number, number>();
  mages.forEach((row, handle) => {
    handles.push(handle);
    aliveByHandle.set(handle, (alive[row] as number) !== 0);
    speciesByHandle?.set(handle, speciesIds[row] as number);
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

  const marooning =
    options.mastery === undefined || heldRows === undefined || speciesByHandle === undefined
      ? undefined
      : summariseMarooning(options.mastery, heldRows, speciesByHandle, byNode, orderedNodeIds);

  return {
    worldTick: state.clock.worldTick,
    instanceTotal,
    nodesHeld: entries.length,
    byNode: entries,
    whereKept,
    marooning,
    fragileNodeIds: fragile,
    unwrittenNodeIds: unwritten,
    singleLocationNodeIds: singleLocation,
    minRedundancy,
    maxRedundancy,
    repertoires,
  };
}

/**
 * Turns the held rows into {@link MarooningSummary}. Called only when a
 * {@link MasteryModel} was supplied.
 *
 * The three buckets are kept strictly apart, because the headline number is
 * worthless if they blend: **marooned** (held, non-dormant, below threshold — no
 * exit exists), **condemned** (held and dormant — destruction is its exit, and
 * it emits the loss event `knowledgeHalfLife` reads), and **written** (mastery
 * `0` by construction, never teachable, and no business in either count).
 */
function summariseMarooning(
  model: MasteryModel,
  heldRows: readonly HeldRow[],
  speciesByHandle: ReadonlyMap<number, number>,
  byNode: ReadonlyMap<number, NodeTally>,
  orderedNodeIds: readonly number[],
): MarooningSummary {
  const threshold = model.teachThreshold;
  const isDormant = model.isDormant;
  // Asked once per distinct node rather than once per instance: the ruleset
  // cannot change inside one census, and `decay.ts` memoizes the same question
  // for the same reason. Discarded with the call; nothing caches across one.
  const dormantByNode = new Map<number, boolean>();

  const perNode = new Map<number, { held: number; teachable: number; marooned: number; condemned: number }>();
  const byInstance: InstanceMastery[] = [];
  let teachableInstances = 0;
  let maroonedInstances = 0;
  let condemnedInstances = 0;

  for (const held of heldRows) {
    let dormant = dormantByNode.get(held.nodeId);
    if (dormant === undefined) {
      dormant = isDormant === undefined ? false : isDormant(held.nodeId);
      dormantByNode.set(held.nodeId, dormant);
    }

    // `world-step.ts`'s `retentionOf` returns 0 for a holder the mage component
    // no longer carries, and `masteryDecayPerTick(0)` is the un-divided rate
    // with a floor of 0 — an orphaned instance decays to destruction. Mirrored
    // exactly, so the census does not disagree with the sweep about an orphan.
    const speciesId = speciesByHandle.get(held.locationId);
    const retention = speciesId === undefined ? 0 : model.retentionOfSpecies(speciesId);
    const floor = model.masteryFloor(retention, dormant);
    const decayPerTick = model.masteryDecayPerTick(retention);
    const teachable = held.mastery >= threshold;
    const marooned = !dormant && !teachable;

    if (teachable) teachableInstances += 1;
    if (marooned) maroonedInstances += 1;
    if (dormant) condemnedInstances += 1;

    let tally = perNode.get(held.nodeId);
    if (tally === undefined) {
      tally = { held: 0, teachable: 0, marooned: 0, condemned: 0 };
      perNode.set(held.nodeId, tally);
    }
    tally.held += 1;
    if (teachable) tally.teachable += 1;
    if (marooned) tally.marooned += 1;
    if (dormant) tally.condemned += 1;

    byInstance.push({
      instanceHandle: held.instanceHandle,
      nodeId: held.nodeId,
      locationKind: held.locationKind,
      locationId: held.locationId,
      mastery: held.mastery,
      acquiredTick: held.acquiredTick,
      retention,
      floor,
      decayPerTick,
      teachable,
      ticksToUnteachable: ticksToUnteachable(held.mastery, threshold, floor, decayPerTick),
      marooned,
      condemned: dormant,
    });
  }

  // Ascending by handle, never row order: rows move under swap-removal, so row
  // order is a fact about how the state was reached rather than about what it
  // is. This module makes the same point about every other list it returns.
  byInstance.sort((a, b) => a.instanceHandle - b.instanceHandle);

  const nodes: NodeMastery[] = [];
  const teachableNodeIds: number[] = [];
  const untransmittableNodeIds: number[] = [];
  let heldInstances = 0;
  let writtenInstances = 0;
  let malformedInstances = 0;

  for (const nodeId of orderedNodeIds) {
    const total = byNode.get(nodeId) as NodeTally;
    const tally = perNode.get(nodeId) ?? { held: 0, teachable: 0, marooned: 0, condemned: 0 };
    const written = total.grimoire + total.library;
    nodes.push({
      nodeId,
      held: tally.held,
      teachable: tally.teachable,
      marooned: tally.marooned,
      condemned: tally.condemned,
      written,
    });
    heldInstances += tally.held;
    writtenInstances += written;
    malformedInstances += total.total - tally.held - written;
    // A node with copies and not one of them teachable. A node with *no* copies
    // is not in `orderedNodeIds` at all, so the empty case cannot leak in here
    // and count a node this universe has never held as untransmittable.
    if (tally.teachable > 0) teachableNodeIds.push(nodeId);
    else untransmittableNodeIds.push(nodeId);
  }

  return {
    teachThreshold: threshold,
    dormancyEvaluated: isDormant !== undefined,
    heldInstances,
    writtenInstances,
    malformedInstances,
    teachableInstances,
    maroonedInstances,
    condemnedInstances,
    teachableNodeIds,
    untransmittableNodeIds,
    byNode: nodes,
    byInstance,
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
