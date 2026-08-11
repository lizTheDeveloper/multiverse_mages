/*
 * Multiverse Mages — illegal actions are data, and terminal is not truncated.
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
 * `specs/rl-bridge/spec.md`, *"An illegal action is a datum, never an error
 * frame"* and *"Terminal and truncated are transported as separate flags"*.
 *
 * Two failures this file exists to prevent, and they pull in opposite
 * directions:
 *
 * - A bridge that reported an illegal action as an error frame would be
 *   unusable. §4.2: *"RL agents will submit illegal actions constantly; that
 *   must be cheap and observable."* A uniform-random policy would spend its
 *   whole life in the error path.
 * - A bridge that reported a protocol fault as a rejection would hide a client
 *   bug inside `illegalActionRate`, which §7 already warns is *"a spec-clarity
 *   smell rather than an agent-competence measure"*. Poisoning it with client
 *   bugs would take the last meaning out of it.
 */

import { GOD_ACTION } from '@mm/agent-api';
import { createBridge, decodeFrame, encodeFrame } from '@mm/gym-bridge';
import { TERMINAL_REASON } from '@mm/state';
import { describe, expect, it } from 'vitest';

import { FIXTURE_BUILD_VERSION, fixedSessionFactory, probeScenario } from './fixtures.js';

function opened(options: { envCount?: number; sessions?: ReturnType<typeof fixedSessionFactory> } = {}) {
  const subject = createBridge({
    scenario: probeScenario(),
    envCount: options.envCount ?? 1,
    buildVersion: FIXTURE_BUILD_VERSION,
    ...(options.sessions === undefined ? {} : { createSession: options.sessions }),
  });
  subject.handleLine(encodeFrame({ type: 'hello' }).trimEnd());
  return subject;
}

function send(subject: ReturnType<typeof opened>, frame: unknown) {
  const reply = subject.handleLine(encodeFrame(frame).trimEnd());
  return {
    ...reply,
    frames: reply.lines.map((line) => decodeFrame(line.trimEnd())),
  };
}

function firstEnv(frame: Record<string, unknown>): Record<string, unknown> {
  return (frame['envs'] as Record<string, unknown>[])[0] as Record<string, unknown>;
}

function step(subject: ReturnType<typeof opened>, action: number, slot?: number) {
  const reply = send(subject, {
    type: 'step',
    envs: [{ env: 0, action, ...(slot === undefined ? {} : { slot }) }],
  });
  return { reply, view: firstEnv(reply.frames[0] as Record<string, unknown>) };
}

describe('an illegal action is a no-op, a tick, and a count', () => {
  it('reports admitted: false with a reason, and never an error frame', () => {
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 0x0a_0b_0c_0d, worldTickCap: 20 }] });
    // The probe universe forbids every technique, so there is no bit left to
    // clear and `forbidTechnique` is structurally illegal.
    const { reply, view } = step(subject, GOD_ACTION.forbidTechnique, 0);
    expect(reply.frames[0]?.['type']).toBe('step');
    expect(view['admitted']).toBe(false);
    expect(typeof view['rejection']).toBe('string');
    expect(view['worldTick']).toBe(1);
    expect(view['illegalActionCount']).toBe(1);
  });

  it('is not reported as an error even when the action id is nonsense', () => {
    // An id outside §4.2's table is `unknown-action` to the gate — an ordinary
    // illegal action. An id that is not a *number* is a client bug and is an
    // error frame; the pair below is what keeps the two apart.
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 3, worldTickCap: 20 }] });
    const nonsense = step(subject, 4_242);
    expect(nonsense.reply.frames[0]?.['type']).toBe('step');
    expect(nonsense.view['admitted']).toBe(false);

    const notANumber = send(subject, { type: 'step', envs: [{ env: 0, action: 'bless' }] });
    expect(notANumber.frames[0]?.['type']).toBe('error');
    expect(notANumber.frames[0]?.['code']).toBe('bad-request');
  });

  it('reports empty-slot for a candidate slot that names nothing', () => {
    // §4.4: *"A slot referring to an entity that died between observation and
    // action is an ordinary illegal action."* The probe universe has no mages
    // at all, so every `blessMage` slot names nothing, which is the same
    // condition reached by a mage dying and is reachable without one.
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 4, worldTickCap: 20 }] });
    const { reply, view } = step(subject, GOD_ACTION.blessMage, 7);
    expect(reply.frames[0]?.['type']).toBe('step');
    expect(view['admitted']).toBe(false);
    // `masked` or `empty-slot` depending on whether the mask already refused the
    // action outright; both are ordinary rejections and neither is an error.
    expect(['masked', 'empty-slot']).toContain(view['rejection']);
  });

  it('leaves the observation identical to the path that reached the same state legally', () => {
    // The rejection reason is diagnostics and must not be a channel.
    // `gate.ts`: *"never fed back to the agent: it is not in the observation,
    // and making it one would be a channel the mask does not have."*
    const rejecting = opened();
    send(rejecting, { type: 'reset', envs: [{ env: 0, runSeed: 0x1234_5678, worldTickCap: 20 }] });
    const rejected = step(rejecting, GOD_ACTION.forbidTechnique, 0).view;

    const clean = opened();
    send(clean, { type: 'reset', envs: [{ env: 0, runSeed: 0x1234_5678, worldTickCap: 20 }] });
    const legal = step(clean, GOD_ACTION.noop).view;

    expect(rejected['observation']).toEqual(legal['observation']);
    expect(rejected['mask']).toEqual(legal['mask']);
    // The counter is the one thing that differs, which is exactly §4.2's
    // "a no-op and a counter increment".
    expect(rejected['illegalActionCount']).toBe(1);
    expect(legal['illegalActionCount']).toBe(0);
  });

  it('makes the count readable without reading simulation state', () => {
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 9, worldTickCap: 20 }] });
    for (let n = 0; n < 3; n += 1) step(subject, GOD_ACTION.forbidTechnique, 0);
    expect(step(subject, GOD_ACTION.noop).view['illegalActionCount']).toBe(3);
  });
});

describe('terminal and truncated are two booleans', () => {
  it('reports truncated without terminal when a run reaches its cap', () => {
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 0x2222_1111, worldTickCap: 3 }] });
    let view: Record<string, unknown> = {};
    for (let tick = 0; tick < 3; tick += 1) view = step(subject, GOD_ACTION.noop).view;
    const outcome = view['outcome'] as Record<string, unknown>;
    expect(view['status']).toBe('truncated');
    expect(outcome['truncated']).toBe(true);
    expect(outcome['terminal']).toBe(false);
  });

  it('reports terminal without truncated when a run ascends', () => {
    // Through a fixed session: whether the simulation *reaches* an ascension is
    // `god-agency`'s claim and `agent-api`'s to report. What this package must
    // show is that two independent booleans stay independent on the wire.
    const subject = opened({
      sessions: fixedSessionFactory({
        status: 'ascended',
        terminal: true,
        truncated: false,
        terminalReason: TERMINAL_REASON.ascensionApotheosis,
      }),
    });
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 1, worldTickCap: 50 }] });
    const view = step(subject, GOD_ACTION.noop).view;
    const outcome = view['outcome'] as Record<string, unknown>;
    expect(view['status']).toBe('ascended');
    expect(outcome['terminal']).toBe(true);
    expect(outcome['truncated']).toBe(false);
    expect(outcome['terminalReason']).toBe(TERMINAL_REASON.ascensionApotheosis);
  });

  it('reports both when a run ascends on the tick it hits its cap', () => {
    // §4.3's two flags are independent, and `session.ts` says a run that
    // ascended on the tick it hit the cap is `ascended` for status purposes and
    // truncated as well. Conflating them is the silent training bug the
    // separation exists to prevent, and this is the case that would conflate.
    const subject = opened({
      sessions: fixedSessionFactory({
        status: 'ascended',
        terminal: true,
        truncated: true,
        terminalReason: TERMINAL_REASON.ascensionCanon,
      }),
    });
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 1, worldTickCap: 1 }] });
    const outcome = step(subject, GOD_ACTION.noop).view['outcome'] as Record<string, unknown>;
    expect(outcome['terminal']).toBe(true);
    expect(outcome['truncated']).toBe(true);
  });

  it('refuses to advance a finished episode rather than continuing it', () => {
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 0x3333_4444, worldTickCap: 2 }] });
    step(subject, GOD_ACTION.noop);
    step(subject, GOD_ACTION.noop);
    const refused = send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] });
    expect(refused.frames[0]?.['code']).toBe('episode-over');
    expect(refused.fatal).toBe(false);
    // And it really did not advance: a reset restarts, and the tick count is
    // back to where a fresh episode starts.
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 0x3333_4444, worldTickCap: 2 }] });
    expect(step(subject, GOD_ACTION.noop).view['worldTick']).toBe(1);
  });
});

describe('no frame carries a reward, under any name', () => {
  it('omits every scoring field from a step result', () => {
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 5, worldTickCap: 8 }] });
    const view = step(subject, GOD_ACTION.noop).view;
    for (const forbidden of ['reward', 'return', 'score', 'fitness', 'value', 'advantage']) {
      expect(Object.keys(view), forbidden).not.toContain(forbidden);
    }
    const outcome = view['outcome'] as Record<string, unknown>;
    for (const forbidden of ['reward', 'return', 'score', 'fitness']) {
      expect(Object.keys(outcome), forbidden).not.toContain(forbidden);
    }
  });

  it('carries the outcome record’s five fields and nothing else', () => {
    // Field by field rather than a spread in `vector.ts`, so that a field added
    // to `OutcomeRecord` has to be transported deliberately. This is what makes
    // that decision checkable: a reward arriving by spread would fail here.
    const subject = opened();
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 6, worldTickCap: 8 }] });
    const outcome = step(subject, GOD_ACTION.noop).view['outcome'] as Record<string, unknown>;
    expect(new Set(Object.keys(outcome))).toEqual(
      new Set(['terminal', 'truncated', 'terminalReason', 'era', 'metricDeltas']),
    );
  });
});
