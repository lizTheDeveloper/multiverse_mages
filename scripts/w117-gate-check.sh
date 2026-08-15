#!/usr/bin/env bash
#
# Multiverse Mages — W117: is the post-unlock re-measurement allowed to run yet?
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
# ---------------------------------------------------------------------------
# Re-run this. Do not trust a claim that the gate opened.
# ---------------------------------------------------------------------------
#
# The W117 re-measurement is gated on two changes being present on `main`. Every
# number taken before both land describes a world that is about to stop
# existing; see docs/design/overnight-plan-2026-08-14.md for why that is a
# correctness rule and not a scheduling preference.
#
#     ./scripts/w117-gate-check.sh            # checks origin/main
#     ./scripts/w117-gate-check.sh HEAD       # checks any ref
#
# Exit 0 = open, run ./scripts/w117-run.sh. Exit 42 = shut, do not measure.
# Exit 1 = a probe broke, which is NOT the same as the gate being shut.
#
# ---------------------------------------------------------------------------
# The two thresholds
# ---------------------------------------------------------------------------
#
#   PROBE A (w115/enable-all-cells)
#     packages/content/src/load.ts, `export const V1_CELL_COUNT`
#     SHUT = 12   OPEN = 70
#     Twelve cells cover four forms and reach 51 of 300 nodes. Species affinity
#     barely intersects them -- gnome and human have no reachable affinity at
#     all, draconic's ignem 1792 and vim 1536 are both outside. So "all six
#     species are interchangeable" is an artifact of the selection, not a
#     finding, until this reads 70.
#
#   PROBE B (w116/complete-affiliation)
#     a call-shaped `completeAffiliation(` outside its own defining module
#     SHUT = 0 call sites   OPEN = 1 or more
#     An unaffiliated mage cannot scribe or ward, and nothing promoted a mage
#     into affiliation, so grimoire counts measured before this measure the
#     defect.
#
# ---------------------------------------------------------------------------
# Why probe B matches a paren, which is the part worth not "cleaning up"
# ---------------------------------------------------------------------------
#
# On a shut `main` the ONLY mention of completeAffiliation outside its own
# module is a DOC COMMENT at packages/coordination/src/world-step.ts:1454. A
# bare-name grep counts that comment as a production caller and declares the
# gate OPEN on a build where affiliation is still unwired -- which would send
# the whole re-measurement at the exact defect it exists to measure past.
#
# Both probes therefore carry a POSITIVE CONTROL: a pattern that must match on
# any ref at all. If a control misses, the probe is broken and this exits 1
# rather than reporting the gate shut. An empty search result is not evidence of
# absence unless the search is known to work.

set -uo pipefail

REF="${1:-origin/main}"
SRC=('packages/**/src/*.ts' 'packages/**/src/**/*.ts')
DEFINING_MODULE='autonomy/affiliation.ts'

cd "$(dirname "$0")/.."
git fetch origin --quiet 2>/dev/null || true

printf 'W117 gate check against %s (%s)\n\n' "$REF" "$(git rev-parse --short "$REF")"

# --- Probe A -----------------------------------------------------------------
cells=$(git show "${REF}:packages/content/src/load.ts" 2>/dev/null \
        | grep -E 'export const V1_CELL_COUNT' | grep -oE '[0-9]+' | tail -1)
if [ -z "$cells" ]; then
  echo 'PROBE A BROKEN: V1_CELL_COUNT not found in packages/content/src/load.ts.'
  echo 'That is a broken search, NOT a shut gate. Fix the probe before concluding anything.'
  exit 1
fi
printf '  A  V1_CELL_COUNT       = %-4s (shut=12, open=70)\n' "$cells"

# --- Probe B, with its control ----------------------------------------------
control=$(git grep -c 'completeAffiliation(' "$REF" -- "packages/rules-world/src/${DEFINING_MODULE}" 2>/dev/null | wc -l | tr -d ' ')
if [ "${control:-0}" = '0' ]; then
  echo "PROBE B BROKEN: 'completeAffiliation(' does not match even inside ${DEFINING_MODULE}."
  echo 'That is a broken search, NOT a shut gate. The function may have been renamed or moved.'
  exit 1
fi
callers=$(git grep -l 'completeAffiliation(' "$REF" -- "${SRC[@]}" 2>/dev/null \
          | grep -v "$DEFINING_MODULE" | wc -l | tr -d ' ')
printf '  B  affiliationCallSites = %-4s (shut=0, open>=1)\n\n' "$callers"

if [ "$cells" = '70' ] && [ "${callers:-0}" -gt 0 ]; then
  echo 'GATE OPEN. Merge origin/main, npm ci, npm run typecheck, then ./scripts/w117-run.sh'
  echo 'Check first whether w116 also shipped an affiliation metric; if it did, add it to the'
  echo 'w117 specs BEFORE the batch, never mid-run.'
  exit 0
fi

echo 'GATE SHUT. Do not measure. A null report is the correct output of a gated task'
echo 'whose gate stayed shut -- running early is the error the gate exists to prevent.'
exit 42
