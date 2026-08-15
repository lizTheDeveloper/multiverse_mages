// Does the library bill outrun the shelves? Reports the upkeep triple per tick.
import { referenceContent, referenceScenario } from '../../packages/scenario/dist/index.js';
import { step, rngFromRootSeed } from '../../packages/sim-core/dist/index.js';
import { collectRecords, GRIMOIRE } from '../../packages/state/dist/index.js';

const cap = Number(process.argv[2] ?? 600);
const content = referenceContent();
const { scenario, lastReport } = referenceScenario(content);
let state = scenario.create(20260813, { worldTickCap: cap, options: {} });
const rng = rngFromRootSeed(20260813);
const marks = new Set((process.env.MARKS ?? '60,120,180,240,300,360,420,480,540,599').split(',').map(Number));
let owed = 0, paid = 0, degraded = 0, scribed = 0;
console.log('tick\tgrimoires\tupkeepOwed\tupkeepPaid\tdegraded\tscribed\taffil');
for (let tick = 0; tick < cap; tick += 1) {
  state = step(state, process.env.PASSIVE ? [] : [{ kind: 11, params: [0] }], rng);
  const r = lastReport();
  owed += r.libraryUpkeepOwed; paid += r.libraryUpkeepPaid;
  degraded += r.libraryInstancesDegraded; scribed += r.grimoiresScribed;
  if (marks.has(tick)) {
    console.log([tick, collectRecords(state, GRIMOIRE).length, owed, paid, degraded, scribed, r.magesAffiliated].join('\t'));
  }
}
