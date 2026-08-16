<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W9 — Octalysis analysis and the open mechanics questions

**Deliverable:** `docs/design/octalysis-and-mechanics.md`. Proposals only; no game code, nothing
under `packages/` touched.

**Build under analysis:** `integration/measured-ground` at `c02fb48`. Every file:line citation in
the deliverable is against that commit, because W6, W7 and W8 are moving the same code.

## 1. Orientation

- [x] 1.1 Branch `w9/octalysis-and-mechanics` from `origin/integration/measured-ground`; `npm ci`.
- [x] 1.2 Read in full: `campaign-plan.md`, `hard-magic.md`, `probable-strategies.md`, `vision.md`,
      `contracts.md` §7, `CLAUDE.md`.
- [x] 1.3 Read `contracts.md` §1.1 (one universe per instance; ruleset snapshot), §2.10 (raid
      constants and the termination proof), §3 (primitive stacking and caps).
- [x] 1.4 Pin the build commit so citations stay checkable after W6–W8 land.
- [x] 1.5 Take the campaign lead's correction: the game is **multiplayer and persistent**, not
      single-player-versus-environment. Task 2 Q3 replaced; Q4 (prestige carry-forward) added;
      Octalysis drive 5 reclassified from absent-by-design to specified-and-unimplemented.

## 2. Evidence gathering

- [x] 2.1 Trace the god action space, the explain channel, the observation blocks, favor costs,
      standing roles, blessing and founding grants. (subagent)
- [x] 2.2 Trace the knowledge loss channel, instance creation paths, rediscovery, the raid engine
      and `portalTargets`, species-trait readership, and the §7 metric implementations. (subagent)
- [x] 2.3 Literature legwork: game topology, EGTA, quality-diversity, diversity-aware evaluation,
      and the persistent-carry-forward problem. (subagent)
- [x] 2.4 Read the authored prestige and legacy constants in
      `packages/content/data/god-constant.json`.
- [x] 2.5 Spot-check by hand every file:line claim that carries weight in the deliverable. A public
      document does not repeat a subagent's citation unverified.
- [x] 2.6 Discard or mark as unverified any literature citation that could not be retrieved.

## 3. Task 1 — Octalysis

- [x] 3.1 For each of the eight core drives, tabulate: what the **vision promises**, what the
      **measured build does** (with evidence), and a verdict from a fixed vocabulary —
      *present* / *stubbed* / *specified-and-unimplemented* / *absent-by-roadmap* /
      *absent-by-defect*.
- [x] 3.2 Roll up the White Hat (1,2,3) versus Black Hat (6,7,8) axis.
- [x] 3.3 Roll up the Left Brain (2,4,6) versus Right Brain (3,5,7) axis.
- [x] 3.4 Test the author's reading — "strong on 1–4, absent on 5–8" — rather than restate it.
      Specifically test drive 2 against `ascensionRate` 0.79 and the idle probe's 100% win rate.
- [x] 3.5 Name where Octalysis is being applied loosely, and name at least one technique the
      octagon would suggest that this game should **not** adopt.

## 4. Task 2 — the open questions

- [x] 4.1 **Q1 — pricing the raid → ascension bonus.** Read `origin/w2/discriminating-ascension`
      and `origin/w3/ascension-routes` first: the price attaches to a predicate W6 is redesigning.
      Give 2–3 pricings, each constrained by §8a's band (0.05–0.20), the prestige bound, and
      `inboundRaidTempoLoss`. Recommend one. Name the disproof.
- [x] 4.2 **Q2 — is ~55 copies per node magnitude or structure?** Build the birth–death arithmetic
      in a scratchpad script (not game code, nothing under `packages/`), and let it decide the
      answer rather than asserting one. Report the model, its assumptions, and where it could be
      wrong.
- [x] 4.3 **Q3 — the structure of the strategy space for a persistent multiplayer game, and how to
      evaluate it.** Which multi-agent evaluation methods survive an asymmetric, non-zero-sum,
      host-arbitrated matchup, and which assume properties this game does not have.
- [x] 4.4 **Q4 — is a bounded prestige cap sufficient?** Assess the authored recurrence and the
      saturating legacy conversion against §8a's stated failure mode. Name the measurement.
- [x] 4.5 Every proposal: cite the vision section it extends, or state plainly that the vision is
      silent. Every proposal: 2–3 options, trade-offs, one recommendation.
- [x] 4.6 Every proposal: name the measurement that would show it **failing**. Prefer §7 registry
      metrics and the campaign's D1–D8; where a new measurement is genuinely needed, label it a
      measurement *request* rather than a metric this document adds.
- [x] 4.7 Mark every proposal that depends on W6, W7 or W8 with the dependency and what it would
      change.

## 5. Deliverable and close

- [x] 5.1 Write `docs/design/octalysis-and-mechanics.md` with the AGPL header, matching the house
      style of the other design docs.
- [x] 5.2 Record where the vision already answered a question this document was going to propose
      on — those are the sections where the answer is the spec's and not W9's.
- [x] 5.3 Record anything in the measured data that contradicts the framework or the vision.
- [x] 5.4 Check: no file under `packages/` modified; `goldens:regen` never run.
- [x] 5.5 Commit and push `w9/octalysis-and-mechanics`. No PR.
