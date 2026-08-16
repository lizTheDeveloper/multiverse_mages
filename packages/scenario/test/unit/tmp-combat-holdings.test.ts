/* TEMPORARY — not for merge. Do the mages an arm fields hold combat magic at all? */

import { describe, expect, it } from 'vitest';

import { TIME_MODE } from '@mm/sim-core';
import type { System } from '@mm/sim-core';
import { KNOWLEDGE_INSTANCE, LOCATION_KIND, MAGE, MAGE_ROLE, collectRecords } from '@mm/state';
import { COMBAT_PRIMITIVES } from '@mm/rules-raid';
import { BOT_POOL_REGISTRY, adaptAgentSession, policyFor, runEpisode } from '@mm/mc-harness';
import { agentRng, createSession } from '@mm/agent-api';

import { referenceContent, referenceScenario } from '../../src/index.js';

const content = referenceContent();
const HORIZON = 1200;
const SEEDS: readonly number[] = [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0004_1000];
const ARMS = ['passive-control', 'portal-rush', 'archivist', 'uniform-random-legal'];

const COMBAT = new Set<string>(Object.values(COMBAT_PRIMITIVES));

/** Content node ids whose authored effects carry any combat primitive. */
const combatNodes = new Set<number>();
// Never reassigned: the permitted-cell filter this was going to hold is not
// applied, which is what the log line below says out loud. `const` rather than
// `let` so the lint rule and the printed caveat agree.
const permittedCombatNodes = 0;
for (const node of content.registry.nodes) {
  if (node.record.effects.some((effect) => COMBAT.has(effect.primitive))) {
    combatNodes.add(node.contentId as number);
  }
}

describe('combat holdings', () => {
  it('counts them', () => {
    console.log(`\ncontent: ${String(combatNodes.size)} of ${String(content.registry.nodes.length)} nodes carry a combat primitive (permitted-cell filter not applied: ${String(permittedCombatNodes)})`);
    console.log('\n=== do the mages an arm fields hold any combat node? (end of a 1200-tick run) ===');
    console.log('strategy                 seed        livingMages combatants(w+R) mages-holding-combat  combat-instances-in-minds  distinct-combat-nodes');
    for (const strategyId of ARMS) {
      const definition = BOT_POOL_REGISTRY.get(strategyId)!;
      for (const seed of SEEDS) {
        const run = referenceScenario(content, { raids: true, telemetry: false });
        let last = '';
        const observer: System = {
          name: 'tmp-holdings',
          run(ctx) {
            if (ctx.mode !== TIME_MODE.world) return;
            const living = collectRecords(ctx.state, MAGE).filter(({ row }) => row.alive === 1);
            const combatantHandles = new Set(
              living
                .filter(({ row }) => row.roleId === MAGE_ROLE.warden || row.roleId === MAGE_ROLE.raider)
                .map(({ handle }) => handle as number),
            );
            const holders = new Set<number>();
            const distinct = new Set<number>();
            let instances = 0;
            for (const { row } of collectRecords(ctx.state, KNOWLEDGE_INSTANCE)) {
              if (row.locationKind !== LOCATION_KIND.mind) continue;
              if (!combatNodes.has(row.nodeId as number)) continue;
              instances += 1;
              distinct.add(row.nodeId as number);
              holders.add(row.locationId as number);
            }
            const combatantHolders = [...holders].filter((handle) => combatantHandles.has(handle)).length;
            last = `${String(living.length).padStart(11)} ${String(combatantHandles.size).padStart(15)} ${String(holders.size).padStart(21)} (${String(combatantHolders)} of them combatants) ${String(instances).padStart(10)} ${String(distinct.size).padStart(20)}`;
          },
        };
        let installed = false;
        const scenario = {
          ...run.scenario,
          create: (runSeed: number, config: Parameters<typeof run.scenario.create>[1]) => {
            const state = run.scenario.create(runSeed, config);
            if (!installed) {
              (state.schema.systems as System[]).push(observer);
              installed = true;
            }
            return state;
          },
        };
        const raw = createSession({ scenario, agentSlotIndex: 0, strategyId });
        runEpisode({
          session: adaptAgentSession(raw),
          runSeed: seed,
          scenarioConfig: { worldTickCap: HORIZON, options: {} },
          policies: [
            policyFor(definition, {
              runSeed: seed,
              agentSlotIndex: 0,
              rng: agentRng({ runSeed: seed, agentSlotIndex: 0, strategyId }),
            }),
          ],
          worldTickCap: HORIZON,
        });
        console.log(`${strategyId.padEnd(24)} 0x${seed.toString(16).padStart(8, '0')} ${last}`);
      }
    }
    expect(combatNodes.size).toBeGreaterThan(0);
  }, 1_800_000);
});
