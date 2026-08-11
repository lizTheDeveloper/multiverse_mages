/*
 * Multiverse Mages — the worker side of the Monte Carlo run protocol.
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
 * Task 3.2, worker half. A worker entry module is expected to be four lines:
 *
 * ```js
 * import { serveRuns } from '@mm/mc-harness';
 * import { executor } from './my-scenario.js';
 * serveRuns(executor);
 * ```
 *
 * ## Two invariants this file holds, both easy to break by accident
 *
 * **It has no runtime imports beyond `node:worker_threads`.** The type imports
 * below are erased, deliberately. A worker entry point is loaded by a bare Node
 * process, so when the harness is exercised against *source* — which its own
 * test suite does, since a test must not depend on a prior build — Node's type
 * stripping loads this file directly, and a relative `./x.js` specifier would
 * resolve to a file that does not exist until `tsc` has run. Adding one runtime
 * relative import here breaks the pool's tests in a way whose error message
 * ("Cannot find module … /protocol.js") points at the wrong file entirely.
 * `packages/mc-harness/test/unit/worker-main-self-contained.test.ts` pins this.
 *
 * **One task at a time.** The worker takes the next task only after it has
 * answered the last, so the pool's outstanding-task bookkeeping is exact and a
 * timeout has one run to attribute itself to. A worker that pipelined would be
 * faster and would make "which run was this worker executing when it died"
 * unanswerable.
 *
 * ## Failure is reported, not thrown
 *
 * An executor that throws is answered with a `threw` message carrying the error
 * text, and the worker stays alive for the next task. The pool classifies it and
 * records the run as `failed`. A worker that died on every bad run would turn one
 * unlucky parameter cell into a sweep-long thrash of process creation, and the
 * spec is explicit that one crash must not abort a sweep.
 */

import { parentPort } from 'node:worker_threads';

import type { RunExecutor, WorkerRequest, WorkerResponse } from './protocol.js';

/** Whatever a thrown value was, as a string a record can carry. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack !== undefined && error.stack.length > 0 ? error.stack : error.message;
  }
  return String(error);
}

/**
 * Serves run tasks on this worker's port until the pool says to stop.
 *
 * @param execute - The caller's run executor. It is the only code in the worker
 * that touches the simulation.
 * @throws Error when called outside a worker thread, which is a wiring mistake
 * worth failing loudly rather than a no-op that looks like a hung pool.
 */
export function serveRuns(execute: RunExecutor): void {
  const port = parentPort;
  if (port === null) {
    throw new Error(
      'serveRuns() was called on the main thread. It binds the worker side of the run protocol ' +
        'and only makes sense inside a worker_threads Worker.',
    );
  }

  port.on('message', (message: WorkerRequest) => {
    if (message.kind === 'shutdown') {
      port.close();
      return;
    }
    if (message.kind !== 'run') return;

    const { taskId, task } = message;
    void (async (): Promise<void> => {
      let response: WorkerResponse;
      try {
        const outcome = await execute(task);
        response = { kind: 'result', taskId, outcome };
      } catch (error: unknown) {
        response = { kind: 'threw', taskId, message: describe(error) };
      }
      port.postMessage(response);
    })();
  });

  const ready: WorkerResponse = { kind: 'ready' };
  port.postMessage(ready);
}
