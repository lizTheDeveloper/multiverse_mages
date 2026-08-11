/*
 * Multiverse Mages — the two god systems: what the player does, and what the
 * universe does back.
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
 * Two systems, installed either side of the world tick.
 *
 * ## Why two, and why they sit where they do
 *
 * **`god-intervention` runs first.** Expiries and the hysteresis decay come
 * before any action resolves, so a blessing that lapses this tick cannot be
 * "refreshed" by a bless submitted the same tick and thereby last one tick
 * longer than its duration; and an action resolves against a world the tick has
 * not yet changed, which is the same reading the mask took when the agent chose
 * it. Founding a university before the populace phase also means the tick's
 * labour market sees it, which is what makes funding feel immediate.
 *
 * **`god-outcome` runs last.** Worship is a *measurement*, and the thing worth
 * measuring is the civilization at the end of the tick — after births, deaths,
 * promotions and construction. Regeneration follows the measurement, so a god
 * who founded a university this tick starts being paid for it from this tick.
 * And every terminal check reads the state the tick actually produced, so a run
 * whose last mage died this tick starts its mageless clock now rather than a
 * tick late.
 *
 * ## The world system is wrapped rather than edited
 *
 * `world-step.ts` is a file several capabilities touch at once. Rather than add
 * a terminal guard inside it, {@link frozenWhenTerminal} wraps it: a universe
 * that has ascended or stagnated runs no world phase at all. That keeps this
 * change's footprint in that file to the systems list.
 *
 * **What "frozen" does and does not cover.** No component row changes after
 * termination — no birth, no death, no research, no favor, no worship. The
 * *clock* still advances, because `step` advances it unconditionally and that
 * is `sim-core`'s contract rather than this capability's to override. So a
 * terminated universe's snapshot hash does move, by exactly the clock, and the
 * layer that stops advancing a finished run is `agent-api`'s session — which
 * already refuses to `submit` to a terminated episode. This is a deviation from
 * the ascension spec's scenario as written and is recorded rather than papered
 * over.
 */

import type { ComponentSpec, EntityHandle, SimState, System } from '@mm/sim-core';
import { FP_ONE, TIME_MODE, eraOf } from '@mm/sim-core';
import type { Fixed } from '@mm/sim-core';
import type { PrimitiveRecord } from '@mm/content';
import type { CellResolver, KnowledgeSubsystem, NodeCatalog } from '@mm/rules-magic';
import type { ClampCounters } from '@mm/primitives';
import {
  ASCENSION_PATH,
  BLESSING,
  EDICT_BUDGET_MAX,
  ENCOURAGED_CELL,
  ERA_EVALUATION,
  EVER_KNOWN,
  KNOWLEDGE_INSTANCE,
  LOCATION_KIND,
  MAGE,
  POPULACE_COHORT,
  TERMINAL_REASON,
  UNIVERSE,
  UNIVERSITY,
  UPHEAVAL,
  AXIS_CHANGE_COUNTER,
  activeBlessings,
  activeUpheavals,
  attachRecord,
  collectRecords,
  componentOf,
  findUniverse,
  permits,
  readEdicts,
  readRulesetForObservation,
  readUniverse,
} from '@mm/state';

import type { DeepestByCell } from './ascension.js';
import {
  deepestNodesByCell,
  libraryDependence,
  prestigeEarned,
  qualifyingPath,
  stepStagnation,
} from './ascension.js';
import type { GodContent } from './constants.js';
import type { FavorLedgerEntry } from './favor.js';
import { applyRegeneration, favorRegeneration, ledgerBalances } from './favor.js';
import { godState, writeGodState } from './god-state.js';
import type { InterventionReport } from './interventions.js';
import { resolveInterventions } from './interventions.js';
import { edictBudgetFor, favorCapFor, laggedWorship, shockedTarget, worshipTarget } from './worship.js';

/** Everything the god systems need beyond state. Resolved once, per run. */
export interface GodDeps {
  readonly content: GodContent;
  readonly catalog: NodeCatalog;
  readonly cells: CellResolver;
  /** A knowledge subsystem over the state being stepped. Rebuilt per tick. */
  readonly knowledgeFor: (state: SimState) => KnowledgeSubsystem;
  /** The `worship-yield` registry record, for the shared stacking channel and its cap. */
  readonly worshipYield: PrimitiveRecord;
  /** `worship-yield` magnitude carried by each node that carries any. */
  readonly worshipYieldNodes: ReadonlyMap<number, Fixed>;
  /** Node ids carrying the `portal` primitive. */
  readonly portalNodes: ReadonlySet<number>;
  /** Where `worship-yield` cap clamps are counted, when a caller keeps counters. */
  readonly clampCounters?: ClampCounters;
  /**
   * Nodes whose last instance was destroyed during *this* tick's world phase.
   *
   * Supplied by the composition root as a closure over the world loop's report,
   * which is written at the end of the world system and read at the start of
   * this one — inside the same `step`, never across ticks. A value that had to
   * survive a tick boundary would be state outside the snapshot, and a replay
   * from a save would silently lose it.
   */
  readonly nodesLostThisTick: (worldTick: number) => number;
}

/** What one tick of god rules did. Reporting only; never an input to a rule. */
export interface GodTickReport {
  readonly worldTick: number;
  readonly worship: Fixed;
  readonly worshipTarget: Fixed;
  readonly worshipTier: number;
  readonly edictBudget: number;
  readonly favor: Fixed;
  readonly favorCap: Fixed;
  readonly favorWasted: Fixed;
  /** Per-class saturated contributions, so a snowball is attributable. */
  readonly worshipByClass: { mages: Fixed; universities: Fixed; populace: Fixed };
  readonly ledger: FavorLedgerEntry;
  readonly interventions: InterventionReport;
  readonly ascensionPath: number;
  readonly terminalReason: number;
}

/** The pair of systems, plus the last tick's report. Built once per run. */
export interface GodSimulation {
  /** Runs before the world tick: expiries, hysteresis decay, and `ctx.actions`. */
  readonly intervention: System;
  /** Runs after it: worship, favor, eras, ascension, stagnation. */
  readonly outcome: System;
  /** The last tick's report, or `undefined` before the first god tick. */
  lastReport: () => GodTickReport | undefined;
}

const NO_INTERVENTIONS: InterventionReport = Object.freeze({
  spentByAction: Object.freeze({}),
  refused: 0,
  rolledBack: 0,
  applied: 0,
});

/**
 * Builds both systems over one shared, per-run cell.
 *
 * The cell carries the intervention report from the first system to the second
 * **within one `step`** and never across ticks. Passing it through state would
 * put a per-tick projection inside every snapshot and therefore inside every
 * hash, at which point two peers could desync over a number no rule reads —
 * the same argument `world-step.ts` makes for handing its report back through a
 * closure. A module-level variable would work too and is worse: it would make
 * two simulations in one process share it, which is the shared-mutable-state
 * defect the harness's own capability spec forbids.
 *
 * `spentTick` makes a stale read impossible rather than unlikely: the outcome
 * system uses the report only when it was written by the tick it is running.
 */
export function godSystems(deps: GodDeps): GodSimulation {
  let spent: InterventionReport = NO_INTERVENTIONS;
  let spentTick = -1;
  let last: GodTickReport | undefined;

  return {
    intervention: interventionSystem(deps, (report, tick) => {
      spent = report;
      spentTick = tick;
    }),
    outcome: outcomeSystem(
      deps,
      (tick) => (spentTick === tick ? spent : NO_INTERVENTIONS),
      (report) => {
        last = report;
      },
    ),
    lastReport: () => last,
  };
}

/**
 * The system that resolves `ctx.actions`.
 *
 * Expiries first, then the hysteresis decay, then the actions in submission
 * order. Nothing here reads randomness: every god action is deterministic given
 * the state and the submission, which is why `god-agency` claims **no new RNG
 * stream** — see the note in `index.ts`.
 */
function interventionSystem(
  deps: GodDeps,
  onResolved: (report: InterventionReport, worldTick: number) => void,
): System {
  return {
    name: 'god-intervention',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      const universe = findUniverse(ctx.state);
      if (universe === 0) return;
      if (readUniverse(ctx.state, universe).terminalReason !== TERMINAL_REASON.none) return;

      expireRows(ctx.state, ctx.tick);
      decayHysteresis(ctx.state, ctx.tick, deps);

      const report = resolveInterventions(ctx.state, ctx.actions, ctx.tick, ctx.mode, {
        god: deps.content,
        catalog: deps.catalog,
        cells: deps.cells,
        knowledge: deps.knowledgeFor(ctx.state),
        edictBudgetMax: EDICT_BUDGET_MAX,
        portalNodes: deps.portalNodes,
        requestEngagement: () => {
          ctx.requestEngagement();
        },
      });
      onResolved(report, ctx.tick);
    },
  };
}

/**
 * Drops blessings, shocks and emphases whose tick has come.
 *
 * The three specs are widened to the base type on purpose, the way
 * `fixtures.ts` widens `WORLD_COMPONENTS`: a `const` tuple's element type is a
 * union of three distinct layouts, and `componentOf` would try to infer one of
 * them for all three. Every one of them carries `expiryTick`, which is what
 * makes one loop correct for all three.
 */
function expireRows(state: SimState, worldTick: number): void {
  const specs: readonly ComponentSpec<{ readonly expiryTick: 'i32' }>[] = [
    BLESSING,
    UPHEAVAL,
    ENCOURAGED_CELL,
  ] as unknown as readonly ComponentSpec<{ readonly expiryTick: 'i32' }>[];
  for (const spec of specs) {
    const store = componentOf(state, spec);
    const expiry = store.field('expiryTick');
    const doomed: EntityHandle[] = [];
    store.forEach((row, handle) => {
      if ((expiry[row] as number) <= worldTick) doomed.push(handle);
    });
    for (const handle of doomed) {
      // The row, not the entity: a blessing hangs on the mage's own handle, and
      // destroying the entity would kill the mage. `upheaval` and
      // `encouraged-cell` own their entities and could be destroyed either way;
      // removing the row is the operation that is correct for all three.
      store.remove(handle);
    }
  }
}

/**
 * Decays every axis's recent-change counter by one, once per decay window.
 *
 * A single sweep on the window boundary rather than a per-axis timestamp: a
 * timestamp per axis is a second thing to keep in step with the counter, and
 * the difference between the two schemes is at most one window of memory on an
 * axis nobody is flipping.
 */
function decayHysteresis(state: SimState, worldTick: number, deps: GodDeps): void {
  const window = deps.content.constants.hysteresisDecayTicks;
  if (window <= 0 || worldTick <= 0 || worldTick % window !== 0) return;
  const store = componentOf(state, AXIS_CHANGE_COUNTER);
  for (const { handle, row } of collectRecords(state, AXIS_CHANGE_COUNTER)) {
    if (row.changeCount === 0) continue;
    store.set(handle, 'changeCount', row.changeCount - 1);
  }
}

/**
 * The system that measures the civilization and decides whether the run is over.
 *
 * Order inside the tick matters and is stated because every later reader will
 * depend on it:
 *
 * 1. **Worship target**, from the state the tick produced.
 * 2. **Shocks**, folded into the target rather than into the stored value, so
 *    that an expiring shock lets worship climb back rather than snapping.
 * 3. **The lag**, which is the only thing that writes `worship`.
 * 4. **Tier, edict budget, favor cap**, all derived from the worship just
 *    written — so a tier crossed this tick is observed by everything after it
 *    in the same tick, which is what "recomputed within the tick worship
 *    changes" means.
 * 5. **Regeneration**, capped, with the overflow counted.
 * 6. **The era boundary**, if this tick is one.
 * 7. **Ascension eligibility**, recomputed from scratch so it can lapse.
 * 8. **Stagnation**, and the terminal write.
 */
function outcomeSystem(
  deps: GodDeps,
  interventionsFor: (worldTick: number) => InterventionReport,
  onReport: (report: GodTickReport) => void,
): System {
  let deepest: DeepestByCell | undefined;

  return {
    name: 'god-outcome',
    run(ctx) {
      if (ctx.mode !== TIME_MODE.world) return;
      const state = ctx.state;
      const universe = findUniverse(state);
      if (universe === 0) return;

      const universeStore = componentOf(state, UNIVERSE);
      if (universeStore.get(universe, 'terminalReason') !== TERMINAL_REASON.none) return;

      const constants = deps.content.constants;
      const knowledge = deps.knowledgeFor(state);
      let god = godState(state, universe);

      // ---- 1–3. Worship ------------------------------------------------------
      const target = worshipTarget(worshipSources(state, ctx.tick), constants);
      const shocked = shockedTarget(
        target.target,
        activeUpheavals(state, ctx.tick).map((entry) => entry.factor),
        constants,
      );
      const worship = laggedWorship(universeStore.get(universe, 'worship'), shocked, constants);
      universeStore.set(universe, 'worship', worship);

      // ---- 4. Tier and the values derived from it ----------------------------
      const worshipTier = tierOf(worship, constants);
      universeStore.set(universe, 'worshipTier', worshipTier);
      const edictBudget = edictBudgetFor(worshipTier, EDICT_BUDGET_MAX);
      universeStore.set(universe, 'edictBudget', edictBudget);
      const favorCap = favorCapFor(worshipTier, constants);
      universeStore.set(universe, 'favorCap', favorCap);
      const overBudget = Math.max(readEdicts(state).length - edictBudget, 0);

      // ---- 5. Regeneration ---------------------------------------------------
      const opening = universeStore.get(universe, 'favor');
      const regenerated = favorRegeneration(
        worship,
        constants,
        yieldSources(knowledge, deps),
        deps.worshipYield,
        deps.clampCounters,
      );
      const outcome = applyRegeneration(opening, regenerated, favorCap);
      universeStore.set(universe, 'favor', outcome.favor);

      // ---- 6. The era boundary ----------------------------------------------
      const known = knowledge.knownNodes();
      const everKnown = componentOf(state, EVER_KNOWN).size;
      const lost = deps.nodesLostThisTick(ctx.tick);
      god = { ...god, eraNodesLost: god.eraNodesLost + lost };

      const era = eraOf(ctx.tick);
      if (era > god.lastEraRecorded) {
        const dependence = libraryDependence(known.length, knowledge.singleInstanceNodes().length);
        const passed =
          dependence <= constants.ascensionDependenceMax &&
          god.eraNodesLost <= constants.ascensionLossMax;
        recordEra(state, era, dependence, god.eraNodesLost, passed);
        god = {
          ...god,
          lastEraRecorded: era,
          eraNodesLost: 0,
          goodEraRun: passed ? god.goodEraRun + 1 : 0,
        };
      }

      // ---- 7. Ascension eligibility, recomputed so it can lapse ---------------
      deepest ??= deepestNodesByCell(deps.catalog, (nodeId) => deps.cells.cellOf(nodeId));
      const ruleset = readRulesetForObservation(state, universe);
      const path = qualifyingPath(
        {
          heldByLivingMage: nodesHeldByLivingMages(state),
          instanceCount: (nodeId) => knowledge.instanceCount(nodeId),
          permitsCell: (cellId) => permits(ruleset, cellId),
          cellOf: (nodeId) => deps.cells.cellOf(nodeId),
          deepest,
          worshipTier,
        },
        god,
        ctx.tick,
        constants,
      );
      god = {
        ...god,
        ascensionPath: path,
        ascensionFirstMetTick:
          god.ascensionFirstMetTick === 0 && path !== ASCENSION_PATH.none
            ? ctx.tick
            : god.ascensionFirstMetTick,
      };

      // ---- 8. Stagnation, and the terminal write ------------------------------
      const livingMages = countLiving(state);
      const stagnation = stepStagnation(
        god,
        {
          livingMages,
          worship,
          // "A node newly entered the universe" is read as either count rising:
          // ever-known catches a genuinely new node, existing catches a
          // rediscovery or a re-taught one. The case both miss is a loss and a
          // gain in the same tick, which nets the existing count to zero change
          // — documented rather than hidden, and harmless here because the
          // stasis trigger is conjunctive with the worship health floor, so a
          // universe healthy enough to be doing both is never terminated by it.
          nodeEntered: everKnown > god.lastEverKnown || known.length > god.lastExisting,
        },
        constants,
      );

      god = {
        ...god,
        magelessTicks: stagnation.magelessTicks,
        lowWorshipTicks: stagnation.lowWorshipTicks,
        stasisTicks: stagnation.stasisTicks,
        lastEverKnown: everKnown,
        lastExisting: known.length,
        favorWasted: god.favorWasted + outcome.discarded,
        peakWorshipTier: Math.max(god.peakWorshipTier, worshipTier),
        deepestTier: Math.max(god.deepestTier, deepestTierHeld(state, deps)),
        overBudgetEdicts: overBudget,
      };

      let terminalReason = universeStore.get(universe, 'terminalReason');
      if (stagnation.stagnated) {
        terminalReason = TERMINAL_REASON.stagnation;
        universeStore.set(universe, 'terminalReason', terminalReason);
        god = { ...god, terminalTick: ctx.tick };
      }

      if (terminalReason !== TERMINAL_REASON.none) {
        // Written once, at termination, and applied to the *next* universe's
        // `prestige` — never to this one. §1.1 makes `prestige` read-only for
        // the length of a run, and a run that could raise its own carried
        // prestige mid-flight would be the meta-game feeding the loop it exists
        // to sit outside.
        universeStore.set(
          universe,
          'prestigeEarned',
          prestigeEarned(
            {
              terminalReason,
              deepestTier: god.deepestTier,
              erasSurvived: era,
              peakWorshipTier: god.peakWorshipTier,
            },
            constants,
          ),
        );
      }

      writeGodState(state, universe, god);

      const interventions = interventionsFor(ctx.tick);
      let spentThisTick = 0;
      for (const amount of Object.values(interventions.spentByAction)) spentThisTick += amount;

      const ledger: FavorLedgerEntry = {
        worldTick: ctx.tick,
        // The opening balance is what the pool held *before* this tick's
        // spending, which is the balance the intervention system was handed —
        // so it is reconstructed by adding back what was spent rather than read
        // after the fact.
        opening: opening + spentThisTick,
        regenerated: outcome.gained + outcome.discarded,
        discarded: outcome.discarded,
        spentByAction: interventions.spentByAction,
        closing: outcome.favor,
      };
      if (!ledgerBalances(ledger)) {
        throw new Error(
          `The favor ledger for world tick ${String(ctx.tick)} does not balance: opened at ` +
            `${String(ledger.opening)}, regenerated ${String(ledger.regenerated)}, discarded ` +
            `${String(ledger.discarded)}, spent ${String(spentThisTick)}, closed at ` +
            `${String(ledger.closing)}. Favor was created or destroyed outside regeneration and ` +
            'intervention, which are the only two paths permitted to move it.',
        );
      }

      onReport({
        worldTick: ctx.tick,
        worship,
        worshipTarget: shocked,
        worshipTier,
        edictBudget,
        favor: outcome.favor,
        favorCap,
        favorWasted: god.favorWasted,
        worshipByClass: {
          mages: target.mages.saturated,
          universities: target.universities.saturated,
          populace: target.populace.saturated,
        },
        ledger,
        interventions,
        ascensionPath: path,
        terminalReason,
      });
    },
  };
}

/**
 * Wraps a system so a terminated universe runs none of it.
 *
 * See the module note for what "frozen" covers. The wrapper rather than an edit
 * inside `world-step.ts` is deliberate: that file is contended, and a guard at
 * the composition point is both smaller and easier to remove if `raid-engagement`
 * later needs a terminated universe to keep resolving something.
 */
export function frozenWhenTerminal(system: System): System {
  return {
    name: system.name,
    run(ctx) {
      const universe = findUniverse(ctx.state);
      if (universe !== 0 && readUniverse(ctx.state, universe).terminalReason !== TERMINAL_REASON.none) {
        return;
      }
      system.run(ctx);
    },
  };
}

// ---------------------------------------------------------------------------
// Projections. None is cached across ticks, and none is written to state.
// ---------------------------------------------------------------------------

function worshipSources(
  state: SimState,
  worldTick: number,
): { mages: number; blessedMages: number; completedUniversities: number; populace: number } {
  let mages = 0;
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive !== 0) mages += 1;
  }

  // Blessed *and living*: a blessing outlives its mage by up to its duration,
  // because the row hangs on her handle and her entity is retained so that a
  // grimoire naming her keeps a valid handle. Counting a dead woman's blessing
  // would pay the god worship for a congregation of one corpse.
  const mageStore = componentOf(state, MAGE);
  let blessedMages = 0;
  for (const entry of activeBlessings(state, worldTick)) {
    if (!mageStore.has(entry.mage)) continue;
    if (mageStore.get(entry.mage, 'alive') !== 0) blessedMages += 1;
  }

  let completedUniversities = 0;
  for (const { row } of collectRecords(state, UNIVERSITY)) {
    if (row.buildProgress >= FP_ONE) completedUniversities += 1;
  }

  let populace = 0;
  for (const { row } of collectRecords(state, POPULACE_COHORT)) populace += row.count;

  return { mages, blessedMages, completedUniversities, populace };
}

function tierOf(worship: Fixed, constants: GodContent['constants']): number {
  let tier = 0;
  let threshold = constants.worshipTierBase;
  for (let step = 0; step < constants.worshipTierCount; step += 1) {
    if (worship < threshold) break;
    tier += 1;
    threshold *= 2;
  }
  return tier;
}

/**
 * `worship-yield` magnitudes the universe currently earns.
 *
 * **One contribution per node, not per instance.** Scribing ten copies of a
 * node that carries `worship-yield` is a sensible thing to do for redundancy
 * and must not be a way to multiply favor regeneration ten times — that would
 * be the §6a knowledge loop feeding the §7 worship loop through a door the cap
 * cannot close, since the cap bounds the stack and not the number of sources
 * feeding it.
 */
function yieldSources(knowledge: KnowledgeSubsystem, deps: GodDeps): Fixed[] {
  if (deps.worshipYieldNodes.size === 0) return [];
  const found: Fixed[] = [];
  for (const [nodeId, magnitude] of deps.worshipYieldNodes) {
    if (knowledge.instanceCount(nodeId) > 0) found.push(magnitude);
  }
  return found;
}

function nodesHeldByLivingMages(state: SimState): ReadonlySet<number> {
  const mageStore = componentOf(state, MAGE);
  const held = new Set<number>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.mind && row.locationKind !== LOCATION_KIND.palace) {
      continue;
    }
    const mage = row.locationId as EntityHandle;
    if (!mageStore.has(mage) || mageStore.get(mage, 'alive') === 0) continue;
    held.add(row.nodeId);
  }
  return held;
}

/** The deepest node tier any living mage holds, for `prestigeEarned`. */
function deepestTierHeld(state: SimState, deps: GodDeps): number {
  let deepest = 0;
  for (const nodeId of nodesHeldByLivingMages(state)) {
    const tier = deps.catalog.node(nodeId)?.tier ?? 0;
    if (tier > deepest) deepest = tier;
  }
  return deepest;
}

function countLiving(state: SimState): number {
  let count = 0;
  for (const { row } of collectRecords(state, MAGE)) {
    if (row.alive !== 0) count += 1;
  }
  return count;
}

/**
 * Records what one era boundary found.
 *
 * Its own entity, appended and never rewritten: the Enduring Canon path needs
 * the *sequence* of boundaries, and `libraryDependence` at era 2 is not
 * recoverable from state at era 4. A single rolling counter would decide the
 * path correctly and would leave `ascensionRateByPath` unable to say which
 * boundary a universe failed, at which point a dead path and an unlucky one
 * look identical in the sweep.
 */
function recordEra(
  state: SimState,
  era: number,
  dependence: Fixed,
  nodesLost: number,
  passed: boolean,
): void {
  const handle = state.entities.create();
  attachRecord(state, ERA_EVALUATION, handle, {
    era,
    libraryDependence: dependence,
    nodesLost,
    passed: passed ? 1 : 0,
  });
}
