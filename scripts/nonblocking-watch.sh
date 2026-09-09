#!/usr/bin/env bash
#
# Multiverse Mages — is any non-required job red on main?
# Copyright (C) 2026 Ann Kelner
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# ## Why this exists
#
# Three jobs on `main` are deliberately not required to merge, and every one of
# them has a good reason: the two-hundred-year balance gate costs 830–1154 s
# against the other gates' ~40 s and would queue every unrelated PR behind the
# win condition; the primitive-consumption and reachability checks report design
# facts that are not always defects on the commit that introduces them.
#
# **Non-blocking became unread.** On 2026-08-15 all three were red on `main` and
# had been for at least six consecutive commits, while `Verify (pinned Node)`
# was green on every one. The run-level conclusion is `failure`, so the only
# signal is a red dot next to a commit that merged correctly — which readers
# learn to ignore precisely because it does not block. The primitive check was
# reporting, in full and correctly, a defect this campaign then spent an evening
# rediscovering by hand.
#
# This script does not gate anything. It answers one question — *is a
# non-required job red at main's own head* — so that a scheduled workflow can
# fail visibly when the answer changes.
#
# ## Exits
#
#   0   every watched job passed
#  42   at least one watched job is red   (the answer is "yes", not an error)
#   1   the probe could not answer        (no run, missing job, gh failure)
#
# The third exit is the point. `CLAUDE.md` records five separate checkers that
# folded "I could not tell" into "the answer is no"; a watcher that reported
# green because it failed to find the run would be the sixth, and would do it
# while claiming to be the thing that stops it.

set -euo pipefail

REPO="${REPO:-lizTheDeveloper/multiverse_mages}"
BRANCH="${BRANCH:-main}"

# The workflow that actually carries the watched jobs.
CI_WORKFLOW="${CI_WORKFLOW:-ci.yml}"

# Matched as a prefix against the job name, because the full names carry
# parenthetical asides ("(not required to merge)") that are prose and may be
# reworded without the job changing.
WATCHED=(
  "Balance gate, two hundred world years"
  "Primitive consumption"
  "Rules-path reachability ratchet"
  # Added 2026-08-16. The first version of this script watched three of the four
  # non-required jobs while calling itself "are the non-required jobs green" —
  # and the one it left out was red on `main` and unread, which is the exact
  # condition the script exists to surface. Its own comment says why it matters:
  # *"a failure here means the next Node major may change simulation
  # behaviour, which we want to know about before it is pinned."* A determinism
  # change arriving with a runtime upgrade is the kind of thing this project
  # cannot afford to learn about late.
  "Next Node major"
)

fail_probe() {
  printf 'PROBE BROKEN: %s\n' "$1" >&2
  exit 1
}

command -v gh >/dev/null 2>&1 || fail_probe "gh is not on PATH"

# The newest *completed* run for the branch. Deliberately not the newest run:
# an in-progress run has null conclusions on jobs that have not started, and
# reading those as anything but "unknown" is the bug this file exists to avoid.
# `--workflow` is load-bearing and its absence was a real bug. Without it this
# took the newest completed run *of any workflow* on the branch — and once this
# script's own scheduled workflow began running on `main`, that was the newest
# run. It contains one job and none of the watched names, so the watcher spent
# its first outing **watching itself** and exiting 1.
#
# It exited 1 rather than 0, which is the whole argument for the third exit: a
# probe that cannot find what it is looking for said so instead of reporting
# green. The bug was still mine, and it is the same shape as the five this
# repository already records — a checker answering about the wrong input.
run_id="$(gh run list --repo "$REPO" --branch "$BRANCH" --workflow "$CI_WORKFLOW" \
  --status completed --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
[ -n "$run_id" ] || fail_probe "no completed run of \"$CI_WORKFLOW\" found for $BRANCH"

head_sha="$(gh run view "$run_id" --repo "$REPO" --json headSha --jq '.headSha' 2>/dev/null || true)"
[ -n "$head_sha" ] || fail_probe "could not read headSha for run $run_id"

jobs_json="$(gh run view "$run_id" --repo "$REPO" --json jobs 2>/dev/null || true)"
[ -n "$jobs_json" ] || fail_probe "could not read jobs for run $run_id"

printf 'Watching %s @ %s (run %s)\n\n' "$BRANCH" "${head_sha:0:8}" "$run_id"

red=0
for prefix in "${WATCHED[@]}"; do
  # `startswith` on the prefix, and the count is checked: a watched job that
  # matches nothing is a probe failure, not a pass. A renamed job would
  # otherwise silently drop out of the watch list and read as green forever.
  matches="$(printf '%s' "$jobs_json" | jq --arg p "$prefix" \
    '[.jobs[] | select(.name | startswith($p))] | length')"
  [ "$matches" -gt 0 ] || fail_probe "no job matches \"$prefix\" — renamed or removed?"

  conclusion="$(printf '%s' "$jobs_json" | jq -r --arg p "$prefix" \
    '[.jobs[] | select(.name | startswith($p)) | .conclusion] | join(",")')"

  case "$conclusion" in
    success) printf '  ok    %s\n' "$prefix" ;;
    # An empty conclusion is a running job, not a passing one. jq's `//` would
    # not catch this: a running job's conclusion is "", and `//` falls through
    # only on null and false. That exact mistake cost this project twenty
    # consecutive polls reading "not-started" while a run was in progress.
    "") fail_probe "\"$prefix\" has an empty conclusion — still running?" ;;
    *)
      printf '  RED   %s -> %s\n' "$prefix" "$conclusion"
      red=$((red + 1))
      ;;
  esac
done

printf '\n'
if [ "$red" -gt 0 ]; then
  printf '%d of %d watched job(s) red on %s @ %s\n' \
    "$red" "${#WATCHED[@]}" "$BRANCH" "${head_sha:0:8}"
  printf 'These do not block a merge, and that is the reason they go unread.\n'
  printf 'https://github.com/%s/actions/runs/%s\n' "$REPO" "$run_id"
  exit 42
fi

printf 'All %d watched job(s) green.\n' "${#WATCHED[@]}"
exit 0
