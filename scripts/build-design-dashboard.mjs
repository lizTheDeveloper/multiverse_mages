#!/usr/bin/env node
/*
 * Multiverse Mages — build the design dashboard's payload.
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
 * `ui/design-dashboard/` shows the state of the game's design in one page: the
 * grid, primitive consumption, the species table, the §7 metric registry, what
 * the committed baselines actually measured, the reachability findings, and the
 * design decisions waiting on the owner. This writes the single JSON file it
 * reads.
 *
 *     npm run ui:dashboard         # to ui/design-dashboard/data.json
 *
 * ## Generated, committed, and pinned
 *
 * Exactly the treatment `ui/session.json` gets, for exactly its reason: a
 * committed generated file rots in silence — the page keeps loading, the tables
 * keep rendering, and the repository they describe stopped being this one some
 * commits ago. `packages/content/test/unit/design-dashboard-payload.test.ts`
 * re-runs this script and compares field by field, so a stale payload is a red
 * test rather than a dashboard quietly showing last month's design.
 *
 * ## Why there is no date and no `git rev-parse` in the output
 *
 * `CLAUDE.md` is emphatic that *"a document is not a ref for the code it
 * describes"* and that an undated measurement in the present tense will be read
 * as current for as long as it survives. The obvious response — stamp the clock
 * and the commit — is wrong here, twice over. A wall-clock stamp makes the
 * pinning test fail on every run, and a `git` call makes the payload a function
 * of the checkout rather than of the tree (CI checks out shallow, so per-file
 * history is not reliably present).
 *
 * The stronger answer is available because of the pin: **this payload is a pure
 * function of the repository contents, and a test asserts it.** So it is a
 * statement about whatever commit you are reading it on, always, with no date to
 * go stale. What it carries instead of a timestamp is the identity the content
 * itself declares — `contentRevision` — and, for every figure that came out of a
 * document rather than out of the code, *that document's own stated date and
 * refs*, lifted verbatim. Those genuinely are historical and are labelled so.
 *
 * ## Which numbers are derived here and which are only relayed
 *
 * The distinction matters enough to be a field on every section
 * (`source: 'derived' | 'relayed'`), because the page prints it:
 *
 * - **Relayed.** `checkPrimitiveConsumption`'s report and
 *   `check-reachability.mjs --json` are run and their output is passed through
 *   untouched. The brief for this dashboard is explicit that it should render
 *   those checks, not re-derive them, and a second implementation of a check is
 *   how two green lights come to disagree.
 * - **Derived.** Counts over `packages/content/data` — nodes per cell, authored
 *   effects per primitive, how many of each sit inside the v1 rectangle. Those
 *   are arithmetic over authored JSON that no existing check emits.
 * - **Read.** The §7 metric registry and the four committed baselines are read
 *   as data structures, not recomputed. Nothing here runs a sweep.
 *
 * ## What it deliberately does not do
 *
 * It does not gate on the checks' exit codes. `check:consumption` and
 * `check:reachability` are both **red on `main` today** and neither is in
 * `npm run verify` — that is the finding the dashboard exists to display, so a
 * builder that refused to run when they were red would only be able to draw a
 * page nobody needs.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  directorySource,
  loadContent,
  shippedDataDirectory,
} from '../packages/content/dist/index.js';
import { BALANCE_METRIC_REGISTRY } from '../packages/mc-harness/dist/index.js';
import {
  checkPrimitiveConsumption,
  createConsumptionRecorder,
} from '../packages/rules-magic/dist/effects/index.js';
import { scribingTraditionId, worldDeps } from '../packages/scenario/dist/content-set.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const out = arg('out', path.join(ROOT, 'ui', 'design-dashboard', 'data.json'));
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));

// ---------------------------------------------------------------------------
// The grid: 5 techniques x 14 forms, and what is in each cell.
// ---------------------------------------------------------------------------

const registry = loadContent(directorySource(shippedDataDirectory()));

const techniques = registry.techniques.map(({ record }) => ({
  id: record.id,
  name: record.name,
  bit: record.bit,
}));
const forms = registry.forms.map(({ record }) => ({
  id: record.id,
  name: record.name,
  bit: record.bit,
}));

const nodesByCell = new Map();
for (const { record } of registry.nodes) {
  const list = nodesByCell.get(record.cell);
  if (list === undefined) nodesByCell.set(record.cell, [record]);
  else list.push(record);
}

const cells = registry.cells.map(({ record }) => {
  const nodes = nodesByCell.get(record.id) ?? [];
  const tiers = {};
  for (const node of nodes) tiers[node.tier] = (tiers[node.tier] ?? 0) + 1;
  return {
    id: record.id,
    technique: record.technique,
    form: record.form,
    // §2.2's twelve-cell rectangle. `v1RulesetAxes` in `@mm/scenario` derives
    // the reference universe's permitted axes by OR-ing exactly this flag, so
    // "enabled" here means the same thing it means to a running universe.
    enabled: record.v1 === true,
    classicalLabels: [...(record.classicalLabels ?? [])],
    nodeCount: nodes.length,
    tierCounts: tiers,
  };
});

/**
 * The rectangle, re-derived the way `v1RulesetAxes` derives it.
 *
 * Stated as the set of permitted axes rather than as two literals, for the
 * reason that function gives: the day content moves the rectangle, this moves
 * with it instead of asserting a shape the data no longer has.
 */
const enabledCells = cells.filter((cell) => cell.enabled);
const grid = {
  source: 'derived',
  from: ['packages/content/data/cell.json', 'packages/content/data/node.json'],
  techniques,
  forms,
  cells,
  permittedTechniques: [...new Set(enabledCells.map((cell) => cell.technique))].sort(),
  permittedForms: [...new Set(enabledCells.map((cell) => cell.form))].sort(),
  totals: {
    cells: cells.length,
    enabledCells: enabledCells.length,
    nodes: registry.nodes.length,
    nodesInEnabledCells: enabledCells.reduce((sum, cell) => sum + cell.nodeCount, 0),
  },
};

// ---------------------------------------------------------------------------
// Primitive consumption: relayed from the check, with the authored counts the
// check does not carry.
// ---------------------------------------------------------------------------

const recorder = createConsumptionRecorder();
// The return value is discarded: what is being measured is what *assembling a
// universe* asked the content for, which the recorder now holds.
// `scripts/check-primitive-consumption.mjs` does the same and says why.
worldDeps(registry, scribingTraditionId(registry), recorder);
const consumption = checkPrimitiveConsumption(registry, recorder);

const enabledCellIds = new Set(enabledCells.map((cell) => cell.id));
const authored = new Map();
for (const { record: primitive } of registry.primitives) {
  authored.set(primitive.id, {
    effectCount: 0,
    nodeCount: 0,
    enabledEffectCount: 0,
    enabledNodeCount: 0,
  });
}
for (const { record: node } of registry.nodes) {
  const inRectangle = enabledCellIds.has(node.cell);
  const seen = new Set();
  for (const effect of node.effects ?? []) {
    const tally = authored.get(effect.primitive);
    if (tally === undefined) continue;
    tally.effectCount += 1;
    if (inRectangle) tally.enabledEffectCount += 1;
    if (!seen.has(effect.primitive)) {
      seen.add(effect.primitive);
      tally.nodeCount += 1;
      if (inRectangle) tally.enabledNodeCount += 1;
    }
  }
}

const consumerIndex = new Map();
for (const entry of consumption.consumed) {
  consumerIndex.set(entry.primitiveId, { status: 'node-driven', consumers: entry.consumers });
}
for (const entry of consumption.nonNode) {
  consumerIndex.set(entry.primitiveId, { status: 'non-node', consumers: entry.consumers });
}

const primitives = {
  source: 'relayed',
  from: [
    'scripts/check-primitive-consumption.mjs (@mm/rules-magic checkPrimitiveConsumption)',
    'packages/content/data/primitive.json',
    'packages/content/data/node.json',
  ],
  ok: consumption.ok,
  registrationCount: consumption.registrationCount,
  unconsumed: [...consumption.unconsumed].sort(),
  starved: [...consumption.starved],
  exclusions: [...consumption.exclusions].sort(),
  rows: registry.primitives.map(({ record: primitive }) => {
    const found = consumerIndex.get(primitive.id);
    const tally = authored.get(primitive.id);
    return {
      id: primitive.id,
      unit: primitive.unit,
      scale: primitive.scale,
      stacking: primitive.stacking,
      cap: primitive.cap.kind === 'none' ? null : primitive.cap.value,
      capKind: primitive.cap.kind,
      // Three states, and the middle one is the whole point of the check:
      // `non-node` means something consumes the primitive but nothing an
      // academic can *learn* moves it.
      status: found?.status ?? 'unconsumed',
      consumers: found === undefined ? [] : [...found.consumers],
      excluded: consumption.exclusions.includes(primitive.id),
      ...tally,
    };
  }),
};

// ---------------------------------------------------------------------------
// Species, and the derived quantities that turned out to matter.
// ---------------------------------------------------------------------------

const FP = 1024;
const speciesData = readJson('packages/content/data/species.json');

/** Which of the six holds the extreme on a column, so the page can mark it. */
const extremes = (rows, key) => {
  const values = rows.map((row) => row[key]);
  return { min: Math.min(...values), max: Math.max(...values) };
};

const species = {
  source: 'derived',
  from: ['packages/content/data/species.json', 'packages/content/data/form.json'],
  formIds: forms.map((form) => form.id),
  fpScale: FP,
  rows: speciesData.map((record) => ({
    id: record.id,
    name: record.name,
    lifespanMonths: record.lifespanMonths,
    lifespanVarianceMonths: record.lifespanVarianceMonths,
    maturityMonths: record.maturityMonths,
    curiosity: record.curiosity,
    depthCeiling: record.depthCeiling,
    learnRate: record.learnRate,
    retention: record.retention,
    fertility: record.fertility,
    scribeAffinity: record.scribeAffinity,
    rediscoveryAffinity: record.rediscoveryAffinity,
    mageAptitude: record.mageAptitude,
    laborAffinity: record.laborAffinity,
    affinities: { ...record.affinities },
    tuningStatus: record.tuningStatus,
  })),
  /**
   * The tension the brief asked to be made visible, measured rather than
   * asserted — and it does not say quite what the brief's gloss said.
   *
   * Dwarf is the best scribe (1792) and third from the bottom on curiosity
   * (512, above orc's 384 and draconic's 256). Gnome is the *curiosity/retention*
   * inverse — highest curiosity at 1792 and lowest retention at 512 — not the
   * scribe inverse: gnome scribes at 896, fourth of six, and the worst scribe is
   * orc at 384. Rendering the extremes from the file is what keeps the caption
   * honest when the numbers move.
   */
  extremes: Object.fromEntries(
    [
      'curiosity',
      'retention',
      'scribeAffinity',
      'learnRate',
      'rediscoveryAffinity',
      'mageAptitude',
      'laborAffinity',
      'fertility',
      'lifespanMonths',
      'depthCeiling',
    ].map((key) => [key, extremes(speciesData, key)]),
  ),
};

// ---------------------------------------------------------------------------
// The §7 metric registry, and which of them a committed baseline measured.
// ---------------------------------------------------------------------------

const BASELINE_FILES = [
  'balance/baselines/balance-gate-v1.baseline.json',
  'balance/baselines/balance-gate-horizon-v1.baseline.json',
  'balance/baselines/balance-gate-agency-v1.baseline.json',
  'balance/baselines/balance-gate-ascension-v1.baseline.json',
];

const baselines = BASELINE_FILES.map((file) => {
  const doc = readJson(file);
  // Per-strategy rows are `metric@strategy`. The pooled row is the one a
  // reader wants first; the arms are counted rather than listed.
  const pooled = doc.metrics.filter((metric) => !metric.metricId.includes('@'));
  const arms = new Set(
    doc.metrics
      .filter((metric) => metric.metricId.includes('@'))
      .map((metric) => metric.metricId.split('@')[1]),
  );
  return {
    file,
    sweepId: doc.sweepId,
    kind: doc.kind,
    runCount: doc.runCount,
    rootSeed: doc.rootSeed,
    toleranceK: doc.toleranceK,
    /**
     * Two hashes that are easy to swap and mean unrelated things.
     *
     * `baseline.ts` computes the file's top-level `contentHash` over the
     * canonical form of every other field in the baseline — it is a **tamper
     * seal on the file**, and it differs between the four because their metrics
     * differ. The content revision, which is what a reader means by "which
     * content was this measured against", is in the provenance block, and all
     * four carry the same one. Printing the seal under a heading like "content"
     * would say four different things about one content set.
     */
    fileSeal: doc.contentHash,
    contentRevision: doc.provenance.contentHash,
    configurationHash: doc.configurationHash,
    buildVersion: doc.provenance.buildVersion,
    rngRegistryHash: doc.provenance.rngRegistryHash,
    armCount: arms.size,
    arms: [...arms].sort(),
    // First sentence of the rationale — the claim the re-record was made under.
    rationale: doc.rationale,
    metricIds: [...new Set(doc.metrics.map((metric) => metric.metricId.split('@')[0]))].sort(),
    pooled: pooled.map((metric) => ({
      metricId: metric.metricId,
      value: metric.value,
      unit: metric.unit,
      status: metric.status,
      aggregation: metric.aggregation,
      standardError: metric.standardError,
      tolerance: metric.tolerance,
      sampleSize: metric.sampleSize,
    })),
  };
});

const sweeps = Object.fromEntries(
  ['balance-gate', 'balance-gate-horizon', 'balance-gate-agency', 'balance-gate-ascension'].map(
    (name) => {
      const doc = readJson(`balance/sweeps/${name}.sweep.json`);
      return [doc.sweepId, { declaredMetrics: [...doc.metrics].sort(), worldTickCap: doc.termination.worldTickCap }];
    },
  ),
);

const measuredMetricIds = new Set(baselines.flatMap((baseline) => baseline.metricIds));

const metrics = {
  source: 'read',
  from: [
    'packages/mc-harness/src/metrics-registry.ts (BALANCE_METRIC_REGISTRY)',
    'docs/design/contracts.md §7',
    ...BASELINE_FILES,
  ],
  /**
   * The headline this section exists to state, and it was checked in both
   * directions before being written down.
   *
   * Every §7 metric is registered, every one has a collector, and the ascension
   * baseline's provenance block lists a `definitionVersion` for all twenty of
   * them — which reads, at a glance, as twenty measured metrics. **None of the
   * four committed baselines carries a value for a single §7 metric.** All four
   * sweeps declare only the ten `reference*` gate metrics, so the registry was
   * never asked. `definitionVersion` in a baseline's provenance is provenance of
   * the *registry*, not of a measurement.
   *
   * Computed rather than asserted, so it cannot go stale silently.
   */
  contractMetricsWithCommittedValue: BALANCE_METRIC_REGISTRY.ids.filter((id) =>
    measuredMetricIds.has(id),
  ),
  rows: BALANCE_METRIC_REGISTRY.definitions.map((definition) => ({
    id: definition.id,
    definition: definition.definition,
    scope: definition.scope,
    unit: definition.unit,
    aggregation: definition.aggregation,
    definitionVersion: definition.definitionVersion,
    thresholdOwner: definition.thresholdOwner,
    disprovedBy: definition.disprovedBy,
    pinnedConstantCount: Object.keys(definition.pinnedConstants).length,
    // Whether any committed baseline holds a value under this id. It does not
    // ask whether the metric *can be made to move* — see `openQuestions` below.
    hasCommittedValue: measuredMetricIds.has(definition.id),
  })),
  gateMetricIds: [...measuredMetricIds].sort(),
  baselines,
  sweeps,
};

// ---------------------------------------------------------------------------
// Symbol reachability. Not metric reachability — see the note the page prints.
// ---------------------------------------------------------------------------

/**
 * `check-reachability.mjs` exits 1 on this tree and is not in `npm run verify`,
 * so a non-zero exit is the expected case and `execFileSync`'s throw carries the
 * output on the error. Anything else — a crash, a bad flag — has no `stdout` to
 * parse and is re-raised, because a builder that swallowed a broken check would
 * draw an empty panel that reads as "no findings".
 */
function reachabilityReport() {
  const script = path.join(ROOT, 'scripts', 'check-reachability.mjs');
  try {
    return JSON.parse(
      execFileSync(process.execPath, [script, '--json'], { cwd: ROOT, encoding: 'utf8' }),
    );
  } catch (error) {
    if (typeof error.stdout === 'string' && error.stdout.trim().startsWith('{')) {
      return JSON.parse(error.stdout);
    }
    throw error;
  }
}

const reachability = {
  source: 'relayed',
  from: ['scripts/check-reachability.mjs --json'],
  ...reachabilityReport(),
};

// ---------------------------------------------------------------------------
// The documents: open decisions, and the measurements that exist.
// ---------------------------------------------------------------------------

/**
 * Section headings and their recommendation lines, out of the decisions page.
 *
 * Deliberately shallow. It lifts the `###` headings, the enclosing `##` group
 * and the one line that starts `*Recommendation:*`, and it links out for
 * everything else. A parser that tried to turn the argument into fields would
 * be inventing structure the document does not have, and the argument is the
 * part a reader has to read anyway.
 *
 * It throws when it finds nothing, rather than writing an empty section: a
 * dashboard panel with no rows reads as "no open decisions", which is the
 * opposite of true.
 */
function parseDecisions(markdown) {
  const lines = markdown.split('\n');
  const items = [];
  let group = '';
  let current;
  // A recommendation is a hard-wrapped paragraph, not a line. Capturing only
  // the first line truncated four of the six mid-sentence — "accept, or fix the
  // baseline format so an appended stream is distinguishable from" — which is a
  // worse failure than not showing it, because it reads as complete.
  let collecting = false;
  for (const line of lines) {
    const groupMatch = /^## (.+)$/.exec(line);
    if (groupMatch !== null) {
      group = groupMatch[1].trim();
      current = undefined;
      collecting = false;
      continue;
    }
    const headingMatch = /^### (.+)$/.exec(line);
    if (headingMatch !== null) {
      current = { group, heading: headingMatch[1].trim(), recommendation: null };
      items.push(current);
      collecting = false;
      continue;
    }
    if (current === undefined) continue;
    if (collecting) {
      // The paragraph ends at a blank line or at the start of the next block.
      if (line.trim() === '' || /^[-*#|]/.test(line.trim())) {
        collecting = false;
        continue;
      }
      current.recommendation = `${current.recommendation} ${line.trim()}`;
      continue;
    }
    if (current.recommendation !== null) continue;
    const recommendationMatch = /\*Recommendation:\*\s*(.+)$/.exec(line);
    if (recommendationMatch !== null) {
      current.recommendation = recommendationMatch[1].trim();
      collecting = true;
    }
  }
  if (items.length === 0) {
    throw new Error(
      'No "### " sections found in the baseline-decisions page. The dashboard would render an ' +
        'empty "open decisions" panel, which reads as "there are none".',
    );
  }
  return items;
}

const DECISIONS_DOC = 'docs/design/baseline-decisions-2026-08-14.md';
const decisionsMarkdown = read(DECISIONS_DOC);
const decisionsRef = /Measured on `([^`]+)` at `([^`]+)`/.exec(decisionsMarkdown);

const decisions = {
  source: 'relayed',
  from: [DECISIONS_DOC],
  // The document's own stated date and ref, verbatim. This is a historical
  // measurement and the page says so.
  statedDate: /as of (\d{4}-\d{2}-\d{2})/.exec(decisionsMarkdown)?.[1] ?? null,
  statedRef: decisionsRef === null ? null : { branch: decisionsRef[1], commit: decisionsRef[2] },
  items: parseDecisions(decisionsMarkdown),
};

const SPREAD_DOC = 'docs/design/species-separation-spread.md';
const spreadMarkdown = read(SPREAD_DOC);

/** The three-column `| ref | commit | what it is |` table at the top. */
function parseRefTable(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    const match = /^\| `([^`]+)` \| `([^`]+)` \| (.+?) \|$/.exec(line.trim());
    if (match !== null) rows.push({ ref: match[1], commit: match[2], what: match[3].trim() });
  }
  return rows;
}

const spreadRefs = parseRefTable(spreadMarkdown.slice(0, spreadMarkdown.indexOf('## The negative result')));
if (spreadRefs.length === 0) {
  throw new Error(`${SPREAD_DOC} has no ref table. Its numbers would be printed with no ref.`);
}

const measurements = {
  source: 'relayed',
  from: [SPREAD_DOC],
  speciesSeparation: {
    statedDate: /\*\*Measured (\d{4}-\d{2}-\d{2})\.\*\*/.exec(spreadMarkdown)?.[1] ?? null,
    refs: spreadRefs,
    instrument:
      'packages/scenario/src/species-separation.ts, driven by ' +
      'packages/scenario/bin/species-separation.mjs — 12 independent seed sets of 6 seeds, ' +
      'tier 3, 720 world ticks, LONG_RUN_OPTIONS. 72 runs per ref per tier.',
    // Lifted verbatim from the section headed "The negative result, stated
    // directly", because a paraphrase of a negative result is how it softens.
    headline:
      'Task 9.9 — "at least four species differ by more than the observed cross-seed spread" — ' +
      'is UNMET, on all three refs. Neither #140 nor #137 moved it. Measured properly it is ' +
      'further from met than the repository believed, not closer.',
    status: 'refuted',
  },
};

// ---------------------------------------------------------------------------
// What the dashboard wanted to show and cannot.
// ---------------------------------------------------------------------------

/**
 * Named rather than omitted, because an absent panel reads as an absent problem.
 * Each entry is a sentence a reader can go and check.
 */
const openQuestions = [
  {
    id: 'metric-reachability',
    title: 'Whether each §7 metric can be made to move',
    detail:
      'There is no check on `main` that answers it. `npm run check:reachability` is a different ' +
      'question — whether a rules-path *symbol* has a production caller — and is shown under its ' +
      'own heading here for that reason. Per-metric reachability is PR #117, which the decisions ' +
      'page calls "the one whose value tonight raised the most". Until it lands, the closest ' +
      'available answer is the weaker one this page does show: whether a committed baseline holds ' +
      'a value for the metric at all.',
  },
  {
    id: 'baseline-dates',
    title: 'When each committed baseline was recorded',
    detail:
      'The baseline format carries no date field. Its identity is its content revision, its ' +
      '`configurationHash` and its `rngRegistryHash`, which are shown instead — they answer "is ' +
      'this baseline about this tree?" better than a date would, and they do not answer "how old ' +
      'is it?" at all. The file\'s own top-level `contentHash` is a tamper seal over its other ' +
      'fields, not a statement about content, and is labelled "file seal" here for that reason.',
  },
  {
    id: 'consumption-history',
    title: 'How primitive consumption has moved over time',
    detail:
      'Nothing under `balance/` or `docs/` records a consumption count per commit, so this page ' +
      'can only show today\'s. The decisions page records 10 → 3 across #144 and #140, and that ' +
      'is prose in one document rather than a series.',
  },
];

// ---------------------------------------------------------------------------

const doc = {
  provenance: {
    generatedBy: 'scripts/build-design-dashboard.mjs',
    command: 'npm run ui:dashboard',
    pinnedBy: 'packages/content/test/unit/design-dashboard-payload.test.ts',
    // The content's own declared identity. Not a date: see the module note.
    contentRevision: registry.contentRevision,
    contentCounts: { ...registry.counts },
    metricRegistrySize: BALANCE_METRIC_REGISTRY.ids.length,
    note:
      'This payload is a pure function of the repository contents and a test asserts it, so it ' +
      'is a statement about the commit you are reading it on. Figures lifted from a document ' +
      'carry that document\'s own stated date and ref, and are labelled as historical.',
  },
  grid,
  primitives,
  species,
  metrics,
  reachability,
  decisions,
  measurements,
  openQuestions,
};

writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
process.stderr.write(
  `design dashboard payload → ${out}\n` +
    `  grid ${grid.totals.enabledCells}/${grid.totals.cells} cells enabled, ${grid.totals.nodes} nodes\n` +
    `  primitives ${primitives.rows.length}, unconsumed ${primitives.unconsumed.length}\n` +
    `  §7 metrics ${metrics.rows.length}, with a committed value ${metrics.contractMetricsWithCommittedValue.length}\n` +
    `  reachability findings ${reachability.findingCount}\n` +
    `  open decisions ${decisions.items.length}\n`,
);
