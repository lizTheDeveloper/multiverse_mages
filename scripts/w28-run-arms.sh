#!/usr/bin/env bash
# Multiverse Mages — Copyright (C) 2026 Ann Kelner
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# W28: run all seven tradition arms on ONE content set, so the four new regimes
# and the three v1 traditions are directly comparable.
#
# The three W13 arms are re-run rather than quoted. Adding four traditions moved
# every tradition's interned id (true-naming 2 -> 5), and the honest way to find
# out whether that moved anything is to measure it rather than to assume it did
# not. All seven sweep files share `sweepId` w13-tradition-v1 and `rootSeed`
# 20260811 with a single-level `tradition` factor, so every arm draws cellIndex 0
# and the same seeds and strategy assignment: common random numbers.

set -euo pipefail
cd "$(dirname "$0")/.."

ARMS=(
  "vancian:balance/sweeps/w13-tradition-vancian.sweep.json:mc-results/w28-vancian"
  "true-naming:balance/sweeps/w13-tradition-true-naming.sweep.json:mc-results/w28-true-naming"
  "art-of-memory:balance/sweeps/w13-tradition-art-of-memory.sweep.json:mc-results/w28-art-of-memory"
  "chorale:balance/sweeps/w28-tradition-chorale.sweep.json:mc-results/w28-chorale"
  "flesh-codex:balance/sweeps/w28-tradition-flesh-codex.sweep.json:mc-results/w28-flesh-codex"
  "shared-mind:balance/sweeps/w28-tradition-shared-mind.sweep.json:mc-results/w28-shared-mind"
  "witch-bond:balance/sweeps/w28-tradition-witch-bond.sweep.json:mc-results/w28-witch-bond"
)

for arm in "${ARMS[@]}"; do
  name="${arm%%:*}"
  rest="${arm#*:}"
  sweep="${rest%%:*}"
  out="${rest#*:}"
  echo "=== arm ${name} starting $(date -u +%H:%M:%S) ==="
  node packages/mc-harness/bin/run-sweep.mjs \
    --scenario ./packages/scenario/bin/scenario.mjs \
    --sweep "./${sweep}" \
    --out "./${out}" \
    --workers 8
  echo "=== arm ${name} done $(date -u +%H:%M:%S) ==="
done
echo "ALL SEVEN ARMS COMPLETE"
