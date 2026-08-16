/* W247 — is there any `labor` income at all in the v1 opening square? */
import { AUDIT_RUN_SEED, referenceContent, referenceScenario } from '@mm/scenario';
import { createSession } from '@mm/agent-api';

const content = referenceContent();
const { scenario, lastReport } = referenceScenario(content);
const session = createSession({ scenario, agentSlotIndex: 0, strategyId: 'faucet' });
session.reset(AUDIT_RUN_SEED, { worldTickCap: 600, options: {} });
const total = { produced: {}, applied: {} };
for (let t = 0; t < 600; t += 1) {
  session.submit({ kind: 0, params: [] });
  const r = lastReport();
  if (!r) continue;
  for (const k of Object.keys(r.producedByKind)) {
    total.produced[k] = (total.produced[k] ?? 0) + r.producedByKind[k];
    total.applied[k] = (total.applied[k] ?? 0) + r.appliedByKind[k];
  }
}
console.log('kind      producedByKind(600t)   appliedByKind(600t)');
for (const k of Object.keys(total.produced)) {
  console.log(k.padEnd(9), String(total.produced[k]).padStart(16), String(total.applied[k]).padStart(20));
}
