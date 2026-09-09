/*
 * Multiverse Mages — study: reading a book back into a mind.
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
 * The edge that was missing, and without which none of the rest is reachable.
 *
 * Before this module, knowledge entered a mind by exactly three routes —
 * research, teaching, and theft — and **no route read a book.** `setLocation`
 * says so in as many words (*"or into one, which is the direction a study loop
 * will eventually want"*), and `heldMastery` says it again (*"reading one into a
 * mind is `mages-and-species`' study loop"*). A library affected a mage only as
 * research *capital*: a count of distinct nodes by tier feeding a curve, never
 * an instance anybody opened.
 *
 * That absence is why the telephone problem could not previously exist. Copy
 * distance is carried **book → mind → book**: `scribe` requires the writer to
 * hold the node in mind, so a second-generation book needs a mage who learned
 * from the first one. With no reading edge the chain is one link long, every
 * book in the game is at generation one, and the curve in `fidelity.ts` has no
 * input that ever leaves its plateau.
 *
 * It is also the only place corruption can be *discovered*. The design's whole
 * feedback loop — *"you don't know that your library is corrupted until a magic
 * user tries to read it and marks the book corrupted when they cannot"* — is a
 * statement about this function and nothing else.
 *
 * ## Three outcomes, and the middle one is the interesting one
 *
 * **Sound text.** The reader acquires the node at a mastery read off the source's
 * fidelity, and inherits the source's copy distance unchanged. Reading adds no
 * distance; *writing* does.
 *
 * **Corrupted text, curious reader.** She reads through it *and repairs it*. A
 * mage who reconstructed what the text should have said has, in doing so, the
 * corrected text; leaving the book broken behind her would make the gnome
 * strategy a personal benefit rather than a public works project, and *"go in
 * with a bunch of curious gnomes to fix the situation"* is plainly the latter.
 *
 * **Corrupted text, incurious reader.** Refused. Whether the *book* learns
 * anything from the failure is the discovery gate, and it is the reader's depth
 * that decides — which is what makes deep knowledge the most likely to be
 * silently gone.
 *
 * ## Nothing here draws
 *
 * No RNG stream, no new stream id. Every branch is a comparison against species
 * content and stored state. See `fidelity.ts` for why a roll would have been the
 * wrong model rather than merely a more expensive one.
 */

import type { Fp } from '@mm/content';
import type { Handle, Ruleset, Tick } from '@mm/state';
import { permits } from '@mm/state';

import type { PersonalStore } from '../traditions/store.js';

import type { CellResolver, NodeCatalog } from './catalog.js';
import { requireNode } from './catalog.js';
import {
  CORRUPTION,
  canDiscoverCorruption,
  fidelityAt,
  fidelityOf,
  masteryFromBook,
  readsThroughCorruption,
  setFidelity,
} from './fidelity.js';
import type { KnowledgeRefusal } from './outcomes.js';
import { personalLocationKind, personalStoreFull, unsatisfiedPrerequisite } from './research.js';
import type { KnowledgeSubsystem } from './subsystem.js';
import { isWrittenLocation } from './subsystem.js';

export interface StudyInputs {
  readonly knowledge: KnowledgeSubsystem;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  readonly ruleset: Ruleset;
  /** The mage reading. The created instance's `locationId`. */
  readonly reader: Handle;
  /** The written instance being read — grimoire- or library-located. */
  readonly source: Handle;
  readonly worldTick: Tick;
  /** Species `curiosity` (`contracts.md` §2.4). The defence against corruption. */
  readonly curiosity: Fp;
  /** The deepest tier the reader already holds. The discovery gate. */
  readonly readerDeepestTier: number;
  /** The active `store` hook: where the reader's instance lands, and how many fit. */
  readonly store?: PersonalStore;
}

export interface StudyOutcome {
  readonly refusal?: KnowledgeRefusal;
  /** The reader's new instance, or `0`. */
  readonly instance: Handle;
  /** The mastery it was created at. */
  readonly mastery: Fp;
  /** The mētis fraction the source still carried. */
  readonly fidelity: Fp;
  /** The copy distance inherited from the source. */
  readonly copyGeneration: Fp;
  /** Whether the reader read through corruption and mended the text. */
  readonly repaired: boolean;
}

/**
 * Reads a written instance into the reader's mind.
 *
 * The source is **not** consumed, moved or altered — except when it is repaired,
 * which is the one write this operation makes to anything but the new instance.
 * A book read is a book still on the shelf; `contracts.md` §1.5's "one instance
 * per written copy" is a rule about copies, and reading makes none.
 */
export function study(inputs: StudyInputs): StudyOutcome {
  if (!inputs.knowledge.isInstance(inputs.source)) {
    return refuse({ reason: 'node-lost', nodeId: 0 });
  }
  const view = inputs.knowledge.read(inputs.source);
  const nodeId = view.nodeId;

  if (!isWrittenLocation(view.locationKind)) {
    // A mind is not a text. Learning from another mage is `teach`, which has a
    // threshold, a transmission loss and a draw of its own; routing it through
    // here would be a second, cheaper teaching path with none of them.
    return refuse({ reason: 'node-not-held', nodeId, subject: inputs.source });
  }

  const node = requireNode(inputs.catalog, nodeId);
  const cellId = inputs.cells.cellOf(nodeId);
  if (!permits(inputs.ruleset, cellId)) {
    return refuse({ reason: 'forbidden-cell', nodeId, cellId });
  }

  if (inputs.knowledge.holdsHeldNode(inputs.reader, nodeId)) {
    // Already known. Not a failure worth a distinct reason: from the caller's
    // side it is the same non-event as being handed a book you wrote.
    return refuse({ reason: 'node-not-held', nodeId, subject: inputs.reader });
  }

  const missing = unsatisfiedPrerequisite(
    {
      knowledge: inputs.knowledge,
      cells: inputs.cells,
      ruleset: inputs.ruleset,
      subject: inputs.reader,
      nodeId,
    },
    node,
  );
  if (missing !== undefined) return refuse(missing);

  const full = personalStoreFull(inputs.knowledge, inputs.store, inputs.reader, nodeId);
  if (full !== undefined) return refuse(full);

  const source = fidelityOf(inputs.knowledge.state, inputs.source);
  let repaired = false;

  if (source.corruption !== CORRUPTION.sound) {
    if (!readsThroughCorruption(inputs.curiosity, node.tier)) {
      // The refusal is the same either way; what differs is whether the *world*
      // learns anything. A reader deep enough to diagnose it marks the text, and
      // that mark is the only feedback a player ever gets that a raid happened.
      const discovered = canDiscoverCorruption(inputs.readerDeepestTier, node.tier);
      if (discovered && source.corruption !== CORRUPTION.marked) {
        setFidelity(inputs.knowledge.state, inputs.source, { corruption: CORRUPTION.marked });
      }
      return refuse({
        reason: 'source-corrupted',
        nodeId,
        subject: inputs.reader,
        source: inputs.source,
        discovered,
      });
    }
    setFidelity(inputs.knowledge.state, inputs.source, { corruption: CORRUPTION.sound });
    repaired = true;
  }

  const fidelity = fidelityAt(source.copyGeneration);
  const mastery = masteryFromBook(fidelity);
  const instance = inputs.knowledge.createInstance({
    nodeId,
    locationKind: personalLocationKind(inputs.store),
    locationId: inputs.reader,
    acquiredTick: inputs.worldTick,
    mastery,
  });
  // Reading inherits the distance and adds none. The reader now knows exactly
  // what the book knew — no better, and no worse for having read rather than
  // been taught. The loss is paid at the next scribing, and only there.
  setFidelity(inputs.knowledge.state, instance, { copyGeneration: source.copyGeneration });

  return {
    instance,
    mastery,
    fidelity,
    copyGeneration: source.copyGeneration,
    repaired,
  };
}

function refuse(refusal: KnowledgeRefusal): StudyOutcome {
  return { refusal, instance: 0, mastery: 0, fidelity: 0, copyGeneration: 0, repaired: false };
}
