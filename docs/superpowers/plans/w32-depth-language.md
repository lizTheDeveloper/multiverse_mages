<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W32 — depth, and a language for talking about it

**Branch:** `w32/depth-language`, from `integration/campaign-round-2`. **Role:** researcher and
language designer. **Changes no constant, no rule, no magnitude, no behaviour.** Never runs
`goldens:regen`; regenerates no balance baseline. Ships documentation and, at most, a schema plus a
test that reads it.

## Why this workstream exists

The campaign has measured the same thing five times and named it five ways. `strategy-dimensionality`
found a first eigenvalue of 0.914, a participation ratio of 1.19, cross-strategy containment 1.000
and prefix fidelity 0.943. `integration-round-2-results` found `permit-then-idle` winning 40/40
against every bot that actually plays. Six mechanics landed; every one of them worked; none moved
the number.

Those are not five findings. They are one finding, and the reason it took five workstreams to say so
is that **the project has no vocabulary for it.** Each measurement invented a metric, and an invented
metric cannot be compared with the invented metric next door. The literature on this has names, and
some of the names come with thresholds, null models and known failure modes that our ad-hoc versions
do not carry.

So: find the research, decide what genuinely transfers to a player who cannot execute, and turn the
part that survives into a notation the specs and the test suite can share.

## Deliverables

| # | file | what it is |
|---|---|---|
| 1 | `docs/design/depth-and-skill.md` | the research synthesis: vocabulary, our measures renamed, what produces depth, and three case studies |
| 2 | `docs/design/design-language.md` | the design language: a claims vocabulary with a decision procedure per claim |
| 3 | `docs/superpowers/plans/w32-depth-language.md` | this file |

## Pre-registered structure, written before the research came back

Recorded so that a synthesis shaped around whatever turned up cannot be presented as a plan.

### For deliverable 1

1. **The vocabulary**, defined precisely, each term carrying the distinction that makes it worth
   having: *depth* vs *complexity*, *skill chain* vs *skill ceiling*, *dominated* vs *dominant*,
   *transitive* vs *cyclic*, *degenerate*, *solved*.
2. **Our measures, renamed.** Prefix fidelity and cross-strategy containment are almost certainly
   instances of named measures from other fields. Name them, cite the naming, and report the
   caveat the established version carries that ours does not.
3. **What the research says produces depth**, and which of those levers this build has.
4. **What does not apply.** Most of this literature assumes symmetric multiplayer with direct
   player control. Our player is a god who cannot command anyone. A lever that assumes execution
   will read as available and is not.
5. **Three case studies** — StarCraft, Magic: The Gathering, Vampire Survivors — each sorted by
   whether its depth survives the loss of execution.

### For deliverable 2

The language must **extend four grains that already exist in this repository**, not compete with
them. Each is a place where the project already decided that a claim should be checkable:

| existing grain | where | what it establishes |
|---|---|---|
| `StrategyDefinition.hypothesis` | `packages/mc-harness/src/strategies.ts` | a claim must be a sentence that could turn out false |
| `signatureActions` + `degeneracyOf` | same file | degeneracy is **declared**, then checked — not inferred |
| `definitionVersion` + `pinnedConstants` | `packages/mc-harness/src/metrics-registry.ts` | a measure names its free parameters, and changing one is a versioned event |
| `schema-doc-agreement.test.ts` | `packages/content/test/unit/` | a document and the code may be asserted to agree, with self-deleting allowances |

A claim in the language is therefore: a **predicate over content or measurements**, a **decision
procedure** naming the metric ids that settle it, a **definitionVersion**, and a **verdict**. If a
claim cannot name what would settle it, it does not belong in the language. **A notation nobody can
check is worse than no notation.**

### Pre-registered risks

1. **The field may be thinner than the brief assumes.** If the research on depth turns out to be
   mostly position papers and designer opinion, say so plainly and give the best available frame
   rather than dressing weak sources in confident prose.
2. **The case studies are the dangerous part.** An analogy that quietly assumes execution reads
   right and sends a workstream the wrong way. Every case study claim gets sorted explicitly into
   survives-without-execution or does not.
3. **Citation discipline.** Every claim is marked as read or as recalled. This campaign has already
   withdrawn one widely-repeated citation whose abstract did not support the claim made from it,
   and one lead in this workstream's own research prompt turned out to be a fabrication that the
   researcher caught by reading the paper. Both are recorded in the synthesis.

## Findings that change the plan, recorded as they arrived

- **The content schema has no anti-requisites and no tracks.** `NodeRecord` in
  `packages/content/src/types.ts` carries `id, cell, name, gloss, tier, prerequisites, researchCost,
  teachCost, scribeCost, rediscoveryMultiplier, effects, tuningStatus` and nothing else; a repository
  grep for anti-requisites returns nothing outside this plan. The brief for this workstream said
  otherwise. The design language must therefore treat exclusion as a **thing to be added**, with the
  claim form written first, rather than as a field to be read.
- **201 of 300 nodes carry exactly one effect**, 91 carry two, 8 carry three; measured off
  `packages/content/data/node.json`. There is no composition operator at all: two effects on one node
  are two independent scalars that stack by their primitive's declared rule.
- **Participation ratio is not a measure from this literature.** The research came back unable to
  find it used in game evaluation at all; it is a localization measure from condensed-matter physics.
  Our 1.19 is not wrong, but it is ours, and the synthesis says so and offers the alternatives.

## Constraints

- Documentation, and at most a checkable schema plus a test that reads it. **No behaviour change** —
  several agents are live in `packages/`.
- `npm run verify` must pass. Some tests parse `docs/design/contracts.md`; this workstream does not
  touch it.
- Public repository. Write for an audience.
- Both design documents carry the licence header comment every file in `docs/design/` carries.

## Checklist

- [x] Branch from `integration/campaign-round-2`, `npm ci`
- [x] Survey the existing grain: content schema, primitives, metrics registry, strategy pool, the
      doc-parsing tests
- [x] Commission the research: skill chains, computational depth, strategy-space geometry, the
      renaming question, the three case studies
- [x] Commit and push this plan
- [x] Write `docs/design/depth-and-skill.md`
- [x] Write `docs/design/design-language.md`
- [x] State one worked example end to end, from numbers already committed, in the new notation
- [x] `npm run verify` → exit 0, no golden fixture regenerated, no baseline regenerated
- [x] Report: the vocabulary, which of our measures already have names, what produces depth and
      which levers we lack, the DSL's shape, what could not be verified, and what in the literature
      **contradicts** a decision this campaign has already made
