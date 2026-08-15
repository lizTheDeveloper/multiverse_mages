<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Anti-requisites — the first mechanic that costs the permissive strategy something

**Status: implemented and re-measured. First recorded 2026-08-14 on branch `anti-requisites`
against `main` @ `e2a15cf`; **re-measured 2026-08-14 on the merge of `main` @ `9cfe582`**, which is
the tree this page now describes.** `vision.md` is the vision of record; this implements §4b and closes
one of §13's open questions.

## The decision §13 left open

§4b fixes the rule — **per mage, reason-bearing, symmetric because the reason is, checked against
the mage's held set and never the universe's**. §13 left the content shape open:

> The content shape is also open: an anti-requisite is the mirror of a prerequisite and `node.json`
> has only the latter, so whether exclusion is authored on nodes, on cells, or on a **named school
> region** is undecided.

**It is cells**, and the third option was not a close call: no `school` entity exists anywhere in
`content` or `state`, so a named school region would invent a concept the codebase has never had.
Cells is also how §4b speaks — *"if you use light magic you can't also use dark magic"* is a claim
about bodies of magic, not about individual workings.

## What was built

### The content shape

`cell.json` gains an optional `excludes` array. Each entry carries `cell`, `reason`, and
`resolution`.

**`resolution` is authored per exclusion rather than fixed globally**, and that follows §4b's own
*"every exclusion carries its reason"*: if the reason varies, what happens should vary with it.

- **`refused`** — the acquisition never happens. A wall.
- **`destructive`** — the acquisition succeeds and destroys every instance of the excluded body of
  magic that mage holds. If hers was the universe's last copy, the node is *gone*.

### What the loader refuses

- **A one-sided edge.** The loader does **not** synthesise the mirror. The `reason` is the half that
  would be fabricated, and a generated mirror always looks symmetric while proving nothing.
- **Halves that disagree** on reason or on resolution. That is what a half-finished edit looks like,
  and taking either side would be a coin flip deciding whether a mage loses her holdings.
- **A cell excluding itself**, and **any `intellego` cell on either side** — §4b rules the
  perception trunk out, since excluding it costs a mage two-thirds of the grid rather than a school.

### Where enforcement lives, and the site that decided it

**Five** things put a node in a mage's head: a founding grant, research, teaching, scribing read
back, and **raid theft**. Four route through `CoordinatingKnowledgeGateway` — which is where a
frontier filter would naturally live. The fifth does not: `rules-raid`'s `consequences.ts` calls
`createInstance` directly into `LOCATION_KIND.mind`.

So a frontier-only check would be **launderable**: *steal the school you are forbidden*, and the
exclusion never fires. That is not an exotic edge case — it is a strategy, and one a learned agent
would find while a human reviewer read the filter and believed it.

The check therefore sits on **`createInstance`**, the one place all five converge, and the same
place `contracts.md` §1.5's ever-known write already sits for the same stated reason: *"first
instance is a fact about the index, not about which operation happened to produce it."*

**Only held locations are checked.** §4b excludes what a *mage* may hold; a library is an
institution, and a civilization keeping both books is exactly what §4b says a civilization is *for*.
Checking shelves would make the first authored exclusion start burning archives nobody learned from.

**One acquisition path is not covered, deliberately, and it is worth naming.** `raids.ts` resolves
`attacker = outbound ? local : rival`. The local participant's subsystem is built with the exclusion
resolver, so this universe is checked whenever it is the one acquiring — which is every outbound
raid, and it never acquires on an inbound one. The rival stand-in built by `rival-universe.ts` is
not, so a rival mage stealing on an *inbound* raid is unchecked. `buildRival` is called per raid and
its world is discarded when the portal closes, so nothing it acquires persists; what it can still
move is that one engagement's loot and the `RaidRecord` metrics derived from it. Wiring it is a
one-argument change and is left out of this branch on purpose, because it would alter the rival's
behaviour and this branch's whole claim is about which measurements moved.

### What ships

One pair: **`creo-ignem` ⊥ `creo-umbra`, `destructive`** — §4b's own example, and the pair
`content/deep-magic` authors nodes for.

**Authoring a pair was forced rather than chosen.** The plan was to ship the machinery with zero
pairs so no baseline moved. `schema-constraint-liveness` refused: it proves each schema constraint
by finding shipped content the constraint applies to, mutating it, and asserting the load fails *for
that reason*. A schema nothing instantiates cannot be proven live, and an unproven constraint is
precisely the decoration that file exists to catch. The meta-test was right and the plan was wrong.

## What it measured

`npm run test`, on the merged tree: **4,545 of 4,546 passing, 327 files, one failure** — and the
failure is a finding rather than a break. `ablation-reaches-the-world-loop.test.ts` runs
`permissive-breadth`, the one strategy this mechanic bites, and asserts as a coda that the ablated
arm's population *equals* the control's, so that the loss it measures reads as a loss rather than a
collapse. On this tree it reads 300 against 298. Both of that test's substantive assertions still
hold — the ablated arm still ends with strictly fewer knowledge instances and strictly fewer
grimoires — and the incidental equality does not. It is left failing rather than relaxed: whether
a two-mage divergence in a knock-on population is acceptable, or whether that assertion should
never have been an equality, is a call for the owner and not one to make inside a merge.

Two committed payloads were re-recorded rather than edited, both because `contentRevision` moved:

| payload | command | what moved |
|---|---|---|
| `ui/session.json` | `npm run ui:record` | `provenance.snapshotHash` `f6974848cef4578c` → `29770a4e48b7175b`, **and nothing else** — all 401 frames, the action log, the layout and the content block are identical. `contentRevision` sits in `SimState`'s hashed header, so the hash moves while the run does not. |
| `ui/design-dashboard/data.json` | `npm run ui:dashboard` | `provenance.contentRevision`, plus two `reachability.unreached[].line` numbers in `packages/rules-magic/src/grid.ts` (486 → 545, 137 → 175) — line drift from this branch's own edits to that file. Finding count, names and files are unchanged. |


All three balance gates report `baseline-invalid` on `contentHash` — correctly, since the content
did change. No baseline is re-recorded. The deltas below are measurements.

### The reference gates: byte-identical

| gate | metrics | every delta |
|---|--:|---|
| `balance-gate` (240 world ticks) | 10 | **0.00000** |
| `balance-gate-horizon` (2400 world ticks) | 10 | **0.00000** |

Both halves of the shipped pair are `creo`, and the v1 rectangle is `intellego · perdo · rego` ×
`mentem · terram · limen · nomen`. The reference universe **cannot reach either cell**. The mechanic
is live and the reference run cannot see it — the claim, measured rather than asserted.

### The agency gate: the mechanic bites, and it bites exactly one strategy

The agency pool permits the full grid, so unlike the reference universe it *can* reach `creo`.

`referenceNodesKnown`, 240 world ticks, 64 runs:

| strategy | baseline | current | delta |
|---|--:|--:|--:|
| `portal-rush` | 45.75 | 45.75 | 0.00 |
| `uniform-random-legal` | 44.50 | 44.50 | 0.00 |
| `archivist` | 43.88 | 43.88 | 0.00 |
| **`permissive-breadth`** | 68.50 | **42.00** | **−26.50** (−22.35 SE) |
| `worship-maximizer` | 40.88 | 40.88 | 0.00 |
| `passive-control` | 40.63 | 40.63 | 0.00 |
| `narrow-depth` | 7.63 | 7.63 | 0.00 |
| `denial-warden` | 5.75 | 5.75 | 0.00 |

**Seven of eight strategies are byte-identical. The eighth loses 39% of its knowledge** — and the
rows are printed in the *new* order on purpose: `permissive-breadth` was first and is now fourth.

Byte-identity is the whole claim, so it is checked as one rather than read off the pass/fail column
— a row can pass a three-SE tolerance while moving (`referenceGrimoires@permissive-breadth` moved
+25.0 and passed at 1.66 SE). Across all ten metrics, every row for the other seven strategies
reads `delta 0.00000`; the only non-zero rows in the whole gate are pooled aggregates and
`@permissive-breadth`.

**Why these numbers differ from the first recording.** The table above previously read
75.25 → 45.00, −30.25. Nothing about the mechanic changed: `main` re-recorded the agency baseline
in `5a1ce6c` for `apply-magic`, which moved `permissive-breadth`'s baseline from 75.25 to 68.50 and
the passive control's from 42.13 to 40.63. Running the gate on `main` @ `9cfe582` alone reproduces
the committed baseline with **every delta 0.00000**, which is the positive control that makes the
comparison above a statement about anti-requisites and not about the merge.

This is the result the campaign has been asking for since W24, and it is worth stating precisely
because it is easy to overclaim. F3 measured the strategy space as **one axis — permit more vs
permit less** — with `permissive-breadth` strictly dominant (75.25 nodes against a 42-node passive
control when F3 measured it; 68.50 against 40.63 on this tree, after `apply-magic` re-recorded the
baseline). `campaign-plan.md` records five independent confirmations that the binding constraint is
content exhaustion and *the absence of opposing terms*, and W24's rule: **"without an opposing term
siting is a ranking, not a decision."**

An anti-requisite is an opposing term, and it is aimed at exactly the strategy that had none.
Permitting everything no longer means *getting* everything: a mage who learns one side of an
exclusion loses the other, so a permissive god now has a composition problem where he previously had
a monotone accumulation. Measured, the dominant strategy's lead over the passive control falls from
**+27.9 nodes to +1.4**, and on this metric it stops being the leading strategy at all — three
others now finish ahead of it.

**One authored pair did that.** The set in `content/deep-magic` proposes more.

### What is not claimed

- **That the strategy space now has two axes.** It has one axis with a cost on one end. Whether a
  *different* strategy now wins is a tournament question, and the honest instrument is a round-robin
  at 2400 ticks, not this gate.
- **That −26.50 is the right magnitude.** It is one pair, `destructive`, on two cells with 9 nodes
  between them, at `tuningStatus: "untuned"`. A 40% loss may well be too harsh; it is a balance
  decision and the number to argue over is now measured rather than hypothetical.
- **That the reference universe is unaffected in principle.** It is unaffected *because both halves
  are `creo`*. Authoring a pair inside the v1 rectangle would move every baseline, which is a
  release-scope decision.

## Open, and the ruling is the author's

1. **Which schools exclude which.** §13's question, still open — this decides the *shape* and
   authors one pair as proof. §4b requires each to carry a reason that runs both ways, so the pairs
   are a content judgement, not a derivation.
2. **`refused` or `destructive`, per pair.** Both are implemented and only `destructive` is
   exercised by shipped content. A `refused` pair would ship with a different feel: no loss, but a
   permanent fork in what a mage can become.
3. **Whether teaching should refuse before the desk.** Enforcement is at acquisition; a mage can
   currently commit effort to a node that will be refused when it completes. A frontier filter is a
   pure optimization and is *not* in this branch — it was left out deliberately, because
   implementing it before measuring would have made the enforcement path look untested.
