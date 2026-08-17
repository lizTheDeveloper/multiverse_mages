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

/**
 * The three kinds `resources[39]` sums, and the four `material-economy` added.
 *
 * Split into two lists on purpose, and the split is the whole of why this file
 * did not need rewriting when the component went from three kinds to seven.
 * `materials` is the sum of the **land** three and nothing else — that is what
 * the observation slot documents and it may not quietly grow — so the guard on
 * the breakdown is a question about those three. The other four reach no slot
 * at all, are not part of any sum, and are therefore reported one by one:
 * absent is absent, per kind.
 */
const LAND_KINDS = ['food', 'stone', 'vellum'];
const OTHER_KINDS = ['labor', 'essence', 'insight', 'passage'];

/**
 * Whether a frame's `stocks` sidecar carries the three land kinds as real
 * numbers.
 *
 * All three or none, and finite rather than merely present: `JSON.parse` turns
 * a serialized `Infinity` or `NaN` into `null`, and `units(null)` is `0` — the
 * exact zero {@link Frame#resources} refuses to invent. A partial sidecar is
 * treated as no sidecar so a view falls back to the summed total it can trust
 * instead of drawing two thirds of a breakdown.
 *
 * Deliberately **not** widened to all seven. A recording made between the
 * three-kind sidecar and `material-economy` carries `food`, `stone` and
 * `vellum` and nothing else; asking for seven here would make every one of
 * those frames fall back to the summed total and lose a breakdown it really
 * does have.
 */
const hasStocks = (stocks) =>
  stocks !== null &&
  typeof stocks === 'object' &&
  LAND_KINDS.every((kind) => typeof stocks[kind] === 'number' && Number.isFinite(stocks[kind]));

/**
 * The four non-land kinds a frame actually carries, in world units.
 *
 * Per kind rather than all-or-none, because none of them is part of a sum: a
 * frame carrying `insight` and not `passage` is a frame that can honestly draw
 * `insight`. A kind that is absent stays absent — never `0`, for the reason
 * {@link Frame#resources} gives at length.
 */
const otherStocks = (stocks) => {
  if (stocks === null || typeof stocks !== 'object') return {};
  const out = {};
  for (const kind of OTHER_KINDS) {
    const value = stocks[kind];
    if (typeof value === 'number' && Number.isFinite(value)) out[kind] = units(value);
  }
  return out;
};

/**
 * Whether a frame carries the §4.4 candidate-descriptor sidecar.
 *
 * The three tables or none, for the reason {@link hasStocks} gives one field
 * over: a half-present projection would let a page draw some slots as people and
 * the rest as numbers, which reads as *"these four are special"* rather than as
 * *"this recording predates the field"*. A recording made before it existed is
 * still a valid recording, so a view asks rather than assumes.
 */
const hasCandidateDetail = (detail) =>
  detail !== null &&
  typeof detail === 'object' &&
  ['byAction', 'mages', 'universities'].every(
    (table) => detail[table] !== null && typeof detail[table] === 'object',
  );

/**
 * Whether a frame carries the §4.4 academy sidecar.
 *
 * The four fields or none, for the reason {@link hasCandidateDetail} gives one
 * projection over: a half-present academy would let a page draw a roster with no
 * ruleset behind it, and the frontier it computed would silently be a frontier
 * in a universe where nothing is permitted. A recording made before this field
 * existed is still a valid recording, so a view asks rather than assumes.
 *
 * `permittedCells` is checked for *being an array* and not for being non-empty.
 * An empty list is a real answer — a god who has interdicted the whole grid —
 * and folding it into "absent" would report a rule as a missing feature.
 */
const hasAcademy = (academy) =>
  academy !== null &&
  typeof academy === 'object' &&
  academy.universities !== null &&
  typeof academy.universities === 'object' &&
  academy.mages !== null &&
  typeof academy.mages === 'object' &&
  Array.isArray(academy.permittedCells) &&
  typeof academy.unaffiliated === 'number';

/**
 * The seven baskets a flow ledger carries, each a per-kind record of fp
 * integers.
 *
 * Named rather than discovered from the object's own keys, for the reason
 * `LAND_KINDS` next door is a literal: which fields must be present is a
 * decision a reviewer checks, not a property of whatever the encoder happened to
 * write. The **kinds inside** a basket are read off the data, so a kind appended
 * to `material-stock` reaches a page without a change here.
 */
const FLOW_BASKETS = ['opening', 'closing', 'faucet', 'sink', 'land', 'applied', 'spilled'];

/**
 * Baskets a frame may carry and need not, decoded one at a time.
 *
 * Deliberately **outside** {@link FLOW_BASKETS}, for the reason {@link
 * otherStocks} is outside {@link hasStocks}: `godSpend` arrived after the first
 * recordings did, and requiring it here would make every one of those frames
 * fall back to no ledger at all and lose a breakdown they really have. Present
 * is decoded, absent is absent, and neither is `0`.
 *
 * `godSpend` is also not part of `faucet - sink` — the god's verbs are charged
 * before the world tick reads its opening stock — so a page missing it is
 * missing an inflow arrow, not an unbalanced ledger.
 */
const FLOW_OPTIONAL_BASKETS = ['godSpend'];

/** The scalar pressures, each fp. */
const FLOW_PRESSURES = [
  'castingOwed',
  'castingShortfall',
  'subsistenceShortfallShare',
  'teachingFundedShare',
  'libraryUpkeepOwed',
  'libraryUpkeepPaid',
  'constructionStoneOwed',
  'constructionStonePaid',
  'applicationRations',
  'materialsScribed',
];

/** The counts beside them, which are counts and are not fp. */
const FLOW_PRODUCERS = ['magesApplying', 'economicNodes', 'buildRateSources'];

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** A per-kind record whose every value is a real number, and which has at least one. */
const finiteBasket = (basket) => {
  if (basket === null || typeof basket !== 'object') return false;
  const values = Object.values(basket);
  return values.length > 0 && values.every(finiteNumber);
};

const finiteFields = (record, fields) =>
  record !== null && typeof record === 'object' && fields.every((f) => finiteNumber(record[f]));

/**
 * Whether a frame's `flow` sidecar carries a whole ledger.
 *
 * **All of it or none of it**, and finite rather than merely present, for the
 * reason {@link hasStocks} gives one field over: `JSON.parse` turns a serialized
 * `Infinity` or `NaN` into `null`, `units(null)` is `0`, and a `0` in a faucet
 * is *"nothing was produced"* — a fact, not an absence. A half-present ledger
 * would let a page draw a source with no sink and read it as a universe printing
 * material from nowhere, which is precisely the diagnosis `breaches` exists to
 * make and would be a false one.
 *
 * A recording made before this sidecar existed is a valid recording, and so is
 * the opening frame of every recording made after it: nothing has been stepped
 * at tick 0, so there is no tick to report on. Both are absent, and
 * `capabilities()` reports the absence rather than a page guessing.
 */
const hasFlow = (flow) =>
  flow !== null &&
  typeof flow === 'object' &&
  finiteNumber(flow.worldTick) &&
  FLOW_BASKETS.every((name) => finiteBasket(flow[name])) &&
  flow.short !== null &&
  typeof flow.short === 'object' &&
  Array.isArray(flow.claimants) &&
  flow.claimants.every(
    (row) =>
      row !== null &&
      typeof row === 'object' &&
      typeof row.claimant === 'string' &&
      typeof row.kind === 'string' &&
      finiteFields(row, ['owed', 'paid', 'shortfall']),
  ) &&
  Array.isArray(flow.breaches) &&
  flow.breaches.every(
    (row) =>
      row !== null &&
      typeof row === 'object' &&
      typeof row.kind === 'string' &&
      finiteFields(row, ['delta', 'expected', 'discrepancy']),
  ) &&
  finiteFields(flow.pressure, FLOW_PRESSURES) &&
  finiteFields(flow.producers, FLOW_PRODUCERS);

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
  mageNames:
    'Candidate slots carry entity handles, and no component holds a name — `MAGE` is ' +
    '`speciesId, birthTick, roleId, universityId, curiosity, ambition, caution, vigor, maxVigor, ' +
    'alive` and that is the whole of what a mage is in state. A description is not a name, so a ' +
    'slot can say what she is and never who she is; a personal name is content nobody has ' +
    'authored (interface-findings §1.11).',
  mageLifespan:
    'How long a mage has left is not in state. Lifespan is a species figure in `@mm/content` and ' +
    'the roll that fixes hers is `rules-world`\'s, so a candidate row can say how old she is and ' +
    'not how near the end.',
  portalTargetDetail:
    'A portal target is an id and nothing else. `rival-universe.ts` builds the rival from the run ' +
    'seed and that id *when the raid resolves*, so before the portal opens there is no entity, no ' +
    'ruleset and no population to read.',
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
  universityIdentity:
    '`UNIVERSITY` is `{libraryId, capacity, buildProgress}` and that is the whole of what a ' +
    'college is in state — no name, no place, no endowment, no research focus. The place is a ' +
    'refusal: `assertNoWorldPositions` throws if any world-scale component declares x/y, so only ' +
    'combatants and objectives have coordinates and a college screen is a dossier rather than a ' +
    'map. The focus is a refusal too: `rules-world`\'s `universities/profile.ts` records ' +
    'specialization as emergent from library contents and staff knowledge (vision §13), and a ' +
    'test there scans the component layout to fail if anyone adds a focus field.',
  classrooms:
    '`EFFORT_PROGRESS` is `{subject, kind, nodeId, counterparty, progress}` and carries no ' +
    'university — §1.2 makes a teaching row belong to the *pair*, and there is no classroom in ' +
    'state. So "who teaches here" is a join through the two parties\' affiliation, and both ' +
    'halves of it are drawn rather than one being assumed.',
  flowLedger:
    'A frame with no `flow` sidecar carries seven closing levels and nothing about how they got ' +
    'there, so a universe that spent its vellum and one that leaked it are the same two numbers. ' +
    'The ledger is derived per tick and is deliberately not in state — `world-step.ts` keeps it ' +
    'out so that two peers cannot desync over a number no rule reads — so a recording made before ' +
    'the sidecar existed cannot have it reconstructed from the observation, and the opening frame ' +
    'of every recording has none because nothing has been stepped yet.',
  admission:
    '`capacity` is written once when a college is founded and mutated nowhere in `src/`. ' +
    '`admitStudents` and its admission-refusal tally have no caller outside a lab test, so the ' +
    'seats are a designed figure that nothing currently fills or competes for.',
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
   *
   * ## `food`, `stone` and `vellum` are `undefined` when absent, never `0`
   *
   * The observation has **one** slot for materials — §4.1 sums the three stocks
   * into `resources[39]`, and widening that block moves `OBSERVATION_SIZE` and
   * the layout digest, which invalidates every trained policy and every
   * committed balance baseline. So the split does not come from `obs`. It comes
   * from `stocks`, a per-frame sidecar off the §4.4 player projection, which a
   * recorder written before that field existed will not carry.
   *
   * When it is missing these three are left `undefined` rather than defaulted.
   * `0` would be a *lie a page prints as fact* — an empty granary is a crisis
   * and an unknown granary is not, and the two must not render alike. A view
   * therefore tests `typeof x === 'number' && Number.isFinite(x)` on all three
   * and falls back to the summed `materials`, which is always present.
   */
  resources() {
    const [favor, worship, worshipTier, materials, prestige] = this.block('resources');
    const base = this.doc.blockByName.resources.offset;
    const sat = (i) => this.raw.sat.includes(base + i);
    const stocks = this.raw.stocks;
    return {
      favor: units(favor),
      worship: units(worship),
      worshipTier,
      materials: units(materials),
      prestige: units(prestige),
      // Spread conditionally rather than assigned from `stocks?.food`, because
      // optional chaining yields `undefined` for a *present* sidecar that is
      // missing one kind, and that case should be as absent as a missing
      // sidecar rather than half-drawn. All three or none.
      ...(hasStocks(stocks)
        ? { food: units(stocks.food), stone: units(stocks.stone), vellum: units(stocks.vellum) }
        : {}),
      // The four `material-economy` added, each present only if the frame has
      // it. `materials` does **not** include them: `insight` is what a faculty
      // teaches out of and `passage` is what a threshold is held open with, and
      // summing either into a number captioned "food · stone · vellum" would
      // make one field mean two things.
      ...otherStocks(stocks),
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

  /**
   * §4.4's candidate **descriptors**, or `null` when the frame carries none.
   *
   * `null` and not an empty projection: absent means *this source cannot say*,
   * and empty would mean *there is nothing to say about these slots*, which is a
   * claim about the world. A page tests for it and falls back to the numbered
   * chips it drew before, with `WHY_ABSENT` under them.
   *
   * `slots(action)` is aligned index-for-index with
   * {@link Frame#candidateLists}, because the parameter submitted is still the
   * slot index — `agent-api` builds both halves from one list so they cannot
   * drift. `mage` and `university` are the per-handle lookups those rows point
   * into: a mage named by bless, by assign-role and by a founding grant is
   * shipped once and is the same object each time she is asked for.
   */
  candidateDetails() {
    const raw = this.raw.candidateDetail;
    if (!hasCandidateDetail(raw)) return null;
    return {
      slots: (action) => raw.byAction[String(action)] ?? [],
      mage: (handle) => raw.mages[String(handle)],
      university: (handle) => raw.universities[String(handle)],
    };
  }

  /**
   * §4.4's academy projection, or `null` when the frame carries none.
   *
   * `null` and not an empty projection, for {@link Frame#candidateDetails}'
   * reason: absent means *this source cannot say*, and empty would mean *this
   * universe has no colleges*, which is a claim about the world and is one a
   * player would act on.
   *
   * `handles` is ascending so a chip strip is stable between ticks — a college
   * that moved position every time one was founded would be a different college
   * to the eye. `permittedCells` is a `Set` because every question asked of it
   * is membership.
   */
  academy() {
    const raw = this.raw.academy;
    if (!hasAcademy(raw)) return null;
    return {
      handles: Object.keys(raw.universities)
        .map(Number)
        .sort((a, b) => a - b),
      university: (handle) => raw.universities[String(handle)],
      mage: (handle) => raw.mages[String(handle)],
      permittedCells: new Set(raw.permittedCells),
      unaffiliated: raw.unaffiliated,
    };
  }

  /**
   * §4.4's flow ledger for the tick this frame is of, in world units, or `null`.
   *
   * The one thing every other accessor on this class structurally cannot say:
   * they all report a **level**, and a level cannot tell material that was spent
   * from material that was lost. `economy-flow-models.md` §5.2 is the finding.
   *
   * ## The invariant is a statement about one frame, never about two
   *
   * `closing - opening == faucet - sink`, per kind, exactly. **Do not difference
   * two frames to get it.** `god/interventions.ts` spends the stocks for a priced
   * action in a system that runs *before* the world loop in the same step, so
   * last tick's `closing` is not this tick's `opening` on any tick the god paid
   * for something. `opening` is carried precisely so a page never has to.
   *
   * `breaches` is the ledger's own answer and not a re-derivation: it is what the
   * simulation's own assertion throws on, so the two cannot disagree about a
   * tick. Non-empty means material moved without recording itself.
   *
   * ## Two faucets, and `labor` is not new supply
   *
   * `land` is the populace's basket and `applied` is the mages'. They are not the
   * same kind of thing: `produceMaterials` computes one budget off a laborer's
   * month and splits it *by subtraction* into hands for hire and work on the
   * ground, so `land.labor` is taken **out of** the food, stone and vellum that
   * month would otherwise have yielded. `applied` is per mage and routed to a
   * kind by the form of the node she cast, and is genuinely new. A page that
   * draws them as two equal inflows will say raising the hireable share grows the
   * economy; it moves it.
   *
   * `null` when the frame has no sidecar — a recording made before it existed, or
   * the opening frame of any recording, where nothing has been stepped. Never
   * zero-filled: see {@link hasFlow}.
   */
  flow() {
    const raw = this.raw.flow;
    if (!hasFlow(raw)) return null;
    /* Kinds off the data rather than a list here, so a column appended to
       `material-stock` reaches a page without an edit. */
    const basket = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, units(v)]));
    return {
      worldTick: raw.worldTick,
      kinds: Object.keys(raw.opening),
      opening: basket(raw.opening),
      closing: basket(raw.closing),
      faucet: basket(raw.faucet),
      sink: basket(raw.sink),
      land: basket(raw.land),
      applied: basket(raw.applied),
      spilled: basket(raw.spilled),
      /* Present only if the frame carries it — never zero-filled, because a
         `godSpend` of zero is the claim that the god bought nothing this tick
         and an absent one is the claim that this recording cannot say. */
      ...Object.fromEntries(
        FLOW_OPTIONAL_BASKETS.filter((name) => finiteBasket(raw[name])).map((name) => [
          name,
          basket(raw[name]),
        ]),
      ),
      /* Booleans, not quantities. Copied rather than aliased so a page cannot
         write back into the parsed document. */
      short: { ...raw.short },
      claimants: raw.claimants.map((row) => ({
        claimant: row.claimant,
        kind: row.kind,
        owed: units(row.owed),
        paid: units(row.paid),
        shortfall: units(row.shortfall),
        settledIn: row.settledIn,
      })),
      breaches: raw.breaches.map((row) => ({
        kind: row.kind,
        delta: units(row.delta),
        expected: units(row.expected),
        discrepancy: units(row.discrepancy),
      })),
      pressure: Object.fromEntries(FLOW_PRESSURES.map((f) => [f, units(raw.pressure[f])])),
      /* Counts of things, so they stay integers. `units` on a headcount would
         report sixteen mages as 0.015625. */
      producers: Object.fromEntries(FLOW_PRODUCERS.map((f) => [f, raw.producers[f]])),
    };
  }

  /** `running` | `ascended` | `stagnated` | `truncated`. */
  status() {
    return this.raw.status;
  }
}

/**
 * Entity handles carry a generation in their top twelve bits
 * (`sim-core/src/handle.ts`: `(generation << 20) | index`). A page prints the
 * index alone, because a college the player has been funding for two hundred
 * years should not be called `#1048578` — and the full handle rides in the
 * title so nothing is lost. Two entities can share an index across generations;
 * they are never both live, so a live list cannot show the ambiguity.
 */
const shortHandle = (handle) => handle & 0xfffff;

/**
 * The words this interface uses for a mage, a node and a cell — one set of them.
 *
 * **Here rather than in a page**, and that is the point: two pages formatting
 * one fact differently is two vocabularies for it, and the console and the play
 * page already disagreed about how to caption a slot they could not name.
 * {@link candidateNamer} reads this, and so does the university screen — a mage
 * on a bless chip and the same mage on her college's roster are one sentence
 * because they are one function.
 *
 * **Nothing here invents a name.** No component holds one — see
 * {@link WHY_ABSENT.mageNames} — so every word below is either a state field, a
 * content name for an id, or arithmetic over the two. *"A gnome researcher of
 * three hundred, at college #6, who knows one thing"* is a description; "Mira"
 * would be fiction, and a page that invents is worse than one that admits.
 *
 * @param content - `session.content`, for the names ids stand for.
 */
export function mageVocabulary(content) {
  const speciesName = new Map((content.species ?? []).map((x) => [x.speciesId, x.name ?? x.id]));
  const speciesById = new Map((content.species ?? []).map((x) => [x.speciesId, x]));
  const nodeById = new Map((content.nodes ?? []).map((n) => [n.nodeId, n]));
  const cellName = new Map(
    (content.cells ?? []).map((c) => {
      const t = (content.techniques ?? []).find((x) => x.id === c.technique);
      const f = (content.forms ?? []).find((x) => x.id === c.form);
      return [c.cellId, `${t?.name ?? c.technique} ${f?.name ?? c.form}`];
    }),
  );
  /* `??` throughout: a recording made before these tables shipped is still a
     valid recording, and an id is a truthful fallback for a name it does not
     carry. */
  const roleName = (id) => content.mageRoles?.[String(id)] ?? `role ${id}`;
  const goalName = (id) => content.goals?.[String(id)] ?? `goal ${id}`;
  const nodeName = (id) => nodeById.get(id)?.name ?? `node ${id}`;

  /** Months into years, because a mage's age is only ever discussed in years. */
  const age = (ticks) => (ticks >= 12 ? `${Math.floor(ticks / 12)}y` : `${ticks}mo`);

  /** The loudest of the three §1.2 personality figures. Ties go to the first. */
  const temper = (m) => {
    const top = Math.max(m.curiosity, m.ambition, m.caution);
    if (top === m.curiosity) return 'curious';
    return top === m.ambition ? 'ambitious' : 'cautious';
  };

  const knows = (m) =>
    m.nodesKnown === 0 ? 'knows nothing' : `knows ${m.nodesKnown}, to tier ${m.deepestTier}`;

  const vigour = (m) =>
    m.maxVigor > 0 ? `vigor ${Math.round((m.vigor / m.maxVigor) * 100)}%` : 'vigor unknown';

  const doing = (m) =>
    m.goal === undefined
      ? 'has not chosen'
      : m.goal.targetNodeId === 0
        ? `now ${goalName(m.goal.goalId)}`
        : `now ${goalName(m.goal.goalId)} → ${nodeById.get(m.goal.targetNodeId)?.name ?? `node ${m.goal.targetNodeId}`}`;

  const where = (m) => (m.universityId === 0 ? 'unaffiliated' : `at college #${shortHandle(m.universityId)}`);

  const mageSub = (m) => [knows(m), vigour(m), where(m), doing(m), temper(m)].join(' · ');

  const mageTitle = (m) =>
    `handle ${m.handle} · ${m.ageTicks} months · vigor ${m.vigor}/${m.maxVigor} fp · ` +
    `curiosity ${m.curiosity}, ambition ${m.ambition}, caution ${m.caution} fp · ${where(m)}` +
    /* The long form of the gap the caption states in six words. It rides here
       rather than under the list because it is the same sentence for all
       thirty-two rows, and a catalogued absence that is printed nowhere is a
       catalogue entry nobody can check. */
    ` · ${WHY_ABSENT.mageLifespan}`;

  /** The head a candidate chip carries: what she is, since nothing is who. */
  const who = (m) =>
    `${speciesName.get(m.speciesId) ?? `species ${m.speciesId}`} ${roleName(m.roleId)}, ${age(m.ageTicks)}`;

  return {
    speciesName,
    speciesById,
    nodeById,
    nodeName,
    cellName,
    roleName,
    goalName,
    age,
    temper,
    knows,
    vigour,
    doing,
    where,
    who,
    mageSub,
    mageTitle,
  };
}

/**
 * What a college could learn next, and what stands between it and the rest.
 *
 * **This is set arithmetic over content, not a reimplementation of a rule.** The
 * three inputs are all facts a frame or a header already carries: the
 * prerequisite graph (content, in `session.content.nodes`), what each mage holds
 * (`academy` roster), and which cells the ruleset permits — and that last one is
 * the rule, computed by `permits()` inside `agent-api` and shipped as
 * `academy.permittedCells` precisely so that a page does not reconstruct it out
 * of nineteen bits and eight edict slots. Compare {@link reconstructedCharge},
 * which *is* a §5 exception and says so; this is not one.
 *
 * The filter matches `CoordinatingKnowledgeGateway.researchFrontier` — a node in
 * a permitted cell, not already held, every prerequisite held — plus
 * `gatherFrontier`'s species depth ceiling, which is applied one level out
 * there and is applied here for the same reason: a frontier drawn without it
 * overstates what this mage can actually begin.
 *
 * **Per mage, not per college**, and that is the whole correctness of it: the
 * gateway asks `this.knows(mage, prerequisite)`, so *her* holdings satisfy *her*
 * prerequisites. A union of the college's knowledge would let one scholar's
 * groundwork unlock another's next step, which no rule permits and which would
 * be a plausible, confident lie.
 *
 * @param content - `session.content`, for the graph and the depth ceilings.
 * @returns `{ reachable, blockedByAxis, blockedByPrerequisite, blockedByDepth }`,
 * each an array of `{ nodeId, by }` where `by` is the handles of the roster
 * mages the row is true of — plus, on the prerequisite rows, `missing` and
 * whether the college holds the missing pieces somewhere.
 */
export function collegeFrontier(content, dossier, academy) {
  const nodes = content.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const depthOf = new Map((content.species ?? []).map((x) => [x.speciesId, x.depthCeiling]));

  /* Everything the college holds anywhere — every roster mage's head, plus the
     shelves. Not used to satisfy anybody's prerequisites; used only to answer
     "is the missing piece already in this building?", which is the difference
     between "fund research" and "arrange a lesson". */
  const collegeHolds = new Set();
  for (const entry of dossier.roster) for (const id of entry.nodeIds) collegeHolds.add(id);
  for (const entry of dossier.shelf) collegeHolds.add(entry.nodeId);

  const reachable = new Map();
  const blockedByAxis = new Map();
  const blockedByPrerequisite = new Map();
  const blockedByDepth = new Map();
  const push = (into, nodeId, handle, extra) => {
    const row = into.get(nodeId);
    if (row === undefined) into.set(nodeId, { nodeId, by: [handle], ...extra });
    else row.by.push(handle);
  };

  for (const entry of dossier.roster) {
    const mage = academy.mage(entry.handle);
    const ceiling = mage === undefined ? 7 : (depthOf.get(mage.speciesId) ?? 7);
    const held = new Set(entry.nodeIds);
    for (const node of nodes) {
      if (held.has(node.nodeId)) continue;
      const missing = (node.prerequisites ?? []).filter((id) => !held.has(id));
      const permitted = academy.permittedCells.has(node.cellId);
      if (missing.length > 0) {
        /* Only inside a permitted cell. A node that is both forbidden and
           unprepared is reported as forbidden and once: listing it twice would
           make the two lists sum to more than the grid and read as though the
           god had two separate problems with one node. */
        if (permitted) {
          push(blockedByPrerequisite, node.nodeId, entry.handle, {
            missing,
            /* Which of the missing pieces are already in the building. A node
               whose every gap is on the shelf beside her is a teaching problem,
               not a research one — and that is a different verb. */
            missingHeldHere: missing.filter((id) => collegeHolds.has(id)),
          });
        }
        continue;
      }
      if (!permitted) {
        push(blockedByAxis, node.nodeId, entry.handle, {});
        continue;
      }
      if (node.tier > ceiling) {
        push(blockedByDepth, node.nodeId, entry.handle, { ceiling });
        continue;
      }
      push(reachable, node.nodeId, entry.handle, {});
    }
  }

  const ordered = (map) =>
    [...map.values()].sort((a, b) => {
      const at = byId.get(a.nodeId)?.tier ?? 0;
      const bt = byId.get(b.nodeId)?.tier ?? 0;
      return at !== bt ? at - bt : a.nodeId - b.nodeId;
    });

  return {
    reachable: ordered(reachable),
    blockedByAxis: ordered(blockedByAxis),
    blockedByPrerequisite: ordered(blockedByPrerequisite),
    blockedByDepth: ordered(blockedByDepth),
  };
}

/**
 * Turns §4.4's candidate descriptors into the words a player chooses between.
 *
 * A thin layer over {@link mageVocabulary}: the words are shared, and what is
 * local to this function is how a *slot* is captioned — which is per verb and
 * belongs to the action space rather than to the mage.
 *
 * @param content - `session.content`, for the names ids stand for.
 * @returns `(view, action, slot, params) => { head, sub, title } | null`, where
 * `view` is {@link Frame#candidateDetails}. `null` means this source carries no
 * descriptors and the caller should fall back to numbered slots and say why.
 */
export function candidateNamer(content) {
  const vocab = mageVocabulary(content);
  const { speciesName, nodeById, cellName, roleName, age, knows, doing, mageSub, mageTitle } = vocab;
  const traditionName = new Map((content.traditions ?? []).map((t) => [t.traditionId, t.name ?? t.id]));

  /**
   * The line under a described list: what the descriptions still cannot say.
   *
   * Per kind, because the old single sentence was about mages and got printed
   * under a list of colleges. What is absent from a candidate row is a property
   * of what the row describes, not of the mechanism describing it.
   */
  const missing = (view, action) => {
    const rows = view === null || view === undefined ? [] : view.slots(action);
    /* One sentence. The long form of each is in {@link WHY_ABSENT} and rides in
       the row's own title — three cards side by side, each carrying the same
       five-line disclaimer, buries the descriptions it is a footnote to. */
    if (rows.some((r) => r.kind === 'portal-target')) {
      return 'Nothing else is knowable: the rival is built from the seed when the portal opens.';
    }
    if (rows.some((r) => r.kind === 'mage' || r.kind === 'mage-role' || r.kind === 'mage-node')) {
      return 'Still absent: a name — no component holds one — and how long she has left.';
    }
    return '';
  };

  const namer = (view, action, slot, params = []) => {
    if (view === null || view === undefined) return null;
    const row = view.slots(action)[slot];
    if (row === undefined) return null;
    const tail = `slot ${slot} · params ${params.join(', ')}`;

    if (row.kind === 'mage' || row.kind === 'mage-role' || row.kind === 'mage-node') {
      const m = view.mage(row.handle);
      if (m === undefined) return { head: `slot ${slot} — gone`, sub: WHY_ABSENT.mageNames, title: tail };
      const who = `${speciesName.get(m.speciesId) ?? `species ${m.speciesId}`} ${roleName(m.roleId)}, ${age(m.ageTicks)}`;
      if (row.kind === 'mage') return { head: who, sub: mageSub(m), title: `${mageTitle(m)} · ${tail}` };
      if (row.kind === 'mage-role') {
        return {
          head: `${who} → ${roleName(row.toRoleId)}`,
          sub: mageSub(m),
          title: `${mageTitle(m)} · ${tail}`,
        };
      }
      const node = nodeById.get(row.nodeId);
      return {
        head: `${node?.name ?? `node ${row.nodeId}`} → ${who}`,
        /* The node leads, because action 8's list is one mage against many
           nodes: sixteen rows differing only in their tail read as sixteen of
           the same thing. */
        sub:
          `tier ${node?.tier ?? '?'} · ${cellName.get(node?.cellId) ?? 'cell unknown'} · ` +
          `she ${knows(m)} · ${doing(m)}`,
        title: `${mageTitle(m)} · node ${row.nodeId} · ${tail}`,
      };
    }

    if (row.kind === 'university') {
      const u = view.university(row.handle);
      if (u === undefined) return { head: `slot ${slot} — gone`, sub: '', title: tail };
      const built = `${Math.round((u.buildProgress / FP) * 100)}% built`;
      return {
        head: `college #${shortHandle(u.handle)}, ${built}`,
        sub:
          `${u.capacity} seats · ` +
          `${u.hasLibrary ? `${u.libraryNodes} nodes shelved` : 'no library yet'} · ` +
          `${u.affiliatedMages} mages affiliated · ${u.staffCohorts} staff cohorts`,
        title: `handle ${u.handle} · buildProgress ${u.buildProgress} fp · ${tail}`,
      };
    }

    if (row.kind === 'found-university') {
      return {
        head: 'found a new one',
        /* Not an entity, which is exactly what the old anonymous label could not
           say: §4.2 gives founding and funding one action id and slot 0 is the
           founding half. */
        sub: '§4.2 puts founding and funding under one verb, and this is the founding half — there is no college here yet to describe.',
        title: `slot 0 · params 0 — §4.2's "universityId | 0 to found new"`,
      };
    }

    if (row.kind === 'portal-target') {
      return {
        head: `target #${row.targetId}`,
        /* Short here and long once under the list. The full reason is
           {@link WHY_ABSENT.portalTargetDetail}, and repeating a paragraph on
           every row of an eight-slot list would bury the one thing that differs
           between them, which is the id. */
        sub: 'no entity yet — the rival is built from the seed when the portal opens',
        title: `${WHY_ABSENT.portalTargetDetail} · ${tail}`,
      };
    }

    if (row.kind === 'cell') {
      return { head: cellName.get(row.cellId) ?? `cell ${row.cellId}`, sub: '', title: tail };
    }
    if (row.kind === 'tradition') {
      return { head: traditionName.get(row.traditionId) ?? `tradition ${row.traditionId}`, sub: '', title: tail };
    }
    if (row.kind === 'species') {
      return { head: speciesName.get(row.speciesId) ?? `species ${row.speciesId}`, sub: '', title: tail };
    }

    return {
      head: `slot ${slot} — gone`,
      sub: 'The handle in this slot names nobody living in the world as it stands now. §4.4 calls submitting it an ordinary illegal action.',
      title: tail,
    };
  };

  /** `namer.missing(view, action)` — the honesty line for one verb's list. */
  namer.missing = missing;
  return namer;
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
        /**
         * Whether `resources()` can split `materials` into food, stone and
         * vellum. Read off the frame rather than asserted, because a recording
         * made before the `stocks` sidecar existed is still a valid recording
         * and a view must be able to ask instead of guessing.
         */
        materialBreakdown: typeof f.resources().food === 'number',
        ruleset: true,
        actionMask: true,
        knowledgeAggregates: f.knowledge().some((c) => c.live),
        mageBuckets: f.mageBuckets().some((s) => s.living > 0),
        candidates: f.candidateLists().size > 0,
        /**
         * Whether a slot can say what it is rather than only what index it has.
         * Read off the frame for the same reason `materialBreakdown` is — a
         * recording made before the sidecar existed is still valid.
         */
        candidateDetail: f.candidateDetails() !== null,
        /**
         * Whether a page can name a college's roster, its shelf, the lessons in
         * it and the cells the ruleset permits. Read off the frame for the same
         * reason the two above are.
         */
        academy: f.academy() !== null,
        /**
         * Whether a page can draw where this tick's material came from and where
         * it went, rather than only what is left.
         *
         * Read off the **last** frame rather than the first, and that is not
         * arbitrary: frame 0 of every recording is absent by construction —
         * nothing has been stepped at tick 0, so there is no tick to report on —
         * and asking it would report "no ledger" for every recording ever made.
         */
        flowLedger: f.flow() !== null,
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
    /**
     * The **read-only** half: fetch whatever frames the server has that this
     * page does not, and change nothing.
     *
     * A passive surface needs this and had no way to ask for it. `advance(0)`
     * is not it — the server clamps `ticks` to at least one, so a view polling
     * that way would silently *drive* the universe it is watching, and two open
     * tabs would race each other's clocks. `GET /live/frames?since=N` is the
     * incremental read the server already publishes for exactly this.
     *
     * @returns the number of new frames absorbed, so a caller can redraw only
     * when the clock has actually moved.
     */
    poll: async () => {
      const res = await fetch(`${base}/live/frames?since=${doc.frames.length}`);
      if (!res.ok) return 0;
      const payload = await res.json();
      const before = doc.frames.length;
      absorb(payload);
      return doc.frames.length - before;
    },
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
  /*
   * `p.ticks` is a number captured when the document was fetched. On a
   * recording that is the whole run and never moves. On a **live** run the
   * frame array grows under the page, so a strip built from `p.ticks` claimed
   * `tick 40 of 4000` for the rest of the session — measured 2026-08-15 with
   * the clock at 391 and the strip still reading 40. A live surface reporting a
   * frozen clock is worse than one reporting no clock at all.
   *
   * `session.frameCount` is a getter for exactly this reason, so the live strip
   * re-reads it. The interval stops itself once the strip leaves the document,
   * which is what makes this safe to own here rather than in fourteen pages.
   *
   * What it tracks, precisely: **the frames this page holds**, not the server's
   * clock. A surface that drives the run — `console/` casts and scrubs, so it
   * pulls — now follows it. A passive surface that fetched once and never asks
   * again still reads its load tick, and that is the truth about what it is
   * drawing. Making those pages follow a universe they never poll is a
   * different and larger change than this one.
   */
  const where = put(
    null,
    isLive
      ? `seed ${p.seed} · tick ${session.frameCount - 1} of ${p.tickCap} · running now · layout ${p.observationLayoutDigest.slice(0, 8)}`
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

  if (isLive) {
    const tick = setInterval(() => {
      if (!where.isConnected) {
        clearInterval(tick);
        return;
      }
      const at = session.frameCount - 1;
      const next = `seed ${p.seed} · tick ${at} of ${p.tickCap} · running now · layout ${p.observationLayoutDigest.slice(0, 8)}`;
      if (where.textContent !== next) where.textContent = next;
    }, 400);
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
