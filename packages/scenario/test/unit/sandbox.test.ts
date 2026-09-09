/*
 * Multiverse Mages — the sandbox layer: inert when off, effective when on, and
 * refused by everything that consumes a run.
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
 * Four claims, and the order is the order in which failing one would matter
 * most.
 *
 * 1. **Off by default, byte for byte.** The three hashes in
 *    {@link INERT_DEFAULT_HASHES} are what the default scenario produces with
 *    no cheat sheet, at three horizons.
 *
 *    They began as a genuine pre-change anchor: measured on a working tree
 *    byte-identical to `origin/main` at `57bcbc44`, *before* `sandbox.ts` was
 *    written — `git status --porcelain` empty, `npx tsc --build`, then a script
 *    driving `referenceScenario(content, { raids: true })` through
 *    `createSession` for N no-op ticks. **They are no longer that**, and the
 *    constant is renamed rather than quietly re-filled, because a name that
 *    still said `PRE_CHANGE` would be asserting a provenance it had lost.
 *
 *    Re-measured 2026-08-17 at `c6d11439` on `integration/all-branches`, by the
 *    procedure above and with the same `sessionHashAfter` this file ships. The
 *    world moved on purpose and repeatedly since `57bcbc44` — seven material
 *    kinds, all seventy grid cells enabled, the ore grades, the flow ledger —
 *    and each of those is a change a reviewer was told about at the time. What
 *    a re-measured anchor can no longer prove is that *`sandbox.ts` itself* was
 *    inert when it landed; that claim is spent, and the two structural
 *    assertions beside this one — the schema is the plain schema, and no
 *    `sandbox-cheats` system is installed — are what carry it now, because they
 *    are properties rather than numbers.
 *
 *    What the hashes still do, and it is worth keeping: they fail on the *next*
 *    unannounced move of the reference universe.
 * 2. **On, it does something.** A checker that has never fired is not known to
 *    work. Every assertion below that says "the sandbox refuses this" is paired
 *    with one that says "and here is the input it must accept".
 * 3. **The brand cannot be laundered.** In the bytes, surviving a save,
 *    refusing an honest load, monotone across further ticks.
 * 4. **The harness will not take a cheated run as evidence** — and the same
 *    validator still accepts an honest one.
 */

import { setImmediate } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import {
  deserializeState,
  rngFromRootSeed,
  serializeState,
  snapshotHash,
  step,
} from '@mm/sim-core';
import type { SimState, StepContext } from '@mm/sim-core';
import { GOD_ACTION, createSession } from '@mm/agent-api';
import {
  MATERIAL_STOCK,
  UNIVERSE,
  UNIVERSITY,
  componentOf,
  defineWorldStateSchema,
  findUniverse,
  readUniverse,
} from '@mm/state';
import { MATERIAL_KINDS } from '@mm/rules-world';
import { provenanceProblems } from '@mm/mc-harness';
import type { RunTask } from '@mm/mc-harness';
import {
  SANDBOX_BRAND,
  SANDBOX_CHEAT,
  SANDBOX_CLAIMANT_KIND,
  SANDBOX_MATERIAL_KINDS,
  executeReferenceRunAsync,
  isSandboxSchema,
  normalizeSandbox,
  referenceContent,
  referenceScenario,
  sandboxBrandOf,
} from '@mm/scenario';
import type { SandboxSpec } from '@mm/scenario';

const content = referenceContent();

/**
 * The seed and the two horizons the pre-change anchors were taken at.
 *
 * Not arbitrary: 20260813 is `play-server.mjs`'s default seed, so the control
 * is taken on the universe a person actually opens.
 */
const ANCHOR_SEED = 20260813;

/**
 * Snapshot hashes of the **default** reference scenario — no cheat sheet — at
 * three horizons. See this file's opening note for how they were taken and for
 * what they can and cannot prove now.
 *
 * If one of these moves, either the sandbox stopped being inert or somebody
 * changed the reference universe. Both are things a reviewer must be told about
 * rather than allowed to discover later, which is why this is a hash equality
 * and not a tolerance.
 *
 * Measured at `c6d11439`, 2026-08-17. The previous set, taken at `57bcbc44`,
 * was `1b95bef9afe5b5d4` / `251dc6441d9c707b` / `3097649cf676def1`; it is kept
 * here so the size of the move is readable rather than only its fact.
 */
const INERT_DEFAULT_HASHES: Readonly<Record<number, string>> = {
  0: '8d469da1580f04dd',
  200: 'c7f1cb92d46363cd',
  500: '1f0ecc854f46abab',
};

/** Generous, for the reason `balance-telemetry.test.ts` gives at length. */
const SLOW_TEST_MS = 180_000;

/**
 * Ticks between yields back to the event loop.
 *
 * Twelve — one world year, the period `long-run.ts` set as this repository's
 * convention — rather than the sixty this file first guessed at. Instrumented on
 * 2026-08-18 the longest stretch this file left the event loop untouched was
 * 15.3 s inside a full `npm run verify`, and birpc's window is a hardcoded 60 s
 * before `vitest.config.ts`'s 1.4-3.5x CI factor is applied.
 */
const YIELD_EVERY_TICKS = 12;

/** A small universe: nothing here is about population, and population is cost. */
const OPTIONS = { cohortSize: 4, foundingMages: 2, foundingNodes: 4 } as const;

/**
 * Drives the default scenario through a session, exactly as the anchor script
 * did.
 *
 * Async only so that it can hand the event loop back once a world year; the
 * submissions between two yields are unchanged and entirely synchronous, and the
 * hashes below are the proof that it moved nothing.
 */
async function sessionHashAfter(ticks: number): Promise<string> {
  const { scenario } = referenceScenario(content, { raids: true });
  const session = createSession({ scenario, strategyId: 'inert-control' });
  session.reset(ANCHOR_SEED, { worldTickCap: 4000 });
  for (let tick = 0; tick < ticks; tick += 1) {
    if (session.status() === 'running') session.submit({ kind: GOD_ACTION.noop });
    if (tick % YIELD_EVERY_TICKS === YIELD_EVERY_TICKS - 1) await setImmediate();
  }
  return session.snapshotHash();
}

/** One universe stepped to a horizon, with or without a cheat sheet. */
async function play(
  seed: number,
  ticks: number,
  sandbox?: SandboxSpec,
): Promise<{ state: SimState; scenarioId: string }> {
  const run = referenceScenario(content, {
    raids: true,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  let state = run.scenario.create(seed, { worldTickCap: ticks, options: { ...OPTIONS } });
  const rng = rngFromRootSeed(seed);
  for (let tick = 0; tick < ticks; tick += 1) {
    state = step(state, [], rng);
    if (tick % YIELD_EVERY_TICKS === YIELD_EVERY_TICKS - 1) await setImmediate();
  }
  return { state, scenarioId: run.scenario.scenarioId };
}

const stockOf = (state: SimState, kind: string): number =>
  (componentOf(state, MATERIAL_STOCK) as unknown as { get(h: number, k: string): number }).get(
    findUniverse(state),
    kind,
  );

/** A task the reference executor accepts. Deliberately tiny. */
function taskFor(runSeed: number): RunTask {
  return {
    coordinates: { rootSeed: runSeed, sweepId: 'sandbox-probe', cellIndex: 0, replicateIndex: 0 },
    runSeed,
    levels: { ...OPTIONS },
    strategies: ['passive-control'],
    worldTickCap: 40,
    metrics: [],
    ablatedPrimitives: [],
  };
}

describe('the sandbox is off by default, and provably so', () => {
  it(
    'reproduces the recorded inert-default snapshot hashes at every measured horizon',
    { timeout: SLOW_TEST_MS },
    async () => {
      for (const [ticks, expected] of Object.entries(INERT_DEFAULT_HASHES)) {
        expect(await sessionHashAfter(Number(ticks)), `at ${ticks} ticks`).toBe(expected);
      }
    },
  );

  it('builds the default world on exactly the components it built before', () => {
    const plain = defineWorldStateSchema([]);
    const run = referenceScenario(content, { raids: true });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10 });
    expect(state.schema.components.map((c) => c.name)).toStrictEqual(
      plain.components.map((c) => c.name),
    );
    expect(isSandboxSchema(state.schema)).toBe(false);
    expect(sandboxBrandOf(state)).toBeUndefined();
    expect(run.sandbox).toBeUndefined();
    expect(run.scenario.scenarioId).toBe('reference-universe-v1');
  });

  it('installs no sandbox system when no sheet is given', () => {
    const run = referenceScenario(content, { raids: true });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10 });
    expect(state.schema.systems.map((s) => s.name)).not.toContain('sandbox-cheats');
  });
});

describe('the brand is in the bytes and cannot be taken off', () => {
  it('is a positive control: an empty sheet still changes the hash', () => {
    // The pair that proves the previous block is not vacuous. An empty cheat
    // sheet changes *nothing* about the universe's content — and it must still
    // move the hash, because the brand is a component section in the snapshot.
    // If these two were equal, the brand would not be in the bytes and every
    // laundering claim below would be decoration.
    const honest = referenceScenario(content, { raids: true });
    const cheated = referenceScenario(content, { raids: true, sandbox: {} });
    const a = honest.scenario.create(ANCHOR_SEED, { worldTickCap: 10 });
    const b = cheated.scenario.create(ANCHOR_SEED, { worldTickCap: 10 });
    expect(snapshotHash(a)).toBe(INERT_DEFAULT_HASHES[0]);
    expect(snapshotHash(b)).not.toBe(snapshotHash(a));
    expect(isSandboxSchema(b.schema)).toBe(true);
  });

  it('records a scenario id no baseline keyed on the reference one can match', () => {
    const run = referenceScenario(content, { raids: true, sandbox: { favor: 1024 } });
    expect(run.scenario.scenarioId).not.toBe('reference-universe-v1');
    expect(run.scenario.scenarioId.startsWith('sandbox:reference-universe-v1:')).toBe(true);
    expect(run.sandbox?.digest).toHaveLength(16);
  });

  it('brands at founding, before any cheat has fired', () => {
    const run = referenceScenario(content, { raids: true, sandbox: {} });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10 });
    const brand = sandboxBrandOf(state);
    expect(brand?.version).toBe(1);
    expect(brand?.cheatMask).toBe(0);
    expect(brand?.firstCheatTick).toBe(-1);
    expect(brand?.digest).toBe(run.sandbox?.digest);
  });

  it('survives a save, and refuses to load into an honest build', async () => {
    const { state } = await play(ANCHOR_SEED, 20, { grantMaterials: { food: 4096 } });
    const bytes = serializeState(state);

    const reloaded = deserializeState(bytes, state.schema);
    const brand = sandboxBrandOf(reloaded);
    expect(brand?.cheats).toContain('grantMaterial');
    expect(brand?.digest).toBe(sandboxBrandOf(state)?.digest);

    // The load path an honest build would take. It must not silently drop the
    // brand — a save that loads clean is a cheated run laundered by a round
    // trip, which is the exact thing this layer exists to make impossible.
    expect(() => deserializeState(bytes, defineWorldStateSchema([]))).toThrow(/sandbox-brand/);
  });

  it(
    'stays branded, and the mask only grows, as the run plays on',
    { timeout: SLOW_TEST_MS },
    async () => {
      const sheet: SandboxSpec = { materialFloor: { vellum: 500_000 * 1024 } };
      const short = await play(ANCHOR_SEED, 30, sheet);
      const long = await play(ANCHOR_SEED, 120, sheet);
      const early = sandboxBrandOf(short.state);
      const late = sandboxBrandOf(long.state);
      expect(early?.cheatMask).toBeGreaterThan(0);
      // Monotone: every bit set early is still set late, and the count of
      // applications never falls. There is no verb that clears either.
      expect((late as { cheatMask: number }).cheatMask & (early as { cheatMask: number }).cheatMask)
        .toBe(early?.cheatMask);
      expect(late?.applications).toBeGreaterThanOrEqual(early?.applications ?? 0);
      expect(late?.cheats).toContain('materialFloor');
    },
  );
});

describe('the cheats act', () => {
  it('derives the material kinds from the component rather than listing them', () => {
    expect(SANDBOX_MATERIAL_KINDS).toStrictEqual([...MATERIAL_KINDS].sort());
    expect(SANDBOX_MATERIAL_KINDS).toStrictEqual(Object.keys(MATERIAL_STOCK.fields).sort());
  });

  it('refuses a kind this content does not have, naming the ones it does', () => {
    // `essence` stood here and **is a real kind now** — `material-economy`
    // widened `material-stock` from three kinds to seven, and this assertion
    // went from refusing an invention to refusing something the component
    // declares. Re-pinned as a content decision, with a name chosen so the same
    // thing cannot happen again: `sunlight` is not a material in any flow model
    // in `docs/design/economy-flow-models.md`, where every one of the seven was
    // named before it was added.
    expect(() => normalizeSandbox({ grantMaterials: { sunlight: 1024 } })).toThrow(/sunlight/);
    // The positive control for that refusal: every declared kind is accepted.
    for (const kind of SANDBOX_MATERIAL_KINDS) {
      expect(() => normalizeSandbox({ grantMaterials: { [kind]: 1024 } })).not.toThrow();
    }
  });

  it('sets and grants a stock at founding', () => {
    const run = referenceScenario(content, {
      raids: true,
      sandbox: { setMaterials: { stone: 7 * 1024 }, grantMaterials: { stone: 3 * 1024 } },
    });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10, options: { ...OPTIONS } });
    expect(stockOf(state, 'stone')).toBe(10 * 1024);
    expect(sandboxBrandOf(state)?.cheats).toStrictEqual(['setMaterial', 'grantMaterial']);
  });

  it(
    'keeps a satisfied claimant’s kind from ever running short',
    { timeout: SLOW_TEST_MS },
    async () => {
      // `scribing` is paid out of vellum, and vellum is the contended stock:
      // `materials.ts` records it reaching zero by world-tick 1200 and being
      // short on 530 of 2,400 ticks on the reference run. So this is the
      // claimant worth satisfying, and the arm below is the one that shows it.
      const floor = 400_000 * 1024;
      const kind = SANDBOX_CLAIMANT_KIND.scribing;
      expect(kind).toBe('vellum');

      const cheated = await play(ANCHOR_SEED, 150, { satisfy: ['scribing'], satisfyFloor: floor });
      const honest = await play(ANCHOR_SEED, 150);

      // Not `>= floor`, and the difference is the whole semantic. The system
      // runs ahead of the world loop, so the stock is at the floor when the
      // claimants are paid; by the time the tick ends they have spent out of
      // it. Measured here: 3,383 fp below the floor, or 0.0008% — the tick's
      // net spend, not a leak. Asserting `>= floor` would have been asserting
      // that the economy consumed nothing.
      const shortfallBelowFloor = floor - stockOf(cheated.state, kind);
      expect(shortfallBelowFloor).toBeGreaterThan(0);
      expect(shortfallBelowFloor).toBeLessThan(1024 * 1024);

      // The control that makes that number mean something: the same universe
      // without the sheet is nowhere near the floor of its own accord.
      expect(stockOf(honest.state, kind)).toBeLessThan(floor / 2);
      expect(sandboxBrandOf(cheated.state)?.cheats).toContain('materialFloor');
    },
  );

  it('pins a stock down when asked, which is how a shortfall is watched', async () => {
    const { state } = await play(ANCHOR_SEED, 40, { materialCeiling: { vellum: 0 } });
    const honest = await play(ANCHOR_SEED, 40);
    // Not exactly zero, for the mirror of the floor's reason: the ceiling
    // clears the carry-over at the top of the tick and phase 1's own production
    // still lands. Measured: 101 fp, against a starting endowment of 1,024,000.
    // A ceiling of zero is "hand to mouth", which is what the doc comment says
    // and is what makes a shortfall observable.
    expect(stockOf(state, 'vellum')).toBeLessThan(1024);
    expect(stockOf(honest.state, 'vellum')).toBeGreaterThan(100 * 1024);
    expect(sandboxBrandOf(state)?.cheats).toContain('materialCeiling');
  });

  it('refuses a kind floored above its own ceiling', () => {
    expect(() =>
      normalizeSandbox({ materialFloor: { food: 1024 }, materialCeiling: { food: 0 } }),
    ).toThrow(/would win every tick/);
  });

  it('grants favor, prestige and worship, and arms the whole grid', () => {
    const run = referenceScenario(content, {
      raids: true,
      sandbox: {
        favor: 50 * 1024,
        favorCap: 500 * 1024,
        prestige: 9 * 1024,
        worship: 3 * 1024,
        worshipTier: 2,
        edictBudget: 12,
        armEverything: true,
      },
    });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10, options: { ...OPTIONS } });
    const universe = readUniverse(state, findUniverse(state));
    expect(universe.favor).toBe(50 * 1024);
    expect(universe.favorCap).toBe(500 * 1024);
    expect(universe.prestige).toBe(9 * 1024);
    expect(universe.prestigeEarned).toBe(9 * 1024);
    expect(universe.worship).toBe(3 * 1024);
    expect(universe.worshipTier).toBe(2);
    expect(universe.edictBudget).toBe(12);

    // Every technique and form the content declares, read from the registry —
    // never `0xff`. The honest arm holds strictly fewer of each.
    //
    // **The honest arm is opened at 1x1 on purpose, as of 2026-08-17.** It used
    // to be the plain default, and that stopped being a control the day the
    // default opening square became the whole grid: an honest universe already
    // holds all five techniques and all fourteen forms, so `armEverything`
    // cannot widen anything and `toBeGreaterThan` compared 31 with 31. Relaxing
    // the comparison to `>=` would have kept the file green and thrown the
    // control away — a cheat that did nothing would then pass. A narrow opening
    // square restores a universe there is something to arm, so the assertion is
    // still the one it was written to be.
    const honest = referenceScenario(content, { raids: true }).scenario.create(ANCHOR_SEED, {
      worldTickCap: 10,
      options: { ...OPTIONS, openingTechniqueCount: 1, openingFormCount: 1 },
    });
    const before = readUniverse(honest, findUniverse(honest));
    expect(universe.permittedTechniques).toBeGreaterThan(before.permittedTechniques);
    expect(universe.permittedForms).toBeGreaterThan(before.permittedForms);
    // `record.bit` is the axis's index; the ruleset field is a mask over those
    // indices. Shifting here rather than ORing indices is the assertion that
    // caught the same mistake in the production path.
    const allTechniques = content.registry.techniques.reduce(
      (b, { record }) => b | (1 << record.bit),
      0,
    );
    const allForms = content.registry.forms.reduce((b, { record }) => b | (1 << record.bit), 0);
    expect(universe.permittedTechniques).toBe(allTechniques);
    expect(universe.permittedForms).toBe(allForms);
  });

  it('founds universities free and finished, and sets student seats', () => {
    const run = referenceScenario(content, {
      raids: true,
      sandbox: { foundUniversities: 3, studentSeats: 7, completeConstruction: true },
    });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10, options: { ...OPTIONS } });
    const store = componentOf(state, UNIVERSITY);
    const rows: number[] = [];
    store.forEach((_row, handle) => rows.push(handle));
    // The founding academy plus the three asked for.
    expect(rows).toHaveLength(4);
    for (const handle of rows) expect(store.get(handle, 'buildProgress')).toBe(1024);
    // The founding academy's seats were set; the three founded after it take
    // the same number, which is what "set the seats" has to mean.
    for (const handle of rows) expect(store.get(handle, 'capacity')).toBe(7);
  });

  it('puts a node in a mind and a book on a shelf', () => {
    const nodeId = content.catalogue.nodes[0]?.nodeId as number;
    const run = referenceScenario(content, {
      raids: true,
      sandbox: { grantKnowledge: [{ nodeId }], shelveKnowledge: [nodeId] },
    });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10, options: { ...OPTIONS } });
    const cheats = sandboxBrandOf(state)?.cheats ?? [];
    expect(cheats).toContain('grantKnowledge');
    expect(cheats).toContain('shelveKnowledge');
  });
});

describe('the layer draws no randomness', () => {
  it('runs the per-tick system against an rng that throws on contact', () => {
    const normalized = normalizeSandbox({
      materialFloor: { food: 9 * 1024 },
      materialCeiling: { vellum: 0 },
    });
    const run = referenceScenario(content, { raids: true, sandbox: normalized.spec });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10, options: { ...OPTIONS } });
    const system = state.schema.systems.find((s) => s.name === 'sandbox-cheats');
    expect(system).toBeDefined();

    const hostile = {
      rootSeed: ANCHOR_SEED,
      stream: () => {
        throw new Error('the sandbox layer drew a random number');
      },
      actorStream: () => {
        throw new Error('the sandbox layer drew a random number');
      },
    };
    const ctx = {
      state,
      actions: [],
      rng: hostile,
      tick: 0,
      mode: state.clock.mode,
      requestEngagement: () => {
        throw new Error('the sandbox layer requested a clock transition');
      },
      requestWorldTime: () => {
        throw new Error('the sandbox layer requested a clock transition');
      },
    } as unknown as StepContext;

    expect(() => system?.run(ctx)).not.toThrow();
    // The positive control for the hostile rng: it does throw when touched.
    expect(() => hostile.stream()).toThrow(/drew a random number/);
    expect(stockOf(state, 'food')).toBeGreaterThanOrEqual(9 * 1024);
    expect(stockOf(state, 'vellum')).toBe(0);
  });
});

describe('the harness will not take a cheated run as evidence', () => {
  it(
    'stamps the provenance of a cheated run and refuses the record it produced',
    { timeout: SLOW_TEST_MS },
    async () => {
      const cheated = await executeReferenceRunAsync(taskFor(7), {
        content,
        sandbox: { grantMaterials: { food: 1024 * 1024 }, armEverything: true },
      });
      expect(cheated.outcome.provenance.sandbox).toBeDefined();
      const problems = provenanceProblems(cheated.outcome.provenance);
      expect(problems.join('\n')).toMatch(/sandbox cheat layer/);

      // The positive control, and it is the whole reason the line above is worth
      // anything: the same validator, on the same executor, with no sheet.
      const honest = await executeReferenceRunAsync(taskFor(7), { content });
      expect(honest.outcome.provenance.sandbox).toBeUndefined();
      expect(provenanceProblems(honest.outcome.provenance)).toStrictEqual([]);
    },
  );
});

describe('the brand component is declared where it cannot move an honest hash', () => {
  it('is absent from the world component set', () => {
    expect(defineWorldStateSchema([]).components.map((c) => c.name)).not.toContain(
      SANDBOX_BRAND.name,
    );
    // ...and present on a sandbox world, on the universe entity, beside the
    // component it is a statement about.
    const run = referenceScenario(content, { raids: true, sandbox: {} });
    const state = run.scenario.create(ANCHOR_SEED, { worldTickCap: 10 });
    expect(componentOf(state, SANDBOX_BRAND).has(findUniverse(state))).toBe(true);
    expect(componentOf(state, UNIVERSE).has(findUniverse(state))).toBe(true);
  });

  it('enumerates every cheat bit exactly once', () => {
    const bits = Object.values(SANDBOX_CHEAT);
    expect(new Set(bits).size).toBe(bits.length);
    for (const bit of bits) expect(Number.isInteger(Math.log2(bit))).toBe(true);
  });
});
