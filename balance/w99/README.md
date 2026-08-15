<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W99 run records

Taken on `main` at `e2a15cf`, scenario build `0.3.0`, record format 3, content revision
`162f80bf169296d0e5fd516cc3c5257a`. Read `balance/results-w99-tradition-species.md` for what they
mean.

- `w99-runs.csv` — one row per run, all ten arms, 1,000 rows. Carries the four seed coordinates and
  the derived `runSeed`, so any row can be re-executed alone with
  `packages/mc-harness/bin/reproduce-run.mjs`.
- `w99-<arm>.summary.json` — each arm's sweep summary, including `configurationHash`, the status and
  terminal-reason folds, the metric aggregates with their standard errors, and the `provenance`
  block that pins the content hash and observation layout digest.
- `w99-all-six-n200.summary.json` — the all-six control was executed at 200 replicates and truncated
  to its first 100 records for the tables, so that every arm carries the same seeds. This is the
  full 200-run summary; its `ascensionRate` agrees at 0.2000.

**Why these are committed when no previous measurement's were.** `docs/design/tradition-sweep.md`
and `balance/results-integration-r2.txt` both point at scratchpad paths that no longer exist. When
their numbers stopped reproducing — and they have — there was no way to tell which of the
eighty-three intervening commits moved them. 376 KB is a cheap price for not repeating that.
