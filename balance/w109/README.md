<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# W109 run records — god action 16, `invite scholar`

Committed so the measurement in `balance/results-w109-alliances.md` can be bisected
rather than re-run on trust, which is the same reason `balance/w99/` exists.

- `w109-*.summary.json` — one per arm, as `run-sweep.mjs` wrote it.
- `w109-runs.csv` — every run of every arm, distilled to the columns the results
  document quotes, plus `invitations` (favor spent on action 16 divided by its
  authored price) which is the one column no §7 metric carries.

Every arm is 100 runs at a 2400-tick horizon, `sweepId` `w109-alliance-v1`,
`rootSeed` 20260813, one strategy per arm. Arms sharing a `(cellIndex,
replicateIndex)` share a `runSeed` — the pairing `scripts/w109-analyse.mjs` verifies
before it prints a paired table.

The arms, and what each is for:

| arm | founding | strategy | what it answers |
|---|---|---|---|
| `draconic-abstainer` | default | `alliance-abstainer` | the shipped baseline |
| `draconic-seeker` | default | `alliance-seeker` | can draconic reach the gate at all? (no) |
| `draconic-gated-abstainer` | `foundingPortalMagic: 1` | `alliance-abstainer` | is the seeded node itself the cause? (no) |
| `draconic-gated-seeker` | `foundingPortalMagic: 1` | `alliance-seeker` | what is the invitation worth once legal? (0 → 14/100) |
| `draconic-gated-bodies` | `foundingPortalMagic: 1`, `foundingMages: 6` | `alliance-abstainer` | headcount or curiosity? (headcount) |

Reproduce any arm with:

    node packages/mc-harness/bin/run-sweep.mjs \
      --scenario ./packages/scenario/bin/scenario.mjs \
      --sweep balance/sweeps/w109-<arm>.sweep.json \
      --out <dir> --workers 6

and compare two with:

    node scripts/w109-analyse.mjs --control <label>=<dir> --arm <label>=<dir>
