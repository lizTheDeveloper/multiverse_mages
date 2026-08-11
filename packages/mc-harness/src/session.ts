/*
 * Multiverse Mages — the agent-session surface the harness drives, and the
 * episode loop that enforces the world-tick cap.
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
 * Task 3.6, and the harness's half of the `agent-api` boundary.
 *
 * ## This interface is written from the harness's side, on purpose
 *
 * Task group 2 implements the episode session inside `packages/agent-api` —
 * `reset`, `observe`, `legalActions`, `submit`, `status`, and the illegal-action
 * accounting. That work is in flight in parallel with this file. Rather than
 * block on it, or worse, guess at its import names and produce a package that
 * does not typecheck, the harness declares the **structural** surface it needs
 * and drives anything that satisfies it.
 *
 * The assumption is therefore explicit and small, and it is written here so that
 * reconciling the two is a diff rather than an archaeology exercise:
 *
 * - `reset(runSeed, scenarioConfig)` starts a fresh episode; nothing carries
 *   over from a previous one.
 * - `observe()` returns the normalized observation. Typed as `Float64Array`,
 *   which `contracts.md` §4.1 and the change proposal both pin.
 * - `legalActions()` returns the legality mask, one entry per action id.
 * - `submit(actionId)` offers one action and raises on a terminated session.
 * - `status()` returns `running` until the episode ends, then one of the
 *   terminal statuses.
 * - `accounting()` reports total submissions, rejections, and the per-action-id
 *   breakdown, readable at episode end.
 *
 * Nothing here mentions reward, return, score, or fitness, and nothing should:
 * §4.3 puts the objective in the training loop, not in the game.
 *
 * ## Why the cap lives in the harness rather than in the session
 *
 * The capability spec requires the harness to enforce a declared world-tick cap
 * *in addition to* the simulation's own terminal conditions. Putting it here
 * rather than inside the session is what makes that "in addition": a session
 * that never terminates is a bug the harness must survive, and a cap
 * administered by the thing being capped cannot catch it.
 */

/** How an episode ended. `failed` is the harness's, not the session's. */
export const TERMINAL_STATUS = {
  running: 'running',
  ascended: 'ascended',
  stagnated: 'stagnated',
  truncated: 'truncated',
  /** Recorded by the harness when a run threw, timed out, or lost its worker. */
  failed: 'failed',
} as const;

/** Any status from {@link TERMINAL_STATUS}. */
export type TerminalStatus = (typeof TERMINAL_STATUS)[keyof typeof TERMINAL_STATUS];

/** The statuses a *completed* run may carry. `running` is not one of them. */
export const RECORDED_STATUSES: readonly TerminalStatus[] = [
  TERMINAL_STATUS.ascended,
  TERMINAL_STATUS.stagnated,
  TERMINAL_STATUS.truncated,
  TERMINAL_STATUS.failed,
];

/** Illegal-action accounting, as task 2.3 requires it to be readable. */
export interface IllegalActionAccounting {
  readonly submissions: number;
  readonly rejections: number;
  /** Rejections keyed by action id, as a string so it survives JSON. */
  readonly byActionId: Readonly<Record<string, number>>;
}

/**
 * The episode surface the harness drives. Satisfied by `agent-api`'s session.
 *
 * @typeParam TConfig - The scenario configuration a `reset` accepts. The harness
 * builds it from the sweep's factor levels and never inspects it.
 */
export interface AgentSession<TConfig = unknown> {
  reset(runSeed: number, scenarioConfig: TConfig): void;
  observe(): Float64Array;
  legalActions(): Uint8Array;
  submit(actionId: number): void;
  status(): TerminalStatus;
  accounting(): IllegalActionAccounting;
}

/**
 * A scripted strategy's decision, as the harness needs it.
 *
 * Deliberately not `agent-api`'s policy type: task group 5 owns the strategy
 * registry, and until it lands the harness needs only "given an observation and
 * a mask, name an action". A strategy that returns an action the mask forbids is
 * the session's problem to reject and the accounting's problem to count — the
 * loop below does not second-guess it, because filtering here would hide exactly
 * the `illegalActionRate` signal §7 asks for.
 */
export type SlotPolicy = (observation: Float64Array, mask: Uint8Array, slot: number) => number;

/** What one episode did. Everything here is reproducible from the run seed. */
export interface EpisodeOutcome {
  readonly status: TerminalStatus;
  /** World ticks actually stepped. Feeds the recorded throughput figure. */
  readonly ticksRun: number;
  readonly accounting: IllegalActionAccounting;
}

/** Everything {@link runEpisode} needs. */
export interface EpisodeInput<TConfig = unknown> {
  readonly session: AgentSession<TConfig>;
  readonly runSeed: number;
  readonly scenarioConfig: TConfig;
  /** One policy per agent slot, in slot order. */
  readonly policies: readonly SlotPolicy[];
  /** Task 3.6: the declared cap, enforced here. */
  readonly worldTickCap: number;
}

/**
 * Runs one episode to a terminal status.
 *
 * The loop is the whole of the harness's contact with the simulation, and it is
 * short on purpose. Three properties it must have, each of which is one line and
 * each of which would be missed by a plausible alternative:
 *
 * 1. **The cap is a `truncated` status, not an exception.** A run that reaches
 *    the cap is a data point about a universe that did not resolve, and
 *    `design.md` requires it to stay in the denominator of every rate. Throwing
 *    would put it in the `failed` bucket, where it would be excluded, and
 *    `ascensionRate` would then be computed over a population selected on the
 *    outcome it measures.
 * 2. **A session that terminates before the first submission is honoured.** The
 *    status is read before the loop, not after, so a scenario that is over at
 *    tick zero records zero ticks rather than one.
 * 3. **Every slot submits every tick, in slot order, until the episode ends.**
 *    Fixed order, because the order two agents act in is a rule of the game and
 *    not a scheduling detail — and the loop stops mid-tick when a submission
 *    terminates the session, because task 2.2 requires `submit` on a terminated
 *    session to raise. Without the guard, a two-slot episode that ended on slot
 *    zero's action would throw out of the *harness*, and a legitimate ascension
 *    would be recorded as a `failed` run.
 *
 * @throws Error if the session is still `running` after the cap, which cannot
 * happen — the cap forces `truncated` — or if a policy names a non-integer
 * action, which is a strategy bug worth failing the run over rather than
 * silently coercing.
 */
export function runEpisode<TConfig>(input: EpisodeInput<TConfig>): EpisodeOutcome {
  const { session, runSeed, scenarioConfig, policies, worldTickCap } = input;
  session.reset(runSeed, scenarioConfig);

  let ticksRun = 0;
  while (session.status() === TERMINAL_STATUS.running) {
    if (ticksRun >= worldTickCap) {
      return {
        status: TERMINAL_STATUS.truncated,
        ticksRun,
        accounting: session.accounting(),
      };
    }
    const observation = session.observe();
    const mask = session.legalActions();
    for (let slot = 0; slot < policies.length; slot += 1) {
      const policy = policies[slot] as SlotPolicy;
      const actionId = policy(observation, mask, slot);
      if (!Number.isInteger(actionId)) {
        throw new Error(
          `Policy for slot ${String(slot)} returned ${String(actionId)}, which is not an action id.`,
        );
      }
      session.submit(actionId);
      if (session.status() !== TERMINAL_STATUS.running) break;
    }
    ticksRun += 1;
  }

  return { status: session.status(), ticksRun, accounting: session.accounting() };
}
