/*
 * Multiverse Mages — one frame encoder, shared by every live server.
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the GNU
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The document shape every `ui/` page reads — a header and a list of frames —
 * built from a live `AgentSession`.
 *
 * Moved out of `scripts/play-server.mjs` verbatim so the lobby
 * (`packages/lobby`) publishes the same bytes play-server does, rather than a
 * second copy that drifts. Held equivalent to `scripts/record-session.mjs` by
 * `packages/lobby/test/unit/frame-document.test.ts`.
 *
 * The content is a parameter, not a module global: a lobby builds one encoder
 * and every universe it hosts is encoded against the same shipped registry.
 */

import {
  CANDIDATE_SLOTS,
  GOD_ACTION,
  OBSERVATION_BLOCKS,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
} from '../../packages/agent-api/dist/index.js';
import { GOAL_NAMES } from '../../packages/rules-world/dist/index.js';
import { MAGE_ROLE } from '../../packages/state/dist/index.js';

/** The one non-invertible-rule guard `record-session.mjs` documents at length. */
const INVERTIBLE = new Set(['ratio', 'flag']);
const nonInvertible = OBSERVATION_DESCRIPTORS.map((d, i) => [i, d]).filter(
  ([, d]) => !INVERTIBLE.has(d.rule),
);
if (nonInvertible.length > 0) {
  throw new Error(
    `Slots ${nonInvertible.map(([i]) => i).join(', ')} use a normalization rule this server ` +
      'cannot invert, so the integers it publishes would be plausible and wrong.',
  );
}

/**
 * Builds the encoder for one content set.
 *
 * @param content - a `ReferenceContent` (`referenceContent()`).
 * @param recordedBy - written into every header's `provenance.recordedBy`.
 */
export function frameDocument(content, recordedBy) {
const { registry } = content;

/**
 * `cell` on a node record is the cell's **string** id; every client index is by
 * interned `cellId`. One map, built once, rather than a `find` per node.
 */
const cellIdByStringId = new Map(registry.cells.map(({ contentId, record: c }) => [c.id, contentId]));

/**
 * A node's authored id to its interned `nodeId`, so `prerequisites` — which
 * content states as authored ids — can be published as the numbers every client
 * index already uses.
 */
const nodeIdByStringId = new Map(registry.nodes.map(({ contentId, record: n }) => [n.id, contentId]));

/**
 * An authored prerequisite list, interned.
 *
 * **Throws rather than emitting `0`.** A `0` here would be the reserved null
 * (§0) sitting in a prerequisite list, and a client's reachability arithmetic
 * would read it as a requirement nothing can satisfy — a node quietly
 * unreachable forever, with no error anywhere. The content loader already
 * refuses an unresolvable prerequisite; this is the second lock, on the one
 * translation between the two id spaces.
 */
const internPrerequisites = (node) =>
  (node.prerequisites ?? []).map((id) => {
    const nodeId = nodeIdByStringId.get(id);
    if (nodeId === undefined) {
      throw new Error(
        `Node ${node.id} declares prerequisite ${id}, which content does not name. A client ` +
          'reading this graph would draw an edge from nowhere.',
      );
    }
    return nodeId;
  });

/** Which cheat names a sheet declares, for the banner and the log line. */
function declaredCheats(spec) {
  if (spec === null || spec === undefined) return [];
  const named = [];
  const has = (key) => spec[key] !== undefined && spec[key] !== null;
  if (has('setMaterials')) named.push('setMaterial');
  if (has('grantMaterials')) named.push('grantMaterial');
  if (has('materialFloor') || (spec.satisfy ?? []).length > 0) named.push('materialFloor');
  if (has('materialCeiling')) named.push('materialCeiling');
  if (has('favor')) named.push('favor');
  if (has('favorCap')) named.push('favorCap');
  if (has('prestige')) named.push('prestige');
  if (has('worship') || has('worshipTier')) named.push('worship');
  if (has('armTechniques') || has('armForms') || spec.armEverything === true) named.push('armAxes');
  if (has('edictBudget')) named.push('edictBudget');
  if (has('grantBudget')) named.push('grantBudget');
  if (spec.completeConstruction === true) named.push('completeConstruction');
  if ((spec.foundUniversities ?? 0) > 0) named.push('foundUniversity');
  if (has('studentSeats')) named.push('studentSeats');
  if ((spec.grantKnowledge ?? []).length > 0) named.push('grantKnowledge');
  if ((spec.shelveKnowledge ?? []).length > 0) named.push('shelveKnowledge');
  return named;
}

/** One tick, encoded the way `record-session.mjs` encodes one. */
function encodeFrame(session) {
  const normalized = session.observe();
  const mask = session.legalActions();
  const candidates = session.candidates();
  const sat = [];
  const obs = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const v = normalized[i];
    const d = OBSERVATION_DESCRIPTORS[i];
    if (v >= 1 && d.rule === 'ratio') sat.push(i);
    obs.push(Math.round(v * d.divisor));
  }
  return {
    obs,
    sat,
    // `material-stock`'s seven kinds, which §4.1 sums three of into
    // `resources[39]` and has no slot at all for the other four. Same field,
    // same source and same reasoning as `record-session.mjs`: the §4.4 player
    // projection, the stocks only, nothing that is already in `obs`. Held
    // equivalent to the recorder **by hand** — see the longer note there.
    stocks: { ...session.playerState().resources.stocks },
    /**
     * §4.4's candidate descriptors — what each slot *is*, beside what it
     * submits.
     *
     * `candidates` above carries `params` and nothing else, which is everything
     * a policy needs and nothing at all to a person: `docs/design/
     * interface-findings.md` §1.11 is that finding, and *"1 of 19, by §4.4
     * ranking"* is what a page can print without this. Taken from the same §4.4
     * projection surface `stocks` comes from — emitted on request, read by no
     * rule, and outside the observation, so `OBSERVATION_SIZE` and the layout
     * digest do not move.
     *
     * `byAction` is aligned slot-for-slot with `candidates`; `mages` and
     * `universities` are per-handle lookups, so a mage named by three verbs is
     * shipped once. `goal` is **absent** rather than null for a mage who has
     * never committed — `JSON.stringify` drops an undefined field, and that is
     * the distinction `GOAL_COMMITMENT` makes load-bearing between "has not
     * chosen" and "chose idle".
     */
    /**
     * §4.4's flow ledger for the tick just stepped — where this tick's material
     * came from and where it went.
     *
     * The fourth sidecar off the same §4.4 projection surface as `stocks`,
     * `candidateDetail` and `academy`, and the first that is not a reading of
     * state at all: `economy-flow-models.md` §5.2 is the finding — *"every metric
     * in the registry measures a level, a rate, or a distribution at a
     * checkpoint. None reconciles flows."* `obs` carries seven closing levels and
     * nothing about how they got there, so a universe that spent its vellum and
     * one that leaked it are the same two numbers.
     *
     * **Absent rather than null on the opening frame**, and absent again on any
     * frame whose report is of a different tick — `JSON.stringify` drops an
     * undefined field, which is the distinction a client must be able to make.
     * `session.flowLedger()` returns `undefined` in both cases and `ui/shared/
     * session.js` renders that as absent rather than as zero, because an empty
     * granary is a crisis and an unknown granary is not.
     *
     * Emitted as the projection returns it: it is already a fresh structure of
     * plain objects, arrays and integers, so nothing is reshaped here. A field
     * renamed on the way through would be a second vocabulary for one projection.
     *
     * Held equivalent to `record-session.mjs` by
     * `packages/lobby/test/unit/frame-document.test.ts`.
     */
    flow: session.flowLedger(),
    candidateDetail: encodeCandidateDetail(session.candidateDetails()),
    /**
     * §4.4's academy projection — every college, its roster, its shelf, the
     * lessons in progress, and the cells the ruleset permits.
     *
     * Same surface and the same reasoning as `stocks` and `candidateDetail`
     * above: emitted on request from a running session, read by no rule, outside
     * the observation, so `OBSERVATION_SIZE` and the layout digest do not move.
     * §4.1 has none of it — `MAGE.universityId` reaches no slot, `EFFORT_PROGRESS`
     * reaches no slot, and the mage block is 6 species x 8 tiers of counts, so a
     * policy cannot tell a college of five from five hermits.
     *
     * `permittedCells` is the one field here that is a *rule* rather than a
     * reading. It is `permits()` over the cells content populates, computed in
     * `agent-api` precisely so that a page does not reconstruct it out of the
     * ruleset block's nineteen bits and eight edict slots — which is what §5's
     * "the client computes no rules" forbids.
     */
    academy: encodeAcademy(session.academy()),
    mask: [...mask],
    candidates: Object.fromEntries(
      [...candidates].map(([action, list]) => [action, [...(list ?? [])]]),
    ),
    status: session.status(),
  };
}


/**
 * The §4.4 academy projection, as JSON.
 *
 * Maps keyed by number do not survive `JSON.stringify`, so both tables become
 * objects keyed by the decimal handle — the same treatment
 * {@link encodeCandidateDetail} gives, read back the same way through
 * `Number(key)`. Nothing is reshaped beyond that.
 */
function encodeAcademy(academy) {
  return {
    universities: Object.fromEntries(
      [...academy.universities].map(([handle, dossier]) => [
        handle,
        {
          college: { ...dossier.college },
          roster: dossier.roster.map((entry) => ({ ...entry, nodeIds: [...entry.nodeIds] })),
          shelf: dossier.shelf.map((entry) => ({ ...entry })),
          teaching: dossier.teaching.map((entry) => ({ ...entry })),
          staffHeadcount: dossier.staffHeadcount,
        },
      ]),
    ),
    mages: Object.fromEntries([...academy.mages].map(([handle, mage]) => [handle, { ...mage }])),
    permittedCells: [...academy.permittedCells],
    unaffiliated: academy.unaffiliated,
  };
}

/**
 * The §4.4 candidate projection, as JSON.
 *
 * Maps keyed by number do not survive `JSON.stringify`, so both are turned into
 * objects keyed by the decimal handle — which is what `ui/shared/session.js`
 * reads back through `Number(key)`. Nothing is reshaped beyond that: a field
 * renamed here would be a second vocabulary for one projection.
 */
function encodeCandidateDetail(detail) {
  return {
    byAction: Object.fromEntries(
      [...detail.byAction].map(([action, rows]) => [action, rows.map((row) => ({ ...row }))]),
    ),
    mages: Object.fromEntries([...detail.mages].map(([handle, mage]) => [handle, { ...mage }])),
    universities: Object.fromEntries(
      [...detail.universities].map(([handle, university]) => [handle, { ...university }]),
    ),
  };
}

/**
 * The static half of the document: everything `ui/shared/session.js` reads that
 * is not a frame.
 *
 * Duplicated from `record-session.mjs` rather than extracted into a shared
 * module, deliberately. That script has a golden test that re-runs it, and
 * sharing code with it would make a change here a change to a fixture. Held
 * equivalent to `record-session.mjs` by
 * `packages/lobby/test/unit/frame-document.test.ts`, which builds a live
 * document and a recorded one and diffs their keys.
 */
function header(r) {
  return {
    provenance: {
      seed: r.seed,
      ticks: r.frames.length - 1,
      tickCap: r.cap,
      scenarioId: r.session.scenarioId,
      observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
      observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
      actionSpaceSize: r.session.actionSpaceSize,
      snapshotHash: r.session.snapshotHash(),
      recordedBy,
      /** The one field a recording does not have. Views use it to say LIVE. */
      live: true,
      /**
       * Present **only** on a cheated run, and the key every surface keys its
       * banner off. Additive: `ui/shared/session.js` reads with `??`, and an
       * honest run's provenance is byte-identical to what it always was.
       *
       * The authoritative mark is not this — it is the `sandbox-brand`
       * component inside the snapshot, which survives a save, refuses to load
       * into an honest build, and cannot be cleared by playing on. This is the
       * copy a browser can see.
       */
      ...(r.sheet === null
        ? {}
        : {
            sandbox: {
              digest: r.sheet.digest,
              cheats: declaredCheats(r.sandbox),
              spec: r.sandbox,
            },
          }),
    },
    layout: OBSERVATION_BLOCKS.map((b) => ({ name: b.name, offset: b.offset, size: b.size })),
    actions: Object.fromEntries(Object.entries(GOD_ACTION).map(([k, v]) => [v, k])),
    content: {
      techniques: registry.techniques.map(({ record: t }) => ({ bit: t.bit, id: t.id, name: t.name })),
      forms: registry.forms.map(({ record: f }) => ({ bit: f.bit, id: f.id, name: f.name })),
      cells: registry.cells.map(({ contentId, record: c }) => ({
        cellId: contentId,
        id: c.id,
        technique: c.technique,
        form: c.form,
        classicalLabels: c.classicalLabels || [],
        nodeCount: (c.nodes ?? []).length,
      })),
      species: registry.species.map(({ contentId, record: s }) => ({
        speciesId: contentId,
        id: s.id,
        name: s.name,
        /**
         * §1.3's depth ceiling — the deepest tier this species can research at
         * all. `gatherFrontier` applies it *after* the gateway's prerequisite
         * and legality filter, so a frontier drawn without it overstates what a
         * gnome of forty can actually begin. Content, like the graph above.
         */
        depthCeiling: s.depthCeiling,
      })),
      actionCosts: Object.fromEntries(
        registry.godCosts.map(({ record: g }) => [g.actionId, g.favorCost]),
      ),
      /**
       * The second currency of each priced action, `fp` per material kind, as
       * `god-cost.json` authors it — so a page can say *"costs 6 favor and 4
       * essence"* instead of only the favor half. Content, not a rule: the mask
       * still decides whether the god can pay. Additive; not in a recording's
       * content block, so a page reads it with `??`.
       */
      actionMaterialCosts: Object.fromEntries(
        registry.godCosts
          .filter(({ record: g }) => g.materialCost !== undefined)
          .map(({ record: g }) => [g.actionId, { ...g.materialCost }]),
      ),
      /**
       * The ascension thresholds from `god-constant.json` (`ascension-*`), keyed
       * by the id without its prefix. Published so the play page's checklist
       * states the bars content sets rather than a hand-copied set that a retune
       * would silently falsify. The qualification itself stays the server's
       * (mask entry 15). Additive, like `actionMaterialCosts`.
       */
      ascension: Object.fromEntries(
        registry.godConstants
          .filter(({ record: c }) => c.id.startsWith('ascension-'))
          .map(({ record: c }) => [c.id.slice('ascension-'.length), c.value]),
      ),
    /**
     * Every node, so a founding grant can say *which* node it would found.
     *
     * `agent-api`'s catalogue carries a node's cell and tier and deliberately no
     * name — it is a projection for an encoder, and §5 keeps `@mm/content` out
     * of a package a renderer imports. A *name* is content, and this is where
     * content is published to the client. `cellId` rides along so a page can
     * place the node on the grid it is already drawing.
     */
    nodes: registry.nodes.map(({ contentId, record: n }) => ({
      nodeId: contentId,
      id: n.id,
      name: n.name,
      gloss: n.gloss || '',
      cellId: cellIdByStringId.get(n.cell) ?? 0,
      tier: n.tier,
      /**
       * §2.3's prerequisite edges, interned — **the research graph, which no
       * client has ever been shipped.**
       *
       * The grid the pages draw is seventy cells of counts, and a count cannot
       * say what comes next. 300 nodes carry 292 edges between them, 36 of which
       * cross cells, and every one of those was invisible: a page could show
       * that a college knows four nodes in *creo animal* and not that the fifth
       * is gated behind a node in a cell the god has forbidden.
       *
       * This is **content**, published where content is published. Nothing about
       * the observation moves — `OBSERVATION_SIZE` is 400, the digest is
       * 46182c35d829b205, no schema revision, no baseline — because a header is
       * not a frame and the graph is the same in every universe this content
       * builds.
       *
       * What it buys is that "what could this college learn next" becomes set
       * arithmetic a client can do: a node is within reach when every id in this
       * list is held and its cell is in the frame's `academy.permittedCells`,
       * which is the same filter `CoordinatingKnowledgeGateway.researchFrontier`
       * applies. The *rule* — which cells are permitted — is still computed by
       * `agent-api`; only the graph walk is here.
       */
      prerequisites: internPrerequisites(n),
    })),
    /**
     * `MAGE_ROLE`'s words. §1.2 stores a role as a `u8` and the enum lives in
     * `@mm/state`; publishing the mapping here keeps the client from carrying a
     * hand-copied table that a fifth role would silently break.
     */
    mageRoles: Object.fromEntries(Object.entries(MAGE_ROLE).map(([name, id]) => [id, name])),
    /**
     * `rules-world`'s permanent goal registry, by id — what a mage is currently
     * working on. `@mm/state` records why the table cannot live anywhere else:
     * *"it would be a second copy of a table whose whole contract is that there
     * is one"*. This script may read it because a script is not a package; the
     * projection that carries `goalId` may not, and does not.
     */
    goals: { ...GOAL_NAMES },
      candidateSlots: { ...CANDIDATE_SLOTS },
      /**
       * The traditions, so the console can name action 13's parameter. Not in a
       * recording's content block; additive, and `session.js` reads it with `??`.
       */
      traditions: registry.traditions.map(({ contentId, record: t }) => ({
        traditionId: contentId,
        id: t.id,
        name: t.name ?? t.id,
      })),
    },
  };
}

return { encodeFrame, header, declaredCheats };
}
