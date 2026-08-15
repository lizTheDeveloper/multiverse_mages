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
 * ## This interface was written from the harness's side, and has now been
 * reconciled with the session that landed next door
 *
 * The harness was built while task group 2's session was still in flight, so it
 * declared the **structural** surface it needed and drove anything that
 * satisfied it. Both halves now exist, and {@link adaptAgentSession} is the
 * reconciliation. It is nine lines of body, which was the bet the original note
 * made; what follows is the list of what the two sides actually disagreed
 * about, because "it was thin" is only useful to a later reader if the seams
 * are named.
 *
 * 1. **`submit` takes an `Action`, not an action id.** `agent-api`'s session
 *    takes `{kind, params}` and resolves `params[0]` against §4.4's candidate
 *    list. The harness passed a bare integer, which cannot address a
 *    parameterized action at all — a policy could name `blessMage` but not
 *    *which* mage. Fixed here rather than there: {@link ActionSubmission} adds
 *    one optional `parameter` field, and {@link SlotPolicy} may return either
 *    an id or a submission.
 * 2. **`accounting()` disagreed on three key names.** `submitted`/`rejected`/
 *    `rejectedByAction` against `submissions`/`rejections`/`byActionId`. The
 *    harness's names are the ones already in every written run record
 *    (`records.ts`), so the adapter renames rather than the record format
 *    moving — a stored record's key set is a compatibility surface and the
 *    session's is not.
 * 3. **`reset` returns the first observation; the harness ignores it.** Not a
 *    conflict: a function returning a value satisfies a `void` return position.
 * 4. **`status()` is narrower on the session's side.** `agent-api` has four
 *    statuses and the harness has five, the extra one being `failed`, which is
 *    the harness's own verdict about a run that threw. A session can never
 *    report it, and that asymmetry is correct.
 *
 * The one thing the adapter cannot paper over is stated on
 * {@link EpisodeInput.worldTickCap}: `agent-api`'s `submit` advances one world
 * tick per submission, so an *n*-slot episode advances *n* world ticks per loop
 * iteration.
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
 *
 * **That decision still holds after reconciliation, and is now load-bearing for
 * a second reason.** `agent-api`'s session does have a cap of its own, in
 * `ScenarioConfig.worldTickCap`, and it fires first for a single-slot episode.
 * But it is enforced by reading `state.clock.worldTick`, so it protects against
 * a *simulation* that will not terminate and not against a *session* that will
 * not — one whose clock never advances, or whose `status()` never leaves
 * `running`, reaches the session's cap never and the harness's cap always. Two
 * caps is not redundancy here; they catch different failures.
 */

import type { CandidateLists } from '@mm/agent-api';
import { TERMINAL_REASON } from '@mm/agent-api';

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

/**
 * `contracts.md` §1.1's endings, by name, for keying a report a human reads.
 *
 * Derived from `agent-api`'s re-export of the enum `god-agency` actually
 * writes, not transcribed — the numbering is §1.1's and this file is not
 * entitled to a second opinion about it. The names are the same identifiers the
 * enum uses, so a route named in a summary file and a route named in the
 * dispatch are the same word.
 */
export const TERMINAL_REASON_NAME: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(Object.entries(TERMINAL_REASON).map(([name, value]) => [value, name])),
);

/**
 * A reason's name, or an explicit unknown for a number this build has no name
 * for.
 *
 * A record written by a later build carrying a sixth ending must aggregate
 * rather than throw — a reader in 2031 with a file from 2032 gets
 * `unknown-5` and a count, which is a worse answer than the name and a far
 * better one than a crash or a silent fold into `none`.
 */
export function terminalReasonName(reason: number): string {
  return TERMINAL_REASON_NAME[reason] ?? `unknown-${String(reason)}`;
}

/** Illegal-action accounting, as task 2.3 requires it to be readable. */
export interface IllegalActionAccounting {
  readonly submissions: number;
  readonly rejections: number;
  /** Rejections keyed by action id, as a string so it survives JSON. */
  readonly byActionId: Readonly<Record<string, number>>;
}

/**
 * The episode surface the harness drives. Satisfied by `agent-api`'s session
 * through {@link adaptAgentSession}.
 *
 * @typeParam TConfig - The scenario configuration a `reset` accepts. The harness
 * builds it from the sweep's factor levels and never inspects it.
 */
export interface AgentSession<TConfig = unknown> {
  reset(runSeed: number, scenarioConfig: TConfig): void;
  observe(): Float64Array;
  legalActions(): Uint8Array;
  /**
   * §4.4's slot-indexed candidate lists, for the parameterized actions.
   *
   * Forwarded because the mask is **per-kind** — `legalActions()` says whether
   * an action has any target at all, never how many — and a strategy that picks
   * a slot index without this is guessing against `candidateSlotCount`'s
   * declared constant. Measured 2026-08-15: `portal-rush` was refused on 48% of
   * its submissions and `worship-maximizer` on 20%, both entirely on their own
   * signature verb, because the declared count outruns the live list. The
   * information was on the session all along; this adapter simply did not carry
   * it across. See `docs/design/campaign-plan.md` W240.
   */
  candidates(): CandidateLists;
  /**
   * Offers one action, and raises only on a *terminated* session.
   *
   * An illegal action is not an error: §4.2 makes it a no-op and a counter
   * increment, and {@link IllegalActionAccounting} is where it lands.
   *
   * @param actionId - An id from §4.2's table.
   * @param parameter - The action's single parameter, when it has one. See
   * {@link ActionSubmission.parameter} for what the number means, which differs
   * between the parameterized actions and the rest.
   */
  submit(actionId: number, parameter?: number): void;
  status(): TerminalStatus;
  /**
   * §1.1's ending, as a {@link TERMINAL_REASON} number.
   *
   * Beside {@link AgentSession.status} rather than instead of it, because the
   * two answer different questions and one of them is lossy. `status()` folds
   * `ascensionApotheosis` and `ascensionCanon` into a single `'ascended'` —
   * `agent-api`'s session does the folding and it is right to, because a status
   * is what an episode loop branches on. But a sweep that recorded only the
   * status could not say which summit a universe took, and route share had to
   * be inferred from when the ascensions clustered in time.
   *
   * `TERMINAL_REASON.none` while the run is live, and also for a run the
   * *harness* truncated at its own cap: the universe did not end, the harness
   * stopped asking. §1.1's `truncated` is the simulation's own truncation and
   * stays distinct from it.
   */
  terminalReason(): number;
  accounting(): IllegalActionAccounting;
}

/**
 * One action a policy names, with its parameter.
 *
 * `parameter` means two different things depending on the action, because
 * `contracts.md` §4.2 and §4.4 make it mean two different things:
 *
 * - For the **parameterized actions** (8–14) it is a §4.4 **candidate slot
 *   index**, resolved against the current tick's list at submission. Slot 3 of
 *   `blessMage` is "the fourth most depleted living mage", not mage 3.
 * - For **1–7** it is the action's direct parameter — a technique index, a form
 *   index, a cell id, an edict index. These name nothing that can die between
 *   observation and submission, which is why the gate passes them through
 *   unresolved.
 * - For `noop` and `declareAscension` there is none; leave it undefined.
 *
 * One field rather than a params tuple, because §4.4's whole design is that a
 * discrete policy emits **one** integer per action: *"the agent selects a slot
 * index"*, and a slot names every parameter §4.2 lists, including both halves
 * of a `(mage, node)` pair.
 */
export interface ActionSubmission {
  readonly action: number;
  readonly parameter?: number;
}

/** The `agent-api` half of {@link adaptAgentSession}'s contract, structurally. */
interface ApiSessionLike<TConfig> {
  reset(runSeed: number, config: TConfig): unknown;
  observe(): Float64Array;
  legalActions(): Uint8Array;
  candidates(): CandidateLists;
  submit(action: { readonly kind: number; readonly params?: readonly number[] }): unknown;
  /**
   * §4.3's outcome record, of which the adapter reads exactly one field.
   *
   * Narrowed to that one field on purpose. The real record carries `terminal`,
   * `truncated`, `era` and the metric deltas as well, and a harness that read
   * them here would be taking a second opinion on questions `status()` and the
   * episode loop already answer — which is how two sources of truth about "is
   * this run over" get created.
   */
  outcome(): { readonly terminalReason: number };
  status(): 'running' | 'ascended' | 'stagnated' | 'truncated';
  accounting(): {
    readonly submitted: number;
    readonly rejected: number;
    readonly rejectedByAction: Readonly<Record<number, number>>;
  };
}

/**
 * Drives `agent-api`'s session through the surface {@link runEpisode} expects.
 *
 * Typed structurally rather than against the imported `AgentSession` from
 * `@mm/agent-api`, for one reason worth the extra ten lines: the harness's test
 * suite must be able to build a session double, and `contracts.md` §5 forbids
 * `mc-harness` from importing anything that could construct a `SimState`. A
 * structural parameter accepts the real session — which satisfies it exactly —
 * and a double, without the harness needing a world to make one.
 *
 * The `byActionId` keys are emitted in ascending numeric order rather than in
 * insertion order. `canonical.ts` sorts keys again on the way to disk, so this
 * changes no stored byte; it is here so that an accounting record read in a
 * debugger looks the same as the one written to the file.
 */
export function adaptAgentSession<TConfig>(session: ApiSessionLike<TConfig>): AgentSession<TConfig> {
  return {
    reset(runSeed: number, scenarioConfig: TConfig): void {
      session.reset(runSeed, scenarioConfig);
    },
    observe: () => session.observe(),
    legalActions: () => session.legalActions(),
    candidates: () => session.candidates(),
    submit(actionId: number, parameter?: number): void {
      session.submit(parameter === undefined ? { kind: actionId } : { kind: actionId, params: [parameter] });
    },
    status: () => session.status(),
    terminalReason: () => session.outcome().terminalReason,
    accounting(): IllegalActionAccounting {
      const source = session.accounting();
      const byActionId: Record<string, number> = {};
      for (const key of Object.keys(source.rejectedByAction).sort((a, b) => Number(a) - Number(b))) {
        byActionId[key] = source.rejectedByAction[Number(key)] as number;
      }
      return { submissions: source.submitted, rejections: source.rejected, byActionId };
    },
  };
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
export type SlotPolicy = (
  observation: Float64Array,
  mask: Uint8Array,
  slot: number,
  candidates: CandidateLists,
) => number | ActionSubmission;

/**
 * A policy's return value as the loop needs it: an id and a parameter.
 *
 * A bare number stays legal so that a policy over an unparameterized action
 * space — every test double in this package, and the passive control — reads as
 * `() => 0` rather than as `() => ({ action: 0 })`.
 */
export function normalizeSubmission(chosen: number | ActionSubmission): ActionSubmission {
  return typeof chosen === 'number' ? { action: chosen } : chosen;
}

/** What one episode did. Everything here is reproducible from the run seed. */
export interface EpisodeOutcome {
  readonly status: TerminalStatus;
  /** World ticks actually stepped. Feeds the recorded throughput figure. */
  readonly ticksRun: number;
  /** §1.1's ending. See {@link AgentSession.terminalReason}. */
  readonly terminalReason: number;
  readonly accounting: IllegalActionAccounting;
}

/** Everything {@link runEpisode} needs. */
export interface EpisodeInput<TConfig = unknown> {
  readonly session: AgentSession<TConfig>;
  readonly runSeed: number;
  readonly scenarioConfig: TConfig;
  /** One policy per agent slot, in slot order. */
  readonly policies: readonly SlotPolicy[];
  /**
   * Task 3.6: the declared cap, enforced here.
   *
   * **It bounds loop iterations, and a loop iteration is one round of slot
   * submissions.** For the single-slot episode every sweep in this repository
   * currently runs, that is one world tick and the two readings coincide. For
   * an *n*-slot episode driving `agent-api`'s session it is *n* world ticks,
   * because that session advances the clock once per `submit`. The session's
   * own `ScenarioConfig.worldTickCap` is the one measured in world ticks, and
   * it therefore fires first; this one is the backstop described at the top of
   * the file, and a backstop measured in rounds catches the case a backstop
   * measured in the session's own clock cannot.
   */
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
 * 3. **Every slot submits every round, in slot order, until the episode ends.**
 *    Fixed order, because the order two agents act in is a rule of the game and
 *    not a scheduling detail — and the loop stops mid-round when a submission
 *    terminates the session, because task 2.2 requires `submit` on a terminated
 *    session to raise. Without the guard, a two-slot episode that ended on slot
 *    zero's action would throw out of the *harness*, and a legitimate ascension
 *    would be recorded as a `failed` run. That guard was written against an
 *    assumption and is now a fact: `agent-api`'s `submit` raises with
 *    *"This episode is …; it cannot be advanced"*.
 * 4. **Each slot observes for itself.** The observation and the mask are read
 *    inside the slot loop, not once above it. With `agent-api`'s session every
 *    submission advances a tick, so slot 1 acting on the vector slot 0 saw
 *    would be acting on a world that has already moved — and the mask it saw
 *    could name an action that is now illegal, which the run would record as
 *    the *agent's* mistake. For a single-slot episode this is the same two
 *    calls in the same order, and the session caches its view, so it costs
 *    nothing to be right here.
 *
 * @throws Error if a policy names a non-integer action or a non-integer
 * parameter, which is a strategy bug worth failing the run over rather than
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
        // The session's own answer, verbatim, and it is `none`: the universe is
        // still running and the harness is the party that stopped. Synthesising
        // §1.1's `truncated` here would put the harness's cap and the
        // simulation's own truncation under one number, and the first is a
        // measurement horizon while the second is a fact about the run.
        terminalReason: session.terminalReason(),
        accounting: session.accounting(),
      };
    }
    for (let slot = 0; slot < policies.length; slot += 1) {
      const policy = policies[slot] as SlotPolicy;
      const chosen = normalizeSubmission(
        policy(session.observe(), session.legalActions(), slot, session.candidates()),
      );
      if (!Number.isInteger(chosen.action)) {
        throw new Error(
          `Policy for slot ${String(slot)} returned ${String(chosen.action)}, which is not an action id.`,
        );
      }
      if (chosen.parameter !== undefined && !Number.isInteger(chosen.parameter)) {
        throw new Error(
          `Policy for slot ${String(slot)} named action ${String(chosen.action)} with parameter ` +
            `${String(chosen.parameter)}, which is not an integer. A fractional slot index would ` +
            'resolve to nothing and be recorded as an ordinary illegal action, hiding the bug.',
        );
      }
      session.submit(chosen.action, chosen.parameter);
      if (session.status() !== TERMINAL_STATUS.running) break;
    }
    ticksRun += 1;
  }

  return {
    status: session.status(),
    ticksRun,
    terminalReason: session.terminalReason(),
    accounting: session.accounting(),
  };
}
