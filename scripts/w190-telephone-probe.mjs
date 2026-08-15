/*
 * Multiverse Mages — W190: the telephone problem, measured.
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
 * ## Why this is an instrument and not a sweep column
 *
 * The claim to establish is *"information not perfectly preserved is completely
 * lost after enough generations."* That is a statement about a **chain** —
 * mind, book, mind, book — and no shipped measure can see one. §4.1's
 * observation carries three knowledge channels per cell (nodes known, deepest
 * tier, instance count) and none of them is copy distance, so a sweep cannot
 * distinguish a library of pristine texts from a library of exhausted ones. It
 * is the same blindness `w99-teachability-probe.mjs` was written for, one field
 * further along.
 *
 * So this drives the chain directly: research a node into a mind, scribe it,
 * read the book into a second mind, scribe *that*, and so on, recording the
 * mētis fraction and the mastery a reader takes away at each rung. Every step
 * goes through the production functions — `research`, `scribe`, `study` — never
 * through a hand-written fidelity number.
 *
 * ## What it varies
 *
 * Six species by their shipped `scribeAffinity` and `curiosity`, and both
 * authored `knowledgeKind` values. Seeds vary the scribing draw (stream 5,
 * durability) and the research jitter (stream 3); neither the curve nor the
 * corruption checks draw at all, which is the point of the second table — the
 * species split on recovery is byte-identical across seeds *by construction*,
 * and that is reported rather than assumed.
 *
 *     node scripts/w190-telephone-probe.mjs [seeds] [rungs]
 */

import { readFileSync } from 'node:fs';

import {
  CORRUPTION,
  KnowledgeSubsystem,
  STANDARD_STORE,
  canDiscoverCorruption,
  catalogOf,
  corruptionReadBar,
  fidelityAt,
  fidelityOf,
  masteryFromBook,
  readsThroughCorruption,
  research,
  scribe,
  setFidelity,
  study,
} from '../packages/rules-magic/dist/index.js';
import { HOLDER_KIND, defineWorldStateSchema } from '../packages/state/dist/index.js';
import { createState, rngFromRootSeed } from '../packages/sim-core/dist/index.js';

const SEED_COUNT = Number.parseInt(process.argv[2] ?? '4', 10);
const RUNGS = Number.parseInt(process.argv[3] ?? '10', 10);

/** Common random numbers: the same run seeds under every species and kind. */
const SEEDS = Array.from({ length: SEED_COUNT }, (_, n) => 20260814 + (n + 1) * 7919);

const SPECIES = JSON.parse(
  readFileSync(new URL('../packages/content/data/species.json', import.meta.url), 'utf8'),
);

const NODE = 1;
const CELL = 1;
const TIER = 3;

const cells = { cellOf: () => CELL };
const ruleset = { permittedTechniques: 1 << 0, permittedForms: 1 << 0, edicts: [] };

function catalogFor(knowledgeKind) {
  return catalogOf([
    {
      nodeId: NODE,
      tier: TIER,
      prerequisites: [],
      researchCost: 1024,
      teachCost: 1024,
      scribeCost: 1,
      rediscoveryMultiplier: 1024,
      knowledgeKind,
    },
  ]);
}

function rngFor(rootSeed, tick) {
  const source = rngFromRootSeed(rootSeed);
  return {
    stream: (subsystem) => source.stream(subsystem, tick),
    actorStream: (subsystem, actorKey) => source.actorStream(subsystem, tick, actorKey),
  };
}

/**
 * One telephone chain: a researcher, then `rungs` alternations of scribe-and-read.
 *
 * Each rung uses a **fresh mage**, because a mage who already holds the node is
 * refused by `study` — correctly, and it is also the fiction: the chain is a
 * lineage of copyists, not one scholar rereading her own work.
 */
function runChain({ seed, species, knowledgeKind, rungs }) {
  const state = createState({ schema: defineWorldStateSchema(), rootSeed: seed });
  const knowledge = new KnowledgeSubsystem(state, NODE + 1);
  const catalog = catalogFor(knowledgeKind);

  const originator = state.entities.create();
  const researched = research({
    knowledge,
    catalog,
    cells,
    ruleset,
    rng: rngFor(seed, 1),
    subject: originator,
    nodeId: NODE,
    worldTick: 1,
    progress: 0,
    effort: 1 << 20,
    learnRate: 1024,
    researchRate: 1024,
    rediscoveryAffinity: 1024,
  });
  if (!researched.completed) throw new Error('the fixture researcher failed to finish');

  const rows = [];
  let writer = originator;
  for (let rung = 1; rung <= rungs; rung += 1) {
    const written = scribe({
      knowledge,
      catalog,
      cells,
      ruleset,
      rng: rngFor(seed, rung + 1),
      scribe: writer,
      nodeId: NODE,
      worldTick: rung + 1,
      store: STANDARD_STORE,
      scribeAffinity: species.scribeAffinity,
      scribeCapacity: 1 << 20,
      materials: 1 << 20,
      holderKind: HOLDER_KIND.mage,
      holderId: writer,
    });
    if (written.refusal !== undefined) throw new Error(`scribing refused: ${written.refusal.reason}`);

    const reader = state.entities.create();
    const read = study({
      knowledge,
      catalog,
      cells,
      ruleset,
      reader,
      source: written.instance,
      worldTick: rung + 1,
      curiosity: species.curiosity,
      readerDeepestTier: TIER,
    });
    if (read.refusal !== undefined) throw new Error(`study refused: ${read.refusal.reason}`);

    rows.push({
      rung,
      copyGeneration: written.copyGeneration,
      fidelity: fidelityAt(written.copyGeneration),
      masteryToReader: read.mastery,
    });
    writer = reader;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Table 1: the mētis fraction against copy generation.
// ---------------------------------------------------------------------------

const pct = (fp) => `${((fp * 100) / 1024).toFixed(1)}%`;

console.log('# W190 — the telephone problem');
console.log(`\nseeds: ${SEEDS.join(', ')}    rungs: ${RUNGS}    node tier ${TIER}`);

for (const knowledgeKind of ['metis', 'episteme']) {
  console.log(`\n## ${knowledgeKind}: mētis fraction surviving, by copy (book number)\n`);
  const header = ['species', 'affinity', ...Array.from({ length: RUNGS }, (_, n) => `#${n + 1}`)];
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);

  for (const species of SPECIES) {
    /** Every seed's chain, so a difference between seeds is visible rather than averaged. */
    const perSeed = SEEDS.map((seed) => runChain({ seed, species, knowledgeKind, rungs: RUNGS }));
    const first = perSeed[0];
    const identical = perSeed.every((rows) =>
      rows.every((row, n) => row.fidelity === first[n].fidelity),
    );
    if (!identical) throw new Error('fidelity differed across seeds; the curve is taking a draw');
    console.log(
      `| ${species.id} | ${String(species.scribeAffinity)} | ` +
        `${first.map((row) => pct(row.fidelity)).join(' | ')} |`,
    );
  }
}

console.log('\n## what a reader takes away, mastery (teach threshold is 512)\n');
{
  const header = ['species', 'kind', ...Array.from({ length: RUNGS }, (_, n) => `#${n + 1}`)];
  console.log(`| ${header.join(' | ')} |`);
  console.log(`|${header.map(() => '---').join('|')}|`);
  for (const knowledgeKind of ['metis', 'episteme']) {
    for (const species of SPECIES) {
      const rows = runChain({ seed: SEEDS[0], species, knowledgeKind, rungs: RUNGS });
      console.log(
        `| ${species.id} | ${knowledgeKind} | ` +
          `${rows.map((row) => String(row.masteryToReader)).join(' | ')} |`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Table 2: who can recover a corrupted text.
// ---------------------------------------------------------------------------

/**
 * A corrupted book, and one reader of each species sent at it.
 *
 * Driven through `study` rather than through `readsThroughCorruption` directly,
 * so what is measured is the operation the world calls and not the predicate it
 * happens to consult.
 */
function recoveryAttempt({ species, tier, readerDeepestTier }) {
  const state = createState({ schema: defineWorldStateSchema(), rootSeed: 1 });
  const knowledge = new KnowledgeSubsystem(state, NODE + 1);
  const catalog = catalogOf([
    {
      nodeId: NODE,
      tier,
      prerequisites: [],
      researchCost: 1024,
      teachCost: 1024,
      scribeCost: 1,
      rediscoveryMultiplier: 1024,
      knowledgeKind: 'metis',
    },
  ]);

  const author = state.entities.create();
  research({
    knowledge,
    catalog,
    cells,
    ruleset,
    rng: rngFor(1, 1),
    subject: author,
    nodeId: NODE,
    worldTick: 1,
    progress: 0,
    effort: 1 << 20,
    learnRate: 1024,
    researchRate: 1024,
    rediscoveryAffinity: 1024,
  });
  const written = scribe({
    knowledge,
    catalog,
    cells,
    ruleset,
    rng: rngFor(1, 2),
    scribe: author,
    nodeId: NODE,
    worldTick: 2,
    store: STANDARD_STORE,
    scribeAffinity: 1024,
    scribeCapacity: 1 << 20,
    materials: 1 << 20,
    holderKind: HOLDER_KIND.mage,
    holderId: author,
  });
  setFidelity(state, written.instance, { corruption: CORRUPTION.hidden });

  const reader = state.entities.create();
  const outcome = study({
    knowledge,
    catalog,
    cells,
    ruleset,
    reader,
    source: written.instance,
    worldTick: 3,
    curiosity: species.curiosity,
    readerDeepestTier,
  });
  return {
    recovered: outcome.repaired,
    learned: outcome.refusal === undefined,
    diagnosed: fidelityOf(state, written.instance).corruption === CORRUPTION.marked,
  };
}

console.log('\n## corrupted texts: who reads through, and who can even tell\n');
console.log('A competent reader — deepest tier held equals the text’s tier.\n');
{
  const tiers = [1, 2, 3, 4, 5, 6];
  console.log(`| species | curiosity | ${tiers.map((t) => `t${String(t)}`).join(' | ')} |`);
  console.log(`|---|---|${tiers.map(() => '---').join('|')}|`);
  for (const species of SPECIES) {
    const cells_ = tiers.map((tier) => {
      const out = recoveryAttempt({ species, tier, readerDeepestTier: tier });
      return out.recovered ? 'repairs' : out.diagnosed ? 'marks' : 'silent';
    });
    console.log(`| ${species.id} | ${String(species.curiosity)} | ${cells_.join(' | ')} |`);
  }
}

console.log('\nA novice — deepest tier held is 1.\n');
{
  const tiers = [1, 2, 3, 4, 5, 6];
  console.log(`| species | curiosity | ${tiers.map((t) => `t${String(t)}`).join(' | ')} |`);
  console.log(`|---|---|${tiers.map(() => '---').join('|')}|`);
  for (const species of SPECIES) {
    const cells_ = tiers.map((tier) => {
      const out = recoveryAttempt({ species, tier, readerDeepestTier: 1 });
      return out.recovered ? 'repairs' : out.diagnosed ? 'marks' : 'silent';
    });
    console.log(`| ${species.id} | ${String(species.curiosity)} | ${cells_.join(' | ')} |`);
  }
}

console.log('\n## the bars, for reference\n');
console.log(`| tier | curiosity needed |`);
console.log(`|---|---|`);
for (const tier of [1, 2, 3, 4, 5, 6]) {
  console.log(`| ${String(tier)} | ${String(corruptionReadBar(tier))} |`);
}
console.log(
  `\nsanity: readsThroughCorruption(1792, 6) = ${String(readsThroughCorruption(1792, 6))}, ` +
    `canDiscoverCorruption(1, 4) = ${String(canDiscoverCorruption(1, 4))}, ` +
    `masteryFromBook(1024) = ${String(masteryFromBook(1024))}, ` +
    `masteryFromBook(0) = ${String(masteryFromBook(0))}`,
);
