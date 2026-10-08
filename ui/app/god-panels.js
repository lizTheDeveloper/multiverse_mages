/*
 * Multiverse Mages — edicts on a cell, and the ascension checklist.
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

import { h, fill } from './dom.js';
import { ascensionChecklist, priceText, whyDenied } from './explain.js';

/**
 * The edict verbs for one cell (vision §3: a god may carve one cell open
 * against the ruleset, or close one the ruleset allows).
 *
 * - **Dispensation** (action 5, param `cellId`) — offered on a cell the
 *   ruleset forbids.
 * - **Interdiction** (action 6, param `cellId`) — offered on a permitted cell.
 * - **Revoke** (action 7, param edict index) — offered on a cell an edict
 *   already holds.
 *
 * Which of the three applies is read off the server: `academy.permittedCells`
 * (which `agent-api` computes with `permits()`, so the page does not) and the
 * ruleset block's edict slots. The server refuses a dispensation on a permitted
 * cell and a second edict on one cell, so only the verb that can mean something
 * is offered. Whether it is legal *now* is mask[5|6|7], and a dark button says
 * why with {@link whyDenied}.
 *
 * Revoke's parameter is the edict's index in the server's edict order, taken
 * from the slot the ruleset block puts it in. The two orders agree while no
 * edict sits in a recycled entity slot — see the PR for the case where they
 * may not.
 *
 * @returns `{sig, node}`: rebuild only when `sig` changes, so a button under
 *   the pointer is not replaced between press and release.
 */
export function edictControls(f, content, cellId, { act, isBusy }) {
  const rules = f.ruleset();
  const edict = rules.edicts.find((e) => !e.empty && e.cellId === cellId);
  const permitted = f.raw.academy?.permittedCells;
  const used = rules.edicts.filter((e) => !e.empty).length;

  let id;
  let params;
  let verb;
  let gloss;
  if (edict) {
    id = 7;
    params = [edict.slot];
    verb = `Revoke this ${edict.kindName}`;
    gloss = 'Frees the edict slot; the cell goes back to whatever its technique and form say.';
  } else if (!Array.isArray(permitted)) {
    return { sig: 'none', node: h('div', { className: 'edict-box' }, h('span', { className: 'edict-why' }, 'Whether this cell is permitted is not visible in this frame, so no edict is offered.')) };
  } else if (permitted.includes(cellId)) {
    id = 6;
    params = [cellId];
    verb = 'Interdiction — close this cell';
    gloss = 'Forbids just this cell while its technique and form stay permitted. Uses one edict slot.';
  } else {
    id = 5;
    params = [cellId];
    verb = 'Dispensation — open this cell';
    gloss = 'Permits just this cell although its technique or form is forbidden. Uses one edict slot.';
  }
  const legal = f.isLegal(id);
  const reasons = whyDenied(f, content, id);
  const busy = isBusy();
  const sig = JSON.stringify([cellId, id, params, legal, reasons.map((r) => r.text), used, busy]);

  const node = h('div', { className: 'edict-box' },
    h('div', { className: 'edict-head' }, `Edict · ${used} slot${used === 1 ? '' : 's'} in use`),
    h('button', {
      type: 'button',
      className: 'edict-btn',
      'data-action': id,
      disabled: !legal || busy,
      title: legal ? `${verb} (${priceText(content, id)}, base price)` : reasons.map((r) => r.text).join('; '),
      onclick: () => act(id, params, verb),
    }, verb, h('span', { className: 'edict-price' }, priceText(content, id))),
    h('div', { className: 'edict-gloss' }, gloss,
      ' Price shown is the base price: the server adds a surcharge soon after another permit, forbid or edict, and the exact surcharge is not published to this page.'),
    legal ? null : h('ul', { className: 'edict-why' },
      reasons.map((r) => h('li', { title: `read from ${r.source}` }, r.text))));
  return { sig, node };
}

const MARK = { met: '✓', unmet: '✗', unknown: '?' };
const SUMMIT_MARK = { met: '✓', short: '½', orphaned: '…', none: '·' };

/** Per-cell Mastery readings, collapsed: which cells are closest, and what each lacks. */
function summitDetails(c, content) {
  if (c.summits === null || c.summits.length === 0) return null;
  const need = (content.ascension ?? {})['summit-copies'] ?? 2;
  const line = (row) => {
    const holders = row.holders === 1 ? '1 living mage holds it' : `${row.holders} living mages hold it`;
    const copies = row.copies === 1 ? '1 copy' : `${row.copies} copies`;
    const lack = row.state === 'met' ? ''
      : row.state === 'short' ? ` — needs ${need - row.copies} more cop${need - row.copies === 1 ? 'y' : 'ies'}`
      : row.state === 'orphaned' ? ' — no living mage holds it'
      : ' — nobody has reached it';
    return h('li', { className: `asc-summit asc-summit-${row.state}` },
      h('span', { className: 'asc-mark' }, SUMMIT_MARK[row.state]),
      h('span', null, `${row.cell}: ${row.node}${row.tier === undefined ? '' : ` (tier ${row.tier})`} — ${holders}, ${copies}${lack}`));
  };
  const met = c.summits.filter((r) => r.state === 'met').length;
  return h('details', { className: 'asc-summits' },
    h('summary', null, `Each permitted cell’s deepest node (${met} of ${c.summits.length} mastered)`),
    h('ul', { className: 'asc-list' }, c.summits.map(line)));
}

/** The checklist, as a node. `compact` drops the per-item sources. */
export function ascensionNode(f, content, compact = false) {
  const c = ascensionChecklist(f, content);
  const item = (it) => h('li', { className: `asc-item asc-${it.status}`, title: `${it.source}${it.note ? ` — ${it.note}` : ''}` },
    h('span', { className: 'asc-mark', 'aria-label': it.status === 'unknown' ? 'not shown here' : it.status }, MARK[it.status]),
    h('span', { className: 'asc-label' }, it.label),
    h('span', { className: 'asc-val' }, `${it.value} / ${it.target}`),
    compact || !it.note ? null : h('span', { className: 'asc-note' }, it.note));
  return h('div', { className: 'asc' },
    h('div', { className: `asc-open ${c.open ? 'yes' : 'no'}` },
      c.open ? 'A path is open now — you may Declare ascension.' : 'No path is open yet — Declare ascension stays unavailable until one is.'),
    h('ul', { className: 'asc-list' }, item(c.gate)),
    h('div', { className: 'asc-path' }, 'Mastery — all of:'),
    h('ul', { className: 'asc-list' }, c.mastery.map(item)),
    summitDetails(c, content),
    h('div', { className: 'asc-path' }, 'Enduring Canon — at each of several era boundaries in a row:'),
    h('ul', { className: 'asc-list' }, c.canon.map(item)),
    h('div', { className: 'asc-foot' },
      c.canon.some((it) => it.status === 'unknown') || c.mastery.some((it) => it.status === 'unknown')
        ? '✓ met · ✗ not met · ? this recording does not carry it. '
        : '✓ met · ✗ not met. ',
      c.published ? 'Thresholds are read from content.' : 'Thresholds are the in-game guide’s; this server does not publish them.'));
}

/** Keeps a host showing the checklist, rebuilding only when it changes. */
export function paintAscension(host, f, content, compact) {
  const node = ascensionNode(f, content, compact);
  const sig = node.textContent;
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  // Keep the per-cell list open across ticks if the player opened it.
  const open = host.querySelector('details.asc-summits')?.open === true;
  const details = node.querySelector('details.asc-summits');
  if (details !== null) details.open = open;
  fill(host, node);
}
