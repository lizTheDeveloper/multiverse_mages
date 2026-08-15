#!/usr/bin/env bash
#
# Multiverse Mages — W182: sweep `withdraw-after-ticks` and report the rate.
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
# One child process per candidate value, because content is loaded and memoized
# once per process: a second value read in the same process would describe the
# first one's world. The file is restored from git on every exit path, including
# an interrupt, so a failed sweep cannot leave a tuning value committed by
# accident.
#
#     scripts/w182-sweep.sh 24 32 40 48 64
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/packages/content/data/raid-constant.json"
cd "$ROOT" || exit 1

restore() { git checkout -- "$DATA"; }
trap restore EXIT INT TERM

CANDIDATES=("$@")
if [ ${#CANDIDATES[@]} -eq 0 ]; then CANDIDATES=(24 32 40 48 64); fi

for k in "${CANDIDATES[@]}"; do
  node -e '
    const fs = require("node:fs");
    const path = process.argv[1];
    const k = Number(process.argv[2]);
    const rows = JSON.parse(fs.readFileSync(path, "utf8"));
    const row = rows.find((entry) => entry.id === "withdraw-after-ticks");
    if (row === undefined) throw new Error("withdraw-after-ticks is not in " + path);
    row.value = k;
    fs.writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
  ' "$DATA" "$k"
  echo "=== withdraw-after-ticks = $k"
  node scripts/w182-withdrawal.mjs | tail -3
  echo
done
