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
 * ## When a strategy would declare ascension is a field, not a list position
 *
 * Every strategy declares an {@link AscensionStance}, and
 * {@link effectivePreferences} composes it into the list `policyFor` walks.
 * Read that type before changing a stance: the measurement that made it
 * necessary is recorded there, and it is the reason no strategy below lists
 * `declareAscension` among its own preferences.
 *
 * ## Degeneracy is declared, not discovered
 *
 * `god-agency` (0.7.0) has landed, and with it most of what these strategies
 * want: `coordination/src/god/interventions.ts` implements all fifteen verbs,
 * worship accrues, favor regenerates and is spent, and a universe can ascend or
 * stagnate. Measured at 2400 ticks in the reference universe, the pool now
 * spreads from 9 distinct nodes known (`narrow-depth`) to 249
 * (`permissive-breadth`) — so the strategies produce different worlds, which is
 * the thing `design.md` said specifying the pool early would force. What is
 * still missing is raids (0.9.0), and the ways in which the god's verbs are
 * reachable-but-not-effective are enumerated in {@link POOL_BUILD_LIMITS}.
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
 * - **Effect-degenerate**: the action is admitted and then consumed by nobody,
 *   or admitted and then refused by a precondition the mask cannot express.
 *   Each surviving case is recorded in {@link POOL_BUILD_LIMITS} rather than
 *   tested, because testing any of them from here would mean importing the
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
   * **When this strategy would declare ascension, and why.**
   *
   * Required. See {@link AscensionStance} for what it is for and what it cost
   * not to have it.
   */
  readonly ascension: AscensionStance;
  /**
   * The actions without which this strategy is not distinguishable from the
   * passive control. See {@link degeneracyOf}.
   *
   * The passive control's list is empty, and that is the correct answer for it:
   * it needs nothing to be itself.
   */
  readonly signatureActions: readonly number[];
  /**
   * What the strategy would like, most-preferred first. `noop` is appended for
   * it, and its {@link StrategyDefinition.ascension} stance is composed in by
   * {@link effectivePreferences} — a strategy does **not** list
   * `declareAscension` here.
   */
  preferences(input: PreferenceInput): readonly ActionSubmission[];
}

// ---------------------------------------------------------------------------
// The ascension stance.
// ---------------------------------------------------------------------------

/**
 * The four answers a strategy may give to *"when would you declare ascension?"*
 *
 * ## Why this is a field and not a line in a preference list
 *
 * It was a line in a preference list, and the measurement is what this type
 * exists to prevent happening again. At 2400 world ticks against `main` @
 * `71261e9`, `uniform-random-legal` ascended 10 runs of 10 and every other
 * strategy ascended 0 of 10. Not because random play is strong: because
 * {@link policyFor} submits the first preference the mask permits, only
 * `portal-rush` listed `declareAscension` at all, and it sat behind
 * `encourageResearch` and `permitTechnique` — both always legal. Seven of eight
 * strategies could not win whatever they did, and the tournament measured
 * preference-list ordering rather than play.
 *
 * Moving `declareAscension` up six lists by hand would have fixed that
 * particular symptom and left the mechanism exactly where it was: a strategy's
 * ability to win still decided by where a line happened to sit. So the question
 * is asked of every strategy, the registry refuses a strategy that does not
 * answer it, and the answer carries a reason that a reader can compare against
 * the strategy's own {@link StrategyDefinition.hypothesis}.
 *
 * **`never` is an answer.** Silence is a bug.
 */
export const ASCENSION_STANCE = {
  /**
   * This strategy will not declare, ever, and {@link effectivePreferences}
   * enforces it by removing action 15 from what the strategy asked for.
   *
   * Enforced rather than trusted because the value of a control is that it did
   * not do the thing, and "it happened not to come up" is a different claim.
   */
  never: 'never',
  /**
   * No privileged position. The declaration appears only if the strategy's own
   * preference generation emits it.
   *
   * The stance of a bot whose distribution *is* its purpose: prepending an
   * action to a uniform draw over the legal set makes it a different bot, and
   * the noise floor is worth nothing if nobody can say what it is a floor of.
   */
  asDrawn: 'as-drawn',
  /** Declare on the first round the mask permits it. Most-preferred, always. */
  whenEligible: 'when-eligible',
  /**
   * Declare on the first permitted round at or after `notBefore` rounds of play.
   *
   * A round is one submission, and at one agent slot the harness submits once
   * per world tick — so `notBefore` is readable as a world tick, and the
   * rationale of a strategy that uses it should say which tick it is naming.
   */
  afterRounds: 'after-rounds',
} as const;

/** One strategy's declared answer, with the reason it gives. */
export type AscensionStance =
  | { readonly when: typeof ASCENSION_STANCE.never; readonly because: string }
  | { readonly when: typeof ASCENSION_STANCE.asDrawn; readonly because: string }
  | { readonly when: typeof ASCENSION_STANCE.whenEligible; readonly because: string }
  | {
      readonly when: typeof ASCENSION_STANCE.afterRounds;
      /** Rounds of play to complete before the summit becomes a preference. */
      readonly notBefore: number;
      readonly because: string;
    };

/** The declaration, as a submission. It takes no parameter. */
const DECLARE: ActionSubmission = Object.freeze({ action: GOD_ACTION.declareAscension });

/**
 * The preference list {@link policyFor} actually walks: what the strategy asked
 * for, with its ascension stance composed in.
 *
 * Exported because it is what a test of fall-through has to compare against.
 * The fall-through itself is unchanged and stays where it was — this function
 * decides *what is in the list*, and `policyFor` still submits the first entry
 * of it the mask permits, and still ends at `noop`.
 */
export function effectivePreferences(
  definition: StrategyDefinition,
  input: PreferenceInput,
): readonly ActionSubmission[] {
  const own = definition.preferences(input);
  const stance = definition.ascension;
  switch (stance.when) {
    case ASCENSION_STANCE.never:
      // Enforced, not assumed. A strategy that declared "never" and then drew
      // action 15 out of some other rule would be a control that won, and the
      // whole point of asking the question is that the answer is checkable.
      return own.filter((preference) => preference.action !== GOD_ACTION.declareAscension);
    case ASCENSION_STANCE.asDrawn:
      return own;
    case ASCENSION_STANCE.whenEligible:
      return [DECLARE, ...own];
    case ASCENSION_STANCE.afterRounds:
      return input.round >= stance.notBefore ? [DECLARE, ...own] : own;
    default:
      return own;
  }
}

/** Why a stance is not usable, or `undefined`. Used by {@link botStrategyRegistry}. */
function stanceProblem(stance: AscensionStance | undefined): string | undefined {
  if (stance === undefined || typeof stance !== 'object') {
    return 'declares no ascension stance';
  }
  const known: readonly string[] = Object.values(ASCENSION_STANCE);
  if (!known.includes(stance.when)) {
    return `declares an ascension stance of "${String(stance.when)}", which is not one of ${known.join(', ')}`;
  }
  if (typeof stance.because !== 'string' || stance.because.trim().length === 0) {
    return 'declares an ascension stance with no reason';
  }
  if (stance.when === ASCENSION_STANCE.afterRounds) {
    if (!Number.isInteger(stance.notBefore) || stance.notBefore < 0) {
      return (
        'declares an ascension stance of "after-rounds" with notBefore ' +
        `${String(stance.notBefore)}, which is not a whole, non-negative round count`
      );
    }
  }
  return undefined;
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
 * consequence of them going stale is now visible rather than merely bounded:
 * `agent-api`'s gate range-checks these two parameters against the real
 * constants and reports `parameter-out-of-range`, so a stale copy raises
 * `illegalActionRate` for exactly one action id. That is the failure mode a
 * rate metric is for, and until the gate learned the check it was not the
 * failure mode this file actually had — see below.
 *
 * ## The ids are 1-based, and were not
 *
 * `coordination/src/god/interventions.ts` refuses an axis id outside
 * `1..count` and flips bit `id - 1`. The rotations here were `round % count`,
 * i.e. `0..count-1`, with two measured consequences that survived into every
 * balance number this project has ever published:
 *
 * - One `permitTechnique` in five and one `permitForm` in fourteen named `0`
 *   and was refused. The mask said the action was legal, so `policyFor` did not
 *   fall through, and the round bought nothing.
 * - **Technique 5 and form 14 were never named by any strategy**, so the top
 *   row and the last column of §2.1's grid were unreachable in every sweep.
 *
 * Neither showed up anywhere. The refusal happened inside the dispatch, which
 * counts it on `state.illegalActionCount`; §7's `illegalActionRate` is
 * collected from the session's counters instead, and they never saw it.
 */
const GRID_TECHNIQUES = 5;
const GRID_FORMS = 14;

/** The technique id this round names, cycling over `1..GRID_TECHNIQUES`. */
function technique(round: number): number {
  return 1 + (round % GRID_TECHNIQUES);
}

/** The form id this round names, cycling over `1..GRID_FORMS`. */
function form(round: number): number {
  return 1 + (round % GRID_FORMS);
}

/**
 * The same cycles, one id short, so that one axis value is never named.
 *
 * `narrow-depth` is defined by keeping exactly one technique and one form, and
 * these rotations are what leave it one: they cover `1..count-1` and therefore
 * **never name the top id**, which is the one the strategy keeps. Written as
 * their own helpers rather than as a conditional inside the rotation, because
 * "skip a value unless it comes up" and "never emit a value" are different, and
 * the first one is the bug.
 *
 * They were already emitting `1..count-1` before the rotations above were made
 * 1-based, and they are deliberately left alone. Under the corrected reading
 * that is a valid range naming every id but the last, so the helpers had
 * neither half of the defect — no refused submission and no unreachable id —
 * and changing them would have moved which cell `narrow-depth` builds its whole
 * run on, which is a second variable inside the measurement that exists to
 * remove one. What *was* wrong here was the comment: it said the kept value was
 * index 0. It is the top id.
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
  ascension: {
    when: ASCENSION_STANCE.never,
    because:
      'A control that presses the win button is not a control. Every other strategy\'s effect is ' +
      'measured as a difference from this one, and a run this strategy ended early is a run whose ' +
      'census stops at the tick it stopped — so the null hypothesis would be shorter than the ' +
      'thing it is the null hypothesis for. It is also what makes the pool\'s eventual answer to ' +
      '"does ascension follow from play" readable: passive-control is the arm that did nothing, ' +
      'and it must not be able to win by doing nothing.',
  },
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
  ascension: {
    when: ASCENSION_STANCE.asDrawn,
    because:
      'The floor is worth exactly what can be said about its distribution, and what is said about ' +
      'it is "uniform over the legal set". Action 15 is in that set the moment eligibility opens, ' +
      'so this strategy declares about one round in however many are legal — which is why it was ' +
      'the only winner in the 2400-tick probe. Privileging the declaration would raise that rate ' +
      'and stop the number being a floor; removing it would make the floor blind to the one action ' +
      'that ends a run. Neither is a stance. Drawing it like everything else is.',
  },
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
  // 3: the technique and form rotations became 1-based ids. One permit in five
  // and one in fourteen used to name `0` and be refused, and this strategy
  // could never permit technique 5 or form 14 — a fifth of the technique axis
  // and a fourteenth of the form axis that the pool's widest ruleset never
  // opened.
  version: 3,
  hypothesis:
    'Whether breadth outruns the loss channel. A wide ruleset offers more nodes to discover and ' +
    'more institutions to hold them; §6a says knowledge decays and is lost, so breadth might ' +
    'instead spread a fixed teaching capacity too thin. It probes the sign of that trade: if ' +
    'permissive-breadth beats narrow-depth on ascension rate but loses on knowledgeHalfLife, the ' +
    'loss model has teeth and the god is choosing between two real goods.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'Its hypothesis is scored against narrow-depth *on ascension rate*, so it has to be able to ' +
      'score. Declaring on the first permitted round makes the measurement clean: both strategies ' +
      'take the summit the moment it opens, so the difference between them is entirely the ' +
      'difference in when a wide ruleset and a narrow one become eligible — which is the thing the ' +
      'hypothesis is about. A delay here would be a second variable nobody asked for.',
  },
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
  version: 2,
  hypothesis:
    'Whether concentration beats breadth. It permits one technique and one form and pushes the ' +
    'single deepest permitted cell every round, so it probes whether tier progression is the ' +
    'binding constraint on ascension — and, symmetrically, whether a narrow ruleset makes a ' +
    'universe brittle: one cell is one thing to lose, and timeToTierBySpecies against a narrow ' +
    'ruleset is the measurement that would say so.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'The symmetric half of permissive-breadth\'s stance, and it has to be symmetric or the ' +
      'comparison the two hypotheses set up is not a comparison. Path A also happens to be the ' +
      'condition this strategy is built for — a mage holding the deepest node of a *permitted* ' +
      'cell, with two live instances of it — so if concentration is the faster route to a summit, ' +
      'this is the arm that shows it, and it can only show it by taking one.',
  },
  signatureActions: [
    GOD_ACTION.forbidTechnique,
    GOD_ACTION.forbidForm,
    GOD_ACTION.encourageResearch,
  ],
  preferences: ({ round }) => [
    // Forbid everything except the top id of each axis, which is the "minimal
    // set" this strategy is defined by. The rotation never reaches that id
    // rather than excluding it conditionally, so there is no round on which it
    // forbids its own cell.
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
  // 3: the forbid rotations became 1-based ids, so the warden now reaches
  // technique 5 and form 14. Before this it could not forbid either, which
  // means the "as hard as the edict budget allows" claim in its hypothesis was
  // false about two axis values it never named.
  version: 3,
  hypothesis:
    'Whether the god can suppress a capability at all. It forbids and interdicts as hard as the ' +
    'edict budget allows, so it probes whether the ruleset is load-bearing: if the knowledge ' +
    'census under denial-warden is indistinguishable from the census under passive-control, then ' +
    'the ruleset is decorative and every balance number that assumes the god constrains magic is ' +
    'measuring something else. Once raids land it is also the defensive arm of the theft question.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'A denying god still wants to win, and what it does to its own chances is the sharpest ' +
      'reading of whether the ruleset binds. Path A requires the cell of the qualifying node to be ' +
      'permitted *at the moment of declaration*, so a warden that has forbidden the grid can ' +
      'qualify by the Enduring Canon or not at all — and "never became eligible" is then a measured ' +
      'consequence of denial rather than a stance. The rejected alternative was to declare only ' +
      'once every edict was masked, which reads as prudence and is "never" in costume: revokeEdict ' +
      'is legal whenever an edict exists, so the fall-through would never have reached the summit.',
  },
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
  version: 2,
  hypothesis:
    'Whether redundancy defeats the loss channel. §6a makes knowledge capital and §2.4 makes it ' +
    'decay; the archivist buys insurance — more universities, more founding instances, more ' +
    'blessings for the mages nearest death — and probes whether that insurance pays. ' +
    'knowledgeHalfLife and libraryDependence are the two metrics that would separate it from ' +
    'every other strategy, and if neither does, redundancy is free or worthless and the loss ' +
    'model needs re-reading either way.',
  ascension: {
    when: ASCENSION_STANCE.afterRounds,
    // Twice `ascension-min-tick`, which is 600 at this content revision — so
    // world-year 100, and the archivist has had as long again as the earliest
    // possible summit to build the thing it is arguing about. Written here
    // rather than read from content because §5 grants the harness no edge to
    // `@mm/content`; if the constant moves, this stops being "twice the floor"
    // and becomes a fixed tick, which is a change of meaning and not a bug that
    // hides. `POOL_BUILD_LIMITS` is where that kind of coupling is recorded.
    notBefore: 1200,
    because:
      'The archivist is the one strategy whose thesis is about what survives, and knowledgeHalfLife ' +
      'and libraryDependence are measured over the run rather than at its end. Declaring at first ' +
      'eligibility would truncate the archive at the moment it started being worth measuring — the ' +
      'strategy would win its run and lose its experiment. So it is patient on purpose, and the ' +
      'patience is a number: 1200 rounds, twice the current ascension floor of 600, which at one ' +
      'submission per world tick is world-year 100. It is also the pool\'s probe for whether waiting ' +
      'costs anything: if an archivist that waits a century still ascends as often as one that does ' +
      'not, then eligibility does not lapse and the summit is a standing offer.',
  },
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
  // 3: its one ruleset move, the tempo `permitTechnique`, became a 1-based id.
  //
  // Bumped even though a 96-run seed-matched A/B at 2400 ticks produced
  // byte-identical records before and after. That is not evidence the change is
  // cosmetic — it is evidence the entry is currently unreachable: it sits third,
  // behind `openPortal` and `encourageResearch`, and `encourageResearch` is
  // legal in every round `openPortal` is masked, which in a single-universe run
  // is all of them. The version is a claim about the definition, not about
  // whether this build happens to exercise it, and the day `openPortal` becomes
  // reachable this strategy names a different technique than it used to.
  version: 3,
  hypothesis:
    'Whether reaching the portal early is worth the tempo it costs. It is the strategy the raid ' +
    'economy is supposed to reward, so it probes whether the multiverse is a strategic axis or a ' +
    'setting: if portal-rush is indistinguishable from permissive-breadth once raids land, then ' +
    'opening a portal early buys nothing and prestigeAdvantage is measuring a coin flip.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'A rush strategy takes the ending. Everything else about this bot is tempo — reach the portal ' +
      'first, and push one cell while the portal is unreachable — and a racer that declined the ' +
      'finish line would be measuring something other than the race. This is also the entry that ' +
      'used to be the last line of the preference list below, where it could never be reached, and ' +
      'the reason the whole field exists: it made portal-rush the only strategy that *looked* able ' +
      'to win while being one of the seven that could not.',
  },
  signatureActions: [GOD_ACTION.openPortal, GOD_ACTION.declareAscension],
  preferences: ({ round }) => [
    { action: GOD_ACTION.openPortal, parameter: rotate(GOD_ACTION.openPortal, round) },
    // Tempo while the portal is unreachable: push the deepest cell and permit
    // the technique that would open more of it.
    { action: GOD_ACTION.encourageResearch, parameter: 0 },
    { action: GOD_ACTION.permitTechnique, parameter: technique(round) },
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
  version: 2,
  hypothesis:
    'Whether favor is a binding constraint. §8 prices the god\'s actions in favor and regenerates ' +
    'it from worship; this strategy spends on the things that should raise worship and holds ' +
    'favor otherwise, probing whether the economy binds. If worship-maximizer can afford no more ' +
    'actions per run than uniform-random-legal, the prices are not constraining anything and the ' +
    'favor economy is decoration.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'Path A gates on worship tier, and this is the strategy whose whole thesis is worship. It is ' +
      'therefore the pool\'s sharpest single test of whether the ascension gate reads play at all: ' +
      'if a bot that spends every round buying visibility becomes eligible no earlier than one that ' +
      'never touches worship, the tier gate is being met by passive accrual and Path A is a clock ' +
      'rather than an achievement. That reading only exists if it declares on the first round it can.',
  },
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

// ---------------------------------------------------------------------------
// Adversarial probes added by the W6 verification (branch
// w6-verify/positive-achievement). These exist to falsify two of W6's claims and
// are not part of the shipped pool's argument.
// ---------------------------------------------------------------------------

/**
 * The honest idle-then-declare probe: do nothing, ever, and declare on the first
 * round the mask permits it.
 *
 * W6 measures its exploit margin against `uniform-random-legal`, which is a
 * *crippled* probe rather than an idle one: it submits actions 1–7 bare, and
 * `CANDIDATE_SLOTS` covers only 8–14, so those submissions are refused and it
 * effectively presses buttons 8–15 at random. A margin measured against it can
 * say "this bot is broken" rather than "playing beats not playing". This one is
 * the control that separates the two — its preference list is empty, so
 * `policyFor` submits `DECLARE` when legal and `noop` otherwise, and nothing
 * else ever.
 */
const IDLE_THEN_DECLARE: StrategyDefinition = {
  strategyId: 'idle-then-declare',
  version: 1,
  hypothesis:
    'The exploit probe W6\'s margin claims to be measured against. It plays nothing and takes the ' +
    'summit the instant the mask opens it, so its ascension rate is exactly the rate at which the ' +
    'win condition is reachable without playing. If it wins as often as the pool, the exploit ' +
    'margin measures uniform-random-legal\'s parameter bug rather than the predicate.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'That is the definition of the probe. "Idle then declare" is one policy, and the declaration ' +
      'has to be most-preferred or the measurement is of when a random draw happened to reach it.',
  },
  signatureActions: [GOD_ACTION.declareAscension],
  preferences: () => [],
};

/**
 * Permit the whole grid for the first stretch of the run, then idle.
 *
 * The degenerate-play probe. W6's predicates are anchored above the passive
 * ceiling on the argument that clearing them requires "the god permitted an axis
 * the universe did not start with" — which is a statement about the *ruleset*,
 * not about anything the universe achieved. This bot funds nothing, encourages
 * nothing, teaches nothing and blesses nobody; it presses two buttons for 140 of
 * 2400 ticks and then does literally nothing for the remaining 2260.
 */
const PERMIT_THEN_IDLE: StrategyDefinition = {
  strategyId: 'permit-then-idle',
  version: 1,
  hypothesis:
    'Whether W6\'s "positive achievement" is an achievement or a ruleset edit. It opens the grid ' +
    'with permitTechnique/permitForm alone for 140 rounds and then submits nothing at all for the ' +
    'remaining 2260 ticks. If it clears the predicates at permissive-breadth\'s rate, then the ' +
    'conjuncts read what the god permitted, not what the universe did — and the universe learns ' +
    'the newly-permitted nodes on its own, exactly as it learns the original fifty-one.',
  ascension: {
    when: ASCENSION_STANCE.whenEligible,
    because:
      'Symmetric with permissive-breadth, which it is the ablation of: same declaration policy, ' +
      'every non-permit action removed. A difference in stance would be a second variable.',
  },
  signatureActions: [GOD_ACTION.permitTechnique, GOD_ACTION.permitForm],
  preferences: ({ round }) =>
    round >= 140
      ? []
      : [
          { action: GOD_ACTION.permitTechnique, parameter: technique(round) },
          { action: GOD_ACTION.permitForm, parameter: form(round) },
        ],
};

/**
 * The pool, in registration order.
 *
 * Eight, which is the capability spec's *"at least eight"*. Order is the order
 * the spec lists the roles in, not alphabetical: {@link botStrategyRegistry}
 * sorts the ids it publishes, and this array is what a reader compares against
 * the spec paragraph.
 *
 * The two verification probes are appended rather than inserted so that
 * `round-robin` assignment — `strategies[replicateIndex % size]` over the *sweep
 * file's* list, not this one — is unaffected for any sweep that does not name
 * them.
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
  IDLE_THEN_DECLARE,
  PERMIT_THEN_IDLE,
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
    const stance = stanceProblem(definition.ascension);
    if (stance !== undefined) {
      throw new Error(
        `Strategy ${definition.strategyId} ${stance}. When a strategy would declare ascension is ` +
          'the difference between a pool that can win and a pool that measures preference-list ' +
          'ordering, and it was the second for a whole release. "never" is an answer; silence is ' +
          'not one.',
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
 * The list it walks is {@link effectivePreferences} — what the strategy asked
 * for, with its declared ascension stance composed in. That is a change to
 * *what is in the list* and not to how the list is read: the loop below is the
 * loop that was here before, and `strategy-pool.test.ts` and
 * `ascension-stance.test.ts` both assert it against the effective list.
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
    const preferences = effectivePreferences(definition, { observation, mask, round, context });
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
  'open-portal':
    'Action 14 is implemented and unreachable, which are different things and both are true. ' +
    'coordination/src/god/interventions.ts has a portalPlan that finds a living mage holding a ' +
    'portal-primitive node and enters engagement. But candidates.ts derives action 14\'s slot list ' +
    'from a caller-supplied portalTargets, contracts.md §1.1 puts exactly one universe in a ' +
    'simulation instance, and the reference scenario supplies no targets — so the list is empty and ' +
    'the mask clears the action every tick. It is therefore permanently MASKED rather than inert, ' +
    'which makes portal-rush the one strategy whose defining action degeneracyOf reports as ' +
    'unreachable. Raids, and a second universe to point a portal at, land in 0.9.0.',
  'five-strategies-are-one-universe':
    'Ascension eligibility now reads play: Path A counts permitted cells standing at their floor ' +
    'and Path B requires an era boundary to hold a canon of a stated size spread over a stated ' +
    'number of cells, both anchored above what a universe reaches with no god action at all. The ' +
    'entry that used to sit here said the opposite and has been deleted rather than edited, ' +
    'because it told a reader not to run the experiment that found this one. What replaces it is ' +
    'a limit of the POOL, not of the game. Measured over four factor cells at 2400 ticks, reading ' +
    'the god tick report at every era boundary: passive-control, uniform-random-legal, archivist, ' +
    'portal-rush and worship-maximizer all end at exactly (12 mastered cells, 51 nodes known, 12 ' +
    'cells spanned). They submit different actions and produce the SAME universe. permissive-' +
    'breadth reaches (15, 262, 70); narrow-depth and denial-warden reach (0, <=9, <=5), strictly ' +
    'below the passive profile on every axis. So the pool holds three distinct achievement ' +
    'profiles and its Pareto front is one point. Any predicate that refuses the exploit probe ' +
    'refuses all five of its profile-mates, and any predicate that admits the two deniers admits ' +
    'the passive profile too — which is why no setting of any ascension constant can make three ' +
    'strategies win at materially different rates while the idle probe still loses. That is a ' +
    'measurement of the strategy pool and of the two loops that would make the other strategies\' ' +
    'actions matter: universities do not compound into a rate, and nothing is ever the last copy, ' +
    'so libraryDependence is identically zero and redundancy buys nothing. Delete this entry when ' +
    'a second strategy can produce a universe distinguishable from the one the god never touched.',
  'universities-are-founded-and-never-finished':
    'fundUniversity slot 0 founds a new university and slots 1+ advance existing ones, and ' +
    'advanceConstruction in rules-world has no caller outside it — so a completed university is ' +
    'god-attributable by construction, and the reference universe seeds exactly one. That makes ' +
    'completedUniversities look like the ideal Path A conjunct, and measured it is the opposite. ' +
    'Every deliberate strategy in this pool ends the run with that one seeded university: ' +
    'permissive-breadth lists fundUniversity behind permitTechnique, which is legal every round, ' +
    'so the entry is never reached; archivist takes slot 0 every round while libraryDepth stays ' +
    'below its threshold, founding hundreds and completing none. Only uniform-random-legal — which ' +
    'picks slots at random and therefore sometimes advances the same one twice — completes any, ' +
    'reaching 26. A Path A gate on completedUniversities would hand the summit exclusively to the ' +
    'bot that presses buttons at random. Recorded because discriminating-ascension names that gate ' +
    'as Path A\'s successor knob, and the measurement says it is inverted.',
  'noise-floor-submits-axis-actions-bare':
    'uniform-random-legal draws a parameter only when candidateSlotCount says the action has one, ' +
    'and CANDIDATE_SLOTS covers 8–14 alone — actions 1–7 are not §4.4 parameterized actions, so ' +
    'they carry no slot list and the floor submits them with no parameter at all. Every one is ' +
    'then refused inside coordination\'s dispatch for a missing parameter: axisPlan, edictPlan and ' +
    'revokePlan all return undefined on an absent params[0]. The refusal lands on the core\'s own ' +
    'illegalActionCount and NOT on the session\'s rejection counters, which is what §7\'s ' +
    'illegalActionRate is collected from — so the floor reports a near-zero illegal rate while ' +
    'seven of its fifteen verbs do nothing. Measured consequence: at 2400 ticks uniform-random-legal ' +
    'ends at essentially the same nodes known as passive-control, because the only actions it can ' +
    'land are 8–14 and 15. This is NOT fixed here, and the reason is that fixing it means choosing ' +
    'the distribution the floor draws a technique id, a cell id and an edict index from — a change ' +
    'to the floor\'s declared distribution, which is a design decision and not a bug fix. Nothing ' +
    'measured with uniform-random-legal should be read as "uniform over the god\'s verbs".',
  'starting-position-is-broke':
    'The reference scenario seeds zero favor, zero worship and zero prestige, and mask.ts clears ' +
    'every action the god cannot pay for. So a strategy is a passive control for as long as favor ' +
    'regeneration takes to reach the cheapest thing it wants, and the free actions — ascension is ' +
    'priced at zero — are reachable first. A pool difference that appears only late in a long run ' +
    'is this, not a strategy that changed its mind.',
});
