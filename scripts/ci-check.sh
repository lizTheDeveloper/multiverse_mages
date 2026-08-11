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

echo "=== verify (typecheck, lint, purity, content, audio, primitive coverage, tests) ==="
npm run verify

echo "=== ci-check passed ==="
