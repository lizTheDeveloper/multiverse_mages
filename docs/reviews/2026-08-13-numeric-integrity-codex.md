<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Adversarial review — numeric integrity (Codex)

*One of two independent reviews of the numeric-integrity campaign that became `docs/design/numeric-integrity.md`
and PR #73. The reviewer ran on a different model, in its own worktree, with no shared context, and
one instruction: **do not agree with it.** The brief it was given is
`2026-08-13-numeric-integrity-brief.md`.*

> **Status: acted on.** The finding below was real and is fixed on `main` in `977b13d`. This file is
> kept as the record of what the review found and what it ruled out — the negative results are the
> more perishable half, because nobody re-derives them.

---

## 1. High: `AnnihilationRecorder.record` silently stops watching an async run

### Incorrect behaviour

`AnnihilationRecorder.record()` claims to record annihilations while its `body`
runs, but it removes the global sentinel immediately when an async body returns
its `Promise`, rather than when that promise settles.  Consequently this
otherwise legitimate diagnostic run reports no site at all:

```ts
const recorder = new AnnihilationRecorder();
await recorder.record(async () => {
  await Promise.resolve();
  recorder.atTick(0);
  mul(1, 1); // non-zero operands; fixed-point result is 0
});
expect(recorder.siteNames()).toEqual([]); // actual: silently clean
```

`record` executes `return body()` inside a synchronous `try` and its `finally`
therefore calls `installAnnihilationSentinel(previous)` before the awaited
continuation runs.  The event never reaches `#note`; it is not merely
misattributed.

### Contradicted statement

`packages/scenario/src/annihilation.ts` documents the method as: “Installs the
sentinel, runs `body`, and always restores what was there,” and the class as
recording “while `body` runs.”  INV-38 says the observed set of functions that
annihilate a live non-zero quantity is exact.  An async diagnostic arm can make
that set empty while an annihilation happens.

### Why the asserted result is right

For `mul(1, 1)`, both operands are non-zero fixed-point values and the defined
calculation is `floorDiv(1 * 1, 1024)`, which is `0`.  The core sentinel
explicitly reports precisely that condition.  A recorder advertised as covering
the body must retain the hook until the returned promise settles; otherwise a
normal `await` changes whether the instrument observes the same arithmetic.

This is a defect in the instrument/claim coverage, not evidence that the
current synchronous reference arm has a live Zeno stall.  The existing arm is
synchronous and passes; the failure is latent in the public recorder API.

## Negative results (specific probes)

- **Plain-object raid fields:** the production path is closed.  `openPortal`
  computes an integer opening stability from validated tuning and passes it to
  `beginEngagement`; `beginEngagement` rejects a non-integer or negative
  `portalStability`, and rejects a non-integer or sub-one decay.  I found no
  legitimate production path that injects `NaN` into `RaidState`.
- **Raid constants/defaults:** raid tuning reads through `raidConstant`, which
  throws on an absent id; the apparent `?? 0` at portal target selection is only
  after a bounded index into a precomputed non-empty target list.  I did not
  find a lookup miss there that becomes a functional zero.
- **Direct `floorDiv`/subtraction:** inspected the live per-tick candidates in
  movement, construction, reallocation, materials, and stability decay.  The
  small-cohort reallocation zero is expressly documented as a contract choice
  (no remainder banking), rather than an unacknowledged Zeno defect.  I found
  no current site with a contrary invariant establishing that zero is wrong.
- **Float boundaries:** `normalize.ts`, canonical metric collection, and the
  gym codec explicitly floor/reject non-finite values at their respective
  boundaries.  No unguarded non-finite route into persisted output was found.

## Verification

- `npm run typecheck` — passed.
- `npx vitest run packages/scenario/test/unit/annihilation-registry.test.ts packages/scenario/test/unit/assembled-run-values.test.ts --reporter=dot` — 2 files, 6 tests passed.

No tests were added.  The report's async reproduction is deliberately a
minimal failing contract example; adding it as an ordinary passing test would
require fixing `record` to be async-aware, which is outside this breaker brief.
