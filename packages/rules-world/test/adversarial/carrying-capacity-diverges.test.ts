/*
 * Multiverse Mages — adversarial: carrying capacity must not track a quantity
 * that only grows.
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
 * ## The loop the audit ran, run again
 *
 * An adversarial audit composed five shipped functions in the order the world
 * step composes them — {@link materialsProduced} → {@link consumeMaterials} →
 * {@link carryingCapacity} → {@link fertilityBrake} → {@link expectedBirths} —
 * and stepped them for 2,400 ticks, the length of the `economy` spec's 200
 * world years. Under the superseded shape, where `K` was
 * `CAPACITY_PER_MATERIAL × materials` plus a flat addend per seat, it found:
 *
 * | laborShare | P at t=2400 | K at t=2400 |
 * |---|---|---|
 * | 0.15 | 1,000 | 1,132 |
 * | 0.20 | 3,338 | 4,510 |
 * | 0.30 | 18,156 | 31,217 |
 * | 0.50 | 115,752 | 289,997 |
 *
 * Still accelerating at the end, because net materials per person per tick is
 * `laborShare × MATERIALS_PER_LABORER − SUBSISTENCE_PER_PERSON` in raw `fp` and
 * nothing anywhere consumes in proportion to `K`.
 *
 * ## Why the old test did not catch it
 *
 * Because `P < K` held at every tick of every one of those runs. The `economy`
 * spec asked that *"total population never exceeds `K`"*, and a bound running
 * away ahead of the thing it bounds satisfies that forever. The requirement was
 * true and empty at the same time.
 *
 * So this file asserts **`K` itself**. Every assertion below is over the
 * capacity, not over the population under it, and the one at the end is the
 * reason the rest are not circular: it checks that the materials stock is still
 * running away — that the input which used to drive `K` past every bound is
 * still doing exactly what it did — so the only thing keeping `K` finite is the
 * shape of `carryingCapacity`.
 *
 * Nothing here is a claim about magnitudes. Every constant it reads is untuned
 * (`docs/design/release-plan.md`), and what is asserted is that a bound exists
 * and is a function of content, which is a structural property and not a
 * balance one.
 */

import { describe, expect, it } from 'vitest';

import { FP_ONE, floorDiv } from '@mm/sim-core';

import {
  BIRTH_RATE_ONE,
  MATERIALS_PROVISION_CAP,
  MATERIALS_PROVISION_SATURATION,
  MAX_PROVISIONING,
  carryingCapacity,
  consumeMaterials,
  expectedBirths,
  fertilityBrake,
  materialsProduced,
  maxCarryingCapacity,
  subsistenceDemand,
  territoryExtent,
} from '../../src/index.js';

import { primitiveNamed, shippedRegistry } from '../unit/universities-fixtures.js';

/** 200 world years, at `contracts.md` §0's twelve ticks to the year. */
const RUN_TICKS = 2_400;

/** The shipped territory — the fixed resource `K` is now derived from. */
const TERRITORY = territoryExtent(shippedRegistry().territories.map((entry) => entry.record));

/**
 * The laborer shares the audit ran, as `fp`.
 *
 * Every one of them is above one eighth, which is where net materials per
 * person turns positive and the old shape started to diverge. That is the point
 * of the list: these are not arbitrary settings, they are the settings that
 * broke it.
 */
const LABOR_SHARES: readonly { readonly label: string; readonly share: number }[] = [
  { label: '0.15', share: 154 },
  { label: '0.20', share: 205 },
  { label: '0.30', share: 307 },
  { label: '0.50', share: 512 },
];

interface Trace {
  readonly label: string;
  readonly capacity: readonly number[];
  readonly population: readonly number[];
  readonly materials: readonly number[];
}

/**
 * The five shipped functions, composed, with nothing invented between them.
 *
 * The one thing this harness supplies is *who works*: a fixed share of the
 * population labours and the rest does not, which stands in for the occupation
 * allocation that lives a layer up. Species traits are held neutral at `fp(1024)`
 * so that a failure is attributable to the capacity arithmetic and not to a
 * species magnitude — differentiation is asserted elsewhere and is not what is
 * under test here.
 */
function run(share: number): Trace {
  const fertilityPrimitive = primitiveNamed('fertility');
  const resourceYield = primitiveNamed('resource-yield');

  let population = 1_000;
  let stock = 0;
  const capacity: number[] = [];
  const populationSeries: number[] = [];
  const materials: number[] = [];

  for (let tick = 0; tick < RUN_TICKS; tick += 1) {
    const laborers = floorDiv(population * share, FP_ONE);
    stock += materialsProduced({
      laborerCount: laborers,
      laborAffinity: FP_ONE,
      resourceYield,
      resourceYieldBonuses: [],
    });

    const demand = subsistenceDemand(population);
    const outcome = consumeMaterials(stock, {
      subsistence: demand,
      libraryUpkeep: 0,
      scribing: 0,
      construction: 0,
    });
    stock = outcome.materialsRemaining;
    const shortfallShare =
      demand > 0 ? Math.min(FP_ONE, floorDiv(outcome.shortfall.subsistence * FP_ONE, demand)) : 0;

    const K = carryingCapacity({
      territory: TERRITORY,
      materials: stock,
      completedCapacity: 0,
      subsistenceShortfallShare: shortfallShare,
    });

    population += floorDiv(
      expectedBirths({
        count: population,
        fertility: FP_ONE,
        fertilityPrimitive,
        fertilityBonuses: [],
        brake: fertilityBrake(population, K),
      }),
      BIRTH_RATE_ONE,
    );

    capacity.push(K);
    populationSeries.push(population);
    materials.push(stock);
  }

  return { label: '', capacity, population: populationSeries, materials };
}

const traces: readonly Trace[] = LABOR_SHARES.map(({ label, share }) => ({
  ...run(share),
  label,
}));

const last = <T>(series: readonly T[]): T => series[series.length - 1] as T;

/**
 * The ceiling `K` can reach with no universities: base × `(1 + materials cap)`.
 *
 * Tighter than {@link maxCarryingCapacity}, which also allows the seat term.
 * These runs found no universities, so the seat term contributes nothing and the
 * tighter number is the honest one to assert against.
 */
const UNIVERSITY_FREE_CEILING = Math.floor(
  (TERRITORY.baseCapacity * (FP_ONE + MATERIALS_PROVISION_CAP)) / FP_ONE,
);

describe('carrying capacity converges over 200 world years of the composed loop', () => {
  it('records what it observed, so the bounds below are read against numbers', () => {

    console.log(
      `[capacity 200y] territory ${String(TERRITORY.landUnits)} land units · base ` +
        `${String(TERRITORY.baseCapacity)} · stated bound ${String(maxCarryingCapacity(TERRITORY))} ` +
        `· ceiling without universities ${String(UNIVERSITY_FREE_CEILING)}`,
    );
    for (const trace of traces) {
      const stock = last(trace.materials);
      console.log(
        `[capacity 200y] laborShare ${trace.label}: K ${String(last(trace.capacity))} · P ` +
          `${String(last(trace.population))} · materials ${String(stock)} fp · superseded shape ` +
          `would have said K = ${String(Math.floor((stock * 2) / FP_ONE))}`,
      );
    }
    expect(traces).toHaveLength(LABOR_SHARES.length);
  });

  it('holds K under its stated bound at every tick of every run', () => {
    // The assertion the old suite could not make, because there was no number
    // to make it against.
    const bound = maxCarryingCapacity(TERRITORY);
    for (const trace of traces) {
      const worst = Math.max(...trace.capacity);
      expect(
        worst,
        `at laborShare ${trace.label}, K reached ${String(worst)} against a stated bound of ` +
          `${String(bound)}`,
      ).toBeLessThanOrEqual(bound);
      expect(last(trace.capacity)).toBeLessThanOrEqual(UNIVERSITY_FREE_CEILING);
    }
  });

  it('stops moving once the modulating term saturates, rather than slowing down', () => {
    // A runaway that decelerated would still be a runaway. What is asserted is
    // that `K` arrives at a value and stays there: over the final quarter of the
    // run, every run whose stock has passed saturation reports one number.
    const saturatingStock = TERRITORY.landUnits * MATERIALS_PROVISION_SATURATION;
    let saturated = 0;

    for (const trace of traces) {
      if (last(trace.materials) < saturatingStock) continue;
      saturated += 1;
      const tail = trace.capacity.slice(Math.floor((RUN_TICKS * 3) / 4));
      expect(
        new Set(tail).size,
        `at laborShare ${trace.label}, K was still moving over the final quarter of the run`,
      ).toBe(1);
      expect(last(trace.capacity)).toBe(UNIVERSITY_FREE_CEILING);
    }

    // Not every share saturates inside 2,400 ticks, but the assertion above is
    // worthless if none does.
    expect(saturated).toBeGreaterThan(0);
  });

  it('never lets the population pass the capacity, now that the capacity is finite', () => {
    // The scenario the `economy` spec always asked for. It is stated last on
    // purpose: on its own it is the vacuous assertion this file exists to
    // replace, and it means something only underneath the three above.
    for (const trace of traces) {
      let worstTick = -1;
      let worstOvershoot = 0;
      for (let tick = 0; tick < RUN_TICKS; tick += 1) {
        const overshoot = (trace.population[tick] as number) - (trace.capacity[tick] as number);
        if (overshoot > worstOvershoot) {
          worstOvershoot = overshoot;
          worstTick = tick;
        }
      }
      expect(
        worstOvershoot,
        `at laborShare ${trace.label}, tick ${String(worstTick)}: population ` +
          `${String(trace.population[worstTick])} passed K ${String(trace.capacity[worstTick])}`,
      ).toBe(0);
    }
  });

  it('is not passing because the runaway went away: the stock still grows without limit', () => {
    // The anti-vacuity check, and the load-bearing one. The input that used to
    // drive `K` past every bound is still doing exactly what it did — nothing in
    // this change consumes materials in proportion to `K`, and nothing was
    // meant to. If a later change makes the stock settle, this fails, and the
    // right response is to find a divergent input again rather than to relax
    // it: a convergence proof over an input that converged on its own proves
    // nothing about the shape of `K`.
    for (const trace of traces) {
      const midpoint = trace.materials[Math.floor(RUN_TICKS / 2)] as number;
      const final = last(trace.materials);
      expect(
        final,
        `at laborShare ${trace.label} the materials stock stopped growing, so this run no longer ` +
          'exercises the divergence the shape of K is meant to survive',
      ).toBeGreaterThan(midpoint);
    }

    // And on the worst share, the stock is by now large enough that the
    // superseded formula — `CAPACITY_PER_MATERIAL × materials`, with
    // `CAPACITY_PER_MATERIAL` of 2 — would put `K` past the stated bound. That
    // is the difference this change makes, measured rather than described.
    const worstShare = last(traces);
    const supersededCapacity = Math.floor((last(worstShare.materials) * 2) / FP_ONE);
    expect(supersededCapacity).toBeGreaterThan(maxCarryingCapacity(TERRITORY));
  });
});

describe('the bound is a function of content and of nothing else', () => {
  it('names only territory, so a longer run cannot move it', () => {
    // `maxCarryingCapacity` takes one argument and it is the fixed resource.
    // That is the property task 9.4 needs: a bound computed from a stock, a seat
    // count or a tick index is a bound a run can talk its way out of, and the
    // superseded shape is what that looks like in practice.
    expect(maxCarryingCapacity(TERRITORY)).toBe(
      Math.floor((TERRITORY.baseCapacity * MAX_PROVISIONING) / FP_ONE),
    );
  });

  it('moves only when the land does', () => {
    // The positive half: the bound is not a constant somebody wrote down, it
    // tracks the content it is derived from. Half the land, half the bound.
    const half = { landUnits: TERRITORY.landUnits / 2, baseCapacity: TERRITORY.baseCapacity / 2 };
    expect(maxCarryingCapacity(half) * 2).toBe(maxCarryingCapacity(TERRITORY));
    expect(maxCarryingCapacity({ landUnits: 0, baseCapacity: 0 })).toBe(0);
  });
});
