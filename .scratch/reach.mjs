import { rngFromRootSeed, step } from '../packages/sim-core/dist/index.js';
import { referenceContent, referenceScenario } from '../packages/scenario/dist/index.js';
import { KNOWLEDGE_FIDELITY, KNOWLEDGE_INSTANCE, LOCATION_KIND, collectRecords, componentOf } from '../packages/state/dist/index.js';

const TICKS = Number.parseInt(process.argv[2] ?? '1200', 10);
const SEEDS = [20260814 + 7919, 20260814 + 15838];

for (const seed of SEEDS) {
  const content = referenceContent(undefined, 'true-naming');
  const run = referenceScenario(content);
  let state = run.scenario.create(seed, { worldTickCap: TICKS, options: {} });
  for (let t = 0; t < TICKS; t += 1) state = step(state, [], rngFromRootSeed(state.rootSeed));

  const fid = componentOf(state, KNOWLEDGE_FIDELITY);
  const rows = collectRecords(state, KNOWLEDGE_INSTANCE);
  let mindWithFidelity = 0, written = 0, gens = [], deepBooks = 0;
  for (const { handle, row } of rows) {
    const has = fid.has(handle);
    if (row.locationKind === LOCATION_KIND.mind || row.locationKind === LOCATION_KIND.palace) {
      if (has) mindWithFidelity += 1;
    } else {
      written += 1;
      if (has) {
        const g = fid.get(handle, 'copyGeneration');
        gens.push(g);
        if (g > 1024) deepBooks += 1;
      }
    }
  }
  gens.sort((a,b)=>a-b);
  console.log(JSON.stringify({
    seed, ticks: TICKS,
    instances: rows.length,
    written,
    studiesCompleted: mindWithFidelity,
    booksPastGeneration1: deepBooks,
    generationMin: gens[0], generationMax: gens[gens.length-1],
    generationMedian: gens[Math.floor(gens.length/2)],
  }));
}
