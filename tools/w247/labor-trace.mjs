/* W247 — where the `labor` stock actually goes on a founding run. */
import { AUDIT_RUN_SEED, referenceContent, referenceScenario } from '@mm/scenario';
import { createSession, GOD_ACTION } from '@mm/agent-api';

const content = referenceContent();
const { scenario, lastReport, lastGodReport } = referenceScenario(content);
const session = createSession({ scenario, agentSlotIndex: 0, strategyId: 'trace' });
session.reset(AUDIT_RUN_SEED, { worldTickCap: 600, options: {} });
console.log('tick\tmask11\tsubmitOk\thirePaid\tlabor\tsites\tprog');
for (let t = 0; t < 40; t += 1) {
  const mask = session.legalActions();
  const m11 = mask[GOD_ACTION.fundUniversity];
  const res = session.submit(m11 === 1 ? { kind: GOD_ACTION.fundUniversity, params: [0] } : { kind: 0, params: [] });
  const r = lastReport();
  if (!r) continue;
  console.log([r.worldTick, m11, JSON.stringify(res).slice(0,40), r.constructionLaborPaid, r.remainingByKind.labor, r.universitiesStanding, r.buildProgressAdded].join('\t'));
}
