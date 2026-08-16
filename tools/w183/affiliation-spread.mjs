// How affiliated mages are distributed across the universities that stand.
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';
import { step, rngFromRootSeed } from '../../packages/sim-core/dist/index.js';
import { collectRecords, MAGE, UNIVERSITY, GRIMOIRE } from '../../packages/state/dist/index.js';

const cap = Number(process.argv[2] ?? 600);
const content = referenceContent();
const { scenario } = referenceScenario(content);
let state = scenario.create(20260813, { worldTickCap: cap, options: {} });
const rng = rngFromRootSeed(20260813);
for (let tick = 0; tick < cap; tick += 1) {
  state = step(state, process.env.PASSIVE ? [] : [{ kind: 11, params: [0] }], rng);
}
const hosted = new Map();
let living = 0, unaff = 0;
for (const { row } of collectRecords(state, MAGE)) {
  if (row.alive === 0) continue;
  living += 1;
  if (row.universityId === 0) { unaff += 1; continue; }
  hosted.set(row.universityId, (hosted.get(row.universityId) ?? 0) + 1);
}
const unis = collectRecords(state, UNIVERSITY);
const complete = unis.filter(({ row }) => row.buildProgress >= 1024);
const occupied = [...hosted.entries()].sort((a,b)=>b[1]-a[1]);
console.log(`tick ${cap}: living ${living}, unaffiliated ${unaff}, standing ${unis.length}, complete ${complete.length}, grimoires ${collectRecords(state, GRIMOIRE).length}`);
console.log(`universities holding at least one scholar: ${occupied.length}`);
console.log(`top occupancies (university:mages/capacity): ${occupied.slice(0,8).map(([u,n])=>`${u}:${n}/${unis.find(e=>e.handle===u)?.row.capacity ?? '?'}`).join(' ')}`);
