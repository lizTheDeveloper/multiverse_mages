/*
 * Multiverse Mages — the scripted bot pool: composition, fall-through,
 * degradation under a fully masked action space, determinism, and divergence.
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
 * Tasks 5.1–5.6, 5.9 and 5.10, and the four `mc-harness` capability scenarios
 * they answer: *"Pool composition is enumerable"*, *"Strategies are
 * deterministic"*, *"Strategies differ observably"*, *"Fully masked world still
 * completes"*, and *"A blocked preference falls through"*.
 */

import {
  ACTION_SPACE_SIZE,
  GOD_ACTION,
  agentRng,
  isLegal,
  observationBlock,
} from '@mm/agent-api';
import type { ActionSubmission, StrategyDefinition } from '@mm/mc-harness';
import {
  ASCENSION_STANCE,
  BOT_POOL,
  BOT_POOL_REGISTRY,
  POOL_BUILD_LIMITS,
  RECORDED_STATUSES,
  botStrategyRegistry,
  degeneracyOf,
  describeDivergence,
  effectivePreferences,
  observationDivergence,
  poolDegeneracy,
  policiesForRun,
  policyFor,
  runEpisode,
} from '@mm/mc-harness';
import { describe, expect, it } from 'vitest';

import { ScriptedSession } from '../fixtures/scripted-world.js';

/** The eight roles the capability spec enumerates, by the id each ships under. */
const REQUIRED_ROLES = [
  'passive-control',
  'uniform-random-legal',
  'permissive-breadth',
  'narrow-depth',
  'denial-warden',
  'archivist',
  'portal-rush',
  'worship-maximizer',
] as const;

/** A context derived exactly as `policiesForRun` derives one. */
function contextFor(strategyId: string, runSeed: number, agentSlotIndex = 0) {
  return {
    runSeed,
    agentSlotIndex,
    rng: agentRng({ runSeed, agentSlotIndex, strategyId }),
  };
}

/** Every action legal. */
function fullMask(): Uint8Array {
  return new Uint8Array(ACTION_SPACE_SIZE).fill(1);
}

/** Only `noop` legal — the fully-masked build of task 5.9. */
function noopOnlyMask(): Uint8Array {
  const mask = new Uint8Array(ACTION_SPACE_SIZE);
  mask[GOD_ACTION.noop] = 1;
  return mask;
}

/** A zero observation of the real width, for the mask-only tests. */
function blankObservation(): Float64Array {
  return new Float64Array(400);
}

/**
 * A strategy's own preference list, with the composed ascension entry removed.
 *
 * `effectivePreferences` prepends `declareAscension` for any strategy whose
 * stance is not `never`, which is correct and is pinned elsewhere — but it means
 * a test about a strategy's *own* ordering has to look past it.
 */
function ownPreferences(
  definition: StrategyDefinition,
  observation: Float64Array,
): ActionSubmission[] {
  return effectivePreferences(definition, {
    observation,
    mask: fullMask(),
    round: 0,
    context: contextFor(definition.strategyId, 7),
  }).filter((preference) => preference.action !== GOD_ACTION.declareAscension);
}

/**
 * Every mask worth probing a strategy against.
 *
 * The single-action masks are the ones that matter for fall-through: each one
 * removes exactly the entry some strategy prefers first, and nothing else, so a
 * strategy that stalls is visible as a strategy that stalls rather than as one
 * confused by an unusual mask.
 *
 * **`noop` stays legal in every mask here**, because §4.2 says it always is:
 * *"no-op is the action an illegal submission is replaced by, so a mask that
 * could forbid it would leave a rejected action with nothing to become."* A
 * mask that forbids it is not a mask `legalityMask` can produce, and the pool's
 * behaviour against one is asserted separately below rather than folded in
 * here, where it would only weaken the guarantee this set is checking.
 */
function adversarialMasks(): Uint8Array[] {
  const masks: Uint8Array[] = [fullMask(), noopOnlyMask()];
  for (let action = 1; action < ACTION_SPACE_SIZE; action += 1) {
    const withoutOne = fullMask();
    withoutOne[action] = 0;
    masks.push(withoutOne);
    const onlyOne = noopOnlyMask();
    onlyOne[action] = 1;
    masks.push(onlyOne);
  }
  // The build the pool is actually specified against: `openPortal` has no
  // candidates in a single-universe run and is therefore permanently masked,
  // and `declareAscension` is masked for every tick before `ascensionPath`
  // leaves `none` — which is most of a run, and all of a short one.
  const realistic = fullMask();
  realistic[GOD_ACTION.openPortal] = 0;
  realistic[GOD_ACTION.declareAscension] = 0;
  masks.push(realistic);
  return masks;
}

describe('pool composition is enumerable (task 5.1)', () => {
  it('ships at least the eight roles the capability spec names', () => {
    expect(BOT_POOL.length).toBeGreaterThanOrEqual(8);
    for (const role of REQUIRED_ROLES) {
      expect(BOT_POOL_REGISTRY.has(role), `the pool is missing ${role}`).toBe(true);
    }
  });

  it('gives every strategy a unique id, a version, and a probe hypothesis', () => {
    const ids = new Set<string>();
    const hypotheses = new Set<string>();
    for (const definition of BOT_POOL) {
      expect(ids.has(definition.strategyId)).toBe(false);
      ids.add(definition.strategyId);
      expect(Number.isInteger(definition.version)).toBe(true);
      expect(definition.version).toBeGreaterThanOrEqual(1);
      // Long enough to be a hypothesis rather than a label. The registry
      // rejects an empty one; this catches "plays broadly".
      expect(
        definition.hypothesis.length,
        `${definition.strategyId}'s hypothesis is too short to say what it detects`,
      ).toBeGreaterThan(120);
      expect(hypotheses.has(definition.hypothesis)).toBe(false);
      hypotheses.add(definition.hypothesis);
    }
    expect(BOT_POOL_REGISTRY.ids).toEqual([...ids].sort());
  });

  it('refuses a strategy with no hypothesis, no version, or a duplicate id', () => {
    const stub: StrategyDefinition = {
      strategyId: 'stub',
      version: 1,
      hypothesis: 'Whether a stub can be registered.',
      ascension: {
        when: ASCENSION_STANCE.never,
        because: 'A stub has no thesis worth ending a run for.',
      },
      signatureActions: [],
      preferences: () => [],
    };
    expect(() => botStrategyRegistry([{ ...stub, hypothesis: '   ' }])).toThrow(
      /no probe hypothesis/,
    );
    expect(() => botStrategyRegistry([{ ...stub, version: 0 }])).toThrow(/version/);
    expect(() => botStrategyRegistry([{ ...stub, strategyId: '' }])).toThrow(/non-empty/);
    expect(() => botStrategyRegistry([stub, stub])).toThrow(/Duplicate strategy id/);
  });

  it('is assignable to the sweep validator\'s StrategyRegistry', () => {
    // Structural, not nominal: `metrics.ts` declares `{ids, has}` and the bot
    // registry widens it, so a SweepRegistries takes this object unchanged.
    const asSweepRegistry: { readonly ids: readonly string[]; has(id: string): boolean } =
      BOT_POOL_REGISTRY;
    expect(asSweepRegistry.has('archivist')).toBe(true);
    expect(asSweepRegistry.has('not-a-strategy')).toBe(false);
  });
});

describe('a blocked preference falls through (task 5.6)', () => {
  it('never submits an action the mask forbids, for any strategy and any mask', () => {
    for (const definition of BOT_POOL) {
      for (const [index, mask] of adversarialMasks().entries()) {
        const policy = policyFor(definition, contextFor(definition.strategyId, 4242));
        for (let round = 0; round < 4; round += 1) {
          const chosen = policy(blankObservation(), mask, 0) as ActionSubmission | number;
          const action = typeof chosen === 'number' ? chosen : chosen.action;
          expect(
            isLegal(mask, action),
            `${definition.strategyId} submitted masked action ${String(action)} against mask ${String(index)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('submits the next-preferred legal entry, not a stall and not a no-op', () => {
    for (const definition of BOT_POOL) {
      for (const mask of adversarialMasks()) {
        // Two identically-derived contexts, so the reference call and the
        // policy call draw the same numbers from the same position.
        const policy = policyFor(definition, contextFor(definition.strategyId, 99));
        // The *effective* list — what the strategy asked for with its declared
        // ascension stance composed in. That composition is what `policyFor`
        // walks, and asserting against `preferences` alone would be asserting
        // that the stance has no effect, which is the bug the stance exists to
        // fix. `ascension-stance.test.ts` is where the composition itself is
        // pinned; this test is still only about fall-through.
        const reference = effectivePreferences(definition, {
          observation: blankObservation(),
          mask,
          round: 0,
          context: contextFor(definition.strategyId, 99),
        });
        const expected =
          reference.find((preference) => isLegal(mask, preference.action)) ??
          ({ action: GOD_ACTION.noop } as ActionSubmission);
        expect(
          policy(blankObservation(), mask, 0),
          `${definition.strategyId} did not fall through to its first legal preference`,
        ).toEqual(expected);
      }
    }
  });

  /**
   * `permissive-breadth` founds before it permits, while it has nothing to fund.
   *
   * This is the regression test for a defect that survived every sweep ever
   * taken. `fundUniversity` sat behind `permitTechnique` in the preference
   * list, `policyFor` takes the first *legal* preference, and `permitTechnique`
   * is legal on every round — so the strategy whose entire role is "permits
   * widely, funds broadly" ended every run at one university: the seeded
   * academy, never having completed one of its own.
   *
   * It went unnoticed because nothing read `universityCount` until the
   * ascension conjunct did, and because the code carried a comment — *"found
   * until there is something to fund"* — describing an intent the list defeated.
   * A comment is not a test, which is the whole reason this one exists.
   *
   * Asserted on the preference *order* rather than on a run outcome, because
   * the order is the defect. An outcome assertion would pass again the moment
   * anything else made a university appear, and would have said nothing about
   * why.
   *
   * `declareAscension` is filtered out first: `effectivePreferences` composes
   * the ascension stance in ahead of the strategy's own list, and this strategy
   * declares `whenEligible`. That composition is pinned in
   * `ascension-stance.test.ts` and is not what this test is about.
   */
  it('makes permissive-breadth found before it permits, while it has none', () => {
    const definition = BOT_POOL.find((entry) => entry.strategyId === 'permissive-breadth');
    expect(definition, 'permissive-breadth left the pool').toBeDefined();

    const withNone = ownPreferences(definition as StrategyDefinition, blankObservation());
    expect(
      withNone[0]?.action,
      'permissive-breadth must found first when it holds no university — behind an ' +
        'always-legal permit it never founds at all',
    ).toBe(GOD_ACTION.fundUniversity);
    expect(withNone[0]?.parameter, 'slot 0 is the standing "found a new one" option').toBe(0);

    // And once it holds one, permitting leads again — the strategy is about
    // breadth, and founding is the precondition it was skipping, not its point.
    const held = blankObservation();
    held[observationBlock('institutions').offset] = 3;
    const withSome = ownPreferences(definition as StrategyDefinition, held);
    expect(
      withSome[0]?.action,
      'with universities in hand the ruleset actions lead again',
    ).toBe(GOD_ACTION.permitTechnique);
    expect(
      withSome.some((preference) => preference.action === GOD_ACTION.fundUniversity),
      'it must still spread funding across what exists',
    ).toBe(true);
  });

  it('does not stall or raise even against a mask §4.2 says cannot exist', () => {
    // A mask with no legal action at all. `legalityMask` never produces one —
    // no-op is unconditional there — but the capability spec's requirement is
    // that a strategy "MUST NOT stall, loop without advancing the clock, or
    // raise when its preferred action is unavailable", and the strongest form
    // of unavailable is this. Every strategy still names no-op, which the gate
    // then rejects and counts. That is the correct behaviour: a rejection is
    // observable in `illegalActionRate`, and a stall is not observable at all.
    const impossible = new Uint8Array(ACTION_SPACE_SIZE);
    for (const definition of BOT_POOL) {
      const policy = policyFor(definition, contextFor(definition.strategyId, 3));
      for (let round = 0; round < 3; round += 1) {
        expect(policy(blankObservation(), impossible, 0)).toEqual({ action: GOD_ACTION.noop });
      }
    }
  });

  it('falls through for portal-rush specifically, as the spec scenario names it', () => {
    // "WHEN the portal-rush strategy observes that opening a portal is masked
    //  THEN it submits its next-preferred legal action rather than repeatedly
    //  submitting the illegal one."
    const definition = BOT_POOL_REGISTRY.get('portal-rush') as StrategyDefinition;
    const mask = fullMask();
    mask[GOD_ACTION.openPortal] = 0;
    // Before eligibility, which is where the scenario is set: portal-rush's
    // stance is "declare when eligible", so leaving action 15 legal here would
    // make this a test of the stance rather than of the portal fall-through.
    mask[GOD_ACTION.declareAscension] = 0;
    const policy = policyFor(definition, contextFor('portal-rush', 7));
    const submissions: number[] = [];
    for (let round = 0; round < 12; round += 1) {
      const chosen = policy(blankObservation(), mask, 0) as ActionSubmission;
      submissions.push(chosen.action);
    }
    expect(submissions).not.toContain(GOD_ACTION.openPortal);
    // `assignRole` and not `encourageResearch`, since portal-rush v4: a god who
    // opens portals and assigns nobody sends an empty warband, because
    // `RAIDING_ROLES` is the `raider` role alone and every mage is born a
    // `researcher`. The fall-through is what is under test here and it is
    // unchanged — the bot still declines to resubmit a masked action — but the
    // action it falls through *to* is now the one it needs most.
    expect(new Set(submissions)).toEqual(new Set([GOD_ACTION.assignRole]));

    // The control: with the portal open it does prefer it, so the fall-through
    // above is a fall-through and not a strategy that never wanted a portal.
    const portalOpen = fullMask();
    portalOpen[GOD_ACTION.declareAscension] = 0;
    const openPolicy = policyFor(definition, contextFor('portal-rush', 7));
    expect((openPolicy(blankObservation(), portalOpen, 0) as ActionSubmission).action).toBe(
      GOD_ACTION.openPortal,
    );
  });
});

describe('degeneracy is declared rather than discovered', () => {
  it('names portal-rush\'s unreachable defining action without calling it degenerate', () => {
    // The build the pool *used* to be specified against: everything legal
    // except action 14, which had no candidates because nothing supplied
    // `portalTargets`. That is no longer this build — the reference scenario
    // now names a roster of rivals and action 14 is reachable — but the mask is
    // still the right instrument for the property under test, which is that
    // `degeneracyOf` reports an unreachable signature action *without* calling
    // the strategy degenerate when another signature action survives.
    const mask = fullMask();
    mask[GOD_ACTION.openPortal] = 0;

    const degenerate = poolDegeneracy(BOT_POOL_REGISTRY, mask)
      .filter((report) => report.degenerate)
      .map((report) => report.strategyId);
    expect(degenerate).toEqual([]);

    // Portal-rush is not fully degenerate because `assignRole` and
    // `declareAscension` are also signature actions and both are legal. Its
    // *defining* action is masked here, and the report says so channel by
    // channel.
    const portal = degeneracyOf(BOT_POOL_REGISTRY.get('portal-rush') as StrategyDefinition, mask);
    expect(portal.unreachable).toEqual([GOD_ACTION.openPortal]);
    expect(portal.reachable).toEqual([GOD_ACTION.assignRole, GOD_ACTION.declareAscension]);
  });

  it('reports every strategy but the passive control as degenerate under a full mask-out', () => {
    const reports = poolDegeneracy(BOT_POOL_REGISTRY, noopOnlyMask());
    const degenerate = reports.filter((report) => report.degenerate).map((r) => r.strategyId);
    // Stated as the property rather than as the eight literal ids: a strategy is
    // degenerate under a noop-only mask exactly when it has a signature action
    // to be denied. Widened on the W6 verification branch, which appends two
    // adversarial probes to BOT_POOL; the assertion is strictly stronger than
    // the id list it replaces, because it also fixes which strategies are NOT
    // degenerate and why.
    expect(degenerate.sort()).toEqual(
      BOT_POOL.filter((definition) => definition.signatureActions.length > 0)
        .map((definition) => definition.strategyId)
        .sort(),
    );
    for (const role of REQUIRED_ROLES) {
      if (role === 'passive-control') continue;
      expect(degenerate, `${role} must still be reported degenerate`).toContain(role);
    }
    // The passive control is never degenerate: it has no signature actions, so
    // there is nothing it is failing to reach.
    const passive = reports.find((report) => report.strategyId === 'passive-control');
    expect(passive?.degenerate).toBe(false);
  });

  it('records what this build cannot let a strategy do', () => {
    // Prose, and untestable from here by construction — but its *presence* is
    // testable, and an empty limits block would be a claim that the pool is
    // fully exercised, which it is not.
    // Two of the four entries this list used to hold have expired and are
    // deleted rather than softened: `every-god-action` claimed nothing reads
    // `ctx.actions`, and `worship` claimed nothing moves the worship channels.
    // `god-agency` made both false, and an entry that outlives its mechanic is
    // worse than none because it excuses a real flat result.
    // `axis-parameter-base` has expired the same way: the rotations are 1-based
    // now and the gate range-checks the ids, so the entry it replaced described
    // a defect this build does not have. What replaced it is a *different*
    // silent refusal found while fixing that one — the noise floor submits
    // actions 1–7 with no parameter at all — and it is recorded rather than
    // fixed, for the reason the entry gives.
    // `ascension-is-passive` has expired: both paths now gate on a quantity the
    // god's play produces, and the entry described a defect this build does not
    // have. What replaced it is not the same claim rewritten -- it is a limit of
    // the POOL rather than of the game, found by fixing the first one. Five of
    // the eight strategies produce identical achievement vectors, so the pool's
    // Pareto front is one point and no win condition can separate them.
    expect(Object.keys(POOL_BUILD_LIMITS).sort()).toEqual([
      'five-strategies-are-one-universe',
      'noise-floor-submits-axis-actions-bare',
      'open-portal',
      'starting-position-is-broke',
      'universities-are-founded-and-never-finished',
    ]);
    for (const [key, text] of Object.entries(POOL_BUILD_LIMITS)) {
      expect(text.length, `${key} needs a reason, not a label`).toBeGreaterThan(80);
    }
  });
});

describe('the whole pool runs to termination against a fully masked build (task 5.9)', () => {
  it('every strategy terminates, submits only no-ops, and is refused nothing', () => {
    for (const definition of BOT_POOL) {
      const session = new ScriptedSession();
      const outcome = runEpisode({
        session,
        runSeed: 1234,
        scenarioConfig: { maskEverything: true },
        policies: policiesForRun({
          registry: BOT_POOL_REGISTRY,
          strategies: [definition.strategyId],
          runSeed: 1234,
        }),
        worldTickCap: 240,
      });

      expect(RECORDED_STATUSES, `${definition.strategyId} produced ${outcome.status}`).toContain(
        outcome.status,
      );
      expect(outcome.ticksRun).toBe(240);
      expect(outcome.accounting.submissions).toBe(240);
      // "chose to pass", not "was refused": the fall-through found no-op legal
      // and submitted it, so nothing was rejected.
      expect(
        outcome.accounting.rejections,
        `${definition.strategyId} was refused under a mask that permits only no-op`,
      ).toBe(0);
      expect(outcome.accounting.byActionId).toEqual({});
      expect(new Set(session.submissionLog().map((entry) => entry.action))).toEqual(
        new Set([GOD_ACTION.noop]),
      );
    }
  });

  it('also stagnates rather than only truncating, so the status is not an artefact of the cap', () => {
    const session = new ScriptedSession();
    const outcome = runEpisode({
      session,
      runSeed: 5,
      scenarioConfig: { maskEverything: true, stagnateAt: 30 },
      policies: policiesForRun({
        registry: BOT_POOL_REGISTRY,
        strategies: ['uniform-random-legal'],
        runSeed: 5,
      }),
      worldTickCap: 240,
    });
    expect(outcome.status).toBe('stagnated');
    expect(outcome.ticksRun).toBe(30);
  });
});

describe('strategies are deterministic at a fixed agent-side seed (task 5.10)', () => {
  it('emits an identical action sequence across two runs of the same seed', () => {
    for (const definition of BOT_POOL) {
      const play = (): string => {
        const session = new ScriptedSession();
        runEpisode({
          session,
          runSeed: 20260811,
          scenarioConfig: { ascendAt: 100000 },
          policies: policiesForRun({
            registry: BOT_POOL_REGISTRY,
            strategies: [definition.strategyId],
            runSeed: 20260811,
          }),
          worldTickCap: 120,
        });
        return session
          .submissionLog()
          .map((entry) => `${String(entry.action)}:${String(entry.parameter ?? '-')}`)
          .join(',');
      };
      const first = play();
      expect(play(), `${definition.strategyId} is not deterministic`).toBe(first);
      expect(first.length).toBeGreaterThan(0);
    }
  });

  it('gives the same strategy different draws in different slots', () => {
    // Otherwise a mirrored pair is two copies of one sample rather than a
    // controlled comparison.
    const definition = BOT_POOL_REGISTRY.get('uniform-random-legal') as StrategyDefinition;
    const mask = fullMask();
    const slotZero = policyFor(definition, contextFor(definition.strategyId, 77, 0));
    const slotOne = policyFor(definition, contextFor(definition.strategyId, 77, 1));
    const zero: number[] = [];
    const one: number[] = [];
    for (let round = 0; round < 24; round += 1) {
      zero.push((slotZero(blankObservation(), mask, 0) as ActionSubmission).action);
      one.push((slotOne(blankObservation(), mask, 1) as ActionSubmission).action);
    }
    expect(zero).not.toEqual(one);
  });
});

describe('three strategies diverge observably on the same run seed (task 5.10)', () => {
  /** Plays one strategy and hands back what it did and where it ended up. */
  function play(strategyId: string): { actions: string; final: Float64Array } {
    const session = new ScriptedSession();
    runEpisode({
      session,
      runSeed: 424242,
      // 200 world years at §0's 12 ticks per year, which is the number the
      // capability scenario names.
      scenarioConfig: { ascendAt: 1_000_000 },
      policies: policiesForRun({
        registry: BOT_POOL_REGISTRY,
        strategies: [strategyId],
        runSeed: 424242,
      }),
      worldTickCap: 2400,
    });
    return {
      actions: session
        .submissionLog()
        .map((entry) => `${String(entry.action)}:${String(entry.parameter ?? '-')}`)
        .join(','),
      // A copy: the session rebuilds its observation on the next submit, and
      // §4.1's note on ownership applies to this fixture too.
      final: Float64Array.from(session.observe()),
    };
  }

  it('separates the passive control, the archivist and portal-rush, and names the blocks', () => {
    const passive = play('passive-control');
    const archivist = play('archivist');
    const portal = play('portal-rush');

    // Three distinct action sequences: a pool whose members behave identically
    // is a pool of one.
    expect(new Set([passive.actions, archivist.actions, portal.actions]).size).toBe(3);

    const pairs = [
      ['passive-control', 'archivist', passive.final, archivist.final],
      ['passive-control', 'portal-rush', passive.final, portal.final],
      ['archivist', 'portal-rush', archivist.final, portal.final],
    ] as const;

    for (const [left, right, a, b] of pairs) {
      const divergence = observationDivergence(a, b);
      expect(
        divergence.identical,
        `${left} and ${right} ended in identical observations: ${describeDivergence(divergence)}`,
      ).toBe(false);
      // The report names blocks, which is the half of the scenario a boolean
      // would have skipped.
      expect(divergence.blockNames.length).toBeGreaterThan(0);
      expect(describeDivergence(divergence)).toContain(divergence.blockNames[0] as string);
    }

    // And the blocks named are the ones the strategies actually moved: the
    // archivist buys institutions, portal-rush drives one cell of knowledge.
    expect(observationDivergence(passive.final, archivist.final).blockNames).toContain(
      'institutions',
    );
    // `mages`, not `knowledge`. portal-rush v4 spends its rounds assigning
    // roles and opening portals; what separates it from the passive control is
    // who its mages *are* and what happened to them, and at this horizon the
    // knowledge block has not moved apart yet. The 2400-tick sweep is where the
    // knowledge difference shows up — nodes taken rather than derived — and a
    // short divergence probe is the wrong instrument for it.
    expect(observationDivergence(passive.final, portal.final).blockNames).toContain('mages');
  });

  it('reports identical observations as identical rather than as a small difference', () => {
    const first = play('narrow-depth');
    const second = play('narrow-depth');
    const divergence = observationDivergence(first.final, second.final);
    expect(divergence.identical).toBe(true);
    expect(divergence.blocks).toEqual([]);
    expect(describeDivergence(divergence)).toBe('identical in every observation block');
  });

  it('refuses to compare a vector that is not the §4.1 width', () => {
    expect(() => observationDivergence(new Float64Array(4), new Float64Array(400))).toThrow(
      /is 4 wide, not 400/,
    );
  });
});
