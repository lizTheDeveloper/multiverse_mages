/* W247 — the reserve floor's positive control: a world where `labor` is
 * produced, so the hire has something to race the verb for. */
import { AUDIT_RUN_SEED, referenceContent, referenceScenario } from '@mm/scenario';
import { createSession, GOD_ACTION } from '@mm/agent-api';
import { MATERIAL_STOCK, componentOf, findUniverse } from '@mm/state';

const RESERVE = Number.parseInt(process.argv[2] ?? '4096', 10);
const INCOME = Number.parseInt(process.argv[3] ?? '2048', 10);

const content = referenceContent();
const { scenario, lastReport } = referenceScenario(content);
const session = createSession({ scenario, agentSlotIndex: 0, strategyId: 'floor-control' });
session.reset(AUDIT_RUN_SEED, { worldTickCap: 600, options: {} });

let legal = 0;
let ticks = 0;
let applied = 0;
for (let t = 0; t < 300; t += 1) {
  const mask = session.legalActions();
  if (mask[GOD_ACTION.fundUniversity] === 1) legal += 1;
  session.submit(
    mask[GOD_ACTION.fundUniversity] === 1
      ? { kind: GOD_ACTION.fundUniversity, params: [0] }
      : { kind: 0, params: [] },
  );
  ticks += 1;
}
console.log(`reserve=${RESERVE} income=${INCOME}: action 11 legal on ${legal}/${ticks}`);
