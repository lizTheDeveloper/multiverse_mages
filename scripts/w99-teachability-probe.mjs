/*
 * Multiverse Mages — W99: is researched knowledge teachable, and under which
 * traditions?
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
 * ## Why this is a second instrument and not a sweep column
 *
 * A sweep cannot answer this. `packages/scenario/src/census.ts` decodes its
 * vital signs out of §4.1's **observation vector**, deliberately — *"if the
 * observation cannot express 'the population grew', that is a finding about
 * §4.1"* — and the observation's knowledge block carries three channels per
 * cell: nodes known, deepest tier, instance count. **Mastery is not among
 * them.** So no `reference*` measure can distinguish a universe holding two
 * thousand instances it can teach from one holding two thousand it cannot, and
 * every committed sweep in this repository is blind to the difference.
 *
 * W26 built the instrument that is not blind to it: `@mm/agent-api`'s
 * `knowledgeCensus(state, { mastery })`, which reads held instances off state
 * and splits them into **teachable** (`mastery >= TEACH_THRESHOLD`), **marooned**
 * (held, alive, below the threshold, and nothing in the rules path can raise it
 * again) and **condemned** (dormant, so no floor). It was wired into two
 * `@mm/scenario` tests and into no measurement. This is the measurement.
 *
 * ## What it runs
 *
 * The reference universe, **zero actions** — the passive control and nothing
 * else — for 2400 world ticks under each of the three shipped traditions, at a
 * shared set of run seeds. It measures no strategy, it takes no draw of its own,
 * and it writes nothing back into state.
 *
 * ## The one number this exists to produce
 *
 * `arrivalsTeachable`: of the knowledge instances that come into existence
 * *after founding*, what fraction is teachable when it arrives. Under an
 * `acquire: standard` tradition a researched instance is created at
 * `DEFAULT_INITIAL_MASTERY` (256) against a `DEFAULT_TEACH_THRESHOLD` of 512,
 * and `setMastery`'s only rules-path caller is the decay pass, which lowers — so
 * it is unteachable on arrival and unteachable forever. Under True Naming the
 * `acquire: true-name` hook sets `instanceMastery: 1024` and it is teachable
 * immediately. **The reference universe runs True Naming**, so every teaching,
 * library and propagation number this project has published is the second case.
 *
 * Arrivals are detected at census resolution ({@link CENSUS_TICKS} ticks), so a
 * row's mastery is read up to that many ticks after it was created and has
 * already decayed by up to `CENSUS_TICKS * masteryDecayPerTick(retention)`. At
 * the shipped constants that is at most 96 units for the fastest-decaying
 * species, which cannot carry 1024 below 512 nor 256 above it — so the binary
 * question this instrument asks survives the resolution loss, while the raw
 * mastery column does not and is reported as a mean with its age beside it.
 *
 *     node scripts/w99-teachability-probe.mjs [seeds] [ticks]
 */

import { knowledgeCensus } from '../packages/agent-api/dist/index.js';
import { DEFAULT_TEACH_THRESHOLD } from '../packages/rules-magic/dist/index.js';
import { rngFromRootSeed, step } from '../packages/sim-core/dist/index.js';
import {
  acquireHookOf,
  referenceContent,
  referenceMasteryModel,
  referenceScenario,
} from '../packages/scenario/dist/index.js';

const TRADITIONS = ['true-naming', 'vancian-memorization', 'art-of-memory'];

const SEED_COUNT = Number.parseInt(process.argv[2] ?? '8', 10);
const TICKS = Number.parseInt(process.argv[3] ?? '2400', 10);

/** Common random numbers: the same run seeds under every tradition. */
const SEEDS = Array.from({ length: SEED_COUNT }, (_, n) => 20260811 + (n + 1) * 7919);

/** One world year. The same grid `mc-harness`'s knowledge census samples on. */
const CENSUS_TICKS = 12;

/** Run quarters, so a flow that dies early is distinguishable from one that never started. */
const QUARTERS = 4;

/**
 * An instance's identity across ticks. Handles are returned to the entity store
 * on destruction, so a handle alone is not an identity; the node it carries and
 * the tick it was acquired pin it. A reused handle carrying a different node is
 * simply a different key, which is the safe direction.
 */
const keyOf = (row) => `${String(row.instanceHandle)}:${String(row.nodeId)}:${String(row.acquiredTick)}`;

function probe(traditionName, runSeed) {
  const content = referenceContent(undefined, traditionName);
  const mastery = referenceMasteryModel(content.registry);
  const run = referenceScenario(content);
  let state = run.scenario.create(runSeed, { worldTickCap: TICKS, options: {} });

  const seen = new Set();
  let arrivals = 0;
  let arrivalsTeachable = 0;
  let arrivalMasterySum = 0;
  let arrivalAgeSum = 0;
  const lessonsByQuarter = new Array(QUARTERS).fill(0);
  let lessonsTaught = 0;
  let researchCompleted = 0;
  let summary;
  let nodesKnown = 0;

  // The founding census, before any tick: everything already held is a founding
  // grant and is not an arrival.
  for (const row of knowledgeCensus(state, { mastery }).marooning?.byInstance ?? []) {
    seen.add(keyOf(row));
  }

  for (let tick = 0; tick < TICKS; tick += 1) {
    state = step(state, [], rngFromRootSeed(state.rootSeed));
    const report = run.lastReport();
    if (report !== undefined) {
      const lessons = report.lessonsTaught ?? 0;
      lessonsTaught += lessons;
      researchCompleted += report.researchCompleted ?? 0;
      const quarter = Math.min(QUARTERS - 1, Math.floor((tick * QUARTERS) / TICKS));
      lessonsByQuarter[quarter] += lessons;
    }

    const last = tick === TICKS - 1;
    if (!last && (tick + 1) % CENSUS_TICKS !== 0) continue;

    const census = knowledgeCensus(state, { mastery });
    const marooning = census.marooning;
    if (marooning === undefined) continue;
    const worldTick = state.clock.worldTick;

    for (const row of marooning.byInstance) {
      const key = keyOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      arrivals += 1;
      if (row.mastery >= DEFAULT_TEACH_THRESHOLD) arrivalsTeachable += 1;
      arrivalMasterySum += row.mastery;
      arrivalAgeSum += worldTick - row.acquiredTick;
    }

    if (last) {
      summary = marooning;
      nodesKnown = marooning.byNode.length;
    }
  }

  const shelved = summary.byNode.filter((node) => node.written > 0).length;
  return {
    traditionName,
    runSeed,
    nodesKnown,
    shelvedNodes: shelved,
    heldInstances: summary.heldInstances,
    writtenInstances: summary.writtenInstances,
    teachableInstances: summary.teachableInstances,
    maroonedInstances: summary.maroonedInstances,
    condemnedInstances: summary.condemnedInstances,
    teachableNodes: summary.teachableNodeIds.length,
    untransmittableNodes: summary.untransmittableNodeIds.length,
    arrivals,
    arrivalsTeachable,
    arrivalMasteryMean: arrivals === 0 ? 0 : arrivalMasterySum / arrivals,
    arrivalAgeMean: arrivals === 0 ? 0 : arrivalAgeSum / arrivals,
    lessonsTaught,
    researchCompleted,
    lessonsByQuarter,
  };
}

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const fix = (x, n = 1) => x.toFixed(n);

const rows = [];
for (const traditionName of TRADITIONS) {
  for (const runSeed of SEEDS) {
    const row = probe(traditionName, runSeed);
    rows.push(row);
    process.stderr.write(
      `${traditionName} seed ${String(runSeed)}: arrivals ${String(row.arrivals)} ` +
        `teachable-on-arrival ${String(row.arrivalsTeachable)} ` +
        `final teachable ${String(row.teachableInstances)}/${String(row.heldInstances)}\n`,
    );
  }
}

const forTradition = (name) => rows.filter((row) => row.traditionName === name);

console.log(`# W99 — teachability by tradition\n`);
console.log(
  `Passive control, zero actions, ${String(TICKS)} world ticks, n = ${String(SEEDS.length)} ` +
    `common seeds per arm. Teach threshold ${String(DEFAULT_TEACH_THRESHOLD)}.\n`,
);

console.log('## The acquire hook, as loaded\n');
console.log('| tradition | acquire kind | initialMastery | teachable on arrival by construction? |');
console.log('|---|---|---|---|');
for (const name of TRADITIONS) {
  const hook = acquireHookOf(referenceContent(undefined, name).registry, referenceContent(undefined, name).traditionId);
  console.log(
    `| ${name} | \`${hook.kind}\` | ${String(hook.initialMastery)} | ` +
      `${hook.initialMastery >= DEFAULT_TEACH_THRESHOLD ? '**yes**' : '**no**'} |`,
  );
}

console.log('\n## Table A — instances that arrive after founding\n');
console.log('| tradition | arrivals | teachable on arrival | fraction | mean arrival mastery | mean age at first sight (ticks) |');
console.log('|---|---|---|---|---|---|');
for (const name of TRADITIONS) {
  const r = forTradition(name);
  const arrivals = mean(r.map((x) => x.arrivals));
  const teachable = mean(r.map((x) => x.arrivalsTeachable));
  console.log(
    `| ${name} | ${fix(arrivals)} | ${fix(teachable)} | ` +
      `**${arrivals === 0 ? 'n/a' : fix(teachable / arrivals, 4)}** | ` +
      `${fix(mean(r.map((x) => x.arrivalMasteryMean)))} | ${fix(mean(r.map((x) => x.arrivalAgeMean)))} |`,
  );
}

console.log('\n## Table B — what the universe holds at the end of the run\n');
console.log(
  '| tradition | nodes known | distinct nodes shelved | held instances | written instances | ' +
    'teachable | marooned | condemned | teachable nodes | untransmittable nodes |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const name of TRADITIONS) {
  const r = forTradition(name);
  const m = (k) => fix(mean(r.map((x) => x[k])));
  console.log(
    `| ${name} | ${m('nodesKnown')} | ${m('shelvedNodes')} | ${m('heldInstances')} | ` +
      `${m('writtenInstances')} | **${m('teachableInstances')}** | ${m('maroonedInstances')} | ` +
      `${m('condemnedInstances')} | ${m('teachableNodes')} | ${m('untransmittableNodes')} |`,
  );
}

console.log('\n## Table C — teaching over the run\n');
console.log('| tradition | lessons taught | research completed | Q1 | Q2 | Q3 | Q4 |');
console.log('|---|---|---|---|---|---|---|');
for (const name of TRADITIONS) {
  const r = forTradition(name);
  const q = (i) => fix(mean(r.map((x) => x.lessonsByQuarter[i])));
  console.log(
    `| ${name} | ${fix(mean(r.map((x) => x.lessonsTaught)))} | ` +
      `${fix(mean(r.map((x) => x.researchCompleted)))} | ${q(0)} | ${q(1)} | ${q(2)} | ${q(3)} |`,
  );
}

console.log('\n## Per-seed detail (teachable / held instances at the final tick)\n');
console.log(`| seed | ${TRADITIONS.join(' | ')} |`);
console.log(`|---|${TRADITIONS.map(() => '---').join('|')}|`);
for (const seed of SEEDS) {
  const cells = TRADITIONS.map((name) => {
    const row = rows.find((x) => x.traditionName === name && x.runSeed === seed);
    return `${String(row.teachableInstances)} / ${String(row.heldInstances)}`;
  });
  console.log(`| ${String(seed)} | ${cells.join(' | ')} |`);
}
