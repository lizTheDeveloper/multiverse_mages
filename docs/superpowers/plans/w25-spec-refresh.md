<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W25 — spec refresh: bring `vision.md` back into agreement with the author and the tree

**Branch** `w25/spec-refresh`, cut from `origin/integration/campaign-round-2`. **Docs only.**
Nothing under `packages/` is touched, no golden fixture and no balance baseline is regenerated.

## Why

`CLAUDE.md`: *"`docs/design/vision.md` is the vision of record… work that isn't traceable to a
section there is scope creep; sections that never ship are unmet promises."* And §11's own preamble:
the roadmap table uses real change and capability ids *"so that `openspec list` and this table stay
in agreement — that agreement is how 'did the vision get built?' is answerable."*

That agreement is broken, and in three places the vision now argues with decisions the author has
since made. Every agent and reader who opens the file re-derives the same objections. This
workstream records decisions already taken. **It does not design anything.** Where a decision has a
gap, the gap is listed as a question for the author rather than filled.

## Scope, as five amendments and one naming call

| # | Section | What is wrong | What it becomes |
|---|---|---|---|
| A | §11 | Status column contradicts `openspec list` on three rows and understates two more | reconciled against `openspec list` and the tree, with task counts in the cell |
| B | §8 | calls elimination *"a live-PvP death sentence dressed as a strategic cost"*; the author has decided elimination is intended | states the real bound — respawn into a different bubble — and stops arguing |
| C | §7a | silent on whether a *place* is allowed at world scale | boundary made explicit: no coordinates, no distance, no pathfinding; a place with a kind and a link to it is permitted |
| D | §12 + §4 + §13 | scopes v1 to 3 techniques × 4 forms; the author has decided to go wide | records the widening and the reason, in all three places that state the subset |
| E | new | five decided mechanics that appear in no section | given homes, recorded at the size they were decided |
| F | §4 | a structural rule the content already obeys and no document states | perception is the trunk — all eleven v1 cross-cell edges originate in *Intellego* |
| — | §8a / §8b | *prestige* is a noun in the codebase and a verb in the author's phrasing | the vision uses **promotion** for the verb; the noun stays §8a's carried score |

## Checkable steps

- [x] 1. Cut `w25/spec-refresh` from `origin/integration/campaign-round-2`; `npm ci` in the worktree
- [x] 2. Read `vision.md`, `contracts.md`, `campaign-plan.md` (`origin/pm/campaign-plan`),
      `vision-audit.md` (`origin/w12/vision-audit`), `release-plan.md`, `openspec/project.md`, `CLAUDE.md`
- [x] 3. Establish what parses these documents before editing them
- [x] 4. Verify every §11 row myself against `openspec list` and the tree — the audit is one commit
      old and several workstreams have landed since
- [x] 5. Check `origin/w16/colonization` for the colonization proposal, its v1 verdict, and its
      naming recommendation — cross-reference, do not duplicate
- [x] 6. Check `origin/w21/timing-and-envelopes` for what the timing mechanic actually is
- [x] 7. Check for a W24 branch before writing anything about universities sited in territories
- [x] 8. Amendment A — §11
- [x] 9. Amendment B — §8, §8a, and a new §8b
- [x] 10. Amendment C — §7a
- [x] 11. Amendment D — §4, §12, §13
- [x] 12. Amendment E — a new §4b (exclusivity, depth, rituals), §7 (timing), §8b (colonization), §13
- [x] 13. Amendment F — §4's perception trunk, re-measured off `node.json` rather than taken on report
- [ ] 14. `npm run verify` green
- [ ] 15. Push. No PR.

## Amendment F, and where the brief it arrived with was stronger than the data

The rule was reported as *"the v1 grid is four form-columns, each with Intellego as its trunk and
Perdo/Rego branching off."* Re-measured off `packages/content/data/node.json`, the load-bearing half
holds exactly — **11 of 11** cross-cell prerequisite edges in the v1 subset originate in an
*Intellego* cell — and the framing does not: **every** *Perdo* and *Rego* cell carries its own
tier-1 root with no prerequisite at all. The perception edge attaches at tier 2–4, so what it gates
is depth, not entry. Measured: strip every *Intellego* node from the v1 subset and **18 of 51**
nodes are still reachable.

§4 records the measured version. It also records the two numbers that keep the rule from being
over-read: across all seventy cells, **29 of 36** cross-cell edges originate in *Intellego* — five
come from *Perdo* and two from *Rego* — so the pattern is dominant and not universal, and whether
the *Muto* and *Creo* columns should acquire it is left open in §13.

## What the gate turned out to be

Nothing in the repository parses `docs/design/vision.md` — every one of the ~40 `vision.md` hits in
the tree is a prose citation in a comment. `contracts.md` by contrast has **ten** runtime parsers,
including three independent readers of its §7 metric table, so an edit there would have been a very
different job. `horizon-gate.test.ts` reads `package.json`, `scripts/ci-check.sh` and
`.github/workflows/ci.yml` — not a design document, despite its `describe` title naming one.

The one soft risk, and it is why this amendment **adds** §4b and §8b rather than renumbering
anything: `vision.md` is referenced 145 times across `packages/`, `docs/` and `openspec/`, and a
number of those references name a section by number (`vision.md §4a`, `§6a`, `§7`, `§13`…).
Renumbering would fail nothing and silently invalidate all of them.

## The verification method for §11, stated before running it

A row is judged on three questions, in this order, and the answer to each is recorded:

1. What does `openspec list` say **on this branch, today**?
2. Does the package the change delivers exist in this tree, and is it reachable from
   `makeReferenceExecutor()` — the oracle W12's audit fixed?
3. Has the version been **released** — i.e. is there a tag and does root `package.json` name it?

Question 3 is the one the old table conflated. "Tasks complete" is not "released": root
`package.json` is `0.3.0` and `git tag` stops at `v0.2.0`, so nothing after `knowledge-model` may
carry `released` however complete its task list is.

## Constraints

- Amend `vision.md` in its own voice: dense, opinionated, reasoning out loud. A good amendment is
  often one paragraph. Do not bloat it.
- Every number must be one a workstream measured, with the workstream named. Where the decision has
  a gap, write the uncertainty rather than smoothing it.
- Public repository. Write for an audience.
- **Never** run `npm run goldens:regen`. Docs-only: if the work reaches `packages/`, stop.
- Anything else found stale gets **reported**, not amended.

## Findings that are reported rather than amended

Kept here so they survive the branch.

- **`@mm/rules-raid` is imported by `packages/scenario/src` and declared nowhere.**
  `packages/scenario/src/raids.ts` imports values from `@mm/rules-raid` (not types), and
  `packages/scenario/package.json` lists no such dependency, nor does
  `packages/scenario/tsconfig.json` reference it. It resolves today by workspace hoisting. Code
  fix, not a docs fix.
- **W12's audit left seven documentation corrections (its D1–D7) that are not on this brief.** D1
  (§11) is amendment A here. D2–D5 are `vision.md` edits nobody has been asked for: §8 should cite
  `contracts.md` §1.1 for what *"uninvolved universes keep advancing"* means; §6 should mark orc
  martial capability as deferred per `contracts.md` §2.4; §4's *"~15 tunable effect primitives"* is
  16 in `primitive.json`; §13's mage-population figure was re-measured at 72/18,417 against the
  88/18,713 the section states. D6–D7 are stale first-party code comments.
- **0.3.0 shipped without a tag.** Root `package.json` is `0.3.0`, `knowledge-model` is archived,
  `CLAUDE.md` says "released through 0.3.0", and `git tag` stops at `v0.2.0`.
  `release-plan.md` says *"every release gets a tag; an untagged release is not a rollback
  target."* Stated in §11's new paragraph; fixing it is a release action, not a docs one.
- **`CLAUDE.md`'s "Current state" paragraph has the same drift §11 had.** It ends *"Next up is
  `mages-and-species` (0.4.0)"*, while `openspec list` puts `mages-and-species` at 102/107 and both
  `agent-interface` (0.5.0) and `gym-bridge` (0.11.0) at complete. Every agent reads that paragraph
  before anything else, so it is the highest-traffic stale sentence in the repository. Not amended:
  `CLAUDE.md` is not this workstream's to edit.
- **§12 still puts audio out of scope, and audio is in `npm run verify`.** Five audio source files
  in `packages/content/src`, `data/audio/{audio-cue,voice-line}.json`, a schema directory,
  `tools/audition/`, and `check:audio` as a step of `verify`. W12's audit flagged this in its
  reverse-check of §12; it is not on this brief, so it is reported rather than amended — the
  question it raises is whether audio was rescoped or whether it is the largest piece of
  untraceable work in the tree.
- **§9's balance-gate sentence is still contradicted.** *"A change that moves a primitive's
  measured contribution beyond tolerance fails CI"* — three gates run in `verify`, and the
  ascension baseline (the widest) gates exactly ten metric ids, all of them `reference*` scenario
  vital signs. **None of `contracts.md` §7's twelve metrics is gated by anything**, and
  `winRateByPrimitive` — the primitive-contribution metric that sentence is about — reports
  `unavailable`. Verified directly against
  `balance/baselines/balance-gate-ascension-v1.baseline.json` on this branch.
- **The plan doc on `origin/w21/timing-and-envelopes` overstates its own branch.** Its §7/§9 status
  tables say the envelope is *"applied to research, teaching and scribing"*; a later commit on the
  same branch reverted teaching and scribing with a measured justification, and only `research()`
  calls `shapedEffort`. Reported to W21, not corrected here.
