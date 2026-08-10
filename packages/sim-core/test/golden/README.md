<!--
Multiverse Mages — golden replay harness documentation.
Copyright (C) 2026 Ann Kelner
Licensed under the GNU Affero General Public License v3.0 or later.
See the LICENSE file at the repository root, or <https://www.gnu.org/licenses/>.
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Golden replay fixtures

This directory is the project's determinism gate. Each fixture in `fixtures/` is a recording of a
real run — a root seed, a starting state, every action that was submitted, and the snapshot hash
after every single tick. `golden.test.ts` replays all of them on every `npm test` and fails if any
of them stops reproducing.

## The rule

**A regenerated golden fixture is a CLAIM THAT BEHAVIOUR CHANGED ON PURPOSE.**

Reviewers must treat a fixture diff as a behaviour diff. The committed hashes are the only record
of what the rules used to do; overwriting them destroys the evidence that anything moved. So:

- Regeneration is a **separate command a human types** — `npm run goldens:regen`.
- The test suite **never** invokes it, and a test asserts that running the suite leaves every
  fixture file byte-identical on disk.
- A pull request that changes a fixture must say in its description what behaviour changed and why.
  "Regenerated goldens" is not an answer; it is a restatement of the diff.

Tests that regenerate on failure would turn the determinism gate into a rubber stamp: every
nondeterminism bug the harness exists to catch would be silently absorbed into a new expected hash,
and the first anyone would hear of it is a desynchronised PvP match or a Monte Carlo baseline that
quietly stopped meaning anything.

## Layout

| Path                | What it is                                                                     |
| ------------------- | ------------------------------------------------------------------------------ |
| `fixtures/*.json`   | The committed recordings. One file per fixture. Discovered, never listed.       |
| `worlds.ts`         | The world registry: stable world ID → `WorldSchema`. Fixtures name an ID.       |
| `scenarios.ts`      | The recipes the fixtures were recorded from. Read only by the regen command.    |
| `fixture-format.ts` | The on-disk format: canonical rendering, strict parsing, `Recording` adaptation. |
| `golden.test.ts`    | The verification suite.                                                        |

`worlds.ts` exists so that a fixture and the command that regenerated it resolve the *same*
`WorldSchema` from the *same* code. A fixture that encoded one world and was verified against
another would still produce a hash comparison — just a meaningless one, passing or failing for
reasons unrelated to determinism.

## The fixture format

One JSON file per fixture, keys in this exact order, two-space indent, trailing newline. The order
and spacing are canonical on purpose: regeneration must produce a byte-identical file when nothing
changed, so that *any* diff at all is a behaviour diff.

| Field             | Type       | Meaning                                                              |
| ----------------- | ---------- | -------------------------------------------------------------------- |
| `formatVersion`   | `number`   | Schema version of this *file*, not of the simulation. Currently `1`.  |
| `name`            | `string`   | Matches the file's basename.                                          |
| `description`     | `string`   | What the fixture covers, in a sentence a reviewer can check.          |
| `worldId`         | `string`   | Resolved through the registry in `worlds.ts`.                         |
| `rootSeed`        | `number`   | The universe seed every draw in the run derives from.                 |
| `tickCount`       | `number`   | Steps recorded. Equals the action log length and the tick-hash count. |
| `initialSnapshot` | `string`   | The state before the first recorded step, serialized, base64.         |
| `actionLog`       | `object`   | `ActionLog.toJSON()` — actions per step ordinal, in submission order. |
| `finalHash`       | `string`   | Snapshot hash after the last step. 16 lowercase hex characters.       |
| `tickHashes`      | `string[]` | Snapshot hash after **every** step.                                   |

`formatVersion` is bumped when the file shape changes — a new field, a renamed one — and never when
the simulation's behaviour changes. Behaviour changes appear as changed hashes inside an unchanged
schema; conflating the two would let a rules change hide behind a format bump.

`tickHashes` is mandatory here even though `Recording` treats it as optional. Recording with
`traceHashes: true` is what lets a failure say *"diverged at tick 417"* instead of *"the final
hashes differ"*. On a long run the second leaves an engineer bisecting a whole simulation by hand,
and a determinism gate that is expensive to act on is a gate people learn to disable.

`initialSnapshot` is required to be canonical base64 — it must re-encode to itself. Whitespace,
missing padding, and base64url characters would all still decode, and would then re-encode to
something else on the next regeneration: a phantom diff forever.

## The committed fixtures

| Fixture                       | What it covers                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `world-time-only.json`        | Twenty-four world ticks, no mode change. Every tick runs seeded study and attrition draws, so this is the fixture that trips first on a float or an unseeded draw.  |
| `engagement-transition.json`  | World time → engagement entered by action → six engagement ticks (one enrolling entities at the engagement scale) → return to world time → eleven more world ticks. |
| `entity-churn.json`           | Starts from a prelude-populated world, then thirty-six ticks that each create two entities and destroy two slots, so the free list recycles and generations climb.  |

The verification suite **discovers** fixture files by reading the directory. A hardcoded list would
be worse than no harness: a fixture dropped from the list keeps sitting in the repository looking
like coverage while verifying nothing. A separate assertion requires those three names to still
exist, so that deleting one is a failing test rather than a quiet loss of coverage. The suite also
fails if the directory is empty at all.

## Adding a fixture

1. Add a `GoldenScenario` to `scenarios.ts`, with a `description` that says what it is *for*.
2. Run `npm run goldens:regen`.
3. Commit the new `fixtures/*.json` alongside the scenario.

A new fixture needs no change to `golden.test.ts` — it is picked up by discovery.

## When a fixture fails

The failure names the fixture and the diverging tick. Before reaching for the regen command, work
out which of these it is:

- **A nondeterminism bug.** Something in the rules path read the wall clock, used a float, called
  `Math.random`, or iterated a hash. Fix the code; the fixture is right.
- **A stream shift.** A draw was added to a subsystem in a way that moved another subsystem's
  sequence, or an RNG subsystem ID was renumbered. `RNG_STREAM` is append-only for exactly this
  reason. Fix the derivation; the fixture is right.
- **A deliberate rules change.** The behaviour genuinely changed and the change is wanted. *Now*
  regenerate — and say so in the commit message.

## Running it

```sh
npm test                  # unit tests and the golden suite together
npx vitest run packages/sim-core/test/golden
npm run goldens:regen     # explicit, separate, and never invoked by a test
```

The regeneration command loads the core's TypeScript through Node's native type stripping plus a
fifteen-line resolve hook in `scripts/regen-goldens.mjs`, rather than a TypeScript loader
dependency. A dependency in the regeneration path is a dependency that gets a vote on what the
committed fixtures say.
