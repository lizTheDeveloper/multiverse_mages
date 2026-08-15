<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- Raw output of scripts/w99-analyse.mjs on main at e2a15cf. Read
     balance/results-w99-tradition-species.md for what it means. -->

# W99 — the founding species mix

## Common random numbers, verified

    arms compared against the control: 6
    (cellIndex, replicateIndex) pairs compared: 600
    seed or strategy mismatches: 0
    distinct sweepIds: integration-r2-species-v1
    distinct rootSeeds: 20260811
    distinct factor levels across arms: 7 of 7

## Strategy coverage

    all-six         100 runs, 10 strategies, BALANCED
    draconic        100 runs, 10 strategies, BALANCED
    dwarf           100 runs, 10 strategies, BALANCED
    elf             100 runs, 10 strategies, BALANCED
    gnome           100 runs, 10 strategies, BALANCED
    human           100 runs, 10 strategies, BALANCED
    orc             100 runs, 10 strategies, BALANCED

## Table 1 — per arm

| arm | n | ascended/denom | ascensionRate | nodes known | library depth | grimoires | instances | living mages | population |
|---|---|---|---|---|---|---|---|---|---|
| **all-six** | 100 | 20/100 | 0.2000 | 73.41 ±6.85 | 37.71 ±3.23 | 228.78 ±22.82 | 3190.51 ±235.70 | 324.30 ±72.92 | 12257.90 ±840.66 |
| **draconic** | 100 | 0/100 | 0.0000 | 26.88 ±4.55 | 3.10 ±1.20 | 18.49 ±7.44 | 50.56 ±9.80 | 4.26 ±0.07 | 11.86 ±0.38 |
| **dwarf** | 100 | 2/100 | 0.0200 | 30.30 ±5.12 | 6.59 ±0.93 | 178.55 ±19.32 | 1061.28 ±219.92 | 29.56 ±10.59 | 648.48 ±148.31 |
| **elf** | 100 | 20/100 | 0.2000 | 54.03 ±4.83 | 12.10 ±2.05 | 84.18 ±14.19 | 245.35 ±21.72 | 2.84 ±0.13 | 32.46 ±1.93 |
| **gnome** | 100 | 17/100 | 0.1700 | 56.63 ±5.84 | 10.10 ±1.92 | 45.25 ±8.68 | 587.62 ±139.00 | 30.28 ±15.44 | 1374.49 ±408.01 |
| **human** | 100 | 6/100 | 0.0600 | 39.62 ±4.29 | 0.52 ±0.27 | 15.53 ±5.00 | 3415.93 ±360.62 | 174.68 ±27.27 | 4089.89 ±506.95 |
| **orc** | 100 | 2/100 | 0.0200 | 15.78 ±2.66 | 0.38 ±0.21 | 1.88 ±1.16 | 615.12 ±135.29 | 138.14 ±29.62 | 5794.95 ±844.13 |

### Terminal status counts

    all-six        {"truncated":64,"ascended":20,"stagnated":16}
    draconic       {"stagnated":83,"truncated":17}
    dwarf          {"stagnated":84,"truncated":14,"ascended":2}
    elf            {"stagnated":73,"ascended":20,"truncated":7}
    gnome          {"stagnated":75,"ascended":17,"truncated":8}
    human          {"stagnated":45,"truncated":49,"ascended":6}
    orc            {"stagnated":53,"truncated":45,"ascended":2}

## Table 2 — paired differences against `all-six`, same seed and same strategy

`**` marks a paired mean more than three paired standard errors from zero.

| arm | nodes known | library depth | grimoires | instances | living mages | population | ascended Δ |
|---|---|---|---|---|---|---|---|
| draconic | -46.53 ±5.03 ** | -34.61 ±3.26 ** | -210.29 ±23.79 ** | -3139.95 ±233.14 ** | -320.04 ±72.92 ** | -12246.04 ±840.66 ** | -20 (0 vs 20) |
| dwarf | -43.11 ±5.50 ** | -31.12 ±3.04 ** | -50.23 ±29.64 | -2129.23 ±244.98 ** | -294.74 ±70.09 ** | -11609.42 ±875.92 ** | -18 (2 vs 20) |
| elf | -19.38 ±2.68 ** | -25.61 ±3.83 ** | -144.60 ±30.63 ** | -2945.16 ±229.04 ** | -321.46 ±72.91 ** | -12225.44 ±839.94 ** | +0 (20 vs 20) |
| gnome | -16.78 ±2.41 ** | -27.61 ±3.61 ** | -183.53 ±25.56 ** | -2602.89 ±219.13 ** | -294.02 ±69.54 ** | -10883.41 ±884.69 ** | -3 (17 vs 20) |
| human | -33.79 ±4.89 ** | -37.19 ±3.27 ** | -213.25 ±23.56 ** | +225.42 ±296.05 | -149.62 ±59.60 | -8168.01 ±946.13 ** | -14 (6 vs 20) |
| orc | -57.63 ±5.34 ** | -37.33 ±3.23 ** | -226.90 ±22.92 ** | -2575.39 ±202.74 ** | -186.16 ±61.67 ** | -6462.95 ±1274.66 ** | -18 (2 vs 20) |

## Table 3 — between-arm spread against between-seed spread, stratified by strategy

`sd_between` is the standard deviation of the per-arm means inside one strategy; `sd_within` is
the standard deviation across seeds inside one arm, pooled over arms. A ratio below 1 means the
factor moves the metric less than the seed does, and a gate reading it would be reading noise.


### nodes known

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 20.28 | 13.00 | **1.56** | 24.3 | draconic 3.6, dwarf 11.8, orc 14.4, human 31.3, gnome 49.0, elf 49.8, all-six 51.0 |
| denial-warden | 0.97 | 1.17 | **0.83** | 6.9 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, all-six 1.6, dwarf 2.3 |
| idle-then-declare | 17.58 | 14.61 | **1.20** | 14.5 | orc 8.1, dwarf 13.7, draconic 29.0, human 42.5, gnome 44.8, elf 50.4, all-six 51.0 |
| narrow-depth | 1.90 | 1.16 | **1.64** | 27.0 | draconic 0.5, orc 1.2, dwarf 3.5, gnome 4.0, elf 4.8, human 5.0, all-six 5.3 |
| passive-control | 18.25 | 14.40 | **1.27** | 16.1 | orc 1.9, draconic 25.0, dwarf 25.2, human 36.6, gnome 49.0, all-six 51.0, elf 51.0 |
| permissive-breadth | 50.86 | 52.62 | **0.97** | 9.3 | orc 57.0, draconic 84.6, human 87.6, dwarf 100.6, elf 141.1, gnome 157.4, all-six 203.9 |
| permit-then-idle | 54.08 | 47.61 | **1.14** | 12.9 | orc 46.9, dwarf 83.2, draconic 90.9, human 102.1, elf 140.6, gnome 168.4, all-six 203.2 |
| portal-rush | 18.76 | 10.53 | **1.78** | 31.8 | draconic 0.9, dwarf 2.0, gnome 4.0, elf 5.1, orc 6.9, human 18.6, all-six 53.4 |
| uniform-random-legal | 16.02 | 18.25 | **0.88** | 7.7 | draconic 15.1, orc 21.1, dwarf 30.9, human 39.7, gnome 40.7, elf 46.5, all-six 62.7 |
| worship-maximizer | 19.03 | 14.90 | **1.28** | 16.3 | orc 0.3, draconic 19.2, dwarf 29.8, human 32.8, gnome 49.0, all-six 51.0, elf 51.0 |

    median ratio 1.27; 7 of 10 strategies have sd_between >= sd_within

### library depth

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 13.64 | 13.89 | **0.98** | 9.6 | draconic 0.0, human 0.1, dwarf 1.6, orc 1.9, elf 13.3, gnome 14.5, all-six 37.4 |
| denial-warden | 0.97 | 1.17 | **0.83** | 6.9 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, all-six 1.6, dwarf 2.3 |
| idle-then-declare | 16.87 | 16.36 | **1.03** | 10.6 | human 0.0, orc 1.1, dwarf 6.2, draconic 14.1, gnome 30.1, elf 34.9, all-six 40.6 |
| narrow-depth | 1.90 | 1.67 | **1.14** | 13.0 | draconic 0.0, orc 0.6, gnome 0.8, human 2.6, elf 3.3, dwarf 3.4, all-six 5.3 |
| passive-control | 15.23 | 15.02 | **1.01** | 10.3 | human 0.0, orc 0.1, draconic 4.8, dwarf 12.6, gnome 18.7, elf 32.9, all-six 37.4 |
| permissive-breadth | 29.34 | 11.75 | **2.50** | 62.4 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, dwarf 8.6, all-six 78.6 |
| permit-then-idle | 33.10 | 17.79 | **1.86** | 34.6 | elf 0.0, gnome 0.0, human 0.0, orc 0.0, draconic 7.3, dwarf 12.1, all-six 89.9 |
| portal-rush | 4.03 | 4.46 | **0.90** | 8.1 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, dwarf 0.3, all-six 10.7 |
| uniform-random-legal | 14.01 | 11.35 | **1.23** | 15.2 | orc 0.1, human 2.5, draconic 4.8, elf 6.0, dwarf 9.3, gnome 18.7, all-six 40.4 |
| worship-maximizer | 14.99 | 14.64 | **1.02** | 10.5 | draconic 0.0, human 0.0, orc 0.0, dwarf 9.5, gnome 18.2, elf 30.6, all-six 35.2 |

    median ratio 1.03; 7 of 10 strategies have sd_between >= sd_within

### grimoires

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 145.46 | 108.80 | **1.34** | 17.9 | draconic 0.0, human 0.1, orc 4.2, gnome 48.9, elf 49.5, dwarf 277.0, all-six 347.8 |
| denial-warden | 19.48 | 15.45 | **1.26** | 15.9 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, all-six 12.7, dwarf 52.1 |
| idle-then-declare | 114.05 | 130.43 | **0.87** | 7.6 | human 0.0, orc 1.1, all-six 68.2, draconic 76.9, gnome 139.4, elf 263.3, dwarf 275.2 |
| narrow-depth | 132.82 | 72.98 | **1.82** | 33.1 | draconic 0.0, orc 13.3, gnome 24.3, human 53.1, all-six 66.9, elf 96.2, dwarf 382.6 |
| passive-control | 81.78 | 115.52 | **0.71** | 5.0 | human 0.0, orc 0.1, draconic 28.8, all-six 75.8, gnome 97.7, dwarf 155.4, elf 216.9 |
| permissive-breadth | 202.74 | 115.82 | **1.75** | 30.6 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, dwarf 133.0, all-six 542.3 |
| permit-then-idle | 190.81 | 128.00 | **1.49** | 22.2 | elf 0.0, gnome 0.0, human 0.0, orc 0.0, draconic 44.3, dwarf 190.0, all-six 509.3 |
| portal-rush | 95.54 | 83.15 | **1.15** | 13.2 | draconic 0.0, orc 0.0, elf 3.6, gnome 4.0, human 65.2, dwarf 67.3, all-six 263.0 |
| uniform-random-legal | 111.95 | 103.59 | **1.08** | 11.7 | orc 0.1, elf 12.8, draconic 34.9, human 36.9, gnome 66.7, dwarf 109.6, all-six 323.8 |
| worship-maximizer | 78.43 | 101.84 | **0.77** | 5.9 | draconic 0.0, human 0.0, orc 0.0, gnome 71.5, all-six 78.0, dwarf 143.3, elf 199.5 |

    median ratio 1.26; 7 of 10 strategies have sd_between >= sd_within

### instances

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 2293.83 | 1799.66 | **1.27** | 16.2 | draconic 4.0, elf 193.6, gnome 790.7, dwarf 1375.7, orc 1771.1, human 4300.8, all-six 6144.0 |
| denial-warden | 19.48 | 15.45 | **1.26** | 15.9 | draconic 0.0, elf 0.0, gnome 0.0, human 0.0, orc 0.0, all-six 12.7, dwarf 52.1 |
| idle-then-declare | 1546.10 | 557.44 | **2.77** | 76.9 | orc 28.0, draconic 105.9, gnome 271.7, dwarf 289.9, elf 410.6, all-six 2650.9, human 3925.3 |
| narrow-depth | 131.63 | 73.11 | **1.80** | 32.4 | draconic 0.5, orc 14.8, gnome 35.0, human 72.1, all-six 114.3, elf 114.5, dwarf 385.6 |
| passive-control | 1384.06 | 695.11 | **1.99** | 39.6 | orc 6.3, draconic 53.8, dwarf 199.2, gnome 235.0, elf 369.9, all-six 2583.6, human 3342.2 |
| permissive-breadth | 2739.28 | 2441.34 | **1.12** | 12.6 | draconic 90.7, elf 466.5, gnome 701.7, orc 862.2, dwarf 3627.2, all-six 5225.5, human 7028.0 |
| permit-then-idle | 2908.03 | 2157.13 | **1.35** | 18.2 | draconic 165.5, elf 466.5, orc 842.4, gnome 1211.6, dwarf 2562.4, all-six 5494.9, human 7784.4 |
| portal-rush | 485.45 | 693.90 | **0.70** | 4.9 | draconic 0.9, gnome 4.0, elf 5.2, orc 37.4, dwarf 70.5, all-six 910.3, human 1110.0 |
| uniform-random-legal | 2145.58 | 2118.78 | **1.01** | 10.3 | elf 59.0, draconic 65.1, dwarf 1863.8, gnome 2422.7, orc 2588.1, human 3723.3, all-six 6223.3 |
| worship-maximizer | 1255.75 | 765.77 | **1.64** | 26.9 | orc 0.9, draconic 19.2, dwarf 186.4, gnome 203.8, elf 367.7, all-six 2545.6, human 2873.2 |

    median ratio 1.35; 9 of 10 strategies have sd_between >= sd_within

### living mages

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 878.45 | 333.94 | **2.63** | 69.2 | elf 3.4, draconic 4.3, dwarf 121.7, gnome 146.2, orc 568.5, human 652.6, all-six 2467.8 |
| denial-warden | 14.01 | 10.69 | **1.31** | 17.2 | dwarf 2.1, gnome 3.0, human 3.5, elf 3.8, draconic 4.6, orc 8.3, all-six 40.9 |
| idle-then-declare | 51.33 | 19.64 | **2.61** | 68.3 | dwarf 2.0, gnome 2.7, elf 2.9, draconic 3.9, orc 24.0, all-six 68.1, human 137.3 |
| narrow-depth | 5.42 | 3.44 | **1.57** | 24.8 | dwarf 2.4, gnome 2.9, elf 3.8, human 3.8, draconic 4.5, orc 6.2, all-six 17.9 |
| passive-control | 45.48 | 24.98 | **1.82** | 33.1 | dwarf 2.1, gnome 2.8, elf 3.0, draconic 4.4, orc 20.6, all-six 67.7, human 119.5 |
| permissive-breadth | 40.36 | 35.85 | **1.13** | 12.7 | elf 3.4, draconic 4.2, gnome 6.2, dwarf 29.7, orc 29.7, all-six 49.8, human 117.0 |
| permit-then-idle | 43.26 | 29.16 | **1.48** | 22.0 | elf 3.4, draconic 4.1, gnome 11.3, dwarf 23.2, orc 28.9, all-six 55.1, human 125.2 |
| portal-rush | 14.81 | 26.13 | **0.57** | 3.2 | gnome 0.0, elf 0.2, dwarf 2.4, draconic 4.3, orc 10.8, all-six 19.1, human 40.9 |
| uniform-random-legal | 240.19 | 212.83 | **1.13** | 12.7 | elf 1.2, draconic 4.0, dwarf 107.4, gnome 125.0, all-six 392.6, human 444.4, orc 610.9 |
| worship-maximizer | 42.67 | 74.85 | **0.57** | 3.3 | dwarf 2.6, gnome 2.7, elf 3.3, draconic 4.3, all-six 64.0, orc 73.5, human 102.6 |

    median ratio 1.48; 8 of 10 strategies have sd_between >= sd_within

### population

| strategy | sd_between | sd_within | ratio | F | arm means (low → high) |
|---|---|---|---|---|---|
| archivist | 5133.03 | 2228.05 | **2.30** | 53.1 | draconic 11.1, elf 46.9, human 317.9, orc 393.3, dwarf 641.9, gnome 1831.4, all-six 14023.2 |
| denial-warden | 2734.93 | 3438.30 | **0.80** | 6.3 | draconic 9.7, elf 13.6, dwarf 44.0, gnome 61.5, human 81.4, orc 93.0, all-six 7286.0 |
| idle-then-declare | 7129.80 | 3613.10 | **1.97** | 38.9 | draconic 14.0, elf 40.5, dwarf 101.7, gnome 240.8, human 8548.5, orc 10377.3, all-six 17967.1 |
| narrow-depth | 87.83 | 26.00 | **3.38** | 114.2 | draconic 10.0, elf 14.7, dwarf 39.4, gnome 55.6, orc 79.1, human 82.5, all-six 266.8 |
| passive-control | 6923.18 | 3863.81 | **1.79** | 32.1 | draconic 13.0, elf 37.8, dwarf 94.8, gnome 264.0, human 8258.8, orc 8698.6, all-six 17934.9 |
| permissive-breadth | 3982.03 | 4613.45 | **0.86** | 7.5 | draconic 12.1, elf 26.7, gnome 1524.4, dwarf 2428.3, all-six 3834.7, human 5087.9, orc 11451.6 |
| permit-then-idle | 5699.28 | 4431.00 | **1.29** | 16.5 | draconic 14.5, elf 34.3, dwarf 1655.2, all-six 1961.5, gnome 2942.9, human 7732.3, orc 15799.7 |
| portal-rush | 6503.10 | 3790.64 | **1.72** | 29.4 | draconic 10.4, elf 21.9, gnome 28.2, dwarf 37.9, human 3316.2, orc 5246.9, all-six 17742.9 |
| uniform-random-legal | 8786.63 | 3321.60 | **2.65** | 70.0 | draconic 11.1, elf 50.7, human 237.2, orc 411.3, dwarf 1324.3, gnome 6584.0, all-six 23841.6 |
| worship-maximizer | 6590.79 | 3663.25 | **1.80** | 32.4 | draconic 12.7, elf 37.5, dwarf 117.3, gnome 212.1, orc 5398.7, human 7236.2, all-six 17720.3 |

    median ratio 1.80; 8 of 10 strategies have sd_between >= sd_within

## Table 4 — ascensions per strategy, per arm

| strategy | all-six | draconic | dwarf | elf | gnome | human | orc |
|---|---|---|---|---|---|---|---|
| archivist | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| denial-warden | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| idle-then-declare | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| narrow-depth | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| passive-control | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| permissive-breadth | 10/10 | 0/10 | 1/10 | 10/10 | 9/10 | 3/10 | 2/10 |
| permit-then-idle | 10/10 | 0/10 | 1/10 | 10/10 | 8/10 | 3/10 | 0/10 |
| portal-rush | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| uniform-random-legal | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |
| worship-maximizer | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 |

### nodes known per strategy, per arm

| strategy | all-six | draconic | dwarf | elf | gnome | human | orc |
|---|---|---|---|---|---|---|---|
| archivist | 51.0 ±0.0 | 3.6 ±1.8 | 11.8 ±6.5 | 49.8 ±1.0 | 49.0 ±0.0 | 31.3 ±6.9 | 14.4 ±4.8 |
| denial-warden | 1.6 ±0.4 | 0.0 ±0.0 | 2.3 ±0.9 | 0.0 ±0.0 | 0.0 ±0.0 | 0.0 ±0.0 | 0.0 ±0.0 |
| idle-then-declare | 51.0 ±0.0 | 29.0 ±7.7 | 13.7 ±6.1 | 50.4 ±0.6 | 44.8 ±4.2 | 42.5 ±4.8 | 8.1 ±3.6 |
| narrow-depth | 5.3 ±0.4 | 0.5 ±0.2 | 3.5 ±0.5 | 4.8 ±0.2 | 4.0 ±0.3 | 5.0 ±0.0 | 1.2 ±0.6 |
| passive-control | 51.0 ±0.0 | 25.0 ±8.0 | 25.2 ±6.5 | 51.0 ±0.0 | 49.0 ±0.0 | 36.6 ±6.1 | 1.9 ±1.4 |
| permissive-breadth | 203.9 ±3.4 | 84.6 ±22.9 | 100.6 ±28.1 | 141.1 ±0.9 | 157.4 ±6.5 | 87.6 ±19.4 | 57.0 ±13.8 |
| permit-then-idle | 203.2 ±3.2 | 90.9 ±20.7 | 83.2 ±26.1 | 140.6 ±0.7 | 168.4 ±8.6 | 102.1 ±17.2 | 46.9 ±9.8 |
| portal-rush | 53.4 ±2.0 | 0.9 ±0.1 | 2.0 ±0.1 | 5.1 ±1.1 | 4.0 ±0.0 | 18.6 ±7.6 | 6.9 ±3.8 |
| uniform-random-legal | 62.7 ±0.2 | 15.1 ±1.5 | 30.9 ±7.4 | 46.5 ±3.9 | 40.7 ±8.2 | 39.7 ±8.5 | 21.1 ±4.6 |
| worship-maximizer | 51.0 ±0.0 | 19.2 ±7.5 | 29.8 ±6.9 | 51.0 ±0.0 | 49.0 ±0.0 | 32.8 ±7.2 | 0.3 ±0.3 |
