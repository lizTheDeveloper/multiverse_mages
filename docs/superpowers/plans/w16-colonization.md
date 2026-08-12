<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W16 — Colonization: plan

**Deliverable:** an OpenSpec change proposal, proposal-only. No code. Nothing under `packages/`.

**Branch:** `w16/colonization`. **Change id:** `colonization`.

## The mechanic, as the author specified it

Four statements, taken in order, and this plan is written against all four:

1. *"Extinguish their magic users so there are no more — **that** is what colonizes them. And then
   they pay whatever they paid to their old god: their taxes and materials and labour go to the new
   group."*
2. *"Yes, a losing player quits. **That is the game.**"*
3. *"You gotta respawn in a new… **group of multiverses**."*
4. *"You probably shouldn't have an infinite number of people in a multiverse bubble… perhaps: you go
   until you have **conquered all universes in your bubble**, then you prestige to the next bubble,
   where it's all people who conquered a bubble."*
5. *"That way you can **always rejoin when you lose**."*

Read together these describe a roguelike-shaped loop in which **a universe is a run and the player
never leaves the game**:

    within a bubble:      raid, loot, extinguish rivals
    extinguished:         mages gone -> populace, materials and worship transfer to the conqueror
    clear the bubble:     promoted to the next tier, populated by others who cleared theirs
    lose your universe:   rejoin a fresh bubble, carrying prestige
    only universes end.   the player does not.

That framing is not a softening of statement 2. It is what statement 2 plus §8a already say
together, and `prestige-base-stagnated` being non-zero *"deliberately: a zero floor makes losing
streaks spiral"* is the design already pricing it.

## Plan

### 1. Orientation — read the sources of record

- [x] 1.1 `docs/design/vision.md` in full; §3, §5, §6a, §7, §7a, §8, §8a, §12, §13 are the load-bearing ones
- [x] 1.2 `docs/design/contracts.md` §0, §1.1, §2.7 (the `landUnits` migration passage), §5
- [x] 1.3 `openspec/changes/raid-engagement/proposal.md`, `design.md`, `tasks.md`, one `spec.md` for house style
- [x] 1.4 `openspec/changes/pvp-server/proposal.md` — in particular its "Open Questions Blocking Specification" section, which is the precedent for raising rather than inventing
- [x] 1.5 `CLAUDE.md`, `openspec/project.md`
- [x] 1.6 The campaign board on `origin/pm/campaign-plan` — the measured diagnosis, the W-board, the definition of done, the standing constraints

### 2. Trace what already exists (delegated to Sonnet; design judgement retained)

- [x] 2.1 `packages/rules-world/src/economy/carrying-capacity.ts` — the `landUnits` -> `K` -> population -> mages chain, and whether `K` is a brake or a clamp
- [x] 2.2 `landUnits` and `capacityPerLandUnit` in content: schema, type, v1 values
- [x] 2.3 `WORLD_SCHEMA_VERSION` — current value and what infers it
- [x] 2.4 The world-state root: `UNIVERSE` component fields and `WORLD_COMPONENTS`
- [x] 2.5 The mageless/stagnation terminal path: `magelessTicks`, `stagnation-mageless-ticks`, `terminalReason` enum
- [x] 2.6 The prestige constants and the loader identity asserted over them
- [x] 2.7 The worship formula and the favor-regeneration loop; `favorWasted`
- [x] 2.8 Materials production and consumption per world tick
- [x] 2.9 `capitalSnowball` — formula, threshold, and the §7 metric set around it
- [x] 2.10 `portalTargets` — its type, and confirmation that nothing populates it
- [x] 2.11 Whether a universe id stable across simulation instances exists anywhere

### 3. Settle the architecture, not the design

- [x] 3.1 Decide how a colony is represented without a second resident universe, against `contracts.md` §1.1
- [x] 3.2 Confirm the representation needs no cross-universe evaluation on unsynchronised clocks (`contracts.md` §0: clocks are per-universe)
- [x] 3.3 State the `WORLD_SCHEMA_VERSION` revision and the `contentRevision` consequence
- [x] 3.4 State what the proposal needs from W10 (`pvp-server`) and what it does not
- [x] 3.5 Confirm no coordinates are introduced anywhere (vision §7a)

### 4. Write the proposal

- [x] 4.1 Scaffold `openspec/changes/colonization/` and run `openspec validate colonization --strict` on the skeleton, before writing prose
- [x] 4.2 `proposal.md` — Why / What Changes / Capabilities / Impact, in `raid-engagement`'s house style
- [x] 4.3 `specs/universe-extinction/spec.md`
- [x] 4.4 `specs/colonial-tribute/spec.md`
- [x] 4.5 `specs/multiverse-bubbles/spec.md`
- [x] 4.6 `design.md` — Context, Goals/Non-Goals, Decisions, the three options with the measurement that would show each failing, Risks, Open Questions
- [x] 4.7 `tasks.md`
- [x] 4.8 `openspec validate colonization --strict` green

### 5. The six tensions, each answered explicitly in `design.md`

- [x] 5.1 **§7a: no map.** Everything transferred — populace, materials, worship — is a count. Bubble membership is an adjacency set, not geography. Say it explicitly; it is the proposal's strongest single argument
- [x] 5.2 **§8 griefing.** Resolved by the author, not waived: a universe is a run, defeat is a fast re-entry carrying prestige, `prestige-base-stagnated` is non-zero by design. The risk moves to the *conqueror's* side and lands on `worshipSnowball` — corrected from `capitalSnowball`, which is measured with no numeric threshold assigned in code at all (`thresholdOwner: 'god-agency'`)
- [x] 5.3 **§8a ascension.** Two win conditions now exist. Raise it as the proposal's central open question; do not resolve it
- [x] 5.4 **§1.1 one universe per instance.** State the architectural cost precisely and what W10 must carry
- [x] 5.5 **§12 economy / ranked ladder.** Argue scope rather than assuming it. Split the verdict if the honest answer is split
- [x] 5.6 **Does it help the measured problem?** 51 of 300 nodes; an idle universe learns all 51. Answer honestly, including "no"

### 6. Name collisions and open questions

- [x] 6.1 Propose a term for tier promotion that is not `prestige`, and say plainly that the collision exists
- [x] 6.2 Assemble the author-question list: attribution, colony dynamics, rejoin tier, bubble size and composition, ascension-vs-conquest, prestige across a rejoin, the "special circumstances" unbounded bubble
- [x] 6.3 Name the measurement that would show each recommendation failing

### 7. Close

- [x] 7.1 Commit and push `w16/colonization`. No PR
- [ ] 7.2 Report: change id, recommendation, the six tensions, the honest v1 verdict, validate result, author questions

## What the tracing found, and what it did to the proposal

Three measured findings changed the shape of the deliverable. Recorded here because each of them is a
number someone can re-check.

1. **The transfer is nearly inert at this build.** `worshipTarget()` sums three *saturating* terms.
   The populace term (`worship-populace-per-head` 16, cap 2048, half 16384) sits at **1,941 of 2,048 —
   94.8% of its cap** at the reference run's populace of 18,713. Absorbing an identical civilization
   raises it to 1,993: **+52 fp on a total worship of ~4,831**, which through
   `favor-regen-base + worship × favor-per-worship` is a **0.76% increase in favor regeneration**
   (3,439 → 3,465). The other half of the transfer, materials, is unsaturated but its only live
   claimants are subsistence and scribing — `advanceConstruction` and `applyLibraryUpkeep` have no
   caller outside tests — so colonial materials fund more copies of the exhausted 51-node set.
2. **The `landUnits` thread in the brief does not apply.** `contracts.md` §2.7 anticipates *"a raid
   that takes ground"*. The author's colonization takes **people**, not ground, so §2.7's migration
   into §1.1 is not triggered and `landUnits` stays in content. It fires only if the author wants
   absorbed populace to genuinely join the conqueror's cohorts — open question 9.
3. **A naive `TERMINAL_REASON` extension mis-prices conquest.** `prestigeEarned` branches
   `stagnation ? base-stagnated : base-cutoff`, so a `conquest` reason added without an explicit
   branch pays **256** — more than the 128 a ruined run pays.

## Standing constraints for this workstream

- Proposal only. Nothing under `packages/`.
- Determinism; no floats in the rules path; fixed point at 1/1024; content in validated data files;
  tradition hooks confined to acquire/store/cast/cost.
- New world state costs a `WORLD_SCHEMA_VERSION` revision — say so.
- Never run `npm run goldens:regen`.
- Public repository. No secrets, no private material.
- Where the spec is silent on a *rule*, raise it. Do not invent one.
