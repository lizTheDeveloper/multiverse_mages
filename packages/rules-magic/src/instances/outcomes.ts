/*
 * Multiverse Mages — why a knowledge operation refused, and what it lost.
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
 * Refusals and loss events — the two things a knowledge operation reports that
 * are not a state change.
 *
 * ## A refusal is data, not an exception and not a boolean
 *
 * `knowledge-instances` requires refusals to *name* what stopped them: the
 * interdicted cell, the unsatisfied prerequisite, the teaching threshold, the
 * shortfall in materials. That rules out returning `false`, and it rules out
 * throwing — a mage AI at `mages-and-species` will call these operations
 * speculatively to score them, and an exception is not something you evaluate a
 * hundred of per tick.
 *
 * So a refusal is a discriminated union carrying the values the requirement
 * says it must carry, and {@link describeRefusal} renders one for a human. Two
 * consumers with genuinely different needs — a test asserting on
 * `refusal.prerequisiteId`, and a log line — and neither has to parse the
 * other's format.
 *
 * ## A loss event is emitted, never stored
 *
 * `contracts.md` §1.5 makes node existence derived — `count(instances) > 0`,
 * "nothing may cache it in state". A persisted "this node was lost" record
 * would be exactly that cache wearing a different hat, so loss events are
 * return values. The *ever-known* record is the deliberate exception, and it
 * says something a count cannot: that the node was once held at all.
 */

import type { ContentId, Fp } from '@mm/content';
import type { Handle, Tick } from '@mm/state';

/**
 * Why an operation produced no state change.
 *
 * Every member names the thing that stopped it. `reason` is a string rather
 * than a numbered enum because refusals never enter state, never cross a
 * snapshot, and never reach the observation vector — so there is nothing for a
 * stable numbering to buy, and a string is what a failing test prints.
 */
export type KnowledgeRefusal =
  /** The node's cell is not permitted here — interdicted, or off both axes. */
  | { readonly reason: 'forbidden-cell'; readonly nodeId: ContentId; readonly cellId: ContentId }
  /** The subject does not hold a usable instance of a prerequisite. */
  | {
      readonly reason: 'unsatisfied-prerequisite';
      readonly nodeId: ContentId;
      readonly prerequisiteId: ContentId;
      readonly subject: Handle;
    }
  /** The subject holds no usable instance of the node itself. */
  | { readonly reason: 'node-not-held'; readonly nodeId: ContentId; readonly subject: Handle }
  /** No instance of the node survives anywhere in this universe. */
  | { readonly reason: 'node-lost'; readonly nodeId: ContentId }
  /** The teacher's mastery is below the teaching-eligibility threshold. */
  | {
      readonly reason: 'teacher-below-threshold';
      readonly nodeId: ContentId;
      readonly mastery: Fp;
      readonly threshold: Fp;
    }
  /**
   * The subject's personal store is full at the active `store` hook's bound.
   *
   * Carries both numbers rather than one. `slotsPerMage` is the declared
   * content the requirement says must be named; `held` is what the mage
   * actually has, and the two disagreeing is the only signal that would
   * distinguish a correct refusal from an index that has lost count.
   */
  | {
      readonly reason: 'personal-store-full';
      readonly nodeId: ContentId;
      readonly subject: Handle;
      /** The `store` hook kind that declared the bound, for the message. */
      readonly storeKind: string;
      /** Instances the subject already holds at the store's personal location. */
      readonly held: number;
      /** The declared bound. `magic-traditions` requires the count be named. */
      readonly slotsPerMage: number;
    }
  /** The active `store` hook does not keep written copies. */
  | {
      readonly reason: 'written-storage-unavailable';
      readonly nodeId: ContentId;
      readonly storeKind: string;
    }
  /** Supplied materials are below the node's `scribeCost`. */
  | {
      readonly reason: 'insufficient-materials';
      readonly nodeId: ContentId;
      readonly supplied: Fp;
      readonly required: Fp;
    }
  /** Supplied scribe capacity is below what the node's tier costs to copy. */
  | {
      readonly reason: 'insufficient-scribe-capacity';
      readonly nodeId: ContentId;
      readonly supplied: Fp;
      readonly required: Fp;
    }
  /**
   * The text is silently wrong and this reader could not read through it.
   *
   * `discovered` is the half that matters and is the reason this is a refusal
   * shape of its own rather than a `node-not-held`. It says whether the reader
   * was competent enough to tell *"this book is wrong"* from *"I am not good
   * enough yet"* — see `fidelity.ts`'s `canDiscoverCorruption`. A refusal with
   * `discovered: false` is a month a novice spent and learned nothing from,
   * including about the book.
   */
  | {
      readonly reason: 'source-corrupted';
      readonly nodeId: ContentId;
      readonly subject: Handle;
      readonly source: Handle;
      /** Whether the reader could name the failure. Marks the book when true. */
      readonly discovered: boolean;
    };

/** A refusal rendered for a human. Never parsed; assert on the fields instead. */
export function describeRefusal(refusal: KnowledgeRefusal): string {
  switch (refusal.reason) {
    case 'forbidden-cell':
      return (
        `node ${String(refusal.nodeId)} sits in cell ${String(refusal.cellId)}, which this ` +
        'universe does not permit: acquisition is gated by permits(), not only casting'
      );
    case 'unsatisfied-prerequisite':
      return (
        `node ${String(refusal.nodeId)} requires node ${String(refusal.prerequisiteId)}, which ` +
        `${String(refusal.subject)} does not hold as a usable instance`
      );
    case 'node-not-held':
      return `${String(refusal.subject)} holds no usable instance of node ${String(refusal.nodeId)}`;
    case 'node-lost':
      return (
        `no instance of node ${String(refusal.nodeId)} survives in this universe, so it cannot ` +
        'be taught, scribed, or used as a prerequisite — only rediscovered'
      );
    case 'teacher-below-threshold':
      return (
        `the teacher's mastery of node ${String(refusal.nodeId)} is ${String(refusal.mastery)}, ` +
        `below the teaching-eligibility threshold of ${String(refusal.threshold)}`
      );
    case 'personal-store-full':
      return (
        `${String(refusal.subject)} already holds ${String(refusal.held)} instances at the ` +
        `"${refusal.storeKind}" store hook's personal location, which allows ` +
        `${String(refusal.slotsPerMage)} per mage, so node ${String(refusal.nodeId)} cannot be ` +
        'acquired'
      );
    case 'written-storage-unavailable':
      return (
        `the active store hook "${refusal.storeKind}" keeps no written copies, so node ` +
        `${String(refusal.nodeId)} cannot be scribed`
      );
    case 'insufficient-materials':
      return (
        `scribing node ${String(refusal.nodeId)} needs ${String(refusal.required)} materials and ` +
        `${String(refusal.supplied)} were supplied`
      );
    case 'insufficient-scribe-capacity':
      return (
        `scribing node ${String(refusal.nodeId)} needs ${String(refusal.required)} scribe ` +
        `capacity and ${String(refusal.supplied)} was supplied`
      );
    case 'source-corrupted':
      return (
        `instance ${String(refusal.source)} of node ${String(refusal.nodeId)} is corrupted and ` +
        `${String(refusal.subject)} could not read through it; the failure was ` +
        `${refusal.discovered ? 'diagnosed and the text marked' : 'silent — the reader cannot ' +
        'tell a wrong book from her own limits'}`
      );
  }
}

/**
 * A node leaving the universe, emitted when its **last** instance is destroyed.
 *
 * This is 0.3.0's first claim made observable. `location` is the location kind
 * of the instance that happened to be last, which is the difference between "an
 * archmage died" and "the library burned" — and the two are the signals
 * `knowledgeHalfLife` and `libraryDependence` are meant to separate.
 */
export interface KnowledgeLossEvent {
  readonly nodeId: ContentId;
  /** The world tick the last instance was destroyed on. */
  readonly worldTick: Tick;
  /** `LOCATION_KIND` of the destroyed instance: mind, grimoire, library, palace. */
  readonly location: number;
}
