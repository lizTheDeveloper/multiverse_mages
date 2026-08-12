#!/usr/bin/env node
/*
 * Multiverse Mages — bake the shipped content into the demo shell.
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
 * Writes `ui/content.js`, the one data file `ui/index.html` loads.
 *
 *     npm run ui:build
 *
 * Two constraints shape this script, and both are worth stating because the
 * obvious simplification breaks one of them.
 *
 * **It emits a classic script, not JSON.** The demo has to open from `file://`
 * — the author double-clicks `ui/index.html` — and under a `file:` origin both
 * `fetch()` and ES modules are blocked by CORS. A classic `<script src>` in the
 * same directory is not. So the payload is assigned to `window.MM` rather than
 * fetched. (`ui/ruleset/` predates this and does fetch; it needs a server.)
 *
 * **The lattices come from `scripts/content-graph.mjs`, not from here.** That
 * script already lays out the prerequisite graph and emits `trees.html`. Laying
 * it out a second time in the browser would give the project two drawings of
 * one graph that could disagree, so this shells out to `--format json` and
 * embeds the SVG it returns verbatim.
 *
 * Nothing here is authored by hand. Every count, name, gloss and magnitude in
 * the demo is read from `packages/content/data` on each run, so a content
 * rework shows up on the next build and a stale demo is a build nobody ran.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DATA = path.join(ROOT, 'packages', 'content', 'data');
const GRAPH = path.join(ROOT, 'scripts', 'content-graph.mjs');
const OUT = path.join(HERE, 'content.js');

const read = (name) => JSON.parse(readFileSync(path.join(DATA, `${name}.json`), 'utf8'));

const techniques = read('technique');
const forms = read('form');
const cells = read('cell');
const nodes = read('node');
const species = read('species');
const traditions = read('tradition');
const godCosts = read('god-cost');

const graph = JSON.parse(execFileSync(process.execPath, [GRAPH, '--format', 'json'], { encoding: 'utf8' }));

/** Only the fields a view actually renders — the rest is weight in the file. */
const payload = {
  generatedBy: 'ui/build-content.mjs',
  source: 'packages/content/data',
  techniques: techniques.map((t) => ({ id: t.id, name: t.name, gloss: t.gloss })),
  forms: forms.map((f) => ({ id: f.id, name: f.name, gloss: f.gloss })),
  cells: cells.map((c) => ({
    id: c.id,
    technique: c.technique,
    form: c.form,
    classical: c.classicalLabels ?? [],
  })),
  nodes: nodes.map((n) => ({
    id: n.id,
    cell: n.cell,
    name: n.name,
    gloss: n.gloss,
    tier: n.tier,
    prerequisites: n.prerequisites,
    researchCost: n.researchCost,
    teachCost: n.teachCost,
    scribeCost: n.scribeCost,
    rediscoveryMultiplier: n.rediscoveryMultiplier,
  })),
  species: species.map((s) => ({
    id: s.id,
    name: s.name,
    lifespanMonths: s.lifespanMonths,
    maturityMonths: s.maturityMonths,
    curiosity: s.curiosity,
    learnRate: s.learnRate,
    retention: s.retention,
    scribeAffinity: s.scribeAffinity,
    rediscoveryAffinity: s.rediscoveryAffinity,
    mageAptitude: s.mageAptitude,
    depthCeiling: s.depthCeiling,
    tuningStatus: s.tuningStatus,
  })),
  traditions: traditions.map((t) => ({
    id: t.id,
    name: t.name,
    hooks: Object.fromEntries(
      Object.entries(t.hooks).map(([hook, spec]) => [hook, { kind: spec.kind, params: spec.params ?? null }]),
    ),
  })),
  edictCosts: godCosts
    .filter((c) => /permit|forbid|dispensation|interdiction/.test(c.id))
    .map((c) => ({ id: c.id, favorCost: c.favorCost, gloss: c.gloss })),
  graph,
};

// A count the demo states out loud, asserted here so the page can never print a
// number the data stopped supporting. A demo that lies about its own content is
// worse than no demo.
const expect = (label, actual, wanted) => {
  if (actual !== wanted) {
    process.stderr.write(`ui/build-content: ${label} is ${actual}, the page says ${wanted}\n`);
    process.exit(1);
  }
};
expect('cell count', payload.cells.length, 70);
expect('node count', payload.nodes.length, 300);
expect('v1 cell count', graph.v1Cells.length, 12);
expect('v1 node count', graph.counts.v1, 51);

const header = `/*
 * Multiverse Mages — content baked for the ui/ demo. GENERATED; DO NOT EDIT.
 * Copyright (C) 2026 Ann Kelner
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Regenerate with \`npm run ui:build\` after any change under
 * packages/content/data. Source: ${payload.source}.
 */
`;

writeFileSync(OUT, `${header}window.MM = ${JSON.stringify(payload)};\n`);
process.stderr.write(
  `ui/build-content: wrote ${path.relative(ROOT, OUT)} — ` +
    `${payload.cells.length} cells, ${payload.nodes.length} nodes, ` +
    `${payload.species.length} species, ${graph.lattices.length} lattices\n`,
);
