<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Adversarial brief — the instruction both breakers were given

*Kept so the two reviews in this directory are reproducible, and so the next campaign has a
starting point rather than an improvised prompt.*

---

## The brief

You are the **breaker**. Another agent just ran a campaign against NaN contamination and silent
collapse-to-zero in this deterministic simulation, and concluded the rules path is clean. Your job is
to prove that conclusion wrong, or to find the contamination it missed.

**Do not agree with it.** An agent that writes tests agreeing with its own code produces a suite that
is internally consistent and completely indifferent to whether the requirement was met. Disagreement
is the product here.

## The mechanism you are hunting

    a lookup misses -> `undefined` enters arithmetic -> NaN comes out
      -> written to an i32 component column -> the typed array coerces NaN to 0
      -> the mechanic contributes nothing, forever, and reads as a balance result

Second route, no NaN involved: `mul(x, k)` with `k < FP_ONE` floors to exactly 0. If that product is
a per-tick increment, the quantity never moves again. Call this a Zeno stall. It has happened four
times in this repo already.

## What the campaign built (and therefore what you must get past)

- `installValueSentinel` (`packages/sim-core/src/component.ts`) — watches the two doors into
  component storage, `set` and `field`, rejects anything failing `Number.isInteger`.
- `installAnnihilationSentinel` (`packages/sim-core/src/fixed-point/fixed-point.ts`) — reports any
  `mul`/`div` turning two non-zero operands into 0.
- `AnnihilationRecorder` (`packages/scenario/src/annihilation.ts`) — attributes those to a function.
- Tests: `packages/scenario/test/unit/annihilation-registry.test.ts`,
  `assembled-run-values.test.ts`, and a raid arm in `raid-engagement.test.ts`.
- Write-up: `docs/design/numeric-integrity.md`. **Read this first** — it names the blind spots
  itself, and the fastest way to draw blood is to walk into one and show it matters.

## Where it admits it is blind — start here

1. **Plain-object `Fixed` fields.** The value sentinel only sees component columns. `RaidState`
   (`packages/state/src/engagement.ts`) holds `portalStability` and `stabilityDecayPerTick` as plain
   object fields. NaN *survives* there rather than coercing. Can you drive a NaN or a nonsense value
   into one through a legitimate code path?
2. **`floorDiv` used directly, and bare `-`.** The annihilation sentinel only wraps `mul` and `div`.
   Any other route to zero is invisible to it.
3. **`?? 0` defaults.** 56 in the rules path. A missed lookup that becomes 0 is a *legal integer*, so
   **neither sentinel can see it**. Find one where absence means "bug" rather than "zero" and show
   the consequence.
4. **The float boundary.** `packages/agent-api/src/normalize.ts`, `packages/mc-harness/src/metrics-*.ts`,
   `packages/gym-bridge/src/codec.ts`. Fixed-point discipline stops here; these are real doubles.
5. **The instruments themselves.** Can you construct a case where a NaN reaches state and the
   sentinel stays silent? Where the `AnnihilationRecorder`'s stack attribution reports the wrong
   function, or `(unattributed)`? The registry key is `module:functionName` — what breaks it?

## Rules of engagement

- **Work only in this worktree.** Never touch the shared checkout or another worktree.
- Run `npm run typecheck` before any script that loads `dist/`.
- `npm test` is the suite. Be aware: it exits non-zero on `[vitest-worker]` unhandled errors even
  when every test passes — that is pre-existing and reproduces on untouched `origin/main`. Judge by
  the pass/fail counts, not the exit code.
- **Never run `npm run goldens:regen`.** A regenerated fixture is a claim behaviour changed on
  purpose.
- No `Math.random`, no `Date.now`, no floats in the rules path.

## What counts as a finding

Every claimed defect must name:

**(a)** the behaviour you believe is incorrect, concretely — inputs, and the wrong output or state.
**(b)** what says otherwise: the spec line, doc comment, or invariant it contradicts.
**(c)** why your asserted value is the right one.

A failing test whose assertion is simply wrong is worse than no test. If you cannot fill in (b), you
probably have a preference, not a defect. Say so and move on.

## Deliverable

Write your findings to `BREAKER-FINDINGS.md` in this worktree root, most severe first, and commit
your work on this branch. If you write tests, put them in the normal test directories and say
clearly which ones fail on purpose and which pass.

If you find nothing after a genuine attempt, say that plainly and list precisely what you tried and
what would have caught it — a negative result stated with its coverage is worth more than a
speculative finding.
