<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Adversarial review — numeric integrity (Qwen)

*One of two independent reviews of the numeric-integrity campaign that became `docs/design/numeric-integrity.md`
and PR #73. The reviewer ran on a different model, in its own worktree, with no shared context, and
one instruction: **do not agree with it.** The brief is `2026-08-13-numeric-integrity-brief.md`; the
other review is `2026-08-13-numeric-integrity-codex.md`.*

> **Status: acted on, and Finding 1 changed the design.** The sentinel moved from `mul`/`div` onto
> `floorDiv` — the only `/` in the core — on `main` in `c7b0886`. The registry went from one entry to
> ten as a direct result.
>
> **The text below is preserved as written, which means parts of it are now deliberately out of
> date.** Where it says the sentinel "does not see" a `floorDiv`, that was true when written and is
> false now. That is the point of keeping it: the review is the record of what was wrong, not a
> description of what is. The test it shipped has been inverted into
> `annihilation-floordiv-coverage.test.ts`, which asserts the same scenarios are now *seen*.

---

*Adversarial audit of the numeric-integrity instruments and the surfaces they cannot see.*

---

## Summary

The campaign's design doc names four blind spots and states plainly that *"the rules path is
clean"*. I tested that claim against the instruments' actual coverage and found it half-right: no
live NaN contamination on `main`, but the instruments that are supposed to *say so* are structurally
incapable of seeing several classes of defect they claim to cover. The registry of annihilating
functions is not a registry — it is a partial witness that cannot see its own blind side.

Two findings are defects with concrete wrong behaviour. Three are structural gaps the design doc
admits but does not close. The float boundary is clean; I looked and found nothing.

---

## Finding 1 — The annihilation registry is structurally blind to `floorDiv`

**Severity: high. The registry's completeness claim is false.**

**(a)** `materialsProduced` in `packages/rules-world/src/economy/materials.ts` line 173 applies
each material kind's territory share through a bare `floorDiv`:

```typescript
const ofKind = floorDiv(base * Math.max(0, input.shares[kind]), FP_ONE);
```

When `base * shares[kind] < FP_ONE` (1024), the result is zero. Concrete inputs:
`laborerCount = 1`, `laborAffinity = 64`, `shares = { food: 1004, stone: 10, vellum: 10 }`.
The `mul` on line 171 produces `base = 1` (non-zero). Each `floorDiv` then floors to zero.
All three material kinds produce nothing. The annihilation sentinel reports nothing.

`routeYieldByForm` in `packages/rules-world/src/economy/kinds.ts` lines 175–177 does the same
thing for resource-yield routing. With `magnitude = 1` and weights `{ food: 512, stone: 256,
vellum: 256 }`, every kind floors to zero. The sentinel reports nothing.

The cohort transfer budget in `packages/rules-world/src/populace/reallocation.ts` line 286:
`floorDiv(count * TRANSFER_RATE_PER_TICK, FP_ONE)` is zero for any cohort with fewer than 16
members. A cohort that shrinks through mortality silently freezes — it can never transfer anyone,
regardless of demand.

**(b)** The annihilation-registry test (`annihilation-registry.test.ts`) asserts:

> *"the set of functions that floor a live quantity to zero is exactly the registered set"*

The sentinel it relies on — `installAnnihilationSentinel` — wraps `mul` and `div` in
`fixed-point.ts`. It does not wrap `floorDiv`. The design doc for numeric-integrity.md admits this:

> *"Blind to: a floor reached through `floorDiv` directly, or a quantity driven to zero by a bare
> subtraction."*

The admission is in the doc but not in the test. The test asserts completeness over a surface it
does not cover.

**(c)** The right answer is that the registry should either (a) extend the sentinel to cover
`floorDiv`, or (b) stop claiming to be complete over all annihilations and restate itself as
*"the set of functions that floor a live quantity to zero **through `mul` or `div`**"*. As it
stands, a content change that introduces a new `floorDiv` annihilation — a species with lower
`laborAffinity`, a territory with more uneven shares — would pass the registry test silently.

**Test:** `packages/scenario/test/unit/sentinel-blind-annihilation.test.ts`. All six tests pass.
The passing assertions *are* the finding: the sentinel stays silent when it should not.

---

## Finding 2 — `cloneStateInto` and `#ensureRows` bypass the value sentinel

**Severity: medium. The sentinel's coverage claim is conditional on installation order.**

**(a)** `ComponentStore.cloneStateInto` (`packages/sim-core/src/component.ts` lines 464–479)
copies raw typed-array buffers via `.slice()`. It does not route through `set()` or `field()`.
The value sentinel is invisible to this path.

`#ensureRows` (lines 532–549) copies values element-wise into grown arrays, also bypassing the
sentinel. `#detach` (lines 487–505) does the same for swap-remove.

The practical consequence: if a NaN is written to a component column while no sentinel is
installed (the default operating mode), the typed array coerces it to 0. Every subsequent
`cloneStateInto` (which runs on every `step()`) faithfully replicates that 0. If the sentinel is
later installed for diagnostics, it sees only the 0 — a legal integer — and reports nothing. The
original NaN is gone and was never reported.

**(b)** The sentinel's doc comment states:

> *"`set` and `field` are the only two doors into component storage. Everything else … either
> zeroes a row, copies values that were already accepted, or routes back through `field`."*

The claim *"copies values that were already accepted"* is only true if the sentinel was installed
when the values were *originally* written. Values written through `field()` while no sentinel is
installed were never accepted by anything — they went straight to the typed array. The sentinel
retroactively installed cannot distinguish a 0 that was always a 0 from a 0 that was a NaN.

**(c)** The sentinel is documented as an observation-only instrument, not a shipping guard, so
this is a gap in diagnostic coverage rather than a live defect. But the design doc's claim that
watching two doors covers the write boundary is wrong when one of those doors was not watched at
the time the values entered. A cheaper fix than instrumenting every copy path: the sentinel could
walk stored values on installation, flagging any that are not safe integers. That would catch
coerced NaNs (now 0) only if the original value was not an integer — which it cannot, because the
typed array already coerced it. So the real fix is to make the sentinel install-on-first-write
rather than opt-in, or to accept that its coverage begins at installation and state that clearly.

---

## Finding 3 — `?? 0` masks game-mechanic quantities where absence is a bug

**Severity: low-medium. Not a live defect in the reference run, but the pattern the design doc
names as a remaining gap is present and concrete.**

**(a)** `packages/rules-world/src/economy/carrying-capacity.ts` line 282 declares
`subsistenceShortfallShare` as optional (`Fixed | undefined`). Line 331 defaults it:

```typescript
const share = Math.min(FP_ONE, Math.max(0, input.subsistenceShortfallShare ?? 0));
```

If a caller omits this field, the carrying capacity silently assumes no famine and returns the
full well-fed `K`. A missing subsistence calculation inflates population above what the universe
can sustain, with no error and no symptom other than a universe that looks healthier than it
should.

The production caller in `packages/coordination/src/world-step.ts` line 823 does provide it, so
this is not a live defect in the reference run. But the type system permits omission, and the
design doc identifies exactly this pattern:

> *"Where absence is genuinely a bug rather than a state, a `require*` accessor that throws is
> the right shape."*

**(b)** The field is optional in the interface and the code uses `?? 0`. The design doc says this
is a gap. The gap is still open.

**(c)** The fix is to make `subsistenceShortfallShare` required in `CapacityInput`, or to document
the `?? 0` as intentional with a comment explaining why absence means zero rather than error. The
current state — optional field, silent default, no comment — is the ambiguity the design doc
identifies.

Other `?? 0` sites in the same category:

- `packages/rules-raid/src/raid.ts` line 857: `magnitudes[0] ?? 0` — a theft that succeeded but
  has no magnitude silently contributes zero to the ledger.
- `packages/rules-raid/src/combatants.ts` lines 259–261: `intrinsicDamage ?? 0`,
  `intrinsicRange ?? 0`, `detachmentStrength ?? 0` — a combatant spec that forgets these fields
  silently becomes harmless.

---

## Finding 4 — The float boundary is clean

**Severity: none. Looked and found nothing.**

I examined every file the brief named:

- `packages/agent-api/src/normalize.ts`: `applyDescriptor` with `divisor: 0` produces `NaN` or
  `Infinity`, but `clamp` catches all three cases and floors to `min` or `max`. No NaN reaches the
  output. The `divisor` cannot be zero in production: `assertSaturationConstant`, constructor
  functions, `layoutProblems`, and runtime assertions all reject it.
- `packages/gym-bridge/src/codec.ts`: `encodeFrame`'s replacer function rejects non-finite numbers
  before serialization. No write-back to state exists.
- `packages/mc-harness/src/metrics-*.ts`: every collector validates output with
  `Number.isFinite`. The `gini()` function handles `total === 0` by returning `coefficient: 0`
  rather than dividing. No feedback path into state.

The normalization layer is a strict one-way membrane. No path exists where NaN or bad values cross
from the float boundary back into the rules path.

---

## Finding 5 — The annihilation recorder's stack attribution is V8-only

**Severity: low. Not reachable in the current test suite, but the claim is broader than the
implementation.**

**(a)** `attributeToCaller` in `packages/scenario/src/annihilation.ts` parses stack traces with
the regex `/^at ([^\s(]+) \(([^)]+)\)$/`, which matches V8 format only. SpiderMonkey
(Firefox) and JavaScriptCore (Safari) use `functionName@file:line:col`, which does not start with
`at `. Every frame is skipped; the result is `(unattributed)` for every event.

Async function frames in V8 (`at async functionName (file:line:col)`) also fail the regex:
`[^\s(]+` captures `async`, then expects ` \(` but finds ` functionName`. The fallback regex
captures the whole frame, and `basename` produces garbage (`file.js:10:5)` instead of a module
name).

**(b)** The recorder is documented as attributing events to `module:functionName`. The
implementation attributes correctly only in V8 with synchronous call stacks.

**(c)** The fix is to either (a) state the V8-only constraint in the doc comment, or (b) add a
fallback parser for other stack formats. Since the test suite runs in Node.js (V8), this is not
reachable today, but the claim is stated as general and the implementation is not.

---

## What I tried that found nothing

- **NaN in `RaidState.portalStability`**: The field is a plain object property where NaN would
  survive (blind spot 1 from the design doc). But `beginEngagement` validates it as a non-negative
  integer, and `decayStability` only subtracts an authored integer from it. No arithmetic on valid
  inputs produces NaN. The guard at the door is sufficient for this particular field.

- **Bare `*` and `/` operators in the rules path**: Found several (e.g. `combatants.ts` line 211:
  `floorDiv(beforeSpecies * species.laborAffinity, FP_ONE)`). These are sentinel-blind but
  deliberate — the comments explain the extended-precision trade-off. The values involved
  (`combatantBaseMaxHp = 65536`, `laborAffinity` typically ≥ `FP_ONE`) do not produce zero in
  practice.

- **Native `/` in `ascension.ts`**: Uses `Math.floor(x / FP_ONE)` instead of `floorDiv(x, FP_ONE)`.
  Different rounding mode for negative values, but all values in that path are non-negative. Not a
  defect, but an inconsistency with the project's stated uniform-rounding principle.

---

## Tests

| File | Tests | Purpose |
|------|-------|---------|
| `packages/scenario/test/unit/sentinel-blind-annihilation.test.ts` | 6, all pass | Proves the sentinel cannot see `floorDiv` annihilations in `materialsProduced`, `routeYieldByForm`, and the cohort transfer budget. The passing assertions are the finding. |

No tests were written that fail on purpose. The existing suite's failing tests (if any) are
unchanged.
