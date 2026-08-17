/*
 * Multiverse Mages — the episode session: one interface for bots, Monte Carlo, and RL.
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
 * `vision.md` §9, and `contracts.md` §4's opening line:
 *
 * > One interface serves scripted bots, Monte Carlo, and reinforcement learning.
 * > It is defined once, here, because building it twice guarantees divergence.
 *
 * The pieces of §4 already existed one module at a time — an observation, a
 * mask, candidate lists, an admission gate. What did not exist was an *episode*:
 * something a scripted bot, a Monte Carlo worker, and later a Gym wrapper can
 * each drive with the same five calls. This file is that, and it is deliberately
 * thin. Everything it does, a caller could do by hand with `observe`, `admit`
 * and `step`; the point is that three callers doing it by hand would do it three
 * ways, and the differences would show up as balance results.
 *
 * ## The scenario is the caller's, and that is a boundary decision
 *
 * A session does not know how to build a world. It is handed a {@link Scenario}
 * — a factory from `(runSeed, config)` to a `SimState`, plus the content
 * catalogue the observation needs.
 *
 * That is not indirection for its own sake. Building a world means loading
 * content, choosing species, and installing the world loop, which live in
 * `@mm/content` and `@mm/coordination`; `agent-api` deliberately depends on
 * neither. `package.json` records why for content — its public surface
 * re-exports a filesystem loader and this package must run in a browser — and
 * the same argument covers the loop. A session that constructed its own world
 * would drag both into the RL bridge and into the renderer.
 *
 * The cost is real and worth naming: the *reproducibility* of `reset` is only as
 * good as the scenario's promise to be a pure function of its two arguments.
 * That promise cannot be enforced from here, so it is stated on
 * {@link Scenario.create} and tested by the harness that supplies one.
 *
 * ## No reward, and no way to add one by accident
 *
 * §4.3: *"The core emits no reward. Reward is a property of a training
 * objective, not of the game."* The session exposes {@link AgentSession.outcome}
 * — terminal flag, terminal reason, era, metric deltas — and nothing that scores
 * them. `sparseTerminalReward` in `./outcome.ts` is a function a *caller* may
 * apply to that record; it is not wired in here, and wiring it in would make
 * every consumer of this interface a hostage to one researcher's choice.
 *
 * ## One action per submission, one world tick per submission
 *
 * §4.2's action space is discrete and an episode step is one decision, so
 * {@link AgentSession.submit} takes a single action and advances the clock once.
 * A caller that genuinely needs several actions resolved against one state has
 * `admit` and `step` directly — but it should think first, because "several
 * actions per tick" is a different action space from the one a policy is trained
 * against.
 */

import type { Action, SimState } from '@mm/sim-core';
import { rngFromRootSeed, snapshotHash, step } from '@mm/sim-core';
import { TERMINAL_REASON, findUniverse, readUniverse } from '@mm/state';

import { ACTION_SPACE_SIZE } from './actions.js';
import type { AgentRng } from './agent-rng.js';
import { agentRng } from './agent-rng.js';
import type { CandidateLists } from './candidates.js';
import type { ContentCatalogue } from './catalogue.js';
import { OBSERVATION_LAYOUT_DIGEST, OBSERVATION_SCHEMA_VERSION } from './digest.js';
import type { RejectionReason } from './gate.js';
import { admit } from './gate.js';
import type { OutcomeRecord } from './outcome.js';
import type { AcademyProjection } from './academy.js';
import { describeAcademy } from './academy.js';
import type { CandidateDetailProjection } from './candidate-detail.js';
import { describeCandidates } from './candidate-detail.js';
import type { PlayerState } from './player-state.js';
import { project } from './player-state.js';
import type { AgentView } from './view.js';
import { observe } from './view.js';

/**
 * How an episode stands.
 *
 * The four the `agent-api` capability names. `truncated` is kept distinct from
 * the three that are genuinely terminal for §4.3's reason — *"bootstrapping
 * value estimates through the two differs, and conflating them is a silent
 * training bug"* — and `ascended` is kept distinct from `stagnated` because §7's
 * `ascensionRate` is the difference between them.
 */
export type EpisodeStatus = 'running' | 'ascended' | 'stagnated' | 'truncated';

/** What the caller asks of one episode. */
export interface ScenarioConfig {
  /**
   * The world-tick cap, after which the episode is `truncated`.
   *
   * §4.3 puts the step limit on the caller — *"a step limit imposed by the
   * caller, never by the core"* — and this is where the caller imposes it. It is
   * part of the config rather than a session-construction option because two
   * sessions reset with the same `(runSeed, config)` must be the same episode,
   * and an episode that stops at a different tick is a different episode.
   */
  readonly worldTickCap: number;
  /**
   * Anything else the scenario builder understands. Never read here.
   *
   * Restricted to scalars so that a sweep can hash a config into a run record
   * without inventing a serialization for it.
   */
  readonly options?: Readonly<Record<string, number | string | boolean>>;
}

/** How a caller makes the world an episode plays in. */
export interface Scenario {
  /** Stable identifier, recorded alongside results. */
  readonly scenarioId: string;
  /** Node tiers, node cells and tradition ids the observation needs. */
  readonly catalogue: ContentCatalogue;
  /**
   * Universes this one may open a portal to, if any.
   *
   * The one input `candidates.ts` cannot derive: `contracts.md` §1.1 puts one
   * universe in a simulation instance, so the multiverse is not in state and
   * there is nothing here to enumerate. Whoever built the world is the only
   * party that knows what else is in the sky, so the scenario carries it and
   * the session hands it to the candidate builder unchanged.
   *
   * Absent — the default — means action 14 has no candidates and stays masked,
   * which is the correct answer for a genuinely solitary universe and is what
   * every scenario built before raids landed keeps reporting.
   */
  readonly portalTargets?: readonly number[];
  /**
   * Species an allied realm would send a scholar from, if any.
   *
   * The same §1.1 shape as {@link portalTargets}, and absent for the same
   * reason: who else is in the sky is the scenario's knowledge, never state's.
   * Absent means action 16 has no candidates and stays masked — a universe with
   * nobody to ask.
   */
  readonly invitableSpecies?: readonly number[];
  /**
   * Node ids carrying the `portal` primitive, for action 16's gate.
   *
   * Content, not state, and §5 gives `agent-api` no edge to the effect tables —
   * so whoever assembled the content supplies it, exactly as it supplies
   * {@link invitableSpecies}. Absent holds the action closed.
   */
  readonly portalNodes?: readonly number[];
  /**
   * Builds the initial state.
   *
   * **Must be a pure function of its two arguments.** Reading a clock, a
   * counter, or a module-level cache here makes every run derived from it
   * irreproducible, and the symptom is a Monte Carlo sweep that cannot be
   * replayed rather than an error anybody sees.
   */
  create(runSeed: number, config: ScenarioConfig): SimState;
}

/** How one session is built. */
export interface SessionOptions {
  readonly scenario: Scenario;
  /**
   * Which agent slot this session plays. Part of the agent-side RNG derivation,
   * so mirrored arms of a paired comparison do not draw identical numbers.
   */
  readonly agentSlotIndex?: number;
  /** The strategy's stable id. Part of the agent-side RNG derivation. */
  readonly strategyId?: string;
  /**
   * Whether to keep the per-action-id rejection breakdown. Default `true`.
   *
   * This toggles **the session's own tally only**. §4.2 requires the core to
   * count a rejected submission on the state, `illegalActionCount` is in the
   * snapshot, and §7's `illegalActionRate` is computed from it — so that count
   * is not optional and is not affected by this flag. Turning the flag off must
   * leave the final snapshot hash byte-identical, which is what the capability
   * asks and what `session.test.ts` asserts.
   */
  readonly countIllegalActions?: boolean;
}

/** What an episode recorded about the actions submitted to it. */
export interface EpisodeAccounting {
  /** Every action handed to {@link AgentSession.submit}, legal or not. */
  readonly submitted: number;
  /** Those the gate turned away. */
  readonly rejected: number;
  /**
   * Rejections by the action id submitted, including ids outside §4.2's table —
   * an agent submitting nonsense is a thing worth being able to see.
   */
  readonly rejectedByAction: Readonly<Record<number, number>>;
  /** Whether the breakdown above was collected at all. */
  readonly enabled: boolean;
}

/** What one submission did. Carries no reward; see this module's opening note. */
export interface SubmitResult {
  /** Whether the gate let the action through to `step`. */
  readonly admitted: boolean;
  /** Why not, when it did not. */
  readonly rejection?: RejectionReason;
  /** The observation of the state the tick produced. */
  readonly observation: Float64Array;
  /** How the episode stands after the tick. */
  readonly status: EpisodeStatus;
}

const DEFAULT_STRATEGY_ID = 'unnamed-strategy';

/**
 * One episode, driven five calls at a time.
 *
 * Not exported as a class to be subclassed — {@link createSession} is the
 * constructor, and the type is the contract. A strategy that needed to override
 * `observe` would be a strategy seeing something the interface does not offer,
 * which is exactly the boundary the capability spec's *"Agents observe only
 * through the exported interface"* requirement exists to hold.
 */
export interface AgentSession {
  /** §4.1's interface version. Recorded by a baseline; see `digest.ts`. */
  readonly observationSchemaVersion: number;
  /** The layout digest a baseline refuses to compare across. */
  readonly observationLayoutDigest: string;
  /** `16`. The mask's width and a policy's output width. */
  readonly actionSpaceSize: number;
  /** The scenario this session plays. */
  readonly scenarioId: string;

  /** Starts a new episode and returns its first observation. */
  reset(runSeed: number, config: ScenarioConfig): Float64Array;
  /**
   * The current normalized observation.
   *
   * **The array belongs to the session** and is rebuilt on the next `submit`.
   * A learner that keeps observations — a replay buffer, a rollout — copies.
   * Handing out a fresh copy per call was the alternative and was rejected: a
   * ten-thousand-run sweep would allocate one four-hundred-double array per
   * tick per run for callers that read it once, and the cost of the rule is one
   * sentence while the cost of the copy is measured in the throughput figure
   * this release has to report.
   */
  observe(): Float64Array;
  /** The mask over the full action space, one byte per id. Session-owned, as above. */
  legalActions(): Uint8Array;
  /** §4.4's slot-indexed candidate lists, for the parameterized actions. */
  candidates(): CandidateLists;
  /** Submits one action and advances one tick. Raises on a terminated episode. */
  submit(action: Action): SubmitResult;
  /** How the episode stands. */
  status(): EpisodeStatus;
  /** §4.3's outcome record. Facts only. */
  outcome(): OutcomeRecord;
  /** Submissions, rejections, and the per-action-id breakdown. */
  accounting(): EpisodeAccounting;
  /** The core's own count of rejected submissions, which lives in state. */
  illegalActionCount(): number;
  /** The agent-side generator. Outside the §6 registry; see `agent-rng.ts`. */
  rng(): AgentRng;
  /** The current state's content hash, for a run record's provenance. */
  snapshotHash(): string;
  /**
   * The §4.4 player projection of the current state — what a *client* may see.
   *
   * Distinct from {@link AgentSession.observe}, which returns the §4.1 vector a
   * *policy* is trained on, and it exists because those two are not the same
   * entitlement. The vector is fixed at `OBSERVATION_SIZE` slots and widening it
   * invalidates every trained agent, so a quantity the world holds but the
   * vector aggregates — `material-stock`'s seven kinds into one `materials`
   * slot — was unreachable by a client for no reason except that the agent's
   * budget is tight. `project()` was already the named home for the player's
   * view; nothing exposed it from a running session, so every consumer that had
   * one had only `observe()`.
   *
   * Reads no field the observation withholds: this is the same projection
   * `unencodedObservables` checks, so a leak would fail that gate rather than
   * ship quietly.
   */
  playerState(): PlayerState;
  /**
   * §4.4's candidate descriptors for the lists {@link candidates} returns.
   *
   * The same entitlement argument {@link playerState} makes, one level down. A
   * slot index is everything a *policy* needs — §4.4 hands it a categorical
   * choice and an outcome to learn from — and it is nothing at all to a
   * *person*, who is offered nineteen numbers and no reason to prefer one.
   * `docs/design/interface-findings.md` §1.11 is that finding.
   *
   * Aligned slot-for-slot with {@link candidates} **by construction**: it is
   * handed the very lists that method returns rather than rebuilding them, so
   * the two cannot describe different worlds. Nothing here reaches
   * {@link observe}, and no rule reads it.
   */
  candidateDetails(): CandidateDetailProjection;
  /**
   * §4.4's academy projection: every college, its roster, its shelf, the
   * lessons in progress, and the cells the ruleset permits.
   *
   * The same entitlement argument {@link candidateDetails} makes, for a
   * different question. A funding chip needs a college in seven counts; a
   * university *screen* needs the people, the books and the graph, and none of
   * those is in §4.1 at all — the mage block is 6 species x 8 tiers of counts,
   * so a policy cannot tell a college of five from five hermits.
   *
   * Built on request, read by no rule, unreachable from {@link observe}.
   * `./academy.ts` argues the placement and the refusals.
   */
  academy(): AcademyProjection;
}

/** Builds a session. The episode does not exist until {@link AgentSession.reset}. */
export function createSession(options: SessionOptions): AgentSession {
  const { scenario } = options;
  const agentSlotIndex = options.agentSlotIndex ?? 0;
  const strategyId = options.strategyId ?? DEFAULT_STRATEGY_ID;
  const counting = options.countIllegalActions ?? true;

  /**
   * The scenario's portal targets, spread into every candidate build.
   *
   * Built once as an object to spread rather than passed as
   * `portalTargets: scenario.portalTargets`, because `CandidateInput` declares
   * the field optional and `exactOptionalPropertyTypes` makes an explicit
   * `undefined` a different thing from an absent key. Spreading an empty object
   * keeps "this scenario named no targets" byte-identical to every call this
   * package made before the field existed.
   */
  const portalTargets =
    scenario.portalTargets === undefined ? {} : { portalTargets: scenario.portalTargets };

  /** The alliance roster, spread for exactly the reason above. */
  const invitableSpecies =
    scenario.invitableSpecies === undefined
      ? {}
      : { invitableSpecies: scenario.invitableSpecies };

  /** Action 16's gate, spread for exactly the reason above. */
  const portalNodes =
    scenario.portalNodes === undefined ? {} : { portalNodes: scenario.portalNodes };

  let state: SimState | undefined;
  let cap = 0;
  let view: AgentView | undefined;
  let rng: AgentRng | undefined;
  let submitted = 0;
  let rejected = 0;
  let rejectedByAction: Record<number, number> = {};

  /** The state, or a refusal that says what the caller forgot. */
  const live = (): SimState => {
    if (state === undefined) {
      throw new Error(
        'This session has no episode yet. Call reset(runSeed, scenarioConfig) first — a session ' +
          'that invented a state to answer with would answer every question about a world nobody ' +
          'asked for.',
      );
    }
    return state;
  };

  /**
   * Whether the caller's step limit has been reached.
   *
   * The `cap` comparison, on its own and not routed through {@link statusOf}: a
   * run that ascended on the tick it hit the cap is `'ascended'` for status
   * purposes, and §4.3's two flags are independent, so that run is terminal
   * *and* truncated and the record should say both.
   */
  const atCap = (current: SimState): boolean => current.clock.worldTick >= cap;

  /**
   * The view of the current state, built once per tick and reused.
   *
   * `truncated` is passed here because this is the caller §4.3 means. The
   * session is the party holding `worldTickCap`, so it is the only party that
   * can answer, and `observe` leaves the parameter optional precisely so that a
   * caller with no limit can decline to. Omitting it left `outcome().truncated`
   * `false` at every tick of every episode — including the tick `status()`
   * reported `'truncated'` on — which is §4.3's *"conflating them is a silent
   * training bug"* reproduced exactly: every `RewardFunction` takes an
   * `OutcomeRecord` and nothing else, so a consumer written to §4.3 cannot see
   * `status()` and would bootstrap through the cap as if nothing had happened.
   */
  const currentView = (): AgentView => {
    const current = live();
    view ??= observe({
      state: current,
      catalogue: scenario.catalogue,
      ...portalTargets,
      ...invitableSpecies,
      ...portalNodes,
      truncated: atCap(current),
    });
    return view;
  };

  const statusOf = (current: SimState): EpisodeStatus => {
    const universe = findUniverse(current);
    if (universe !== 0) {
      const record = readUniverse(current, universe);
      switch (record.terminalReason) {
        case TERMINAL_REASON.ascensionApotheosis:
        case TERMINAL_REASON.ascensionCanon:
          return 'ascended';
        case TERMINAL_REASON.stagnation:
          return 'stagnated';
        case TERMINAL_REASON.truncated:
          return 'truncated';
        default:
          break;
      }
    }
    // The cap is the caller's, and it is checked after the state's own reasons:
    // a run that ascended on the tick it hit the cap ascended.
    return atCap(current) ? 'truncated' : 'running';
  };

  const noteRejection = (kind: number): void => {
    rejected += 1;
    if (!counting) return;
    rejectedByAction[kind] = (rejectedByAction[kind] ?? 0) + 1;
  };

  return {
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationLayoutDigest: OBSERVATION_LAYOUT_DIGEST,
    actionSpaceSize: ACTION_SPACE_SIZE,
    scenarioId: scenario.scenarioId,

    reset(runSeed: number, config: ScenarioConfig): Float64Array {
      if (!Number.isInteger(runSeed) || runSeed < 0 || runSeed > 0xffff_ffff) {
        throw new RangeError(
          `runSeed must be an unsigned 32-bit integer; received ${String(runSeed)}. It becomes ` +
            "the state's root seed, which sim-core requires to be one.",
        );
      }
      if (!Number.isSafeInteger(config.worldTickCap) || config.worldTickCap < 1) {
        throw new RangeError(
          `worldTickCap must be a positive integer; received ${String(config.worldTickCap)}. An ` +
            'episode with no cap is an episode a sweep cannot bound, and §4.3 puts the limit on ' +
            'the caller precisely so that it is stated rather than assumed.',
        );
      }

      state = scenario.create(runSeed, config);
      cap = config.worldTickCap;
      view = undefined;
      rng = agentRng({ runSeed, agentSlotIndex, strategyId });
      submitted = 0;
      rejected = 0;
      rejectedByAction = {};
      return currentView().normalized;
    },

    observe(): Float64Array {
      return currentView().normalized;
    },

    legalActions(): Uint8Array {
      return currentView().mask;
    },

    candidates(): CandidateLists {
      return currentView().candidates;
    },

    outcome(): OutcomeRecord {
      return currentView().outcome;
    },

    status(): EpisodeStatus {
      return statusOf(live());
    },

    submit(action: Action): SubmitResult {
      const current = live();
      const before = statusOf(current);
      if (before !== 'running') {
        throw new Error(
          `This episode is ${before}; it cannot be advanced. A terminated episode that silently ` +
            'accepted another action would put ticks past its own cap into a record claiming the ' +
            'cap was honoured — reset() starts a new one.',
        );
      }

      submitted += 1;
      const screened = admit(
        {
          state: current,
          catalogue: scenario.catalogue,
          ...portalTargets,
          ...invitableSpecies,
          ...portalNodes,
        },
        [action],
      );
      const rejection = screened.rejected[0];
      if (rejection !== undefined) noteRejection(action.kind);

      state = step(current, screened.admitted, rngFromRootSeed(current.rootSeed));
      view = undefined;

      const next = currentView();
      return {
        admitted: rejection === undefined,
        ...(rejection === undefined ? {} : { rejection: rejection.reason }),
        observation: next.normalized,
        status: statusOf(state),
      };
    },

    accounting(): EpisodeAccounting {
      return Object.freeze({
        submitted,
        rejected,
        rejectedByAction: Object.freeze({ ...rejectedByAction }),
        enabled: counting,
      });
    },

    illegalActionCount(): number {
      return live().illegalActionCount;
    },

    rng(): AgentRng {
      if (rng === undefined) {
        throw new Error(
          'The agent generator is derived from the run seed, so it does not exist until reset().',
        );
      }
      return rng;
    },

    snapshotHash(): string {
      return snapshotHash(live());
    },

    playerState(): PlayerState {
      // Built fresh rather than memoized beside `view`. The projection is not
      // on the per-tick path any policy takes — only a client asks for it — and
      // a second cache invalidated in `submit()` is a second thing that can be
      // forgotten there and serve a tick-old universe as the current one.
      return project({ state: live(), catalogue: scenario.catalogue });
    },

    candidateDetails(): CandidateDetailProjection {
      // `currentView().candidates` and not a fresh `buildCandidates`: the
      // alignment this projection promises is only real if both halves come
      // from one list. Built fresh per call otherwise, for the same reason
      // `playerState` is — a client asks, a policy does not.
      return describeCandidates({
        state: live(),
        catalogue: scenario.catalogue,
        lists: currentView().candidates,
      });
    },

    academy(): AcademyProjection {
      // Built fresh per call, like `playerState` and for the same reason: a
      // client asks and a policy does not, and a second cache invalidated in
      // `submit()` is a second thing that can be forgotten there and serve a
      // tick-old universe as the current one.
      return describeAcademy({ state: live(), catalogue: scenario.catalogue });
    },
  };
}
