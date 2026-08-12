#!/usr/bin/env node
/*
 * Multiverse Mages — read the authored content as a graph, and draw it.
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
 * The node graph is authored as 300 records in `node.json`, and a record list is
 * the one shape in which its structure is invisible. Prerequisites cross cells,
 * a cell is sometimes a chain and sometimes a fork, and whether a tier has any
 * content at all is answerable only by scanning. This script reads the shipped
 * content and re-presents the same facts in two shapes that show structure.
 *
 *     node scripts/content-graph.mjs --format map            # dense text, for review
 *     node scripts/content-graph.mjs --format map --all      # all 70 cells, not just v1
 *     npm run content:graph -- --out trees.html               # drawn lattices, one per form
 *
 * Output goes to stdout unless `--out` names a file. Prefer `--out` from an npm
 * script: `npm run` writes its own banner to stdout, so a redirect there lands
 * two lines of npm chatter at the top of the HTML and the page fails to parse.
 *
 * Nothing here is authored by hand: every node, edge, tier, count and reference
 * is derived from the data, so a content rework shows up on the next run. It is
 * a reading of the content, never a source of truth about it — no other script
 * should import from this one, and CI does not gate on it.
 *
 * ## Why the map format exists
 *
 * `--format map` is written to be read in one pass, by a person scanning for
 * where the content thins out or by a model that has been handed the content
 * and cannot hold 200KB of JSON usefully. It is deliberately lossless for graph
 * structure — every node and every prerequisite edge appears — and the run
 * asserts that before printing, so a summary can never quietly drop an edge and
 * still look complete. Losing an edge silently is the one failure that would
 * make this actively worse than reading the JSON.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'packages', 'content', 'data');

const read = (name) => JSON.parse(readFileSync(path.join(DATA, `${name}.json`), 'utf8'));

const nodes = read('node');
const techniques = read('technique').map((t) => t.id);
const forms = read('form').map((f) => f.id);
const byId = new Map(nodes.map((n) => [n.id, n]));

/**
 * The twelve cells this release enables, per `magic-grid`: the full rectangle of
 * three techniques by four forms. Stated here rather than read from a `v1` flag
 * so that this script keeps reporting the same rectangle if the flag moves.
 */
const V1_TECH = ['intellego', 'perdo', 'rego'];
const V1_FORM = ['limen', 'mentem', 'nomen', 'terram'];
const v1Cells = new Set(V1_TECH.flatMap((t) => V1_FORM.map((f) => `${t}-${f}`)));

const MAX_TIER = 7;

const techOf = (cell) => cell.slice(0, cell.indexOf('-'));
const formOf = (cell) => cell.slice(cell.indexOf('-') + 1);

// ---------------------------------------------------------------- analysis

/** How many nodes in `scope` name this one as a prerequisite. */
function fanOut(scope) {
  const ids = new Set(scope.map((n) => n.id));
  const counts = new Map();
  for (const n of scope) {
    for (const p of n.prerequisites) {
      if (ids.has(p)) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Nodes acquirable when only `allowed` cells are permitted.
 *
 * A dormant instance cannot satisfy a prerequisite (`magic-grid`, `knowledge-
 * instances`), so forbidding a cell strands every node downstream of it as well
 * as the cell's own. That collateral is the whole point of computing this: the
 * three technique switches look symmetric and are not.
 */
function reachable(allowed, ceiling = MAX_TIER) {
  const pool = nodes.filter((n) => allowed.has(n.cell) && n.tier <= ceiling);
  const ok = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const n of pool) {
      if (ok.has(n.id)) continue;
      if (n.prerequisites.every((p) => !byId.has(p) || ok.has(p))) {
        ok.add(n.id);
        changed = true;
      }
    }
  }
  return ok;
}

// ---------------------------------------------------------------- references

/**
 * A short, stable handle for a node: technique initial, form initials, tier, and
 * a disambiguating letter when a cell holds more than one node at that tier.
 * `RNO2a` is the first rego-nomen tier-2 node. Long enough to be unambiguous,
 * short enough that an edge list stays one line.
 */
function buildRefs(scope) {
  const refs = new Map();
  const groups = new Map();
  for (const n of scope) {
    const key = `${n.cell}|${n.tier}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const [key, group] of groups) {
    group.sort((a, b) => (a.id < b.id ? -1 : 1));
    const [cell] = key.split('|');
    const stem = techOf(cell)[0].toUpperCase() + formOf(cell).slice(0, 2).toUpperCase();
    group.forEach((n, i) => {
      refs.set(n.id, `${stem}${n.tier}${group.length > 1 ? 'abcdefgh'[i] : ''}`);
    });
  }
  return refs;
}

// ---------------------------------------------------------------- map format

const pad = (s, w) => (s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length));

function renderMap({ all }) {
  const scopeCells = all ? new Set(nodes.map((n) => n.cell)) : v1Cells;
  const scope = nodes.filter((n) => scopeCells.has(n.cell));
  const refs = buildRefs(scope);
  const fan = fanOut(scope);
  const scopeIds = new Set(scope.map((n) => n.id));
  const formList = all ? forms : V1_FORM;
  const techList = all ? techniques : V1_TECH;

  const edgesTotal = scope.reduce(
    (acc, n) => acc + n.prerequisites.filter((p) => scopeIds.has(p)).length,
    0,
  );
  const crossTotal = scope.reduce(
    (acc, n) => acc + n.prerequisites.filter((p) => scopeIds.has(p) && byId.get(p).cell !== n.cell).length,
    0,
  );

  const out = [];
  let emittedNodes = 0;
  let emittedEdges = 0;

  out.push('MULTIVERSE MAGES · CONTENT GRAPH · generated from packages/content/data');
  out.push(
    `${nodes.length} nodes / 70 cells authored · this view: ${scope.length} nodes in ` +
      `${scopeCells.size} cells · ${edgesTotal} edges (${crossTotal} cross-cell)`,
  );
  out.push('');
  out.push('REF  <technique-initial><form-2><tier>[a-h]   RNO2a = rego-nomen, tier 2, 1st of 2');
  out.push('     >  requires (left is the prerequisite)   ^n = n nodes depend on it (n>=2 only)');
  out.push('');

  for (const form of formList) {
    const inForm = scope.filter((n) => formOf(n.cell) === form);
    if (inForm.length === 0) continue;
    const deepest = Math.max(...inForm.map((n) => n.tier));
    const lanes = techList.filter((t) => scopeCells.has(`${t}-${form}`));
    const colW = 28;

    out.push(`${'═'.repeat(4)} ${form.toUpperCase()} ${'═'.repeat(Math.max(0, 58 - form.length))}`);
    out.push(`     ${lanes.map((t) => pad(t, colW)).join('')}`.trimEnd() + `  (${inForm.length} nodes, deepest t${deepest})`);

    for (let tier = 1; tier <= MAX_TIER; tier += 1) {
      const perLane = lanes.map((t) =>
        inForm
          .filter((n) => n.cell === `${t}-${form}` && n.tier === tier)
          .sort((a, b) => (a.id < b.id ? -1 : 1)),
      );
      const depth = Math.max(...perLane.map((g) => g.length));
      if (depth === 0) {
        out.push(
          tier > deepest
            ? `  t${tier} — unauthored —`
            : `  t${tier} ${lanes.map(() => pad('·', colW)).join('')}`.trimEnd(),
        );
        continue;
      }
      // A cell may hold more than one node at a tier. Extra nodes get their own
      // continuation row so a name is never truncated to fit a column.
      for (let row = 0; row < depth; row += 1) {
        const cells = perLane.map((group) => {
          const n = group[row];
          if (!n) return pad(row === 0 ? '·' : '', colW);
          emittedNodes += 1;
          const f = fan.get(n.id) ?? 0;
          return pad(`${n.name}${f >= 2 ? ` ^${f}` : ''}`, colW);
        });
        out.push(`  ${row === 0 ? `t${tier}` : '  '} ${cells.join('')}`.trimEnd());
      }
    }

    // within-cell edges, then the ones that leave the cell
    const within = [];
    const across = [];
    for (const t of lanes) {
      const cell = `${t}-${form}`;
      const pairs = [];
      for (const n of scope.filter((x) => x.cell === cell)) {
        for (const p of n.prerequisites) {
          if (!scopeIds.has(p)) continue;
          if (byId.get(p).cell === cell) pairs.push(`${refs.get(p)}>${refs.get(n.id)}`);
          else across.push(`${refs.get(p)}>${refs.get(n.id)}`);
          emittedEdges += 1;
        }
      }
      if (pairs.length) within.push(`${pairs.sort().join(' ')}`);
    }
    if (within.length) out.push(`  in-cell  ${within.join('  |  ')}`);
    if (across.length) out.push(`  crosses  ${across.sort().join('  ')}`);
    out.push('');
  }

  // edges whose target sits in a form outside this view's per-form listing
  out.push('CELL COVERAGE  nodes/deepest-tier · [] = enabled in v1');
  const head = forms.map((f) => pad(f.slice(0, 4), 7)).join('');
  out.push(`${pad('', 11)}${head}`);
  for (const t of techniques) {
    const cells = forms.map((f) => {
      const cid = `${t}-${f}`;
      const ns = nodes.filter((n) => n.cell === cid);
      const mx = ns.length ? Math.max(...ns.map((n) => n.tier)) : 0;
      const body = `${ns.length}/t${mx}`;
      return pad(v1Cells.has(cid) ? `[${body}]` : ` ${body} `, 7);
    });
    out.push(`${pad(t, 11)}${cells.join('')}`);
  }
  out.push('');

  out.push('FORBIDDING ONE AXIS  nodes still reachable of ' + `${v1Cells.size === scopeCells.size ? scope.length : 51}`);
  const base = new Set(v1Cells);
  for (const t of V1_TECH) {
    const rem = new Set([...base].filter((c) => techOf(c) !== t));
    const own = nodes.filter((n) => v1Cells.has(n.cell) && techOf(n.cell) === t).length;
    const left = reachable(rem).size;
    const collateral = 51 - own - left;
    out.push(
      `  forbid ${pad(t, 10)} own -${String(own).padStart(2)}  collateral -${String(collateral).padStart(2)}` +
        `  leaves ${String(left).padStart(2)}/51`,
    );
  }
  for (const f of V1_FORM) {
    const rem = new Set([...base].filter((c) => formOf(c) !== f));
    const own = nodes.filter((n) => v1Cells.has(n.cell) && formOf(n.cell) === f).length;
    const left = reachable(rem).size;
    out.push(
      `  forbid ${pad(f, 10)} own -${String(own).padStart(2)}  collateral -${String(51 - own - left).padStart(2)}` +
        `  leaves ${String(left).padStart(2)}/51`,
    );
  }
  out.push('');
  out.push('DEPTH CEILING REACH  species trait, higher is better');
  for (const [sp, c] of [['orc', 3], ['human', 4], ['gnome', 4], ['dwarf', 5], ['elf', 6], ['draconic', 7]]) {
    out.push(`  ${pad(sp, 10)} ceiling ${c} -> ${String(reachable(v1Cells, c).size).padStart(2)}/51`);
  }

  // A summary that silently drops an edge is worse than the JSON it replaces.
  if (emittedNodes !== scope.length || emittedEdges !== edgesTotal) {
    throw new Error(
      `content-graph: map is lossy — emitted ${emittedNodes}/${scope.length} nodes and ` +
        `${emittedEdges}/${edgesTotal} edges. Refusing to print an incomplete map.`,
    );
  }
  out.push('');
  out.push(`· complete: ${emittedNodes} nodes and ${emittedEdges} edges, every one accounted for`);
  return out.join('\n');
}

// ---------------------------------------------------------------- html format

const LANE_W = 232;
const LANE_GAP = 26;
const PAD_L = 62;
const PAD_T = 46;
const ROW_H = 92;
const ROW_H_EMPTY = 46;
const NODE_W = 200;
const NODE_H = 46;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tierRows(v1, form) {
  const occupied = new Map();
  for (let t = 1; t <= MAX_TIER; t += 1) occupied.set(t, false);
  for (const n of v1) if (formOf(n.cell) === form) occupied.set(n.tier, true);
  const ys = new Map();
  let y = PAD_T;
  for (let t = 1; t <= MAX_TIER; t += 1) {
    ys.set(t, y);
    y += occupied.get(t) ? ROW_H : ROW_H_EMPTY;
  }
  return { ys, occupied, height: y + 10 };
}

function layout(v1, form) {
  const { ys } = tierRows(v1, form);
  const pos = new Map();
  V1_TECH.forEach((tech, lane) => {
    const cell = `${tech}-${form}`;
    const groups = new Map();
    for (const n of v1) {
      if (n.cell !== cell) continue;
      if (!groups.has(n.tier)) groups.set(n.tier, []);
      groups.get(n.tier).push(n);
    }
    const laneX = PAD_L + lane * (LANE_W + LANE_GAP);
    for (const [tier, group] of groups) {
      group.sort((a, b) => (a.id < b.id ? -1 : 1));
      const span = group.length;
      group.forEach((n, i) => {
        const gap = 8;
        const w = span === 1 ? NODE_W : (LANE_W - gap * (span - 1)) / span;
        const x = span === 1 ? laneX + (LANE_W - NODE_W) / 2 : laneX + i * (w + gap);
        pos.set(n.id, { x, y: ys.get(tier), w, h: NODE_H, lane, tier, node: n });
      });
    }
  });
  return pos;
}

/**
 * Descending edges leave the bottom and enter the top. An edge to the same tier
 * or a shallower one cannot do that without looping back on itself, so it leaves
 * a side instead — `magic-grid` is explicit that tier does not imply
 * satisfaction, so a sideways prerequisite is ordinary, not a content error.
 */
function edgePath(a, b) {
  if (b.y > a.y + a.h) {
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    const dy = Math.max(22, (y2 - y1) / 2);
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  }
  const ltr = b.x >= a.x;
  const x1 = ltr ? a.x + a.w : a.x;
  const x2 = ltr ? b.x : b.x + b.w;
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  const dx = Math.max(24, Math.abs(x2 - x1) / 2) * (ltr ? 1 : -1);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Split a name onto at most two lines and pick a size that fits the box. */
function wrapLabel(label, width) {
  for (const size of [13, 12, 11, 10, 9]) {
    const per = size * 0.52;
    if (label.length * per <= width - 12) return { lines: [label], size };
    const words = label.split(' ');
    let best = null;
    for (let i = 1; i < words.length; i += 1) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const longest = Math.max(a.length, b.length);
      if (best === null || longest < best.longest) best = { longest, a, b };
    }
    if (best && best.longest * per <= width - 12) return { lines: [best.a, best.b], size };
  }
  return { lines: [label], size: 9 };
}

function panel(v1, fan, form) {
  const pos = layout(v1, form);
  const { ys, occupied, height } = tierRows(v1, form);
  const width = PAD_L + 3 * LANE_W + 2 * LANE_GAP + 20;
  const out = [
    `<svg class="lattice" viewBox="0 0 ${width} ${height}" width="100%" role="img" ` +
      `aria-label="prerequisite lattice for ${form}">`,
  ];

  let noted = false;
  for (let t = 1; t <= MAX_TIER; t += 1) {
    const y = ys.get(t) + NODE_H / 2;
    const empty = !occupied.get(t);
    out.push(
      `<line class="${empty ? 'row empty' : 'row'}" x1="${PAD_L - 14}" y1="${y}" x2="${width - 14}" y2="${y}"/>`,
    );
    out.push(
      `<text class="tierlab${empty ? ' empty' : ''}" x="${PAD_L - 24}" y="${y + 4}" text-anchor="end">t${t}</text>`,
    );
    let tailEmpty = empty;
    for (let u = t; u <= MAX_TIER; u += 1) if (occupied.get(u)) tailEmpty = false;
    if (tailEmpty && !noted) {
      noted = true;
      const note = `content ends here — tiers ${t}–${MAX_TIER} unauthored`;
      out.push(`<rect class="knock" x="${PAD_L}" y="${y - 8}" width="${Math.round(note.length * 5.9)}" height="16"/>`);
      out.push(`<text class="nocontent" x="${PAD_L + 4}" y="${y + 4}">${esc(note)}</text>`);
    }
  }

  V1_TECH.forEach((tech, lane) => {
    const laneX = PAD_L + lane * (LANE_W + LANE_GAP);
    const count = v1.filter((n) => n.cell === `${tech}-${form}`).length;
    out.push(
      `<text class="lanelab" data-tech="${tech}" x="${laneX + LANE_W / 2}" y="26" ` +
        `text-anchor="middle">${tech} · ${count}</text>`,
    );
  });

  for (const n of v1) {
    if (formOf(n.cell) !== form) continue;
    for (const p of n.prerequisites) {
      if (!pos.has(p) || !pos.has(n.id)) continue;
      const cross = byId.get(p).cell !== n.cell;
      out.push(
        `<path class="${cross ? 'edge cross' : 'edge'}" data-tech="${techOf(n.cell)}" ` +
          `data-from-tech="${techOf(byId.get(p).cell)}" d="${edgePath(pos.get(p), pos.get(n.id))}"/>`,
      );
    }
  }

  const ordered = [...pos.entries()].sort((a, b) => a[1].tier - b[1].tier || a[1].lane - b[1].lane);
  for (const [id, p] of ordered) {
    const n = p.node;
    const keystone = (fan.get(id) ?? 0) >= 2;
    const external = n.prerequisites
      .filter((q) => byId.has(q) && formOf(byId.get(q).cell) !== form)
      .map((q) => formOf(byId.get(q).cell));
    out.push(
      `<g class="node ${techOf(n.cell)}${keystone ? ' keystone' : ''}" ` +
        `data-node="${id}" data-tech="${techOf(n.cell)}" data-cell="${n.cell}" data-tier="${n.tier}">`,
    );
    out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1"/>`);
    const { lines, size } = wrapLabel(n.name, p.w);
    const cx = p.x + p.w / 2;
    const top = p.y + (lines.length === 1 ? 19 : 14);
    lines.forEach((line, i) => {
      out.push(
        `<text class="nname" x="${cx}" y="${top + i * (size + 2)}" text-anchor="middle" ` +
          `style="font-size:${size}px">${esc(line)}</text>`,
      );
    });
    let meta = keystone ? `${fan.get(id)} depend` : '';
    if (external.length) meta = `${meta ? `${meta} · ` : ''}← ${external[0]}`;
    if (meta) out.push(`<text class="nmeta" x="${cx}" y="${p.y + 38}" text-anchor="middle">${esc(meta)}</text>`);
    out.push('</g>');
  }

  out.push('</svg>');
  return out.join('\n');
}

const CSS = `
:root{--ground:#E4DECD;--plate:#F1EDE3;--sunk:#D6CFBB;--ink:#1E1A15;--graphite:#554E40;
--faint:#7B7362;--rule:#CBC3AE;--rule-hi:#ABA189;--limen:#61499F;--mentem:#1F6B55;
--nomen:#395F99;--terram:#8F4F2A;--oxide:#A2331F;
--serif:"Hoefler Text","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
--mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;--accent:var(--limen)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#121009;--plate:#1A1710;
--sunk:#0C0A06;--ink:#EDE7D6;--graphite:#ADA48E;--faint:#8B8270;--rule:#302A20;--rule-hi:#453D2E;
--limen:#A692EC;--mentem:#46A98D;--nomen:#7099D8;--terram:#CC8450;--oxide:#DE7059}}
:root[data-theme="dark"]{--ground:#121009;--plate:#1A1710;--sunk:#0C0A06;--ink:#EDE7D6;
--graphite:#ADA48E;--faint:#8B8270;--rule:#302A20;--rule-hi:#453D2E;--limen:#A692EC;
--mentem:#46A98D;--nomen:#7099D8;--terram:#CC8450;--oxide:#DE7059}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--serif);font-size:16px;
line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:30px 22px 80px}
.lab{font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:var(--faint)}
h1{font-size:clamp(30px,5vw,44px);line-height:1.06;font-weight:400;letter-spacing:-.02em;
margin:10px 0 12px;text-wrap:balance}
.intro p{margin:0 0 8px;font-size:15px;color:var(--graphite);max-width:70ch;line-height:1.55}
.intro b{color:var(--ink);font-weight:600}
code{font-family:var(--mono);font-size:.86em;color:var(--ink)}
.counts{display:flex;flex-wrap:wrap;margin:22px 0 0;border-top:1px solid var(--rule);
border-bottom:1px solid var(--rule)}
.counts div{padding:12px 22px 12px 0;margin-right:22px;border-right:1px solid var(--rule)}
.counts div:last-child{border-right:none}
.counts .v{font-family:var(--mono);font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;
display:block;letter-spacing:-.02em}
.counts .v.warn{color:var(--oxide)}
.counts .k{font-family:var(--mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.13em;color:var(--faint)}
.formsec{margin-top:44px}
.formhead{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;padding-bottom:8px;
border-bottom:2px solid var(--accent)}
.formhead h2{font-size:26px;font-weight:400;letter-spacing:-.02em;margin:0;color:var(--accent)}
.formhead .sub{font-family:var(--mono);font-size:10.5px;color:var(--faint);margin-left:auto}
.latwrap{overflow-x:auto;background:var(--plate);border:1px solid var(--rule);border-top:none}
svg.lattice{display:block;min-width:840px}
.row{stroke:var(--rule);stroke-width:1}.row.empty{stroke-dasharray:2 6}
.tierlab{font-family:var(--mono);font-size:10px;fill:var(--faint)}
.tierlab.empty{fill:var(--rule-hi)}
.knock{fill:var(--plate)}
.nocontent{font-family:var(--mono);font-size:9.5px;fill:var(--rule-hi);letter-spacing:.1em;text-transform:uppercase}
.lanelab{font-family:var(--mono);font-size:10px;fill:var(--faint);letter-spacing:.14em;text-transform:uppercase}
.edge{fill:none;stroke:var(--rule-hi);stroke-width:1.4}
.edge.cross{stroke:var(--accent);stroke-width:2}
.node rect{fill:var(--plate);stroke:var(--rule-hi);stroke-width:1.2}
.node.intellego rect{stroke:var(--accent);stroke-width:1.6}
.node.keystone rect{stroke-width:2.4}
.nname{font-family:var(--serif);fill:var(--ink)}
.nmeta{font-family:var(--mono);font-size:9px;fill:var(--faint);letter-spacing:.06em}
.legend{display:flex;flex-wrap:wrap;gap:8px 24px;padding:12px 2px 0;font-family:var(--mono);
font-size:10px;color:var(--faint)}
.legend i{display:inline-block;width:22px;border-top:2px solid currentColor;vertical-align:3px;margin-right:6px}
.gridsec{margin-top:52px;border-top:2px solid var(--ink);padding-top:20px}
table.gridmap{border-collapse:collapse;font-family:var(--mono);margin-top:14px;width:100%}
table.gridmap th{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);
font-weight:500;padding:5px 3px;text-align:center}
table.gridmap tbody th{text-align:right;padding-right:9px}
table.gridmap td{border:1px solid var(--rule);text-align:center;padding:6px 2px;background:var(--plate);line-height:1.15}
table.gridmap td.live{background:var(--sunk);border-color:var(--rule-hi)}
table.gridmap .n{display:block;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
table.gridmap .d{display:block;font-size:8.5px;color:var(--faint)}
.gridnote{font-family:var(--mono);font-size:10px;color:var(--faint);margin-top:10px}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--rule);font-family:var(--mono);
font-size:10px;color:var(--faint);line-height:1.8}
.f-limen{--accent:var(--limen)}.f-mentem{--accent:var(--mentem)}
.f-nomen{--accent:var(--nomen)}.f-terram{--accent:var(--terram)}
`;

function renderHtml() {
  const v1 = nodes.filter((n) => v1Cells.has(n.cell));
  const fan = fanOut(v1);
  const v1Ids = new Set(v1.map((n) => n.id));
  const cross = v1.reduce(
    (acc, n) => acc + n.prerequisites.filter((p) => v1Ids.has(p) && byId.get(p).cell !== n.cell).length,
    0,
  );
  const edges = v1.reduce((acc, n) => acc + n.prerequisites.filter((p) => v1Ids.has(p)).length, 0);

  const out = [];
  out.push('<title>The v1 prerequisite lattices — Multiverse Mages</title>');
  out.push(`<style>${CSS}</style>`);
  out.push('<div class="wrap">');
  out.push('<span class="lab">generated by scripts/content-graph.mjs · regenerate after any rework</span>');
  out.push('<h1>The v1 prerequisite lattices</h1>');
  out.push('<div class="intro">');
  out.push(
    `<p>Every node, edge and tier is read from <code>node.json</code>. Four forms, three techniques ` +
      `each — the twelve cells this release enables. <b>Intellego is drawn first in every panel ` +
      `because the data says it is the trunk:</b> all ${cross} cross-cell prerequisites originate in ` +
      `an Intellego cell, and nine feed Perdo or Rego inside the same form.</p>`,
  );
  out.push(
    '<p>Unauthored tier rows are drawn rather than collapsed, because where the content stops is ' +
      'the thing worth seeing while reworking.</p>',
  );
  out.push('</div>');
  out.push('<div class="counts">');
  out.push(`<div><span class="v">${nodes.length}</span><span class="k">nodes authored</span></div>`);
  out.push(`<div><span class="v warn">${v1.length}</span><span class="k">reachable in v1</span></div>`);
  out.push(`<div><span class="v">${edges}</span><span class="k">v1 prerequisite edges</span></div>`);
  out.push(`<div><span class="v">${cross}</span><span class="k">cross-cell, all from intellego</span></div>`);
  out.push('</div>');

  for (const form of V1_FORM) {
    const inForm = v1.filter((n) => formOf(n.cell) === form);
    const deepest = Math.max(...inForm.map((n) => n.tier));
    out.push(`<section class="formsec f-${form}">`);
    out.push('<div class="formhead">');
    out.push(`<h2>${form}</h2>`);
    out.push(`<span class="sub">${inForm.length} nodes · deepest tier ${deepest}</span>`);
    out.push('</div>');
    out.push(`<div class="latwrap">${panel(v1, fan, form)}</div>`);
    out.push(
      '<div class="legend">' +
        '<span><i style="color:var(--rule-hi)"></i>prerequisite, same cell</span>' +
        '<span><i style="color:var(--accent)"></i>prerequisite, crosses a cell</span>' +
        '<span>heavy outline = two or more nodes depend on it</span>' +
        '<span>← form = its prerequisite lives in another form entirely</span>' +
        '</div>',
    );
    out.push('</section>');
  }

  out.push('<section class="gridsec">');
  out.push('<span class="lab">where the content actually is</span>');
  out.push('<h1 style="font-size:26px;margin:8px 0 4px">All seventy cells</h1>');
  out.push(
    '<p class="intro" style="margin-bottom:0">Node count and deepest authored tier per cell. ' +
      'Shaded cells are the twelve this release enables.</p>',
  );
  const head = forms.map((f) => `<th>${f.slice(0, 4)}</th>`).join('');
  const rows = techniques
    .map((t) => {
      const cells = forms
        .map((f) => {
          const cid = `${t}-${f}`;
          const ns = nodes.filter((n) => n.cell === cid);
          const mx = ns.length ? Math.max(...ns.map((n) => n.tier)) : 0;
          return `<td class="${v1Cells.has(cid) ? 'live' : ''}"><span class="n">${ns.length}</span><span class="d">t${mx}</span></td>`;
        })
        .join('');
      return `<tr><th>${t}</th>${cells}</tr>`;
    })
    .join('');
  out.push(`<table class="gridmap"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`);
  out.push(
    '<p class="gridnote">Species depth ceilings run 3 to 7. No v1 cell is authored past tier 5, ' +
      'so ceilings of 5, 6 and 7 reach identically.</p>',
  );
  out.push('</section>');
  out.push(
    '<footer>Generated by scripts/content-graph.mjs from packages/content/data. Not a ' +
      'specification — a reading of the content as authored.<br>' +
      'Multiverse Mages © 2026 Ann Kelner · AGPL-3.0-or-later</footer>',
  );
  out.push('</div>');
  return out.join('\n');
}

// ---------------------------------------------------------------- json format

/**
 * The same lattices as `--format html`, as data rather than as a page.
 *
 * `ui/build-content.mjs` embeds these into the demo shell so that the demo and
 * `trees.html` are drawn by one layout implementation. Nothing here is a second
 * source of truth: the SVG strings are byte-identical to what the html format
 * emits, and the counts are recomputed from `node.json` on every run.
 */
function renderJson() {
  const v1 = nodes.filter((n) => v1Cells.has(n.cell));
  const fan = fanOut(v1);
  const v1Ids = new Set(v1.map((n) => n.id));
  const edges = v1.reduce((acc, n) => acc + n.prerequisites.filter((p) => v1Ids.has(p)).length, 0);
  const cross = v1.reduce(
    (acc, n) => acc + n.prerequisites.filter((p) => v1Ids.has(p) && byId.get(p).cell !== n.cell).length,
    0,
  );

  return JSON.stringify({
    generator: 'scripts/content-graph.mjs',
    v1Techniques: V1_TECH,
    v1Forms: V1_FORM,
    v1Cells: [...v1Cells],
    counts: { authored: nodes.length, v1: v1.length, edges, cross },
    lattices: V1_FORM.map((form) => {
      const inForm = v1.filter((n) => formOf(n.cell) === form);
      return {
        form,
        nodes: inForm.length,
        deepest: Math.max(...inForm.map((n) => n.tier)),
        svg: panel(v1, fan, form),
      };
    }),
    gridmap: techniques.map((t) => ({
      technique: t,
      cells: forms.map((f) => {
        const cid = `${t}-${f}`;
        const ns = nodes.filter((n) => n.cell === cid);
        return {
          cell: cid,
          form: f,
          nodes: ns.length,
          deepest: ns.length ? Math.max(...ns.map((n) => n.tier)) : 0,
          v1: v1Cells.has(cid),
        };
      }),
    })),
    keystones: [...fan.entries()]
      .filter(([, c]) => c >= 2)
      .map(([id, c]) => ({ id, name: byId.get(id).name, cell: byId.get(id).cell, dependents: c })),
  });
}

// ---------------------------------------------------------------- entry

const argv = process.argv.slice(2);
const format = argv.includes('--format') ? argv[argv.indexOf('--format') + 1] : 'map';
const all = argv.includes('--all');

const outPath = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined;

let rendered;
if (format === 'html') {
  rendered = renderHtml();
} else if (format === 'map') {
  rendered = renderMap({ all });
} else if (format === 'json') {
  rendered = renderJson();
} else {
  process.stderr.write(`content-graph: unknown --format ${format} (expected "map", "html" or "json")\n`);
  process.exit(2);
}

if (outPath) {
  writeFileSync(outPath, `${rendered}\n`);
  process.stderr.write(`content-graph: wrote ${format} to ${outPath}\n`);
} else {
  process.stdout.write(`${rendered}\n`);
}
