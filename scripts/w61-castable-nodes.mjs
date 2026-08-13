/*
 * Multiverse Mages — W61: which combat primitives can actually reach a field.
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
 * A raid-scale instrument, because the thing it measures is raid-scale.
 *
 * The three committed balance gates cannot see this change and it is worth
 * stating why rather than inferring it: they resolve **zero raids** at every
 * committed world-tick cap — 60, 240 and 2400 — measured by running the
 * reference executor directly. A gate that never opens a portal is blind to
 * `rules-raid` by construction, so this runs raids itself.
 *
 * Two universes built by hand over the **shipped** content set, the same
 * warbands and the same seeds every time, and it reports what actually reached
 * the field. Run it on this branch and on `main` and the two tables are the
 * before and after.
 *
 *     node scripts/w61-castable-nodes.mjs [--raids 48]
 *
 * Run `npm run typecheck` first — this loads `dist/`.
 */

import { loadContent, shippedContentSource } from '../packages/content/dist/index.js';
import { FP_ONE, createState } from '../packages/sim-core/dist/index.js';
import {
  GRIMOIRE,
  HOLDER_KIND,
  LIBRARY,
  LOCATION_KIND,
  MAGE,
  MAGE_ROLE,
  OCCUPATION,
  POPULACE_COHORT,
  RAID_SIDE,
  UNIVERSITY,
  attachRecord,
  defineWorldStateSchema,
} from '../packages/state/dist/index.js';
import {
  KnowledgeSubsystem,
  MagicGrid,
  portalHookSet,
  resolvePortalHooks,
  traditionTable,
} from '../packages/rules-magic/dist/index.js';
import {
  deployRaid,
  openPortal,
  readRaidTuning,
  runRaid,
} from '../packages/rules-raid/dist/index.js';

const RAIDS = Number(
  process.argv.includes('--raids') ? process.argv[process.argv.indexOf('--raids') + 1] : 48,
);

const registry = loadContent(shippedContentSource());
const grid = MagicGrid.from(registry);
const tuning = readRaidTuning(registry);
const traditions = traditionTable(
  registry.traditions.map((entry) => [entry.contentId, entry.record]),
);

const ALL_TECHNIQUES = 0b11111;
const ALL_FORMS = 0b11111111111111;
const intern = (kind, id) => registry.intern(kind, id);
const speciesOf = (id) => registry.species.find((entry) => entry.contentId === id).record;

/**
 * Warbands holding one node of each castable kind, from the twelve v1 cells.
 *
 * The point is coverage, not realism: if a primitive does not reach the field
 * with a mage who holds a node carrying it, standing in a sky that permits it,
 * then nothing about content or ruleset is what is stopping it.
 */
const RAIDER_NODES = [
  'rn-keep-the-name-close', // concealment — passive, expected never to be cast
  'pm-blunt-the-edge', // direct-damage, tier 1
  'im-read-the-surface', // knowledge-steal — the theft intent's, not the cast's
  'rn-call-by-name', // summon, tier 1
  'pt-open-the-ground', // area-denial, tier 2
  'rl-step-across', // blink, tier 2
];
const DEFENDER_NODES = [
  'rn-keep-the-name-close',
  'pm-blunt-the-edge',
  'pl-fray-the-edge', // direct-damage, tier 1
  'rl-hold-the-door', // ward — passive, expected never to be cast
  'pt-open-the-ground',
];

function rulesetFor(tradition) {
  return Object.freeze({
    permittedTechniques: ALL_TECHNIQUES,
    permittedForms: ALL_FORMS,
    edicts: Object.freeze([]),
    traditionId: intern('tradition', tradition),
    contentRevision: registry.contentRevision,
  });
}

function emptyWorld() {
  return createState({
    rootSeed: 1,
    schema: defineWorldStateSchema(),
    contentRevision: registry.contentRevision,
  });
}

function addMage(world, knowledge, role, nodes) {
  const handle = world.entities.create();
  attachRecord(world, MAGE, handle, {
    speciesId: intern('species', 'human'),
    birthTick: 0,
    roleId: role,
    universityId: 0,
    curiosity: FP_ONE,
    ambition: FP_ONE,
    caution: FP_ONE,
    vigor: 64 * FP_ONE,
    maxVigor: 64 * FP_ONE,
    alive: 1,
  });
  for (const node of nodes) {
    knowledge.createInstance({
      nodeId: intern('node', node),
      locationKind: LOCATION_KIND.mind,
      locationId: handle,
      acquiredTick: 0,
      mastery: FP_ONE,
    });
  }
}

function addSoldiers(world, count) {
  const handle = world.entities.create();
  attachRecord(world, POPULACE_COHORT, handle, {
    speciesId: intern('species', 'human'),
    occupation: OCCUPATION.soldier,
    count,
    birthTickBucket: 0,
  });
}

function addUniversity(world, knowledge, shelved) {
  const library = world.entities.create();
  attachRecord(world, LIBRARY, library, { foundedTick: 0 });
  const university = world.entities.create();
  attachRecord(world, UNIVERSITY, university, {
    libraryId: library,
    capacity: 10,
    buildProgress: FP_ONE,
  });
  for (const node of shelved) {
    const grimoire = world.entities.create();
    attachRecord(world, GRIMOIRE, grimoire, {
      nodeId: intern('node', node),
      durability: 512,
      holderKind: HOLDER_KIND.library,
      holderId: library,
    });
    knowledge.createInstance({
      nodeId: intern('node', node),
      locationKind: LOCATION_KIND.library,
      locationId: library,
      acquiredTick: 0,
      mastery: FP_ONE,
      grimoire,
    });
  }
}

function participant(world, knowledge, snapshot, hostTraditionId) {
  return {
    world,
    knowledge,
    ruleset: snapshot,
    hooks: resolvePortalHooks(portalHookSet(snapshot.traditionId, hostTraditionId, traditions)),
    speciesOf,
  };
}

function oneRaid(hostSnapshot, raidSeed) {
  const attackerWorld = emptyWorld();
  const hostWorld = emptyWorld();
  const attackerKnowledge = new KnowledgeSubsystem(attackerWorld, registry.nodes.length + 1);
  const hostKnowledge = new KnowledgeSubsystem(hostWorld, registry.nodes.length + 1);

  for (let n = 0; n < 6; n += 1) {
    addMage(attackerWorld, attackerKnowledge, MAGE_ROLE.raider, RAIDER_NODES);
    addMage(hostWorld, hostKnowledge, MAGE_ROLE.warden, DEFENDER_NODES);
  }
  addSoldiers(attackerWorld, 300);
  addSoldiers(hostWorld, 300);
  addUniversity(hostWorld, hostKnowledge, ['rl-open-the-portal', 'im-read-the-surface']);

  const raid = openPortal({
    attacker: participant(
      attackerWorld,
      attackerKnowledge,
      // The raider's home ruleset. Permissive and Vancian throughout: the
      // *host's* tradition is what governs casting inside the host's sky
      // (§2.5), so varying the raider's would measure nothing here.
      rulesetFor('vancian-memorization'),
      hostSnapshot.traditionId,
    ),
    host: participant(hostWorld, hostKnowledge, hostSnapshot, hostSnapshot.traditionId),
    tuning,
    registry,
    grid,
    raidSeed,
  });
  deployRaid(raid);
  return runRaid(raid);
}

function tally(hostSnapshot) {
  const byPrimitive = new Map();
  let raids = 0;
  let attackerCasualties = 0;
  let defenderCasualties = 0;
  let ticks = 0;
  for (let seed = 1; seed <= RAIDS; seed += 1) {
    let outcome;
    try {
      outcome = oneRaid(hostSnapshot, seed);
    } catch (error) {
      // A ceiling hit is a datum, not a crash: it is exactly the "both sides
      // stood in a field" symptom the castability filter exists to prevent.
      if (!/ceiling/i.test(String(error))) throw error;
      continue;
    }
    raids += 1;
    ticks += outcome.resolutionTick;
    for (const casualty of outcome.casualties) {
      if (casualty.side === RAID_SIDE.attacker) attackerCasualties += 1;
      else defenderCasualties += 1;
    }
    for (const [primitive, application] of outcome.primitiveApplication) {
      const entry = byPrimitive.get(primitive) ?? { attacker: 0, defender: 0, applications: 0 };
      entry.attacker += application.attacker;
      entry.defender += application.defender;
      entry.applications += application.applications;
      byPrimitive.set(primitive, entry);
    }
  }
  return { raids, byPrimitive, attackerCasualties, defenderCasualties, ticks };
}

const fp = (value) => (value / FP_ONE).toFixed(0);
const ALL_COMBAT = [
  'direct-damage',
  'area-denial',
  'blink',
  'summon',
  'ward',
  'concealment',
  'knowledge-steal',
  'portal',
];

console.log('# W61 — which combat primitives reach a field\n');
console.log(`${RAIDS} raids per row, seeds 1..${RAIDS}, host permitting everything.`);
console.log('Warbands hold one node of each castable kind; see the source.\n');

for (const tradition of ['vancian-memorization', 'true-naming']) {
  const totals = tally(rulesetFor(tradition));
  console.log(`## Host tradition: ${tradition}\n`);
  console.log(
    `${totals.raids} raids resolved, ${totals.ticks} engagement ticks, ` +
      `${totals.attackerCasualties} attacker and ${totals.defenderCasualties} defender casualties.\n`,
  );
  console.log('| primitive | applications | attacker (fp) | defender (fp) |');
  console.log('|---|---|---|---|');
  for (const primitive of ALL_COMBAT) {
    const entry = totals.byPrimitive.get(primitive) ?? {
      attacker: 0,
      defender: 0,
      applications: 0,
    };
    console.log(
      `| ${primitive} | ${entry.applications} | ${fp(entry.attacker)} | ${fp(entry.defender)} |`,
    );
  }
  console.log('');
}
