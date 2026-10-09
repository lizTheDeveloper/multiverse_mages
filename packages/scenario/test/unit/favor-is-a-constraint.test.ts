/*
 * Multiverse Mages — favor is a constraint on a god who plays, and blessing is not dead.
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
 * Playtest round 4 (main `0cc40e9c`): favor sat at its cap after year 5 in
 * every screenshot, and insight read "0 +0" from year 80, so blessing was dead
 * and every other god action was effectively free. Measured headless on
 * lobby-shaped universes (`scripts/s15-economy-probe.mjs`): a god acting every
 * six months spent 6–8% of the favor that regenerated, and insight sat under
 * one blessing's price on 75–95% of ticks.
 *
 * The claim held here, on one lobby-shaped universe (one species, a 2×2
 * opening with no Mentem or Imaginem — the case where insight had no producer
 * at all): **a god who acts every six months spends at least half of what
 * regenerates**, and **blessing is affordable on most ticks**. Fails with the
 * favor regeneration restored (spending falls to single digits) and with the
 * research insight faucet removed (bless is masked most of the run).
 */

import { describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession, type AgentSession } from '@mm/agent-api';
import { explicitOpeningAxes, foundingCandidates, referenceContent, referenceOptions, referenceScenario, speciesTable } from '@mm/scenario';

const TICKS = 360;
const EVERY = 6;

/** Fund two universities, grant, bless, encourage, then anything else on offer. */
function act(session: AgentSession, completed: number): { kind: number; params: number[] } {
  const mask = session.legalActions();
  const legal = (a: number): boolean => mask[a] === 1;
  const universities = session.playerState().institutions.universityCount;
  if (legal(GOD_ACTION.fundUniversity)) {
    if (universities < 2) return { kind: GOD_ACTION.fundUniversity, params: [0] };
    if (completed < universities) return { kind: GOD_ACTION.fundUniversity, params: [1] };
  }
  for (const action of [
    GOD_ACTION.grantFoundingKnowledge,
    GOD_ACTION.blessMage,
    GOD_ACTION.encourageResearch,
    GOD_ACTION.permitForm,
    GOD_ACTION.assignRole,
  ]) {
    if (legal(action)) return { kind: action, params: [0] };
  }
  return { kind: GOD_ACTION.noop, params: [] };
}

describe('favor binds a god who plays, and insight keeps blessing alive', () => {
  it('a god acting every six months spends at least half the favor that regenerates', async () => {
    const base = referenceContent(undefined, 'vancian-memorization');
    const axes = explicitOpeningAxes(base.registry, ['creo', 'rego'], ['herbam', 'terram']);
    const content = { ...base, axes, foundingNodeIds: foundingCandidates(base.registry, axes) };
    const run = referenceScenario(content, { raids: true });
    const session = createSession({ scenario: run.scenario, strategyId: 'active-6' });
    const { ids } = speciesTable(base.registry);
    const human = base.registry.species.find((e) => e.record.id === 'human');
    if (human === undefined) throw new Error('no human species in the shipped content');
    const per = referenceOptions({ worldTickCap: 1 });
    session.reset(20261009, {
      worldTickCap: TICKS + 1,
      options: {
        foundingSpeciesMask: 1 << ids.indexOf(human.contentId),
        foundingMages: per.foundingMages * ids.length,
        cohortSize: per.cohortSize * ids.length,
      },
    });

    let regenerated = 0;
    let spent = 0;
    let blessAffordable = 0;
    for (let tick = 0; tick < TICKS; tick += 1) {
      if (session.legalActions()[GOD_ACTION.blessMage] === 1) blessAffordable += 1;
      const completed = run.lastGodReport()?.ascensionProgress.completedUniversities ?? 0;
      session.submit(tick % EVERY === 0 ? act(session, completed) : { kind: GOD_ACTION.noop });
      const god = run.lastGodReport();
      if (god !== undefined) {
        regenerated += god.ledger.regenerated;
        for (const v of Object.values(god.ledger.spentByAction)) spent += v;
      }
      if (tick % 24 === 23) await new Promise((resolve) => setImmediate(resolve));
    }

    expect(regenerated).toBeGreaterThan(0);
    // Measured 7% on 0cc40e9c's constants; the target is at least half.
    expect(spent / regenerated).toBeGreaterThanOrEqual(0.5);
    // Measured ~5% of ticks on 0cc40e9c (insight under one blessing's price).
    expect(blessAffordable / TICKS).toBeGreaterThanOrEqual(0.5);
  }, 240_000);
});
