// Traces the positive control's first ticks: favor in, action 11 spent, universities standing.
import { referenceContent, referenceScenario, FOUNDING_PROBE } from '../../packages/scenario/dist/index.js';
import { createSession, agentRng } from '../../packages/agent-api/dist/index.js';
import { adaptAgentSession, runEpisode, effectivePreferences } from '../../packages/mc-harness/dist/index.js';

const content = referenceContent();
const { scenario, lastGodReport, lastReport } = referenceScenario(content);
const raw = createSession({ scenario, agentSlotIndex: 0, strategyId: FOUNDING_PROBE.strategyId });
const session = adaptAgentSession(raw);
const runSeed = 20260813;
const context = { runSeed, agentSlotIndex: 0, rng: agentRng({ runSeed, agentSlotIndex: 0, strategyId: FOUNDING_PROBE.strategyId }) };
let round = 0;
const rows = [];
runEpisode({
  session, runSeed,
  scenarioConfig: { worldTickCap: 20, options: {} },
  policies: [(observation, mask) => {
    const g = lastGodReport(); const w = lastReport();
    rows.push({ round, gTick: g?.worldTick ?? null, opening: g?.ledger.opening ?? null, closing: g?.ledger.closing ?? null, spent11: g?.ledger.spentByAction[11] ?? 0, standing: w?.universitiesStanding ?? null, wTick: w?.worldTick ?? null });
    round += 1;
    return effectivePreferences(FOUNDING_PROBE, { observation, mask, round: round - 1, context })[0] ?? { action: 0 };
  }],
  worldTickCap: 20,
});
const g = lastGodReport(); const w = lastReport();
rows.push({ round, gTick: g?.worldTick, opening: g?.ledger.opening, closing: g?.ledger.closing, spent11: g?.ledger.spentByAction[11] ?? 0, standing: w?.universitiesStanding, wTick: w?.worldTick });
console.log('round gTick opening closing spent11 wTick standing');
for (const r of rows) console.log([r.round, r.gTick, r.opening, r.closing, r.spent11, r.wTick, r.standing].join('\t'));
