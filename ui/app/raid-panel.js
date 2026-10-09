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
import { describeRaid, namedMages, portalLever, portalPrerequisiteText, portalStanding, priceOf, priceText, raidBlockers, rechargeText, raidFeedText, roleId, shortId, whyDeniedText } from './explain.js';

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
    /**
     * Seat → `{ name, speciesIds }` for every seated universe: who you could
     * invite a scholar from (action 16). A second species arrives only through
     * a portal from a universe that holds it — the author's rule of 2026-10-08.
     */
    holdings: {},
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
    const before = model.seats;
    model.seats = {};
    model.holdings = {};
    for (const [seat, v] of Object.entries(raw)) {
      const id = typeof v === 'string' ? v : (v && typeof v.universeId === 'string' ? v.universeId : null);
      model.seats[seat] = id;
      // `speciesIds` is absent from an older server; such a seat names no one.
      if (id && v && Array.isArray(v.speciesIds)) {
        model.holdings[seat] = { name: typeof v.name === 'string' ? v.name : shortId(id), speciesIds: v.speciesIds.filter(Number.isInteger) };
      }
      if (id && v && typeof v.name === 'string') model.names.set(id, v.name);
    }
    // A bubble-mate whose universe left the server (its player left and it
    // idled out, or it ended and was dropped) empties its seat, or a newcomer
    // takes it. Said in the feed, not changed silently under the player.
    if (model.loaded) {
      const tick = typeof body.worldTick === 'number' ? body.worldTick : (session.last()?.clock().worldTick ?? 0);
      for (const [seat, was] of Object.entries(before)) {
        const now = model.seats[seat] ?? null;
        if (!was || was === now) continue;
        leftNotice(was, tick, now === null ? `seat ${seat} is empty now` : `${universeLabel(now)} sits in seat ${seat} now`);
      }
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
      // The feed is in this universe's years: the record's tick is the attacker's clock.
      const here = Number.isInteger(entry.arrivedTick) ? entry.arrivedTick : (session.last()?.clock().worldTick ?? r.worldTick);
      onFeed(here, raidFeedText(r, 'inbound', inboundLabel(entry)), true);
      // An inbound raid stays on screen until it is dismissed — across reloads,
      // which is why only a dismissal is remembered.
      if (!dismissed.has(key)) card(r, 'inbound', inboundLabel(entry), key, entry.arrivedTick);
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

  /** Universes already announced as gone, so a seat change and a 404 say it once. */
  const announcedLeft = new Set();
  function leftNotice(id, tick, rest) {
    if (announcedLeft.has(id)) return;
    announcedLeft.add(id);
    onFeed(tick, `${universeLabel(id)} left your bubble — ${rest}`, false);
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
            if (p.state !== 'gone') leftNotice(id, session.last()?.clock().worldTick ?? 0, 'it has left the server');
            p.state = 'gone';
          } else if (last.raw) {
            p.frame = session.decode(last.raw);
            const was = p.state;
            p.state = p.frame.status() === 'running' ? 'running' : 'ended';
            p.status = p.frame.status();
            // Said once, in words: an ending is not a seat silently changing.
            // `abandoned` is the lobby's — its player left and it idled out.
            if (p.state === 'ended' && was !== 'ended') {
              onFeed(session.last()?.clock().worldTick ?? 0, p.status === 'abandoned'
                ? `${universeLabel(id)} was abandoned by its player — it has ended and can no longer be raided`
                : `${universeLabel(id)} has ended (${p.status}) — it can no longer be raided`, false);
            }
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
  /*
   * Reports are a queue, shown one at a time ("1 of N"). Playtest round 4:
   * two inbound raids stacked two cards over the middle of the screen, on top
   * of the Raids tab's seat buttons, so the player could not counter-raid; and
   * dismissing the top one revealed an identical one beneath, which read as
   * "× does nothing". Now:
   *
   * - one card, docked inside the Raids tab above the seats when that tab is
   *   open, and a small card in the bottom-right corner on every other tab —
   *   never over a seat's Raid button;
   * - × or Esc dismisses the shown report and brings up the next;
   * - "Acknowledge all" empties the queue;
   * - an inbound dismissal is remembered by raid id across reloads, as before.
   *   Every report is also in the Raid history list and the activity feed, so
   *   dismissing one loses nothing.
   */
  function card(record, perspective, label, key, arrivedTick) {
    const d = describeRaid(record, perspective, label, { arrivedTick });
    model.cards.push({
      key,
      inbound: d.inbound,
      warn: false,
      title: d.inbound ? `⚠ ${d.title}` : d.title,
      body: () => [
        h('div', { className: `raid-card-outcome ${d.empty ? 'empty' : d.weWon ? 'won' : 'lost'}` }, d.outcome),
        h('dl', {}, d.rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      ],
    });
    renderReports();
  }

  function noRaidCard(pending) {
    model.cards.push({
      key: `none:${pending.tick}`,
      inbound: false,
      warn: true,
      title: 'No raid opened',
      body: () => [h('div', {}, `The server admitted your portal to seat ${pending.seat} in year ${Math.floor(pending.tick / 12)}, but no raid was recorded. `
        + 'The portal also needs a mage who knows a portal node well enough to cast it — see Portal knowledge on the Raids tab for who holds one and at what mastery — '
        + 'and a raider to send. Check your favor and passage: the price may have been taken.')],
    });
    renderReports();
  }

  function remember(key) {
    if (!key.startsWith('in:')) return;
    // Another tab of this universe may have dismissed others since this one loaded.
    for (const k of loadSeen(dismissedKey)) dismissed.add(k);
    dismissed.add(key);
    saveSeen(dismissedKey, dismissed);
  }

  function dismiss(key) {
    const i = model.cards.findIndex((c) => c.key === key);
    if (i >= 0) model.cards.splice(i, 1);
    remember(key);
    renderReports();
  }

  function dismissAll() {
    for (const c of model.cards.splice(0)) remember(c.key);
    renderReports();
  }

  /** Docked in the Raids tab when it is open; a corner card otherwise. */
  function placeReports() {
    const panel = host.closest('.center-panel');
    const docked = panel?.classList.contains('active') ?? false;
    if (docked && reports.parentElement !== panel) panel.prepend(reports);
    if (!docked && reports.parentElement !== document.body) document.body.append(reports);
    reports.classList.toggle('docked', docked);
  }

  let shownKey = null;
  function renderReports() {
    placeReports();
    const c = model.cards[0];
    alarm();
    if (c === undefined) {
      shownKey = null;
      reports.replaceChildren();
      reports.hidden = true;
      return;
    }
    reports.hidden = false;
    const n = model.cards.length;
    const sig = `${c.key}|${n}`;
    if (shownKey === sig) return;
    const refocus = reports.contains(document.activeElement);
    shownKey = sig;
    const close = h('button', {
      type: 'button', className: 'raid-card-close', title: 'Dismiss this report (Esc)', 'aria-label': 'Dismiss this report', onclick: () => dismiss(c.key),
    }, '×');
    const node = h('section', {
      className: `raid-card${c.inbound ? ' inbound' : ''}${c.warn ? ' warn' : ''}`,
      role: c.inbound ? 'alert' : 'status',
      'aria-label': c.title,
      'data-key': c.key,
    },
    h('div', { className: 'raid-card-head' },
      h('span', { className: 'raid-card-title' }, c.title),
      h('span', { className: 'raid-card-count', title: 'Reports waiting to be read' }, `1 of ${n}`),
      close),
    ...c.body(),
    h('div', { className: 'raid-card-foot' },
      h('span', { className: 'raid-card-hint' }, 'Esc dismisses · every report stays in Raid history'),
      n > 1 ? h('button', { type: 'button', className: 'raid-card-all', onclick: dismissAll }, `Acknowledge all ${n}`) : null));
    reports.replaceChildren(node);
    if (refocus) close.focus();
  }

  // Esc dismisses the shown report — unless a dialog (a confirm step, the
  // guide) is open, which Esc belongs to first, or the player is typing.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || model.cards.length === 0 || ev.defaultPrevented) return;
    if (document.querySelector('.confirm-modal')) return;
    const help = document.getElementById('help-modal');
    if (help && !help.hidden) return;
    const t = ev.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/u.test(t.tagName))) return;
    dismiss(model.cards[0].key);
  }, true); // capture: runs before the guide's own Esc handler closes it

  function alarm() {
    const n = model.cards.filter((c) => c.inbound).length;
    tab.textContent = n > 0 ? `Raids (${n} inbound!)` : 'Raids';
    tab.classList.toggle('alarm', n > 0);
  }

  // ------------------------------------------------------------- the panel
  // The panel is rebuilt whenever what it shows changes, and the month changes
  // every tick: a rebuild between a button's press and its release swallows
  // the click, with no toast because nothing was sent (playtest round 4: "no
  // toast" naming a raider). No rebuild while a pointer is down in the panel;
  // the release repaints.
  let pressed = false;
  host.addEventListener('pointerdown', () => { pressed = true; });
  window.addEventListener('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    setTimeout(paint, 0);
  }, true);
  window.addEventListener('pointercancel', () => { pressed = false; }, true);

  function paint() {
    placeReports();
    if (pressed) return;
    const f = session.last();
    if (!f) return;
    const visible = host.closest('.center-panel')?.classList.contains('active') ?? true;
    if (!visible) return;

    const mages = namedMages(f);
    const raiders = [...mages.values()].filter((m) => m.roleId === RAIDER);
    const st = portalStanding(f, content);
    const roleRows = f.raw.candidateDetail?.byAction?.['10'] ?? [];
    // Portal holders first — best mastery, then youngest — then everyone else
    // the server offers the raider role, in its order. Playtest round 4: the
    // list was the first eight raider slots, and showed eight mages at 25%
    // while six holders at 63–79% sat in Portal knowledge with no button.
    const offered = roleRows.map((row, slot) => ({ row, slot })).filter(({ row }) => row.toRoleId === RAIDER);
    const ranked = rankedHolders(st, mages, RAIDER).filter((x) => offered.some(({ row }) => row.handle === x.handle));
    const nameable = [
      ...ranked.map((x) => offered.find(({ row }) => row.handle === x.handle)),
      ...offered.filter(({ row }) => !ranked.some((x) => x.handle === row.handle)),
    ].slice(0, Math.max(8, ranked.length));
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
      portal: f.raw.portal ?? null, permitted: f.raw.academy?.permittedCells ?? null,
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

    // Raiders. The count is the server's (`frame.portal.raiders`, every living
    // raider); the list can name only the mages this frame's candidate lists
    // and college rosters describe.
    const raiderTotal = st?.raiders ?? raiders.length;
    children.push(h('h2', { className: 'raid-h' }, `Your raiders (${raiderTotal})`));
    if (raiderTotal > raiders.length) {
      children.push(h('p', { className: 'raid-muted' },
        `${raiderTotal - raiders.length} of them ${raiderTotal - raiders.length === 1 ? 'is' : 'are'} not in this month’s candidate lists or college rosters, so not named below.`));
    }
    const rl = h('ul', { className: 'raid-list raid-raiders' });
    for (const m of raiders) {
      const holds = st?.holders.find((x) => x.handle === m.handle);
      rl.append(h('li', { 'data-handle': m.handle }, vocab.who(m),
        h('span', { className: 'raid-muted' }, ` — ${vocab.knows(m)}`),
        holds ? h('span', { className: holds.usable ? 'raid-ok-inline' : 'raid-muted' }, ` · ${st.nodeName(holds.nodeId)} at ${holds.pct}% mastery${holds.usable ? ' (usable)' : ` (needs ${st.needPct}%)`}`) : null));
    }
    if (raiderTotal === 0) rl.append(h('li', { className: 'raid-muted' }, 'None yet. Name one below.'));
    children.push(rl);

    // Portal knowledge: who holds a portal node and how well, against the
    // mastery the gate needs — the one condition no other panel shows.
    children.push(h('h3', { className: 'raid-h3' }, 'Portal knowledge'));
    const gap = portalPrerequisiteText(content, f.raw.academy?.permittedCells);
    if (gap) children.push(h('p', { className: 'raid-muted raid-prereq' }, gap));
    if (st === null) {
      children.push(h('p', { className: 'raid-muted' }, 'This server does not publish portal mastery.'));
    } else if (st.held === 0) {
      children.push(h('p', { className: 'raid-muted' }, 'No living mage knows a portal node yet.'));
    } else {
      children.push(h('p', { className: 'raid-portal-summary' },
        `${st.leadName}: ${st.held} mind${st.held === 1 ? '' : 's'} · ${st.usable} usable — a portal needs one holder at ${st.needPct}% mastery or more.`));
      const hl = h('ul', { className: 'raid-list raid-holders' });
      for (const x of st.holders.slice(0, 6)) {
        const m = mages.get(x.handle);
        hl.append(h('li', {}, m ? vocab.who(m) : `mage #${x.handle & 0xfffff}`,
          h('span', { className: 'raid-muted' }, ` — ${st.nodeName(x.nodeId)} at ${x.pct}%${x.roleId === RAIDER ? ', a raider' : ''}`)));
      }
      children.push(hl);
      const lever = portalLever(f, content, st);
      if (lever) children.push(h('p', { className: 'raid-lever' }, lever.replace(/^./u, (c) => c.toUpperCase()) + '.'));
      // One click: the best holder who is not yet a raider and whom the server
      // offers the raider role this month — whether or not anyone is usable
      // yet. Best is highest mastery now; among equals, the youngest, who has
      // the most years left to drill it. The server publishes no mastery
      // trajectory, and nothing in the rules makes the young learn faster, so
      // the page claims neither.
      const pick = ranked[0];
      if (pick) {
        const m = mages.get(pick.handle);
        const label = m ? vocab.who(m) : `mage #${pick.handle & 0xfffff}`;
        children.push(h('p', {}, h('button', {
          type: 'button', className: 'raid-btn raid-name-holder', disabled: !f.isLegal(10) || o.isBusy(),
          title: deny10Text(f) || `Make ${label} a raider (${priceText(content, 10)})`,
          onclick: () => nameRaider(pick.handle, label),
        }, `Make ${label} a raider`), h('span', { className: 'raid-muted' },
          ` — she knows ${st.nodeName(pick.nodeId)} at ${pick.pct}%, the best of the holders who are not raiders yet${ranked.length > 1 ? ' (highest mastery; among equals, the youngest)' : ''}`)));
      }
    }

    children.push(h('h3', { className: 'raid-h3' }, `Name a raider (assign role, ${priceText(content, 10)})`));
    const deny10 = whyDeniedText(f, content, 10);
    if (nameable.length === 0) {
      children.push(h('p', { className: 'raid-muted' },
        deny10 || 'No mage is offered the raider role this tick (the assign-role list holds 32 options, three per mage, so later mages may be cut off).'));
    } else {
      const ul = h('ul', { className: 'raid-list raid-nameable' });
      for (const { row } of nameable) {
        const m = mages.get(row.handle);
        const label = m ? vocab.who(m) : `mage #${row.handle & 0xfffff}`;
        const holds = st?.holders.find((x) => x.handle === row.handle);
        ul.append(h('li', {},
          h('button', {
            type: 'button', className: 'raid-btn', disabled: !f.isLegal(10) || o.isBusy(),
            title: deny10 || 'Make this mage a raider',
            onclick: () => nameRaider(row.handle, label),
          }, 'Make raider'),
          ' ', label, m ? h('span', { className: 'raid-muted' }, ` — ${vocab.knows(m)}`) : null,
          holds ? h('span', { className: 'raid-muted' }, ` · ${st.nodeName(holds.nodeId)} at ${holds.pct}%`) : null));
      }
      children.push(ul);
    }

    // History
    children.push(h('h2', { className: 'raid-h' }, 'Raid history'));
    const hist = h('ul', { className: 'raid-list' });
    const all = [
      ...model.log.map((r) => ({ r, p: 'outbound', label: seatOfRecord(r) })),
      ...model.inbound.filter((e) => e?.record).map((e) => ({ r: e.record, p: 'inbound', label: inboundLabel(e), at: e.arrivedTick })),
    ].map((x) => ({ ...x, here: Number.isInteger(x.at) ? x.at : x.p === 'outbound' ? x.r.worldTick : null }))
      // Newest first, in this universe's years; an inbound raid from a server
      // that did not say when it arrived sorts by the attacker's clock.
      .sort((a, b) => (b.here ?? b.r.worldTick) - (a.here ?? a.r.worldTick));
    for (const { r, p, label, at, here } of all) {
      const d = describeRaid(r, p, label, { arrivedTick: at });
      hist.append(h('li', { className: p === 'inbound' ? 'raid-in' : '' },
        h('b', {}, d.title), here === null ? ` — their year ${Math.floor(r.worldTick / 12)}. ` : ` — year ${Math.floor(here / 12)}. `, d.outcome));
    }
    if (all.length === 0) hist.append(h('li', { className: 'raid-muted' }, 'No raids yet, either way.'));
    children.push(hist);

    fill(host, children);
  }

  function deny10Text(f) { return whyDeniedText(f, content, 10); }

  /**
   * Names `handle` a raider. The slot is looked up in the newest frame at the
   * moment of the click, and the candidate's params ride along as `expect`, so
   * the lobby re-finds the slot at admission: a list that moved under the
   * click once made a raider of nobody (or a warden of somebody).
   */
  async function nameRaider(handle, label) {
    const f = session.last();
    const rows = f.raw.candidateDetail?.byAction?.['10'] ?? [];
    const slot = rows.findIndex((row) => row.handle === handle && row.toRoleId === RAIDER);
    if (slot < 0) {
      o.onFeed?.(f.clock().worldTick, `${label} is no longer offered the raider role this month`, false);
      lastSig = '';
      paint();
      return;
    }
    await act(10, [slot], `Named a raider: ${label}`, [handle, RAIDER]);
    lastSig = '';
    paint();
  }

  /**
   * What this god holds against the portal's price, and the cooldown: "passage
   * 12 / 16 · favor 30 / 16 · ready". Passage is the raid currency and the one
   * the page must make visible — playtest round 4 ran out of it after two raids
   * without anything on screen saying it existed.
   */
  function yourPortalText(f) {
    const price = priceOf(content, 14);
    const parts = [];
    const passageNeed = price.materials?.passage ?? 0;
    const passageHave = Math.floor((f.raw.stocks?.passage ?? 0) / 1024);
    if (passageNeed > 0) parts.push(`passage ${passageHave} / ${passageNeed}`);
    if (price.favor > 0) parts.push(`favor ${Math.floor(f.resources().favor)} / ${price.favor}`);
    const st = portalStanding(f, content);
    const recharge = st?.recharge ?? 0;
    parts.push(recharge > 0 ? rechargeText(recharge).replace(/^the portal is recharging — /u, 'recharging: ').replace(/ \(a raid.*$/u, '') : 'recharged');
    return parts.join(' · ');
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

    row('your portal', yourPortalText(f));

    const why = h('ul', { className: 'raid-why' });
    for (const b of blockers) {
      why.append(h('li', { className: b.blocks ? 'blocks' : 'advice', title: `read from ${b.source}` }, b.text));
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
            const payload = await act(14, [slot], `Opened a portal to ${label}`, [seat]);
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
    /** Re-docks the report card after a tab change (paint() runs only on the Raids tab). */
    place: placeReports,
    /**
     * Where action 16 could fetch each species from: `{ loaded, seatCount,
     * sourceOf(speciesId) }`, where `sourceOf` gives the lowest seat whose
     * universe holds that species, as `{ seat, name }`, or `null`.
     */
    invitation: () => ({
      loaded: model.loaded,
      seatCount: Object.keys(model.seats).length,
      held: [...new Set(Object.values(model.holdings).flatMap((x) => x.speciesIds))],
      sourceOf(speciesId) {
        const seats = Object.keys(model.holdings).map(Number).sort((a, b) => a - b);
        for (const seat of seats) {
          const holding = model.holdings[String(seat)];
          if (holding.speciesIds.includes(speciesId)) return { seat, name: holding.name };
        }
        return null;
      },
    }),
    stop: () => { stopped = true; clearTimeout(raidsTimer); clearTimeout(peerTimer); },
  };
}

/**
 * Portal holders who are not raiders, best first: highest mastery now, then
 * the youngest (most years left to drill it), then by handle for a stable order.
 */
function rankedHolders(st, mages, RAIDER) {
  if (st === null) return [];
  const age = (x) => mages.get(x.handle)?.ageTicks ?? Number.POSITIVE_INFINITY;
  const best = new Map();
  for (const x of st.holders) {
    if (x.roleId === RAIDER) continue;
    const had = best.get(x.handle);
    if (had === undefined || x.mastery > had.mastery) best.set(x.handle, x);
  }
  return [...best.values()].sort((a, b) => b.mastery - a.mastery || age(a) - age(b) || a.handle - b.handle);
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
