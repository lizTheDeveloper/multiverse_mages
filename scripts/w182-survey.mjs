import { rngFromRootSeed, step } from '@mm/sim-core';
import { ablationMaskFor } from '@mm/coordination';
import { referenceContent, referenceScenario } from '@mm/scenario';
const content = referenceContent();
const H = 400;
function play(seed, ablated) {
  const run = referenceScenario(content, { raids: true, telemetry: false, ...(ablated?{ablation:ablationMaskFor([ablated])}:{}) });
  let s = run.scenario.create(seed, { worldTickCap: H });
  for (let t = 0; t < H; t += 1) s = step(s, [], rngFromRootSeed(s.rootSeed));
  return { log: JSON.stringify(run.raids()), n: run.raids().length };
}
const prims = ['direct-damage','area-denial','ward','concealment','blink','summon','knowledge-steal'];
for (const seed of [0x0badc0de,0x00abcdef,0x12345678,0x00041000]) {
  const c = play(seed);
  const moved = prims.filter(p => play(seed, p).log !== c.log);
  console.log(`0x${seed.toString(16).padStart(8,'0')} raids=${c.n} moved=[${moved.join(',')}]`);
}
