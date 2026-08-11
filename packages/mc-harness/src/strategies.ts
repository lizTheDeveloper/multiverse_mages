/*
 * Multiverse Mages — the scripted bot pool: eight strategies, their probe
 * hypotheses, and the fall-through that keeps a masked one honest.
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
 * Task group 5.1–5.6.
 *
 * ## What a strategy is here, and why it is a preference list
 *
 * A strategy does **not** return an action. It returns an ordered list of
 * actions it would like, most-preferred first, and {@link policyFor} submits the
 * first one the mask permits. That is task 5.6 — *"a strategy whose preferred
 * action is masked submits its next-preferred legal action"* — implemented
 * once, in one place, rather than eight times with eight chances to get it
 * wrong.
 *
 * The alternative shape, a strategy that returns one action and is trusted to
 * consult the mask itself, is the shape that produces the failure the capability
 * spec names: *"A strategy that stalls when masked is a strategy that measures
 * the mask instead of the game."* One implementation of fall-through means one
 * test of fall-through can cover the whole pool, and it does — see
 * `strategy-pool.test.ts`.
 *
 * The list always ends in `noop`, which the mask can never forbid (§4.2 makes
 * no-op the action an illegal submission is *replaced by*, so a mask that could
 * forbid it would leave a rejection with nothing to become). So a policy always
 * has something legal to say, and "ran out of preferences" is not a state that
 * exists.
 *
 * ## What a strategy may see
 *
 * The observation, the mask, its own slot index, how many rounds it has acted,
 * and an agent-side generator. **Not the candidate lists.** §4.4 is explicit
 * that *"the agent selects a slot index"*, so a slot index is the whole of a
 * parameterized action's vocabulary; a strategy that read the resolved
 * candidates would be reading something a trained policy's output layer cannot,
 * and `design.md` rejects exactly that — *"reading world state directly would
 * let a bot see what an RL agent cannot, and every measurement taken with such
 * a bot would overstate what the observation space supports."*
 *
 * The slot orderings in `agent-api/src/candidates.ts` are what give a slot index
 * meaning, and they are documented there: slot 0 of `blessMage` is the most
 * depleted living mage, slot 0 of `fundUniversity` is *"found a new one"*, slot
 * 0 of `encourageResearch` is the permitted cell with the most instances
 * already in it. The strategies below are written against those sentences, and
 * a strategy's comment says which one it is relying on — because the day an
 * ordering changes, the strategies that read it change meaning, and §4.4's own
 * note calls that *"a balance-affecting change"*.
 *
 * ## Degeneracy is declared, not discovered
 *
 * Most of what these strategies want does not exist in this build. `god-agency`
 * (0.7.0) is what gives the god's verbs consequences; raids (0.9.0) are what
 * make a portal worth opening; there is no worship loop at all. `design.md`
 * expected this — *"At 0.5.0 the god's verbs do not exist … and every bot
 * degrades toward the passive control"* — and specifying the pool now is what
 * *"forces 0.6.0 and 0.7.0 to deliver actions a strategy can actually
 * differentiate on."*
 *
 * The danger in that is precise and worth stating: **a strategy that has
 * silently become the passive control corrupts every tournament it appears in**,
 * because it enters the pairwise matrix as a distinct competitor while being a
 * second copy of the control. So degeneracy is not left to be inferred. Every
 * strategy declares {@link StrategyDefinition.signatureActions} — the actions
 * without which it is not itself — and {@link degeneracyOf} reports, against a
 * given mask, whether any of them are reachable. A test asserts the report
 * rather than the hope.
 *
 * Two kinds of degeneracy exist and only one of them is visible from here:
 *
 * - **Masked-degenerate**: every signature action is masked. Detectable from
 *   the mask alone, which is what {@link degeneracyOf} does.
 * - **Effect-degenerate**: the action is admitted and then consumed by nobody.
 *   No system in `rules-magic`, `rules-world`, `rules-raid` or `coordination`
 *   reads `ctx.actions` in this build, so **every god action is currently
 *   effect-degenerate** — `step` hands the admitted actions to the systems and
 *   the systems ignore them. That is recorded in {@link POOL_BUILD_LIMITS}
 *   rather than tested, because testing it from here would mean importing the
 *   rules packages, which §5 forbids the harness.
 */

import type { AgentRng } from '@mm/agent-api';
import {
  ACTION_SPACE_SIZE,
  GOD_ACTION,
  agentRng,
  candidateSlotCount,
  isLegal,
  observationBlock,
} from '@mm/agent-api';

import type { ActionSubmission, SlotPolicy } from './session.js';

/**
 * What a strategy is told about the episode it is playing.
 *
 * Built once per episode per slot, so a strategy's randomness is a pure
 * function of `(runSeed, agentSlotIndex, strategyId)` and of nothing else —
 * `agent-api`'s `agentRng` derivation, used unchanged rather than re-derived
 * here, because two derivations of "the agent's generator" is one more than the
 * number that can be right.
 */
export interface StrategyContext {
  readonly runSeed: number;
  readonly agentSlotIndex: number;
  readonly rng: AgentRng;
}

/** What a strategy sees when it is asked what it would like to do. */
export interface PreferenceInput {
  /** The normalized observation, §4.1. Session-owned; do not retain it. */
  readonly observation: Float64Array;
  /** The legality mask, §4.2. One byte per action id. */
  readonly mask: Uint8Array;
  /** Rounds this policy has already acted in this episode. Zero on the first. */
  readonly round: number;
  readonly context: StrategyContext;
}

/**
 * One scripted strategy.
 *
 * `version` is separate from `strategyId` for the reason a metric's
 * `definitionVersion` is separate from its id: the id is what a run record
 * names, and it must stay stable so two tournaments a year apart are comparable;
 * the version is what changed about the behaviour behind that name, and a
 * baseline that compares across a version bump is comparing two strategies.
 */
export interface StrategyDefinition {
  /** Stable, and permanent once a record carries it. */
  readonly strategyId: string;
  /** Bumped whenever the preference order changes. */
  readonly version: number;
  /**
   * **What this strategy exists to detect.**
   *
   * Task 5.1 asks for a documented probe hypothesis per strategy, and the
   * capability spec asks that each be *"documented with the hypothesis about
   * the strategy space it exists to probe."* A hypothesis is a sentence that
   * could turn out to be false — the same standard `release-plan.md` holds a
   * release claim to. "Plays broadly" is a description; "whether breadth
   * outruns the loss channel" is a hypothesis, because a tournament can come
   * back and say no.
   */
  readonly hypothesis: string;
  /**
   * The actions without which this strategy is not distinguishable from the
   * passive control. See {@link degeneracyOf}.
   *
   * The passive control's list is empty, and that is the correct answer for it:
   * it needs nothing to be itself.
   */
  readonly signatureActions: readonly number[];
  /** What the strategy would like, most-preferred first. `noop` is appended for it. */
  preferences(input: PreferenceInput): readonly ActionSubmission[];
}

// ---------------------------------------------------------------------------
// Observation channels the strategies read.
// ---------------------------------------------------------------------------

/**
 * Offsets into §4.1's vector, resolved from `agent-api`'s block table.
 *
 * Resolved rather than written as literals for the reason `layout.ts` gives for
 * deriving its own offsets: a hand-written offset is a number that can be right
 * in the writer and wrong in the reader, and the symptom is a strategy that
 * conditions on `worship` while believing it reads `favor`.
 */
const RESOURCES = observationBlock('resources').offset;
const INSTITUTIONS = observationBlock('institutions').offset;

/** Channel indices within the `resources` block, in `layout.ts`'s order. */
const FAVOR = RESOURCES;
const WORSHIP = RESOURCES + 1;

/** Channel indices within the `institutions` block, in `layout.ts`'s order. */
const UNIVERSITY_COUNT = INSTITUTIONS;
const LIBRARY_DEPTH = INSTITUTIONS + 2;

/** A channel's value, or 0 for a vector too short to hold it. */
function channel(observation: Float64Array, index: number): number {
  return observation[index] ?? 0;
}

// ---------------------------------------------------------------------------
// The eight strategies.
// ---------------------------------------------------------------------------

/**
 * The five techniques and fourteen forms §2.1 gives the grid, as parameter
 * values for actions 1–4.
 *
 * `GRID_TECHNIQUE_COUNT` and `GRID_FORM_COUNT` live in `@mm/state`, which §5
 * does not grant the harness. The numbers are therefore written here, and the
 * consequence of them going stale is bounded and visible: a strategy would
 * permit or forbid a bit that does not exist, the gate would pass it through to
 * a `god-agency` that would reject it, and `illegalActionRate` would rise for
 * exactly one action id. That is the failure mode a rate metric is for.
 */
const GRID_TECHNIQUES = 5;
const GRID_FORMS = 14;

/** The technique bit this round names, cycling. */
function technique(round: number): number {
  return round % GRID_TECHNIQUES;
}

/** The form bit this round names, cycling. */
function form(round: number): number {
  return round % GRID_FORMS;
}

/**
 * The same cycles, skipping index 0.
 *
 * `narrow-depth` is defined by keeping exactly one technique and one form, and
 * index 0 is the one it keeps — so its forbid rotation must never name it.
 * Written as its own helper rather than as a conditional inside the rotation,
 * because "skip a value unless it comes up" and "never emit a value" are
 * different, and the first one is the bug.
 */
function techniqueExceptFirst(round: number): number {
  return 1 + (round % (GRID_TECHNIQUES - 1));
}

function formExceptFirst(round: number): number {
  return 1 + (round % (GRID_FORMS - 1));
}

/**
 * ## No strategy below names a cell id, and one of them wanted to
 *
 * The capability spec names `rego-limen` — the portal cell — for the
 * portal-rush strategy, and names *"theft-bearing cells"* for the denial
 * warden. Neither can be resolved here: the grid lives in `@mm/content` and
 * `@mm/state`, and `contracts.md` §5 grants the harness neither. So those
 * strategies reach for the *action* (`openPortal`, `issueInterdiction`) and take
 * the top of §4.4's salience ranking, rather than a cell number transcribed
 * from a data file that nothing here would notice changing. A hard-coded id
 * would be worse than none: it would look like the strategy knew which cell it
 * was driving, right up until the grid was re-authored.
 */

/** Cycles a slot index over an action's pinned `k`. */
function rotate(action: number, round: number): number {
  const slots = candidateSlotCount(action);
  return slots === 0 ? 0 : round % slots;
}

/**
 * The passive control. Submits no-ops and nothing else.
 *
 * Every other strategy's effect is measured as a difference from this one, so
 * it is the only member of the pool whose *job* is to do nothing — which is
 * also why the pool needs a way to tell it apart from a strategy that has
 * accidentally become it.
 */
const PASSIVE_CONTROL: StrategyDefinition = {
  strategyId: 'passive-control',
  version: 1,
  hypothesis:
    'The null hypothesis for the whole pool: what a universe does when the god never intervenes. ' +
    'It probes whether the god matters at all — if no strategy separates from this one on any §7 ' +
    'metric, then either the verbs are inert or the metrics cannot see them, and both are findings ' +
    'about the instrument rather than about the game.',
  signatureActions: [],
  preferences: () => [],
};

/**
 * Uniform over the legal actions, including no-op. The noise floor.
 *
 * Draws its slot index uniformly too, which is what makes it a floor for the
 * *parameterized* actions rather than only for the discrete head. A strategy
 * that cannot beat a bot picking slots at random is not using §4.4's ranking.
 */
const UNIFORM_RANDOM_LEGAL: StrategyDefinition = {
  strategyId: 'uniform-random-legal',
  version: 1,
  hypothesis:
    'The noise floor. It probes whether any deliberate strategy is exploiting structure rather ' +
    'than merely acting: a pool in which nothing separates from uniform-random-legal has no ' +
    'strategy space to measure. It is also the fastest detector of a mask that is lying — random ' +
    'legal play should produce a near-zero illegal-action rate, so a non-zero one here is a mask ' +
    'and a gate that disagree, not an agent that is confused.',
  // Everything, because "uniform over what is legal" is a different bot in a
  // world where only no-op is legal, and that difference is the point.
  signatureActions: Object.values(GOD_ACTION).filter((action) => action !== GOD_ACTION.noop),
  preferences: ({ mask, context }) => {
    const legal: number[] = [];
    for (let action = 0; action < ACTION_SPACE_SIZE; action += 1) {
      if (isLegal(mask, action)) legal.push(action);
    }
    if (legal.length === 0) return [];
    const action = legal[context.rng.nextBelow(legal.length)] as number;
    const slots = candidateSlotCount(action);
    // Exactly one entry: fall-through past a uniform draw over the legal set
    // would be a second draw from a different distribution, and the whole value
    // of a noise floor is that its distribution is stated.
    return slots === 0
      ? [{ action }]
      : [{ action, parameter: context.rng.nextBelow(slots) }];
  },
};

/**
 * Permits widely, funds broadly.
 *
 * Reads `universityCount` so that it keeps founding until the universe has
 * institutions and then spreads funding across them — slot 0 of
 * `fundUniversity` is the standing "found a new one" option, and slots 1+ are
 * existing universities ranked least-complete-first.
 */
const PERMISSIVE_BREADTH: StrategyDefinition = {
  strategyId: 'permissive-breadth',
  version: 1,
  hypothesis:
    'Whether breadth outruns the loss channel. A wide ruleset offers more nodes to discover and ' +
    'more institutions to hold them; §6a says knowledge decays and is lost, so breadth might ' +
    'instead spread a fixed teaching capacity too thin. It probes the sign of that trade: if ' +
    'permissive-breadth beats narrow-depth on ascension rate but loses on knowledgeHalfLife, the ' +
    'loss model has teeth and the god is choosing between two real goods.',
  signatureActions: [
    GOD_ACTION.permitTechnique,
    GOD_ACTION.permitForm,
    GOD_ACTION.issueDispensation,
    GOD_ACTION.fundUniversity,
    GOD_ACTION.encourageResearch,
  ],
  preferences: ({ observation, round }) => {
    const universities = channel(observation, UNIVERSITY_COUNT);
    const preferred: ActionSubmission[] = [
      { action: GOD_ACTION.permitTechnique, parameter: technique(round) },
      { action: GOD_ACTION.permitForm, parameter: form(round) },
      { action: GOD_ACTION.issueDispensation, parameter: (round % 70) + 1 },
    ];
    // Found until there is something to fund, then spread across what exists.
    preferred.push(
      universities === 0
        ? { action: GOD_ACTION.fundUniversity, parameter: 0 }
        : { action: GOD_ACTION.fundUniversity, parameter: rotate(GOD_ACTION.fundUniversity, round) },
    );
    // Slot 0 is the deepest permitted cell; rotating spreads encouragement
    // rather than compounding it, which is the whole difference from
    // narrow-depth below.
    preferred.push({
      action: GOD_ACTION.encourageResearch,
      parameter: rotate(GOD_ACTION.encourageResearch, round),
    });
    return preferred;
  },
};

/**
 * A minimal ruleset driven as deep as one cell allows.
 *
 * Always slot 0 of `encourageResearch`, never a rotation: slot 0 is the
 * permitted cell with the most instances already in it, so repeatedly taking it
 * is what "drive one cell as deep as possible" means in the vocabulary §4.4
 * actually offers.
 */
const NARROW_DEPTH: StrategyDefinition = {
  strategyId: 'narrow-depth',
  version: 1,
  hypothesis:
    'Whether concentration beats breadth. It permits one technique and one form and pushes the ' +
    'single deepest permitted cell every round, so it probes whether tier progression is the ' +
    'binding constraint on ascension — and, symmetrically, whether a narrow ruleset makes a ' +
    'universe brittle: one cell is one thing to lose, and timeToTierBySpecies against a narrow ' +
    'ruleset is the measurement that would say so.',
  signatureActions: [
    GOD_ACTION.forbidTechnique,
    GOD_ACTION.forbidForm,
    GOD_ACTION.encourageResearch,
  ],
  preferences: ({ round }) => [
    // Forbid everything except index 0, which is the "minimal set" this
    // strategy is defined by. The rotation skips 0 rather than excluding it
    // conditionally, so there is no round on which it forbids its own cell.
    { action: GOD_ACTION.forbidTechnique, parameter: techniqueExceptFirst(round) },
    { action: GOD_ACTION.forbidForm, parameter: formExceptFirst(round) },
    { action: GOD_ACTION.encourageResearch, parameter: 0 },
    { action: GOD_ACTION.grantFoundingKnowledge, parameter: 0 },
  ],
};

/**
 * Forbids aggressively and interdicts.
 *
 * The interdiction target rotates over cell ids rather than picking the
 * theft-bearing ones by name: which cells carry theft is a property of the
 * grid, and the grid is in `@mm/content`, which §5 does not grant the harness.
 * The comment on {@link PORTAL_CELL_IS_UNRESOLVABLE_HERE} applies here too.
 */
const DENIAL_WARDEN: StrategyDefinition = {
  strategyId: 'denial-warden',
  version: 1,
  hypothesis:
    'Whether the god can suppress a capability at all. It forbids and interdicts as hard as the ' +
    'edict budget allows, so it probes whether the ruleset is load-bearing: if the knowledge ' +
    'census under denial-warden is indistinguishable from the census under passive-control, then ' +
    'the ruleset is decorative and every balance number that assumes the god constrains magic is ' +
    'measuring something else. Once raids land it is also the defensive arm of the theft question.',
  signatureActions: [
    GOD_ACTION.forbidTechnique,
    GOD_ACTION.forbidForm,
    GOD_ACTION.issueInterdiction,
    GOD_ACTION.revokeEdict,
  ],
  preferences: ({ round }) => [
    { action: GOD_ACTION.issueInterdiction, parameter: (round % 70) + 1 },
    { action: GOD_ACTION.forbidTechnique, parameter: technique(round) },
    { action: GOD_ACTION.forbidForm, parameter: form(round) },
    // When the edict budget is full the mask closes both issue actions, and the
    // warden's answer is to recycle its oldest edict rather than to stop.
    { action: GOD_ACTION.revokeEdict, parameter: 0 },
  ],
};

/**
 * Buys redundancy: universities, founding grants, and blessings for the mages
 * most likely to be lost.
 *
 * Slot 0 of `blessMage` is the *most depleted* living mage — `candidates.ts`
 * ranks by ascending vigor — which is exactly the mage an archivist wants to
 * keep alive, so the archivist takes slot 0 and does not rotate.
 */
const ARCHIVIST: StrategyDefinition = {
  strategyId: 'archivist',
  version: 1,
  hypothesis:
    'Whether redundancy defeats the loss channel. §6a makes knowledge capital and §2.4 makes it ' +
    'decay; the archivist buys insurance — more universities, more founding instances, more ' +
    'blessings for the mages nearest death — and probes whether that insurance pays. ' +
    'knowledgeHalfLife and libraryDependence are the two metrics that would separate it from ' +
    'every other strategy, and if neither does, redundancy is free or worthless and the loss ' +
    'model needs re-reading either way.',
  signatureActions: [
    GOD_ACTION.fundUniversity,
    GOD_ACTION.grantFoundingKnowledge,
    GOD_ACTION.blessMage,
    GOD_ACTION.assignRole,
  ],
  preferences: ({ observation, round }) => {
    const libraries = channel(observation, LIBRARY_DEPTH);
    const preferred: ActionSubmission[] = [];
    // Below a shallow library, build the shelves; above it, fill them.
    if (libraries < 0.05) {
      preferred.push({ action: GOD_ACTION.fundUniversity, parameter: 0 });
    }
    preferred.push(
      { action: GOD_ACTION.grantFoundingKnowledge, parameter: rotate(GOD_ACTION.grantFoundingKnowledge, round) },
      { action: GOD_ACTION.blessMage, parameter: 0 },
      { action: GOD_ACTION.assignRole, parameter: rotate(GOD_ACTION.assignRole, round) },
      { action: GOD_ACTION.fundUniversity, parameter: rotate(GOD_ACTION.fundUniversity, round) },
    );
    return preferred;
  },
};

/**
 * Reaches for a portal every round it can, and takes tempo when it cannot.
 *
 * Its first preference is `openPortal`, which in a single-universe Monte Carlo
 * run has no candidates and is therefore always masked (see
 * `candidates.ts`'s note on `portalTargets`). That is not a bug in the strategy
 * — it is the case the fall-through exists for, and the capability spec names
 * this strategy in the scenario that pins it.
 */
const PORTAL_RUSH: StrategyDefinition = {
  strategyId: 'portal-rush',
  version: 1,
  hypothesis:
    'Whether reaching the portal early is worth the tempo it costs. It is the strategy the raid ' +
    'economy is supposed to reward, so it probes whether the multiverse is a strategic axis or a ' +
    'setting: if portal-rush is indistinguishable from permissive-breadth once raids land, then ' +
    'opening a portal early buys nothing and prestigeAdvantage is measuring a coin flip.',
  signatureActions: [GOD_ACTION.openPortal, GOD_ACTION.declareAscension],
  preferences: ({ round }) => [
    { action: GOD_ACTION.openPortal, parameter: rotate(GOD_ACTION.openPortal, round) },
    // Tempo while the portal is unreachable: push the deepest cell and permit
    // the technique that would open more of it.
    { action: GOD_ACTION.encourageResearch, parameter: 0 },
    { action: GOD_ACTION.permitTechnique, parameter: technique(round) },
    { action: GOD_ACTION.declareAscension },
  ],
};

/**
 * Optimizes for favor regeneration.
 *
 * Conditions on the `resources` block's `favor` and `worship` channels, which
 * exist in §4.1 and in the state schema but which nothing in this build moves.
 * That is recorded in {@link POOL_BUILD_LIMITS}; the strategy is written
 * against the channels rather than against a guess so that the day `god-agency`
 * makes them move, this strategy starts differentiating without being rewritten.
 */
const WORSHIP_MAXIMIZER: StrategyDefinition = {
  strategyId: 'worship-maximizer',
  version: 1,
  hypothesis:
    'Whether favor is a binding constraint. §8 prices the god\'s actions in favor and regenerates ' +
    'it from worship; this strategy spends on the things that should raise worship and holds ' +
    'favor otherwise, probing whether the economy binds. If worship-maximizer can afford no more ' +
    'actions per run than uniform-random-legal, the prices are not constraining anything and the ' +
    'favor economy is decoration.',
  signatureActions: [GOD_ACTION.blessMage, GOD_ACTION.fundUniversity, GOD_ACTION.changeTradition],
  preferences: ({ observation, round }) => {
    const favor = channel(observation, FAVOR);
    const worship = channel(observation, WORSHIP);
    const preferred: ActionSubmission[] = [];
    // Poor: hold. A no-op costs nothing, and "chose to pass" is a decision the
    // metrics distinguish from "was refused" — which is the whole point of the
    // capability spec's third degradation scenario.
    if (favor < 0.1) return preferred;
    // Worship low relative to favor: buy visibility — blessings and buildings.
    if (worship < favor) {
      preferred.push(
        { action: GOD_ACTION.blessMage, parameter: rotate(GOD_ACTION.blessMage, round) },
        { action: GOD_ACTION.fundUniversity, parameter: 0 },
      );
    }
    preferred.push(
      { action: GOD_ACTION.fundUniversity, parameter: rotate(GOD_ACTION.fundUniversity, round) },
      // A tradition change is the one lever §2.5 gives over how casting is
      // priced, so a strategy about prices tries it once the cheap moves are
      // masked.
      { action: GOD_ACTION.changeTradition, parameter: rotate(GOD_ACTION.changeTradition, round) },
    );
    return preferred;
  },
};

/**
 * The pool, in registration order.
 *
 * Eight, which is the capability spec's *"at least eight"*. Order is the order
 * the spec lists the roles in, not alphabetical: {@link botStrategyRegistry}
 * sorts the ids it publishes, and this array is what a reader compares against
 * the spec paragraph.
 */
export const BOT_POOL: readonly StrategyDefinition[] = Object.freeze([
  PASSIVE_CONTROL,
  UNIFORM_RANDOM_LEGAL,
  PERMISSIVE_BREADTH,
  NARROW_DEPTH,
  DENIAL_WARDEN,
  ARCHIVIST,
  PORTAL_RUSH,
  WORSHIP_MAXIMIZER,
]);

// ---------------------------------------------------------------------------
// The registry.
// ---------------------------------------------------------------------------

/**
 * The strategy registry: `StrategyRegistry` plus the definitions behind it.
 *
 * `metrics.ts` declares `StrategyRegistry` as `{ids, has}` — enough for the
 * sweep validator to reject an unknown strategy before dispatch, which is all
 * task 3.4 needed. This widens it without editing that declaration, and the
 * widened type is structurally assignable to it, so a `SweepRegistries` takes
 * this object directly.
 */
export interface BotStrategyRegistry {
  readonly ids: readonly string[];
  has(id: string): boolean;
  /** The definition, or `undefined`. */
  get(id: string): StrategyDefinition | undefined;
  /** Every definition, in {@link BOT_POOL} order. */
  readonly definitions: readonly StrategyDefinition[];
}

/** Builds a registry over an explicit list, rejecting duplicates and bad ids. */
export function botStrategyRegistry(
  definitions: readonly StrategyDefinition[],
): BotStrategyRegistry {
  const byId = new Map<string, StrategyDefinition>();
  for (const definition of definitions) {
    if (definition.strategyId.length === 0) {
      throw new Error('A strategy needs a non-empty strategyId — it is what a run record carries.');
    }
    if (!Number.isInteger(definition.version) || definition.version < 1) {
      throw new Error(
        `Strategy ${definition.strategyId} declares version ${String(definition.version)}. A ` +
          'version is what tells two tournaments apart when the behaviour behind one id changed.',
      );
    }
    if (definition.hypothesis.trim().length === 0) {
      throw new Error(
        `Strategy ${definition.strategyId} declares no probe hypothesis. Task 5.1 requires one ` +
          'because a tournament between strategies nobody can say the purpose of is decorative.',
      );
    }
    if (byId.has(definition.strategyId)) {
      throw new Error(`Duplicate strategy id ${definition.strategyId} in the registry.`);
    }
    byId.set(definition.strategyId, definition);
  }
  const ids = [...byId.keys()].sort();
  return {
    ids,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    definitions: Object.freeze([...definitions]),
  };
}

/** The shipped pool. What a sweep file's `agentPool.strategies` is validated against. */
export const BOT_POOL_REGISTRY: BotStrategyRegistry = botStrategyRegistry(BOT_POOL);

// ---------------------------------------------------------------------------
// Fall-through (task 5.6).
// ---------------------------------------------------------------------------

/**
 * Builds the {@link SlotPolicy} for one strategy in one episode.
 *
 * The fall-through is the three lines in the middle, and they are the whole of
 * task 5.6: walk the preference list, submit the first entry the mask permits,
 * and fall back to `noop`.
 *
 * **The mask is the only filter applied.** A slot index past the end of a
 * shorter-than-*k* candidate list is still submitted, and §4.4 makes that an
 * ordinary illegal action — a no-op and a counter increment. Filtering it here
 * would be the harness quietly improving its own bots, and it would suppress
 * exactly the `illegalActionRate` signal §7 asks for: the mask cannot express
 * "action 9, but only slots 0–3", so slot exhaustion is *the* rejection reason a
 * well-behaved strategy can still produce, and a pool that produced none would
 * leave that path untested until an RL agent found it.
 */
export function policyFor(definition: StrategyDefinition, context: StrategyContext): SlotPolicy {
  let round = 0;
  return (observation: Float64Array, mask: Uint8Array): ActionSubmission => {
    const preferences = definition.preferences({ observation, mask, round, context });
    round += 1;
    for (const preference of preferences) {
      if (isLegal(mask, preference.action)) return preference;
    }
    return { action: GOD_ACTION.noop };
  };
}

/**
 * Builds one episode's policies from the strategy ids a run was assigned.
 *
 * The generator is derived per slot from `(runSeed, agentSlotIndex,
 * strategyId)`, so the same strategy in slot 0 and in slot 1 of a mirrored pair
 * does not draw the same numbers — which is what stops a mirrored comparison
 * from being two copies of one sample.
 *
 * @throws Error naming the strategy a run was assigned that the registry does
 * not hold. The sweep validator rejects this before dispatch (task 3.4); this
 * is the second wall, for a caller that built a task by hand.
 */
export function policiesForRun(input: {
  readonly registry: BotStrategyRegistry;
  readonly strategies: readonly string[];
  readonly runSeed: number;
}): SlotPolicy[] {
  return input.strategies.map((strategyId, agentSlotIndex) => {
    const definition = input.registry.get(strategyId);
    if (definition === undefined) {
      throw new Error(
        `No strategy named ${strategyId} in the registry. Registered: ` +
          `${input.registry.ids.join(', ') || '(none)'}.`,
      );
    }
    return policyFor(definition, {
      runSeed: input.runSeed,
      agentSlotIndex,
      rng: agentRng({ runSeed: input.runSeed, agentSlotIndex, strategyId }),
    });
  });
}

// ---------------------------------------------------------------------------
// Degeneracy (the honesty half of task group 5).
// ---------------------------------------------------------------------------

/** What {@link degeneracyOf} found about one strategy against one mask. */
export interface DegeneracyReport {
  readonly strategyId: string;
  /** Signature actions the mask permits. */
  readonly reachable: readonly number[];
  /** Signature actions the mask forbids. */
  readonly unreachable: readonly number[];
  /**
   * `true` when the strategy has signature actions and none is reachable — it
   * will fall through to `noop` for as long as this mask holds, which makes it
   * a second copy of the passive control.
   *
   * The passive control itself is never degenerate: it has no signature
   * actions, so there is nothing it is failing to reach.
   */
  readonly degenerate: boolean;
}

/**
 * Whether a strategy can be itself against a given mask.
 *
 * Takes a mask rather than a session, because the question is about the action
 * space and not about a run — and because a caller wanting the answer for a
 * whole episode should ask it per tick and fold, rather than trusting the first
 * tick's mask to describe the rest.
 */
export function degeneracyOf(
  definition: StrategyDefinition,
  mask: Uint8Array,
): DegeneracyReport {
  const reachable: number[] = [];
  const unreachable: number[] = [];
  for (const action of definition.signatureActions) {
    (isLegal(mask, action) ? reachable : unreachable).push(action);
  }
  return {
    strategyId: definition.strategyId,
    reachable: Object.freeze(reachable),
    unreachable: Object.freeze(unreachable),
    degenerate: definition.signatureActions.length > 0 && reachable.length === 0,
  };
}

/** {@link degeneracyOf} across a whole registry, in registration order. */
export function poolDegeneracy(
  registry: BotStrategyRegistry,
  mask: Uint8Array,
): readonly DegeneracyReport[] {
  return registry.definitions.map((definition) => degeneracyOf(definition, mask));
}

/**
 * What this build cannot yet let a strategy do, and why. **Prose on purpose.**
 *
 * Every entry here is a claim about code in packages the harness may not
 * import, so none of it can be tested from here. It is committed anyway,
 * because the alternative is that a reader of a tournament summary at 0.5.0
 * concludes from a flat pairwise matrix that the strategies are equivalent —
 * when in fact the god's verbs have no consumers and the matrix could not have
 * come out any other way.
 *
 * Delete an entry when the mechanic lands. An entry that outlives its mechanic
 * is worse than none, because it excuses a real flat result.
 */
export const POOL_BUILD_LIMITS: Readonly<Record<string, string>> = Object.freeze({
  'every-god-action':
    'No system in rules-magic, rules-world, rules-raid or coordination reads ctx.actions in this ' +
    'build. sim-core hands the admitted actions to the systems and the systems ignore them, so ' +
    'every god action 1–15 is admitted, counted as a submission, and then has no effect. Until ' +
    'god-agency (0.7.0) lands, EVERY strategy in the pool is effect-degenerate: it submits ' +
    'different actions from its neighbours and produces the same world. A pairwise matrix taken ' +
    'now measures the harness, not the game.',
  'open-portal':
    'Action 14 has no candidates in a single-universe run — candidates.ts derives them from a ' +
    'caller-supplied portalTargets list, and contracts.md §1.1 puts exactly one universe in a ' +
    'simulation instance. It is therefore permanently MASKED, not merely inert, which makes ' +
    'portal-rush the one strategy that is masked-degenerate and detectable as such by ' +
    'degeneracyOf. Raids land in 0.9.0.',
  worship:
    'The resources block carries favor, worship and worshipTier because §4.1 and the state schema ' +
    'define them, but nothing in this build moves them: the worship loop is §8, i.e. god-agency. ' +
    'worship-maximizer therefore reads two channels that are constant for the whole run and takes ' +
    'the same branch every round.',
  'ascension-eligibility':
    'declareAscension is masked only by "this run is already over" — mask.ts says so, and says ' +
    'that the eligibility rule itself belongs to god-agency (vision §8a). So the action is legal ' +
    'from tick zero and does nothing, which is why no strategy in the pool prefers it first.',
});
