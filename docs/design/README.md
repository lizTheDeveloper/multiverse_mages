<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# `docs/design/` — what is in here, and what each thing is worth

Nineteen documents, eight of them over five hundred lines. Two audits have been commissioned in this
project that re-derived work already sitting in this directory, because the existing work was
invisible. This index exists to make that mistake cost one file read.

Every document is one of three things:

- **Authoritative** — a decision. If code disagrees with it, the code is wrong or the document
  needs amending on purpose.
- **Measured** — a record of something that was run and observed. It ages; it does not get
  rewritten. Check the build it was taken at before quoting a number.
- **Deferred** — a decision made early for a release that has not arrived. Correct, and not yet
  scheduled.

Read in this order. The first four are the ones you cannot skip.

## Start here

| # | document | kind | what it is |
|---|---|---|---|
| 1 | [`vision.md`](vision.md) | **authoritative** | The vision of record. Every OpenSpec change traces to a section; §11's roadmap is how *"did the vision get built?"* is answered. Amended 2026-08-12 in §3, §4, §4b, §7, §7a, §8, §8a, §8b, §11, §12, §13. |
| 2 | [`contracts.md`](contracts.md) | **authoritative** | Normative. The interface layer every package is built against — state schema, content schemas, primitive semantics, metric registry. Where this and a capability spec disagree, this wins. |
| 3 | [`release-plan.md`](release-plan.md) | **authoritative** | Version numbers, the MINOR-parity rule, and the falsifiable claim each release makes. |
| 4 | [`invariants.md`](invariants.md) | **authoritative** | What must never stop being true after the release that establishes it, with how each is checked. Read its own opening caveat: the enforcement column describes machinery still to be built. |

## The author's design, recorded but not yet specified

These extend the vision and are written from the author's direction. Nothing in them is an agent's
invention; nothing in them is in `openspec/` yet either.

| # | document | kind | what it is |
|---|---|---|---|
| 5 | [`raid-engagement.md`](raid-engagement.md) | **authoritative** | What a player actually does during a raid. Amends and repeals `vision.md` §3's frozen-policy rule. Part II covers raid space, targeting, rewind and information asymmetry. §0a records which tradition it assumes. |
| 6 | [`ages-of-magic.md`](ages-of-magic.md) | **authoritative** | The progression spine: compounds, colleges, publish-or-perish, alliances, familiarity, necromancy. §0 records which tradition it assumes. |
| 7 | [`hard-magic.md`](hard-magic.md) | synthesis | Why the species do not yet matter, extrapolated from the vision, the content data and the voice banks. A reading of shipped material, not a decision. |
| 8 | [`metric-constants.md`](metric-constants.md) | **authoritative** | Every free parameter the §7 metric definitions had to invent, in one place, with the question each answers. |

## Measured — records, not arguments

Newest instrument first. Each states the build it was taken at; a number quoted without that build
is not a number.

| # | document | kind | what it is |
|---|---|---|---|
| 9 | [`campaign-plan.md`](campaign-plan.md) | **measured**, partly self-superseded | The running log of the strategy campaign: diagnosis, workstreams, results, and its own corrections. The corrections are the value — dated notes supersede claims in place rather than deleting them. Longest document here; read the headings. |
| 10 | [`strategy-dimensionality.md`](strategy-dimensionality.md) | **measured** | 96 + 168 runs at `6e5ecee`. The strategy space has roughly one effective dimension, and why. |
| 11 | [`value-sensitive-acquirer.md`](value-sensitive-acquirer.md) | **measured** | What fixing the value-blind acquirer moved, and what it did not, on W15's instrument verbatim. |
| 11a | [`research-cost-variation.md`](research-cost-variation.md) | **measured** | 84 + 84 runs. What giving `researchCost` a within-tier price curve bought: a null on strategy dimensionality, in the mildly adverse direction, and the arithmetic saying why it could only ever be small. |
| 12 | [`probable-strategies.md`](probable-strategies.md) | **measured**, superseded in part | The first eight-strategy sweep. Two confounds are live in its numbers and it says so up front; W18 later found three defects in the campaign's instruments. Read the caveat before the tables. |
| 13 | [`vision-audit.md`](vision-audit.md) | **measured**, stale on the vision's text | Which vision claims are wired, at `6e5ecee` (2026-08-11), with evidence per row. Its reachability findings still hold; its §3, §11, §12 and §13 rows audit sentences since amended. See the note at its head. |
| 14 | [`economy-flow-models.md`](economy-flow-models.md) | research synthesis | W31's survey of formal economy-design languages. Concludes Machinations fits this game unusually well, and names what the literature does not supply. |
| 15 | [`interface-findings.md`](interface-findings.md) | **measured** | What eleven interface prototypes found that the contracts do not carry. Not a specification; each entry says where the finding should land. |

## Deferred — decided early, scheduled late

| # | document | kind | what it is |
|---|---|---|---|
| 16 | [`sound-design.md`](sound-design.md) | **deferred** | Audio direction, and §3.1's bar-and-subdivision model of the world tick, which the vision now cites as a design claim rather than a musical one. The renderer is 0.13.0. |
| 17 | [`art-plan.md`](art-plan.md) | **deferred** | How the game gets a visual identity. Nothing is generated until the balance numbers settle. |
| 18 | [`marketing-page.md`](marketing-page.md) | **deferred** | What the public page says and shows. |
| 19 | [`content/spell-glosses.md`](content/spell-glosses.md) | drafts | Spell gloss drafts in the institutional register. Not authored content; nothing here is in `node.json`. |

## Not in this directory

- `openspec/` — the changes and capability specs. `openspec list` is authoritative for progress;
  `vision.md` §11 restates it and can drift.
- `docs/devops/` — CI, deployment and error tracking.
- `CLAUDE.md` at the repository root — the working rules for agents, including the worktree and
  public-repository constraints.
