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
# GATED. Do not run this until BOTH of these are on origin/main:
#
#   w115/enable-all-cells       — V1_CELL_COUNT is 70, not 12
#   w116/complete-affiliation   — completeAffiliation has a call-shaped caller
#                                 outside autonomy/affiliation.ts
#
# Confirm both by grep rather than by reading a merge title. Every number this
# produces before then describes a world that is about to stop existing; see
# docs/design/overnight-plan-2026-08-14.md for why that is a correctness rule.
#
# One batch, sequential, modest workers: roughly eighty worktrees share this
# machine, and parallel arms are how the RPC-timeout noise gets manufactured.
# Editing source while this runs contaminates whichever arm is in flight.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT=balance/w117
W99=balance/w99/records
WORKERS="${WORKERS:-4}"

# The arm labels match W99's, because the whole point is to compare against it.
ARMS=(all-six draconic dwarf elf gnome human orc)
SPEC=(all draconic dwarf elf gnome human orc)

# ---------------------------------------------------------------------------
# 1. W99's committed CSV, in the shape the analyser reads.
# ---------------------------------------------------------------------------
# balance/w99/ committed its 1,000 records as one CSV; w99-analyse.mjs reads a
# directory holding a .runs.ndjson. Without this step the comparison below can
# only be new-vs-new, which is not the question.
node scripts/w99-csv-to-records.mjs --csv balance/w99/w99-runs.csv --out "${W99}"

# ---------------------------------------------------------------------------
# 2. The seven species arms, sequentially.
# ---------------------------------------------------------------------------
# Same sweepId and rootSeed as W99, so run r of each arm is the same universe as
# run r of W99's records and the pairing is legitimate rather than assumed.
# deriveRunSeed excludes the replicate count by design, so 100 replicates
# reproduces W99's replicateIndex 0..99 exactly.
for index in "${!ARMS[@]}"; do
  echo "=== w117 species arm: ${ARMS[$index]} ==="
  node packages/mc-harness/bin/run-sweep.mjs \
    --scenario ./packages/scenario/bin/scenario.mjs \
    --sweep    "./balance/sweeps/w117-species-${SPEC[$index]}.sweep.json" \
    --out      "${OUT}/${ARMS[$index]}" \
    --workers  "${WORKERS}"
done

# ---------------------------------------------------------------------------
# 3a. Q1: do species differentiate on the new build?
# ---------------------------------------------------------------------------
# Between-species spread against within-species spread across seeds, which is
# Table 3 — a species difference smaller than seed noise is not a difference.
node scripts/w99-analyse.mjs \
  --control "all-six=${OUT}/all-six" \
  --arm "draconic=${OUT}/draconic" \
  --arm "dwarf=${OUT}/dwarf" \
  --arm "elf=${OUT}/elf" \
  --arm "gnome=${OUT}/gnome" \
  --arm "human=${OUT}/human" \
  --arm "orc=${OUT}/orc" \
  > balance/results-w117-species-arms.md

# ---------------------------------------------------------------------------
# 3b. What opening the grid did, seed by seed, per species.
# ---------------------------------------------------------------------------
# Control is the OLD arm and the treatment is the NEW one, same species, same
# universes. Table 2's paired differences are then the movement itself, with a
# paired standard error — which is what "report movement with numbers" means,
# and it is why no baseline needs regenerating to see it.
for arm in "${ARMS[@]}"; do
  node scripts/w99-analyse.mjs \
    --control "w99-${arm}=${W99}/${arm}" \
    --arm "w117-${arm}=${OUT}/${arm}" \
    > "balance/results-w117-movement-${arm}.md"
done

echo "=== species arms complete ==="
echo "  balance/results-w117-species-arms.md      Q1: differentiation, containment"
echo "  balance/results-w117-movement-<arm>.md    before/after, seed-paired"
echo
echo "Q2 contingency: if referenceNodesGainedFinalQuarter is still above zero at"
echo "cap 2400, the runs truncated while still climbing and cannot say where the"
echo "plateau is. Only then, run the long-cap arm:"
echo
echo "  node packages/mc-harness/bin/run-sweep.mjs \\"
echo "    --scenario ./packages/scenario/bin/scenario.mjs \\"
echo "    --sweep ./balance/sweeps/w117-exhaustion-longcap.sweep.json \\"
echo "    --out ${OUT}/exhaustion --workers ${WORKERS}"
