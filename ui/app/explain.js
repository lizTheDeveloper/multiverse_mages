/*
 * Multiverse Mages — why an action is dark, what a raid did, how far ascension is.
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
 * Words for facts the frames already carry. **Nothing here decides legality.**
 *
 * §5: the client computes no rules. The mask and the candidate lists are the
 * server's answer to "may I"; this module only says, beside a "no", which of
 * the observed facts line up with it — and names the observation each sentence
 * was read from, so a player (and a reviewer) can check it. Prices are
 * content's base prices, which the server may raise (hysteresis, unease), so
 * every price here is stated as "at least".
 *
 * Every function returns plain data — strings and numbers — for a page to
 * render with `textContent`. No HTML is built here.
 */

export const FP = 1024;

/**
 * Whether action `id` is legal on frame `f`: the mask, and only while the
 * episode is running (an ended universe's last frame keeps its final mask).
 * Accepts a bare frame-shaped object, as tests build one.
 */
const isLegal = (f, id) =>
  typeof f.isLegal === 'function' ? f.isLegal(id) : (f.raw?.status ?? 'running') === 'running' && f.raw?.mask?.[id] === 1;
const units = (fp) => fp / FP;
const num = (v) => (Math.abs(v) < 10 ? v.toFixed(1).replace(/\.0$/u, '') : v.toFixed(0));

/** `RAID_SIDE` in packages/state/src/enums.ts. */
export const RAID_SIDE = Object.freeze({ attacker: 0, defender: 1 });

/** `RAID_END_REASON` in packages/rules-raid/src/termination.ts, in words. */
export const RAID_END_REASON_TEXT = Object.freeze({
  1: { id: 'portalCollapsed', text: 'the portal collapsed — its stability ran out' },
  2: { id: 'objectivesResolved', text: 'every objective was captured, looted or destroyed' },
  3: { id: 'sideEliminated', text: 'one side had no combatant left standing' },
  4: { id: 'ceilingReached', text: 'the engagement hit its hard tick ceiling (an engine fault, not a tactic)' },
  5: { id: 'raidersWithdrew', text: 'the raiders withdrew through the portal' },
});

/** The cell the portal gate reads (`PORTAL_CELL_ID` in packages/rules-raid/src/portal.ts). */
export const PORTAL_CELL = 'rego-limen';

/** A universe id as a short, safe label. Only hex and dashes survive. */
export const shortId = (id) => String(id ?? '').replace(/[^0-9a-f-]/giu, '').slice(0, 8) || '?';

/** The role id content publishes for a role name (`content.mageRoles`). */
export function roleId(content, name) {
  const hit = Object.entries(content.mageRoles ?? {}).find(([, n]) => n === name);
  return hit === undefined ? undefined : Number(hit[0]);
}

/** Every mage descriptor a frame names, by handle — candidate detail and academy. */
export function namedMages(f) {
  const out = new Map();
  for (const table of [f.raw.candidateDetail?.mages, f.raw.academy?.mages]) {
    for (const [h, m] of Object.entries(table ?? {})) out.set(Number(h), m);
  }
  return out;
}

/** Content's favor price (world units) and material price (`{kind: units}`) for an action. */
export function priceOf(content, id) {
  const favor = units(content.actionCosts?.[String(id)] ?? 0);
  const raw = content.actionMaterialCosts?.[String(id)];
  const materials = raw === undefined ? null : Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, units(v)]));
  return { favor, materials, materialsKnown: content.actionMaterialCosts !== undefined };
}

/** "6 favor + 4 essence", or "free". */
export function priceText(content, id) {
  const p = priceOf(content, id);
  const parts = [];
  if (p.favor > 0) parts.push(`${num(p.favor)} favor`);
  for (const [k, v] of Object.entries(p.materials ?? {})) parts.push(`${num(v)} ${k}`);
  return parts.length === 0 ? 'free' : parts.join(' + ');
}

const PARAMETERIZED = new Set([8, 9, 10, 11, 12, 13, 14, 16]);

const NO_CANDIDATE_HINT = {
  8: 'founding knowledge only plants the first node of a school, and every such node in a permitted cell is already known in your world — or your founding grants are spent',
  9: 'no living mage can be blessed',
  10: 'no living mage can change role',
  11: 'no university can be funded or founded',
  12: 'no permitted cell can be encouraged',
  13: 'no other tradition can be adopted',
  14: 'no living mage holds a portal node in a permitted cell',
  16: 'no species is available to invite (it needs portal magic, and a species you do not already have)',
};

/**
 * The affordability facts behind a dark action, each with its source.
 * Empty when content's base price is covered — which does not make it legal.
 */
function affordability(f, content, id) {
  const out = [];
  const p = priceOf(content, id);
  const favor = f.resources().favor;
  if (p.favor > 0 && favor < p.favor) {
    out.push({
      text: `not enough favor: you have ${num(favor)}, it costs at least ${num(p.favor)}`,
      source: 'resources.favor vs content.actionCosts',
    });
  }
  const stocks = f.raw.stocks;
  for (const [kind, need] of Object.entries(p.materials ?? {})) {
    if (stocks === undefined || typeof stocks[kind] !== 'number') continue;
    const have = units(stocks[kind]);
    if (have < need) {
      out.push({
        text: `not enough ${kind}: you have ${num(have)}, it costs ${num(need)}`,
        source: `stocks.${kind} vs content.actionMaterialCosts`,
      });
    }
  }
  return out;
}

/**
 * Why "grant founding knowledge" (action 8) has nothing to offer, from the
 * server's two published facts (`frame.founding`): grants left in the budget,
 * and unknown first-of-a-school nodes in permitted cells. `null` when the frame
 * does not carry them (a recording), or when neither explains it.
 */
export function foundingWhy(f) {
  const g = f.raw.founding;
  if (g === undefined) return null;
  if (g.grantsRemaining === 0) {
    return {
      text: 'you have no founding grants left — more are earned as your mages discover knowledge on their own',
      source: 'frame.founding.grantsRemaining',
    };
  }
  if (g.unknownRoots === 0) {
    return {
      text: 'every school’s first node is already known in your world — founding knowledge only plants the first node of a school',
      source: 'frame.founding.unknownRoots',
    };
  }
  return null;
}

/**
 * Why action `id` is dark this tick: `[]` when the mask says it is legal,
 * otherwise one or more `{text, source}` sentences. The last resort is the
 * mask itself — the frame carries no reason for every "no".
 */
export function whyDenied(f, content, id) {
  if (isLegal(f, id)) return [];
  if (f.status() !== 'running') {
    return [{ text: `this universe is over (${f.status()}) — nothing can be done in it now`, source: 'frame.status' }];
  }
  if (f.clock().engaged) {
    return [{ text: 'a raid is in progress — only the defender may change the ruleset until it ends', source: 'clock.mode' }];
  }
  const reasons = [];
  const cands = f.raw.candidates?.[String(id)];
  if (PARAMETERIZED.has(id) && (!Array.isArray(cands) || cands.length === 0)) {
    const founding = id === 8 ? foundingWhy(f) : null;
    if (founding !== null) return [founding];
    reasons.push({ text: `nothing to act on: ${NO_CANDIDATE_HINT[id] ?? 'no candidates'}`, source: `candidates[${id}] is empty` });
    return reasons;
  }
  if (id === 7 && f.ruleset().edicts.every((e) => e.empty)) {
    return [{ text: 'no edict stands to revoke', source: 'ruleset.edicts' }];
  }
  if (id === 15) {
    return [{ text: 'the world has not qualified for either path yet — see the Ascension checklist', source: 'mask[15]' }];
  }
  reasons.push(...affordability(f, content, id));
  if (reasons.length > 0) return reasons;
  if (id === 5 || id === 6) {
    const used = f.ruleset().edicts.filter((e) => !e.empty).length;
    return [{
      text: `likely no free edict slot: ${used} in use. the number of edicts you may keep grows with worship tier, and this page cannot see the exact number`,
      source: 'mask[' + id + '] + ruleset.edicts',
    }];
  }
  return [{ text: 'not allowed this month, and the server does not say why', source: `mask[${id}]` }];
}

/**
 * What changing tradition from `fromId` to `toId` does, as far as published
 * content says — for the confirm step. Returns `{lines: string[], risk, gaps}`.
 *
 * Read from `content.traditions[].hooks` (which store kind holds knowledge
 * where) and `content.traditionChange` (`tradition-shock`, `-ticks`). The one
 * consequence stated without a published number behind it is favor falling to
 * zero, which is how the action resolves (`god/interventions.ts`,
 * `traditionPlan`) and is named as a gap so a reviewer can see it.
 */
export function traditionChangeReading(f, content, fromId, toId) {
  const t = (id) => (content.traditions ?? []).find((x) => x.traditionId === id);
  const from = t(fromId);
  const to = t(toId);
  const name = (x, id) => x?.name ?? `tradition ${id}`;
  const lines = [];
  const gaps = [];
  lines.push('Your favor: the price is paid, and whatever favor is left after it is spent too — you start again from 0.');
  const shock = content.traditionChange?.shock;
  const ticks = content.traditionChange?.shockTicks;
  if (shock !== undefined && ticks !== undefined) {
    lines.push(
      `Worship: for ${Math.round(ticks / 12)} years your people’s worship aims at ${Math.round((shock / FP) * 100)}% of what it otherwise would. `
      + 'Your worship tier will fall over that time, and the favor you can hold and the edicts you can keep fall with it.',
    );
  } else {
    lines.push('Worship: the change throws your people into upheaval and worship falls for years.');
    gaps.push('this server does not publish how deep or how long the worship shock is');
  }
  const store = (x) => x?.hooks?.store?.kind;
  const fromStore = store(from);
  const toStore = store(to);
  const inst = f.institutions();
  if (fromStore === undefined || toStore === undefined) {
    lines.push('Knowledge: anything kept in a form the new tradition cannot hold is destroyed.');
    gaps.push('this server does not publish the traditions’ storage rules');
  } else if (fromStore === toStore) {
    lines.push(`Knowledge: nothing is destroyed — ${name(from, fromId)} and ${name(to, toId)} both keep knowledge in the same places.`);
  } else if (toStore === 'palace') {
    lines.push(
      `Knowledge: every book is destroyed — every grimoire and every library shelf (${inst.grimoires} grimoire${inst.grimoires === 1 ? '' : 's'}, ${inst.libraryDepth} node${inst.libraryDepth === 1 ? '' : 's'} shelved now). `
      + `${name(to, toId)} keeps knowledge only in minds and memory palaces, so anything known only from a book is lost for good.`,
    );
  } else if (fromStore === 'palace') {
    lines.push(
      `Knowledge: everything held in memory palaces is destroyed. ${name(to, toId)} keeps knowledge in minds and books, not palaces, `
      + 'so whatever your mages remember only in their palaces is lost.',
    );
  } else {
    lines.push(`Knowledge: anything ${name(from, fromId)} keeps where ${name(to, toId)} cannot is destroyed.`);
  }
  const words = {
    acquire: { 'true-name': (p) => `research costs ×${(p.researchCostMultiplier ?? FP) / FP}, teaching ×${(p.teachCostMultiplier ?? FP) / FP}` },
    cast: { prepared: (p) => `each mage prepares at most ${p.slotsPerMage ?? '?'} spells ahead of casting` },
    cost: { prepaid: () => 'spells are paid for when prepared, not when cast' },
    store: { palace: (p) => `each mage’s palace holds ${p.slotsPerMage ?? '?'} nodes; nothing can be burned or stolen` },
  };
  const changes = [];
  for (const hook of ['acquire', 'cast', 'cost']) {
    const a = from?.hooks?.[hook];
    const b = to?.hooks?.[hook];
    if (a === undefined || b === undefined || a.kind === b.kind) continue;
    const now = words[hook]?.[b.kind];
    const was = words[hook]?.[a.kind];
    if (now) changes.push(now(b.params ?? {}));
    if (was) changes.push(`no longer — ${was(a.params ?? {})}`);
    if (!now && !was) changes.push(`${hook} works the ${b.kind} way`);
  }
  if (toStore === 'palace' && fromStore !== 'palace') changes.push(words.store.palace(to.hooks.store.params ?? {}));
  if (changes.length > 0) lines.push(`How magic works afterwards: ${changes.join('; ')}.`);
  gaps.push('nothing published forecasts what the upheaval does to your population (one playtest saw it fall from 61 to 44 within a year)');
  gaps.push('favor falling to 0 is how the action resolves, not a published number');
  return {
    lines,
    risk: 'This is the costliest act a god has. Expect a decade of falling worship and a smaller, poorer world; do it only if the new tradition is worth that.',
    gaps,
  };
}

/** One line for a tooltip: "Not available — a; b". */
export function whyDeniedText(f, content, id) {
  const r = whyDenied(f, content, id);
  // Player prose only: the observation each reason was read from is a
  // developer's detail, kept in `source` for the panels' tooltips.
  return r.length === 0 ? '' : `Not available — ${r.map((x) => x.text).join('; ')}`;
}

/**
 * What stands between this god and raiding seat `seat`. Each entry is
 * `{text, source, blocks}`; `blocks` true means the page will not send the raid
 * (either the mask refuses it, or the seat is empty or ended — the server would
 * charge for a portal and open nothing). `blocks` false is advice.
 *
 * @param peer - `{state: 'empty'|'gone'|'ended'|'running'|'unknown', status?}`
 */
export function raidBlockers(f, content, seat, peer, raiders) {
  const out = [];
  const portalCell = content.cells.find((c) => c.id === PORTAL_CELL);
  const legal = isLegal(f, 14);
  const slot = (f.raw.candidates?.['14'] ?? []).findIndex((c) => c.params?.[0] === seat);

  if (f.status() !== 'running') {
    out.push({ text: `your universe has ended (${f.status()})`, source: 'frame.status', blocks: true });
    return out;
  }
  if (f.clock().engaged) {
    out.push({ text: 'a raid is already in flight', source: 'clock.mode', blocks: true });
  }
  const permitted = f.raw.academy?.permittedCells;
  if (portalCell && Array.isArray(permitted) && !permitted.includes(portalCell.cellId)) {
    out.push({ text: 'Rego × Limen, the portal cell, is not permitted in your ruleset', source: 'academy.permittedCells', blocks: true });
  }
  if ((f.raw.candidates?.['14'] ?? []).length === 0) {
    out.push({ text: 'no living mage holds a portal node in a permitted cell', source: 'candidates[14] is empty', blocks: true });
  }
  if (out.length === 0 && !legal) {
    const money = affordability(f, content, 14).map((r) => ({ ...r, blocks: true }));
    out.push(...(money.length > 0 ? money : [{ text: 'the server does not allow a portal this tick', source: 'mask[14]', blocks: true }]));
  }
  if (peer.state === 'empty') {
    out.push({ text: 'this seat is empty — the portal would be paid for and open on nothing', source: 'live/raids seats', blocks: true });
  } else if (peer.state === 'gone') {
    out.push({ text: 'this seat is empty — its universe has left the server', source: 'peer frames 404', blocks: true });
  } else if (peer.state === 'ended') {
    out.push({ text: `that universe has ended (${peer.status}) — there is nothing to raid`, source: 'peer frame.status', blocks: true });
  }
  if (legal && slot < 0 && peer.state !== 'empty') {
    out.push({ text: 'the server offers no portal to this seat', source: 'candidates[14]', blocks: true });
  }
  if (raiders === 0) {
    out.push({ text: 'no raiders named — a raid sends your raiders, and you have none visible', source: 'mage roles in candidateDetail/academy', blocks: false });
  }
  return out;
}

/**
 * A raid record in words, from one side's point of view.
 *
 * The record is always the **attacker's** (`outbound: true`), whether this
 * universe sent it (`log`) or received it (`inbound`). Counts that are
 * raid-relative (`raiders*`, `nodesTakenByAttacker`, `actionEconomy`) read the
 * same either way; `localCasualties`, `nodesLostLocally` and
 * `nodesGainedLocally` are the attacker's own and are only shown to the
 * attacker.
 */
export function describeRaid(record, perspective, otherLabel) {
  const weAttacked = perspective === 'outbound';
  const attackerWon = record.victor === RAID_SIDE.attacker;
  const weWon = weAttacked === attackerWon;
  const reason = RAID_END_REASON_TEXT[record.reason] ?? { id: `reason ${record.reason}`, text: 'an end reason this page does not know' };
  const removals = record.actionEconomy?.removals ?? [undefined, undefined];
  const ours = weAttacked ? removals[0] : removals[1];
  const theirs = weAttacked ? removals[1] : removals[0];
  const year = Math.floor(record.worldTick / 12);

  const title = weAttacked
    ? `You raided universe ${otherLabel}`
    : `Universe ${otherLabel} raided you`;
  // A portal with nobody sent through it ends "side eliminated" on the first
  // tick, which read as a victory over raiders who never existed.
  const empty = record.raidersFielded === 0;
  const outcome = empty
    ? weAttacked
      ? 'You opened a portal but sent nobody through — no raider of yours was ready, so nothing happened beyond the portal’s cost.'
      : 'They opened a portal but sent nobody through — nothing happened.'
    : `${weWon ? 'You won' : 'You lost'}: the ${attackerWon ? 'attackers' : 'defenders'} carried it, because ${reason.text}.`;
  const rows = [
    ['when', `year ${year} (tick ${record.worldTick}), ${record.engagementTicks} engagement ticks`],
    [weAttacked ? 'your raiders' : 'their raiders',
      `${record.raidersFielded} fielded · ${record.raidersWithdrawn} withdrew home · ${record.raidersStranded} stranded`],
    ['combatants lost', ours === undefined ? 'not in the record'
      : `yours ${ours} · theirs ${theirs}`],
    ['nodes the attackers took', String(record.nodesTakenByAttacker)],
  ];
  if (weAttacked) {
    rows.push(['your mages lost for good', String(record.localCasualties)]);
    rows.push(['nodes your raiders brought home', String(record.nodesGainedLocally)]);
    rows.push(['nodes your universe lost entirely', String(record.nodesLostLocally)]);
    rows.push(['portal cost', `${num(units(record.attackerFavorCost))} favor`]);
  } else {
    rows.push(['your mages lost for good', 'not in the attacker\'s record — watch your population']);
  }
  return { title, outcome, reasonId: reason.id, weWon, empty, rows, inbound: !weAttacked };
}

/** A one-line feed entry for a raid. Only numbers and a hex label. */
export function raidFeedText(record, perspective, otherLabel) {
  const d = describeRaid(record, perspective, otherLabel);
  if (d.empty) return `${d.title} — a portal opened, but nobody came through`;
  return `${d.title} — ${d.weWon ? 'won' : 'lost'} (${d.reasonId}); ${record.raidersFielded} raider(s), ${record.nodesTakenByAttacker} node(s) taken`;
}

/**
 * What the frames can say about **why** a universe stagnated.
 *
 * The frame carries `status: 'stagnated'` and nothing else — not which of the
 * server's three stagnation clocks ran out (`coordination/src/god/ascension.ts`
 * `stepStagnation`), and not the clocks themselves or their thresholds. So
 * this does not decide which rule fired; it reads the run's own frames for the
 * facts each rule depends on and says which rules those facts leave possible.
 *
 * The three rules, in words: **no mages** — the universe had no living mage
 * for a stretch; **no worship** — worship stayed very low for a long stretch;
 * **stasis** — nothing new entered the universe's knowledge for a long stretch
 * *while* worship stayed below a health floor.
 *
 * @param session - anything with `frameCount`, `frame(i)` and `last()`.
 * @returns `{ livingAtEnd, lastLivingTick, lastNewKnowledgeTick, worshipAtEnd,
 *   worshipTierAtEnd, peakWorship: {value, tick}, endTick, rules: [{id, text,
 *   possible, evidence}] }`
 */
export function stagnationReading(session) {
  const living = (f) => f.mageBuckets().reduce((a, b) => a + b.living, 0);
  const known = (f) => f.knowledge().reduce((a, c) => a + c.nodesKnown, 0);
  let lastLivingTick = null;
  let lastNewKnowledgeTick = null;
  let prevKnown = null;
  let peakWorship = { value: -1, tick: 0 };
  for (let i = 0; i < session.frameCount; i += 1) {
    const f = session.frame(i);
    const tick = f.clock().worldTick;
    if (living(f) > 0) lastLivingTick = tick;
    const k = known(f);
    if (prevKnown !== null && k > prevKnown) lastNewKnowledgeTick = tick;
    prevKnown = k;
    const w = f.resources().worship;
    if (w > peakWorship.value) peakWorship = { value: w, tick };
  }
  const end = session.last();
  const endTick = end.clock().worldTick;
  const livingAtEnd = living(end);
  const r = end.resources();
  const year = (t) => Math.floor(t / 12);
  const rules = [
    {
      id: 'mageless',
      text: 'no living mage for a stretch of years',
      possible: livingAtEnd === 0,
      evidence: livingAtEnd === 0
        ? (lastLivingTick === null ? 'no mage lived at any point in the run' : `the last mage was alive in year ${year(lastLivingTick)}`)
        : `${livingAtEnd} mage${livingAtEnd === 1 ? ' was' : 's were'} alive at the end, so not this one`,
    },
    {
      id: 'no-worship',
      text: 'worship stayed very low for a long stretch',
      possible: true,
      evidence: `worship ended at ${num(r.worship)} (tier ${r.worshipTier}); its peak was ${num(Math.max(0, peakWorship.value))} in year ${year(peakWorship.tick)}`,
    },
    // The quiet clock (coordination `stepStagnation`, S4): a tick is quiet when
    // nothing new was learned AND the god paid for no intervention. Two windows.
    {
      id: 'stasis',
      text: 'decline: forty quiet years (nothing new learned, no act of yours) while worship was low and below the tier your universe once reached',
      possible: lastNewKnowledgeTick !== endTick && r.worshipTier < peakTierOf(session),
      evidence: lastNewKnowledgeTick === null
        ? 'no node was ever newly learned in this run'
        : lastNewKnowledgeTick === endTick
          ? 'something new was learned in the final month, so not this one'
          : `the last new node was learned in year ${year(lastNewKnowledgeTick)}, ${year(endTick - lastNewKnowledgeTick)} years before the end; worship ended at tier ${r.worshipTier}`,
    },
    {
      id: 'neglect',
      text: 'neglect: a century of quiet — nothing new learned and no act of yours — whatever worship read. Any paid action resets it',
      possible: lastNewKnowledgeTick === null || endTick - lastNewKnowledgeTick >= 1200,
      evidence: lastNewKnowledgeTick === null
        ? 'no node was ever newly learned in this run'
        : `the last new node was learned ${year(endTick - lastNewKnowledgeTick)} years before the end`,
    },
  ];
  return {
    livingAtEnd,
    lastLivingTick,
    lastNewKnowledgeTick,
    worshipAtEnd: r.worship,
    worshipTierAtEnd: r.worshipTier,
    peakWorship,
    endTick,
    rules,
  };
}

/** The highest worship tier any frame of the session shows. */
function peakTierOf(session) {
  let peak = 0;
  for (let i = 0; i < session.frameCount; i += 1) {
    peak = Math.max(peak, session.frame(i).resources().worshipTier);
  }
  return peak;
}

/** The guide's thresholds, used only when the session document does not publish `content.ascension`. */
const GUIDE_ASCENSION = Object.freeze({
  'min-tick': 600, 'tier-gate': 4, 'summit-cells': 13, 'summit-copies': 2, institutions: 2, 'era-count': 4,
});

/**
 * Both ascension paths as a checklist. Each item:
 * `{label, value, target, status: 'met'|'unmet'|'unknown', source, note?}`.
 *
 * `unknown` means the frame does not carry the fact (an older recording), and
 * a guess would be a rule this page has no business computing.
 *
 * `summits` is `null` without the server's readings, otherwise one row per
 * permitted cell: `{cell, node, tier, holders, copies, state}` where `state`
 * is `met` | `short` (held, too few copies) | `orphaned` (copies, no living
 * holder) | `none`.
 */
export function ascensionChecklist(f, content) {
  const published = content.ascension !== undefined;
  const a = { ...GUIDE_ASCENSION, ...(content.ascension ?? {}) };
  const clock = f.clock();
  const r = f.resources();
  const k = f.knowledge();
  const acad = f.raw.academy;
  const st = (ok) => (ok ? 'met' : 'unmet');

  // The server's own readings (`frame.ascension`, from the god report), when
  // this frame carries them. Absent on a recording and on frame 0, and then
  // the older, weaker readings below stand in.
  const g = f.raw.ascension;
  const colleges = acad === undefined ? null : Object.values(acad.universities ?? {});
  const completed = g !== undefined ? g.completedUniversities
    : colleges === null ? null : colleges.filter((u) => (u.college?.buildProgress ?? 0) >= FP).length;
  const universitiesItem = {
    label: 'Completed universities',
    value: completed === null ? 'not shown here' : String(completed),
    target: `≥ ${a.institutions}`,
    status: completed === null ? 'unknown' : st(completed >= a.institutions),
    source: 'academy colleges, buildProgress ≥ 1',
  };

  const nodesKnown = g?.nodesKnown ?? k.reduce((s, c) => s + c.nodesKnown, 0);
  const cellsKnown = g?.cellsKnown ?? k.filter((c) => c.nodesKnown > 0).length;
  const pct = (fp) => Math.round((fp / FP) * 100);

  // Mastery's summit: for each permitted cell, the deepest authored node must be
  // held by a living mage, with ≥ copies instances. The server counts it
  // (`ascension.masteredCells`) and lists each cell's reading (`summits`).
  let summitItem;
  let summits = null;
  if (g !== undefined) {
    const nodeById = new Map((content.nodes ?? []).map((n) => [n.nodeId, n]));
    const cellById = new Map((content.cells ?? []).map((c) => [c.cellId, c]));
    const titled = (id) => String(id ?? '').replace(/(^|[-_ ])(\w)/gu, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase());
    const cellLabel = (cellId) => {
      const c = cellById.get(cellId);
      if (c === undefined) return `cell ${cellId}`;
      const t = (content.techniques ?? []).find((x) => x.id === c.technique);
      const fm = (content.forms ?? []).find((x) => x.id === c.form);
      return `${t?.name ?? titled(c.technique)} ${fm?.name ?? titled(c.form)}`;
    };
    const need = a['summit-copies'];
    summits = g.summits.map(([cellId, nodeId, holders, copies]) => {
      const node = nodeById.get(nodeId);
      const state = holders > 0 && copies >= need ? 'met' : holders > 0 ? 'short' : copies > 0 ? 'orphaned' : 'none';
      return { cellId, nodeId, holders, copies, state, cell: cellLabel(cellId), node: node?.name ?? `node ${nodeId}`, tier: node?.tier };
    });
    const order = { met: 0, short: 1, orphaned: 2, none: 3 };
    summits.sort((x, y) => order[x.state] - order[y.state] || y.copies - x.copies || x.cellId - y.cellId);
    const short = summits.filter((r) => r.state === 'short').length;
    const orphaned = summits.filter((r) => r.state === 'orphaned').length;
    summitItem = {
      label: 'Permitted cells mastered (deepest node held by a living mage, enough copies)',
      value: String(g.masteredCells),
      target: `≥ ${a['summit-cells']}`,
      status: st(g.masteredCells >= a['summit-cells']),
      source: 'frame.ascension.masteredCells (the server’s count)',
      note: `${short} more cell${short === 1 ? '' : 's'} have the deepest node in a living mind but fewer than ${need} copies — teaching or scribing it closes the gap. `
        + `${orphaned} more have copies but no living mage who holds it.`,
    };
  } else {
    const deepestAuthored = new Map();
    for (const n of content.nodes ?? []) deepestAuthored.set(n.cellId, Math.max(deepestAuthored.get(n.cellId) ?? 0, n.tier));
    const permitted = acad === undefined ? null : new Set(acad.permittedCells);
    let summitReach = null;
    if (permitted !== null) {
      summitReach = 0;
      for (const cell of k) {
        const cellId = content.cells[cell.index]?.cellId ?? cell.index + 1;
        const top = deepestAuthored.get(cellId) ?? 0;
        if (permitted.has(cellId) && top > 0 && cell.deepestTier >= top) summitReach += 1;
      }
    }
    summitItem = {
      label: 'Permitted cells whose deepest node is reached',
      value: summitReach === null ? 'not shown here' : `at most ${summitReach}`,
      target: `${a['summit-cells']}`,
      status: summitReach === null ? 'unknown' : summitReach < a['summit-cells'] ? 'unmet' : 'unknown',
      source: 'knowledge.deepestTier × academy.permittedCells',
      note: `An upper bound: this recording does not say whether a living mage holds that exact node or whether ${a['summit-copies']} copies survive.`,
    };
  }

  const mastery = [
    { label: 'Worship tier', value: String(r.worshipTier), target: `≥ ${a['tier-gate']}`, status: st(r.worshipTier >= a['tier-gate']), source: 'resources.worshipTier' },
    universitiesItem,
    summitItem,
  ];
  const canon = [
    g === undefined
      ? {
        label: 'Consecutive good eras',
        value: 'not shown here',
        target: `${a['era-count']} in a row`,
        status: 'unknown',
        source: `this recording does not carry the run of good eras; current era ${clock.era}`,
      }
      : {
        label: 'Consecutive good eras so far',
        value: String(g.goodEraRun),
        target: `${a['era-count']} in a row`,
        status: st(g.goodEraRun >= a['era-count']),
        source: `frame.ascension.goodEraRun; current era ${clock.era} — every condition below is checked when an era ends, and one failure resets the run to 0`,
      },
  ];
  if (a['canon-breadth'] !== undefined) {
    canon.push({ label: 'Nodes known (checked at each era boundary)', value: String(nodesKnown), target: `≥ ${a['canon-breadth']}`, status: st(nodesKnown >= a['canon-breadth']), source: g ? 'frame.ascension.nodesKnown' : 'Σ knowledge.nodesKnown' });
  }
  if (a['canon-cells'] !== undefined) {
    canon.push({ label: 'Cells with any knowledge (at each boundary)', value: String(cellsKnown), target: `≥ ${a['canon-cells']}`, status: st(cellsKnown >= a['canon-cells']), source: g ? 'frame.ascension.cellsKnown' : 'knowledge.nodesKnown > 0' });
  }
  canon.push({ ...universitiesItem, label: 'Completed universities (at each boundary)' });
  const depMax = a['dependence-max'];
  canon.push(g === undefined
    ? {
      label: 'Library held most of what it knew',
      value: 'not shown here',
      target: depMax === undefined ? 'most' : `≤ ${pct(depMax)}% of nodes with one copy`,
      status: 'unknown',
      source: 'this recording does not carry per-node copy counts',
    }
    : {
      label: 'Known nodes with only one copy',
      value: `${pct(g.dependence)}%`,
      target: depMax === undefined ? 'few' : `≤ ${pct(depMax)}%`,
      status: depMax === undefined ? 'unknown' : st(g.dependence <= depMax),
      source: 'frame.ascension.dependence (library dependence, the server’s figure)',
      note: 'A node held in only one mind or one book is one death or one fire from gone. Teaching, scribing and libraries add copies.',
    });
  canon.push(g === undefined
    ? {
      label: 'Nodes lost in the era',
      value: 'not shown here',
      target: a['loss-max'] === undefined ? '≤ 2' : `≤ ${a['loss-max']} (or ${pct(a['loss-fraction'] ?? 0)}% of the canon, if larger)`,
      status: 'unknown',
      source: 'this recording does not carry era losses',
    }
    : {
      label: 'Nodes lost so far this era',
      value: String(g.eraNodesLost),
      target: `≤ ${g.eraLossAllowance}`,
      status: st(g.eraNodesLost <= g.eraLossAllowance),
      source: 'frame.ascension.eraNodesLost vs eraLossAllowance (the server’s figures)',
    });

  return {
    published,
    gate: { label: 'Not before', value: `year ${Math.floor(clock.worldTick / 12)}`, target: `year ${Math.ceil(a['min-tick'] / 12)}`, status: st(clock.worldTick >= a['min-tick']), source: 'clock.worldTick' },
    open: isLegal(f, 15),
    mastery,
    canon,
    summits,
  };
}
