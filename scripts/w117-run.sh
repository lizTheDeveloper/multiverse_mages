#!/usr/bin/env bash
#
# Multiverse Mages — W117: the post-unlock re-measurement, as one sequential batch.
# Copyright (C) 2026 Ann Kelner
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU Affero General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option) any
# later version. See the LICENSE file at the repository root, or
# <https://www.gnu.org/licenses/>.
#
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# GATED. Do not run this until BOTH of these are merged into origin/main:
#
#   w115/enable-all-cells       — all seventy grid cells enabled
#   w116/complete-affiliation   — completeAffiliation given a production caller
#
# Every number this produces before then describes a world that is about to stop
# existing. See docs/design/overnight-plan-2026-08-14.md for why that is a
# correctness rule and not a scheduling preference.
#
# One batch, sequential, modest workers: roughly eighty worktrees share this
# machine, and parallel arms are how the RPC-timeout noise gets manufactured.
# Editing source while this runs contaminates whichever arm is in flight.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT=balance/w117
WORKERS="${WORKERS:-4}"

# Same sweepId and rootSeed as w99, so run r of each arm is the same universe as
# run r of w99's committed records and the pairing in scripts/w99-analyse.mjs is
# legitimate rather than assumed. deriveRunSeed excludes the replicate count by
# design, so 100 replicates reproduces w99's replicateIndex 0..99 exactly.
for arm in all draconic dwarf elf gnome human orc; do
  echo "=== w117 species arm: ${arm} ==="
  node packages/mc-harness/bin/run-sweep.mjs \
    --scenario ./packages/scenario/bin/scenario.mjs \
    --sweep    "./balance/sweeps/w117-species-${arm}.sweep.json" \
    --out      "${OUT}/${arm}" \
    --workers  "${WORKERS}"
done

echo "=== all seven arms complete; analyse ==="
node scripts/w99-analyse.mjs \
  --control "${OUT}/all" \
  --arm "draconic=${OUT}/draconic" \
  --arm "dwarf=${OUT}/dwarf" \
  --arm "elf=${OUT}/elf" \
  --arm "gnome=${OUT}/gnome" \
  --arm "human=${OUT}/human" \
  --arm "orc=${OUT}/orc" \
  > balance/results-w117-species-arms.md

echo "wrote balance/results-w117-species-arms.md"
