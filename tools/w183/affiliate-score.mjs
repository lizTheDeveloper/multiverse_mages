// Which goals mages actually commit to, over a run that founds universities.
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';
import { step, rngFromRootSeed } from '../../packages/sim-core/dist/index.js';
import { collectRecords, componentOf, MAGE, UNIVERSITY, GOAL_COMMITMENT } from '../../packages/state/dist/index.js';

const cap = Number(process.argv[2] ?? 300);
const NAMES = ['idle','research-node','rediscover-node','seek-teaching','teach','scribe','affiliate','ward-duty','raid-readiness','apply-magic'];
const content = referenceContent();
const { scenario } = referenceScenario(content);
let state = scenario.create(20260813, { worldTickCap: cap, options: {} });
const rng = rngFromRootSeed(20260813);
const everCommitted = new Map();
let firstCompleteTick = -1;
for (let tick = 0; tick < cap; tick += 1) {
  const complete = collectRecords(state, UNIVERSITY).filter(({ row }) => row.buildProgress >= 1024).length;
  if (complete > 0 && firstCompleteTick < 0) firstCompleteTick = tick;
  if (complete > 0) {
    const commitments = componentOf(state, GOAL_COMMITMENT);
    for (const { handle, row } of collectRecords(state, MAGE)) {
      if (row.alive === 0 || !commitments.has(handle)) continue;
      const g = commitments.get(handle, 'goalId');
      everCommitted.set(g, (everCommitted.get(g) ?? 0) + 1);
    }
  }
  state = step(state, [{ kind: 11, params: [0] }], rng);
}
console.log(`first completed university at tick ${firstCompleteTick}; mage-ticks by committed goal, from that tick on:`);
for (const [g, n] of [...everCommitted].sort((a,b) => b[1]-a[1])) console.log(`  ${String(g).padStart(2)} ${(NAMES[g] ?? '?').padEnd(16)} ${n}`);
