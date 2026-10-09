/*
 * Multiverse Mages — a raider drills what her universe researched, and nothing more.
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
 * `raid-readiness` became an operation on 2026-10-08: a raider spends the
 * month practising a held raid-kit node. The claims that make that safe, each
 * of which fails if the behaviour is removed or widened:
 *
 * 1. the kit is a subset of what she could already practise;
 * 2. it is empty for anyone who is not a raider, and empty without a kit;
 * 3. drilling targets only a node she already holds, and gives mastery on it
 *    (the positive control) — never the node itself. (`practice()` refusing an
 *    unheld node is pinned in `rules-magic`'s `practice.test.ts`.)
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession } from '@mm/agent-api';
import { raidKitTargetsFor } from '@mm/coordination';
import type { KnowledgeTarget } from '@mm/rules-world';
import { GOAL } from '@mm/rules-world';
import { MASTERY_ACTIVATION_THRESHOLD } from '@mm/rules-magic';
import type { SimState } from '@mm/sim-core';
import { GOAL_COMMITMENT, KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE_ROLE, collectRecords, componentOf } from '@mm/state';

import { explicitOpeningAxes, foundingCandidates, referenceContent, referenceScenario } from '@mm/scenario';

const target = (nodeId: number, primitives: number[]): KnowledgeTarget =>
  ({ nodeId, tier: 1, remainingCost: 0, cellId: 1, formId: 1, primitives, libraryHolds: false }) as KnowledgeTarget;

describe('raidKitTargetsFor', () => {
  const practicable = [target(1, [5]), target(2, [9]), target(3, [5, 9]), target(4, [])];
  const kit = new Set([5]);

  it('is a subset of the practicable list, filtered to kit primitives', () => {
    const drilled = raidKitTargetsFor(MAGE_ROLE.raider, practicable, kit);
    expect(drilled.map((t) => t.nodeId)).toEqual([1, 3]);
    for (const t of drilled) expect(practicable).toContain(t);
  });

  it('is empty for every role but raider', () => {
    for (const role of Object.values(MAGE_ROLE)) {
      if (role === MAGE_ROLE.raider) continue;
      expect(raidKitTargetsFor(role, practicable, kit)).toEqual([]);
    }
  });

  it('is empty without a kit', () => {
    expect(raidKitTargetsFor(MAGE_ROLE.raider, practicable, undefined)).toEqual([]);
    expect(raidKitTargetsFor(MAGE_ROLE.raider, practicable, new Set())).toEqual([]);
  });
});

/** A mage's mind, as node → best mastery. */
function mind(state: SimState, mage: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
    if (row.locationKind !== LOCATION_KIND.mind || row.locationId !== mage) continue;
    out.set(row.nodeId, Math.max(out.get(row.nodeId) ?? 0, row.mastery));
  }
  return out;
}

describe('a raider drilling', () => {
  it('raises mastery on nodes she holds and never drills one she does not', async () => {
    const content = referenceContent();
    const live: { s?: SimState } = {};
    const run = referenceScenario(content, {
      onState: (s) => {
        live.s = s;
      },
    });
    const session = createSession({ scenario: run.scenario, strategyId: 'drill' });
    session.reset(7000, { worldTickCap: 4000, options: { foundingPortalMagic: 1 } });

    const raiders: number[] = [];
    let drillTicks = 0;
    let drilledUp = 0;
    for (let tick = 0; tick < 240; tick += 1) {
      let action: { kind: number; params: number[] } = { kind: GOD_ACTION.noop, params: [] };
      if (tick >= 12 && raiders.length < 6 && session.legalActions()[GOD_ACTION.assignRole] === 1) {
        const offered = session.candidates().get(GOD_ACTION.assignRole) ?? [];
        const slot = offered.findIndex((c) => c.params[1] === MAGE_ROLE.raider);
        if (slot >= 0) {
          raiders.push(offered[slot]?.params[0] as number);
          action = { kind: GOD_ACTION.assignRole, params: [slot] };
        }
      }
      const state = live.s;
      const before = new Map<number, { goal: number; target: number; mind: Map<number, number> }>();
      if (state !== undefined) {
        const commitments = componentOf(state, GOAL_COMMITMENT);
        for (const mage of raiders) {
          if (!commitments.has(mage)) continue;
          before.set(mage, {
            goal: commitments.get(mage, 'goalId'),
            target: commitments.get(mage, 'targetNodeId'),
            mind: mind(state, mage),
          });
        }
      }
      session.submit(action);
      const after = live.s as SimState;
      for (const [mage, was] of before) {
        if (was.goal !== GOAL.raidReadiness || was.target === 0) continue;
        drillTicks += 1;
        const now = mind(after, mage);
        // The drilled node was hers already.
        expect(was.mind.has(was.target), `raider ${String(mage)} drilled a node she did not hold`).toBe(true);
        // Drilling raised only that node. A node can still *arrive* the same
        // month by another road — a colleague's lesson lands in the student's
        // mind whatever the student is doing — so the claim is about the target:
        // the month's operation is practice on a node she already held, and
        // `practice()` refuses a node the subject does not hold
        // (`rules-magic/test/unit/practice.test.ts`).
        for (const nodeId of now.keys()) {
          if (was.mind.has(nodeId)) continue;
          expect(nodeId, `raider ${String(mage)} gained her drill target from nothing`).not.toBe(was.target);
        }
        if ((now.get(was.target) ?? 0) > (was.mind.get(was.target) ?? 0)) drilledUp += 1;
      }
      if (tick % 12 === 11) await new Promise((resolve) => setImmediate(resolve));
    }
    // Positive controls: raiders did drill, and drilling did raise mastery.
    expect(drillTicks).toBeGreaterThan(0);
    expect(drilledUp).toBeGreaterThan(0);
  }, 600_000);
});

/**
 * The round-4 playtest finding, as a test: a mage who researched `Open the
 * Portal` and was named raider sat at 47–49% mastery for 300 ticks and never
 * crossed {@link MASTERY_ACTIVATION_THRESHOLD}, so the portal she was named for
 * never opened.
 *
 * Target, stated: **usable within 24 ticks (two in-game years) of being named.**
 * Measured on this branch: within three ticks on all eight seeds 7000–7014
 * (one tick on seven). Before it,
 * never on any of them — two things stopped her, and each seed below fails on
 * one of them:
 *
 * - the drill could not pass the practice ceiling, which at the top of her reach
 *   *is* 512, and decay took her back under it the same tick (fixed by the
 *   `raid-readiness-mastery-floor` constant);
 * - a researcher by species and temperament never chose to drill at all —
 *   research scored 1429 against readiness 1016 for seed 7002's gnome (fixed by
 *   closing the research frontier to a raider whose kit she cannot yet cast).
 */
describe('a portal holder named raider', () => {
  const N = 24;
  const content = (() => {
    const base = referenceContent();
    const axes = explicitOpeningAxes(base.registry, ['rego', 'intellego'], ['limen', 'mentem']);
    return { ...base, axes, foundingNodeIds: foundingCandidates(base.registry, axes) };
  })();
  const portalNodes = new Set(
    content.registry.nodes
      .filter((entry) => entry.record.effects.some((effect) => effect.primitive === 'portal'))
      .map((entry) => entry.contentId),
  );
  const portalMastery = (state: SimState, mage: number): number => {
    let best = 0;
    for (const [nodeId, mastery] of mind(state, mage)) if (portalNodes.has(nodeId)) best = Math.max(best, mastery);
    return best;
  };

  for (const seed of [7002, 7006, 7010]) {
    it(`reaches usable mastery within ${String(N)} ticks of being named (seed ${String(seed)})`, async () => {
      const live: { s?: SimState } = {};
      const run = referenceScenario(content, {
        onState: (s) => {
          live.s = s;
        },
      });
      const session = createSession({ scenario: run.scenario, strategyId: 'portal-drill' });
      session.reset(seed, { worldTickCap: 4000, options: { foundingPortalMagic: 0 } });

      let holder = 0;
      let namedAt = -1;
      let usableAfter = -1;
      for (let tick = 0; tick < 400 && session.status() === 'running'; tick += 1) {
        let action: { kind: number; params: number[] } = { kind: GOD_ACTION.noop, params: [] };
        const state = live.s;
        if (state !== undefined && holder === 0) {
          for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
            if (row.locationKind === LOCATION_KIND.mind && portalNodes.has(row.nodeId)) {
              holder = row.locationId;
              break;
            }
          }
        }
        // Named once she holds it below usable: researched, then let slip.
        if (
          state !== undefined &&
          holder !== 0 &&
          namedAt < 0 &&
          portalMastery(state, holder) < MASTERY_ACTIVATION_THRESHOLD &&
          session.legalActions()[GOD_ACTION.assignRole] === 1
        ) {
          const offered = session.candidates().get(GOD_ACTION.assignRole) ?? [];
          const slot = offered.findIndex((c) => c.params[0] === holder && c.params[1] === MAGE_ROLE.raider);
          if (slot >= 0) {
            action = { kind: GOD_ACTION.assignRole, params: [slot] };
            namedAt = tick;
          }
        }
        session.submit(action);
        if (namedAt >= 0 && tick > namedAt && portalMastery(live.s as SimState, holder) >= MASTERY_ACTIVATION_THRESHOLD) {
          usableAfter = tick - namedAt;
          break;
        }
        if (namedAt >= 0 && tick - namedAt > N) break;
        if (tick % 12 === 11) await new Promise((resolve) => setImmediate(resolve));
      }
      // Positive controls: somebody researched the node, and the god named her.
      expect(holder, 'nobody researched a portal node').not.toBe(0);
      expect(namedAt, 'the holder was never offered as a raider below usable mastery').toBeGreaterThanOrEqual(0);
      expect(usableAfter, `raider at ${String(portalMastery(live.s as SimState, holder))} after ${String(N)} ticks`).toBeGreaterThan(0);
      expect(usableAfter).toBeLessThanOrEqual(N);
    }, 600_000);
  }
});
