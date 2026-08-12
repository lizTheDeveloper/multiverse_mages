/*
 * Multiverse Mages — a scripted world over the real §4 observation and action
 * space, for exercising the bot pool.
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
 * ## What this is, and what it is honestly not
 *
 * It is a session whose **interface is the real one** — `OBSERVATION_SIZE`
 * channels laid out at `agent-api`'s block offsets, `ACTION_SPACE_SIZE` mask
 * entries at §4.2's action ids, §4.4 slot indices resolved as slot indices —
 * driven by rules simple enough to read in one sitting. That is exactly what the
 * bot pool needs to be tested against: a strategy is a function of an
 * observation and a mask, so testing one needs an observation and a mask, not a
 * universe.
 *
 * It is **not** the game, and no number produced with it is a balance result.
 * The rules below were chosen to make different strategies produce different
 * worlds, which is the property task 5.10 asks a test to demonstrate; they were
 * not chosen to model anything. `toy-world.ts` says the same thing about the
 * harness's own machinery, and for the same reason: `contracts.md` §5 grants
 * `mc-harness` one edge, to `agent-api`, and building a real `SimState` needs
 * `@mm/content` and `@mm/coordination`, which it may not import. The real
 * executor supplies a real `Scenario` and drives `adaptAgentSession`; that is
 * the one place the swap happens.
 *
 * ## Integer-only, and no clock
 *
 * Not because the harness requires it — the harness is host-side tooling — but
 * because a fixture that was itself irreproducible would make every determinism
 * test in this package prove nothing. The only division is the one on the
 * observation export path, which is where §4.1 puts the one permitted float.
 */

import {
  ACTION_SPACE_SIZE,
  GOD_ACTION,
  OBSERVATION_SIZE,
  observationBlock,
} from '@mm/agent-api';
import type {
  AgentSession,
  MetricEntries,
  Provenance,
  RunOutcome,
  RunTask,
  TerminalStatus,
} from '@mm/mc-harness';
import {
  BOT_POOL_REGISTRY,
  TERMINAL_REASON,
  TOURNAMENT_WORLD_SEED_FACTOR,
  policiesForRun,
  runEpisode,
} from '@mm/mc-harness';

/** §2.1's grid, as this fixture needs it. */
const TECHNIQUES = 5;
const FORMS = 14;
const CELLS = 70;
/** `EDICT_BUDGET_MAX`, which sizes the ruleset block's pair list. */
const EDICTS_MAX = 8;

/** How a scripted episode is configured. */
export interface ScriptedConfig {
  /**
   * Mask every action but `noop`, permanently.
   *
   * Task 5.9's *"a build where every god action is masked out"*. Not a
   * hypothetical: it is what a mask over an unimplemented capability looks
   * like, and `mask.ts`'s engagement branch produces exactly this shape.
   */
  readonly maskEverything?: boolean;
  /** Total knowledge instances at which `declareAscension` succeeds. */
  readonly ascendAt?: number;
  /** Tick at which a universe that has learned nothing gives up. */
  readonly stagnateAt?: number;
}

/** One recorded submission, for the determinism and divergence tests. */
export interface ScriptedSubmission {
  readonly action: number;
  readonly parameter: number | undefined;
  readonly admitted: boolean;
}

const RULESET = observationBlock('ruleset').offset;
const TRADITION = observationBlock('tradition').offset;
const RESOURCES = observationBlock('resources').offset;
const MAGES = observationBlock('mages').offset;
const KNOWLEDGE = observationBlock('knowledge').offset;
const INSTITUTIONS = observationBlock('institutions').offset;
const CLOCK = observationBlock('clock').offset;

/** Clamps an exported channel into §4.1's `[0, 1]`. */
function unit(value: number, saturation: number): number {
  if (value <= 0) return 0;
  return value >= saturation ? 1 : value / saturation;
}

/**
 * A session over the real observation and action space.
 *
 * Every field is an integer, and `submit` is the only mutator.
 */
export class ScriptedSession implements AgentSession<ScriptedConfig> {
  private permittedTechniques = 1;
  private permittedForms = 1;
  private edicts: number[] = [];
  private universities = 0;
  private libraryDepth = 0;
  private grimoires = 0;
  private traditionId = 1;
  private favor = 512;
  private worship = 128;
  private blessings = 0;
  private mages = 4;
  private instances = new Int32Array(CELLS);
  private worldTick = 0;
  private ascended = false;
  private gaveUp = false;

  private ascendAt = 64;
  private stagnateAt = 1_000_000;
  private maskEverything = false;

  private submissions = 0;
  private rejections = 0;
  private byActionId: Record<string, number> = {};
  private log: ScriptedSubmission[] = [];

  private observation = new Float64Array(OBSERVATION_SIZE);
  private observationStale = true;

  reset(runSeed: number, config: ScriptedConfig): void {
    // The seed decides the starting shape of the universe and nothing else, so
    // two strategies on the same seed start from the same world — which is what
    // makes "their final observations differ" a statement about the strategies.
    const seed = runSeed >>> 0;
    this.permittedTechniques = 1 | ((seed >>> 3) & 0b10);
    this.permittedForms = 1;
    this.edicts = [];
    this.universities = 0;
    this.libraryDepth = 0;
    this.grimoires = 0;
    this.traditionId = 1 + (seed % 3);
    this.favor = 256 + (seed % 512);
    this.worship = 64 + (seed % 128);
    this.blessings = 0;
    this.mages = 4 + (seed % 5);
    this.instances = new Int32Array(CELLS);
    this.instances[(seed % CELLS)] = 1;
    this.worldTick = 0;
    this.ascended = false;
    this.gaveUp = false;

    this.ascendAt = config.ascendAt ?? 64;
    this.stagnateAt = config.stagnateAt ?? 1_000_000;
    this.maskEverything = config.maskEverything ?? false;

    this.submissions = 0;
    this.rejections = 0;
    this.byActionId = {};
    this.log = [];
    this.observationStale = true;
  }

  /** Total knowledge instances, the quantity ascension is gated on. */
  totalInstances(): number {
    let total = 0;
    for (let cell = 0; cell < CELLS; cell += 1) total += this.instances[cell] as number;
    return total;
  }

  /** Every submission this episode saw, in order. Reporting only. */
  submissionLog(): readonly ScriptedSubmission[] {
    return this.log;
  }

  observe(): Float64Array {
    if (!this.observationStale) return this.observation;
    const view = new Float64Array(OBSERVATION_SIZE);

    for (let bit = 0; bit < TECHNIQUES; bit += 1) {
      view[RULESET + bit] = (this.permittedTechniques >> bit) & 1;
    }
    for (let bit = 0; bit < FORMS; bit += 1) {
      view[RULESET + TECHNIQUES + bit] = (this.permittedForms >> bit) & 1;
    }
    const pairs = RULESET + TECHNIQUES + FORMS;
    for (let slot = 0; slot < EDICTS_MAX; slot += 1) {
      const cellId = this.edicts[slot];
      view[pairs + slot * 2] = cellId === undefined ? 0 : unit(cellId, CELLS);
      view[pairs + slot * 2 + 1] = cellId === undefined ? 0 : 1;
    }

    view[TRADITION] = unit(this.traditionId, 64);

    view[RESOURCES] = unit(this.favor, 1024);
    view[RESOURCES + 1] = unit(this.worship, 1024);
    view[RESOURCES + 2] = unit(this.blessings, 16);

    view[MAGES] = unit(this.mages, 1024);

    for (let cell = 0; cell < CELLS; cell += 1) {
      const held = this.instances[cell] as number;
      view[KNOWLEDGE + cell * 3] = unit(held, 64);
      view[KNOWLEDGE + cell * 3 + 1] = unit(held === 0 ? 0 : 1 + (held % 7), 7);
      view[KNOWLEDGE + cell * 3 + 2] = unit(held, 512);
    }

    view[INSTITUTIONS] = unit(this.universities, 64);
    view[INSTITUTIONS + 1] = unit(this.universities * 32, 65536);
    view[INSTITUTIONS + 2] = unit(this.libraryDepth, 4096);
    view[INSTITUTIONS + 3] = unit(this.grimoires, 4096);

    view[CLOCK] = unit(this.worldTick, 12000);
    view[CLOCK + 1] = unit(Math.floor(this.worldTick / 240), 50);
    view[CLOCK + 2] = 0;

    this.observation = view;
    this.observationStale = false;
    return view;
  }

  legalActions(): Uint8Array {
    const mask = new Uint8Array(ACTION_SPACE_SIZE);
    mask[GOD_ACTION.noop] = 1;
    if (this.maskEverything || this.status() !== 'running') return mask;

    const allTechniques = (1 << TECHNIQUES) - 1;
    const allForms = (1 << FORMS) - 1;
    mask[GOD_ACTION.permitTechnique] = this.permittedTechniques === allTechniques ? 0 : 1;
    mask[GOD_ACTION.forbidTechnique] = this.permittedTechniques === 0 ? 0 : 1;
    mask[GOD_ACTION.permitForm] = this.permittedForms === allForms ? 0 : 1;
    mask[GOD_ACTION.forbidForm] = this.permittedForms === 0 ? 0 : 1;

    const canIssue = this.edicts.length < EDICTS_MAX ? 1 : 0;
    mask[GOD_ACTION.issueDispensation] = canIssue;
    mask[GOD_ACTION.issueInterdiction] = canIssue;
    mask[GOD_ACTION.revokeEdict] = this.edicts.length > 0 ? 1 : 0;

    mask[GOD_ACTION.grantFoundingKnowledge] = 1;
    mask[GOD_ACTION.blessMage] = 1;
    mask[GOD_ACTION.assignRole] = 1;
    mask[GOD_ACTION.fundUniversity] = 1;
    mask[GOD_ACTION.encourageResearch] = 1;
    mask[GOD_ACTION.changeTradition] = 1;
    // Action 14 has no candidates in a single-universe run, exactly as
    // `candidates.ts` describes. Left masked so the fixture agrees with the
    // build the pool is actually specified against.
    mask[GOD_ACTION.openPortal] = 0;
    // Eligibility, and the mask follows it. `mask.ts` clears action 15 unless
    // the god-state row's `ascensionPath` has left `none`; the equivalent fact
    // here is the knowledge threshold below. The fixture used to leave the
    // action legal from tick zero and refuse it on application, which was the
    // *previous* build's mask and disagreed with the one the pool now plays
    // against — a strategy whose ascension stance is "declare on the first
    // permitted round" would have declared on round zero, forever, and every
    // divergence test in this package would have been measuring that instead.
    mask[GOD_ACTION.declareAscension] = this.totalInstances() >= this.ascendAt ? 1 : 0;
    return mask;
  }

  submit(actionId: number, parameter?: number): void {
    if (this.status() !== 'running') {
      throw new Error('submit() on a terminated session.');
    }
    this.submissions += 1;
    const mask = this.legalActions();
    if (mask[actionId] !== 1) {
      this.rejections += 1;
      const key = String(actionId);
      this.byActionId[key] = (this.byActionId[key] ?? 0) + 1;
      this.log.push({ action: actionId, parameter, admitted: false });
      this.worldTick += 1;
      this.observationStale = true;
      return;
    }
    this.log.push({ action: actionId, parameter, admitted: true });
    this.apply(actionId, parameter ?? 0);
    this.worldTick += 1;
    this.observationStale = true;
    if (this.worldTick >= this.stagnateAt && this.totalInstances() <= 1) this.gaveUp = true;
  }

  private apply(actionId: number, parameter: number): void {
    switch (actionId) {
      case GOD_ACTION.permitTechnique:
        this.permittedTechniques |= 1 << (parameter % TECHNIQUES);
        break;
      case GOD_ACTION.forbidTechnique:
        this.permittedTechniques &= ~(1 << (parameter % TECHNIQUES));
        break;
      case GOD_ACTION.permitForm:
        this.permittedForms |= 1 << (parameter % FORMS);
        break;
      case GOD_ACTION.forbidForm:
        this.permittedForms &= ~(1 << (parameter % FORMS));
        break;
      case GOD_ACTION.issueDispensation:
      case GOD_ACTION.issueInterdiction:
        this.edicts.push(1 + (parameter % CELLS));
        break;
      case GOD_ACTION.revokeEdict:
        this.edicts.splice(parameter % Math.max(1, this.edicts.length), 1);
        break;
      case GOD_ACTION.grantFoundingKnowledge: {
        const cell = parameter % CELLS;
        this.instances[cell] = (this.instances[cell] as number) + 1;
        this.grimoires += 1;
        break;
      }
      case GOD_ACTION.blessMage:
        this.blessings += 1;
        this.favor = Math.max(0, this.favor - 4);
        this.worship += 2;
        break;
      case GOD_ACTION.assignRole:
        this.mages += parameter % 2;
        break;
      case GOD_ACTION.fundUniversity:
        if (parameter === 0) this.universities += 1;
        else this.libraryDepth += 2;
        break;
      case GOD_ACTION.encourageResearch: {
        // Slot 0 is the deepest permitted cell, so `narrow-depth` taking slot 0
        // every round compounds while `permissive-breadth` rotating spreads.
        const cell = parameter === 0 ? this.deepestCell() : (this.deepestCell() + parameter) % CELLS;
        this.instances[cell] = (this.instances[cell] as number) + 2;
        break;
      }
      case GOD_ACTION.changeTradition:
        this.traditionId = 1 + ((this.traditionId + parameter) % 3);
        break;
      case GOD_ACTION.declareAscension:
        // Re-checked rather than trusted, exactly as `interventions.ts`
        // re-checks the god-state row it was masked on: the mask is advisory
        // and structural, and the dispatch is authoritative.
        if (this.totalInstances() >= this.ascendAt) this.ascended = true;
        break;
      default:
        break;
    }
  }

  private deepestCell(): number {
    let best = 0;
    for (let cell = 1; cell < CELLS; cell += 1) {
      if ((this.instances[cell] as number) > (this.instances[best] as number)) best = cell;
    }
    return best;
  }

  status(): TerminalStatus {
    if (this.ascended) return 'ascended';
    if (this.gaveUp) return 'stagnated';
    return 'running';
  }

  /**
   * §1.1's ending. The scripted world models one summit, reached by depth, so
   * it reports `ascensionApotheosis`.
   */
  terminalReason(): number {
    if (this.ascended) return TERMINAL_REASON.ascensionApotheosis;
    if (this.gaveUp) return TERMINAL_REASON.stagnation;
    return TERMINAL_REASON.none;
  }

  accounting(): { submissions: number; rejections: number; byActionId: Record<string, number> } {
    const sorted: Record<string, number> = {};
    for (const key of Object.keys(this.byActionId).sort((a, b) => Number(a) - Number(b))) {
      sorted[key] = this.byActionId[key] as number;
    }
    return { submissions: this.submissions, rejections: this.rejections, byActionId: sorted };
  }
}

/** The provenance every scripted run reports. Fixed, so records agree. */
export const SCRIPTED_PROVENANCE: Provenance = {
  buildVersion: 'mc-harness-bots-0',
  contentHash: 'scripted-content-0',
  rngRegistryHash: 'scripted-rng-registry-0',
  observationSchemaVersion: 1,
  observationLayoutDigest: 'scripted-layout-0',
  metricDefinitionVersions: { toyTicks: 1 },
};

/**
 * A run executor over the scripted world, wired the way a tournament wants it.
 *
 * The one line worth reading twice is the split: **the world is built from the
 * `worldSeed` factor level and the policies are seeded from the derived run
 * seed.** That is what common random numbers means here — every pairing plays
 * the same worlds, and each run's agent-side tie-breaking is its own. A caller
 * that reset the session from `task.runSeed` instead would get a tournament
 * with no variance reduction and no error anywhere, which is why
 * `tournament.ts` documents the split rather than leaving it to be inferred.
 */
export function makeScriptedExecutor(
  config: ScriptedConfig = {},
): (task: RunTask) => RunOutcome {
  return (task: RunTask): RunOutcome => {
    const worldSeed = Number(task.levels[TOURNAMENT_WORLD_SEED_FACTOR] ?? task.runSeed);
    const session = new ScriptedSession();
    const outcome = runEpisode({
      session,
      runSeed: worldSeed,
      scenarioConfig: config,
      policies: policiesForRun({
        registry: BOT_POOL_REGISTRY,
        strategies: task.strategies,
        runSeed: task.runSeed,
      }),
      worldTickCap: task.worldTickCap,
    });

    const available: MetricEntries = { toyTicks: { status: 'measured', value: outcome.ticksRun } };
    const metrics: Record<string, MetricEntries[string]> = {};
    for (const metricId of task.metrics) {
      const entry = available[metricId];
      if (entry !== undefined) metrics[metricId] = entry;
    }

    return {
      status: outcome.status,
      ticksRun: outcome.ticksRun,
      metrics,
      accounting: outcome.accounting,
      provenance: SCRIPTED_PROVENANCE,
    };
  };
}
