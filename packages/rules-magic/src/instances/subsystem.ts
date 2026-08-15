/*
 * Multiverse Mages — the knowledge subsystem: instances, existence, and loss.
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
 * The one place a knowledge instance is created or destroyed.
 *
 * ## Why every path funnels through two methods
 *
 * 0.3.0 claims that *a node ceases to exist in a universe when its last
 * instance is destroyed*. That claim is only as true as the least careful
 * caller: a mage dying, a library burning, a dormant instance decaying to
 * nothing, a grimoire crumbling and a tradition change that cannot hold a
 * written copy are five different stories, and if each maintained the index
 * itself, four of them would eventually stop. So {@link
 * KnowledgeSubsystem.createInstance} and {@link
 * KnowledgeSubsystem.destroyInstance} are the only writers, the index is
 * private, and the loss event is emitted by the destroy path rather than by
 * whoever happened to call it.
 *
 * ## What is state, what is index, and why the distinction is not cosmetic
 *
 * - **State**, and therefore snapshotted: the knowledge instances themselves,
 *   the grimoires, and the per-node **ever-known** record.
 * - **Index**, and therefore rebuilt on load: the per-node instance counts
 *   ({@link NodeExistenceIndex}, which `@mm/state` already owns) and the
 *   grimoire-to-instance association.
 *
 * `contracts.md` §1.5 is explicit that current existence is derived and
 * *"nothing may cache it in state"*, and equally explicit that ever-known is
 * *"persisted, and not derivable"*. Those two sentences look symmetrical and
 * are not. Existence can be recomputed from the instances at any moment, so a
 * stored copy can only ever be a second source of truth that a snapshot would
 * faithfully preserve in a state of disagreement. Ever-known cannot be
 * recomputed at all: once the last instance of a node is gone, nothing in the
 * world remembers it was ever there, and rediscovery — the expensive path, the
 * one carrying the release claim — becomes indistinguishable from ordinary
 * research. A derived index cannot do that job, which is why this one is a
 * component and lives in world snapshots.
 *
 * The in-memory `Set` beside it is a mirror, not the record: it exists so that
 * "have we ever known this?" is a lookup rather than a scan, and it is rebuilt
 * from the component by {@link KnowledgeSubsystem.rebuild}. A snapshot restored
 * into a fresh process therefore still costs rediscovery, which is exactly what
 * `knowledge-instances`' round-trip scenario asserts.
 */

import type { ContentId, Fp } from '@mm/content';
import type { EntityHandle, SimState } from '@mm/sim-core';
import type { Handle, KnowledgeInstanceRecord, Tick } from '@mm/state';
import {
  EVER_KNOWN,
  GRIMOIRE,
  HOLDER_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  NodeExistenceIndex,
  attachRecord,
  componentOf,
} from '@mm/state';

import type { ExclusionResolver } from './catalog.js';
import type { KnowledgeLossEvent } from './outcomes.js';

/**
 * What creating an instance needs: `contracts.md` §1.5's record, plus the link
 * to the book it is the contents of.
 *
 * **Extends `@mm/state`'s record rather than restating it.** `state-schema`
 * requires one set of world-state types, and a second declaration of the same
 * five fields is a duplicate however it is named — the field a copy adds is
 * invariably one the component layout never serializes, so it is written every
 * tick and absent from every snapshot. `grimoire` is genuinely not part of §1.5
 * and genuinely not serialized: it feeds the subsystem index, which is exactly
 * where §1.5 says that association belongs.
 */
export interface InstanceSpec extends KnowledgeInstanceRecord {
  /**
   * The grimoire this instance is the contents of. **Required** for a written
   * copy and forbidden for a held one — see {@link KnowledgeSubsystem.createInstance}.
   */
  readonly grimoire?: Handle;
}

/** Location kinds a mage carries in their own head. Only these decay, and only these teach. */
export function isHeldLocation(locationKind: number): boolean {
  return locationKind === LOCATION_KIND.mind || locationKind === LOCATION_KIND.palace;
}

/** Location kinds that are a written copy, and therefore have a grimoire behind them. */
export function isWrittenLocation(locationKind: number): boolean {
  return locationKind === LOCATION_KIND.grimoire || locationKind === LOCATION_KIND.library;
}

/**
 * Where the one instance of a written copy sits, given who holds the book.
 *
 * `contracts.md` §1.5 states the pairing as a rule about *holders*, not about
 * call sites: grimoire kind while a mage holds the book, carries it, or nobody
 * owns it, and library kind while it is shelved. So this is a function of the
 * grimoire's own `holderKind`/`holderId`, and every writer of those two fields
 * derives the instance's location from it rather than choosing one.
 *
 * It is one function rather than a convention because the two halves
 * disagreeing is not a visible failure. A book whose record says *shelved in
 * library 900* paired with an instance that says *in a mage's hands* throws
 * nothing and reads nowhere: the library measures its shelves at nothing,
 * `grimoiresIn` cannot see it, `destroyLibrary` leaves it standing, and a
 * universe razes a university's collection without losing a single node —
 * which makes `libraryDependence` and `knowledgeHalfLife` understate loss in
 * the reassuring direction, the one direction a warning metric must never take.
 */
export function writtenInstanceLocation(
  grimoire: Handle,
  holderKind: number,
  holderId: Handle,
): { readonly locationKind: number; readonly locationId: Handle } {
  if (holderKind === HOLDER_KIND.library) {
    return { locationKind: LOCATION_KIND.library, locationId: holderId };
  }
  return { locationKind: LOCATION_KIND.grimoire, locationId: grimoire };
}

export class KnowledgeSubsystem {
  readonly #state: SimState;
  readonly #existence: NodeExistenceIndex;

  /**
   * Mirror of the `ever-known` component. Never cleared, never trusted over the
   * component — {@link rebuild} discards and re-reads it.
   */
  #everKnown = new Set<ContentId>();

  /**
   * `contracts.md` §1.5: *"the grimoire-to-library association lives in a
   * subsystem index, not in a second instance record."* This is that index, and
   * the reason it is not a state field is that a state field would be a second
   * place a written copy is recorded — the double-count that makes
   * `libraryDependence` lie in the safe direction, which is the worst direction
   * for a metric whose only job is to warn.
   */
  #instanceOfGrimoire = new Map<Handle, Handle>();
  /**
   * The authored anti-requisites, or `undefined` when content declares none.
   *
   * Optional so that every existing construction site — and every hand-built
   * test world — keeps the behaviour it was written against. An absent resolver
   * is not "no exclusions found", it is "this subsystem was built by a caller
   * that does not know about exclusions", and the two must not be told apart by
   * a silent default that starts destroying instances.
   */
  #exclusions: ExclusionResolver | undefined;

  /**
   * Who holds what, in mind or memory palace: holder, to node id, to how many
   * instances of that node the holder carries.
   *
   * **A second derived index, and it is here for the reason the first one is.**
   * *"Does this mage hold this node?"* is what the prerequisite check asks, and
   * `research` asks it once per prerequisite per mage per world tick. Answered
   * by walking {@link instancesHeldBy} it costs a pass over every instance in
   * the universe, an array, and a record object per row — so a universe with a
   * thousand mages and ten thousand instances paid millions of reads a tick for
   * a question whose answer is one bit. It was the single largest cost in a
   * profiled two-hundred-year run: forty-eight per cent of it.
   *
   * A **count**, not a set. A mage can hold two instances of one node — raid
   * theft puts one there, and {@link instancesHeldBy} says as much already — and
   * a set would forget the node when the first of the two was destroyed, which
   * is a prerequisite vanishing from under a project that is still perfectly
   * legal, with nothing thrown and nothing logged.
   *
   * Nothing iterates it, so no rule can come to depend on the order a hash map
   * happens to hold its keys in. It answers membership and nothing else, and
   * {@link rebuild} discards and re-derives it exactly as it does the existence
   * index — so a snapshot loaded into a fresh process is indexed from what state
   * says rather than from what some earlier process remembered.
   */
  #heldByHolder = new Map<Handle, Map<ContentId, number>>();

  /**
   * @param state - The world state. Must carry `@mm/state`'s §1 components.
   * @param nodeCount - Node ids the loaded content declares, `1..nodeCount`.
   */
  constructor(state: SimState, nodeCount: number, exclusions?: ExclusionResolver) {
    this.#state = state;
    this.#existence = new NodeExistenceIndex(nodeCount);
    this.#exclusions = exclusions;
  }

  /**
   * A subsystem over a state that already holds instances — the load path.
   *
   * Every index this class keeps is rebuilt from the state it is handed, so a
   * snapshot written by an older build, or by a build with a bug in this file,
   * loads correctly and is repaired by the act of loading.
   */
  static fromState(
    state: SimState,
    nodeCount: number,
    exclusions?: ExclusionResolver,
  ): KnowledgeSubsystem {
    const subsystem = new KnowledgeSubsystem(state, nodeCount, exclusions);
    subsystem.rebuild();
    return subsystem;
  }

  /** The world state this subsystem indexes. */
  get state(): SimState {
    return this.#state;
  }

  /** Whether the universe currently holds at least one instance of a node. */
  exists(nodeId: ContentId): boolean {
    return this.#existence.exists(nodeId);
  }

  /** Live instances of a node. `contracts.md` §1.5's derived existence, as a count. */
  instanceCount(nodeId: ContentId): number {
    return this.#existence.instanceCount(nodeId);
  }

  /** Nodes surviving on exactly one instance — §7's `libraryDependence`. */
  singleInstanceNodes(): ContentId[] {
    return this.#existence.singleInstanceNodes();
  }

  /** Nodes with at least one instance, ascending. */
  knownNodes(): ContentId[] {
    return this.#existence.knownNodes();
  }

  /**
   * Whether this universe has *ever* held an instance of a node.
   *
   * The distinction rediscovery is built on. `false` means ordinary research;
   * `true` with no surviving instance means the node was lost and re-deriving
   * it costs at least three times what discovering it did.
   */
  wasEverKnown(nodeId: ContentId): boolean {
    return this.#everKnown.has(nodeId);
  }

  /** The instance a grimoire holds, or `0` if the index knows of none. */
  instanceForGrimoire(grimoire: Handle): Handle {
    return this.#instanceOfGrimoire.get(grimoire) ?? 0;
  }

  /** The grimoire an instance is the contents of, or `0`. The inverse lookup. */
  grimoireHolding(instance: Handle): Handle {
    for (const [grimoire, held] of this.#instanceOfGrimoire) {
      if (held === instance) return grimoire;
    }
    return 0;
  }

  /**
   * A knowledge instance's fields. Throws on a handle carrying no instance.
   *
   * The row is resolved once and the five columns indexed directly, rather than
   * five `get` calls each re-resolving the same handle through the sparse map.
   * The decay sweep calls this once per instance per world tick, so the four
   * saved lookups are four per instance per tick for the length of a run.
   */
  read(instance: Handle): KnowledgeInstanceRecord {
    const store = componentOf(this.#state, KNOWLEDGE_INSTANCE);
    const row = store.rowOf(instance as EntityHandle);
    return {
      nodeId: store.field('nodeId')[row] as number,
      locationKind: store.field('locationKind')[row] as number,
      locationId: store.field('locationId')[row] as number,
      acquiredTick: store.field('acquiredTick')[row] as number,
      mastery: store.field('mastery')[row] as number,
    };
  }

  /** Whether a handle names a live knowledge instance. */
  isInstance(instance: Handle): boolean {
    return componentOf(this.#state, KNOWLEDGE_INSTANCE).has(instance as EntityHandle);
  }

  /** Overwrites an instance's mastery. Callers clamp; this does not. */
  setMastery(instance: Handle, mastery: Fp): void {
    componentOf(this.#state, KNOWLEDGE_INSTANCE).set(instance as EntityHandle, 'mastery', mastery);
  }

  /**
   * Rewrites where an instance lives, leaving the instance count untouched.
   *
   * This is how shelving and withdrawal are expressed: `contracts.md` §1.5
   * requires *one* instance per written copy, moving between `(2, grimoireId)`
   * and `(3, libraryId)`, rather than a second instance appearing on a shelf.
   */
  setLocation(instance: Handle, locationKind: number, locationId: Handle): void {
    const store = componentOf(this.#state, KNOWLEDGE_INSTANCE);
    const handle = instance as EntityHandle;
    // Read before the write. An instance moving out of a mind — or into one,
    // which is the direction a study loop will eventually want — has to leave
    // the held index it was in before it joins the one it is going to. Here
    // rather than at the call sites, for the reason create and destroy are here:
    // a mover that forgot would leave a mage reading a prerequisite she no
    // longer holds, or unable to read one she does.
    const previousKind = store.get(handle, 'locationKind');
    if (isHeldLocation(previousKind)) {
      this.#unholdNode(store.get(handle, 'locationId'), store.get(handle, 'nodeId'));
    }
    store.set(handle, 'locationKind', locationKind);
    store.set(handle, 'locationId', locationId);
    if (isHeldLocation(locationKind)) {
      this.#holdNode(locationId, store.get(handle, 'nodeId'));
    }
  }

  /**
   * Creates an instance, counts it, and records the node as ever-known.
   *
   * The ever-known write happens here rather than at each acquisition site
   * because "first instance" is a fact about the index, not about which
   * operation happened to produce it — founding grants, research, teaching,
   * scribing and raid theft all make a node known, and a site that forgot would
   * make that node rediscoverable at ordinary cost forever after.
   *
   * @throws RangeError if a written copy arrives without its grimoire, if a
   * held instance arrives with one, or if a written copy's location disagrees
   * with the holder its own grimoire records. The pairing is the invariant the
   * grimoire-to-instance index exists to maintain, and an unpaired written copy
   * is an instance that can never be burned.
   */
  createInstance(spec: InstanceSpec): Handle {
    const written = isWrittenLocation(spec.locationKind);
    if (written && (spec.grimoire === undefined || spec.grimoire === 0)) {
      throw new RangeError(
        `A knowledge instance at location kind ${String(spec.locationKind)} is a written copy and ` +
          'must name the grimoire it is the contents of. contracts.md §1.5 keeps exactly one ' +
          'instance per written copy, associated through a subsystem index.',
      );
    }
    if (!written && spec.grimoire !== undefined) {
      throw new RangeError(
        `A knowledge instance at location kind ${String(spec.locationKind)} is held in a mind, not ` +
          'written, so it has no grimoire. Passing one would put a book in someone’s memory.',
      );
    }
    const disagreement = this.#holderDisagreement(spec);
    if (disagreement !== '') throw new RangeError(disagreement);

    // `vision.md` §4b, at the one place all five acquisition paths meet. See
    // `test/unit/exclusions.test.ts` for why it is here and not on the frontier:
    // raid theft writes straight into a thief's mind and would otherwise
    // launder the exclusion.
    const conflicting = this.#conflictingHoldings(spec);
    if (conflicting === 'refused') return 0;
    for (const instance of conflicting) this.destroyInstance(instance, spec.acquiredTick);

    const handle = this.#state.entities.create();
    attachRecord(this.#state, KNOWLEDGE_INSTANCE, handle, {
      nodeId: spec.nodeId,
      locationKind: spec.locationKind,
      locationId: spec.locationId,
      acquiredTick: spec.acquiredTick,
      mastery: spec.mastery,
    });

    this.#existence.add(spec.nodeId);
    this.#markEverKnown(spec.nodeId);
    if (isHeldLocation(spec.locationKind)) this.#holdNode(spec.locationId, spec.nodeId);
    if (spec.grimoire !== undefined) this.#instanceOfGrimoire.set(spec.grimoire, handle);
    return handle;
  }

  /**
   * Destroys an instance and reports the node leaving the universe, if it did.
   *
   * The single destroy path. Everything that can take knowledge away — a
   * holder's death, a burned library, a decayed dormant instance, a crumbling
   * grimoire — routes through here, which is what makes the 0.3.0 loss claim
   * testable in one place rather than in five.
   *
   * **The book goes with its contents.** A written instance is not stored *in*
   * a grimoire, it *is* the grimoire's contents — §1.5 keeps exactly one per
   * written copy — so destroying it and leaving the `GRIMOIRE` row behind
   * leaves an object nothing can ever open, burn, or shelve, and one that will
   * claim the next same-node instance on that shelf when the world is next
   * loaded. That is why the entity is destroyed here rather than by each
   * caller: unlinking the index and destroying the row are the same act, and a
   * caller that did only the first would be indistinguishable from one that
   * remembered.
   *
   * @returns the loss event when this was the node's last instance, and
   * `undefined` otherwise. Losing one of several copies is not a loss, and
   * emitting an event for it would drown the signal `knowledgeHalfLife` reads.
   */
  destroyInstance(instance: Handle, worldTick: Tick): KnowledgeLossEvent | undefined {
    const view = this.read(instance);
    this.#existence.remove(view.nodeId);
    if (isHeldLocation(view.locationKind)) this.#unholdNode(view.locationId, view.nodeId);

    for (const [grimoire, held] of this.#instanceOfGrimoire) {
      if (held === instance) {
        this.#instanceOfGrimoire.delete(grimoire);
        this.#state.entities.destroy(grimoire as EntityHandle);
        break;
      }
    }

    this.#state.entities.destroy(instance as EntityHandle);

    if (this.#existence.instanceCount(view.nodeId) > 0) return undefined;
    return { nodeId: view.nodeId, worldTick, location: view.locationKind };
  }

  /**
   * Every live instance in the universe, in ascending slot order.
   *
   * Not `#collect(() => true)`: that builds a five-field view of every row to
   * hand to a predicate that ignores it. The decay sweep asks for this list
   * every world tick and reads each row itself, so the views were an object per
   * instance per tick that nothing ever looked at.
   */
  instances(): Handle[] {
    const store = componentOf(this.#state, KNOWLEDGE_INSTANCE);
    const found: Handle[] = [];
    store.forEach((_row, handle) => {
      found.push(handle);
    });
    return found;
  }

  /** Every live instance of a node, in ascending slot order. */
  instancesOf(nodeId: ContentId): Handle[] {
    return this.#collect((view) => view.nodeId === nodeId);
  }

  /**
   * Whether a holder carries a node in mind or memory palace.
   *
   * Exactly {@link instancesHeldBy} filtered to one node and asked whether
   * anything came back — the question `holdsUsable` asks — answered from
   * {@link #heldByHolder} in constant time instead of by the pass that made
   * that check the most expensive thing in a world tick. It reports membership
   * and nothing else: mastery, dormancy, and which of two copies is the better
   * one are separate questions, and none of them can be answered without
   * reading rows.
   */
  holdsHeldNode(holder: Handle, nodeId: ContentId): boolean {
    return (this.#heldByHolder.get(holder)?.get(nodeId) ?? 0) > 0;
  }

  /**
   * Every instance a mage carries in mind or memory palace.
   *
   * Ascending slot order, never insertion order: rows move under swap-removal,
   * so anything ordered by row would depend on the destruction history rather
   * than on what the world is — which is a desync between two peers that agree
   * on every value.
   */
  instancesHeldBy(subject: Handle): Handle[] {
    return this.#collect(
      (view) => isHeldLocation(view.locationKind) && view.locationId === subject,
    );
  }

  /** Every instance at one location, of one kind. */
  instancesAt(locationKind: number, locationId: Handle): Handle[] {
    return this.#collect(
      (view) => view.locationKind === locationKind && view.locationId === locationId,
    );
  }

  /**
   * Destroys everything a mage held. The mortality path, and the reason
   * `store: palace` is a meaningfully harsher tradition.
   */
  destroyInstancesHeldBy(subject: Handle, worldTick: Tick): KnowledgeLossEvent[] {
    return this.destroyAll(this.instancesHeldBy(subject), worldTick);
  }

  /** Destroys a list of instances, collecting the nodes it emptied. */
  destroyAll(instances: readonly Handle[], worldTick: Tick): KnowledgeLossEvent[] {
    const lost: KnowledgeLossEvent[] = [];
    for (const instance of instances) {
      const event = this.destroyInstance(instance, worldTick);
      if (event !== undefined) lost.push(event);
    }
    return lost;
  }

  /**
   * Rebuilds every index from the state.
   *
   * Called on load, and available as a repair.
   *
   * **The shelved-grimoire pairing is reconstructed, not read.** An unshelved
   * written instance names its grimoire directly, at `(2, grimoireId)`, so that
   * pair is a fact in state. A shelved one names the *library*, at
   * `(3, libraryId)`, and §1.5 forbids putting the grimoire back in a state
   * field — the association is required to live in a subsystem index. So the
   * pair is recovered by matching each shelved grimoire against an unclaimed
   * instance of the same node in the library its `holderId` names, in ascending
   * slot order on both sides.
   *
   * That is deterministic, and it is exact except in one case: two grimoires of
   * the *same node* shelved in the *same library*, where nothing in state
   * distinguishes which instance came from which book. The reconstruction may
   * swap them. Both are copies of one node in one place with mastery `0` — a
   * later burn destroys one of two identical rows either way, and the instance
   * count, the library's depth, and every loss event are unchanged. The
   * observable difference is confined to `acquiredTick`. This is recorded as a
   * gap in `contracts.md` §1.5 rather than closed by adding the state field §1.5
   * rules out.
   *
   * **A book left without contents does not survive the load.** The pass after
   * the relinking discards it, for the reasons given on that method.
   */
  rebuild(): void {
    const store = componentOf(this.#state, KNOWLEDGE_INSTANCE);
    const nodeIds = store.field('nodeId');
    this.#existence.rebuildFrom((yieldNodeId) => {
      store.forEach((row) => {
        yieldNodeId(nodeIds[row] as number);
      });
    });

    this.#instanceOfGrimoire = new Map();
    this.#heldByHolder = new Map();
    const locationKinds = store.field('locationKind');
    const locationIds = store.field('locationId');
    store.forEach((row, handle) => {
      const locationKind = locationKinds[row] as number;
      if (locationKind === LOCATION_KIND.grimoire) {
        this.#instanceOfGrimoire.set(locationIds[row] as number, handle);
      }
      if (isHeldLocation(locationKind)) {
        this.#holdNode(locationIds[row] as number, nodeIds[row] as number);
      }
    });
    this.#relinkShelvedGrimoires();
    this.#discardContentlessGrimoires();

    this.#everKnown = new Set();
    const everKnown = componentOf(this.#state, EVER_KNOWN);
    const everKnownNodes = everKnown.field('nodeId');
    everKnown.forEach((row) => {
      this.#everKnown.add(everKnownNodes[row] as number);
    });
  }

  /**
   * Re-links a grimoire to its instance.
   *
   * `location.ts` uses this when shelving moves an instance off the grimoire's
   * own handle; {@link rebuild} uses it on load. Exposed rather than private
   * because a raid depositing a looted book is the same operation, and it will
   * arrive from `rules-raid`.
   */
  linkGrimoire(grimoire: Handle, instance: Handle): void {
    this.#instanceOfGrimoire.set(grimoire, instance);
  }

  /**
   * Pairs shelved books with shelved instances: one pass over each side.
   *
   * The matching rule is the one the {@link rebuild} note states — for each
   * shelved grimoire in ascending slot order, the first unclaimed instance of
   * the same node in the same library, also in ascending slot order — and it is
   * unchanged. What changed is the cost. Asking `instancesAt` per grimoire
   * re-scanned every instance in the universe once per book, so a load was
   * `shelvedGrimoires × instances`: invisible for as long as nothing was ever
   * shelved, and quadratic from the tick something was. The world loop rebuilds
   * a subsystem *every tick*, so that was not a load-time cost.
   *
   * So the candidates are bucketed once by `(library, node)`, each bucket in
   * ascending slot order, and a match takes the next one in its bucket. The
   * cursor is what makes a bucket its own `claimed` set; instances the direct
   * `(2, grimoireId)` pass already claimed are at a grimoire location and so are
   * never bucketed at all. A cursor rather than `shift`, because one library
   * holding four hundred copies of one node is the ordinary case this loop meets
   * and repeatedly shifting that array is the same quadratic in a smaller hat.
   */
  #relinkShelvedGrimoires(): void {
    const store = componentOf(this.#state, KNOWLEDGE_INSTANCE);
    const locationKinds = store.field('locationKind');
    const locationIds = store.field('locationId');
    const instanceNodes = store.field('nodeId');

    const unclaimed = new Map<string, { items: Handle[]; next: number }>();
    store.forEach((row, handle) => {
      if ((locationKinds[row] as number) !== LOCATION_KIND.library) return;
      const key = shelfKey(locationIds[row] as number, instanceNodes[row] as number);
      const bucket = unclaimed.get(key);
      if (bucket === undefined) unclaimed.set(key, { items: [handle as Handle], next: 0 });
      else bucket.items.push(handle as Handle);
    });

    const grimoires = componentOf(this.#state, GRIMOIRE);
    const grimoireNodes = grimoires.field('nodeId');
    const holderKinds = grimoires.field('holderKind');
    const holderIds = grimoires.field('holderId');

    grimoires.forEach((row, grimoire) => {
      if ((holderKinds[row] as number) !== HOLDER_KIND.library) return;
      if (this.#instanceOfGrimoire.has(grimoire)) return;
      const bucket = unclaimed.get(
        shelfKey(holderIds[row] as number, grimoireNodes[row] as number),
      );
      if (bucket === undefined || bucket.next >= bucket.items.length) return;
      this.#instanceOfGrimoire.set(grimoire, bucket.items[bucket.next] as Handle);
      bucket.next += 1;
    });
  }

  /**
   * Destroys every grimoire the rebuild could not pair with an instance.
   *
   * A grimoire without contents is not a state this package can reach: scribing
   * makes the pair, shelving and withdrawal move it, and {@link
   * destroyInstance} takes both away together. It arrives only from a snapshot
   * written by a build that did not, and `location.ts` already calls it "a book
   * whose contents nothing can destroy" when it refuses to shelve one. Loading
   * is where this class repairs what it is handed, so this is where the row
   * goes.
   *
   * Discarding it is not cosmetic tidying. Left in place, a contentless
   * library-held grimoire is matched by the pass above against *any* unclaimed
   * instance of its node in its library, and being the older row it matches
   * first — so it takes a later book's instance and leaves the real book paired
   * with nothing, at which point burning that book throws instead of burning
   * it. The pairing ambiguity that pass documents is confined to `acquiredTick`;
   * this one decides whether a book can be destroyed at all.
   *
   * **What the repair cannot recover** is which grimoire handle survives. When
   * two books of one node sit in one library and only one has contents, state
   * holds nothing that says which — the rows differ only in `durability`, which
   * is a roll, not a link. So the pass above pairs the first row and this one
   * discards the second, and a caller holding the discarded handle across the
   * load sees its book gone rather than its book empty. Every count, every
   * loss event and every burn is right afterward; one opaque handle is not the
   * one it was. Closing that would take the state field §1.5 rules out.
   */
  #discardContentlessGrimoires(): void {
    const grimoires = componentOf(this.#state, GRIMOIRE);
    const contentless: EntityHandle[] = [];
    grimoires.forEach((_row, grimoire) => {
      if (!this.#instanceOfGrimoire.has(grimoire)) contentless.push(grimoire);
    });
    // Collected first: destroying a row while iterating its component moves
    // another row into the slot just visited.
    for (const grimoire of contentless) this.#state.entities.destroy(grimoire);
  }

  /**
   * Names the disagreement between a written instance's location and the holder
   * its own grimoire records, or `''` when the two agree.
   *
   * Checked only for a grimoire that carries a §1.5 record. A bare handle is an
   * opaque token this subsystem has been asked to associate — `rules-raid` will
   * pass one for a looted book before the record follows — and there is nothing
   * for it to disagree with.
   */
  #holderDisagreement(spec: InstanceSpec): string {
    if (spec.grimoire === undefined) return '';
    const grimoires = componentOf(this.#state, GRIMOIRE);
    const handle = spec.grimoire as EntityHandle;
    if (!grimoires.has(handle)) return '';

    const expected = writtenInstanceLocation(
      spec.grimoire,
      grimoires.get(handle, 'holderKind'),
      grimoires.get(handle, 'holderId'),
    );
    if (
      spec.locationKind === expected.locationKind &&
      spec.locationId === expected.locationId
    ) {
      return '';
    }
    return (
      `Grimoire ${String(spec.grimoire)} records holder kind ` +
      `${String(grimoires.get(handle, 'holderKind'))}, so contracts.md §1.5 puts its instance at ` +
      `location (${String(expected.locationKind)}, ${String(expected.locationId)}), not ` +
      `(${String(spec.locationKind)}, ${String(spec.locationId)}). A written copy whose location ` +
      'disagrees with its book is on a shelf the library cannot see.'
    );
  }

  #collect(matches: (view: KnowledgeInstanceRecord) => boolean): Handle[] {
    const store = componentOf(this.#state, KNOWLEDGE_INSTANCE);
    const nodeIds = store.field('nodeId');
    const locationKinds = store.field('locationKind');
    const locationIds = store.field('locationId');
    const acquiredTicks = store.field('acquiredTick');
    const masteries = store.field('mastery');
    const found: Handle[] = [];
    store.forEach((row, handle) => {
      const view: KnowledgeInstanceRecord = {
        nodeId: nodeIds[row] as number,
        locationKind: locationKinds[row] as number,
        locationId: locationIds[row] as number,
        acquiredTick: acquiredTicks[row] as number,
        mastery: masteries[row] as number,
      };
      if (matches(view)) found.push(handle);
    });
    return found;
  }

  /**
   * What this acquisition conflicts with, per `vision.md` §4b.
   *
   * Returns `'refused'` when the acquisition may not happen at all, and
   * otherwise the instances that must be destroyed for it to proceed — empty in
   * the ordinary case, which is every acquisition in a universe whose content
   * authors no exclusions.
   *
   * **Only held locations are checked.** §4b excludes what a *mage* may hold; a
   * library is an institution, and a civilization keeping both books is the
   * thing §4b says a civilization is *for*. Checking shelves would make the
   * first authored exclusion start burning archives nobody ever learned from.
   */
  #conflictingHoldings(spec: InstanceSpec): readonly Handle[] | 'refused' {
    const resolver = this.#exclusions;
    if (resolver === undefined) return [];
    if (!isHeldLocation(spec.locationKind)) return [];

    const held = this.#heldByHolder.get(spec.locationId);
    if (held === undefined || held.size === 0) return [];

    const excluded = resolver.excludedBy(resolver.cellOf(spec.nodeId));
    if (excluded.length === 0) return [];

    const doomed: Handle[] = [];
    for (const exclusion of excluded) {
      for (const nodeId of held.keys()) {
        if (resolver.cellOf(nodeId) !== exclusion.cell) continue;
        if (exclusion.resolution === 'refused') return 'refused';
        // Every instance of the excluded body of magic this holder carries, not
        // merely the first: an exclusion that left her a second copy of the
        // school she just gave up would not be an exclusion.
        doomed.push(...this.instancesHeldBy(spec.locationId).filter(
          (instance) => this.read(instance).nodeId === nodeId,
        ));
      }
    }
    return doomed;
  }

  #holdNode(holder: Handle, nodeId: ContentId): void {
    let held = this.#heldByHolder.get(holder);
    if (held === undefined) {
      held = new Map<ContentId, number>();
      this.#heldByHolder.set(holder, held);
    }
    held.set(nodeId, (held.get(nodeId) ?? 0) + 1);
  }

  /**
   * Drops one instance from the held index, and the holder with her last one.
   *
   * The empty map is deleted rather than left behind: a universe that runs for
   * two centuries kills every mage in it several times over, and a residue of
   * empty maps keyed on the dead grows with the length of the run — which is the
   * one axis a balance sweep pushes hardest.
   */
  #unholdNode(holder: Handle, nodeId: ContentId): void {
    const held = this.#heldByHolder.get(holder);
    if (held === undefined) return;
    const remaining = (held.get(nodeId) ?? 0) - 1;
    if (remaining > 0) held.set(nodeId, remaining);
    else held.delete(nodeId);
    if (held.size === 0) this.#heldByHolder.delete(holder);
  }

  #markEverKnown(nodeId: ContentId): void {
    if (this.#everKnown.has(nodeId)) return;
    this.#everKnown.add(nodeId);
    const handle = this.#state.entities.create();
    attachRecord(this.#state, EVER_KNOWN, handle, { nodeId });
  }
}

/**
 * The bucket a shelved copy belongs to: its library and its node.
 *
 * A string rather than a nested map because the two parts are handles and a
 * numeric pairing would need a bound on either one that nothing here has. It is
 * built and discarded inside one rebuild, never stored and never hashed.
 */
function shelfKey(library: Handle, nodeId: ContentId): string {
  return `${String(library)}:${String(nodeId)}`;
}
