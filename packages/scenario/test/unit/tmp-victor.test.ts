/* TEMPORARY — not for merge. Victor and end-reason histogram per arm. */

import { describe, expect, it } from 'vitest';

import { BOT_POOL_REGISTRY, adaptAgentSession, policyFor, runEpisode } from '@mm/mc-harness';
import { agentRng, createSession } from '@mm/agent-api';

import { referenceContent, referenceScenario } from '../../src/index.js';

const content = referenceContent();
const HORIZON = 1200;
const SEEDS: readonly number[] = [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0004_1000];
const ARMS = ['passive-control', 'portal-rush', 'archivist', 'uniform-random-legal'];

describe('victor and end reason', () => {
  it('reports the histogram', () => {
    console.log('\n=== victor / end-reason, by arm and direction (4 seeds, 1200 ticks) ===');
    for (const strategyId of ARMS) {
      const definition = BOT_POOL_REGISTRY.get(strategyId)!;
      const tally = new Map<string, number>();
      let engagementTicks = 0;
      let raids = 0;
      for (const seed of SEEDS) {
        const run = referenceScenario(content, { raids: true, telemetry: false });
        const raw = createSession({ scenario: run.scenario, agentSlotIndex: 0, strategyId });
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
        for (const record of run.raids()) {
          const key = `${record.outbound ? 'outbound' : 'inbound '} victor=${record.victor === 0 ? 'attacker' : 'defender'} reason=${String(record.reason)}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
          engagementTicks += record.engagementTicks;
          raids += 1;
        }
      }
      console.log(`${strategyId}: ${String(raids)} raids, mean engagement ticks ${(engagementTicks / Math.max(raids, 1)).toFixed(1)}`);
      for (const [key, count] of [...tally].sort()) console.log(`    ${key}  x${String(count)}`);
    }
    expect(true).toBe(true);
  }, 1_800_000);
});
