/*
 * Multiverse Mages — a university's whole input surface, mocked, and swept.
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
 * # The university laboratory
 *
 * `university-harness.ts` runs **one** university against a hand-written
 * economy and answers *"what did this institution become"*. This file is the
 * layer above it: it mocks **everything a university reads from the world**,
 * declares the axes in `university-axes.ts`, and sweeps them.
 *
 * ## The input surface, enumerated from `world-step.ts` and not from memory
 *
 * Every entry below was found by reading the call sites, and each says whether
 * this file can mock it.
 *
 * | # | What a university reads | Where the world supplies it | Mocked here |
 * |---|---|---|---|
 * | 1 | **Stone**, spent by construction | `world-step.ts` phase 8a, `MATERIAL_STOCK.stone` | yes — {@link MockStocks.stone} |
 * | 2 | **Vellum**, spent by library upkeep *and* scribing | `MATERIAL_STOCK.vellum` | yes — {@link MockStocks.vellum} |
 * | 3 | **Food** | `MATERIAL_STOCK.food` | yes, and it is **never read** by any university function — see below |
 * | 4 | **Labour crew**, per species, in person-months | `advanceUniversities`'s `crew` | yes — {@link LabWorld.crew}, one entry per species, surplus returned between sites exactly as the loop does |
 * | 5 | **Populace cohorts** — species × occupation × decade | `CohortStore` from phase 2 | yes — {@link LabWorld.cohorts} |
 * | 6 | **Mage roster** — species, `MAGE_ROLE`, affiliation | `MAGE` component | yes — {@link LabWorld.residents} |
 * | 7 | **The clock** | `worldTick` | yes — {@link Stage.openingTick} |
 * | 8 | **The ruleset**, as `libraryDepth`'s `counts` predicate | `permits(ruleset, cellOf(node))` | yes — {@link RulesetGate} |
 * | 9 | **Primitives** `build-rate`, `scribe-rate`, `research-rate` | `deps.primitives` | yes — the shipped records, via `universities-fixtures.ts` |
 * | 10 | **The node catalog** — `tierOf`, `cellOf`, `scribeCost` | `deps.catalog` | yes — the shipped 300 nodes |
 * | 11 | **Species traits** — `laborAffinity`, `scribeAffinity`, `depthCeiling` | `deps.speciesOf` | yes — the shipped six |
 * | 12 | **The demand port** — `constructionBacklog`, `scribingQueueDepth`, `universityCapacity`, `standingSoldierTarget` | `computeOccupationDemand` | yes, and it is the closed loop — see {@link LabAdds.demand} |
 * | 13 | **Staff assignment** — `UNIVERSITY_STAFF` links | *nothing on `main`* | yes, through `staff.ts` directly |
 * | 14 | **Hosted students** | *no component anywhere* | carried in a local, and that is the finding — see below |
 * | 15 | **God constants** | `coordination/src/god/constants.ts` | **not mocked, and it is not a gap** — see below |
 *
 * ### Three entries that are findings rather than inputs
 *
 * - **Food is read by nothing.** `capacity.ts`, `capital.ts`, `construction.ts`,
 *   `library.ts`, `profile.ts` and `scribing.ts` between them mention two of the
 *   three stocks. A university is indifferent to whether its universe is fed.
 *   The field is carried here so that a future subsistence coupling has a place
 *   to arrive, and so the zero is deliberate rather than forgotten.
 * - **Hosted students have no state.** Found by PR #125 and re-checked here: no
 *   field on `UNIVERSITY`, no `universityId` on a populace cohort, no link
 *   component. {@link LabContains.hosted} is a local variable. Delete this file
 *   and the number stops existing.
 * - **No university function reads a god constant.** `fund-progress`,
 *   `found-university-cost`, `found-university-capacity` and
 *   `worship-university-per-unit` all live in `coordination/src/god/constants.ts`
 *   and are applied to the university *from outside*. So the god has exactly
 *   three levers on an institution — what it costs to found, how big it is
 *   founded, and how much progress a `fundUniversity` buys — and no lever at all
 *   on what it does once it stands. That is a design statement, not a mocking
 *   gap, and the harness models the third lever as {@link LabAction} `fund`.
 *
 * ## Determinism
 *
 * **No RNG, and no new stream.** `contracts.md` §6 makes an added draw a
 * re-baseline event; nothing here draws. Every quantity is fixed-point at
 * 1/1024, every ordering is by ascending handle or by declared axis order, and
 * every derived selection (which nodes are seeded, which species gets the odd
 * mage) is a deterministic index. Two runs of the same {@link LabScenario} are
 * byte-identical, which is what makes the goldens meaningful.
 *
 * ## The boundary this file stops at
 *
 * `contracts.md` §5 forbids `rules-world` from importing `rules-magic`, and
 * **turning scribe-months into books lives on the other side of it**
 * (`rules-magic/src/instances/scribing.ts`, whose `scribeCapacityCost(tier)` is
 * the time gate). So the lab reports the scribe-months a university produces —
 * which is the shipped `scribingThroughput`'s own answer — and the vellum a
 * book would cost from `node.scribeCost`, which is content and therefore legal
 * to read. It does not report books minted, because it cannot compute them
 * without becoming a second implementation of a rule it may not see.
 */

import type { EntityHandle, Fixed, SimState } from '@mm/sim-core';
import { FP_ONE } from '@mm/sim-core';
import type { ContentId, NodeRecord, SpeciesRecord } from '@mm/content';
import type { MageRoleValue, OccupationValue } from '@mm/state';
import {
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  OCCUPATION,
  POPULACE_COHORT,
  UNIVERSITY,
  attachRecord,
  collectRecords,
  componentOf,
  readRecord,
} from '@mm/state';
import { ClampCounters } from '@mm/primitives';

import { CohortStore } from '../../src/populace/cohort-store.js';
import { computeOccupationDemand } from '../../src/populace/demand.js';
import type { OccupationDemand } from '../../src/populace/demand.js';
import {
  AdmissionRefusals,
  admitStudents,
  advanceConstruction,
  contributionFor,
  createUniversity,
  dominantCell,
  effectiveCapacity,
  isComplete,
  libraryDepth,
  applyLibraryUpkeep,
  scribingThroughput,
  universityProfile,
} from '../../src/universities/index.js';
import type { LibraryDepth } from '../../src/universities/index.js';
import { staffCohortsOf, staffUniversity, unstaffUniversity } from '../../src/universities/staff.js';

import {
  buildRatePrimitive,
  makeLibrary,
  scribeRatePrimitive,
  shippedRegistry,
  speciesNamed,
  worldState,
} from './universities-fixtures.js';
import {
  ALL_AXES,
  AXIS_NAMES,
  allocateRoles,
  SUPPLIED_OCCUPATIONS,
} from './university-axes.js';
import type { AxisName, RulesetGate, ScribeQueuePolicy, Stage } from './university-axes.js';

// ---------------------------------------------------------------------------
// The shipped content the lab reads, resolved once
// ---------------------------------------------------------------------------

interface CatalogEntry {
  readonly contentId: ContentId;
  readonly record: NodeRecord;
  readonly cellId: ContentId;
}

/**
 * The 300 shipped nodes, ascending by content id, with their cell interned.
 *
 * Ascending rather than in file order so that "the first N nodes" is a
 * statement about the content set and not about how `node.json` happens to be
 * sorted today.
 */
const CATALOG: readonly CatalogEntry[] = (() => {
  const registry = shippedRegistry();
  const cellIdOf = new Map<string, ContentId>(
    registry.cells.map((entry) => [entry.record.id, entry.contentId]),
  );
  return [...registry.nodes]
    .sort((a, b) => a.contentId - b.contentId)
    .map((entry) => ({
      contentId: entry.contentId,
      record: entry.record,
      cellId: cellIdOf.get(entry.record.cell) ?? 0,
    }));
})();

const NODE_BY_ID = new Map<ContentId, CatalogEntry>(CATALOG.map((entry) => [entry.contentId, entry]));

/** Interned species ids, for the `MAGE` and cohort rows that store numbers. */
const SPECIES_CONTENT_ID = new Map<string, ContentId>(
  shippedRegistry().species.map((entry) => [entry.record.id, entry.contentId]),
);

function tierOf(nodeId: ContentId): number {
  return NODE_BY_ID.get(nodeId)?.record.tier ?? 1;
}

function cellOf(nodeId: ContentId): ContentId {
  return NODE_BY_ID.get(nodeId)?.cellId ?? 0;
}

function scribeCostOf(nodeId: ContentId): Fixed {
  return NODE_BY_ID.get(nodeId)?.record.scribeCost ?? 0;
}

/**
 * The `counts` predicate a ruleset gate becomes.
 *
 * `forbid-half` forbids every odd cell id rather than a named list, because a
 * named list would be a content decision this file has no standing to make and
 * would rot the day a cell is added. Odd-versus-even is arbitrary, declared,
 * and stable.
 */
function countsFor(gate: RulesetGate): (nodeId: ContentId) => boolean {
  switch (gate) {
    case 'permit-all':
      return () => true;
    case 'forbid-all':
      return () => false;
    case 'forbid-half':
      return (nodeId) => cellOf(nodeId) % 2 === 0;
  }
}

// ---------------------------------------------------------------------------
// The mocked world
// ---------------------------------------------------------------------------

/** `contracts.md` §1.1's three stocks, in `fp`. */
export interface MockStocks {
  /** Subsistence. **No university function reads it.** */
  readonly food: Fixed;
  /** What construction spends, and only construction. */
  readonly stone: Fixed;
  /** What library upkeep and scribing both spend. */
  readonly vellum: Fixed;
}

/** Person-months of one species' labour offered to the site each tick. */
export interface CrewAssignment {
  readonly speciesId: string;
  readonly months: number;
}

/** One populace cohort the mock world holds. */
export interface MockCohort {
  readonly speciesId: string;
  readonly occupation: OccupationValue;
  readonly count: number;
  readonly birthTickBucket: number;
}

/** One mage affiliated with the institution. */
export interface MockResident {
  readonly speciesId: string;
  readonly role: MageRoleValue;
  /** Nodes she knows. Counted toward the profile, never toward the library. */
  readonly knows: readonly ContentId[];
}

/** The whole settable input surface, assembled from the axes. */
export interface LabWorld {
  readonly openingTick: number;
  readonly stocks: MockStocks;
  readonly income: MockStocks;
  readonly crew: readonly CrewAssignment[];
  readonly cohorts: readonly MockCohort[];
  readonly residents: readonly MockResident[];
  /** Distinct nodes already on the shelves when the run opens. */
  readonly seededNodes: readonly ContentId[];
  readonly ruleset: RulesetGate;
  readonly scribeQueue: ScribeQueuePolicy;
  readonly standingSoldierTarget: number;
  /** Would-be students arriving each tick. */
  readonly applicantsPerTick: number;
  readonly startsComplete: boolean;
}

/** Something the world does to the institution on a given tick. */
export type LabAction =
  /** The god's `fundUniversity`: the one lever it has on a standing site. */
  | { readonly tick: number; readonly kind: 'fund'; readonly progress: Fixed }
  /** A node is written onto the shelves. */
  | { readonly tick: number; readonly kind: 'shelve'; readonly nodeId: ContentId }
  /** Every scribe cohort of one species leaves the staff. */
  | { readonly tick: number; readonly kind: 'unstaff'; readonly speciesId: string }
  /** Students leave, freeing their seats in the same tick. */
  | { readonly tick: number; readonly kind: 'graduate'; readonly count: number };

/** Where a run sits on each axis. Ids, not values, so a scenario is data. */
export type AxisCoords = Partial<Record<AxisName, string>>;

/** One run of the lab. Serialisable, and therefore recordable as a golden. */
export interface LabScenario {
  /** Stable identity. Appears in the golden and in the CLI's output. */
  readonly id: string;
  readonly ticks: number;
  /** Designed capacity — what the site is being built to. */
  readonly capacity: number;
  readonly axes: AxisCoords;
  readonly actions?: readonly LabAction[];
  /** Overrides applied after the axes are resolved. For manual mode. */
  readonly overrides?: Partial<LabWorld>;
}

// ---------------------------------------------------------------------------
// Output: what it contains, and what it adds
// ---------------------------------------------------------------------------

/**
 * **What the institution contains.** Inventory: things you could count by
 * walking in the door.
 */
export interface LabContains {
  readonly buildProgress: Fixed;
  readonly complete: boolean;
  readonly completedOnTick: number | undefined;
  readonly designedCapacity: number;
  readonly effectiveCapacity: number;
  /** Students in residence. **Carried by the harness; the world stores it nowhere.** */
  readonly hosted: number;
  readonly staffCohorts: number;
  readonly staffHeadcount: number;
  /** Scribes on this university's own staff, by species id. */
  readonly scribesBySpecies: Readonly<Record<string, number>>;
  readonly residentMages: number;
  readonly residentsByRole: Readonly<Record<string, number>>;
  readonly residentsBySpecies: Readonly<Record<string, number>>;
  readonly distinctNodes: number;
  readonly instanceCount: number;
  readonly grimoireCount: number;
  readonly depthByTier: readonly number[];
  readonly dominantCell: ContentId;
  readonly profileCells: number;
}

/**
 * **What the institution adds to the world.** Flux: things that leave the
 * building.
 */
export interface LabAdds {
  /** Scribe-months produced over the run, `fp`. The shipped function's answer. */
  readonly scribeMonthsTotal: Fixed;
  readonly scribeMonthsFinal: Fixed;
  /** Stone consumed by construction over the run, `fp`. */
  readonly stoneConsumed: Fixed;
  /** Vellum consumed by library upkeep over the run, `fp`. */
  readonly vellumUpkeepPaid: Fixed;
  /** Vellum owed and not paid, `fp`. The economy's unmet demand for parchment. */
  readonly vellumShortfall: Fixed;
  /** Instances the library gave up because it could not be maintained. */
  readonly instancesDegraded: number;
  /** Seats asked for and refused. The universe's unmet demand for study. */
  readonly seatsRefused: number;
  readonly studentsAdmitted: number;
  /**
   * The occupation headcount this institution asks the populace for, on the
   * final tick.
   *
   * **The closed loop, and the reason this column exists.** A university writes
   * two of `computeOccupationDemand`'s four inputs — `constructionBacklog` and
   * `universityCapacity` — and the third, `scribingQueueDepth`, is a literal
   * `0` at `world-step.ts:748`. So a university creates demand for the people
   * who build it and the people who study in it, and never for the people who
   * copy its books. Sweep `scribeQueue` and the difference is that defect,
   * measured rather than argued.
   */
  readonly demand: OccupationDemand;
  /**
   * The library's `fp` rate bonus **as each resident species actually receives
   * it**.
   *
   * One shelf, and as many answers as there are `depthCeiling`s among the
   * residents. This is where "adds to the world" stops being about the building:
   * the contribution is what `libraryRateMultiplier` drops into the capped
   * accumulator for research, teaching and scribing alike, and a species whose
   * ceiling is 4 cannot reach a tier-5 shelf however deep it is.
   */
  readonly contributionBySpecies: Readonly<Record<string, Fixed>>;
  /** Vellum a full copy of everything shelved would cost, `fp`, from `node.scribeCost`. */
  readonly shelfReplacementCost: Fixed;
}

/** One tick of the institution's history. */
export interface LabTick {
  readonly tick: number;
  readonly buildProgress: Fixed;
  readonly hosted: number;
  readonly admitted: number;
  readonly refused: number;
  readonly scribeMonths: Fixed;
  readonly distinctNodes: number;
  readonly instanceCount: number;
  readonly stone: Fixed;
  readonly vellum: Fixed;
  readonly upkeepShortfall: Fixed;
  readonly degraded: number;
  readonly scribeDemand: number;
  readonly studentDemand: number;
  readonly laborerDemand: number;
}

/** A finished run. */
export interface LabReport {
  readonly id: string;
  readonly axes: AxisCoords;
  readonly ticks: number;
  readonly contains: LabContains;
  readonly adds: LabAdds;
  readonly log: readonly LabTick[];
}

// ---------------------------------------------------------------------------
// Building the world from axis coordinates
// ---------------------------------------------------------------------------

function axisValue<T>(name: AxisName, id: string | undefined, fallbackIndex = 0): T {
  const axis = ALL_AXES[name];
  const point =
    id === undefined
      ? axis.points[fallbackIndex]
      : axis.points.find((candidate) => candidate.id === id);
  if (point === undefined) {
    throw new Error(
      `axis "${name}" has no point "${String(id)}"; known: ${axis.points.map((p) => p.id).join(', ')}`,
    );
  }
  return point.value as T;
}

/**
 * Turns axis coordinates into the whole mocked world.
 *
 * Exported because manual mode wants to print it: *"these are the inputs I gave
 * this university"* is half of an answer to *"why did it do that"*, and a
 * harness that will not show its own inputs is a harness you have to trust.
 */
export function worldFor(scenario: LabScenario): LabWorld {
  const mix = axisValue<readonly string[]>('speciesMix', scenario.axes.speciesMix);
  const stage = axisValue<Stage>('stage', scenario.axes.stage);
  const staffSize = axisValue<number>('staffSize', scenario.axes.staffSize);
  const roleMix = axisValue<Readonly<Record<MageRoleValue, number>>>(
    'roleMix',
    scenario.axes.roleMix,
  );
  const ruleset = axisValue<RulesetGate>('ruleset', scenario.axes.ruleset);
  const scribeQueue = axisValue<ScribeQueuePolicy>('scribeQueue', scenario.axes.scribeQueue);
  // `seededDepth` overrides the stage's shelf when it is named, and defers to it
  // when it is not — which is what lets one axis move the shelf alone while the
  // stage axis moves four things together.
  const seededCount =
    scenario.axes.seededDepth === undefined
      ? stage.seededNodes
      : axisValue<number>('seededDepth', scenario.axes.seededDepth);

  const cohorts: MockCohort[] = [];
  for (const speciesId of mix) {
    for (const occupation of SUPPLIED_OCCUPATIONS) {
      cohorts.push({
        speciesId,
        occupation,
        count: stage.cohortSize,
        // Decade of birth, per §1.3. One bucket per species so that two species
        // never merge into one cohort and the per-species columns stay readable.
        birthTickBucket: stage.openingTick,
      });
    }
  }

  const roles = allocateRoles(staffSize, roleMix);
  const residents: MockResident[] = [];
  let resident = 0;
  for (const [role, count] of roles) {
    for (let index = 0; index < count; index += 1, resident += 1) {
      residents.push({
        // Round-robin over the mix, so a 4-species mix staffs four species and
        // a 1-species mix staffs one, at every staff size.
        speciesId: mix[resident % mix.length] as string,
        role,
        // One node each, taken from the far end of the catalog so a resident's
        // knowledge never coincides with the seeded shelf — otherwise the
        // profile would double-count and `distinctNodes` would not move.
        knows: [(CATALOG[CATALOG.length - 1 - (resident % CATALOG.length)] as CatalogEntry).contentId],
      });
    }
  }

  const world: LabWorld = {
    openingTick: stage.openingTick,
    stocks: { food: stage.vellum, stone: stage.stone, vellum: stage.vellum },
    income: { food: 0, stone: 0, vellum: stage.vellumIncome },
    crew: mix.map((speciesId) => ({ speciesId, months: stage.cohortSize })),
    cohorts,
    residents,
    seededNodes: CATALOG.slice(0, seededCount).map((entry) => entry.contentId),
    ruleset,
    scribeQueue,
    standingSoldierTarget: 0,
    applicantsPerTick: 4,
    startsComplete: stage.startsComplete,
  };
  return scenario.overrides === undefined ? world : { ...world, ...scenario.overrides };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Runs one university against a fully mocked world and reports both halves.
 *
 * Tick order mirrors `world-step.ts` where the two overlap: the world acts
 * (phase 0), staffing settles (phase 2a), scribing runs off the settled staff
 * (phase 5), construction spends stone (phase 8a), and library upkeep is
 * charged against vellum last (phase 8b). Construction after scribing because a
 * university that completes this tick was not open for business during it,
 * which is the same edge `effectiveCapacity` draws.
 */
export function runLab(scenario: LabScenario): LabReport {
  const world = worldFor(scenario);
  const state = worldState();
  const library = makeLibrary(state, world.openingTick);
  const university = createUniversity(state, { capacity: scenario.capacity, libraryId: library });
  const counters = new ClampCounters();
  const counts = countsFor(world.ruleset);
  const buildRate = buildRatePrimitive();
  const scribeRate = scribeRatePrimitive();

  if (world.startsComplete) {
    componentOf(state, UNIVERSITY).set(university, 'buildProgress', FP_ONE);
  }

  for (const nodeId of world.seededNodes) shelve(state, library, nodeId, world.openingTick);

  // ---- populace, and the staffing phase this build does not run -----------
  const cohorts = new CohortStore(state.entities, componentOf(state, POPULACE_COHORT));
  const cohortSpecies = new Map<EntityHandle, string>();
  for (const entry of world.cohorts) {
    const handle = cohorts.add(
      {
        speciesId: SPECIES_CONTENT_ID.get(entry.speciesId) ?? 0,
        occupation: entry.occupation,
        birthTickBucket: entry.birthTickBucket,
      },
      entry.count,
    );
    cohortSpecies.set(handle, entry.speciesId);
    // Every scribe cohort of a resident species joins this university's staff.
    // `assignStaff` — `world-step.ts` phase 2a on PR #125's branch — is what
    // would do this in a build that had it; on `main` nothing does, so the
    // harness calls `staff.ts` directly and says so.
    if (entry.occupation === OCCUPATION.scribe) staffUniversity(state, university, handle);
  }

  // ---- the mage roster ----------------------------------------------------
  const residentHandles: EntityHandle[] = [];
  for (const resident of world.residents) {
    const handle = state.entities.create();
    attachRecord(state, MAGE, handle, {
      speciesId: SPECIES_CONTENT_ID.get(resident.speciesId) ?? 0,
      birthTick: world.openingTick,
      roleId: resident.role,
      universityId: university,
      curiosity: speciesNamed(resident.speciesId).curiosity,
      ambition: FP_ONE,
      caution: FP_ONE,
      vigor: FP_ONE,
      maxVigor: FP_ONE,
      alive: 1,
    });
    residentHandles.push(handle);
    for (const nodeId of resident.knows) {
      attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
        nodeId,
        locationKind: LOCATION_KIND.mind,
        locationId: handle,
        acquiredTick: world.openingTick,
        mastery: FP_ONE,
      });
    }
  }

  const byTick = new Map<number, LabAction[]>();
  for (const action of scenario.actions ?? []) {
    const existing = byTick.get(action.tick);
    if (existing === undefined) byTick.set(action.tick, [action]);
    else existing.push(action);
  }

  const refusals = new AdmissionRefusals();
  let stone = world.stocks.stone;
  let vellum = world.stocks.vellum;
  let hosted = 0;
  let admittedTotal = 0;
  let completedOnTick: number | undefined = world.startsComplete ? 0 : undefined;
  let scribeMonths = 0;
  let scribeMonthsTotal = 0;
  let stoneConsumed = 0;
  let vellumUpkeepPaid = 0;
  let vellumShortfall = 0;
  let instancesDegraded = 0;
  let depth: LibraryDepth = libraryDepth(state, library, tierOf, { counts });
  const log: LabTick[] = [];
  let demand: OccupationDemand = computeOccupationDemand({
    constructionBacklog: 0,
    scribingQueueDepth: 0,
    universityCapacity: 0,
    standingSoldierTarget: world.standingSoldierTarget,
  });

  for (let tick = 1; tick <= scenario.ticks; tick += 1) {
    const worldTick = world.openingTick + tick;
    stone += world.income.stone;
    vellum += world.income.vellum;
    const row = readRecord(state, UNIVERSITY, university);

    // ---- 0. the world acts on the institution ---------------------------
    let admitted = 0;
    let refused = 0;
    for (const action of byTick.get(tick) ?? []) {
      switch (action.kind) {
        case 'fund': {
          const store = componentOf(state, UNIVERSITY);
          store.set(university, 'buildProgress', Math.min(row.buildProgress + action.progress, FP_ONE));
          row.buildProgress = store.get(university, 'buildProgress');
          break;
        }
        case 'shelve':
          shelve(state, library, action.nodeId, worldTick);
          break;
        case 'graduate':
          hosted = Math.max(0, hosted - action.count);
          break;
        case 'unstaff':
          for (const [handle, speciesId] of cohortSpecies) {
            if (speciesId === action.speciesId) unstaffUniversity(state, university, handle);
          }
          break;
      }
    }

    // Applicants arrive after the god has acted, so a site funded to completion
    // this tick can admit on it — the same edge `effectiveCapacity` draws.
    if (world.applicantsPerTick > 0) {
      const outcome = admitStudents(row, hosted, world.applicantsPerTick);
      hosted = outcome.hosted;
      admitted = outcome.admitted;
      refused = outcome.refused;
      refusals.record(university, outcome.refused);
      admittedTotal += outcome.admitted;
    }

    // ---- 5. scribing, per staffed species, off the settled staff ---------
    depth = libraryDepth(state, library, tierOf, { counts });
    scribeMonths = 0;
    for (const [cohort, speciesId] of staffedScribeCohorts(state, university, cohorts, cohortSpecies)) {
      const species = speciesNamed(speciesId);
      scribeMonths += scribingThroughput(row, {
        scribeCount: cohorts.countOf(cohort),
        scribeAffinity: species.scribeAffinity,
        // The library's capital contribution enters the *same* capped
        // accumulator as node bonuses — `scribing.ts` says so, and gating it by
        // this species' own ceiling is `capital.ts` brake 2. The harness that
        // passed `[]` here was measuring a scriptorium with no library.
        scribeRateBonuses: [contributionFor(depth, species.depthCeiling)],
        scribeRate,
        counters,
      });
    }
    scribeMonthsTotal += scribeMonths;

    // ---- 8a. construction, spending stone, crew surplus returned ---------
    // One assignment per species, spent down in mix order, the surplus from one
    // handed to the next. `advanceUniversities` does exactly this across sites;
    // there is one site here, so the loop is across crews.
    const assignments = world.crew.map((entry) => ({
      affinity: speciesNamed(entry.speciesId).laborAffinity,
      months: entry.months,
    }));
    for (const assignment of assignments) {
      if (assignment.months <= 0 || isComplete(row)) continue;
      const outcome = advanceConstruction(row, {
        laborMonths: assignment.months,
        laborAffinity: assignment.affinity,
        materials: stone,
        buildRate,
        buildRateBonuses: [],
        counters,
      });
      stone -= outcome.materialsSpent;
      stoneConsumed += outcome.materialsSpent;
      assignment.months = outcome.labourStalled + outcome.labourSurplus;
      if (outcome.completed && completedOnTick === undefined) completedOnTick = tick;
    }
    componentOf(state, UNIVERSITY).set(university, 'buildProgress', row.buildProgress);

    // ---- 8b. library upkeep, against vellum ------------------------------
    const upkeep = applyLibraryUpkeep([{ handle: library, depth }], vellum);
    const paid = upkeep.outcomes[0]?.paid ?? 0;
    const shortfall = upkeep.outcomes[0]?.shortfall ?? 0;
    const degraded = upkeep.outcomes[0]?.degradedInstances ?? 0;
    vellum = upkeep.materialsRemaining;
    vellumUpkeepPaid += paid;
    vellumShortfall += shortfall;
    instancesDegraded += degraded;

    // ---- the demand this institution puts on the populace ----------------
    demand = computeOccupationDemand({
      constructionBacklog: Math.max(0, FP_ONE - row.buildProgress),
      scribingQueueDepth: scribeQueueDepth(world, state, library, residentHandles, counts),
      universityCapacity: effectiveCapacity(row),
      standingSoldierTarget: world.standingSoldierTarget,
    });

    log.push({
      tick,
      buildProgress: row.buildProgress,
      hosted,
      admitted,
      refused,
      scribeMonths,
      distinctNodes: depth.distinctNodes,
      instanceCount: depth.instanceCount,
      stone,
      vellum,
      upkeepShortfall: shortfall,
      degraded,
      scribeDemand: demand[OCCUPATION.scribe],
      studentDemand: demand[OCCUPATION.student],
      laborerDemand: demand[OCCUPATION.laborer],
    });
  }

  return report(scenario, world, {
    state,
    university,
    library,
    cohorts,
    cohortSpecies,
    residentHandles,
    depth,
    counts,
    hosted,
    admittedTotal,
    refusals,
    completedOnTick,
    scribeMonths,
    scribeMonthsTotal,
    stoneConsumed,
    vellumUpkeepPaid,
    vellumShortfall,
    instancesDegraded,
    demand,
    log,
  });
}

interface RunTail {
  state: SimState;
  university: EntityHandle;
  library: EntityHandle;
  cohorts: CohortStore;
  cohortSpecies: Map<EntityHandle, string>;
  residentHandles: readonly EntityHandle[];
  depth: LibraryDepth;
  counts: (nodeId: ContentId) => boolean;
  hosted: number;
  admittedTotal: number;
  refusals: AdmissionRefusals;
  completedOnTick: number | undefined;
  scribeMonths: Fixed;
  scribeMonthsTotal: Fixed;
  stoneConsumed: Fixed;
  vellumUpkeepPaid: Fixed;
  vellumShortfall: Fixed;
  instancesDegraded: number;
  demand: OccupationDemand;
  log: readonly LabTick[];
}

function report(scenario: LabScenario, world: LabWorld, tail: RunTail): LabReport {
  const row = readRecord(tail.state, UNIVERSITY, tail.university);
  const profile = universityProfile(tail.state, {
    library: tail.library,
    residentMages: tail.residentHandles,
    cellOf,
  });

  const scribesBySpecies: Record<string, number> = {};
  let staffHeadcount = 0;
  let staffCohorts = 0;
  for (const [cohort, speciesId] of staffedScribeCohorts(
    tail.state,
    tail.university,
    tail.cohorts,
    tail.cohortSpecies,
  )) {
    const count = tail.cohorts.countOf(cohort);
    scribesBySpecies[speciesId] = (scribesBySpecies[speciesId] ?? 0) + count;
    staffHeadcount += count;
    staffCohorts += 1;
  }

  const residentsByRole: Record<string, number> = {};
  const residentsBySpecies: Record<string, number> = {};
  for (const resident of world.residents) {
    residentsByRole[String(resident.role)] = (residentsByRole[String(resident.role)] ?? 0) + 1;
    residentsBySpecies[resident.speciesId] = (residentsBySpecies[resident.speciesId] ?? 0) + 1;
  }

  // One shelf, one answer per resident species. The whole point of the column.
  const contributionBySpecies: Record<string, Fixed> = {};
  for (const speciesId of new Set(world.residents.map((entry) => entry.speciesId))) {
    contributionBySpecies[speciesId] = contributionFor(
      tail.depth,
      (speciesNamed(speciesId) as SpeciesRecord).depthCeiling,
    );
  }

  let shelfReplacementCost = 0;
  for (const nodeId of shelvedNodeIds(tail.state, tail.library)) {
    shelfReplacementCost += scribeCostOf(nodeId);
  }

  return {
    id: scenario.id,
    axes: scenario.axes,
    ticks: scenario.ticks,
    contains: {
      buildProgress: row.buildProgress,
      complete: isComplete(row),
      completedOnTick: tail.completedOnTick,
      designedCapacity: row.capacity,
      effectiveCapacity: effectiveCapacity(row),
      hosted: tail.hosted,
      staffCohorts,
      staffHeadcount,
      scribesBySpecies,
      residentMages: world.residents.length,
      residentsByRole,
      residentsBySpecies,
      distinctNodes: tail.depth.distinctNodes,
      instanceCount: tail.depth.instanceCount,
      grimoireCount: tail.depth.grimoireCount,
      depthByTier: tail.depth.cumulativeByTier,
      dominantCell: dominantCell(profile),
      profileCells: profile.cells.length,
    },
    adds: {
      scribeMonthsTotal: tail.scribeMonthsTotal,
      scribeMonthsFinal: tail.scribeMonths,
      stoneConsumed: tail.stoneConsumed,
      vellumUpkeepPaid: tail.vellumUpkeepPaid,
      vellumShortfall: tail.vellumShortfall,
      instancesDegraded: tail.instancesDegraded,
      seatsRefused: tail.refusals.at(tail.university),
      studentsAdmitted: tail.admittedTotal,
      demand: tail.demand,
      contributionBySpecies,
      shelfReplacementCost,
    },
    log: tail.log,
  };
}

/** This university's scribe cohorts, ascending by handle, with their species. */
function staffedScribeCohorts(
  state: SimState,
  university: EntityHandle,
  cohorts: CohortStore,
  cohortSpecies: ReadonlyMap<EntityHandle, string>,
): readonly (readonly [EntityHandle, string])[] {
  const out: (readonly [EntityHandle, string])[] = [];
  // **`isLive` is passed.** `staffCohortsOf` takes it and no production caller
  // on `main` supplies it, so the documented safety net is inert in every
  // shipped build. Supplying it here is what makes the `unstaff`/dead-cohort
  // axis test something rather than nothing.
  for (const cohort of staffCohortsOf(state, university, (handle) => cohorts.isLive(handle))) {
    if (cohorts.keyOf(cohort).occupation !== OCCUPATION.scribe) continue;
    const speciesId = cohortSpecies.get(cohort);
    if (speciesId === undefined) continue;
    out.push([cohort, speciesId]);
  }
  return out;
}

/**
 * Grimoires queued for scribing, per the world's policy.
 *
 * `pinned-zero` reproduces `world-step.ts:748` exactly: the literal `0` that
 * every shipped build passes. `books-awaiting` counts nodes a resident knows
 * and the shelf does not, which is the queue a scriptorium would actually
 * have — and is the counterfactual the pinned literal suppresses.
 */
function scribeQueueDepth(
  world: LabWorld,
  state: SimState,
  library: EntityHandle,
  residents: readonly EntityHandle[],
  counts: (nodeId: ContentId) => boolean,
): number {
  if (world.scribeQueue === 'pinned-zero') return 0;
  const shelved = new Set(shelvedNodeIds(state, library));
  const wanted = new Set<ContentId>();
  const inResident = new Set(residents);
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.mind) continue;
    if (!inResident.has(row.locationId as EntityHandle)) continue;
    if (shelved.has(row.nodeId) || !counts(row.nodeId)) continue;
    wanted.add(row.nodeId);
  }
  return wanted.size;
}

function shelvedNodeIds(state: SimState, library: EntityHandle): readonly ContentId[] {
  const out: ContentId[] = [];
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind === LOCATION_KIND.library && row.locationId === library) out.push(row.nodeId);
  }
  return out;
}

function shelve(state: SimState, library: EntityHandle, nodeId: ContentId, tick: number): void {
  attachRecord(state, KNOWLEDGE_INSTANCE, state.entities.create(), {
    nodeId,
    locationKind: LOCATION_KIND.library,
    locationId: library,
    acquiredTick: tick,
    mastery: FP_ONE,
  });
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/** A sweep specification: which axes to cross, and the run shape to cross them at. */
export interface SweepSpec {
  readonly name: string;
  readonly axes: readonly AxisName[];
  readonly ticks: number;
  readonly capacity: number;
  /**
   * Take every `stride`-th cell of the cross.
   *
   * `1` is exhaustive. Anything else is a **declared** stratified sample, and
   * the report says which — a sweep that quietly thinned itself is a sweep
   * whose denominator does not match its flag, which `CLAUDE.md` catalogues as
   * the single most common shape of wrong answer in this repository.
   */
  readonly stride?: number;
}

/** Every scenario a sweep spec names, in a fixed order. */
export function scenariosFor(spec: SweepSpec): readonly LabScenario[] {
  const axes = spec.axes.filter((name) => AXIS_NAMES.includes(name));
  const stride = spec.stride ?? 1;
  const sizes = axes.map((name) => ALL_AXES[name].points.length);
  const total = sizes.reduce((product, size) => product * size, 1);

  const out: LabScenario[] = [];
  for (let index = 0; index < total; index += stride) {
    const coords: AxisCoords = {};
    let rest = index;
    for (let axisIndex = axes.length - 1; axisIndex >= 0; axisIndex -= 1) {
      const name = axes[axisIndex] as AxisName;
      const size = sizes[axisIndex] as number;
      coords[name] = (ALL_AXES[name].points[rest % size] as { id: string }).id;
      rest = Math.floor(rest / size);
    }
    out.push({
      id: axes.map((name) => `${name}=${String(coords[name])}`).join(' '),
      ticks: spec.ticks,
      capacity: spec.capacity,
      axes: coords,
    });
  }
  return out;
}

/** What a whole sweep produced. */
export interface SweepResult {
  readonly name: string;
  readonly axes: readonly AxisName[];
  /** Cells in the full cross, before striding. */
  readonly crossSize: number;
  readonly stride: number;
  readonly runs: readonly LabReport[];
}

export function runSweep(spec: SweepSpec): SweepResult {
  const scenarios = scenariosFor(spec);
  const sizes = spec.axes.map((name) => ALL_AXES[name].points.length);
  return {
    name: spec.name,
    axes: spec.axes,
    crossSize: sizes.reduce((product, size) => product * size, 1),
    stride: spec.stride ?? 1,
    runs: scenarios.map((scenario) => runLab(scenario)),
  };
}
