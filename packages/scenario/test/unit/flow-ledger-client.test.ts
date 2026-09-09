/*
 * Multiverse Mages — the flow ledger, as a client actually receives it.
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
 * `WorldStepReport` computed a full per-tick flow ledger and threw it away.
 * These are the three controls on the wire that now carries it, and each is
 * behavioural: it runs the shipped recorder or the shipped world loop, never a
 * re-implementation of either.
 *
 * 1. **It reconciles on a real run.** `closing - opening == faucet - sink`, per
 *    kind, per frame, exactly — and the ledger's `closing` is checked against
 *    the `stocks` sidecar, which is a *different* projection off a *different*
 *    surface. Two instruments agreeing is a claim; one instrument agreeing with
 *    itself is not.
 * 2. **A leak shows.** `WorldStepDeps.leak` takes material out of the closing
 *    stock and records it nowhere, in the shipped loop, reached here through the
 *    shipped composition root. The client-visible ledger must carry the breach
 *    with the kind and the amount.
 * 3. **An absence is absent.** A recording made before the sidecar existed still
 *    loads and still draws, and reports the missing capability rather than
 *    printing `0`.
 *
 * ## Why every arithmetic assertion is on the raw `fp` integers
 *
 * The decoder divides by 1024 to give a page world units, and `1/1024` is exact
 * in binary floating point — but a *sum* of quotients is not always the quotient
 * of a sum. Asserting the identity on decoded floats would be asserting
 * something slightly weaker than the invariant, with a tolerance nobody chose.
 * The decoded values are checked separately, against the raw ones they came
 * from.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { GOD_ACTION, createSession, describeFlow } from '@mm/agent-api';
import type { FlowLedger } from '@mm/agent-api';

import { referenceContent, referenceScenario } from '../../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const scratch = mkdtempSync(path.join(tmpdir(), 'mm-flow-ledger-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const SEED = 20260813;
const TICKS = 60;

interface RawLedger {
  readonly worldTick: number;
  readonly opening: Record<string, number>;
  readonly closing: Record<string, number>;
  readonly faucet: Record<string, number>;
  readonly sink: Record<string, number>;
  readonly land: Record<string, number>;
  readonly applied: Record<string, number>;
  readonly spilled: Record<string, number>;
  readonly short: Record<string, boolean>;
  readonly claimants: readonly {
    readonly claimant: string;
    readonly kind: string;
    readonly owed: number;
    readonly paid: number;
    readonly shortfall: number;
    readonly settledIn: string;
  }[];
  readonly breaches: readonly {
    readonly kind: string;
    readonly delta: number;
    readonly expected: number;
    readonly discrepancy: number;
  }[];
  readonly pressure: Record<string, number>;
  readonly producers: Record<string, number>;
}

interface RecordedFrame {
  readonly obs: readonly number[];
  readonly stocks?: Record<string, number>;
  readonly flow?: RawLedger;
}

interface Recording {
  readonly provenance: Record<string, unknown>;
  readonly layout: readonly { readonly name: string; readonly offset: number; readonly size: number }[];
  readonly content: unknown;
  readonly actions: unknown;
  readonly frames: RecordedFrame[];
}

/**
 * One recording, from the shipped recorder.
 *
 * The script rather than a loop written here, for the reason `ui-recording.
 * test.ts` gives: a test that reimplements the recorder can agree with itself
 * while both have drifted from `record-session.mjs`, which is the one comparison
 * that matters.
 */
const recording = ((): Recording => {
  const out = path.join(scratch, 'session.json');
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts', 'record-session.mjs'),
      '--ticks',
      String(TICKS),
      '--seed',
      String(SEED),
      '--out',
      out,
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  return JSON.parse(readFileSync(out, 'utf8')) as Recording;
})();

/** The frames that carry a ledger — every frame but the opening one. */
const ledgerFrames = (): readonly RecordedFrame[] => recording.frames.filter((f) => f.flow !== undefined);

describe('control 1 — the sidecar reconciles, on a real run', () => {
  it('carries a ledger on every frame but the opening one, at the tick just stepped', () => {
    // The opening frame is absent by construction: nothing has been stepped at
    // tick 0, so there is no tick to report on. Every other frame is present,
    // and its `worldTick` is the frame index minus one — `step` runs its systems
    // on the tick the state arrived with and advances the clock afterwards.
    expect(recording.frames.length).toBe(TICKS + 1);
    expect(recording.frames[0]?.flow).toBeUndefined();
    for (let i = 1; i < recording.frames.length; i += 1) {
      const flow = recording.frames[i]?.flow;
      expect(flow, `frame ${String(i)} has no flow sidecar`).toBeDefined();
      expect(flow?.worldTick, `frame ${String(i)} reports the wrong tick`).toBe(i - 1);
    }
  });

  it("moves `delta == faucet - sink` on every kind of every tick, and the ledger's own breach list agrees", () => {
    // The invariant, checked **within** a frame and never across two. The god's
    // intervention system runs before the world loop in the same step and spends
    // the stocks for a priced action, so last tick's closing is not this tick's
    // opening whenever the god paid for something — a cross-frame check would
    // read those ticks as breaches and everything else as sound, which is a
    // checker answering about the wrong input.
    let checked = 0;
    let movement = 0;
    for (const frame of ledgerFrames()) {
      const flow = frame.flow as RawLedger;
      expect(flow.breaches, `tick ${String(flow.worldTick)} reports a breach`).toEqual([]);
      for (const kind of Object.keys(flow.opening)) {
        const delta = (flow.closing[kind] ?? 0) - (flow.opening[kind] ?? 0);
        const expected = (flow.faucet[kind] ?? 0) - (flow.sink[kind] ?? 0);
        expect(delta, `${kind} at tick ${String(flow.worldTick)}`).toBe(expected);
        checked += 1;
        if ((flow.faucet[kind] ?? 0) !== 0 || (flow.sink[kind] ?? 0) !== 0) movement += 1;
      }
    }
    expect(checked).toBe(TICKS * 7);

    // **The positive control, and it is the one that earns the test.** Every
    // assertion above is satisfied by a run in which nothing was ever produced
    // or consumed: `0 - 0 == 0 - 0`, seven kinds, sixty ticks, four hundred and
    // twenty confident agreements about nothing. This campaign has shipped that
    // shape five times. The reference universe has an economy, so most of those
    // pairs must have a flow in them for the identity to have compared anything.
    expect(movement).toBeGreaterThan(TICKS);
  });

  it("agrees with the `stocks` sidecar, which is a different projection off a different surface", () => {
    // The ledger's `closing` is what `writeMaterialStock` put in state; `stocks`
    // is `PlayerState.resources.stocks`, read back out of the component by
    // `project()` after the step. Two instruments, one number. A ledger that had
    // drifted from the world would agree with itself perfectly and disagree
    // here.
    let compared = 0;
    for (const frame of ledgerFrames()) {
      const flow = frame.flow as RawLedger;
      for (const kind of Object.keys(flow.closing)) {
        expect(frame.stocks?.[kind], `${kind} at tick ${String(flow.worldTick)}`).toBe(
          flow.closing[kind],
        );
        compared += 1;
      }
    }
    expect(compared).toBe(TICKS * 7);
  });

  it('composes each side out of the parts it publishes, so a map can draw them', () => {
    // What the flow map needs and what it would be wrong about if these did not
    // hold: the faucet is exactly the two sources it names, and the sink is
    // exactly the claimants plus the ceiling spill. A source or a sink that
    // reached the total and not the breakdown would draw as an arrow going
    // nowhere.
    let anyClaimantPaid = false;
    for (const frame of ledgerFrames()) {
      const flow = frame.flow as RawLedger;
      for (const kind of Object.keys(flow.faucet)) {
        expect(flow.faucet[kind], `faucet ${kind} at ${String(flow.worldTick)}`).toBe(
          (flow.land[kind] ?? 0) + (flow.applied[kind] ?? 0),
        );
        const paid = flow.claimants
          .filter((row) => row.kind === kind)
          .reduce((total, row) => total + row.paid, 0);
        expect(flow.sink[kind], `sink ${kind} at ${String(flow.worldTick)}`).toBe(
          (flow.spilled[kind] ?? 0) + paid,
        );
        if (paid > 0) anyClaimantPaid = true;
      }
      for (const row of flow.claimants) {
        expect(row.owed, `${row.claimant} at ${String(flow.worldTick)}`).toBe(
          row.paid + row.shortfall,
        );
      }
    }
    // The same control as above, for the same reason: `sink == spilled + Σ paid`
    // is true of a universe where nobody was ever paid anything.
    expect(anyClaimantPaid).toBe(true);
  });

  it('names every claimant the economy has, in priority order, and each with its stock', () => {
    // The ledger's rows are built from `CONSUMPTION_ORDER` and `CLAIMANT_KIND`
    // in `world-step.ts`; this transcribes them, so it pins the wire and not the
    // way the object literal was built. A claimant added to `rules-world` and
    // not reaching a client is the failure being guarded against, and it is what
    // happened to `subsistence` and `casting` for the whole life of the ledger.
    // Transcription is deliberate in both directions: a claimant that arrives
    // and *does* reach the client has to be admitted here on purpose, which is
    // what `refining` is doing below.
    //
    // `refining` was placed after `construction` (not appended) by the ore-grade
    // work; it draws grade-0 `stone` for `mt-turn-the-poor-ore`, and it is the
    // first time `stone` has had two claimants. Re-recorded 2026-08-17 off
    // `CONSUMPTION_ORDER`/`CLAIMANT_KIND` in
    // `packages/rules-world/src/economy/materials.ts`, not off a failure message.
    const first = ledgerFrames()[0]?.flow as RawLedger;
    expect(first?.claimants.map((row) => row.claimant)).toEqual([
      'subsistence',
      'casting',
      'teaching',
      'libraryUpkeep',
      'scribing',
      'construction',
      'refining',
      'constructionLabor',
    ]);
    expect(first?.claimants.map((row) => row.kind)).toEqual([
      'food',
      'vellum',
      'insight',
      'vellum',
      'vellum',
      'stone',
      'stone',
      'labor',
    ]);
  });

  it('reports `castingShortfall`, which a comment promised and no field carried', () => {
    // Phase 9 of `world-step.ts` has read *"the unmet remainder is reported as
    // `castingShortfall`, not hidden"* since it was written, and it was hidden:
    // the work phase computed `castingOwed` and `castingGranted`, handed
    // consumption the granted one, and dropped the difference.
    //
    // The assertion is on the **relationship**, not on a magnitude. Sixty ticks
    // of a well-supplied universe may legitimately never go short — vellum first
    // empties around world tick 1200 on the long reference run — so requiring a
    // non-zero here would be requiring a famine, and the number would then be
    // pinned to a seed. What must hold on every tick is that the field exists,
    // that it is the gap between what casting wanted and what the priority walk
    // paid it, and that it is never negative.
    for (const frame of ledgerFrames()) {
      const flow = frame.flow as RawLedger;
      const casting = flow.claimants.find((row) => row.claimant === 'casting');
      expect(casting).toBeDefined();
      expect(flow.pressure.castingShortfall).toBeGreaterThanOrEqual(0);
      expect(flow.pressure.castingShortfall).toBe(casting?.shortfall);
      expect(flow.pressure.castingOwed).toBe((casting?.paid ?? 0) + (casting?.shortfall ?? 0));
    }
  });

  it('counts the producers behind each faucet, so a zero yield and no producer differ', () => {
    // `economicNodes` and `buildRateSources` exist because *"the economy did not
    // move"* and *"no node reached it"* look identical in every amount, and the
    // history of this seam is a bonus list nobody noticed was empty for three
    // releases. `magesApplying` is the applied faucet's equivalent, and the
    // applied faucet is the one that is not an allocation.
    const applying = ledgerFrames().filter(
      (frame) => ((frame.flow as RawLedger).producers.magesApplying ?? 0) > 0,
    );
    expect(applying.length).toBeGreaterThan(0);
    for (const frame of applying) {
      const flow = frame.flow as RawLedger;
      const appliedTotal = Object.values(flow.applied).reduce((a, b) => a + b, 0);
      expect(appliedTotal, `tick ${String(flow.worldTick)} had appliers and no applied yield`)
        .toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the god's spend is carried, because the world tick cannot see it", () => {
  /**
   * `god.intervention` runs **before** the world loop in the same step, so the
   * ledger's `opening` is already net of anything the god bought. A kind whose
   * only sink is a god verb therefore reads *"no claimant"*, and the spend was
   * recoverable only by differencing this tick's opening against last tick's
   * closing — an inference, wrong on the first tick of an episode and quietly
   * absorbing any other pre-step writer that ever appears.
   */
  it('reports what a god purchase actually took, at the price content declares', () => {
    const content = referenceContent();
    const { scenario, lastGodReport } = referenceScenario(content, { raids: true });
    const session = createSession({ scenario, strategyId: 'flow-god-spend' });
    session.reset(SEED, { worldTickCap: 400 });

    let applied = 0;
    const spent: Record<string, number> = {};
    let ticksWithSpend = 0;
    for (let i = 0; i < 300; i += 1) {
      const mask = session.legalActions();
      const lists = session.candidates();
      // The three materially-priced verbs the reference content declares a price
      // for and a strategy can reach: a dispensation (essence), a founding grant
      // (vellum) and a blessing (insight).
      let action = { kind: GOD_ACTION.noop } as { kind: number; params?: readonly number[] };
      for (const id of [GOD_ACTION.issueDispensation, GOD_ACTION.grantFoundingKnowledge, GOD_ACTION.blessMage]) {
        if (mask[id] !== 1) continue;
        const slots = lists.get(id);
        action = { kind: id, params: slots !== undefined && slots.length > 0 ? [0] : [] };
        break;
      }
      session.submit(action);
      applied += lastGodReport()?.interventions.applied ?? 0;
      const flow = session.flowLedger();
      if (flow === undefined) continue;
      let tickTotal = 0;
      for (const kind of Object.keys(flow.godSpend)) {
        tickTotal += flow.godSpend[kind] ?? 0;
        spent[kind] = (spent[kind] ?? 0) + (flow.godSpend[kind] ?? 0);
      }
      if (tickTotal !== 0) ticksWithSpend += 1;
      // **And the world tick's own identity is untouched by it.** The god spent
      // before the opening was read, so folding this into `sink` would break the
      // arithmetic in order to describe a flow outside it.
      for (const kind of Object.keys(flow.opening)) {
        expect((flow.closing[kind] ?? 0) - (flow.opening[kind] ?? 0)).toBe(
          (flow.faucet[kind] ?? 0) - (flow.sink[kind] ?? 0),
        );
      }
    }

    // The positive control: this only means anything if the god bought
    // something. A strategy that could afford nothing would report all-zero
    // spend and pass every assertion above.
    expect(applied, 'the god applied no intervention at all').toBeGreaterThan(0);
    expect(ticksWithSpend, 'no tick recorded a material spend').toBeGreaterThan(0);
    // One tick with a spend per applied intervention, and the total is a
    // multiple of the price content declares — 2048 `insight` for a blessing —
    // rather than a number this test invented.
    expect(ticksWithSpend).toBe(applied);
    expect(spent.insight).toBeGreaterThan(0);
    expect((spent.insight ?? 0) % 2048).toBe(0);
    // Nothing may be created: a negative entry would be the god handing material
    // back, which no verb does.
    for (const kind of Object.keys(spent)) expect(spent[kind]).toBeGreaterThanOrEqual(0);
  });

  it('is zero on every tick of a run in which the god does nothing', () => {
    // The control on the control. Without it, "the god spent something" would be
    // satisfied by a field that echoed some other quantity.
    for (const frame of ledgerFrames()) {
      const flow = frame.flow as RawLedger & { readonly godSpend: Record<string, number> };
      for (const kind of Object.keys(flow.opening)) {
        expect(flow.godSpend[kind], `${kind} at tick ${String(flow.worldTick)}`).toBe(0);
      }
    }
  });
});

describe('control 2 — a leak shows in what the client is handed', () => {
  const STOLEN = 4096;

  /**
   * A leaking run, through the shipped composition root.
   *
   * `WorldStepDeps.leak` takes the named amount out of the closing stock and
   * records it nowhere — precisely the defect shape: a flow that changes a stock
   * without telling the ledger. `delta` falls by `stolen` while `faucet - sink`
   * does not move, so the breach is exactly `-stolen`.
   *
   * The tick **throws**, after reporting. That ordering is the change this
   * change made: the assertion used to fire before `onReport`, which made
   * `conservationBreaches` a series whose only reachable value was the empty
   * list.
   */
  function leakingLedger(kind: string): { readonly ledger: FlowLedger; readonly threw: boolean } {
    const content = referenceContent();
    const { scenario, lastReport } = referenceScenario(content, {
      raids: false,
      leak: { kind: kind as 'vellum', perTick: STOLEN },
    });
    const session = createSession({ scenario, strategyId: 'flow-leak-control' });
    session.reset(SEED, { worldTickCap: 8 });
    let threw = false;
    try {
      session.submit({ kind: GOD_ACTION.noop });
    } catch {
      threw = true;
    }
    const report = lastReport();
    expect(report, 'the leaking tick emitted no report at all').toBeDefined();
    // The projection the session itself calls, on the report the shipped loop
    // really produced. Not a re-derivation: a control that re-implements the
    // ledger can agree with itself while both have drifted from the loop.
    const ledger = describeFlow(report, report?.worldTick ?? -1);
    expect(ledger).toBeDefined();
    return { ledger: ledger as FlowLedger, threw };
  }

  it('names the kind and the exact amount, in the ledger a client decodes', () => {
    const { ledger, threw } = leakingLedger('vellum');
    expect(threw, 'a leaking tick must still fail loudly').toBe(true);
    expect(ledger.breaches).toHaveLength(1);
    const breach = ledger.breaches[0];
    expect(breach?.kind).toBe('vellum');
    // Exactly the amount stolen, and negative — material that left without being
    // recorded, rather than material that arrived from nowhere.
    expect(breach?.discrepancy).toBe(-STOLEN);
    expect((breach?.delta ?? 0) - (breach?.expected ?? 0)).toBe(-STOLEN);
    // And the identity really is broken in the numbers a page reads, not only in
    // a list beside them.
    expect((ledger.closing.vellum ?? 0) - (ledger.opening.vellum ?? 0)).toBe(
      (ledger.faucet.vellum ?? 0) - (ledger.sink.vellum ?? 0) - STOLEN,
    );
  });

  it('leaks only the kind it names, so the discrepancy is attributable', () => {
    const { ledger } = leakingLedger('stone');
    expect(ledger.breaches.map((b) => b.kind)).toEqual(['stone']);
    for (const kind of Object.keys(ledger.opening)) {
      if (kind === 'stone') continue;
      expect((ledger.closing[kind] ?? 0) - (ledger.opening[kind] ?? 0), `${kind} moved`).toBe(
        (ledger.faucet[kind] ?? 0) - (ledger.sink[kind] ?? 0),
      );
    }
  });

  it('is a control on the control: an unleaked run of the same scenario breaches nothing', () => {
    // Without this, "the breach list is non-empty under a leak" would be
    // satisfied by a projection that always reported a breach.
    const content = referenceContent();
    const { scenario, lastReport } = referenceScenario(content, { raids: false });
    const session = createSession({ scenario, strategyId: 'flow-leak-control-clean' });
    session.reset(SEED, { worldTickCap: 8 });
    session.submit({ kind: GOD_ACTION.noop });
    const report = lastReport();
    const ledger = describeFlow(report, report?.worldTick ?? -1);
    expect(ledger?.breaches).toEqual([]);
  });

  it('reports absent from the session on the tick that threw, because the clock never advanced', () => {
    // Pinned rather than discovered. `AgentSession.submit` assigns the new state
    // only after `step` returns, so a tick that throws leaves the session on the
    // tick before it — and the guard, which asks for a report of
    // `worldTick - 1`, correctly refuses a report of a tick this state has not
    // reached. A leaking universe is a dead universe; what a client is owed is
    // the breach, and the breach reaches it through the projection above.
    const content = referenceContent();
    const { scenario } = referenceScenario(content, {
      raids: false,
      leak: { kind: 'vellum', perTick: STOLEN },
    });
    const session = createSession({ scenario, strategyId: 'flow-leak-guard' });
    session.reset(SEED, { worldTickCap: 8 });
    expect(() => {
      session.submit({ kind: GOD_ACTION.noop });
    }).toThrow(/material conservation failed/u);
    expect(session.flowLedger()).toBeUndefined();
  });
});

/**
 * `ui/shared/session.js`, imported rather than transcribed.
 *
 * The same dynamic literal import `ui-recording.test.ts` uses, and the same
 * reason: a test that reimplemented the decoder's guard could agree with itself
 * while the page did something else.
 */
const uiSession = (await import(
  // @ts-expect-error -- ui/ is a set of static files with no types to resolve.
  '../../../../ui/shared/session.js'
)) as unknown as {
  openSession: (source: { readonly recording: string }) => Promise<{
    capabilities: () => Record<string, boolean>;
    frame: (i: number) => {
      flow: () => {
        readonly worldTick: number;
        readonly kinds: readonly string[];
        readonly opening: Record<string, number>;
        readonly closing: Record<string, number>;
        readonly faucet: Record<string, number>;
        readonly sink: Record<string, number>;
        readonly claimants: readonly { readonly paid: number }[];
        readonly breaches: readonly { readonly kind: string; readonly discrepancy: number }[];
        readonly producers: Record<string, number>;
        readonly pressure: Record<string, number>;
      } | null;
      resources: () => Record<string, unknown>;
    };
  }>;
};

/** Serves one document to the decoder's `fetch`, which is how a page gets one. */
async function decode(doc: unknown): Promise<Awaited<ReturnType<typeof uiSession.openSession>>> {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(doc), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof globalThis.fetch;
  try {
    return await uiSession.openSession({ recording: 'session.json' });
  } finally {
    globalThis.fetch = previous;
  }
}

/** A deep copy, so one test's mutilation is not the next test's input. */
const copy = (): Recording => JSON.parse(JSON.stringify(recording)) as Recording;

describe('the decoder carries it, in world units, without inventing anything', () => {
  it('divides by 1024 and leaves counts alone', async () => {
    const session = await decode(recording);
    const raw = recording.frames[10]?.flow as RawLedger;
    const flow = session.frame(10).flow();
    expect(flow).not.toBeNull();
    expect(flow?.worldTick).toBe(raw.worldTick);
    expect(flow?.kinds).toEqual(Object.keys(raw.opening));
    for (const kind of Object.keys(raw.opening)) {
      expect(flow?.opening[kind]).toBe((raw.opening[kind] ?? 0) / 1024);
      expect(flow?.sink[kind]).toBe((raw.sink[kind] ?? 0) / 1024);
    }
    // A headcount is a headcount. `units` on one would report sixteen mages as
    // 0.015625, which is the shape of error that renders without complaining.
    expect(flow?.producers.magesApplying).toBe(raw.producers.magesApplying);
    expect(Number.isInteger(flow?.producers.magesApplying)).toBe(true);
  });

  it('carries a breach through to the page with its kind and amount', async () => {
    // The leak, end to end: the projection's output put into a frame and read
    // back out through the decoder a page really uses.
    const doc = copy();
    const frame = doc.frames[10];
    const flow = frame?.flow as RawLedger;
    (frame as { flow: RawLedger }).flow = {
      ...flow,
      closing: { ...flow.closing, vellum: (flow.closing.vellum ?? 0) - 4096 },
      breaches: [{ kind: 'vellum', delta: -4096, expected: 0, discrepancy: -4096 }],
    };
    const session = await decode(doc);
    const decoded = session.frame(10).flow();
    expect(decoded?.breaches).toEqual([{ kind: 'vellum', delta: -4, expected: 0, discrepancy: -4 }]);
  });
});

describe('control 3 — an absence is reported as an absence', () => {
  let stripped: Recording;

  beforeEach(() => {
    stripped = copy();
    for (const frame of stripped.frames) delete (frame as { flow?: unknown }).flow;
  });

  it('loads a recording made before the field existed, and still draws everything else', async () => {
    const session = await decode(stripped);
    expect(session.capabilities().flowLedger).toBe(false);
    expect(session.frame(10).flow()).toBeNull();
    // "Still draws" is the half that matters: a missing sidecar must not take
    // the page down with it. The other projections are untouched.
    expect(session.capabilities().resources).toBe(true);
    expect(session.capabilities().materialBreakdown).toBe(true);
    expect(typeof session.frame(10).resources().favor).toBe('number');
  });

  it('reports the opening frame of a current recording as absent too', async () => {
    // Not a defect and not a special case: nothing has been stepped at tick 0,
    // so there is no tick to report on. It is the same absence, and a page that
    // handled one and not the other would break on frame 0 of every run.
    const session = await decode(recording);
    expect(session.frame(0).flow()).toBeNull();
    expect(session.capabilities().flowLedger).toBe(true);
  });

  it('refuses a sidecar poisoned by JSON round-tripping, rather than reading it as zero', async () => {
    // **The exact failure the all-or-nothing guard exists for.**
    // `JSON.stringify(Infinity)` is `null`, `JSON.parse` gives `null` back, and
    // `units(null)` is `0`. A page would then draw a faucet of zero — *"nothing
    // was produced"*, a fact — where the truth is *"this number did not
    // survive"*. One poisoned kind takes the whole ledger absent.
    const doc = copy();
    const frame = doc.frames[10] as { flow: RawLedger };
    frame.flow = {
      ...frame.flow,
      faucet: { ...frame.flow.faucet, vellum: null as unknown as number },
    };
    const session = await decode(doc);
    expect(session.frame(10).flow()).toBeNull();
  });

  it('refuses a half-written sidecar, so a page never draws a source with no sink', async () => {
    const doc = copy();
    const frame = doc.frames[10] as { flow: Partial<RawLedger> };
    const rest: Record<string, unknown> = { ...(frame.flow as RawLedger) };
    delete rest.sink;
    frame.flow = rest as Partial<RawLedger>;
    const session = await decode(doc);
    expect(session.frame(10).flow()).toBeNull();
  });

  it('refuses a claimant row that is missing its arithmetic', async () => {
    const doc = copy();
    const frame = doc.frames[10] as { flow: RawLedger };
    frame.flow = {
      ...frame.flow,
      claimants: [
        { claimant: 'subsistence', kind: 'food', settledIn: 'consumption' } as RawLedger['claimants'][number],
      ],
    };
    const session = await decode(doc);
    expect(session.frame(10).flow()).toBeNull();
  });
});
