/*
 * Multiverse Mages — W144: can the raid record see an ablation at all?
 * Copyright (C) 2026 Ann Kelner
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version. See the LICENSE file at the repository root, or
 * <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The measurement that named this change, made re-runnable.
 *
 * #144 threaded §9's ablation mask into `openPortal`. A follow-up then ran
 * `portal-rush` — the one arm that fields real combatants — and found that
 * **ablating six of the seven combat primitives moved the raid log on none of
 * four seeds, even there.** That reads as "the mask is dead" and it is not: the
 * mask was live and `RaidRecord` could not see it. `RaidOutcome` already carried
 * an `actionEconomy` block and the record threw it away.
 *
 * This script is the before/after, and it reports **two** comparisons per arm
 * rather than one, because they are different claims and folding them loses the
 * only interesting one:
 *
 * - `combatBlockMoved` — the five fields this change added or unhardcoded. On
 *   `origin/main` this is `false` for every arm *by construction*: the executor
 *   wrote `combatSources: []`, three zeros and a four-name channel list into
 *   every observation, so no arm could differ from any other.
 * - `outcomeMoved` — the raid's shape and result, which the record already
 *   carried. A change to reporting must never move this one.
 *
 * ## What it finds, and why the answer is not the one the task expected
 *
 * The reference scenario **joins no combat at all**. Across all eight shipped
 * strategies, two seeds each — 61 raids and 80,615 combatant-ticks — not one
 * combat attempt is begun. The cause is `chooseIntent`'s priority order: theft
 * outranks casting, and no shipped strategy grants a raider a combat node, so
 * `firstCastableNode` returns nothing on every tick of every raid.
 *
 * So ablating any of the six primitives that act through a cast still moves
 * nothing here — and that is now a *reported* zero over a real denominator
 * instead of a hardcoded one. Before this change `combatActionEconomy` returned
 * `no-observations` with the reason *"the raids in this run contained no
 * combatant-ticks at all — every raid resolved on the tick it opened"*, which
 * was false on all 61 of them.
 *
 * `knowledge-steal` is the positive control, and it is the only one available:
 * it is the one combat primitive whose neutralization changes a reference run at
 * all — #144 established that, and this table reproduces it on three of four
 * seeds. On `0x00041000` the combat block moves with it, 4,212 combatant-ticks
 * to 4,580. **Its outcome moves too**, because theft outranking casting is a
 * behaviour and not an instrument; the claim being made is only that the block
 * is not inert across the boundary, which is what a probe with no live source
 * anywhere in the scenario can honestly establish.
 *
 *     node scripts/w144-ablation-visibility.mjs
 *     STRATEGY=portal-rush HORIZON=1200 node scripts/w144-ablation-visibility.mjs
 */
import { executeReferenceRun } from '@mm/scenario';

const SEEDS = [0x0bad_c0de, 0x00ab_cdef, 0x1234_5678, 0x0004_1000];
const HORIZON = Number(process.env.HORIZON ?? 600);
const STRATEGY = process.env.STRATEGY ?? 'passive-control';
const METRICS = ['combatActionEconomy', 'combatThresholdEfficiency'];

/** `contracts.md` §3's seven combat primitives, in the order §9's mask names them. */
const PRIMITIVES = [
  'direct-damage',
  'area-denial',
  'ward',
  'concealment',
  'blink',
  'summon',
  'knowledge-steal',
];

function task(seed, ablated) {
  return {
    coordinates: { cellId: 'w144', replicate: 0, sweepId: 'w144-ablation' },
    runSeed: seed,
    levels: {},
    strategies: [STRATEGY],
    worldTickCap: HORIZON,
    metrics: METRICS,
    ablatedPrimitives: ablated === undefined ? [] : [ablated],
  };
}

/**
 * The five fields this change added or unhardcoded, and **only** those.
 *
 * Split from {@link outcomeOf} deliberately. A comparison that folded
 * `engagementTicks` in would report a difference this change did not cause and
 * claim the instrument moved when the rules had; the whole assertion here is
 * that exactly one of those two things happens.
 */
function combatBlockOf(raids) {
  return JSON.stringify(
    (raids ?? []).map((r) => [
      r.combatSources,
      r.totalCombatantTicks,
      r.worldScaleRemovals,
      r.summonsRemoved,
      r.unimplementedCombatChannels,
    ]),
  );
}

/** What the record already said before this change: the raid's shape and its result. */
function outcomeOf(raids) {
  return JSON.stringify(
    (raids ?? []).map((r) => [
      r.raidId,
      r.engagementTicks,
      r.initialPortalStabilityTicks,
      r.attackerTempoCostWorldTicks,
    ]),
  );
}

function summary(result) {
  const raids = result.raids ?? [];
  let denied = 0;
  let span = 0;
  let attempts = 0;
  let removals = 0;
  for (const raid of raids) {
    span += raid.totalCombatantTicks;
    removals += raid.worldScaleRemovals;
    for (const row of raid.combatSources) {
      denied += row.deniedCombatantTicks;
      attempts += row.removingAttempts + row.hurtingAttempts + row.spentAttempts;
    }
  }
  const metrics = result.outcome.metrics ?? {};
  const read = (id) =>
    metrics[id]?.status === 'measured' ? String(metrics[id].value) : `unavailable:${metrics[id]?.reason ?? '?'}`;
  return {
    raidCount: raids.length,
    span,
    denied,
    attempts,
    removals,
    channels: raids[0]?.unimplementedCombatChannels ?? null,
    actionEconomy: read('combatActionEconomy'),
    thresholdEfficiency: read('combatThresholdEfficiency'),
    combatBlock: combatBlockOf(raids),
    outcome: outcomeOf(raids),
  };
}

console.log(`strategy=${STRATEGY} horizon=${HORIZON} seeds=${SEEDS.length}`);
console.log('');

let totalRaids = 0;
let totalSpan = 0;
let totalAttempts = 0;
for (const seed of SEEDS) {
  const control = summary(executeReferenceRun(task(seed)));
  totalRaids += control.raidCount;
  totalSpan += control.span;
  totalAttempts += control.attempts;
  console.log(
    `seed 0x${seed.toString(16).padStart(8, '0')}  raids=${String(control.raidCount).padStart(2)} ` +
      `combatantTicks=${String(control.span).padStart(6)} attempts=${String(control.attempts).padStart(4)} ` +
      `denied=${String(control.denied).padStart(4)} removals=${String(control.removals).padStart(3)} ` +
      `channels=${JSON.stringify(control.channels)}`,
  );
  console.log(
    `    combatActionEconomy=${control.actionEconomy}  combatThresholdEfficiency=${control.thresholdEfficiency}`,
  );
  for (const primitive of PRIMITIVES) {
    const ablated = summary(executeReferenceRun(task(seed, primitive)));
    const block = ablated.combatBlock !== control.combatBlock;
    const outcome = ablated.outcome !== control.outcome;
    console.log(
      `    ablate ${primitive.padEnd(16)} combatBlockMoved=${String(block).padEnd(5)} ` +
        `outcomeMoved=${String(outcome).padEnd(5)} combatantTicks ${control.span} -> ${ablated.span}`,
    );
  }
  console.log('');
}
console.log(
  `TOTAL  raids=${totalRaids} combatantTicks=${totalSpan} attempts=${totalAttempts}` +
    (totalAttempts === 0
      ? '  <- not one combat attempt was begun. The six metrics are null for a reason the record can now state.'
      : ''),
);
