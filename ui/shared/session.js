/*
 * Multiverse Mages — the seam between a running universe and the prototypes.
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
 * Eleven prototypes each invented their own data. That was right while the
 * questions were about layout, and wrong once the question became whether a
 * client can be *fed* — a prototype arguing from invented numbers cannot
 * discover that the read path is missing something.
 *
 * This is the one place that turns what `agent-api` emits into what a view
 * wants. Everything it exposes is decoded from a real observation. If a field is
 * not here, the read path does not carry it, and that is the finding rather than
 * a gap in this file.
 *
 * ## The boundary
 *
 * `contracts.md` §5: the client depends on `agent-api` **on the read path only**
 * and computes no rules. So this module decodes. It does not evaluate
 * `permits()`, does not price an action, and does not decide anything — each of
 * those has exactly one home, and a second one in a renderer is the desync the
 * boundary exists to prevent.
 *
 * The single deliberate exception is {@link reconstructedCharge}, which is named
 * after what it does wrong and documents why it had to.
 *
 * ## Two sources, one view model
 *
 *     openSession({ recording: '../session.json' })   // works today
 *     openSession({ live: transport })                // reserved
 *
 * A recording is a real session serialized by `scripts/record-session.mjs`. The
 * frame shape is what a live transport would carry, so a view reads the same
 * model either way and never learns which it got.
 *
 * ## What this cannot feed
 *
 * `capabilities()` reports these from the data rather than asserting them, and
 * {@link WHY_ABSENT} carries the one-sentence reason each is missing. The map of
 * which prototype needs which is in `ui/shared/README.md`.
 */

/** Fixed point, scale 1/1024. The simulation's one numeric convention. */
export const FP = 1024;

/** An fp integer in world units — 40960 becomes 40.0 favor. */
export const units = (fp) => fp / FP;

const KNOWLEDGE_CHANNELS = 3;
const SPECIES_COUNT = 6;
const MAGE_TIER_SLOTS = 8;
const TECHNIQUE_COUNT = 5;
const FORM_COUNT = 14;
const EDICT_SLOTS = 8;

/**
 * Why a capability is absent, one sentence each.
 *
 * Read-path facts, not TODOs: each names the thing that makes it true, so a
 * banner says something a reader can go and check.
 */
export const WHY_ABSENT = {
  individualMages:
    '§4.1 carries mages as 6 species × 8 tiers of counts, not as people. A policy network does ' +
    'not need to know who she is; a player does.',
  explainChannel:
    '`ExplainProjection` is an exported type with no `explain()` on the session, so the terms ' +
    'behind a decision have no wire.',
  eventDeltas:
    'A frame is a state. Diffing two frames cannot tell a last-instance loss from an ordinary ' +
    'one, and that distinction is what sound-design §6.5 is built on.',
  mageNames: 'Candidate slots carry entity handles. Nothing on the read path turns one into a name.',
  maskReason:
    'The mask is one bit. `mask.ts` uses the same zero for an unaffordable action and an ' +
    'impossible one, so a dark control cannot say whether it means *wait* or *change something*.',
  rawObservation:
    '`AgentView` carries `raw` — its own comment calls it *the reproducible artefact* — and ' +
    '`session.observe()` returns only the normalized floats. The integers here are reconstructed.',
  engagement:
    'The engagement block is 64 slots and every one of them is zero here — but *not* because ' +
    'this run is peaceful. It raids: the recorder builds the reference scenario with ' +
    '`{ raids: true }` and one portal opens at world tick 226. A raid resolves inside a single ' +
    'world step, so no observation is ever taken while the clock is in engagement mode, and the ' +
    'block is unobservable rather than merely empty — and structurally, not by luck: ' +
    '`AgentSession` alternates `observe()` and `submit()`, and `submit()` runs a whole world ' +
    'step synchronously, so no consumer can sample while the clock is in engagement mode.',
  otherUniverse:
    '§1.1 puts one universe in one simulation instance. The multiverse is not in state, so a ' +
    'second universe cannot be read — only named as a portal target id.',
};

/** One tick, decoded. Nothing is allocated until a block is asked for. */
class Frame {
  constructor(doc, index) {
    this.doc = doc;
    this.index = index;
    this.raw = doc.frames[index];
  }

  /** A block by name, as fp integers or counts exactly as §4.1 defines them. */
  block(name) {
    const b = this.doc.blockByName[name];
    if (b === undefined) throw new Error(`no observation block named ${name}`);
    return this.raw.obs.slice(b.offset, b.offset + b.size);
  }

  /**
   * §4.1 resources, in world units.
   *
   * `worshipTier` is a small integer and stays one; the other four are fp. A
   * saturated channel is reported so a view can print *"128+"* rather than a
   * ceiling it would be wrong about.
   */
  resources() {
    const [favor, worship, worshipTier, materials, prestige] = this.block('resources');
    const base = this.doc.blockByName.resources.offset;
    const sat = (i) => this.raw.sat.includes(base + i);
    return {
      favor: units(favor),
      worship: units(worship),
      worshipTier,
      materials: units(materials),
      prestige: units(prestige),
      saturated: { favor: sat(0), worship: sat(1), materials: sat(3), prestige: sat(4) },
    };
  }

  /** §4.1 institutions: universities, total capacity, library depth, grimoires. */
  institutions() {
    const [universities, capacity, libraryDepth, grimoires] = this.block('institutions');
    return { universities, capacity, libraryDepth, grimoires };
  }

  /** §4.1 clock: worldTick, era, and whether the clock is in engagement mode. */
  clock() {
    const [worldTick, era, mode] = this.block('clock');
    return { worldTick, era, mode, engaged: mode === 1 };
  }

  /**
   * §4.1's ruleset block, decoded into the nineteen switches and eight edicts it
   * actually is: 5 technique bits, 14 form bits, then `(cellId, kind)` per edict
   * slot. A zero cell id is an empty slot.
   */
  ruleset() {
    const r = this.block('ruleset');
    const named = (list, at) =>
      list.map((x) => ({ ...x, permitted: r[at + x.bit] === 1 }));
    const edictBase = TECHNIQUE_COUNT + FORM_COUNT;
    const edicts = [];
    for (let slot = 0; slot < EDICT_SLOTS; slot += 1) {
      const cellId = r[edictBase + slot * 2];
      edicts.push(
        cellId === 0
          ? { slot, empty: true }
          : {
              slot,
              empty: false,
              cellId,
              kind: r[edictBase + slot * 2 + 1],
              // EDICT_KIND in packages/state/src/enums.ts. Named here so a view
              // never has to remember which integer is which.
              kindName: r[edictBase + slot * 2 + 1] === 1 ? 'interdiction' : 'dispensation',
              cell: this.doc.cellById[cellId],
            },
      );
    }
    return {
      techniques: named(this.doc.content.techniques, 0),
      forms: named(this.doc.content.forms, TECHNIQUE_COUNT),
      edicts,
      traditionId: this.block('tradition')[0],
    };
  }

  /**
   * §4.1 knowledge, per cell: nodes known, deepest tier, instance redundancy.
   *
   * All seventy cells, whatever a release enables — §4.1 sizes the vector from
   * the whole content space so the shape never moves. Cells outside the enabled
   * rectangle read zero, and a view that draws them as empty rather than absent
   * is telling the truth about the schema.
   */
  knowledge() {
    const k = this.block('knowledge');
    const cells = [];
    for (let i = 0; i * KNOWLEDGE_CHANNELS < k.length; i += 1) {
      const at = i * KNOWLEDGE_CHANNELS;
      const meta = this.doc.content.cells[i];
      cells.push({
        index: i,
        id: meta?.id ?? `cell${i}`,
        technique: meta?.technique,
        form: meta?.form,
        nodesKnown: k[at],
        deepestTier: k[at + 1],
        redundancy: k[at + 2],
        live: k[at] > 0,
      });
    }
    return cells;
  }

  /**
   * §4.1 mages, bucketed by species and highest tier known.
   *
   * **Counts, not people.** Slot 0 of each species is the untaught, which the
   * block widened to carry because otherwise ten fresh mages and none of them
   * read the same.
   */
  mageBuckets() {
    const m = this.block('mages');
    const out = [];
    for (let s = 0; s < SPECIES_COUNT; s += 1) {
      const tiers = m.slice(s * MAGE_TIER_SLOTS, (s + 1) * MAGE_TIER_SLOTS);
      const meta = this.doc.content.species[s];
      out.push({
        species: s,
        id: meta?.id ?? `species${s}`,
        name: meta?.name ?? `Species ${s}`,
        tiers,
        living: tiers.reduce((a, b) => a + b, 0),
        taught: tiers.slice(1).reduce((a, b) => a + b, 0),
      });
    }
    return out;
  }

  /** §4.2's mask over the whole action space, with each action's name. */
  actions() {
    return this.raw.mask.map((legal, id) => ({
      id,
      name: this.doc.actions[String(id)] ?? `action${id}`,
      legal: legal === 1,
    }));
  }

  /** Whether one action id is legal this tick. */
  isLegal(id) {
    return this.raw.mask[id] === 1;
  }

  /**
   * §4.4's slot-indexed candidate lists, keyed by action id.
   *
   * A slot's `params` are raw handles — an entity handle, a node id — because
   * that is what the action space takes. Nothing here turns a handle into a
   * name, which is `WHY_ABSENT.mageNames`.
   */
  candidateLists() {
    const out = new Map();
    for (const [id, list] of Object.entries(this.raw.candidates)) {
      out.set(
        Number(id),
        list.map((c, slot) => ({ slot, params: c.params ?? [] })),
      );
    }
    return out;
  }

  /** `running` | `ascended` | `stagnated` | `truncated`. */
  status() {
    return this.raw.status;
  }
}

/**
 * The three-state light `ui/glow/` needs, at the cost the read path imposes.
 *
 * The light system distinguishes **charged** (do it now), **latent** (the god
 * could, but not this tick) and **denied** (masked — something else has to
 * change first). §4.2 gives one bit for all three: `mask.ts` masks an action
 * *"whose cost exceeds the current favor pool"* with the same zero it uses for
 * an action that is structurally impossible. Two opposite instructions to the
 * player, one indistinguishable dark control.
 *
 * The only way to separate them from outside is to price the action, and pricing
 * is a rule. So this is a **deliberate, temporary §5 exception**, isolated in one
 * exported function with a name that says so, and every view that calls it must
 * label the result as reconstructed. The fix is a reason channel on the mask, not
 * a better client; see `docs/design/interface-findings.md`.
 *
 * The reconstruction is also incomplete on purpose: an illegal action the god
 * *can* afford is reported `denied`, which is sound, but an unaffordable action
 * that is *also* structurally impossible reports `latent` and is wrong. Nothing
 * on the read path can tell that case apart, and pretending otherwise would hide
 * the very gap this function exists to demonstrate.
 */
export function reconstructedCharge(frame, session, actionId) {
  if (frame.isLegal(actionId)) return { state: 'charged', reconstructed: false };
  const cost = session.actionCost(actionId);
  // A free action that is masked was never masked for its price, so nothing was
  // reconstructed and the control should not claim it was.
  if (cost === undefined || cost === 0) return { state: 'denied', reconstructed: false };
  const { favor } = frame.resources();
  return favor < units(cost)
    ? { state: 'latent', reconstructed: true, needs: units(cost) }
    : { state: 'denied', reconstructed: true };
}

/**
 * The view model, over an already-fetched document.
 *
 * Held apart from {@link openSession} because a recording and a live run differ
 * only in where `doc.frames` comes from and whether it can grow. Everything a
 * page reads is built here once, so a page cannot tell the two apart except by
 * asking — which is the property the recording was built to have and the reason
 * a live transport needed no new format.
 *
 * `frameCount` is a **getter**. On a recording it is constant and this changes
 * nothing; on a live run the array grows under the page, and a number captured
 * at load would pin every view to the first tick forever.
 */
function buildSession(doc, extras = {}) {
  doc.blockByName = Object.fromEntries(doc.layout.map((b) => [b.name, b]));
  doc.cellById = Object.fromEntries(doc.content.cells.map((c) => [c.cellId, c]));

  const frame = (i) => new Frame(doc, Math.max(0, Math.min(doc.frames.length - 1, i)));

  /* Measured over the whole run rather than read off the last tick: engagement
     is a mode the clock passes through, and asking the final frame would report
     "no raids ever" for a run that fought four. */
  const anyEngagement = () => doc.frames.some((f) => f.obs[doc.blockByName.clock.offset + 2] === 1);

  return {
    get provenance() {
      return doc.provenance;
    },
    content: doc.content,
    actionNames: doc.actions,
    get frameCount() {
      return doc.frames.length;
    },
    /** True when the frames are coming from a universe that is still running. */
    live: false,
    frame,
    last: () => frame(doc.frames.length - 1),
    /** An action's favor price in fp, from the content the run was built with. */
    actionCost: (id) => doc.content.actionCosts[String(id)],
    /**
     * What this source can and cannot feed, computed from the data rather than
     * asserted, so a view degrades honestly and says why.
     */
    capabilities: () => {
      const f = frame(doc.frames.length - 1);
      return {
        resources: true,
        ruleset: true,
        actionMask: true,
        knowledgeAggregates: f.knowledge().some((c) => c.live),
        mageBuckets: f.mageBuckets().some((s) => s.living > 0),
        candidates: f.candidateLists().size > 0,
        engagement: anyEngagement(),
        // Absent from the read path, not from this recording. See WHY_ABSENT.
        individualMages: false,
        explainChannel: false,
        eventDeltas: false,
        mageNames: false,
        maskReason: false,
        rawObservation: false,
        otherUniverse: false,
      };
    },
    ...extras,
  };
}

/**
 * The write half, and the only place in `ui/` that is not read-only.
 *
 * §5's *"the client computes no rules"* is untouched by this: nothing here
 * decides whether an action is legal, prices it, or predicts its result. It
 * posts `{kind, params}` at the server, which hands it to `agent-api`'s
 * admission gate, and reads back the frames that came out. A rejection is
 * reported as the gate's own word — `masked`, `empty-slot` — rather than
 * re-derived.
 *
 * **`params[0]` is a slot index for actions 8–14 and a literal id for 1–7.**
 * That asymmetry is `gate.ts`'s, not this file's; it is restated here because it
 * is the single thing a caller gets wrong.
 */
function liveControls(base, doc) {
  const post = async (route, body) => {
    const res = await fetch(`${base}/live/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error ?? `${route} failed (${res.status})`);
    return payload;
  };

  /* The server returns only the frames the client does not have, so a
     four-thousand-tick run does not re-ship itself on every button press. */
  const absorb = (payload) => {
    if (Array.isArray(payload.frames)) {
      doc.frames.length = payload.from ?? doc.frames.length;
      doc.frames.push(...payload.frames);
    }
    if (payload.provenance !== undefined) Object.assign(doc.provenance, payload.provenance);
    return payload;
  };

  return {
    live: true,
    /** One god action, one tick. Resolves to what the admission gate said. */
    submit: async (kind, params = []) =>
      absorb(await post('submit', { kind, params: [...params] })),
    /** `n` ticks of nothing, which is what a universe does on its own. */
    advance: async (ticks = 1) => absorb(await post('advance', { ticks })),
    /**
     * The control. Replays this run's log twice from its seed — once with the
     * action, once with a no-op — and reports whether the snapshot hash moved
     * and which observation slots did. It does **not** touch the run.
     */
    control: async (kind, params = [], settle = 30) =>
      post('control', { kind, params: [...params], settle }),
    /** A new universe at a new seed, in place. */
    restart: async (seed, ticks) => {
      const next = await post('reset', { seed, ticks });
      doc.frames.length = 0;
      doc.frames.push(...next.frames);
      Object.assign(doc.provenance, next.provenance);
      return next;
    },
  };
}

/**
 * Opens a session over a source.
 *
 *     openSession({ recording: '../session.json' })   // a run that already ended
 *     openSession({ live: '' })                       // a run that has not
 *
 * The live branch talks to `scripts/play-server.mjs` (`npm run play`), which
 * holds one `AgentSession` in memory and publishes it in exactly this document
 * shape. `base` is a URL prefix — `''` for the page's own origin.
 */
export async function openSession(source = {}) {
  if (source.live !== undefined) {
    const base = String(source.live === true ? '' : source.live).replace(/\/+$/u, '');
    const res = await fetch(`${base}/live/session.json`);
    if (!res.ok) {
      throw new Error(
        `No live universe at ${base}/live/session.json (${res.status}). Start one with ` +
          '`npm run play` and open http://localhost:8300/.',
      );
    }
    const doc = await res.json();
    return buildSession(doc, liveControls(base, doc));
  }
  const url = source.recording ?? '../session.json';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `No recording at ${url} (${res.status}). It is generated rather than committed, so a ` +
        'fresh clone does not have one yet, and a page opened as a file:// URL cannot fetch ' +
        'one either. `npm run ui` does both — it records the session and then serves — so run ' +
        'that and open http://localhost:8200/ui/. To record it alone: `npm run ui:record`.',
    );
  }
  return buildSession(await res.json());
}

/**
 * States, in one strip, where a surface's data comes from — and where it does
 * not.
 *
 * Every prototype gets one. A fed prototype names the run it is reading; one
 * that cannot be fed names the missing capability and its reason, sourced from
 * `capabilities()` rather than from prose that goes stale. That is what makes
 * *wired* a property of the whole set rather than of the three that were easy.
 */
export function mountSourceNote(host, session, needs = []) {
  if (document.getElementById('mm-src-css') === null) {
    const style = document.createElement('style');
    style.id = 'mm-src-css';
    style.textContent = `
      .mm-src{display:flex;flex-wrap:wrap;gap:.35rem 1rem;align-items:baseline;
        padding:.5rem .75rem;border:1px solid var(--line);border-left:2px solid var(--god);
        background:var(--sunk);font:11px/1.6 var(--mono);color:var(--faint)}
      .mm-src.is-absent{border-left-color:var(--warn)}
      .mm-src.is-live{border-left-color:var(--mentem);border-left-width:3px}
      .mm-src.is-live b{color:var(--mentem)}
      .mm-src.is-none{border-left-color:var(--loss)}
      .mm-src b{color:var(--soft);font-weight:500;letter-spacing:.09em;text-transform:uppercase}
      .mm-src .mm-why{flex:1 1 26rem;min-width:0;font:italic 12.5px/1.55 var(--serif);color:var(--soft)}
      .mm-src code{font-family:var(--mono);color:var(--faint)}
      /* The cheated-run marker. Loud on purpose, and it is not a decoration:
         a person six weeks from now reading a screenshot has to be able to see
         that the numbers on it came from a universe somebody granted. */
      .mm-src.is-cheated{border-left-color:var(--loss);border-left-width:4px;
        background:color-mix(in oklab, var(--loss) 12%, var(--sunk))}
      .mm-src.is-cheated .mm-cheat{color:var(--loss);font-weight:600;letter-spacing:.06em;
        text-transform:uppercase}
      /* The digest is not shouted: it is a hex string somebody will compare by
         eye or paste into a search, and upper-casing it makes both worse. */
      .mm-src.is-cheated .mm-digest{color:var(--loss);font-family:var(--mono)}
    `;
    document.head.append(style);
  }

  const el = document.createElement('div');
  el.className = 'mm-src';
  const put = (cls, text) => {
    const s = document.createElement('span');
    if (cls !== null) s.className = cls;
    s.textContent = text;
    el.append(s);
    return s;
  };

  if (session === null) {
    el.classList.add('is-none');
    el.innerHTML =
      '<b>No source</b><span class="mm-why">This page is drawn from invented data because no ' +
      'recording loaded. Run <code>npm run ui</code> and open it over http.</span>';
    host.append(el);
    return { missing: needs, fed: false };
  }

  const caps = session.capabilities();
  const missing = needs.filter((k) => caps[k] !== true);
  const p = session.provenance;
  /* The one distinction a player must never have to guess at. A recording and a
     live run are the same document shape on purpose, which is exactly why the
     strip has to say which one is on the screen. */
  const isLive = session.live === true;
  el.classList.toggle('is-live', isLive);
  el.append(
    Object.assign(document.createElement('b'), { textContent: isLive ? 'Live' : 'Recording' }),
  );
  put(
    null,
    isLive
      ? `seed ${p.seed} · tick ${p.ticks} of ${p.tickCap} · running now · layout ${p.observationLayoutDigest.slice(0, 8)}`
      : `seed ${p.seed} · ${p.ticks} ticks · layout ${p.observationLayoutDigest.slice(0, 8)}`,
  );
  /*
   * The sandbox marker, on **every** surface that mounts a source note, because
   * a banner that lives on one page is a banner somebody screenshots around.
   *
   * Keyed on `provenance.sandbox`, which the play server sets only for a run
   * built on a cheat sheet. Absent on every recording and on every honest live
   * run, so this adds nothing to a document that was honest — which is the same
   * rule the `sandbox` key itself follows.
   */
  const cheated = p.sandbox;
  if (cheated !== undefined && cheated !== null) {
    el.classList.add('is-cheated');
    put('mm-cheat', 'Cheated');
    put('mm-digest', String(cheated.digest ?? ''));
    put(
      'mm-why',
      `This universe was built by the sandbox layer: ${
        (cheated.cheats ?? []).join(', ') || 'branded, no cheat declared'
      }. Nothing on this screen is a measurement of the game. The run is branded inside its own ` +
        'snapshot and the balance harness refuses it.',
    );
  }

  if (missing.length > 0) {
    el.classList.add('is-absent');
    put(
      'mm-why',
      `Drawn, not fed — ${missing.map((k) => WHY_ABSENT[k] ?? `\`${k}\` is absent from the read path.`).join(' ')}`,
    );
  }
  host.append(el);
  return { missing, fed: missing.length === 0 };
}
