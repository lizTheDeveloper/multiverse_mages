/*
 * Multiverse Mages — W19: the horizon tables, rendered from the summary JSON.
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
 * Markdown straight out of the measurement, so that no number in the writeup was
 * ever retyped by hand. Reads `summarise.mjs`'s JSON on stdin or from a path.
 */

import { readFileSync } from 'node:fs';

const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function main() {
  const path = process.argv[2];
  const data = JSON.parse(readFileSync(path ?? 0, 'utf8'));
  const ticks = Object.keys(data.horizons)
    .map(Number)
    .sort((a, b) => a - b);
  const lines = [];

  lines.push(`**v1 reachable set: ${String(data.v1Size)} nodes.**`);
  lines.push('');

  lines.push('## Saturation first');
  lines.push('| horizon | runs | saturated | fraction | mean nodes | mean v1 coverage |');
  lines.push('|--:|--:|--:|--:|--:|--:|');
  for (const t of ticks) {
    const h = data.horizons[t];
    const meanNodes =
      Object.values(h.strategies).reduce((a, s) => a + s.meanNodes * s.n, 0) / h.runs;
    const meanV1 =
      Object.values(h.strategies).reduce((a, s) => a + s.meanV1Coverage * s.n, 0) / h.runs;
    lines.push(
      `| ${String(t)} | ${String(h.runs)} | ${String(h.saturation.runs)} | ` +
        `**${fmt(h.saturation.fraction, 4)}** | ${fmt(meanNodes, 1)} | ${fmt(meanV1, 1)} |`,
    );
  }
  lines.push('');

  lines.push('## Dimensionality, containment, prefix fidelity — the full ten-strategy pool');
  lines.push(
    '| horizon | 80% | 95% | participation | between-strategy variance | containment mean | containment min | within-strategy containment | prefix fidelity | exact |',
  );
  lines.push('|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const t of ticks) {
    const h = data.horizons[t];
    const b = h.dimensionality.binary;
    lines.push(
      `| ${String(t)} | ${String(b.forEighty)} | ${String(b.forNinetyFive)} | ` +
        `**${fmt(b.participationRatio, 2)}** | ${fmt(b.betweenShare, 3)} | ` +
        `${fmt(h.containment.crossMean)} | ${fmt(h.containment.crossMin)} | ` +
        `${fmt(h.containment.withinMean)} | **${fmt(h.prefixFidelity.mean, 4)}** | ` +
        `${String(h.prefixFidelity.exact)}/${String(h.prefixFidelity.of)} |`,
    );
  }
  lines.push('');

  lines.push('## The same, over the eight strategies that stay inside v1');
  lines.push(
    '| horizon | 80% | 95% | participation | containment mean | containment min | within-strategy containment | prefix fidelity | exact |',
  );
  lines.push('|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
  for (const t of ticks) {
    const v = data.horizons[t].v1Only;
    const b = v.dimensionality.binary;
    lines.push(
      `| ${String(t)} | ${String(b.forEighty)} | ${String(b.forNinetyFive)} | ` +
        `**${fmt(b.participationRatio, 2)}** | ${fmt(v.containment.crossMean)} | ` +
        `${fmt(v.containment.crossMin)} | ${fmt(v.containment.withinMean)} | ` +
        `**${fmt(v.prefixFidelity.mean, 4)}** | ` +
        `${String(v.prefixFidelity.exact)}/${String(v.prefixFidelity.of)} |`,
    );
  }
  lines.push('');

  lines.push('## Shape-only spectra — magnitude removed, composition left');
  lines.push('| horizon | binary 80% | binary 95% | binary PR | shape 80% | shape 95% | shape PR |');
  lines.push('|--:|--:|--:|--:|--:|--:|--:|');
  for (const t of ticks) {
    const h = data.horizons[t].dimensionality;
    lines.push(
      `| ${String(t)} | ${String(h.binary.forEighty)} | ${String(h.binary.forNinetyFive)} | ` +
        `${fmt(h.binary.participationRatio, 2)} | ${String(h.binaryShape.forEighty)} | ` +
        `${String(h.binaryShape.forNinetyFive)} | ${fmt(h.binaryShape.participationRatio, 2)} |`,
    );
  }
  lines.push('');

  const strategies = Object.keys(data.horizons[ticks[0]].strategies).sort();
  lines.push('## Per-strategy node counts by horizon');
  lines.push(`| strategy | ${ticks.map(String).join(' | ')} |`);
  lines.push(`|---|${ticks.map(() => '--:').join('|')}|`);
  for (const id of strategies) {
    lines.push(
      `| \`${id}\` | ` +
        ticks
          .map((t) => {
            const s = data.horizons[t].strategies[id];
            return `${fmt(s.meanNodes, 1)} ±${fmt(s.seNodes, 2)}`;
          })
          .join(' | ') +
        ' |',
    );
  }
  lines.push(
    '| **spread (max − min of the means)** | ' +
      ticks.map((t) => `**${fmt(data.horizons[t].spread.range, 1)}**`).join(' | ') +
      ' |',
  );
  lines.push('');

  lines.push('## Saturated runs per strategy');
  lines.push(`| strategy | ${ticks.map(String).join(' | ')} |`);
  lines.push(`|---|${ticks.map(() => '--:').join('|')}|`);
  for (const id of strategies) {
    lines.push(
      `| \`${id}\` | ` +
        ticks
          .map((t) => {
            const s = data.horizons[t].strategies[id];
            return `${String(s.saturatedRuns)}/${String(s.n)}`;
          })
          .join(' | ') +
        ' |',
    );
  }
  lines.push('');

  lines.push('## Ascension');
  lines.push(
    '| horizon | window | canon reachable | ascensions | rate | apotheosis | canon | ascended at (min/med/max) | terminal reasons |',
  );
  lines.push('|--:|---|---|--:|--:|--:|--:|---|---|');
  for (const t of ticks) {
    const a = data.horizons[t].ascension;
    const reasons = Object.entries(a.byReason)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ');
    const at =
      a.ascendedTick === null
        ? '—'
        : `${String(a.ascendedTick.min)} / ${String(a.ascendedTick.median)} / ${String(a.ascendedTick.max)}`;
    lines.push(
      `| ${String(t)} | ${a.gatedByMinTick ? '**empty** — `[600, H)`' : `\`[600, ${String(t)})\``} | ` +
        `${a.canonReachable ? 'yes' : '**no** — canon needs tick 960'} | ` +
        `${String(a.ascensions)} | ${fmt(a.rate, 4)} | ${String(a.apotheosis)} | ` +
        `${String(a.canon)} | ${at} | ${reasons} |`,
    );
  }
  lines.push('');

  lines.push('## Ascensions per strategy');
  lines.push(`| strategy | ${ticks.map(String).join(' | ')} |`);
  lines.push(`|---|${ticks.map(() => '--:').join('|')}|`);
  for (const id of strategies) {
    lines.push(
      `| \`${id}\` | ` +
        ticks
          .map((t) => {
            const s = data.horizons[t].strategies[id];
            return `${String(s.ascensions)}/${String(s.n)}`;
          })
          .join(' | ') +
        ' |',
    );
  }
  lines.push('');

  lines.push('## Integrity');
  lines.push('| horizon | strategies | runs each |');
  lines.push('|--:|--:|---|');
  for (const t of ticks) {
    const counts = Object.values(data.coverage[t]);
    const uniform = new Set(counts).size === 1;
    lines.push(
      `| ${String(t)} | ${String(counts.length)} | ${uniform ? `**${String(counts[0])} each**` : counts.join(', ')} |`,
    );
  }
  lines.push('');
  lines.push('| seed comparison | compared | identical |');
  lines.push('|---|--:|---|');
  for (const [pair, check] of Object.entries(data.seedCheck)) {
    lines.push(
      `| ${pair.replace('v', ' vs ')} | ${String(check.compared)} | ` +
        `${check.identical ? '**all**' : `${String(check.equal)} of ${String(check.compared)}`} |`,
    );
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
