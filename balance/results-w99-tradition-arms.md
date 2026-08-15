<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- Raw output of scripts/w99-analyse.mjs on main at e2a15cf. Read
     balance/results-w99-tradition-species.md for what it means. -->

# W99 — the tradition axis

## Common random numbers, verified

    arms compared against the control: 2
    (cellIndex, replicateIndex) pairs compared: 200
    seed or strategy mismatches: 0
    distinct sweepIds: integration-r2-v1
    distinct rootSeeds: 20260811
    distinct factor levels across arms: 3 of 3

## Strategy coverage

    true-naming     100 runs, 10 strategies, BALANCED
    vancian         100 runs, 10 strategies, BALANCED
    art-of-memory   100 runs, 10 strategies, BALANCED

## Table 1 — per arm

| arm | n | ascended/denom | ascensionRate | nodes known | library depth | grimoires | instances | living mages | population |
|---|---|---|---|---|---|---|---|---|---|
| **true-naming** | 100 | 20/100 | 0.2000 | 73.47 ±6.84 | 39.78 ±3.59 | 224.45 ±22.38 | 3217.56 ±236.62 | 328.12 ±74.50 | 12314.92 ±852.81 |
| **vancian** | 100 | 20/100 | 0.2000 | 76.62 ±7.81 | 27.00 ±2.12 | 140.36 ±12.85 | 2824.16 ±210.78 | 355.12 ±80.84 | 12014.06 ±866.45 |
| **art-of-memory** | 100 | 0/100 | 0.0000 | 21.36 ±1.04 | 0.00 ±0.00 | 0.00 ±0.00 | 858.25 ±114.58 | 373.78 ±87.52 | 13316.67 ±842.40 |

### Terminal status counts

    true-naming    {"truncated":65,"ascended":20,"stagnated":15}
    vancian        {"truncated":63,"ascended":20,"stagnated":17}
    art-of-memory  {"stagnated":27,"truncated":73}

## Table 2 — paired differences against `true-naming`, same seed and same strategy

`**` marks a paired mean more than three paired standard errors from zero.

| arm | nodes known | library depth | grimoires | instances | living mages | population | ascended Δ |
|---|---|---|---|---|---|---|---|
| vancian | +3.15 ±1.38 | -12.78 ±3.88 ** | -84.09 ±19.10 ** | -393.40 ±101.78 ** | +27.00 ±14.73 | -300.86 ±375.56 | +0 (20 vs 20) |
| art-of-memory | -52.11 ±6.55 ** | -39.78 ±3.59 ** | -224.45 ±22.38 ** | -2359.31 ±184.52 ** | +45.66 ±16.90 | +1001.75 ±870.40 | -20 (0 vs 20) |

## Table 3 — between-arm spread against between-seed spread, stratified by strategy

`sd_between` is the standard deviation of the per-arm means inside one strategy; `sd_within` is
the standard deviation across seeds inside one arm, pooled over arms. A ratio below 1 means the
factor moves the metric less than the seed does, and a gate reading it would be reading noise.


### nodes known

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 12.30 | 1.36 | **9.03** | 815.0 | art-of-memory 29.7, true-naming 51.0, vancian 51.0 |
| denial-warden | 1.10 | 0.97 | **1.13** | 12.8 | art-of-memory 0.0, vancian 1.6, true-naming 2.1 |
| idle-then-declare | 14.43 | 1.47 | **9.85** | 969.8 | art-of-memory 26.0, true-naming 51.0, vancian 51.0 |
| narrow-depth | 1.00 | 1.11 | **0.90** | 8.1 | art-of-memory 3.0, true-naming 4.5, vancian 4.9 |
| passive-control | 14.03 | 1.52 | **9.25** | 855.8 | art-of-memory 26.7, true-naming 51.0, vancian 51.0 |
| permissive-breadth | 112.12 | 11.00 | **10.19** | 1038.5 | art-of-memory 22.6, true-naming 202.0, vancian 228.8 |
| permit-then-idle | 111.23 | 12.13 | **9.17** | 841.4 | art-of-memory 22.9, true-naming 204.6, vancian 224.9 |
| portal-rush | 15.24 | 4.09 | **3.72** | 138.7 | art-of-memory 26.9, vancian 51.0, true-naming 55.1 |
| uniform-random-legal | 16.98 | 1.64 | **10.37** | 1075.0 | art-of-memory 29.0, vancian 51.0, true-naming 62.4 |
| worship-maximizer | 13.97 | 1.86 | **7.50** | 563.1 | art-of-memory 26.8, true-naming 51.0, vancian 51.0 |

    median ratio 9.17; 9 of 10 strategies have sd_between >= sd_within

### library depth

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 20.29 | 15.17 | **1.34** | 17.9 | art-of-memory 0.0, vancian 32.5, true-naming 37.3 |
| denial-warden | 1.10 | 0.97 | **1.13** | 12.8 | art-of-memory 0.0, vancian 1.6, true-naming 2.1 |
| idle-then-declare | 25.02 | 4.87 | **5.14** | 264.0 | art-of-memory 0.0, vancian 42.3, true-naming 44.3 |
| narrow-depth | 2.66 | 1.15 | **2.31** | 53.2 | art-of-memory 0.0, true-naming 4.4, vancian 4.8 |
| passive-control | 22.08 | 11.05 | **2.00** | 39.9 | art-of-memory 0.0, vancian 37.2, true-naming 39.2 |
| permissive-breadth | 41.23 | 34.01 | **1.21** | 14.7 | art-of-memory 0.0, vancian 20.4, true-naming 79.4 |
| permit-then-idle | 54.38 | 25.67 | **2.12** | 44.9 | art-of-memory 0.0, vancian 8.4, true-naming 98.1 |
| portal-rush | 19.93 | 9.03 | **2.21** | 48.7 | art-of-memory 0.0, true-naming 14.5, vancian 39.4 |
| uniform-random-legal | 24.10 | 7.17 | **3.36** | 112.9 | art-of-memory 0.0, true-naming 36.5, vancian 45.5 |
| worship-maximizer | 23.16 | 6.90 | **3.35** | 112.5 | art-of-memory 0.0, vancian 37.9, true-naming 42.0 |

    median ratio 2.21; 10 of 10 strategies have sd_between >= sd_within

### grimoires

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 213.89 | 129.52 | **1.65** | 27.3 | art-of-memory 0.0, vancian 194.2, true-naming 427.2 |
| denial-warden | 7.57 | 6.45 | **1.17** | 13.8 | art-of-memory 0.0, true-naming 12.7, vancian 13.5 |
| idle-then-declare | 44.11 | 12.13 | **3.63** | 132.1 | art-of-memory 0.0, true-naming 66.8, vancian 83.3 |
| narrow-depth | 40.43 | 14.65 | **2.76** | 76.2 | art-of-memory 0.0, true-naming 69.0, vancian 71.0 |
| passive-control | 40.32 | 17.95 | **2.25** | 50.5 | art-of-memory 0.0, vancian 67.7, true-naming 71.8 |
| permissive-breadth | 259.58 | 165.94 | **1.56** | 24.5 | art-of-memory 0.0, vancian 188.0, true-naming 513.1 |
| permit-then-idle | 221.13 | 155.99 | **1.42** | 20.1 | art-of-memory 0.0, vancian 238.3, true-naming 441.8 |
| portal-rush | 133.78 | 45.86 | **2.92** | 85.1 | art-of-memory 0.0, vancian 85.4, true-naming 262.3 |
| uniform-random-legal | 200.47 | 119.65 | **1.68** | 28.1 | art-of-memory 0.0, true-naming 305.9, vancian 377.4 |
| worship-maximizer | 46.14 | 25.65 | **1.80** | 32.4 | art-of-memory 0.0, true-naming 73.9, vancian 84.8 |

    median ratio 1.80; 10 of 10 strategies have sd_between >= sd_within

### instances

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 1421.49 | 193.70 | **7.34** | 538.5 | art-of-memory 3681.9, true-naming 6144.0, vancian 6144.0 |
| denial-warden | 7.57 | 6.45 | **1.17** | 13.8 | art-of-memory 0.0, true-naming 12.7, vancian 13.5 |
| idle-then-declare | 1079.71 | 231.86 | **4.66** | 216.9 | art-of-memory 504.0, vancian 2018.2, true-naming 2594.4 |
| narrow-depth | 49.43 | 26.41 | **1.87** | 35.0 | art-of-memory 46.0, vancian 98.5, true-naming 144.8 |
| passive-control | 1124.20 | 241.17 | **4.66** | 217.3 | art-of-memory 503.6, vancian 2076.6, true-naming 2681.4 |
| permissive-breadth | 2370.65 | 1095.18 | **2.16** | 46.9 | art-of-memory 348.5, vancian 3579.4, true-naming 4969.1 |
| permit-then-idle | 2655.80 | 1114.10 | **2.38** | 56.8 | art-of-memory 364.2, vancian 4055.2, true-naming 5517.6 |
| portal-rush | 825.84 | 333.82 | **2.47** | 61.2 | art-of-memory 440.7, true-naming 1225.4, vancian 2091.7 |
| uniform-random-legal | 2222.71 | 135.65 | **16.39** | 2685.0 | art-of-memory 2321.8, vancian 6144.0, true-naming 6198.7 |
| worship-maximizer | 1192.03 | 184.23 | **6.47** | 418.6 | art-of-memory 371.8, vancian 2020.5, true-naming 2687.5 |

    median ratio 4.66; 10 of 10 strategies have sd_between >= sd_within

### living mages

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 212.45 | 342.28 | **0.62** | 3.9 | true-naming 2513.0, vancian 2742.9, art-of-memory 2937.4 |
| denial-warden | 10.42 | 21.64 | **0.48** | 2.3 | vancian 21.9, true-naming 23.3, art-of-memory 40.6 |
| idle-then-declare | 1.81 | 10.73 | **0.17** | 0.3 | art-of-memory 63.5, vancian 65.7, true-naming 67.1 |
| narrow-depth | 9.40 | 22.18 | **0.42** | 1.8 | vancian 23.3, true-naming 37.2, art-of-memory 41.2 |
| passive-control | 1.91 | 11.43 | **0.17** | 0.3 | art-of-memory 64.5, vancian 66.8, true-naming 68.3 |
| permissive-breadth | 9.38 | 23.46 | **0.40** | 1.6 | art-of-memory 47.1, true-naming 60.9, vancian 65.0 |
| permit-then-idle | 10.95 | 23.82 | **0.46** | 2.1 | art-of-memory 50.4, true-naming 55.9, vancian 71.5 |
| portal-rush | 23.15 | 14.54 | **1.59** | 25.3 | true-naming 25.9, art-of-memory 58.4, vancian 70.7 |
| uniform-random-legal | 15.79 | 59.83 | **0.26** | 0.7 | vancian 358.7, true-naming 360.7, art-of-memory 387.0 |
| worship-maximizer | 11.23 | 15.32 | **0.73** | 5.4 | art-of-memory 47.7, vancian 64.7, true-naming 68.9 |

    median ratio 0.46; 1 of 10 strategies have sd_between >= sd_within

### population

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 293.24 | 2224.67 | **0.13** | 0.2 | art-of-memory 13231.2, vancian 13474.6, true-naming 13815.0 |
| denial-warden | 3043.41 | 7005.86 | **0.43** | 1.9 | vancian 1998.4, true-naming 2062.5, art-of-memory 7301.5 |
| idle-then-declare | 1047.84 | 3218.54 | **0.33** | 1.1 | art-of-memory 16067.7, true-naming 17879.2, vancian 17886.0 |
| narrow-depth | 2636.49 | 8554.08 | **0.31** | 0.9 | vancian 3759.3, true-naming 7264.9, art-of-memory 8923.3 |
| passive-control | 968.30 | 3272.12 | **0.30** | 0.9 | art-of-memory 16333.4, true-naming 18004.1, vancian 18016.9 |
| permissive-breadth | 5151.89 | 5580.63 | **0.92** | 8.5 | true-naming 1545.4, vancian 2395.6, art-of-memory 10863.4 |
| permit-then-idle | 4615.17 | 5831.41 | **0.79** | 6.3 | vancian 2635.1, true-naming 2785.8, art-of-memory 10703.1 |
| portal-rush | 2027.86 | 4270.33 | **0.47** | 2.3 | art-of-memory 14326.6, vancian 17833.8, true-naming 17844.1 |
| uniform-random-legal | 247.40 | 1524.46 | **0.16** | 0.3 | true-naming 24015.7, vancian 24221.7, art-of-memory 24508.3 |
| worship-maximizer | 4051.65 | 5291.56 | **0.77** | 5.9 | art-of-memory 10908.2, vancian 17919.2, true-naming 17932.5 |

    median ratio 0.43; 0 of 10 strategies have sd_between >= sd_within

## Table 4 — ascensions per strategy, per arm

| strategy | true-naming | vancian | art-of-memory |
|---|---|---|---|
| archivist | 0/10 | 0/10 | 0/10 |
| denial-warden | 0/10 | 0/10 | 0/10 |
| idle-then-declare | 0/10 | 0/10 | 0/10 |
| narrow-depth | 0/10 | 0/10 | 0/10 |
| passive-control | 0/10 | 0/10 | 0/10 |
| permissive-breadth | 10/10 | 10/10 | 0/10 |
| permit-then-idle | 10/10 | 10/10 | 0/10 |
| portal-rush | 0/10 | 0/10 | 0/10 |
| uniform-random-legal | 0/10 | 0/10 | 0/10 |
| worship-maximizer | 0/10 | 0/10 | 0/10 |

### nodes known per strategy, per arm

| strategy | true-naming | vancian | art-of-memory |
|---|---|---|---|
| archivist | 51.0 ±0.0 | 51.0 ±0.0 | 29.7 ±0.7 |
| denial-warden | 2.1 ±0.5 | 1.6 ±0.3 | 0.0 ±0.0 |
| idle-then-declare | 51.0 ±0.0 | 51.0 ±0.0 | 26.0 ±0.8 |
| narrow-depth | 4.5 ±0.5 | 4.9 ±0.4 | 3.0 ±0.0 |
| passive-control | 51.0 ±0.0 | 51.0 ±0.0 | 26.7 ±0.8 |
| permissive-breadth | 202.0 ±2.1 | 228.8 ±5.6 | 22.6 ±0.7 |
| permit-then-idle | 204.6 ±4.0 | 224.9 ±5.3 | 22.9 ±0.5 |
| portal-rush | 55.1 ±2.1 | 51.0 ±0.0 | 26.9 ±0.7 |
| uniform-random-legal | 62.4 ±0.3 | 51.0 ±0.0 | 29.0 ±0.8 |
| worship-maximizer | 51.0 ±0.0 | 51.0 ±0.0 | 26.8 ±1.0 |
