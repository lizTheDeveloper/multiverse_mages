/*
 * Multiverse Mages — draining a long run, with or without handing the event
 * loop back between rounds.
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
 * # Why a long run is written as a generator here
 *
 * `packages/scenario/src/long-run.ts` names this repository's convention:
 * *"every long arm hands the event loop back once a world year"*, because a
 * vitest worker running an unbroken synchronous tick loop cannot answer the
 * runner's RPC, and birpc's 60 s timeout is **hardcoded**. A worker that has not
 * answered inside it fails the whole run with
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` — zero test failures, exit
 * code 1.
 *
 * That convention was reachable from a test that owns its own `for` loop and
 * unreachable from one that calls a shipped entry point, because the entry
 * points are synchronous and their callers — `RunExecutor`, the sweep worker —
 * must stay synchronous. `raid-engagement.test.ts` said so in a comment:
 * *"the fix for that would be a yield inside `executeReferenceRun`, which is
 * src"*.
 *
 * So the loop body is written **once**, as a generator that yields between
 * rounds, and drained two ways:
 *
 * - {@link drainSteps} runs it to completion without pausing. This is what the
 *   synchronous entry points do, and it is what every sweep worker does.
 * - {@link drainStepsYielding} runs it pausing every {@link YIELD_EVERY_ROUNDS}
 *   rounds. This is what a test arm does.
 *
 * **Neither changes a number.** There is one copy of the arithmetic, the pause
 * is `setImmediate` and not a clock read, and the simulation between two pauses
 * is unchanged and entirely synchronous. The equivalence is asserted rather than
 * asserted-about: see `episode.test.ts` and `reference-universe.test.ts`, which
 * run the same task both ways and compare the whole result.
 */

/**
 * Rounds between pauses.
 *
 * Twelve, which is one world year — the same period `long-run.ts` yields on, and
 * the number that makes a pause cost nothing measurable: a round is a world tick
 * and the most expensive tick measured in this repository is under three
 * seconds, so the gap between two pauses stays far inside birpc's window even on
 * a runner three and a half times slower than a developer box.
 */
export const YIELD_EVERY_ROUNDS = 12;

/** Hands the event loop back once, so a vitest worker can answer its runner. */
export async function yieldToRunner(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Runs `steps` to completion in one synchronous stretch.
 *
 * The default for anything that is not a test: a sweep worker has no runner to
 * answer, and pausing there would only add scheduler round trips to a job whose
 * whole cost is arithmetic.
 */
export function drainSteps<T>(steps: Generator<void, T, void>): T {
  let step = steps.next();
  while (step.done !== true) step = steps.next();
  return step.value;
}

/**
 * Runs `steps` to completion, handing the event loop back every `everyRounds`.
 *
 * @param everyRounds how many rounds to run between pauses. Must be at least 1;
 * a zero or negative period would either divide by zero or never pause, and both
 * would be a silently disabled yield rather than a loud one.
 */
export async function drainStepsYielding<T>(
  steps: Generator<void, T, void>,
  everyRounds: number = YIELD_EVERY_ROUNDS,
): Promise<T> {
  if (!Number.isInteger(everyRounds) || everyRounds < 1) {
    throw new Error(
      `A yield period of ${String(everyRounds)} is not a positive integer. A run that never ` +
        'hands the event loop back is the failure this function exists to prevent, so it is ' +
        'refused rather than silently accepted.',
    );
  }
  let completed = 0;
  let step = steps.next();
  while (step.done !== true) {
    completed += 1;
    if (completed % everyRounds === 0) await yieldToRunner();
    step = steps.next();
  }
  return step.value;
}
