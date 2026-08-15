/*
 * Multiverse Mages — macro model parameters, and where every number came from.
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
 * Every parameter in this model carries a `provenance` tag, and the CLI prints
 * it. The tags are the same distinction `tuningStatus` draws in `content/data`,
 * because the failure this model exists to avoid is the one `CLAUDE.md` names
 * twice: a placeholder becoming a balance constant nobody remembers inventing.
 *
 *   content   — read at run time out of `packages/content/data`. Not a choice.
 *   authored  — the owner said this number, in a design doc, in words.
 *   derived   — arithmetic over `content` or `authored` values, no new freedom.
 *   measured  — taken from an instrumented simulation run, with the ref named.
 *   invented  — MINE. A modelling choice with no external authority. Every one
 *               of these is listed in the design doc as a fork the author owns.
 *
 * An `invented` parameter is not a defect — a model with none would be a model
 * that decided nothing. It is a debt, and the tag is how the debt stays visible.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', '..', 'packages', 'content', 'data');

const readJson = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

/** Fixed-point unit used throughout `content/data`. 1024 reads as 1.0. */
export const FP = 1024;

/**
 * The dual-scale clock, pinned to content rather than to memory.
 *
 * `raid-constant.json`'s `inbound-raid-cooldown-world-ticks` is 60 and its gloss
 * reads "Five world years", which fixes one world tick at one month and the
 * 2400-tick reference horizon at 200 world years. Every rate below is per
 * *world year* and this is the only place the conversion lives.
 */
export const MONTHS_PER_YEAR = 12;
export const REFERENCE_HORIZON_YEARS = 200;

/** ------------------------------------------------------------------ content */

export function loadContent() {
  const species = readJson('species.json');
  const nodes = readJson('node.json');
  const cells = readJson('cell.json');
  const raid = new Map(readJson('raid-constant.json').map((r) => [r.id, r.value]));
  return { species, nodes, cells, raid };
}

/**
 * The twelve enabled cells — read off the `v1` flag in `cell.json`, never
 * reconstructed from a remembered list of techniques and forms.
 *
 * The rectangle is `intellego / perdo / rego` over `limen / mentem / nomen /
 * terram`, and it holds exactly 51 of the 300 nodes, which is the figure
 * `raid-constant.json`'s `rival-foreign-book-count` gloss states independently:
 * "twelve of seventy cells are enabled and they hold 51 of 300 nodes".
 *
 * `assertV1Shape` checks both numbers at load. If a ruleset change moves them
 * the model fails loudly rather than quietly describing a rectangle that no
 * longer exists — a `CLAUDE.md` house failure this file is not going to repeat.
 */
export const V1_CELL_COUNT_EXPECTED = 12;
export const V1_NODE_COUNT_EXPECTED = 51;

export function v1Cells(cells) {
  return cells.filter((c) => c.v1 === true);
}

export function assertV1Shape(cells, nodes) {
  const v1 = v1Cells(cells);
  const ids = new Set(v1.map((c) => c.id));
  const v1Nodes = nodes.filter((n) => ids.has(n.cell));
  if (v1.length !== V1_CELL_COUNT_EXPECTED || v1Nodes.length !== V1_NODE_COUNT_EXPECTED) {
    throw new Error(
      `v1 rectangle has moved: found ${v1.length} cells / ${v1Nodes.length} nodes, expected ` +
        `${V1_CELL_COUNT_EXPECTED} / ${V1_NODE_COUNT_EXPECTED}. Re-read cell.json before trusting ` +
        `anything this model says about breadth.`,
    );
  }
  return { cells: v1, nodes: v1Nodes };
}

/**
 * Anti-requisites. `excludes` on a cell names cells a *scholar* cannot hold
 * alongside it — "A scholar cannot hold both accounts; a civilization can,
 * which is what a civilization is for."
 *
 * The macro model reads that literally and it is the reason breadth is no
 * longer free: an exclusion pair does not remove nodes from the world, it
 * removes them from any one *mage*, which raises the number of distinct mages
 * a universe needs in order to hold a given portfolio. That is a need, and it
 * is the need anti-requisites was built to create.
 */
export function exclusionPairs(cells) {
  const pairs = [];
  for (const c of cells) {
    for (const x of c.excludes ?? []) {
      if (c.id < x.cell) pairs.push({ a: c.id, b: x.cell, resolution: x.resolution });
    }
  }
  return pairs;
}

/** ------------------------------------------------------------------ species */

/**
 * Magical prevalence — the fraction of a population that *could* do magic.
 *
 * `magical-prevalence.md` authors four of six in the owner's own words: "All
 * dragons learn magic. All elves learn magic. Few orcs learn magic. I would say
 * like one in ten humans can do magic, and maybe eight out of those ten
 * actually attend school."
 *
 * **Dwarf and gnome are deliberately blank in that document** and they are
 * blank here. `null` is not a bug: `speciesBlock` throws on a null prevalence,
 * so a sweep over dwarves fails loudly instead of reporting a number that came
 * from me. The reference universe is human, which is fully authored, so no
 * headline figure in this model rests on a guess.
 */
export const PREVALENCE = {
  human: { value: 0.1, provenance: 'authored' },
  elf: { value: 1.0, provenance: 'authored' },
  draconic: { value: 1.0, provenance: 'authored' },
  orc: { value: 0.02, provenance: 'invented', note: '"Few orcs" quantified. The only invented prevalence used anywhere.' },
  dwarf: { value: null, provenance: 'unauthored' },
  gnome: { value: null, provenance: 'unauthored' },
};

/**
 * Attendance at full access — the fraction of latent mages education reaches
 * when seats are unlimited. Authored for humans ("eight out of those ten"),
 * and applied to every species because the document gives no other number and
 * inventing five would be five invented numbers instead of one shared one.
 */
export const ATTEND_AT_FULL_ACCESS = { value: 0.8, provenance: 'authored' };

/**
 * Class capacity. `magical-prevalence.md` derives this rather than authoring a
 * new field: "capacity = 12 x retention / 1024", giving dwarf and draconic 18,
 * elf 15, human 12, orc 10, gnome 6. The `12` is the owner's ("A class of 12 is
 * the practical limit for humans") and `retention` is content, so the whole
 * expression is `derived` and no new number enters.
 */
export const CLASS_CAPACITY_BASE = { value: 12, provenance: 'authored' };

export function speciesBlock(species, id) {
  const s = species.find((x) => x.id === id);
  if (!s) throw new Error(`no such species: ${id}`);
  const prev = PREVALENCE[id];
  if (prev.value === null) {
    throw new Error(
      `prevalence for "${id}" is deliberately unauthored (magical-prevalence.md leaves dwarf and ` +
        `gnome blank). Pass --prevalence=<x> to state one explicitly; the model will not invent it.`,
    );
  }
  return {
    id,
    lifespanYears: s.lifespanMonths / MONTHS_PER_YEAR,
    maturityYears: s.maturityMonths / MONTHS_PER_YEAR,
    curiosity: s.curiosity / FP,
    learnRate: s.learnRate / FP,
    retention: s.retention / FP,
    fertility: s.fertility / FP,
    scribeAffinity: s.scribeAffinity / FP,
    rediscoveryAffinity: s.rediscoveryAffinity / FP,
    mageAptitude: s.mageAptitude / FP,
    laborAffinity: s.laborAffinity / FP,
    depthCeiling: s.depthCeiling,
    prevalence: prev.value,
    prevalenceProvenance: prev.provenance,
    classCapacity: CLASS_CAPACITY_BASE.value * (s.retention / FP),
  };
}

/** ------------------------------------------------------- the five toggles */

/**
 * The subsystems that are wired to a constant on `main` today.
 *
 * The brief for this model was explicit that calibrating naively against
 * today's simulation would encode these as the design. So each is a parameter
 * with a `broken` value (what the code does now) and an `intended` value (what
 * the design says), and `toggles` mode reports how much the emitted needs move
 * between them. That comparison is the point: it says which unwired thing most
 * changes the shape of a university system, and therefore what to fix first.
 */
export const TOGGLES = {
  scribingQueue: {
    gloss: 'world-step.ts passes scribingQueueDepth: 0 and demand.ts multiplies by it.',
    broken: 0,
    intended: 64,
    provenance: { broken: 'measured', intended: 'measured' },
    note: 'Intended is the midpoint of the 40-88 the pending fix measures.',
  },
  scribeCohortRefills: {
    gloss: 'Reallocation can call scribe surplus and never wanted, so the cohort only drains.',
    broken: false,
    intended: true,
    provenance: { broken: 'measured', intended: 'derived' },
  },
  affiliationCompletes: {
    gloss: 'completeAffiliation has no production caller: universities stand and are never staffed.',
    broken: false,
    intended: true,
    provenance: { broken: 'measured', intended: 'derived' },
  },
  teachRateBites: {
    gloss:
      'teach-rate is inert FOR TIERS 1-3 ONLY, and the usual gloss overstates it. The completion ' +
      'gate is a bare `progress < required` with no partial-month carry: a solo teacher pushes ' +
      '1024/tick, which already clears tier 1 (512) and exactly clears tier 2 (1024); a pair ' +
      'pushes 2048 and clears tier 3. At tiers 4 (4096), 5 (8192) and 6 (16384) the multiplier ' +
      'still shortens the lesson. So teach-rate is not dead — it is a DEEP-TEACHING knob wearing ' +
      'a general one’s clothes, and every measurement of it was taken on a universe that had not ' +
      'got past tier 3.',
    broken: false,
    intended: true,
    provenance: { broken: 'measured', intended: 'derived' },
  },
  standingArmy: {
    gloss: 'There is no standing army, deliberately (ages-of-magic.md 2b).',
    broken: 0,
    intended: 0,
    provenance: { broken: 'authored', intended: 'authored' },
    note: 'Both values are zero on purpose. Present as a parameter so a sweep can ask what one would cost, never as a defect.',
  },
};

/** ------------------------------------------------------------ the defaults */

/**
 * Rates that are neither content nor authored. Each is flagged, and the design
 * doc lists every `invented` line here as a decision the author may overturn.
 */
export function defaultParams(overrides = {}) {
  const p = {
    seed: 20260814,
    horizonYears: REFERENCE_HORIZON_YEARS,
    speciesId: 'human',

    /* --- population ------------------------------------------------------ */
    population0: {
      value: 12000,
      provenance: 'authored',
      note: 'The worked example in magical-prevalence.md is "12,000 people, 1,200 latent, 340 found". NOTE the simulation starts far below this: reference-universe.ts seeds 6 species x 3 occupations x cohortSize, i.e. 72 populace (216 in the long run), against a territory carrying capacity of 54,900. The model runs the design intent, not the founding stub.',
    },
    carryingCapacity: {
      value: 54900,
      provenance: 'content',
      note: 'territory.json: 6000 landUnits, baseCapacity 56,217,600 fp = 54,900 people across all five regions.',
    },
    popGrowthAtUnitFertility: { value: 0.006, provenance: 'invented', note: '0.6%/yr at fertility 1024. Pre-industrial order of magnitude.' },

    /* --- education ------------------------------------------------------- */
    universities0: { value: 1, provenance: 'content', note: 'reference-universe.ts seeds exactly one university, complete at tick 0.' },
    seatsPerUniversity: {
      value: 64,
      provenance: 'content',
      note: 'reference-universe.ts university capacity. God action 11 founds one at capacity 32, so a founded university is half a seeded one.',
    },
    yearsInSchoolPerTier: { value: 4, provenance: 'invented', note: 'Time a student holds a seat per tier of depth gained. Graduation is "until the university has nothing left to teach"; this is that, per tier.' },
    adminGolemCapacityGain: { value: 0, provenance: 'authored', note: 'Administrative golems are a discoverable technology, not a species trait, and are not authored yet. Zero until they are; swept to show what they would buy.' },

    /* --- teaching -------------------------------------------------------- */
    teachProgressPerProfessorMonth: { value: 2048, provenance: 'measured', note: 'The teaching pair pushing 2048/tick that makes teach-rate inert.' },
    professorFractionOfMages: { value: 0.15, provenance: 'invented', note: 'Share of activated mages standing in front of a class.' },

    /* --- research -------------------------------------------------------- */
    researchProgressPerResearcherMonth: { value: 512, provenance: 'invented', note: 'Set so a lone tier-1 researcher takes ~4 months, against teaching’s days.' },
    researcherFractionOfMages: { value: 0.35, provenance: 'invented' },

    /* --- scribing --------------------------------------------------------
     * Scribing has TWO costs and conflating them is the easiest way to get the
     * vellum answer wrong by an order of magnitude:
     *   desk time — scribeCapacityCost(tier) = 1024 * tier, LINEAR
     *   vellum    — node.scribeCost         = 512 * 2^tier, GEOMETRIC
     * The model charges both.                                              */
    scribes0: { value: 23, provenance: 'measured', note: 'The scribe cohort’s starting size before it drains 23 -> 14 while idle goes 21 -> 182.' },
    scribeMonthsPerScribeTick: { value: 16, provenance: 'content', note: 'SCRIBE_MONTHS_PER_SCRIBE, rules-world/universities/scribing.ts. Multiplied by scribeAffinity.' },
    scribesPerQueuedGrimoire: { value: 2, provenance: 'content', note: 'SCRIBES_PER_QUEUED_GRIMOIRE, populace/demand.ts. This is the term scribingQueueDepth: 0 zeroes.' },
    materialsPerLaborerTick: { value: 16, provenance: 'content', note: 'MATERIALS_PER_LABORER, economy/materials.ts, split by territory share.' },
    vellumShare: { value: 301 / 1024, provenance: 'content', note: 'Territory yield share for vellum on the shipped land: food 482 / stone 241 / vellum 301 of 1024.' },
    subsistencePerPersonTick: { value: 1, provenance: 'content', note: 'SUBSISTENCE_PER_PERSON. One laborer at 16*482/1024 = 7.53 fp food feeds 7.5 people, so ~13% of any population must farm before anything else happens.' },
    libraryUpkeepPerInstanceTick: { value: 2, provenance: 'content', note: 'LIBRARY_UPKEEP_PER_INSTANCE, universities/library.ts. Vellum, per INSTANCE not per distinct node — the dynamic friction the knowledge loop needs, and it scales with exactly the thing the god is trying to grow.' },
    laborerFractionOfPopulace: { value: 0.35, provenance: 'invented', note: 'Set above the ~13% subsistence floor the content rates imply.' },

    /* --- what one mage can hold (vision 4b) --------------------------------
     * THE missing term, and the reason every species in this model holds the
     * whole grid with nothing ever fragile. Vision 4b says an individual mage
     * cannot learn all the magic — schools exclude each other, depth requires a
     * long life, and the deepest magic is cast collectively. None of that is
     * expressed in a rate; it is expressed as a CAP on one mage's held set.
     *
     * 0 means "uncapped", which is the game as it stands: one authored
     * exclusion pair, both halves outside the v1 rectangle, so nothing stops a
     * mage holding every node her depth permits.                            */
    breadthCapNodes: {
      value: 0,
      provenance: 'measured',
      note: 'Zero = uncapped, which is what main does: the only authored exclusion pair (creo-ignem / creo-umbra) sits outside the twelve enabled cells, so no v1 mage ever has to choose. Sweep it with `breadth`.',
    },

    /* --- decay and loss --------------------------------------------------- */
    bookDecayPerYear: { value: 0.01, provenance: 'invented', note: 'A book unattended is gone in a century. The telephone problem’s slow half.' },
    extinctionRiskTarget: { value: 0.05, provenance: 'invented', note: 'The retention objective: no held node may exceed this probability of loss over the retention horizon.' },
    retentionHorizonYears: { value: 50, provenance: 'invented' },

    /* --- raids ------------------------------------------------------------ */
    raidProbPerYear: { value: 0.045, provenance: 'derived', note: 'inbound-raid-chance-per-world-tick is fp 4/1024 per month; 1-(1-4/1024)^12 = 4.6%/yr. Matches the ~9 inbound raids over 2400 ticks its own gloss predicts.' },
    raidCooldownYears: { value: 5, provenance: 'content', note: 'inbound-raid-cooldown-world-ticks = 60.' },
    combatantsPerRaid: { value: 6, provenance: 'content', note: 'rival-raider-count. Under the 32 cap by design.' },
    raidMageMonthsPerRaid: {
      value: 0,
      provenance: 'content',
      note: 'ZERO, and this is a finding rather than an omission. A raid runs 2400-3600 ENGAGEMENT ticks and consumes exactly zero WORLD ticks (consequences.ts), and vision 8 defines tempo cost against uninvolved universes while contracts 1.1 puts one universe in an instance. W8 measured inboundRaidTempoLoss at 0.0 for that reason. A raid costs lives and books, never time.',
    },
    raidMageCasualtyFraction: {
      value: 0.15,
      provenance: 'invented',
      note: 'There is NO casualty-rate constant in rules-raid: deaths are HP attrition plus the stranded-raider wipe. This stands in for the whole engagement and is the single most consequential invented number in the model.',
    },
    booksLootedPerRaid: { value: 4, provenance: 'content', note: 'looted-grimoires-per-raid. The host copy is destroyed, so a loot is a loss.' },
    bookBurnSurvival: { value: 0.9, provenance: 'content', note: 'grimoire-burn-resist-cap 922/1024: a dwarven book resists fire, it is not fireproof.' },
    raidReachesLibrary: { value: 0.5, provenance: 'content', note: 'victory-threshold-fraction is half the field value; taken as the share of raids that reach the shelves.' },

    /* --- the economy, as a rate ------------------------------------------- */
    economicRate: { value: 1.0, provenance: 'invented', note: 'The sweep axis. Multiplies material inflow and carrying capacity together, because a richer world both feeds more people and writes more books.' },
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (k in p && typeof p[k] === 'object' && p[k] !== null && 'value' in p[k]) {
      p[k] = { ...p[k], value: v, provenance: 'override' };
    } else {
      p[k] = v;
    }
  }
  return p;
}

/** Unwrap the {value, provenance} blocks into plain numbers for the hot loop. */
export function plain(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = v !== null && typeof v === 'object' && 'value' in v ? v.value : v;
  }
  return out;
}

export function provenanceTable(params) {
  const rows = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && typeof v === 'object' && 'value' in v) {
      rows.push({ name: k, value: v.value, provenance: v.provenance, note: v.note ?? '' });
    }
  }
  return rows;
}
