#!/usr/bin/env node
/*
 * Multiverse Mages — record a real session for the interface prototypes.
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
 * The eleven prototypes under `ui/` each invent their own data. That was right
 * while the questions were about layout, and it is wrong now that the questions
 * are about whether a client can be *fed* — a prototype arguing from invented
 * numbers cannot discover that the read path is missing something.
 *
 * This drives a real `AgentSession` over the reference scenario and writes every
 * tick out as a frame. `ui/shared/session.js` reads the result, so a prototype
 * consumes exactly what `agent-api` emits and nothing else.
 *
 *     npm run ui:record            # 400 ticks, seed 20260813, to ui/session.json
 *     node scripts/record-session.mjs --ticks 1200 --seed 7 --out /tmp/s.json
 *
 * ## Generated, and deliberately not committed
 *
 * `ui/session.json` used to be committed and pinned byte-for-byte. It is now
 * gitignored and built — `npm run ui` builds it for you, and `npm run verify`
 * refreshes it. A 1.1 MB generated JSON in version control conflicts on every
 * branch that moves a rule, and a conflict in it is resolved by regenerating
 * rather than by reading, which means the merge is decided by whoever ran the
 * command last. `scripts/check-generated-artifacts.mjs` has the full argument
 * and gates the two properties this rests on: this recorder is deterministic,
 * and the artifact is not tracked.
 *
 * That determinism is load-bearing rather than incidental. It is why the file CI
 * builds is the file you build, and it is why nothing here may read a clock, a
 * path or anything else about the machine it runs on.
 *
 * ## Why a recording rather than a live session
 *
 * `agent-api` is TypeScript compiled to `dist/`, and the prototypes are static
 * files with no build step — `ui/README.md` makes that a property worth keeping.
 * A recording is the seam that costs nothing: the frame shape here is the shape
 * a live transport would carry, so a client that reads it reads the same view
 * model either way. `ui/shared/session.js` names that boundary explicitly.
 *
 * ## What it deliberately cannot do
 *
 * **There are no individual mages in a frame, because §4.1 has none.** The mage
 * block is 6 species x 8 tiers of *counts*. So `ui/mage/` cannot be fed from
 * this file, and that is a finding rather than a limitation of the script —
 * see `docs/design/interface-findings.md` §1 and the map in `ui/shared/README.md`.
 *
 * Nor is there an explain projection. `agent-api` exports `ExplainProjection`,
 * but `AgentSession` has no `explain()` — the type exists and the session does
 * not offer it, so nothing here can record one.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANDIDATE_SLOTS,
  GOD_ACTION,
  OBSERVATION_BLOCKS,
  OBSERVATION_DESCRIPTORS,
  OBSERVATION_LAYOUT_DIGEST,
  OBSERVATION_SCHEMA_VERSION,
  createSession,
} from '../packages/agent-api/dist/index.js';
import { GOAL_NAMES } from '../packages/rules-world/dist/index.js';
import { referenceContent, referenceScenario } from '../packages/scenario/dist/index.js';
import { MAGE_ROLE } from '../packages/state/dist/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const ticks = Number(arg('ticks', '400'));
const seed = Number(arg('seed', '20260813'));
const out = arg('out', path.join(HERE, '..', 'ui', 'session.json'));

const content = referenceContent();
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
const { scenario } = referenceScenario(content, { raids: true });
const session = createSession({ scenario, strategyId: 'ui-recording' });

// §4.3 puts the step limit on the caller and the session refuses an uncapped
// episode, so the cap is stated rather than assumed.
session.reset(seed, { worldTickCap: ticks });

/**
 * ## Recovering the integers the session does not hand out
 *
 * `AgentView` carries both `raw: Int32Array` — which `view.ts` itself calls
 * *"the reproducible artefact"* — and the normalized `Float64Array`.
 * **`AgentSession.observe()` returns only the normalized one.** So a client
 * reading the session gets 0.3125 where the world holds 40.0 favor, and no
 * interface can print a number a player could act on.
 *
 * Every descriptor in the current layout is `ratio` or `flag`, and both are
 * exact ratios of a divisor the package exports, so the integers are
 * recoverable: `raw = normalized x divisor`. That is what is stored here, and
 * `normalization-inversion.test.ts` in `agent-api` pins the roundtrip rather
 * than trusting this arithmetic.
 *
 * Two things this cannot recover, both recorded rather than papered over:
 *
 *  - **Saturation.** A channel at or above its divisor normalizes to 1.0 and the
 *    excess is gone. Those slots are listed per frame in `sat` so a view can say
 *    *"128+"* instead of *"128"*.
 *  - **A non-invertible rule.** `log-bucket` is a declared rule that no channel
 *    currently uses. If one adopts it, the assertion below fails loudly instead
 *    of writing plausible wrong numbers — which is the whole reason a client
 *    should be reading `raw` off the session rather than reconstructing it here.
 */
const INVERTIBLE = new Set(['ratio', 'flag']);
const nonInvertible = OBSERVATION_DESCRIPTORS.map((d, i) => [i, d]).filter(
  ([, d]) => !INVERTIBLE.has(d.rule),
);
if (nonInvertible.length > 0) {
  throw new Error(
    `Slots ${nonInvertible.map(([i]) => i).join(', ')} use a normalization rule this script ` +
      'cannot invert. A client cannot reconstruct the integers either — the session must expose ' +
      '`raw` (see docs/design/interface-findings.md).',
  );
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

const frames = [];
const record = () => {
  const normalized = session.observe();
  const mask = session.legalActions();
  const candidates = session.candidates();
  const sat = [];
  const obs = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const v = normalized[i];
    const d = OBSERVATION_DESCRIPTORS[i];
    // A `flag` at 1 is a set flag, not a lost magnitude. Only a `ratio` pinned
    // at its ceiling has had information discarded.
    if (v >= 1 && d.rule === 'ratio') sat.push(i);
    obs.push(Math.round(v * d.divisor));
  }
  frames.push({
    // Integer fp, reconstructed. Not what the session returned — see above.
    obs,
    sat,
    // The one thing `obs` structurally cannot carry: `material-stock`'s seven
    // kinds, which §4.1 sums three of into the single `resources[39]` slot and
    // has no slot at all for the other four. Taken from the §4.4 player
    // projection, which is not the observation and is not bounded by its width
    // — see `AgentSession.playerState`.
    //
    // The stocks and no more. `favor`, `worship` and `prestige` are already in
    // `obs`, and emitting them here as well would put one fact in two places per
    // frame, where they can disagree: `obs` is reconstructed through a divisor
    // and saturates, this is exact, and a view reading whichever it happened to
    // reach would report two different universes.
    //
    // **Kept in step with `play-server.mjs` by hand.** A comment elsewhere in
    // this repository refers to `scripts/play-control.mjs --shape` as the thing
    // that holds the recorder and the live server equivalent; that script does
    // not exist, so nothing automated checks it. A live server serving a
    // different frame shape than the recorder makes every page work against one
    // and not the other.
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
     * **Kept in step with the sibling script by hand.** A comment in this
     * repository refers to `scripts/play-control.mjs --shape` as the thing that
     * holds the recorder and the live server equivalent; that script does not
     * exist, so nothing automated checks it.
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
    // Candidate lists are slot-indexed per parameterized action (§4.4).
    // `CandidateLists` is a ReadonlyMap keyed by action id, not a plain object —
    // `Object.entries` on it returns nothing, which reads as "the read path has
    // no candidates" rather than as a serialization mistake.
    candidates: Object.fromEntries(
      [...candidates].map(([action, list]) => [action, [...(list ?? [])]]),
    ),
    status: session.status(),
  });
};

record();
for (let i = 0; i < ticks; i += 1) {
  if (session.status() !== 'running') break;
  // A no-op every tick: this records what a universe *does on its own*, which is
  // the state every prototype is drawn against. A recording that also played
  // would be recording a strategy, and no prototype is about one.
  session.submit({ id: GOD_ACTION.noop });
  record();
}

const doc = {
  provenance: {
    seed,
    // Both, because they part company the first time a run ends early: `ticks`
    // is what happened, `tickCap` is what was asked for. The golden test re-runs
    // the recorder, and re-running with the observed length would quietly hand
    // the session a different `worldTickCap` than the recording had.
    ticks: frames.length - 1,
    tickCap: ticks,
    scenarioId: session.scenarioId,
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    actionSpaceSize: session.actionSpaceSize,
    snapshotHash: session.snapshotHash(),
    // Written so a stale recording is detectable rather than merely old: the
    // digest changes whenever a block, a rule or a saturation constant does.
    recordedBy: 'scripts/record-session.mjs',
  },
  layout: OBSERVATION_BLOCKS.map((b) => ({ name: b.name, offset: b.offset, size: b.size })),
  actions: Object.fromEntries(Object.entries(GOD_ACTION).map(([k, v]) => [v, k])),
  /**
   * The names behind the indices, so a view needs one fetch rather than two and
   * can never disagree with the run about what cell 34 is.
   *
   * `actionCosts` is here for a reason worth stating plainly, because it is the
   * one thing in this file that a shipped client must not copy. §4.2 folds
   * affordability into the same bit as structural legality — `mask.ts` masks an
   * action *"whose cost exceeds the current favor pool"* using the same zero it
   * uses for an action that is structurally impossible. So a dark control means
   * either *wait* or *change your ruleset*, and nothing on the read path says
   * which. A client can only tell them apart by pricing the action itself, which
   * is precisely what §5's *"the client computes no rules"* forbids. Shipping
   * the table lets `ui/glow/` show the distinction and label it as reconstructed
   * — the finding becomes something you can look at instead of an argument.
   */
  content: {
    techniques: registry.techniques.map(({ record: t }) => ({
      bit: t.bit,
      id: t.id,
      name: t.name,
    })),
    forms: registry.forms.map(({ record: f }) => ({ bit: f.bit, id: f.id, name: f.name })),
    cells: registry.cells.map(({ contentId, record: c }) => ({
      cellId: contentId,
      id: c.id,
      technique: c.technique,
      form: c.form,
      /* How many nodes the cell carries at all. The grid says "4 of 5 known",
         which is the number a player needs; the count alone cannot say it. */
      nodeCount: (c.nodes ?? []).length,
    })),
    species: registry.species.map(({ contentId, record: s }) => ({
      speciesId: contentId,
      id: s.id,
      name: s.name,
      /**
       * §1.3's depth ceiling — the deepest tier this species can research at
       * all. `gatherFrontier` applies it *after* the gateway's prerequisite and
       * legality filter, so a frontier drawn without it overstates what a gnome
       * of forty can actually begin. Content, like the graph above.
       */
      depthCeiling: s.depthCeiling,
    })),
    actionCosts: Object.fromEntries(
      registry.godCosts.map(({ record: g }) => [g.actionId, g.favorCost]),
    ),
    // §4.4's pinned k per parameterized action. Shipped rather than restated in
    // a view, because a hand-copied constant in a page whose whole argument is
    // "nothing here is invented" would be the one invented number on it — and
    // it would go stale the moment finding 1.8 is fixed.
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
  },
  frames,
};

writeFileSync(out, `${JSON.stringify(doc)}\n`);
process.stderr.write(
  `recorded ${frames.length} frames (${ticks} ticks, seed ${seed}) to ${out}\n` +
    `  observation ${doc.layout.reduce((n, b) => n + b.size, 0)} slots, digest ${doc.provenance.observationLayoutDigest.slice(0, 12)}…\n`,
);
