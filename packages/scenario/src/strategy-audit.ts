/*
 * Multiverse Mages — the shadowing audit: which verbs a strategy asks for, and
 * which ones its own preference order never lets it reach.
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
 * ## Two incidents make a class
 *
 * `policyFor` submits the **first** preference the mask permits. That one line
 * is task 5.6 and it is correct; what it also is, is a silent shadowing
 * mechanism. A verb sitting behind an always-legal verb in the same list is
 * never submitted, in any run, on any seed — and nothing in the pool says so.
 *
 * It has now happened twice, and both times it was found by hand:
 *
 * - **`permissive-breadth`** listed `fundUniversity` behind `permitTechnique`,
 *   which is legal on essentially every tick. The strategy whose stated role is
 *   *"funds broadly"* founded no university in any run of any sweep ever taken.
 *   (Fixed on `w73/pool-build-order`.)
 * - **`narrow-depth`** lists `grantFoundingKnowledge` on every tick of every run
 *   and never once submits it, because `encourageResearch` sits ahead of it.
 *
 * `degeneracyOf` in `@mm/mc-harness` already answers the neighbouring question
 * — *"is any signature verb legal at all?"* — from a single mask. It cannot see
 * this one, because a shadowed verb **is** legal; it is legal and unasked. The
 * difference is the preference list, and the preference list is only observable
 * by running the strategy.
 *
 * So this module runs each strategy against the reference universe and counts,
 * per verb, four numbers that are four different questions:
 *
 * | column | question |
 * | --- | --- |
 * | `ticksLegal` | did the **mask** permit it? |
 * | `timesListed` | did the **strategy** ask for it? |
 * | `timesSubmitted` | did the **fall-through** reach it? |
 * | `timesApplied` | did the **rules** resolve it? |
 *
 * Every failure mode this audit exists to name is a disagreement between two of
 * them, and {@link VERB_VERDICT} is the four-way reading of the first three. The
 * fourth is not a verdict and is reported raw: a verb submitted often and
 * applied never is the *other* half of this campaign's defect class — the mask
 * and the rules disagreeing — and it is not this check's job to adjudicate it.
 *
 * ## Why the union of listed and signature, and not `signatureActions` alone
 *
 * `signatureActions` is a **declaration**: the verbs without which a strategy is
 * not itself. It is the right list for `degeneracyOf`, whose question is whether
 * a strategy has become a second copy of the passive control.
 *
 * It is the wrong list here, and `narrow-depth` is the proof: the incident that
 * motivated this audit is `grantFoundingKnowledge`, and `narrow-depth` does not
 * declare that verb as a signature action. A signature-only audit reports
 * `narrow-depth` clean while the defect it was written to find sits in its
 * preference list. So the audited set is the **union** of the declared signature
 * and every verb the strategy actually emitted during the run: a verb it wrote
 * down is a verb it meant to use, whether or not it called it load-bearing.
 *
 * ## Why this is not a `degeneracyOf` overload
 *
 * `degeneracyOf` takes a mask. This takes a universe, because *listed* and
 * *submitted* are properties of a strategy in motion. §5 does not grant
 * `mc-harness` an edge to `@mm/scenario` and must not — the harness has to be
 * able to run somebody else's scenario — so the audit lives on the composition
 * root's side of that edge, in the one package that may hold both.
 *
 * ## The instrumented policy is `policyFor`, not a re-implementation of it
 *
 * {@link auditPolicy} walks {@link effectivePreferences} exactly as `policyFor`
 * does: one call per round, same arguments, same first-legal rule, same `noop`
 * fall-back. It has to be the same walk rather than a similar one — several of
 * these strategies draw randomness inside `preferences`, so a second, tallying
 * call would advance the agent generator and produce a different run than the
 * one being audited.
 *
 * {@link StrategyAudit.snapshotHash} is what holds that claim to account, and
 * `strategy-shadowing.test.ts` asserts it: an audited run and a `policyFor` run
 * at the same coordinates must agree on the final snapshot hash. If they ever
 * disagree, the numbers here describe a universe nobody plays.
 */

import type { SlotPolicy, StrategyContext, StrategyDefinition } from '@mm/mc-harness';
import {
  BOT_POOL_REGISTRY,
  adaptAgentSession,
  effectivePreferences,
  runEpisode,
} from '@mm/mc-harness';
import { ACTION_SPACE_SIZE, agentRng, createSession, isLegal } from '@mm/agent-api';

import type { ReferenceContent } from './reference-universe.js';
import { referenceContent, referenceScenario } from './reference-universe.js';

/** What the three counts say about one verb of one strategy. */
export const VERB_VERDICT = {
  /** Legal, listed, and submitted at least once. The strategy uses its verb. */
  exercised: 'exercised',
  /**
   * Legal on some tick, listed on some tick, submitted never.
   *
   * The defect this module is named for: the mask offered it, the strategy
   * asked for it, and something ahead of it in the same list was legal every
   * time. Nothing else in the build reports this.
   */
  shadowed: 'shadowed',
  /**
   * Legal, and the strategy never even listed it.
   *
   * Not the same defect and not always a defect at all: a verb behind a
   * conditional (`worship-maximizer` lists `blessMage` only while `worship <
   * favor`) is correctly absent on a run where the condition never held. It is
   * reported because a guard that never fires in any run is indistinguishable
   * from a verb the strategy does not have, and that distinction is the whole
   * value of a signature declaration.
   */
  neverListed: 'never-listed',
  /**
   * Never legal on any tick of the run. The mask, not the preference order.
   *
   * `openPortal` in a single-universe run is the standing example, and
   * `POOL_BUILD_LIMITS['open-portal']` is where that is argued. Reported so that
   * a masked verb is never mistaken for a shadowed one — the fixes are opposite.
   */
  unreachable: 'unreachable',
} as const;

/** Any verdict from {@link VERB_VERDICT}. */
export type VerbVerdict = (typeof VERB_VERDICT)[keyof typeof VERB_VERDICT];

/** One strategy's use of one verb over one run. */
export interface VerbAudit {
  readonly strategyId: string;
  /** `contracts.md` §4.2 action id. */
  readonly action: number;
  /** Whether the strategy declares this verb in `signatureActions`. */
  readonly signature: boolean;
  /** Ticks on which the legality mask permitted it. */
  readonly ticksLegal: number;
  /** Ticks on which the strategy's effective preference list named it. */
  readonly timesListed: number;
  /** Ticks on which the fall-through actually submitted it. */
  readonly timesSubmitted: number;
  /** Ticks on which the rules resolved it — favor spent, effect applied. */
  readonly timesApplied: number;
  readonly verdict: VerbVerdict;
}

/** Everything one audited run found. */
export interface StrategyAudit {
  readonly strategyId: string;
  /** Ticks the episode ran, which is how many times the policy was asked. */
  readonly ticks: number;
  /** `contracts.md` §1.1's ending, or `0` for a run the cap stopped. */
  readonly terminalReason: number;
  /**
   * The session's final snapshot hash.
   *
   * Carried so that the audited run can be compared against a `policyFor` run
   * at the same coordinates. That comparison is the only thing standing between
   * this module and a set of numbers describing a universe nobody plays — see
   * the module note on why the walk is `policyFor`'s and not a copy of it.
   */
  readonly snapshotHash: string;
  /** One row per verb in `signatureActions ∪ {verbs the run listed}`, ascending. */
  readonly verbs: readonly VerbAudit[];
  /** Rows whose verdict is {@link VERB_VERDICT.shadowed}, for the caller's convenience. */
  readonly shadowed: readonly VerbAudit[];
}

/** How an audit run is configured. */
export interface StrategyAuditOptions {
  /** Resolved content. Defaults to the shipped reference content. */
  readonly content?: ReferenceContent;
  /** The run seed. One seed is enough — shadowing is an ordering fact, not a sample. */
  readonly runSeed?: number;
  /** World ticks to run. */
  readonly worldTickCap?: number;
  /** Starting-position options, as `referenceOptions` reads them. */
  readonly options?: Readonly<Record<string, number>>;
}

/**
 * The audit's default seed and horizon.
 *
 * 600 ticks rather than the sweeps' 2400. Shadowing is a property of a
 * preference list against a mask, and a verb that is going to be shadowed is
 * shadowed from the first tick — the two known incidents were both visible
 * inside the first era. The horizon buys coverage of *masks that change*: the
 * ruleset opens, universities appear, the edict budget fills. Four eras of that
 * is enough to move every mask condition the pool's verbs depend on, at a
 * quarter of the cost of a sweep run.
 */
export const AUDIT_WORLD_TICK_CAP = 600;

/** The seed every audit run uses unless a caller names another. */
export const AUDIT_RUN_SEED = 20260813;

/** Mutable tallies for one run, one entry per action id. */
interface Counters {
  readonly legal: Int32Array;
  readonly listed: Int32Array;
  readonly submitted: Int32Array;
  readonly applied: Int32Array;
}

function counters(): Counters {
  return {
    legal: new Int32Array(ACTION_SPACE_SIZE),
    listed: new Int32Array(ACTION_SPACE_SIZE),
    submitted: new Int32Array(ACTION_SPACE_SIZE),
    applied: new Int32Array(ACTION_SPACE_SIZE),
  };
}

/**
 * `policyFor`'s walk, with a tally around each of its observable events.
 *
 * Module-private: it takes a mutable counter block, and a caller holding one of
 * those could report a tally over two runs as though it were one. The property
 * that matters — that this walk is `policyFor`'s walk — is asserted through
 * {@link StrategyAudit.snapshotHash} instead, which is a claim about the
 * universe rather than about the shape of the closure.
 *
 * Nothing here decides anything: the returned submission is the one `policyFor`
 * would have returned for the same `(observation, mask, round)`.
 */
function auditPolicy(
  definition: StrategyDefinition,
  context: StrategyContext,
  into: Counters,
): SlotPolicy {
  let round = 0;
  return (observation: Float64Array, mask: Uint8Array) => {
    for (let action = 0; action < ACTION_SPACE_SIZE; action += 1) {
      if (isLegal(mask, action)) into.legal[action] = (into.legal[action] ?? 0) + 1;
    }

    const preferences = effectivePreferences(definition, { observation, mask, round, context });
    round += 1;

    // Listed is per *tick*, not per entry: a strategy that names one verb twice
    // in one list has still asked for it once on that tick, and counting the
    // entries would make a duplicated line look like twice the demand.
    const listedHere = new Set<number>();
    for (const preference of preferences) listedHere.add(preference.action);
    for (const action of listedHere) into.listed[action] = (into.listed[action] ?? 0) + 1;

    for (const preference of preferences) {
      if (isLegal(mask, preference.action)) {
        into.submitted[preference.action] = (into.submitted[preference.action] ?? 0) + 1;
        return preference;
      }
    }
    into.submitted[0] = (into.submitted[0] ?? 0) + 1;
    return { action: 0 };
  };
}

function verdictOf(row: {
  ticksLegal: number;
  timesListed: number;
  timesSubmitted: number;
}): VerbVerdict {
  if (row.timesSubmitted > 0) return VERB_VERDICT.exercised;
  if (row.ticksLegal === 0) return VERB_VERDICT.unreachable;
  if (row.timesListed === 0) return VERB_VERDICT.neverListed;
  return VERB_VERDICT.shadowed;
}

/** Audits one strategy over one reference run. */
export function auditStrategy(
  definition: StrategyDefinition,
  options: StrategyAuditOptions = {},
): StrategyAudit {
  const content = options.content ?? referenceContent();
  const runSeed = options.runSeed ?? AUDIT_RUN_SEED;
  const worldTickCap = options.worldTickCap ?? AUDIT_WORLD_TICK_CAP;

  const { scenario, lastGodReport } = referenceScenario(content);
  const raw = createSession({ scenario, agentSlotIndex: 0, strategyId: definition.strategyId });
  const session = adaptAgentSession(raw);

  const into = counters();
  const context = {
    runSeed,
    agentSlotIndex: 0,
    rng: agentRng({ runSeed, agentSlotIndex: 0, strategyId: definition.strategyId }),
  };

  // The applied side is read off the god's own tick report rather than inferred
  // from state. `spentByAction` gets a key only when a plan validated and paid,
  // so its presence is the rules layer saying *"this one resolved"* — which is
  // exactly the half of the story the submitted count cannot tell, and the half
  // that made action 8 look busy while it did nothing.
  let seenTick = -1;
  const drainReport = (): void => {
    const report = lastGodReport();
    if (report === undefined || report.worldTick === seenTick) return;
    seenTick = report.worldTick;
    for (const key of Object.keys(report.interventions.spentByAction)) {
      const action = Number(key);
      if (Number.isInteger(action) && action >= 0 && action < ACTION_SPACE_SIZE) {
        into.applied[action] = (into.applied[action] ?? 0) + 1;
      }
    }
  };

  const tallying = auditPolicy(definition, context, into);
  const policy: SlotPolicy = (observation, mask, slot) => {
    // Called before this tick's step, so the report it drains is the previous
    // tick's. The final tick is drained after the episode, below.
    drainReport();
    return tallying(observation, mask, slot);
  };

  const episode = runEpisode({
    session,
    runSeed,
    scenarioConfig: { worldTickCap, options: options.options ?? {} },
    policies: [policy],
    worldTickCap,
  });
  drainReport();

  const audited = new Set<number>(definition.signatureActions);
  for (let action = 0; action < ACTION_SPACE_SIZE; action += 1) {
    if ((into.listed[action] ?? 0) > 0) audited.add(action);
  }

  const verbs = [...audited]
    .sort((a, b) => a - b)
    .map((action) => {
      const row = {
        ticksLegal: into.legal[action] ?? 0,
        timesListed: into.listed[action] ?? 0,
        timesSubmitted: into.submitted[action] ?? 0,
      };
      return Object.freeze({
        strategyId: definition.strategyId,
        action,
        signature: definition.signatureActions.includes(action),
        ...row,
        timesApplied: into.applied[action] ?? 0,
        verdict: verdictOf(row),
      });
    });

  return Object.freeze({
    strategyId: definition.strategyId,
    ticks: episode.ticksRun,
    terminalReason: episode.terminalReason,
    snapshotHash: raw.snapshotHash(),
    verbs: Object.freeze(verbs),
    shadowed: Object.freeze(verbs.filter((verb) => verb.verdict === VERB_VERDICT.shadowed)),
  });
}

/** Audits the whole shipped pool, in registration order. */
export function auditPool(options: StrategyAuditOptions = {}): readonly StrategyAudit[] {
  const content = options.content ?? referenceContent();
  return BOT_POOL_REGISTRY.definitions.map((definition) =>
    auditStrategy(definition, { ...options, content }),
  );
}

/** §4.2's action names, for a table a human reads. */
const ACTION_NAMES: readonly string[] = Object.freeze([
  'noop',
  'permitTechnique',
  'forbidTechnique',
  'permitForm',
  'forbidForm',
  'issueDispensation',
  'issueInterdiction',
  'revokeEdict',
  'grantFoundingKnowledge',
  'blessMage',
  'assignRole',
  'fundUniversity',
  'encourageResearch',
  'changeTradition',
  'openPortal',
  'declareAscension',
]);

/** The name of a §4.2 action id, or the id itself for one nobody named. */
export function actionName(action: number): string {
  return ACTION_NAMES[action] ?? `action-${String(action)}`;
}

/** The audit as a fixed-width table. One line per verb, plus a header. */
export function formatAudit(audits: readonly StrategyAudit[]): string {
  const rows: string[][] = [
    ['strategy', 'verb', 'sig', 'legal', 'listed', 'submitted', 'applied', 'verdict'],
  ];
  for (const audit of audits) {
    for (const verb of audit.verbs) {
      rows.push([
        audit.strategyId,
        `${String(verb.action)} ${actionName(verb.action)}`,
        verb.signature ? 'yes' : '-',
        `${String(verb.ticksLegal)}/${String(audit.ticks)}`,
        String(verb.timesListed),
        String(verb.timesSubmitted),
        String(verb.timesApplied),
        verb.verdict,
      ]);
    }
  }

  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? '').length)),
  ) ?? [];
  return rows
    .map((row) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ').trimEnd())
    .join('\n');
}
