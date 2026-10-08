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
  const legal = f.raw.mask[id] === 1;
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
      title: legal ? `${verb} (${priceText(content, id)})` : reasons.map((r) => r.text).join('; '),
      onclick: () => act(id, params, verb),
    }, verb, h('span', { className: 'edict-price' }, priceText(content, id))),
    h('div', { className: 'edict-gloss' }, gloss),
    legal ? null : h('ul', { className: 'edict-why' },
      reasons.map((r) => h('li', {}, r.text, h('span', { className: 'edict-src' }, ` [${r.source}]`)))));
  return { sig, node };
}

const MARK = { met: '✓', unmet: '✗', unknown: '?' };

/** The checklist, as a node. `compact` drops the per-item sources. */
export function ascensionNode(f, content, compact = false) {
  const c = ascensionChecklist(f, content);
  const item = (it) => h('li', { className: `asc-item asc-${it.status}`, title: `${it.source}${it.note ? ` — ${it.note}` : ''}` },
    h('span', { className: 'asc-mark', 'aria-label': it.status === 'unknown' ? 'not visible yet' : it.status }, MARK[it.status]),
    h('span', { className: 'asc-label' }, it.label),
    h('span', { className: 'asc-val' }, `${it.value} / ${it.target}`),
    compact ? null : h('span', { className: 'asc-src' }, it.source),
    compact || !it.note ? null : h('span', { className: 'asc-note' }, it.note));
  return h('div', { className: 'asc' },
    h('div', { className: `asc-open ${c.open ? 'yes' : 'no'}` },
      c.open ? 'The server says a path is open now — Declare ascension is lit.' : 'Not open yet (the server’s mask for Declare ascension is dark).'),
    h('ul', { className: 'asc-list' }, item(c.gate)),
    h('div', { className: 'asc-path' }, 'Mastery — all of:'),
    h('ul', { className: 'asc-list' }, c.mastery.map(item)),
    h('div', { className: 'asc-path' }, 'Enduring Canon — at each of several era boundaries in a row:'),
    h('ul', { className: 'asc-list' }, c.canon.map(item)),
    h('div', { className: 'asc-foot' },
      '✓ met · ✗ not met · ? not visible yet — the frame does not carry it. ',
      c.published ? 'Thresholds are read from content.' : 'Thresholds are the in-game guide’s; this server does not publish them.'));
}

/** Keeps a host showing the checklist, rebuilding only when it changes. */
export function paintAscension(host, f, content, compact) {
  const node = ascensionNode(f, content, compact);
  const sig = node.textContent;
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  fill(host, node);
}
