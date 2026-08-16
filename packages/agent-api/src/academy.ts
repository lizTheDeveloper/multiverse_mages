/*
 * Multiverse Mages — one college, in the terms a god would fund it in.
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
 * §4.4's **fourth** projection, beside `./knowledge-census.ts`, `./explain.ts`
 * and `./candidate-detail.ts`.
 *
 * `./candidate-detail.ts` answers *"which of these nineteen would I bless?"* and
 * its {@link UniversityDescriptor} is deliberately a **summary**: seven counts,
 * because a chip in a row of chips has room for seven counts. A university
 * *screen* asks a different question — *"what is this college, who is in it,
 * what is on its shelf, and what could it learn next"* — and none of that is a
 * count.
 *
 * Every field below already exists in state and none of it reaches a client:
 *
 * - **The roster.** `MAGE.universityId` is a handle and `0` is unaffiliated
 *   (§1.2). Nothing in §4.1 carries it: the mage block is 6 species × 8 tiers of
 *   counts, so a policy cannot tell a college of five from five hermits.
 * - **What each of them holds.** `KNOWLEDGE_INSTANCE` at `mind` or `palace`,
 *   which is what *she* can work — the same two kinds `describeMages` counts,
 *   here as the node ids rather than the tally, because the whole point of the
 *   screen is which node comes next.
 * - **What is on the shelf.** `KNOWLEDGE_INSTANCE` at `library`, keyed to
 *   `UNIVERSITY.libraryId`.
 * - **Who is teaching whom.** `EFFORT_PROGRESS` with `kind = teaching`, whose
 *   `subject` is the *teacher* and `counterparty` the student.
 *
 * ## "Who teaches here" is a join, and it is stated as one
 *
 * **`EFFORT_PROGRESS` carries no university.** §1.2's note is explicit that a
 * teaching row belongs to the *pair*, not to a place; there is no classroom in
 * state and no component that would hold one. So the only sense in which a
 * lesson happens *at* a college is that one of the two parties is affiliated to
 * it, and {@link TeachingEffort} carries both halves of that join —
 * `teacherHere` and `studentHere` — rather than filtering on one and letting a
 * page print the inference as a fact.
 *
 * That distinction is not academic. Measured on the reference scenario at seed
 * 20260813, world tick 200 and again at 1000: every teaching row has an
 * **affiliated teacher and an unaffiliated student**. A page that filtered on
 * "both parties here" would draw an empty classroom; one that filtered on the
 * teacher and said nothing would claim a student the college does not have.
 *
 * ## What is deliberately not here
 *
 * **A name, a place, an endowment, a research focus.** Not omissions — refusals,
 * each with a mechanism behind it:
 *
 * - A **name**, for the reason `./candidate-detail.ts` gives at length: no
 *   component holds one, so one produced here would be fiction rendered as fact.
 * - A **place**, because `assertNoWorldPositions` throws if any world-scale
 *   component declares `x`/`y` (§0). Only combatants and objectives have
 *   coordinates. A university screen is a dossier and cannot be a map.
 * - A **research focus**, because `rules-world`'s `universities/profile.ts`
 *   records specialization as *emergent from library contents and staff
 *   knowledge* — vision §13's resolution — and a test there scans the component
 *   layout to fail if anyone adds a focus field. This package cannot import
 *   `rules-world` (§5), so what it does instead is ship the two inputs — the
 *   shelf and the roster's holdings — and let a reader see the specialization
 *   the way the design says it exists: derived, on demand, from what is here.
 *
 * ## `permittedCells` is a rules answer, and that is why it rides along
 *
 * The frontier question — *"what could this college learn next?"* — is bounded
 * by two things: the prerequisite graph, which is content, and which cells the
 * ruleset currently permits, which is `permits()` and is emphatically a rule.
 * §5's *"the client computes no rules"* means a page must not reconstruct
 * `permits()` out of the ruleset block's nineteen bits and eight edict slots. So
 * the answer is computed here, from the same `@mm/state` accessor
 * `./candidates.ts` uses for action 8's grantable set, and shipped as a list of
 * cell ids.
 *
 * What is left for a client is set arithmetic over the graph — *is every
 * prerequisite of this node in what she holds, and is its cell in this list* —
 * which is exactly the filter `CoordinatingKnowledgeGateway.researchFrontier`
 * applies, and no more.
 *
 * ## Cost
 *
 * Four passes over the instance store and the mage store, bounded by the
 * universe rather than by a candidate list — which is the one place this differs
 * from `./candidate-detail.ts`, and it is affordable for the same reason
 * `knowledgeCensus` is: **nothing here is on any policy's per-tick path.** It is
 * built on request by a client and read by no rule.
 */

import type { SimState } from '@mm/sim-core';
import {
  EFFORT_KIND,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  POPULACE_COHORT,
  UNIVERSITY,
  UNIVERSITY_STAFF,
  EFFORT_PROGRESS,
  collectRecords,
  componentOf,
  findUniverse,
  permits,
  readRulesetForObservation,
} from '@mm/state';

import type { MageDescriptor, UniversityDescriptor } from './candidate-detail.js';
import { describeMages, describeUniversities } from './candidate-detail.js';
import type { ContentCatalogue } from './catalogue.js';

/** §2.1's grid width. A cell id outside `1..70` names no cell. */
const GRID_CELL_COUNT = 70;

/**
 * One affiliated mage, and the nodes she personally holds.
 *
 * `nodeIds` and not a count, because {@link MageDescriptor.nodesKnown} is
 * already the count and this is the thing the count was made from. `mind` and
 * `palace` only — the two kinds that are *hers*; a book on the shelf beside her
 * is the college's, and conflating the two would report a librarian as a
 * scholar. Ascending, so two roster rows are comparable by eye.
 */
export interface RosterEntry {
  readonly handle: number;
  readonly nodeIds: readonly number[];
}

/**
 * One node on a library's shelves.
 *
 * `copies` is the redundancy §1.5 makes load-bearing: one instance is a book
 * that can be lost, four is a node the college keeps. `bestMastery` is the
 * highest of them in `fp`, because a decayed copy and a fresh one are not the
 * same asset and the shelf count alone cannot say which this is.
 */
export interface ShelfEntry {
  readonly nodeId: number;
  readonly copies: number;
  readonly bestMastery: number;
}

/**
 * One lesson in progress, and both halves of the join that places it.
 *
 * Named `teacher`/`student` rather than `subject`/`counterparty` for two
 * reasons. The first is that those are the words a reader uses. The second is
 * structural: `@mm/state`'s `EffortProgressRecord` is
 * `{subject, kind, nodeId, counterparty, progress}`, and a type here carrying
 * all five plus the two join flags would be a *superset* of it —
 * `schema-duplication.test.ts` refuses exactly that, and is right to. `kind` is
 * dropped rather than renamed because this list is teaching-only, so the field
 * would be a constant dressed as information; that is the same move
 * {@link MageDescriptor} makes with `alive`.
 */
export interface TeachingEffort {
  /** `EFFORT_PROGRESS.subject`. §1.2: for teaching, the *teacher*. */
  readonly teacher: number;
  /** `EFFORT_PROGRESS.counterparty`. Never `0` on a teaching row. */
  readonly student: number;
  readonly nodeId: number;
  /** Accumulated against the node's authored `teachCost`, `fp`. */
  readonly progress: number;
  /** Whether the teacher's `universityId` is this college. */
  readonly teacherHere: boolean;
  /** Whether the student's is. Measured false for every pair in the reference run. */
  readonly studentHere: boolean;
}

/** One college, whole. */
export interface UniversityDossier {
  /**
   * The summary `./candidate-detail.ts` already publishes, nested rather than
   * spread. One vocabulary for one entity: a page that reads `capacity` off a
   * funding chip and off this screen reads the same field derived by the same
   * function, and a fourth field on `UNIVERSITY` arrives in both at once.
   */
  readonly college: UniversityDescriptor;
  /** Living mages whose `universityId` is this handle, ascending. */
  readonly roster: readonly RosterEntry[];
  /** Distinct nodes on its shelves, ascending. Empty when it has no library. */
  readonly shelf: readonly ShelfEntry[];
  /** Lessons with at least one party affiliated here. */
  readonly teaching: readonly TeachingEffort[];
  /**
   * People in the cohorts `UNIVERSITY_STAFF` links here.
   *
   * §1.4 links a university to **populace cohorts, not to mages** — the staff
   * are the scribes and labourers, and they are aggregate by §1.3's performance
   * contract. So this is a headcount and can never become a list of names.
   */
  readonly staffHeadcount: number;
}

/** Every college, the people in them, and the cells the ruleset permits. */
export interface AcademyProjection {
  readonly universities: ReadonlyMap<number, UniversityDossier>;
  /**
   * Every mage any dossier names — roster and both parties of every lesson —
   * once, by handle.
   *
   * Built by the **same** `describeMages` `./candidate-detail.ts` calls, on the
   * same state, so the two tables are duplicated bytes and cannot be a
   * duplicated vocabulary: there is one definition of what a mage looks like to
   * a reader, and it is in one function.
   */
  readonly mages: ReadonlyMap<number, MageDescriptor>;
  /**
   * Cell ids the ruleset permits **and** content has authored nodes into,
   * ascending — `permits()` over the populated cells, which is precisely
   * `CoordinatingKnowledgeGateway`'s own frontier bound.
   *
   * A rule, computed here so a client does not reconstruct it. See the module
   * note.
   */
  readonly permittedCells: readonly number[];
  /** Living mages with `universityId === 0`. The academy's outside. */
  readonly unaffiliated: number;
}

/** What {@link describeAcademy} reads. */
export interface AcademyInput {
  readonly state: SimState;
  /** For a node's cell and tier, and for which cells content populates. */
  readonly catalogue: ContentCatalogue;
}

/**
 * Describes every standing university.
 *
 * Every one of them, not a candidate list's worth: action 11 ranks colleges by
 * how *incomplete* they are, so a finished college can drop off the funding
 * slate entirely — and dropping off a funding slate is not a reason to vanish
 * from a screen about the academy.
 */
export function describeAcademy(input: AcademyInput): AcademyProjection {
  const { state, catalogue } = input;

  const handles = collectRecords(state, UNIVERSITY).map(({ handle }) => handle);
  const universityHandles = new Set(handles);

  // Affiliation, in one pass. `unaffiliated` is counted here rather than
  // subtracted from a living total, because a mage affiliated to a *dead*
  // college — a handle that no longer resolves — is neither, and a subtraction
  // would silently file her as unaffiliated.
  const rosterOf = new Map<number, number[]>();
  let unaffiliated = 0;
  for (const { handle, row } of collectRecords(state, MAGE)) {
    if (row.alive === 0) continue;
    if (row.universityId === 0) {
      unaffiliated += 1;
      continue;
    }
    if (!universityHandles.has(row.universityId)) continue;
    const list = rosterOf.get(row.universityId);
    if (list === undefined) rosterOf.set(row.universityId, [handle]);
    else list.push(handle);
  }

  const universityOfMage = new Map<number, number>();
  for (const [university, mages] of rosterOf) {
    for (const mage of mages) universityOfMage.set(mage, university);
  }

  // Teaching, in one pass, attributed to *both* parties' colleges. A lesson
  // whose teacher is here and whose student is elsewhere appears on both
  // screens, once each, with the two flags reading differently — which is the
  // truthful rendering of a row that belongs to a pair and not to a place.
  const teachingOf = new Map<number, TeachingEffort[]>();
  const namedMages = new Set<number>();
  for (const { row } of collectRecords(state, EFFORT_PROGRESS)) {
    if (row.kind !== EFFORT_KIND.teaching) continue;
    const teacherAt = universityOfMage.get(row.subject) ?? 0;
    const studentAt = universityOfMage.get(row.counterparty) ?? 0;
    if (teacherAt === 0 && studentAt === 0) continue;
    namedMages.add(row.subject);
    namedMages.add(row.counterparty);
    for (const at of teacherAt === studentAt ? [teacherAt] : [teacherAt, studentAt]) {
      if (at === 0) continue;
      const effort: TeachingEffort = Object.freeze({
        teacher: row.subject,
        student: row.counterparty,
        nodeId: row.nodeId,
        progress: row.progress,
        teacherHere: teacherAt === at,
        studentHere: studentAt === at,
      });
      const list = teachingOf.get(at);
      if (list === undefined) teachingOf.set(at, [effort]);
      else list.push(effort);
    }
  }

  for (const mages of rosterOf.values()) {
    for (const mage of mages) namedMages.add(mage);
  }

  // One pass over the instance store answers both halves: what sits on each
  // college's shelves, and what each named mage carries in her head.
  const libraryOwner = new Map<number, number>();
  const universities = componentOf(state, UNIVERSITY);
  for (const handle of handles) {
    const libraryId = universities.get(handle, 'libraryId');
    if (libraryId !== 0) libraryOwner.set(libraryId, handle);
  }

  const shelfOf = new Map<number, Map<number, { copies: number; bestMastery: number }>>();
  const heldBy = new Map<number, Set<number>>();
  const instances = componentOf(state, KNOWLEDGE_INSTANCE);
  const nodeIds = instances.field('nodeId');
  const kinds = instances.field('locationKind');
  const locations = instances.field('locationId');
  const masteries = instances.field('mastery');
  instances.forEach((rowIndex: number) => {
    const kind = kinds[rowIndex];
    const at = locations[rowIndex] ?? 0;
    const nodeId = nodeIds[rowIndex] ?? 0;
    if (kind === LOCATION_KIND.library) {
      const owner = libraryOwner.get(at);
      if (owner === undefined) return;
      let shelf = shelfOf.get(owner);
      if (shelf === undefined) {
        shelf = new Map();
        shelfOf.set(owner, shelf);
      }
      const mastery = masteries[rowIndex] ?? 0;
      const entry = shelf.get(nodeId);
      if (entry === undefined) shelf.set(nodeId, { copies: 1, bestMastery: mastery });
      else {
        entry.copies += 1;
        if (mastery > entry.bestMastery) entry.bestMastery = mastery;
      }
      return;
    }
    if (kind !== LOCATION_KIND.mind && kind !== LOCATION_KIND.palace) return;
    if (!namedMages.has(at)) return;
    let held = heldBy.get(at);
    if (held === undefined) {
      held = new Set<number>();
      heldBy.set(at, held);
    }
    held.add(nodeId);
  });

  // Staff, in two passes: the links, then the cohorts they point at. A cohort
  // named by a link that no longer resolves contributes nothing rather than
  // zero — the same distinction, one level down.
  const cohortsOf = new Map<number, number[]>();
  for (const { row } of collectRecords(state, UNIVERSITY_STAFF)) {
    if (!universityHandles.has(row.universityId)) continue;
    const list = cohortsOf.get(row.universityId);
    if (list === undefined) cohortsOf.set(row.universityId, [row.cohortId]);
    else list.push(row.cohortId);
  }
  const cohorts = componentOf(state, POPULACE_COHORT);

  const mages = describeMages(state, catalogue, namedMages);
  const colleges = describeUniversities(state, universityHandles);

  const out = new Map<number, UniversityDossier>();
  for (const handle of [...handles].sort((a, b) => a - b)) {
    const college = colleges.get(handle);
    if (college === undefined) continue;
    const shelf = shelfOf.get(handle);
    let staffHeadcount = 0;
    for (const cohortId of cohortsOf.get(handle) ?? []) {
      if (cohorts.has(cohortId)) staffHeadcount += cohorts.get(cohortId, 'count');
    }
    out.set(
      handle,
      Object.freeze({
        college,
        roster: Object.freeze(
          (rosterOf.get(handle) ?? [])
            .filter((mage) => mages.has(mage))
            .sort((a, b) => a - b)
            .map((mage) =>
              Object.freeze({
                handle: mage,
                nodeIds: Object.freeze([...(heldBy.get(mage) ?? [])].sort((a, b) => a - b)),
              }),
            ),
        ),
        shelf: Object.freeze(
          [...(shelf ?? new Map())]
            .sort((a, b) => a[0] - b[0])
            .map(([nodeId, entry]) =>
              Object.freeze({ nodeId, copies: entry.copies, bestMastery: entry.bestMastery }),
            ),
        ),
        teaching: Object.freeze(teachingOf.get(handle) ?? []),
        staffHeadcount,
      }),
    );
  }

  return Object.freeze({
    universities: out,
    mages,
    permittedCells: permittedCellIds(state, catalogue),
    unaffiliated,
  });
}

/**
 * The cells the ruleset permits, restricted to those content has authored nodes
 * into.
 *
 * Both halves matter and they answer different questions. `permits()` is the
 * rule — technique bit, form bit, and the eight edict slots that override both.
 * *Populated* is the bound `CoordinatingKnowledgeGateway.#legalNodeIds` uses,
 * and it is what keeps this list from promising a frontier in a cell where there
 * is nothing to reach: fifty-eight of the seventy cells carry nodes nobody has
 * authored yet.
 */
function permittedCellIds(state: SimState, catalogue: ContentCatalogue): readonly number[] {
  const universe = findUniverse(state);
  if (universe === 0) return Object.freeze([]);
  const ruleset = readRulesetForObservation(state, universe);
  const populated = new Set<number>();
  for (const node of catalogue.nodes) {
    if (node.cellId >= 1 && node.cellId <= GRID_CELL_COUNT) populated.add(node.cellId);
  }
  return Object.freeze(
    [...populated].filter((cellId) => permits(ruleset, cellId)).sort((a, b) => a - b),
  );
}
