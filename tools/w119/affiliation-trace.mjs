// Drives the reference world directly (holding each step's returned state) and
// reports why scribing does or does not happen.
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';
import { step, rngFromRootSeed } from '../../packages/sim-core/dist/index.js';
import { collectRecords, MAGE, UNIVERSITY, POPULACE_COHORT, GRIMOIRE, OCCUPATION } from '../../packages/state/dist/index.js';

const cap = Number(process.argv[2] ?? 600);
const content = referenceContent();
const { scenario } = referenceScenario(content);
let state = scenario.create(20260813, { worldTickCap: cap, options: {} });
const rng = rngFromRootSeed(20260813);

const census = (tick) => {
  const mages = collectRecords(state, MAGE).filter(({ row }) => row.alive !== 0);
  const affiliated = mages.filter(({ row }) => row.universityId !== 0).length;
  const unis = collectRecords(state, UNIVERSITY);
  const complete = unis.filter(({ row }) => row.buildProgress >= 1024).length;
  const occ = {};
  for (const { row } of collectRecords(state, POPULACE_COHORT)) occ[row.occupation] = (occ[row.occupation] ?? 0) + row.count;
  return { tick, mages: mages.length, affiliated, unis: unis.length, complete,
    scribes: occ[OCCUPATION.scribe] ?? 0, students: occ[OCCUPATION.student] ?? 0, laborers: occ[OCCUPATION.laborer] ?? 0,
    grimoires: collectRecords(state, GRIMOIRE).length };
};

const marks = new Set(process.env.MARKS ? process.env.MARKS.split(',').map(Number) : [0,1,5,9,10,15,20,24,25,30,40,60,90,120,200,300,450,599]);
console.log('tick\tmages\taffil\tunis\tcomplete\tscribes\tstudents\tlaborers\tgrimoires');
for (let tick = 0; tick < cap; tick += 1) {
  if (marks.has(tick)) { const c = census(tick); console.log(Object.values(c).join('\t')); }
  state = step(state, process.env.PASSIVE ? [] : [{ kind: 11, params: [0] }], rng);
}
const c = census(cap); console.log(Object.values(c).join('\t'));
