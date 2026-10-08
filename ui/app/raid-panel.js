/*
 * Multiverse Mages — the Raids tab: portal seats, raiders, and raid reports.
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
 * Vision §8/§8b: the other universes in your bubble sit in your portal seats,
 * and action 14 on a seat raids whoever is in it.
 *
 * ## What this reads, and what it never sends
 *
 * - Your own `GET /u/<you>/live/raids` — who is in each seat, your outbound
 *   log, and the raids opened on you (`inbound`).
 * - Each bubble-mate's **public** `GET /u/<them>/live/frames` — their last
 *   frame, for a strength summary. Read with a bare `fetch`: no token, no
 *   credentials, no referrer. **Your owner token never goes to a peer route**;
 *   it rides only on your own submits, through the page's `act`.
 *
 * Legality is the server's: the Raid button follows mask[14] and the
 * candidate for that seat. The page adds one refusal of its own — an empty or
 * ended seat — because the server would charge for the portal and open
 * nothing (`packages/scenario/src/raids.ts`: an undefined rival returns).
 *
 * Polling never outpaces the world clock (one tick a second in play), backs off
 * on errors, and stops for a universe that is gone or ended.
 */

import { h, fill } from './dom.js';
import { describeRaid, namedMages, priceText, raidBlockers, raidFeedText, roleId, shortId, whyDeniedText } from './explain.js';

const RAIDS_POLL_MS = 3000;
const PEER_POLL_MS = 10000;
const MAX_BACKOFF_MS = 60000;
/** Polls of /live/raids after an admitted action 14 before saying no raid opened. */
const NO_RAID_AFTER_POLLS = 3;
const BARE = { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' };

/**
 * @param o.session     the page's session (for `content`, `decode`, `last`)
 * @param o.universeId  this browser's universe id
 * @param o.host        the Raids tab's panel element
 * @param o.reports     the fixed container report cards go in
 * @param o.tab         the Raids tab button (for the inbound alarm)
 * @param o.act         `(kind, params, label) => payload` — the page's submit, which carries the token
 * @param o.vocab       `mageVocabulary(content)`
 * @param o.onFeed      `(tick, text, inbound) => void`
 * @param o.isEnded     `() => boolean`
 */
export function mountRaids(o) {
  const { session, universeId, host, reports, tab, act, vocab, onFeed, isEnded } = o;
  const content = session.content;
  const RAIDER = roleId(content, 'raider');
  const dismissedKey = `mm.raidsDismissed.${universeId}`;
  const dismissed = loadSeen(dismissedKey);
  /** Records already put in the activity feed this page load. */
  const fed = new Set();

  const model = {
    seats: {},
    /** Universe id → its public name, for every universe ever seen in a seat or a raid. */
    names: new Map(),
    log: [],
    inbound: [],
    loaded: false,
    error: null,
    peers: new Map(),
    pending: null,
    cards: [],
  };
  let lastSig = '';
  let stopped = false;
  let raidsTimer = null;
  let peerTimer = null;
  let backoff = RAIDS_POLL_MS;

  // ------------------------------------------------------------- polling
  async function pollRaids() {
    if (stopped) return;
    if (isEnded() && model.loaded) { stopped = true; return; }
    if (document.hidden && model.loaded) { schedule(); return; }
    try {
      const res = await fetch(`/u/${encodeURIComponent(universeId)}/live/raids`, BARE);
      if (res.status === 404) { stopped = true; return; } // the page's own poll sends the player on
      if (!res.ok) throw new Error(`raids ${res.status}`);
      absorb(await res.json());
      model.error = null;
      backoff = RAIDS_POLL_MS;
    } catch {
      model.error = 'Could not read your raid log; retrying.';
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
    paint();
    schedule();
  }
  function schedule() {
    if (stopped) return;
    clearTimeout(raidsTimer);
    raidsTimer = setTimeout(pollRaids, backoff);
  }

  function absorb(body) {
    // A seat is `{universeId, name, species}` or null (a bare id from an older server).
    const raw = body.seats && typeof body.seats === 'object' ? body.seats : {};
    model.seats = {};
    for (const [seat, v] of Object.entries(raw)) {
      const id = typeof v === 'string' ? v : (v && typeof v.universeId === 'string' ? v.universeId : null);
      model.seats[seat] = id;
      if (id && v && typeof v.name === 'string') model.names.set(id, v.name);
    }
    const log = Array.isArray(body.log) ? body.log.filter((r) => r && r.outbound === true) : [];
    const inbound = Array.isArray(body.inbound) ? body.inbound : [];
    const first = !model.loaded;
    for (const r of log) {
      const key = `out:${r.raidId}`;
      if (fed.has(key)) continue;
      fed.add(key);
      const target = seatOfRecord(r);
      onFeed(r.worldTick, raidFeedText(r, 'outbound', target), false);
      // Raids already in the log when the page opened are history, not news.
      if (!first) card(r, 'outbound', target, key);
    }
    for (const entry of inbound) {
      const r = entry?.record;
      if (!r) continue;
      const key = `in:${shortId(entry.fromUniverseId)}:${r.raidId}`;
      if (fed.has(key)) continue;
      fed.add(key);
      onFeed(r.worldTick, raidFeedText(r, 'inbound', inboundLabel(entry)), true);
      // An inbound raid stays on screen until it is dismissed — across reloads,
      // which is why only a dismissal is remembered.
      if (!dismissed.has(key)) card(r, 'inbound', inboundLabel(entry), key);
    }
    if (model.pending !== null) {
      if (log.length > model.pending.logLength) {
        model.pending = null;
      } else if ((model.pending.polls += 1) >= NO_RAID_AFTER_POLLS) {
        noRaidCard(model.pending);
        model.pending = null;
      }
    }
    model.log = log;
    model.inbound = inbound;
    model.loaded = true;
    syncPeers();
  }

  /** A universe as the page names it: its public name and short id, as plain text. */
  function universeLabel(id, name) {
    const n = typeof name === 'string' && name !== '' ? name : model.names.get(id);
    return n ? `${n} (${shortId(id)})` : shortId(id);
  }
  function inboundLabel(entry) {
    return universeLabel(entry.fromUniverseId, entry.fromName);
  }

  /** Whom an outbound raid hit: the server's `target`, else the only seated mate. */
  function seatOfRecord(r) {
    if (r?.target && typeof r.target.universeId === 'string') return universeLabel(r.target.universeId, r.target.name);
    const ids = Object.values(model.seats).filter(Boolean);
    return ids.length === 1 ? universeLabel(ids[0]) : 'in your bubble';
  }

  function syncPeers() {
    for (const id of Object.values(model.seats)) {
      if (id && !model.peers.has(id)) model.peers.set(id, { state: 'unknown', frame: null, wait: 0, backoff: PEER_POLL_MS });
    }
    if (peerTimer === null) peerTimer = setTimeout(pollPeers, 0);
  }

  async function pollPeers() {
    peerTimer = null;
    if (stopped) return;
    if (!document.hidden) {
      const now = Date.now();
      for (const [id, p] of model.peers) {
        if (p.state === 'gone' || p.state === 'ended') continue; // stop polling it
        if (now < p.wait) continue;
        try {
          const last = await peerLast(id);
          if (last.gone) {
            p.state = 'gone';
          } else if (last.raw) {
            p.frame = session.decode(last.raw);
            p.state = p.frame.status() === 'running' ? 'running' : 'ended';
            p.status = p.frame.status();
          }
          p.backoff = PEER_POLL_MS;
          p.wait = now + PEER_POLL_MS;
        } catch {
          p.backoff = Math.min(p.backoff * 2, MAX_BACKOFF_MS);
          p.wait = now + p.backoff;
        }
      }
      paint();
    }
    if (!stopped) peerTimer = setTimeout(pollPeers, PEER_POLL_MS);
  }

  /** A bubble-mate's last frame, from its public route, with no credentials of ours. */
  async function peerLast(id) {
    const base = `/u/${encodeURIComponent(id)}/live/frames`;
    const head = await fetch(`${base}?since=999999999`, BARE);
    if (head.status === 404) return { gone: true };
    if (!head.ok) throw new Error(`peer ${head.status}`);
    const n = Number((await head.json()).from);
    if (!Number.isInteger(n) || n < 1) return {};
    const tail = await fetch(`${base}?since=${n - 1}`, BARE);
    if (tail.status === 404) return { gone: true };
    if (!tail.ok) throw new Error(`peer ${tail.status}`);
    const body = await tail.json();
    return { raw: Array.isArray(body.frames) ? body.frames[body.frames.length - 1] : undefined };
  }

  // ------------------------------------------------------------- report cards
  function card(record, perspective, label, key) {
    const d = describeRaid(record, perspective, label);
    const node = h('section', {
      className: `raid-card${d.inbound ? ' inbound' : ''}`,
      role: d.inbound ? 'alert' : 'status',
      'aria-label': d.title,
    },
    h('div', { className: 'raid-card-head' },
      h('span', { className: 'raid-card-title' }, d.inbound ? `⚠ ${d.title}` : d.title),
      h('button', { type: 'button', className: 'raid-card-close', title: 'Dismiss this report', 'aria-label': 'Dismiss', onclick: () => dismiss(key) }, '×')),
    h('div', { className: `raid-card-outcome ${d.weWon ? 'won' : 'lost'}` }, d.outcome),
    h('dl', {}, d.rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
    model.cards.push({ key, node, inbound: d.inbound });
    reports.append(node);
    alarm();
  }

  function noRaidCard(pending) {
    const key = `none:${pending.tick}`;
    const node = h('section', { className: 'raid-card warn', role: 'status' },
      h('div', { className: 'raid-card-head' },
        h('span', { className: 'raid-card-title' }, 'No raid opened'),
        h('button', { type: 'button', className: 'raid-card-close', 'aria-label': 'Dismiss', onclick: () => dismiss(key) }, '×')),
      h('div', {}, `The server admitted your portal to seat ${pending.seat} in year ${Math.floor(pending.tick / 12)}, but no raid was recorded. `
        + 'The portal also needs a mage who can actually cast her portal node, and how well a mage knows a node is not visible yet — '
        + 'check your favor and passage: the price may have been taken.'));
    model.cards.push({ key, node, inbound: false });
    reports.append(node);
  }

  function dismiss(key) {
    const i = model.cards.findIndex((c) => c.key === key);
    if (i >= 0) {
      model.cards[i].node.remove();
      model.cards.splice(i, 1);
    }
    if (key.startsWith('in:')) {
      dismissed.add(key);
      saveSeen(dismissedKey, dismissed);
    }
    alarm();
  }

  function alarm() {
    const n = model.cards.filter((c) => c.inbound).length;
    tab.textContent = n > 0 ? `Raids (${n} inbound!)` : 'Raids';
    tab.classList.toggle('alarm', n > 0);
  }

  // ------------------------------------------------------------- the panel
  function paint() {
    const f = session.last();
    if (!f) return;
    const visible = host.closest('.center-panel')?.classList.contains('active') ?? true;
    if (!visible) return;

    const mages = namedMages(f);
    const raiders = [...mages.values()].filter((m) => m.roleId === RAIDER);
    const roleRows = f.raw.candidateDetail?.byAction?.['10'] ?? [];
    const nameable = roleRows
      .map((row, slot) => ({ row, slot }))
      .filter(({ row }) => row.toRoleId === RAIDER)
      .slice(0, 8);
    const seats = Object.keys(model.seats).map(Number).sort((a, b) => a - b);

    const view = {
      tick: f.clock().worldTick, mask14: f.raw.mask[14], mask10: f.raw.mask[10],
      seats: seats.map((s) => {
        const id = model.seats[String(s)];
        const p = id ? model.peers.get(id) : undefined;
        return [s, id, p?.state, p?.frame?.raw?.obs?.[333]];
      }),
      raiders: raiders.map((m) => m.handle), nameable: nameable.map(({ row, slot }) => [row.handle, slot]),
      log: model.log.length, inbound: model.inbound.length, err: model.error, busy: o.isBusy(),
      favor: Math.floor(f.resources().favor), passage: f.raw.stocks?.passage,
    };
    const sig = JSON.stringify(view);
    if (sig === lastSig) return;
    lastSig = sig;

    const children = [];
    children.push(h('h2', { className: 'raid-h' }, 'Portal seats'));
    children.push(h('p', { className: 'raid-lede' },
      'Every other universe in your bubble sits in one of your portal seats. A raid sends your raiders through to take what they can. ',
      `Opening a portal costs ${priceText(content, 14)}.`));
    if (model.error) children.push(h('p', { className: 'raid-err' }, model.error));
    if (!model.loaded) children.push(h('p', { className: 'raid-muted' }, 'Reading your portal seats…'));
    else if (seats.length === 0) children.push(h('p', { className: 'raid-muted' }, 'You have no portal seats: this server runs universes alone.'));

    const seatList = h('div', { className: 'raid-seats' });
    for (const seat of seats) seatList.append(seatCard(f, seat, raiders.length));
    children.push(seatList);

    // Raiders
    children.push(h('h2', { className: 'raid-h' }, `Your raiders (${raiders.length} visible)`));
    children.push(h('p', { className: 'raid-muted' },
      'Mages named in this frame’s candidate lists and college rosters; a very large population may hold raiders this list does not show.'));
    const rl = h('ul', { className: 'raid-list' });
    for (const m of raiders) rl.append(h('li', {}, vocab.who(m), h('span', { className: 'raid-muted' }, ` — ${vocab.knows(m)}`)));
    if (raiders.length === 0) rl.append(h('li', { className: 'raid-muted' }, 'None yet. Name one below.'));
    children.push(rl);

    children.push(h('h3', { className: 'raid-h3' }, `Name a raider (assign role, ${priceText(content, 10)})`));
    const deny10 = whyDeniedText(f, content, 10);
    if (nameable.length === 0) {
      children.push(h('p', { className: 'raid-muted' },
        deny10 || 'No mage is offered the raider role this tick (the assign-role list holds 32 options, three per mage, so later mages may be cut off).'));
    } else {
      const ul = h('ul', { className: 'raid-list' });
      for (const { row, slot } of nameable) {
        const m = mages.get(row.handle);
        const label = m ? vocab.who(m) : `mage #${row.handle & 0xfffff}`;
        ul.append(h('li', {},
          h('button', {
            type: 'button', className: 'raid-btn', disabled: f.raw.mask[10] !== 1 || o.isBusy(),
            title: deny10 || `Make this mage a raider (slot ${slot} of action 10)`,
            onclick: async () => { await act(10, [slot], `Named a raider: ${label}`); lastSig = ''; paint(); },
          }, 'Make raider'),
          ' ', label, m ? h('span', { className: 'raid-muted' }, ` — ${vocab.knows(m)}`) : null));
      }
      children.push(ul);
    }

    // History
    children.push(h('h2', { className: 'raid-h' }, 'Raid history'));
    const hist = h('ul', { className: 'raid-list' });
    const all = [
      ...model.log.map((r) => ({ r, p: 'outbound', label: seatOfRecord(r) })),
      ...model.inbound.filter((e) => e?.record).map((e) => ({ r: e.record, p: 'inbound', label: inboundLabel(e) })),
    ].sort((a, b) => b.r.worldTick - a.r.worldTick);
    for (const { r, p, label } of all) {
      const d = describeRaid(r, p, label);
      hist.append(h('li', { className: p === 'inbound' ? 'raid-in' : '' },
        h('b', {}, d.title), ` — year ${Math.floor(r.worldTick / 12)}. `, d.outcome));
    }
    if (all.length === 0) hist.append(h('li', { className: 'raid-muted' }, 'No raids yet, either way.'));
    children.push(hist);

    fill(host, children);
  }

  function seatCard(f, seat, raiderCount) {
    const id = model.seats[String(seat)];
    const p = id ? model.peers.get(id) : undefined;
    const peer = id ? { state: p?.state ?? 'unknown', status: p?.status } : { state: 'empty' };
    const blockers = raidBlockers(f, content, seat, peer, raiderCount);
    const blocked = blockers.some((b) => b.blocks);
    const slot = (f.raw.candidates?.['14'] ?? []).findIndex((c) => c.params?.[0] === seat);
    const label = !id ? null : model.names.has(id) ? universeLabel(id) : `universe ${shortId(id)}`;

    const summary = h('dl', { className: 'raid-peer' });
    const row = (k, v) => summary.append(h('dt', {}, k), h('dd', {}, v));
    if (!id) {
      row('occupant', 'empty');
    } else if (peer.state === 'gone') {
      row('occupant', `empty — ${label} has left the server`);
    } else if (!p?.frame) {
      row('occupant', label);
      row('strength', 'reading…');
    } else {
      const pf = p.frame;
      const buckets = pf.mageBuckets();
      const living = buckets.reduce((n, b) => n + b.living, 0);
      const species = buckets.filter((b) => b.living > 0).map((b) => `${b.name} ${b.living}`).join(', ') || 'no living mages';
      const k = pf.knowledge();
      const inst = pf.institutions();
      const theirRaiders = [...namedMages(pf).values()].filter((m) => m.roleId === RAIDER).length;
      row('occupant', `${label}${peer.state === 'ended' ? ` — ended (${peer.status})` : ''}`);
      row('species', species);
      row('mages', `${living} living · ${theirRaiders} raider(s) visible`);
      row('magic', `${k.reduce((s, c) => s + c.nodesKnown, 0)} nodes in ${k.filter((c) => c.nodesKnown > 0).length} cells, deepest tier ${Math.max(0, ...k.map((c) => c.deepestTier))}`);
      row('institutions', `${inst.universities} universit${inst.universities === 1 ? 'y' : 'ies'}, library ${inst.libraryDepth} nodes`);
      row('worship', `tier ${pf.resources().worshipTier}`);
      row('as of', `their year ${Math.floor(pf.clock().worldTick / 12)}`);
    }

    const why = h('ul', { className: 'raid-why' });
    for (const b of blockers) {
      why.append(h('li', { className: b.blocks ? 'blocks' : 'advice' },
        b.text, h('span', { className: 'raid-src' }, ` [${b.source}]`)));
    }

    return h('div', { className: 'raid-seat', 'data-seat': seat },
      h('div', { className: 'raid-seat-head' },
        // Name and short id together: names are not unique, and a look-alike
        // name must not pass for someone else's universe.
        h('span', {}, id ? `Seat ${seat} — ${universeLabel(id)}` : `Seat ${seat}`),
        h('button', {
          type: 'button', className: 'raid-btn raid-go', disabled: blocked || slot < 0 || o.isBusy(),
          title: blocked ? blockers.filter((b) => b.blocks).map((b) => b.text).join('; ') : `Open a portal to seat ${seat} (${priceText(content, 14)})`,
          onclick: async () => {
            const logLength = model.log.length;
            const payload = await act(14, [slot], `Opened a portal to ${label}`);
            if (payload && payload.admitted !== false) {
              model.pending = { seat, tick: f.clock().worldTick, polls: 0, logLength };
              clearTimeout(raidsTimer);
              raidsTimer = setTimeout(pollRaids, 1000);
            }
            lastSig = '';
            paint();
          },
        }, 'Raid')),
      summary,
      blockers.length > 0 ? why : h('p', { className: 'raid-ok' }, 'The portal is open to this seat.'));
  }

  pollRaids();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !stopped) { clearTimeout(raidsTimer); pollRaids(); }
  });

  return {
    paint,
    stop: () => { stopped = true; clearTimeout(raidsTimer); clearTimeout(peerTimer); },
  };
}

function loadSeen(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function saveSeen(key, set) {
  try { window.localStorage.setItem(key, JSON.stringify([...set].slice(-500))); } catch { /* refused: cards may show again on reload */ }
}
