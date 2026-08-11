/*
 * Multiverse Mages — the env vector, and what a vector must not change.
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
 * `specs/rl-bridge/spec.md`, *"Vectorized episodes addressed by env index"* and
 * *"Observation, mask and candidate lists cross the boundary unmodified"*.
 *
 * The load-bearing property is the second scenario below: **vector width does
 * not change an episode**. A vectorized environment whose results depended on
 * how many envs shared the process would be an environment where a throughput
 * decision moved a balance number, and the drift would be invisible because
 * every value would still be a plausible one.
 */

import { ACTION_SPACE_SIZE, GOD_ACTION, OBSERVATION_SIZE } from '@mm/agent-api';
import { createBridge, decodeFrame, encodeFrame } from '@mm/gym-bridge';
import { describe, expect, it } from 'vitest';

import { FIXTURE_BUILD_VERSION, probeScenario } from './fixtures.js';

function opened(envCount: number) {
  const subject = createBridge({
    scenario: probeScenario(),
    envCount,
    buildVersion: FIXTURE_BUILD_VERSION,
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

function envsOf(frame: Record<string, unknown>): Record<string, unknown>[] {
  return frame['envs'] as Record<string, unknown>[];
}

/** Drives one env through `ticks` no-ops and returns its final view. */
function driveOne(subject: ReturnType<typeof opened>, env: number, runSeed: number, ticks: number) {
  send(subject, { type: 'reset', envs: [{ env, runSeed, worldTickCap: ticks + 4 }] });
  let last: Record<string, unknown> = {};
  const observations: number[][] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const reply = send(subject, { type: 'step', envs: [{ env, action: GOD_ACTION.noop }] });
    last = envsOf(reply.frames[0] as Record<string, unknown>)[0] as Record<string, unknown>;
    observations.push(last['observation'] as number[]);
  }
  return { last, observations };
}

describe('vector width does not change an episode', () => {
  it('env 3 of an eight-wide bridge equals a one-wide bridge, tick for tick and hash for hash', () => {
    const narrow = driveOne(opened(1), 0, 0x51_51_51_51, 6);
    const wide = driveOne(opened(8), 3, 0x51_51_51_51, 6);
    expect(wide.observations).toEqual(narrow.observations);
    expect(wide.last['snapshotHash']).toBe(narrow.last['snapshotHash']);
  });

  it('leaves the other envs untouched while one is driven', () => {
    const subject = opened(4);
    send(subject, {
      type: 'reset',
      envs: [
        { env: 0, runSeed: 11, worldTickCap: 10 },
        { env: 1, runSeed: 11, worldTickCap: 10 },
      ],
    });
    const before = envsOf(
      send(subject, { type: 'step', envs: [{ env: 1, action: GOD_ACTION.noop }] })
        .frames[0] as Record<string, unknown>,
    )[0] as Record<string, unknown>;
    // Drive env 0 four times; env 1 must not move.
    for (let tick = 0; tick < 4; tick += 1) {
      send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] });
    }
    const after = envsOf(
      send(subject, { type: 'step', envs: [{ env: 1, action: GOD_ACTION.noop }] })
        .frames[0] as Record<string, unknown>,
    )[0] as Record<string, unknown>;
    expect(after['worldTick']).toBe((before['worldTick'] as number) + 1);
  });
});

describe('envs at different seeds diverge and neither perturbs the other', () => {
  it('produces different snapshot hashes from different seeds', () => {
    const a = driveOne(opened(2), 0, 0x11_11_11_11, 4);
    const b = driveOne(opened(2), 0, 0x22_22_22_22, 4);
    expect(a.last['snapshotHash']).not.toBe(b.last['snapshotHash']);
  });

  it('steps two envs in one frame and returns them in request order', () => {
    const subject = opened(3);
    send(subject, {
      type: 'reset',
      envs: [
        { env: 2, runSeed: 7, worldTickCap: 8 },
        { env: 0, runSeed: 7, worldTickCap: 8 },
      ],
    });
    const reply = send(subject, {
      type: 'step',
      envs: [
        { env: 2, action: GOD_ACTION.noop },
        { env: 0, action: GOD_ACTION.noop },
      ],
    });
    expect(envsOf(reply.frames[0] as Record<string, unknown>).map((one) => one['env'])).toEqual([
      2, 0,
    ]);
  });
});

describe('a bad env index changes nothing', () => {
  it('refuses an out-of-range index without advancing any clock', () => {
    const subject = opened(4);
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 3, worldTickCap: 8 }] });
    send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] });
    const bad = send(subject, {
      type: 'step',
      envs: [
        { env: 0, action: GOD_ACTION.noop },
        { env: 9, action: GOD_ACTION.noop },
      ],
    });
    expect(bad.frames[0]?.['code']).toBe('unknown-env');
    // Env 0 is named *first* in the frame above, so a bridge that validated
    // lazily would already have stepped it. It has not.
    const after = envsOf(
      send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] })
        .frames[0] as Record<string, unknown>,
    )[0] as Record<string, unknown>;
    expect(after['worldTick']).toBe(2);
  });

  it('refuses a reset naming an unknown env without resetting the known ones', () => {
    const subject = opened(2);
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 3, worldTickCap: 8 }] });
    send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] });
    const bad = send(subject, {
      type: 'reset',
      envs: [
        { env: 0, runSeed: 4, worldTickCap: 8 },
        { env: 5, runSeed: 4, worldTickCap: 8 },
      ],
    });
    expect(bad.frames[0]?.['code']).toBe('unknown-env');
    const after = envsOf(
      send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] })
        .frames[0] as Record<string, unknown>,
    )[0] as Record<string, unknown>;
    expect(after['worldTick']).toBe(2);
  });

  it('refuses a step against an env that was never reset', () => {
    const subject = opened(2);
    expect(send(subject, { type: 'step', envs: [{ env: 1, action: 0 }] }).frames[0]?.['code']).toBe(
      'no-episode',
    );
  });
});

describe('what crosses the boundary is what agent-api exported', () => {
  it('carries the observation at the pinned width, every element in range', () => {
    const { last } = driveOne(opened(1), 0, 0x33_33_33_33, 2);
    const observation = last['observation'] as number[];
    expect(observation).toHaveLength(OBSERVATION_SIZE);
    for (const value of observation) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('carries the exported vector element-wise, with no tolerance', () => {
    // The comparison is against the session's own `observe()`, taken from the
    // bridge's vector rather than recomputed — so this is "what left equals
    // what arrived" and not "two encoders agree".
    const subject = opened(1);
    send(subject, { type: 'reset', envs: [{ env: 0, runSeed: 0x44_44_44_44, worldTickCap: 8 }] });
    const reply = send(subject, { type: 'step', envs: [{ env: 0, action: GOD_ACTION.noop }] });
    const transported = (envsOf(reply.frames[0] as Record<string, unknown>)[0] as Record<
      string,
      unknown
    >)['observation'] as number[];
    const exported = [...subject.vector.sessionAt(0).observe()];
    expect(transported).toEqual(exported);
  });

  it('carries a mask the full width of the action space', () => {
    const { last } = driveOne(opened(1), 0, 0x55_55_55_55, 1);
    const mask = last['mask'] as number[];
    expect(mask).toHaveLength(ACTION_SPACE_SIZE);
    for (const entry of mask) expect([0, 1]).toContain(entry);
    expect(mask[GOD_ACTION.noop]).toBe(1);
  });

  it('carries every parameterized action’s slot count, even when it has no candidates', () => {
    // §4.4's `k` is a structural constant, so a policy's output head is that
    // wide whether or not the list is occupied. A frame that omitted an empty
    // action would make the head's width a function of the world.
    const { last } = driveOne(opened(1), 0, 0x66_66_66_66, 1);
    const candidates = last['candidates'] as { action: number; slots: number }[];
    expect(candidates.map((one) => one.action)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    for (const one of candidates) expect(one.slots).toBeGreaterThan(0);
  });

  it('carries the snapshot hash and the core’s illegal-action count', () => {
    const { last } = driveOne(opened(1), 0, 0x77_77_77_77, 1);
    expect(String(last['snapshotHash'])).toMatch(/^[0-9a-f]+$/);
    expect(last['illegalActionCount']).toBe(0);
  });
});

describe('the vector refuses a width it cannot serve', () => {
  it('refuses zero envs at construction rather than at the first step', () => {
    expect(() =>
      createBridge({
        scenario: probeScenario(),
        envCount: 0,
        buildVersion: FIXTURE_BUILD_VERSION,
      }),
    ).toThrow(/positive integer/);
  });
});
