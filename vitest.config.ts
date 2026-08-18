/*
 * Multiverse Mages — Vitest configuration.
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

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const packageSrc = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests import workspace packages by name but run against source, so a test
    // run never depends on a prior build.
    alias: {
      '@mm/sim-core': packageSrc('sim-core'),
      // Without the alias the workspace symlink resolves @mm/content to dist/,
      // so a test could quietly pass against a stale build.
      '@mm/content': packageSrc('content'),
      '@mm/primitives': packageSrc('primitives'),
      '@mm/state': packageSrc('state'),
      '@mm/rules-magic': packageSrc('rules-magic'),
      '@mm/rules-world': packageSrc('rules-world'),
      // `rules-raid` was the one workspace package missing from this table, and
      // the omission is the shape `CLAUDE.md` calls "a checker that answers
      // about the wrong input". Without the alias the symlink resolves it to
      // `dist/`, so a before/after control run over `src/` compares the built
      // tree against itself: W200's detachment fix passed its own *negative*
      // control — the pre-fix source, restored from `origin/main`, still ran the
      // post-fix build — and the run reported seven green tests about code that
      // was not on disk. Every other package was already aliased for exactly
      // this reason.
      '@mm/rules-raid': packageSrc('rules-raid'),
      // The reference scenario needs both halves of contracts.md §5's boundary:
      // `coordination` for the world loop and `agent-api` for the session it is
      // observed through. `coordination` gets an alias for the first time here —
      // its own tests reach into `../../src/`, which a cross-package importer
      // may not do without escaping its rootDir.
      '@mm/coordination': packageSrc('coordination'),
      '@mm/agent-api': packageSrc('agent-api'),
      // The harness's own tests import it by name. Its worker fixture cannot —
      // a bare Node worker knows nothing of this alias — so that one file
      // reaches into src/ with explicit .ts extensions and says why.
      '@mm/mc-harness': packageSrc('mc-harness'),
      // Same shape, same exception: the scenario's own worker fixture resolves
      // `@mm/*` for itself, because a bare Node worker knows nothing of this
      // table. See `packages/scenario/test/fixtures/source-resolution.mjs`.
      '@mm/scenario': packageSrc('scenario'),
      // The RL bridge's own tests import it by name. Its Python client does not
      // go through this table at all — it speaks the wire to a spawned process,
      // which is the boundary the package exists to be.
      '@mm/gym-bridge': packageSrc('gym-bridge'),
      // The authoritative server. Its own tests import it by name; the agent
      // processes its end-to-end test spawns do not go through this table at
      // all — they speak the wire to a socket, which is the boundary the
      // package exists to be.
      '@mm/server': packageSrc('server'),
    },
  },
  test: {
    // `npm test` runs the unit tests, the golden replay suite, and the
    // adversarial suite together, in one command, so a determinism regression
    // cannot pass by running only the fast half.
    //
    // `test/adversarial` holds tests written by agents whose brief was to break
    // this package rather than to demonstrate it. They are listed explicitly
    // because a directory that is not in this glob is a directory whose tests
    // silently never run — which is how a suite grows tests nobody has executed
    // in months.
    include: [
      'packages/*/test/unit/**/*.test.ts',
      'packages/*/test/golden/**/*.test.ts',
      'packages/*/test/adversarial/**/*.test.ts',
    ],
    environment: 'node',
    // Deterministic reporting: no randomised file or test ordering.
    sequence: { shuffle: false, concurrent: false },
    // Vitest's 5s default is sized for tests that only compute. Two suites here
    // boot a real ESLint instance instead — `purity-lint.test.ts` and
    // `stacking-lint.test.ts`, which lint synthetic source to prove the bans
    // actually fire — and that first `lintText` call loads the flat config, the
    // TypeScript parser, and the plugin graph. It takes ~500 ms on an idle
    // machine and comfortably exceeds 5 s on a busy one, so the suite failed
    // intermittently, always on whichever ESLint test ran first, and always
    // with a timeout rather than an assertion. A conformance suite that goes
    // red for reasons unrelated to the code under test is a suite people learn
    // to re-run rather than read.
    //
    // Raised globally rather than per-test because the next test to boot a
    // toolchain should not have to rediscover this. Nothing here is expected to
    // take seconds, so a genuine hang still fails the run — just later.
    testTimeout: 30_000,
    // Vitest's hook default is **10 s** — tighter than the test default above,
    // and for no reason that survives contact with this suite.
    // `bench-runner.test.ts` compiles the benchmark project with `tsc` inside a
    // `beforeAll` that declares no budget of its own, which is exactly the
    // "boots a toolchain" case the paragraph above raised `testTimeout` for. It
    // has not gone red yet; it is one loaded machine away from doing so, and it
    // would go red with a hook timeout naming a file whose subject is the
    // benchmark.
    //
    // Parity with `testTimeout` rather than a third number: a hook and a test
    // doing the same work should not be held to different clocks. Every hook
    // here that genuinely needs minutes states its own budget, so this is a
    // floor and not a licence.
    hookTimeout: 30_000,
    //
    // ## The factor every per-test budget in this repository is written against
    //
    // A handful of arms genuinely need minutes and state their own budget. Those
    // budgets were all written from a duration measured on a developer machine,
    // and on 2026-08-17 every one of them fired on GitHub Actions instead —
    // eight timeouts and four file-level hook timeouts on a tree whose real
    // result was four assertion failures. `Verify` was reporting its own
    // impatience.
    //
    // The pair that fixes the number, both taken on `b30f0c8b`:
    //
    //   local  `npm run verify`, 16 cores, load 20-50
    //   CI     Actions job 95387839967 (run 32030062970), ubuntu-latest, 4 vCPU
    //
    // Across every long file that *completed* on both, the runner is 1.4x to
    // 2.1x slower — `balance-telemetry` 66 s / 95 s, `raid-metrics` 37 s / 61 s,
    // `reference-sweep` 24 s / 50 s, `sandbox` 20 s / 39 s. The one pair where
    // the runner's cost is bounded from below rather than measured is worse:
    // `reference-long-run`'s two-hundred-year hook is 86 s locally and was cut
    // at 300 s there, so **above 3.5x**.
    //
    // So: **a budget is seven times its measured local cost** — 3.5 for the
    // runner and 2 for a box that is also doing something else — rounded up to a
    // round number, and capped at one hour, because an arm that needs longer
    // than that is an arm whose place in a merge gate is the question rather
    // than its budget.
    //
    // These are deliberately loose. No run has yet produced a *completed* CI
    // duration for any of the twelve, and the point of the next one is to get
    // them; tighten from measured numbers rather than from this rule.
    //
    // NOT set: `maxWorkers`. The obvious reading of the 2026-08-17 Actions run
    // — five `[vitest-worker]: Timeout calling "onTaskUpdate"` errors — is that
    // the orchestrator is starved and the pool should be capped. The arithmetic
    // says otherwise: 4,417 s of test time plus 912 s of collection finished in
    // 1,868 s of wall clock, which is 2.85 concurrent streams on a four-vCPU
    // runner. That box is busy, not thrashing, and capping the pool would have
    // added about 40% to the wall clock while fixing nothing.
    //
    // The RPC error is a *worker* symptom, not an orchestrator one: birpc's 60 s
    // timeout is hardcoded, and a worker running an unbroken synchronous tick
    // loop cannot service the reply that would clear it. The fix is the one
    // `packages/scenario/src/annihilation.ts` already names as this
    // repository's convention — every long arm hands the event loop back once a
    // world year — and it lives in the test files, not here.
  },
});
