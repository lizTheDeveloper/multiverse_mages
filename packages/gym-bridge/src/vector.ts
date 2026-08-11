/*
 * Multiverse Mages — the env vector: N sessions in one process, addressed by index.
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
 * ## What the vector is for, and what it is not for
 *
 * It is **amortization**, not parallelism. Stepping *N* universes in one frame
 * pays the JSON encode, the JSON decode and the pipe round-trip once instead of
 * *N* times. It does not use a second core, and it is not meant to: every
 * session here runs on the one thread that owns this process's stdin.
 *
 * Parallelism across cores is the client's, and the client already has it —
 * `subprocess` is in the Python standard library, so *M* bridge processes cost
 * the reference client nothing and add no dependency to this repository.
 *
 * ## Why this is not built on `mc-harness`'s worker pool
 *
 * Because the pool cannot host a stepping session, and pretending otherwise
 * would produce a second way to drive a universe.
 *
 * `RunExecutor` is `(task: RunTask) => RunOutcome`: it runs a whole episode to
 * termination inside a worker and returns an outcome. A policy living in a
 * Python process cannot be inside that call. Hosting a stepping session there
 * would mean inverting the executor contract into a coroutine, after which the
 * harness and the bridge would drive universes two different ways — which is
 * *"building it twice guarantees divergence"* (§4's opening line) committed in
 * the one package whose entire purpose is not to diverge from §4.
 *
 * So the split is by whether a learned policy is in the loop. Sweeps,
 * baselines, gates, tournaments and ablation have no Python policy in them and
 * belong to `mm-run-sweep`, which has the pool, the derived seeds and the
 * canonical aggregation. This package ships none of those and its help text
 * says where they live.
 *
 * ## Nothing here computes an observation
 *
 * Every number that leaves this file came from `agent-api` and is passed
 * through. §4.1 makes `agent-api`'s `normalize.ts` the single licensed float
 * boundary; a bridge that rescaled anything would decouple what a policy learns
 * from what the balance gates measure, and the decoupling would be invisible
 * because both sides would still be numbers in `[0, 1]`.
 */

import type {
  AgentSession,
  CandidateLists,
  Scenario,
  ScenarioConfig,
  SessionOptions,
} from '@mm/agent-api';
import { PARAMETERIZED_ACTIONS, candidateSlotCount, createSession } from '@mm/agent-api';

import type { CandidateFrame, EnvView, OutcomeFrame, StepView } from './protocol.js';

/** How a vector is built. */
export interface VectorOptions {
  readonly scenario: Scenario;
  /** How many independent episodes this process hosts. */
  readonly envCount: number;
  /**
   * The session constructor. Defaults to `agent-api`'s.
   *
   * A seam rather than an abstraction: it exists so the protocol's own tests
   * can drive a session whose terminal status they control, without this
   * package acquiring the ability to build a world. Production passes nothing.
   */
  readonly createSession?: (options: SessionOptions) => AgentSession;
}

/** Why a request against one env could not be served. */
export type EnvFault = 'unknown-env' | 'no-episode' | 'episode-over';

/** One env's slot in the vector. */
interface EnvSlot {
  readonly session: AgentSession;
  started: boolean;
}

/** N independent episodes, addressed by index. */
export class EnvVector {
  private readonly slots: EnvSlot[] = [];

  readonly envCount: number;
  readonly scenarioId: string;

  constructor(options: VectorOptions) {
    const { scenario, envCount } = options;
    if (!Number.isSafeInteger(envCount) || envCount < 1) {
      throw new RangeError(
        `envCount must be a positive integer; received ${String(envCount)}. A vector of zero envs ` +
          'is a bridge that can answer no question, which is a configuration mistake worth ' +
          'refusing at startup rather than at the first step.',
      );
    }
    const make = options.createSession ?? createSession;
    this.envCount = envCount;
    this.scenarioId = scenario.scenarioId;
    for (let index = 0; index < envCount; index += 1) {
      // One session per env, and each one gets its own `agentSlotIndex`. That
      // index is part of `agent-api`'s agent-side RNG derivation, so two envs
      // reset with the same run seed still draw different tie-breaks — which is
      // what a caller running mirrored arms in one vector will assume.
      this.slots.push({
        session: make({ scenario, agentSlotIndex: index }),
        started: false,
      });
    }
  }

  /** Whether an index names an env. */
  has(env: number): boolean {
    return Number.isSafeInteger(env) && env >= 0 && env < this.envCount;
  }

  /** Starts one env's episode and returns its first view. */
  reset(env: number, runSeed: number, config: ScenarioConfig, hash = false): EnvView {
    const slot = this.slotAt(env);
    slot.session.reset(runSeed, config);
    slot.started = true;
    return this.view(env, slot.session, hash);
  }

  /**
   * Whether an env can be stepped, and why not when it cannot.
   *
   * Checked before anything is submitted, so a vector frame naming one bad env
   * leaves every other env untouched rather than half-advanced.
   */
  faultOf(env: number): EnvFault | undefined {
    if (!this.has(env)) return 'unknown-env';
    const slot = this.slots[env] as EnvSlot;
    if (!slot.started) return 'no-episode';
    return slot.session.status() === 'running' ? undefined : 'episode-over';
  }

  /**
   * Submits one action and advances one world tick.
   *
   * The action is handed to `agent-api` exactly as the client named it. A slot
   * index is `params[0]`, and `admit` resolves it against *current* state —
   * §4.4: *"A slot referring to an entity that died between observation and
   * action is an ordinary illegal action."* This package caches no candidate
   * list and resolves no handle, which is what makes that sentence true here
   * rather than merely quoted.
   */
  step(env: number, action: number, slot?: number, hash = false): StepView {
    const held = this.slotAt(env);
    const params = slot === undefined ? [] : [slot];
    const result = held.session.submit({ kind: action, params });
    const view = this.view(env, held.session, hash);
    return {
      ...view,
      admitted: result.admitted,
      ...(result.rejection === undefined ? {} : { rejection: result.rejection }),
    };
  }

  /** The current view of one env, without advancing it. */
  observe(env: number, hash = false): EnvView {
    return this.view(env, this.slotAt(env).session, hash);
  }

  /** One env's session, for a caller that needs the snapshot hash after the fact. */
  sessionAt(env: number): AgentSession {
    return this.slotAt(env).session;
  }

  private slotAt(env: number): EnvSlot {
    const slot = this.slots[env];
    if (slot === undefined) {
      throw new RangeError(
        `Env ${String(env)} is outside 0..${String(this.envCount - 1)}. Callers check with has() ` +
          'first; this is the backstop, not the check.',
      );
    }
    return slot;
  }

  /**
   * One env's view.
   *
   * **The snapshot hash is computed on request and at the end of an episode,
   * never on every tick.** `snapshotHash` walks the whole state — every
   * component array of every entity — and `bin/throughput.mjs` measured it as
   * the single largest cost in a step, larger than the simulation itself at
   * small world sizes. It is what a *record* needs and what a *policy* never
   * looks at, so charging every tick of every training run for it would be
   * paying the reproducibility claim's price on every step that is not part of
   * the claim.
   */
  private view(env: number, session: AgentSession, hash: boolean): EnvView {
    const outcome = session.outcome();
    const status = session.status();
    const wanted = hash || status !== 'running';
    return {
      env,
      // `Array.from` and not a shared reference: the session documents that the
      // buffer *"belongs to the session and is rebuilt on the next submit"*, and
      // a frame is encoded after the caller may have stepped again.
      observation: Array.from(session.observe()),
      mask: Array.from(session.legalActions()),
      candidates: candidateFrames(session.candidates()),
      outcome: outcomeFrame(outcome),
      status,
      worldTick: worldTickOf(session),
      illegalActionCount: session.illegalActionCount(),
      ...(wanted ? { snapshotHash: session.snapshotHash() } : {}),
    };
  }
}

/**
 * The world tick, read through the observation rather than through state.
 *
 * §5 grants this package one edge, to `agent-api`, and `agent-api` exposes no
 * state. The clock block's first channel is `worldTick` normalized, which is
 * not the integer — so rather than un-normalize it (which would be arithmetic
 * on an observation value, and this file does none), the tick is taken from the
 * session's own accounting: one submission is one world tick, by
 * {@link AgentSession.submit}'s contract.
 */
function worldTickOf(session: AgentSession): number {
  return session.accounting().submitted;
}

function outcomeFrame(outcome: {
  terminal: boolean;
  truncated: boolean;
  terminalReason: number;
  era: number;
  metricDeltas: Readonly<Record<string, number>>;
}): OutcomeFrame {
  // Field by field rather than a spread, so that a field added to
  // `OutcomeRecord` has to be transported deliberately. A reward field arriving
  // by spread is the one thing this whole boundary exists to prevent.
  return {
    terminal: outcome.terminal,
    truncated: outcome.truncated,
    terminalReason: outcome.terminalReason,
    era: outcome.era,
    metricDeltas: { ...outcome.metricDeltas },
  };
}

/** §4.4's lists, as the wire carries them. */
export function candidateFrames(lists: CandidateLists): CandidateFrame[] {
  const frames: CandidateFrame[] = [];
  for (const action of PARAMETERIZED_ACTIONS) {
    const found = lists.get(action) ?? [];
    frames.push({
      action,
      slots: candidateSlotCount(action),
      occupied: found.map((candidate) => [...candidate.params]),
    });
  }
  return frames;
}
