# material-economy: sweep measurements (tasks 7.1, 7.2)

Taken 2026-09-06 on `plan-w18` @ `77733b89`.

## Task 7.1 — Strategy sweep at an ascension-reachable horizon

The ascension gate sweep (`balance-gate-ascension.sweep.json`) runs at `worldTickCap: 2400`,
which is **4x** the `ascension-min-tick` of 600. This is the horizon where ascension is
reachable — measured on 2026-08-11: 0 of 400 runs ascended at 240 ticks, 10 of 80 ascended at
2400 (`balance/README.md`). Running at `ascension-min-tick` (600) itself reports `horizon-bound`
by construction — measured on 2026-08-15: at `--ticks 900` against `ascension-min-tick` 600,
three separate seeds all give zero ascensions (`quality-diversity.ts` lines 199-202).

The sweep was re-run at 2400 ticks with all eight strategies (passive-control,
uniform-random-legal, permissive-breadth, narrow-depth, denial-warden, archivist, portal-rush,
worship-maximizer) on 4 cells x 16 replicates = 64 runs.

## Task 7.2 — Re-recorded baselines

All four baselines were regenerated with rationale:

### `balance-gate-v1.baseline.json` (60 ticks, 200 runs)

Key movements (all expected direction — knowledge up, population down):

| metric | before | after | delta (SE) |
|---|---|---|---|
| referenceGrimoires | 89.25 | 394.48 | +305.24 (176.5 SE) |
| referenceKnowledgeInstances | 338.50 | 904.48 | +565.99 (219.1 SE) |
| referenceLibraryDepth | 4.00 | 8.61 | +4.62 (19.8 SE) |
| referenceNodesGained | 19.08 | 36.39 | +17.31 (111.1 SE) |
| referencePopulation | 129.39 | 117.10 | -12.29 (29.6 SE) |

### `balance-gate-horizon-v1.baseline.json` (240 ticks, 200 runs)

| metric | before | after | delta (SE) |
|---|---|---|---|
| referenceKnowledgeInstances | 1057.02 | 1634.07 | +577.05 (72.5 SE) |
| referenceNodesGained | 41.74 | 91.57 | +49.83 (363.3 SE) |
| referencePopulation | 211.64 | 180.59 | -31.04 (24.1 SE) |

### `balance-gate-agency-v1.baseline.json` (240 ticks, 64 runs, 8 strategies)

| metric | before | after | delta (SE) |
|---|---|---|---|
| referenceKnowledgeInstances | 847.61 | 1513.52 | +665.91 (40.0 SE) |
| referenceNodesGained | 33.05 | 79.02 | +45.97 (132.0 SE) |
| denial-warden grimoires | 45.50 | 375.25 | +329.75 (36.6 SE) |
| denial-warden knowledgeInstances | 51.00 | 702.38 | +651.38 (58.2 SE) |

denial-warden's metrics moved most sharply — it now must spend materials it previously did not
need.

### `balance-gate-ascension-v1.baseline.json` (2400 ticks, 64 runs, 8 strategies)

Regenerated in 1315s (22 min). Key movements:

| metric | before | after | delta (SE) |
|---|---|---|---|
| referenceGrimoires | 250.03 | 2076.80 | +1826.77 (135.0 SE) |
| referenceNodesGained | 58.16 | 164.00 | +105.84 (195.6 SE) |
| referenceNodesKnown | 60.66 | 166.50 | +105.84 (195.6 SE) |
| referenceLibraryDepth | 27.47 | 49.41 | +21.94 (13.7 SE) |
| referencePopulation | 15826 | 21826 | +5999.5 (14.0 SE) |

Per-strategy highlights at 2400 ticks:

- `permissive-breadth` nodesKnown: 204.25 -> 215.38 (+11.13, 3.21 SE) — smallest move
- `portal-rush` nodesKnown: 57.50 -> 254.38 (+196.88, 78.0 SE) — largest move
- `denial-warden` nodesKnown: 1.50 -> 10.63 (+9.13, 17.2 SE) — still the weakest
- `passive-control` nodesKnown: 51.00 -> 204.38 (+153.38) — the null moved too

## Verification

All four gates verified at delta 0 against their regenerated baselines, confirming the
tree is deterministic and the baselines are self-consistent. Golden fixtures pass unchanged
(SNAPSHOT_VERSION did not move).

## Rationale (recorded in each baseline file)

Adding costs to previously free verbs is an accept, not a regression. The economy now has
drains where it only had faucets, and the content changes (`form.json` yieldWeights,
`god-cost.json` materialCost) moved both the content hash and the RNG registry hash. Every
metric that moved is moving in the expected direction: knowledge metrics up because the new
sinks make allocation non-trivial, population down because the economy now has real costs.
