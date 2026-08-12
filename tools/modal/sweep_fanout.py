#!/usr/bin/env python3
# Multiverse Mages — Monte Carlo sweep fan-out across Modal containers.
# Copyright (C) 2026 Ann Kelner
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU Affero General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option) any
# later version. See the LICENSE file at the repository root, or
# <https://www.gnu.org/licenses/>.
#
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The transport, and deliberately nothing else.

This file knows how to get ``packages/mc-harness/bin/run-shard.mjs`` running in
many containers at once and how to bring its answers home. It knows nothing
about sweeps, seeds, metrics or aggregation, and it must stay that way: the
moment Python has an opinion about what a run is, there are two implementations
of the experiment and they will disagree in the third month.

    node packages/mc-harness/bin/run-sweep-distributed.mjs --backend modal ...

is how it is meant to be reached. `run-sweep-distributed.mjs` writes a job
directory, spawns this, and reads back one ``shard-<i>.json`` per shard.

Invoked directly, for the same effect::

    python3 tools/modal/sweep_fanout.py \\
        --job /tmp/job/job.json --results /tmp/job/results --shards 24 --cpu 2

Credentials
-----------
**Nothing about Modal authentication lives in this repository.** The Modal
client reads the operator's own ``~/.modal.toml`` or ``MODAL_TOKEN_ID`` /
``MODAL_TOKEN_SECRET`` environment variables at run time, exactly as the ``modal``
CLI does. No token, no workspace name and no account identifier appears here or
in any file this program writes. `CLAUDE.md` is explicit that this repository is
public and that anything committed is permanently visible; a fan-out script that
needed a credential baked in would be the wrong design, not an inconvenience.

Licensing
---------
``modal`` is Apache-2.0, which `CLAUDE.md` lists as AGPL-compatible. It is
**tool-side**: it is imported by this file and by nothing else, it appears in no
``package.json``, and it is not a runtime dependency of the simulation. The
simulation core keeps its zero runtime dependencies.

Why the image is built this way
-------------------------------
The workspace has **zero third-party runtime dependencies** — ``check:purity``
enforces it for the rules path and the harness has none either — so
``npm ci --omit=dev`` inside the image installs nothing from the registry. All
it does is create the workspace symlinks that let ``@mm/scenario`` resolve
``@mm/sim-core``. The compiled ``dist/`` directories are copied from the operator's
checkout rather than rebuilt, so the containers run the same bytes the head
does. That is not a shortcut: if it were rebuilt in the image, a toolchain
difference would show up as a provenance mismatch at best and as a silently
different simulation at worst. ``run-sweep-distributed.mjs`` asserts every
record's provenance against the head's before it writes anything, which is the
backstop for a stale ``dist/``.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time

import modal

# The repository root, from this file's location. Everything below is relative
# to it so the script can be run from anywhere.
REPO = pathlib.Path(__file__).resolve().parents[2]

# Node 22, because the workspace's `engines` field is `>=22.0.0 <23` and a
# container running 23 would be running a configuration nothing else here has.
NODE_IMAGE = "node:22-bookworm-slim"

# Modal's own agent inside the container is Python and the Node image has none,
# so one is added. It runs the three lines of `run_shard` below and never touches
# the simulation, which is Node from `dist/` exactly as it is here.
#
# It tracks the operator's interpreter rather than being pinned, because
# `run_shard` is a serialized function — see the note on the decorator — and
# Modal requires a serialized function's local and remote Python series to
# match. Pinning a version here would break for everyone whose Python is not it.
CONTAINER_PYTHON = f"{sys.version_info.major}.{sys.version_info.minor}"

# Paths inside the container.
REMOTE_REPO = "/repo"
REMOTE_JOB = "/tmp/job.json"

# What the containers do not need: the git history, another agent's worktrees
# (`.claude/worktrees/` — gitignored, and a whole second checkout), the
# operator's `node_modules` (relaid in-image), and previous sweep results. What
# they *do* need and therefore is not here: every `packages/*/dist`, so the
# containers run the same compiled bytes as the head.
IGNORE = [
    "**/node_modules",
    "**/.git",
    "**/.claude",
    "**/*.tsbuildinfo",
    "balance/results/**",
    "**/.DS_Store",
]


def build_image() -> modal.Image:
    """The container image: Node 22, this checkout, workspace symlinks.

    One install layer, not the usual two. The conventional trick — add the
    manifests, install, then add the source — buys nothing here, because
    ``npm ci`` over a workspace needs every ``packages/*/package.json`` present
    to create the links, and because there is no third-party runtime dependency
    for the layer to cache. The install is symlinks and nothing else.
    """
    return (
        modal.Image.from_registry(NODE_IMAGE, add_python=CONTAINER_PYTHON)
        .workdir(REMOTE_REPO)
        .add_local_dir(REPO, REMOTE_REPO, ignore=IGNORE, copy=True)
        # `--omit=dev` because every dependency in this workspace's runtime
        # graph is a workspace sibling: this fetches nothing from the registry
        # and only lays down the links that let `@mm/scenario` resolve
        # `@mm/sim-core`. `--ignore-scripts` because nothing here has an install
        # script, and a fan-out that would run one from a lockfile change is a
        # fan-out that can be made to run anything.
        .run_commands(
            f"cd {REMOTE_REPO} && npm ci --omit=dev --ignore-scripts --no-audit --no-fund"
        )
    )


def build_app(name: str, cpu: float, image: modal.Image, timeout: int):
    """One Modal app with one function on it: run a shard, return its answer."""
    app = modal.App(name=name)

    @app.function(
        image=image,
        cpu=cpu,
        timeout=timeout,
        # The app is built from command-line arguments, so the function is not
        # at module scope and Modal requires it serialized. Nothing is captured
        # but two path constants.
        serialized=True,
        # Exactly one retry, and Modal's own — a preempted container is
        # infrastructure. Beyond one, a repeated failure is a defect and
        # re-running it buries the cause. `run-sweep-distributed.mjs` refuses to
        # write anything if a shard is still missing after this.
        retries=modal.Retries(max_retries=1, initial_delay=1.0),
    )
    def run_shard(job: str, shard_index: int) -> tuple[str, float]:
        """Runs one shard and returns exactly what ``run-shard.mjs`` printed.

        The answer crosses the wire as the string the harness encoded, never as
        a structure this file has re-parsed. Python cannot round-trip a JSON
        number without an opinion about floats, and the one thing the head must
        be able to trust is that the bytes it merges are the bytes the shard
        produced.

        The second element is how long the shard's simulation actually took, in
        seconds. It is measurement, not result — it exists so the cost of a
        sweep is a number somebody measured rather than one they inferred from
        wall clock, which on a fan-out also contains image pull and boot.
        """
        started = time.monotonic()
        pathlib.Path(REMOTE_JOB).write_text(job, encoding="utf8")
        completed = subprocess.run(
            [
                "node",
                f"{REMOTE_REPO}/packages/mc-harness/bin/run-shard.mjs",
                "--scenario",
                f"{REMOTE_REPO}/packages/scenario/bin/scenario.mjs",
                "--job",
                REMOTE_JOB,
                "--shard",
                str(shard_index),
            ],
            capture_output=True,
            text=True,
            check=False,
            cwd=REMOTE_REPO,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"shard {shard_index} exited {completed.returncode}\n{completed.stderr}"
            )
        return completed.stdout, time.monotonic() - started

    return app, run_shard


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Run one sweep's shards across Modal containers.",
        epilog=(
            "Modal credentials come from your own environment (~/.modal.toml or "
            "MODAL_TOKEN_ID/MODAL_TOKEN_SECRET). This program neither stores nor prints them."
        ),
    )
    parser.add_argument("--job", required=True, help="job.json written by the head process")
    parser.add_argument("--results", required=True, help="directory to write shard-<i>.json into")
    parser.add_argument("--shards", type=int, required=True)
    parser.add_argument("--cpu", type=float, default=2.0, help="CPU cores per container")
    parser.add_argument("--app", default="mm-sweep-fanout", help="Modal app name")
    parser.add_argument(
        "--timeout",
        type=int,
        default=3600,
        help="per-container timeout in seconds; a shard that outlives it is a defect",
    )
    args = parser.parse_args(argv)

    job_text = pathlib.Path(args.job).read_text(encoding="utf8")
    job = json.loads(job_text)
    if job.get("shardCount") != args.shards:
        raise SystemExit(
            f"The job declares {job.get('shardCount')} shards and --shards says {args.shards}. "
            "They are two different partitions; nothing was dispatched."
        )

    results_dir = pathlib.Path(args.results)
    results_dir.mkdir(parents=True, exist_ok=True)

    app, run_shard = build_app(args.app, args.cpu, build_image(), args.timeout)

    written = 0
    busy_seconds = 0.0
    started = time.monotonic()
    with app.run():
        # `.starmap` with `order_outputs=False` — the head sorts canonically and
        # every answer names its own shard, so completion order carries no
        # information and waiting for it would only lengthen the sweep.
        answers = run_shard.starmap(
            ((job_text, index) for index in range(args.shards)),
            order_outputs=False,
        )
        for answer, elapsed in answers:
            shard_index = json.loads(answer)["shardIndex"]
            target = results_dir / f"shard-{shard_index}.json"
            target.write_text(answer, encoding="utf8")
            written += 1
            busy_seconds += elapsed
            print(
                f"shard {shard_index} home in {elapsed:.1f}s ({written}/{args.shards})",
                file=sys.stderr,
            )

    wall = time.monotonic() - started
    # Two figures, because they answer different questions. `busy` is what the
    # simulation cost; `wall x containers x cpu` is the upper bound on what
    # Modal bills, since a container is billed while it exists — including the
    # image pull and the Node boot that `busy` deliberately excludes.
    print(
        f"fan-out: {wall:.1f}s wall, {busy_seconds:.1f}s of shard time across "
        f"{args.shards} containers, <= {wall * args.shards * args.cpu:.0f} billed core-seconds",
        file=sys.stderr,
    )

    if written != args.shards:
        raise SystemExit(
            f"Only {written} of {args.shards} shards answered. Nothing usable was produced: a "
            "sweep missing runs it declared is not the sweep it declares itself to be."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
