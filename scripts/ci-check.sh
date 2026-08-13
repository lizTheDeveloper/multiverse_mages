#!/usr/bin/env bash
#
# Multiverse Mages — entry point for the self-hosted CI runner.
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
# The runner on cto-tycoon-hel1 looks for this exact path (scripts/ci-check.sh)
# and runs it with bash. Without it the runner falls back to a bare
# `npm run lint` against a tree that was never installed, which fails for a
# reason that has nothing to do with the commit.
#
# This must stay equivalent to the `verify` gate in package.json. If they drift,
# a commit can pass locally and fail on the runner, or worse, the reverse.

set -euo pipefail

echo "=== node version ==="
node --version

# The project pins Node 22 via engines and .nvmrc. Determinism is the whole
# point of sim-core, so a runner on a different major is not a detail — refuse
# rather than produce a green check that means nothing.
required_major="$(tr -d 'v \n' < .nvmrc | cut -d. -f1)"
actual_major="$(node --version | tr -d 'v' | cut -d. -f1)"
if [ "$actual_major" != "$required_major" ]; then
  echo "FATAL: runner has Node ${actual_major}, project pins Node ${required_major} (.nvmrc)." >&2
  echo "Fix the runner image rather than relaxing this check." >&2
  exit 1
fi

echo "=== install (npm ci) ==="
npm ci

# --- Does this commit need the Monte Carlo sweeps? -------------------------
#
# The three balance gates are the expensive part of `verify` by a wide margin,
# and they are the reason a docs-only pull request sits behind a queue on the
# single self-hosted runner. A change that touches no code cannot move a
# balance number.
#
# Two rules make this safe, and neither is optional:
#
#   1. ALLOWLIST, NEVER DENYLIST. We skip only when *every* changed path is a
#      known documentation path. A denylist of code paths would silently exempt
#      any new top-level directory the day someone adds one.
#
#      `ui/` is on the list for the same reason `docs/` is, and the reason is
#      narrower than it looks: it is in no tsconfig, no eslint glob and no
#      vitest include, so a `ui/`-only diff cannot change what the simulation
#      does. It is NOT unwatched — `packages/content/test/unit/ui-theme.test.ts`
#      reads every prototype and asserts the shared palette, and that test still
#      runs here, because what is skipped is the three Monte Carlo sweeps and
#      nothing else. A prototype that drifts still fails; it just no longer
#      spends five hundred seconds proving a stylesheet did not move a
#      balance number.
#   2. FAIL CLOSED. Any uncertainty — no merge base, a shallow clone, a git
#      error, an unrecognised path — runs the full gate. A skipped sweep must
#      be a decision, never an accident.
#
# This does NOT weaken `verify`: `ci-check.sh` still runs the identical script
# for anything that touches code. What varies is which *diffs* earn the sweeps,
# which is a different lever from making the gate itself weaker.
docs_only=0
base="${CI_DIFF_BASE:-origin/main}"

if git rev-parse --verify --quiet "$base" >/dev/null 2>&1; then
  if changed="$(git diff --name-only "$base"...HEAD 2>/dev/null)"; then
    if [ -n "$changed" ]; then
      docs_only=1
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        case "$f" in
          docs/*|openspec/*|.claude/*|ui/*|*.md|LICENSE) ;;
          *) docs_only=0; break ;;
        esac
      done <<< "$changed"
    fi
  fi
fi

if [ "$docs_only" -eq 1 ]; then
  echo "=== docs-only diff against ${base}: skipping the three balance sweeps ==="
  echo "Changed paths:"
  echo "$changed" | sed 's/^/  /'
  echo "Everything else in \`verify\` still runs. To force the full gate, unset"
  echo "the condition by touching any path outside docs/, openspec/, .claude/ or *.md."
  echo
  echo "=== verify minus sweeps (typecheck, lint, purity, content, audio, coverage, tests) ==="
  npm run verify:nosweeps
else
  echo "=== verify (typecheck, lint, purity, content, audio, primitive coverage, tests, balance gates) ==="
  npm run verify
fi

echo "=== ci-check passed ==="
