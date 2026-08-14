<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Anti-requisites — the first mechanic that costs the permissive strategy something

**Status: implemented and measured. Recorded 2026-08-14 on branch `anti-requisites`, measured
against `main` @ `e2a15cf`.** `vision.md` is the vision of record; this implements §4b and closes
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

### What ships

One pair: **`creo-ignem` ⊥ `creo-umbra`, `destructive`** — §4b's own example, and the pair
`content/deep-magic` authors nodes for.

**Authoring a pair was forced rather than chosen.** The plan was to ship the machinery with zero
pairs so no baseline moved. `schema-constraint-liveness` refused: it proves each schema constraint
by finding shipped content the constraint applies to, mutating it, and asserting the load fails *for
that reason*. A schema nothing instantiates cannot be proven live, and an unproven constraint is
precisely the decoration that file exists to catch. The meta-test was right and the plan was wrong.

## What it measured

`npm run test`: **4,341 passing, 309 files, zero failures.**

All three balance gates report `baseline-invalid` on `contentHash` — correctly, since the content
did change. No baseline is re-recorded. The deltas below are measurements.

### The reference gates: byte-identical

| gate | metrics | every delta |
|---|--:|---|
| `balance-gate` (240t) | 10 | **0.00000** |
| `balance-gate-horizon` (2400t) | 10 | **0.00000** |

Both halves of the shipped pair are `creo`, and the v1 rectangle is `intellego · perdo · rego` ×
`mentem · terram · limen · nomen`. The reference universe **cannot reach either cell**. The mechanic
is live and the reference run cannot see it — the claim, measured rather than asserted.

### The agency gate: the mechanic bites, and it bites exactly one strategy

The agency pool permits the full grid, so unlike the reference universe it *can* reach `creo`.

`referenceNodesKnown`, 2400 ticks:

| strategy | baseline | current | delta |
|---|--:|--:|--:|
| **`permissive-breadth`** | 75.25 | **45.00** | **−30.25** (−26.1 SE) |
| `portal-rush` | 46.13 | 46.13 | 0.00 |
| `archivist` | 44.88 | 44.88 | 0.00 |
| `uniform-random-legal` | 44.63 | 44.63 | 0.00 |
| `passive-control` | 42.13 | 42.13 | 0.00 |
| `worship-maximizer` | 41.50 | 41.50 | 0.00 |
| `narrow-depth` | 7.63 | 7.63 | 0.00 |
| `denial-warden` | 4.75 | 4.75 | 0.00 |

**Seven of eight strategies are byte-identical. The eighth loses 40% of its knowledge.**

This is the result the campaign has been asking for since W24, and it is worth stating precisely
because it is easy to overclaim. F3 measured the strategy space as **one axis — permit more vs
permit less** — with `permissive-breadth` strictly dominant at 75.25 nodes against a 42-node passive
control. `campaign-plan.md` records five independent confirmations that the binding constraint is
content exhaustion and *the absence of opposing terms*, and W24's rule: **"without an opposing term
siting is a ranking, not a decision."**

An anti-requisite is an opposing term, and it is aimed at exactly the strategy that had none.
Permitting everything no longer means *getting* everything: a mage who learns one side of an
exclusion loses the other, so a permissive god now has a composition problem where he previously had
a monotone accumulation. Measured, the dominant strategy's lead over the passive control falls from
**+33.1 nodes to +2.9**.

**One authored pair did that.** The set in `content/deep-magic` proposes more.

### What is not claimed

- **That the strategy space now has two axes.** It has one axis with a cost on one end. Whether a
  *different* strategy now wins is a tournament question, and the honest instrument is a round-robin
  at 2400 ticks, not this gate.
- **That −30.25 is the right magnitude.** It is one pair, `destructive`, on two cells with 9 nodes
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
