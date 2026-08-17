/*
 * Multiverse Mages — the telephone problem, as assertions.
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
 * `docs/design/scribing-fidelity.md` makes five claims that are checkable, and
 * they are the five `describe` blocks below. The one thing this file is careful
 * about is that each of them is stated over the **shape** of the behaviour and
 * not over the constants: `FIDELITY_PLATEAU_END` and the rest are all untuned,
 * so a test pinning `33.4%` would fail on the first tuning pass and would be
 * telling nobody anything.
 *
 * The exception is the plateau's *existence*, which is pinned hard. It is the
 * claim the design makes that a constant per-generation multiplier cannot
 * satisfy, and it is the one a future tuning pass must not be able to erase
 * without noticing.
 */

import { describe, expect, it } from 'vitest';

import { createRediscoveryClampCounter } from '@mm/primitives';
import { FP_ONE } from '@mm/sim-core';
import { HOLDER_KIND } from '@mm/state';

import {
  CORRUPTION,
  canDiscoverCorruption,
  corruptionReadBar,
  fidelityAt,
  fidelityOf,
  generationStep,
  masteryFromBook,
  readsThroughCorruption,
  scribalErrorChance,
  setFidelity,
} from '../../src/instances/fidelity.js';
import { KnowledgeSubsystem } from '../../src/instances/subsystem.js';
import { scribe } from '../../src/instances/scribing.js';
// `w/wire-magic` moved the two named store hooks out of `scribing.ts` and into
// the shared test support, where every other file in this suite already read
// them from. This import was the one left pointing at the old home.
import { STANDARD_STORE } from '../support/store-hooks.js';
import { study } from '../../src/instances/study.js';
import { research } from '../../src/instances/research.js';
import {
  ROOT_NODE,
  TEST_NODE_COUNT,
  permissiveRuleset,
  stepRng,
  testCatalog,
  testCells,
  testWorld,
} from '../support/scenario.js';

/** The shipped species table's two poles, and the baseline between them. */
const DWARF = { scribeAffinity: 1792, curiosity: 512 };
const HUMAN = { scribeAffinity: 1024, curiosity: 1152 };
const GNOME = { scribeAffinity: 896, curiosity: 1792 };
const DRACONIC = { curiosity: 256 };

interface Chain {
  readonly state: ReturnType<typeof testWorld>;
  readonly knowledge: KnowledgeSubsystem;
}

function seeded(rootSeed = 11): Chain {
  const state = testWorld(rootSeed);
  return { state, knowledge: new KnowledgeSubsystem(state, TEST_NODE_COUNT + 1) };
}

/** A mage who has researched `ROOT_NODE`, at copy generation zero. */
function originator(chain: Chain, catalog = testCatalog()) {
  const mage = chain.state.entities.create();
  const outcome = research({
    knowledge: chain.knowledge,
    catalog,
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(1, 1),
    subject: mage,
    nodeId: ROOT_NODE,
    worldTick: 1,
    progress: 0,
    effort: 1 << 20,
    learnRate: FP_ONE,
    researchRate: FP_ONE,
    rediscoveryAffinity: FP_ONE,
    clampCounter: createRediscoveryClampCounter(),
  });
  expect(outcome.completed).toBe(true);
  return mage;
}

/**
 * `rngSeed` defaults to `1`, which is the literal every call here carried
 * before — so every chain in this file draws exactly what it drew. It is a
 * parameter only because one caller below needs the draw to *vary*, and the
 * reason is written where it is used.
 */
function writeBook(
  chain: Chain,
  writer: number,
  scribeAffinity: number,
  tick: number,
  catalog = testCatalog(),
  rngSeed = 1,
) {
  return scribe({
    knowledge: chain.knowledge,
    catalog,
    cells: testCells,
    ruleset: permissiveRuleset(),
    rng: stepRng(rngSeed, tick),
    scribe: writer,
    nodeId: ROOT_NODE,
    worldTick: tick,
    store: STANDARD_STORE,
    scribeAffinity,
    scribeCapacity: 1 << 20,
    materials: 1 << 20,
    holderKind: HOLDER_KIND.mage,
    holderId: writer,
  });
}

function readBook(
  chain: Chain,
  source: number,
  curiosity: number,
  readerDeepestTier = 1,
  catalog = testCatalog(),
) {
  const reader = chain.state.entities.create();
  const outcome = study({
    knowledge: chain.knowledge,
    catalog,
    cells: testCells,
    ruleset: permissiveRuleset(),
    reader,
    source,
    worldTick: 5,
    curiosity,
    readerDeepestTier,
  });
  return { reader, outcome };
}

/**
 * Books #1..#n down a chain of copyists, each written by a reader of the last.
 *
 * **Mētis by default, not episteme.** The design names mētis as the quantity
 * that degrades, and the fixture catalog defaults to `episteme` because that is
 * the content majority — which travels at half the distance per copy and would
 * quietly need twice the rungs to say anything. A chain test that inherited the
 * fixture default would be measuring the wrong axis.
 */
const METIS = testCatalog({ knowledgeKind: 'metis' });

function telephoneChain(scribeAffinity: number, rungs: number, catalog = METIS) {
  const chain = seeded();
  let writer = originator(chain, catalog);
  const books: { copyGeneration: number; fidelity: number }[] = [];
  for (let rung = 1; rung <= rungs; rung += 1) {
    const book = writeBook(chain, writer, scribeAffinity, rung + 1, catalog);
    expect(book.refusal).toBeUndefined();
    books.push({ copyGeneration: book.copyGeneration, fidelity: fidelityAt(book.copyGeneration) });
    // Books are made sound here so the chain measures fidelity alone; scribal
    // error is a separate claim with its own block below.
    setFidelity(chain.state, book.instance, { corruption: CORRUPTION.sound });
    const { reader, outcome } = readBook(chain, book.instance, GNOME.curiosity);
    expect(outcome.refusal).toBeUndefined();
    writer = reader;
  }
  return books;
}

describe('the curve is a plateau and then a fall, not a per-generation multiplier', () => {
  it('holds full fidelity across more than one copy, then falls to zero', () => {
    // The claim a constant multiplier cannot satisfy. Pinned as a *shape*: at
    // least two full copies before any loss at all, a strictly falling middle,
    // and a floor of exactly zero -- so a tuning pass can move where the cliff
    // is and cannot delete the ledge.
    const books = telephoneChain(HUMAN.scribeAffinity, 8);

    expect(books[0]?.fidelity).toBe(FP_ONE);
    expect(books[1]?.fidelity).toBe(FP_ONE);
    expect(books[2]?.fidelity).toBeLessThan(FP_ONE);
    expect(books[books.length - 1]?.fidelity).toBe(0);

    for (let at = 1; at < books.length; at += 1) {
      expect(books[at]?.fidelity).toBeLessThanOrEqual(books[at - 1]?.fidelity ?? 0);
      expect(books[at]?.copyGeneration).toBeGreaterThan(books[at - 1]?.copyGeneration ?? 0);
    }
  });

  it('information not perfectly preserved is completely lost, given enough copies', () => {
    // The release claim, stated over every shipped species' affinity rather
    // than over one: there must be no scribe good enough to make a chain
    // survive indefinitely, or `archivist` has no ceiling after all.
    for (const affinity of [384, 640, 896, 1024, 1792]) {
      const books = telephoneChain(affinity, 24);
      expect(books[books.length - 1]?.fidelity).toBe(0);
    }
  });

  it('is exactly zero past the end, never negative', () => {
    expect(fidelityAt(1 << 20)).toBe(0);
    expect(fidelityAt(0)).toBe(FP_ONE);
  });
});

describe('scribeAffinity buys copies, which is the dwarf answer', () => {
  it('gives a better scribe a shorter step and therefore a longer chain', () => {
    expect(generationStep(DWARF.scribeAffinity, 'metis')).toBeLessThan(
      generationStep(HUMAN.scribeAffinity, 'metis'),
    );
    const dwarfBooks = telephoneChain(DWARF.scribeAffinity, 8);
    const humanBooks = telephoneChain(HUMAN.scribeAffinity, 8);
    const survivingCopies = (books: readonly { fidelity: number }[]) =>
      books.filter((book) => book.fidelity > 0).length;
    expect(survivingCopies(dwarfBooks)).toBeGreaterThan(survivingCopies(humanBooks));
  });

  it('is monotone in affinity and never free', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const affinity of [256, 384, 640, 896, 1024, 1792, 4096]) {
      const step = generationStep(affinity, 'episteme');
      expect(step).toBeLessThanOrEqual(previous);
      expect(step).toBeGreaterThan(0);
      previous = step;
    }
  });
});

describe('knowledgeKind decides how fast the chain runs', () => {
  it('costs a metis node more copy distance per scribing than an episteme one', () => {
    // The content axis becoming load-bearing. `knowledgeKind` ships on all 300
    // nodes and was read by nothing in the rules path before this.
    for (const affinity of [384, 1024, 1792]) {
      expect(generationStep(affinity, 'metis')).toBeGreaterThan(
        generationStep(affinity, 'episteme'),
      );
    }
  });

  it('leaves a metis chain dead while the same episteme chain is still perfect', () => {
    const metis = telephoneChain(HUMAN.scribeAffinity, 4, testCatalog({ knowledgeKind: 'metis' }));
    const episteme = telephoneChain(
      HUMAN.scribeAffinity,
      4,
      testCatalog({ knowledgeKind: 'episteme' }),
    );
    expect(metis[3]?.fidelity).toBeLessThan(episteme[3]?.fidelity ?? 0);
    expect(episteme[3]?.fidelity).toBe(FP_ONE);
  });
});

describe('a spent book is a worse teacher, not a brick', () => {
  it('still transmits the node at zero fidelity, at the floor', () => {
    // The design said *hard*, not impossible, and asked for the distinction to
    // survive into the implementation. A zero-fidelity book still hands over
    // the episteme -- the shape of the working -- and none of the practice.
    expect(masteryFromBook(0)).toBeGreaterThan(0);
    expect(masteryFromBook(FP_ONE)).toBeGreaterThan(masteryFromBook(0));
  });

  it('hands a reader an instance even from the last book in a dead chain', () => {
    const chain = seeded();
    let writer = originator(chain);
    let last = writeBook(chain, writer, HUMAN.scribeAffinity, 2, METIS);
    for (let rung = 0; rung < 8; rung += 1) {
      setFidelity(chain.state, last.instance, { corruption: CORRUPTION.sound });
      const { reader, outcome } = readBook(chain, last.instance, GNOME.curiosity, 1, METIS);
      expect(outcome.refusal).toBeUndefined();
      writer = reader;
      last = writeBook(chain, writer, HUMAN.scribeAffinity, rung + 3, METIS);
    }
    expect(fidelityAt(last.copyGeneration)).toBe(0);
    setFidelity(chain.state, last.instance, { corruption: CORRUPTION.sound });
    const { outcome } = readBook(chain, last.instance, GNOME.curiosity, 1, METIS);
    expect(outcome.refusal).toBeUndefined();
    expect(outcome.mastery).toBeGreaterThan(0);
  });
});

describe('corruption is hidden, discovered on use, and answered by curiosity', () => {
  it('refuses an incurious reader and repairs for a curious one', () => {
    for (const [curiosity, expected] of [
      [GNOME.curiosity, 'repaired'],
      [DRACONIC.curiosity, 'refused'],
    ] as const) {
      const chain = seeded();
      const book = writeBook(chain, originator(chain), HUMAN.scribeAffinity, 2);
      setFidelity(chain.state, book.instance, { corruption: CORRUPTION.hidden });
      const { outcome } = readBook(chain, book.instance, curiosity, 4);
      if (expected === 'repaired') {
        expect(outcome.refusal).toBeUndefined();
        expect(outcome.repaired).toBe(true);
        // And the *shelf* is mended, not only the reader served: the gnome
        // strategy is public works, not a private advantage.
        expect(fidelityOf(chain.state, book.instance).corruption).toBe(CORRUPTION.sound);
      } else {
        expect(outcome.refusal?.reason).toBe('source-corrupted');
        expect(outcome.repaired).toBe(false);
      }
    }
  });

  it('marks the text for a reader deep enough to diagnose it, and not for a novice', () => {
    for (const [deepestTier, marked] of [
      [1, true],
      [0, false],
    ] as const) {
      const chain = seeded();
      const book = writeBook(chain, originator(chain), HUMAN.scribeAffinity, 2);
      setFidelity(chain.state, book.instance, { corruption: CORRUPTION.hidden });
      const { outcome } = readBook(chain, book.instance, DRACONIC.curiosity, deepestTier);
      expect(outcome.refusal?.reason).toBe('source-corrupted');
      expect(
        outcome.refusal?.reason === 'source-corrupted' ? outcome.refusal.discovered : undefined,
      ).toBe(marked);
      expect(fidelityOf(chain.state, book.instance).corruption).toBe(
        marked ? CORRUPTION.marked : CORRUPTION.hidden,
      );
    }
  });

  it('makes the deep shelves the ones only gnomes can audit', () => {
    // The species tragedy, read off the shipped table rather than asserted:
    // dwarf is the best scribe in the game and cannot read a corrupted text at
    // any tier, while gnome can read one at every tier the content authors.
    for (let tier = 1; tier <= 6; tier += 1) {
      expect(readsThroughCorruption(GNOME.curiosity, tier)).toBe(true);
      expect(readsThroughCorruption(DWARF.curiosity, tier)).toBe(false);
      expect(readsThroughCorruption(DRACONIC.curiosity, tier)).toBe(false);
    }
    // And the bar rises with depth, which is what makes the deepest books the
    // last to be found out.
    expect(corruptionReadBar(6)).toBeGreaterThan(corruptionReadBar(1));
    expect(canDiscoverCorruption(1, 4)).toBe(false);
    expect(canDiscoverCorruption(4, 4)).toBe(true);
  });
});

describe('scribal error is the ambient source, and is small but not zero', () => {
  it('rises with tier and falls with affinity', () => {
    expect(scribalErrorChance(HUMAN.scribeAffinity, 6)).toBeGreaterThan(
      scribalErrorChance(HUMAN.scribeAffinity, 1),
    );
    expect(scribalErrorChance(DWARF.scribeAffinity, 6)).toBeLessThan(
      scribalErrorChance(384, 6),
    );
    expect(scribalErrorChance(HUMAN.scribeAffinity, 1)).toBeGreaterThan(0);
  });

  it('leaves a fresh book sound far more often than not', () => {
    // A rate high enough to be felt would drown the signal a raid is supposed
    // to leave, which is the point of the mechanic. Measured over seeds rather
    // than asserted from the constant.
    //
    // ## The seed has to reach the *draw*, and for a long time it did not
    //
    // `seeded(seed)` sets the **world's** root seed, which decides nothing here:
    // `scribe` takes its randomness from the `rng` handed in, and `writeBook`
    // handed it `stepRng(1, 2)` — a literal — on every one of the 64 turns. The
    // scribe handle is also identical each turn (`1048576`, a fresh state and
    // the same allocation order), so `actorStream(corruption, scribe)` resolved
    // to **one** cursor and `nextBounded` returned **one** ordinal. This loop
    // was taking a single draw sixty-four times and reporting it as a rate: the
    // only two answers it could ever give were 0 and 64.
    //
    // It gave 0 for as long as that one ordinal happened to sit above the
    // chance, and it gave 64 the moment the ordinal moved. What moved it is in
    // `sim-core/src/rng/streams.ts`: `corruption` was authored as stream **13**
    // and merged as **15**, because `detachment` and `career` landed in front of
    // it and the registry must stay dense from 1. A different stream id is a
    // different cursor, so the single draw changed and the "rate" went from
    // 0/64 to 64/64 without the corruption model changing at all.
    //
    // *Measured on this tree, 2026-08-17, `integration/all-branches`:*
    // `ROOT_NODE` is tier 1 and `scribalErrorChance(1024, 1)` is **16/1024**
    // (1.6%). With the seed reaching the draw the loop reports **2 of 64**
    // corrupted — a shade over the nominal rate, which is what 64 samples of a
    // 1.6% event look like. With the seed not reaching it, 64 of 64.
    let corrupted = 0;
    for (let seed = 1; seed <= 64; seed += 1) {
      const chain = seeded(seed);
      // Sixth argument: the seed reaches the roll. Without it every turn of this
      // loop is the same draw — see the note above.
      const book = writeBook(chain, originator(chain), HUMAN.scribeAffinity, 2, testCatalog(), seed);
      if (book.corrupted) corrupted += 1;
    }
    expect(corrupted).toBeLessThan(16);
  });
});
