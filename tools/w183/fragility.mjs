// How concentrated is knowledge? Holders per node, and how many nodes hang by one thread.
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';
import { step, rngFromRootSeed } from '../../packages/sim-core/dist/index.js';
import { collectRecords, KNOWLEDGE_INSTANCE, MAGE } from '../../packages/state/dist/index.js';

const cap = Number(process.argv[2] ?? 600);
const content = referenceContent();
const { scenario } = referenceScenario(content);
let state = scenario.create(20260813, { worldTickCap: cap, options: {} });
const rng = rngFromRootSeed(20260813);
for (let tick = 0; tick < cap; tick += 1) {
  state = step(state, process.env.PASSIVE ? [] : [{ kind: 11, params: [0] }], rng);
}
const holders = new Map();
for (const { row } of collectRecords(state, KNOWLEDGE_INSTANCE)) {
  if (!holders.has(row.nodeId)) holders.set(row.nodeId, new Set());
  holders.get(row.nodeId).add(`${row.locationKind}:${row.locationId}`);
}
const counts = [...holders.values()].map((s) => s.size).sort((a,b)=>a-b);
const fragile = counts.filter((n) => n <= 1).length;
const living = collectRecords(state, MAGE).filter(({row}) => row.alive !== 0).length;
const mean = counts.reduce((a,b)=>a+b,0) / (counts.length || 1);
console.log(`tick ${cap}: ${counts.length} distinct nodes held, ${living} living mages`);
console.log(`  holders per node: min ${counts[0] ?? 0}, median ${counts[Math.floor(counts.length/2)] ?? 0}, max ${counts[counts.length-1] ?? 0}, mean ${mean.toFixed(1)}`);
console.log(`  nodes held in exactly one place (fragile): ${fragile}`);
