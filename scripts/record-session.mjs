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
import { referenceContent, referenceScenario } from '../packages/scenario/dist/index.js';

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
    })),
    species: registry.species.map(({ contentId, record: s }) => ({
      speciesId: contentId,
      id: s.id,
      name: s.name,
    })),
    actionCosts: Object.fromEntries(
      registry.godCosts.map(({ record: g }) => [g.actionId, g.favorCost]),
    ),
    // §4.4's pinned k per parameterized action. Shipped rather than restated in
    // a view, because a hand-copied constant in a page whose whole argument is
    // "nothing here is invented" would be the one invented number on it — and
    // it would go stale the moment finding 1.8 is fixed.
    candidateSlots: { ...CANDIDATE_SLOTS },
  },
  frames,
};

writeFileSync(out, `${JSON.stringify(doc)}\n`);
process.stderr.write(
  `recorded ${frames.length} frames (${ticks} ticks, seed ${seed}) to ${out}\n` +
    `  observation ${doc.layout.reduce((n, b) => n + b.size, 0)} slots, digest ${doc.provenance.observationLayoutDigest.slice(0, 12)}…\n`,
);
