"""The wire client: a spawned bridge, NDJSON in both directions.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

Standard library only: ``json``, ``subprocess``, ``threading``, ``array``.

## stderr is drained, and that is not housekeeping

A subprocess whose stderr nobody reads fills its pipe buffer and then **blocks
forever on the next write**, which presents as the bridge hanging mid-episode
with no error anywhere. A background thread drains it into a caller-supplied
sink so that diagnostics reach a log instead of deadlocking the run. The bridge
holds up its half by writing frames to stdout and nothing else.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
from typing import Any, Callable, Iterable, Mapping, Sequence


class BridgeError(RuntimeError):
    """An ``error`` frame, or a bridge that stopped answering."""

    def __init__(self, message: str, code: str = "", mismatches: Sequence[Mapping[str, Any]] = ()):
        super().__init__(message)
        self.code = code
        self.mismatches = list(mismatches)


class BridgeClient:
    """One bridge process, spoken to one frame at a time."""

    def __init__(
        self,
        command: Sequence[str],
        *,
        stderr_sink: Callable[[str], None] | None = None,
        cwd: str | None = None,
    ) -> None:
        self._process = subprocess.Popen(  # noqa: S603 - the command is the caller's
            list(command),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
            cwd=cwd,
        )
        self._next_id = 0
        sink = stderr_sink if stderr_sink is not None else _default_stderr_sink
        self._drain = threading.Thread(target=self._pump_stderr, args=(sink,), daemon=True)
        self._drain.start()

    # -- lifecycle --------------------------------------------------------

    def _pump_stderr(self, sink: Callable[[str], None]) -> None:
        stream = self._process.stderr
        if stream is None:  # pragma: no cover - Popen always gives one here
            return
        for line in stream:
            sink(line.rstrip("\n"))

    def close(self) -> None:
        """Asks the bridge to close, then waits for it."""
        if self._process.poll() is None:
            try:
                self.request("close")
            except (BridgeError, BrokenPipeError, OSError):
                pass
        if self._process.stdin is not None:
            try:
                self._process.stdin.close()
            except OSError:  # pragma: no cover - already gone
                pass
        try:
            self._process.wait(timeout=10)
        except subprocess.TimeoutExpired:  # pragma: no cover - a wedged bridge
            self._process.kill()
            self._process.wait()
        # Closed explicitly rather than left to the garbage collector. An
        # unclosed pipe is a leaked file descriptor, and a training run that
        # opens one bridge per episode exhausts the process limit after a few
        # thousand episodes — which presents as an unrelated OSError much later.
        self._drain.join(timeout=5)
        for stream in (self._process.stdout, self._process.stderr):
            if stream is not None:
                try:
                    stream.close()
                except OSError:  # pragma: no cover - already gone
                    pass

    def __enter__(self) -> "BridgeClient":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    @property
    def returncode(self) -> int | None:
        return self._process.poll()

    # -- frames -----------------------------------------------------------

    def request(self, verb: str, **fields: Any) -> dict[str, Any]:
        """Sends one frame and returns the reply, raising on an ``error`` frame."""
        self._next_id += 1
        frame = {"type": verb, "id": self._next_id, **fields}
        stdin, stdout = self._process.stdin, self._process.stdout
        if stdin is None or stdout is None:  # pragma: no cover - defensive
            raise BridgeError("The bridge process has no pipes.")
        try:
            stdin.write(json.dumps(frame) + "\n")
            stdin.flush()
        except BrokenPipeError as error:
            raise BridgeError(
                "The bridge closed its input. Its last stderr lines say why; a fatal "
                "contract mismatch is the usual reason and exits non-zero."
            ) from error

        line = stdout.readline()
        if line == "":
            self._process.wait(timeout=10)
            raise BridgeError(
                f"The bridge exited with status {self._process.returncode} without answering a "
                f"{verb!r} frame. A contract mismatch is fatal by design and looks exactly like "
                "this from here — read stderr."
            )
        reply = json.loads(line)
        if reply.get("type") == "error":
            raise BridgeError(
                str(reply.get("message", "")),
                code=str(reply.get("code", "")),
                mismatches=reply.get("mismatches", ()),
            )
        return reply

    # -- verbs ------------------------------------------------------------

    def hello(self, expect: Mapping[str, Any] | None = None) -> dict[str, Any]:
        return self.request("hello", **({} if expect is None else {"expect": dict(expect)}))

    def describe(self) -> dict[str, Any]:
        return self.request("describe")

    def reset(self, envs: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
        return list(self.request("reset", envs=[dict(one) for one in envs])["envs"])

    def step(self, envs: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
        return list(self.request("step", envs=[dict(one) for one in envs])["envs"])


def _default_stderr_sink(line: str) -> None:
    print(f"[mm-gym-bridge] {line}", file=sys.stderr)
