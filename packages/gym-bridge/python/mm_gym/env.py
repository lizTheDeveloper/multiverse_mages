"""The environment adapter: Gymnasium-shaped, Gymnasium-free, reward-free.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

## Shaped like a Gymnasium env, importing nothing from Gymnasium

``reset(seed=..., ...) -> (obs, info)``, ``step(action) -> (obs, reward,
terminated, truncated, info)``, ``close()``. A user who wants a real
``gymnasium.Env`` writes a six-line subclass; the shape is documented so that
subclass is obvious.

Gymnasium is MIT and would be AGPL-compatible. Not depending on it is a decision
about *audit surface*, not about licence: an AGPL project that pulls in a
training stack acquires a transitive licence surface to re-audit on every upgrade
forever. See ``pyproject.toml``.

## The objective is required, and that is the boundary

``reward_fn`` has **no default**. Constructing an environment without naming an
objective raises, which is the loudest available way to say that the objective
belongs to the training loop and not to the game. ``mm_gym.rewards`` offers
``sparse_terminal`` by name; offering is not defaulting.

## Observations are ``array.array('d')``

Zero third-party dependencies, and ``numpy.frombuffer(obs.data, dtype='f8')``
wraps one with no copy. The conversion costs a line in user code and costs this
package nothing.
"""

from __future__ import annotations

import array
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Sequence

from .client import BridgeClient, BridgeError
from .layout import digest_of
from .spec import ADVISORY_FIELDS, EnvSpec, ObservationContractError


@dataclass(frozen=True)
class Outcome:
    """``contracts.md`` §4.3's outcome record. The only thing a reward may see."""

    terminal: bool
    """The run reached an end state of its own: ascension or stagnation."""

    truncated: bool
    """The caller's step limit was reached.

    Separate from :attr:`terminal`, never one enum. §4.3: *"bootstrapping value
    estimates through the two differs, and conflating them is a silent training
    bug."* A run that ascends on the tick it hits its cap is both.
    """

    terminal_reason: int
    era: int
    metric_deltas: Mapping[str, float]

    @classmethod
    def from_wire(cls, payload: Mapping[str, Any]) -> "Outcome":
        return cls(
            terminal=bool(payload["terminal"]),
            truncated=bool(payload["truncated"]),
            terminal_reason=int(payload["terminalReason"]),
            era=int(payload["era"]),
            metric_deltas=dict(payload.get("metricDeltas", {})),
        )


@dataclass(frozen=True)
class Candidates:
    """§4.4's slot-indexed candidate list for one parameterized action."""

    action: int
    slots: int
    """The pinned ``k``. Constant whether or not the list is occupied, because a
    policy's parameterized output head is that wide either way."""
    occupied: Sequence[Sequence[int]]
    """The parameter tuple each occupied slot resolves to, in slot order."""


def _observation(values: Sequence[float]) -> array.array:
    return array.array("d", values)


class MageEnv:
    """One universe, stepped through a bridge process.

    :param command: how to start the bridge, e.g.
        ``["node", "packages/gym-bridge/bin/serve.mjs", "--scenario", "..."]``.
    :param reward_fn: **required.** A callable from :class:`Outcome` to ``float``.
    :param world_tick_cap: the step limit. §4.3 puts it on the caller, and this
        is where the caller imposes it.
    :param expect: an :class:`EnvSpec` from a checkpoint sidecar. Declared in the
        handshake, so a structural mismatch refuses **in the bridge**, before the
        first observation exists.
    :param env_index: which env of a multi-env bridge this object drives.
    :param verify_digest: recompute the layout digest from the transported
        encoding and refuse a bridge that misreports its own layout.
    """

    def __init__(
        self,
        command: Sequence[str],
        *,
        reward_fn: Callable[[Outcome], float],
        world_tick_cap: int,
        expect: EnvSpec | None = None,
        env_index: int = 0,
        verify_digest: bool = True,
        client: BridgeClient | None = None,
        stderr_sink: Callable[[str], None] | None = None,
        cwd: str | None = None,
    ) -> None:
        if reward_fn is None or not callable(reward_fn):
            raise TypeError(
                "MageEnv requires a reward_fn. contracts.md §4.3: reward is a property of a "
                "training objective, not of the game, and nothing on this wire carries one. "
                "mm_gym.rewards.sparse_terminal is offered by name — pass it deliberately, or "
                "pass your own."
            )
        self._reward_fn = reward_fn
        self._cap = int(world_tick_cap)
        self._env = int(env_index)
        self._client = client or BridgeClient(command, stderr_sink=stderr_sink, cwd=cwd)
        self._owns_client = client is None

        ready = self._client.hello(None if expect is None else expect.to_wire())
        self.spec = EnvSpec.from_wire(ready["contract"])
        self.env_count = int(ready.get("envCount", 1))
        self.advisories = list(ready.get("advisories", ()))
        if expect is not None:
            # Belt and braces, and neither is redundant: the handshake above
            # catches a bridge started against a stale client, and this catches
            # a checkpoint whose sidecar drifted from what it declared.
            expect.require(self.spec)
            self.advisories.extend(
                {"field": name, "client": mine, "bridge": theirs}
                for name, mine, theirs in expect.mismatches(self.spec, ADVISORY_FIELDS)
            )

        if verify_digest:
            self._verify_digest()

        if self._env >= self.env_count:
            raise ValueError(
                f"env_index {self._env} is outside the bridge's 0..{self.env_count - 1}."
            )

    # -- contract ---------------------------------------------------------

    def _verify_digest(self) -> None:
        """Recomputes the digest from the layout the bridge transported.

        ``agent-api``'s ``digest.ts`` argues FNV-1a was chosen so *"a second
        implementation can follow [it] from the document rather than from the
        source"*. This is that second implementation used for the one thing a
        declared digest cannot do by itself: catch a bridge that misreports its
        own layout, which is what a half-finished deployment produces.
        """
        layout = self._client.describe()
        recomputed = digest_of(str(layout["encoding"]))
        declared = str(layout["observationLayoutDigest"])
        if recomputed != declared:
            raise ObservationContractError(
                f"The bridge declares layout digest {declared} but the layout table it "
                f"transported hashes to {recomputed}. One of the two is not describing this "
                "build, and neither can be trusted until that is resolved."
            )
        if recomputed != self.spec.observation_layout_digest:
            raise ObservationContractError(
                f"The handshake declared {self.spec.observation_layout_digest} and describe "
                f"declared {recomputed}. A bridge disagreeing with itself is not one to train "
                "against."
            )
        self.layout_encoding = str(layout["encoding"])

    # -- the environment --------------------------------------------------

    def reset(
        self,
        *,
        seed: int,
        options: Mapping[str, Any] | None = None,
        hash: bool = False,
    ) -> tuple[array.array, dict[str, Any]]:
        """Starts an episode. ``seed`` is required — this bridge derives none.

        ``mc-harness`` publishes ``deriveRunSeed`` with its own version constant
        and the bridge is granted no edge to it, so a run seed is always the
        caller's. A caller who wants harness-derived seeds computes them with the
        harness and passes them in.
        """
        entry: dict[str, Any] = {
            "env": self._env,
            "runSeed": int(seed),
            "worldTickCap": self._cap,
        }
        if options:
            entry["options"] = dict(options)
        if hash:
            entry["hash"] = True
        view = self._client.reset([entry])[0]
        self._last = view
        return _observation(view["observation"]), self._info(view)

    def step(
        self,
        action: int | tuple[int, int],
        *,
        hash: bool = False,
    ) -> tuple[array.array, float, bool, bool, dict[str, Any]]:
        """Submits one action and advances one world tick.

        ``action`` is an id from §4.2's table, or ``(id, slot)`` for a
        parameterized action — where ``slot`` indexes §4.4's candidate list and
        is resolved against *current* state by the simulation, never cached here.

        An illegal action is **not** an error: it is a no-op, a tick, and a
        counter increment, and ``info['admitted']`` is ``False`` with
        ``info['rejection']`` naming the reason.
        """
        entry: dict[str, Any] = {"env": self._env}
        if isinstance(action, tuple):
            entry["action"], entry["slot"] = int(action[0]), int(action[1])
        else:
            entry["action"] = int(action)
        if hash:
            entry["hash"] = True

        view = self._client.step([entry])[0]
        self._last = view
        outcome = Outcome.from_wire(view["outcome"])
        return (
            _observation(view["observation"]),
            float(self._reward_fn(outcome)),
            outcome.terminal,
            outcome.truncated,
            self._info(view),
        )

    def legal_actions(self) -> array.array:
        """The mask from the last frame, one entry per action id."""
        return array.array("b", self._last["mask"])

    def candidates(self) -> list[Candidates]:
        """§4.4's lists from the last frame."""
        return [
            Candidates(
                action=int(one["action"]),
                slots=int(one["slots"]),
                occupied=[list(map(int, params)) for params in one["occupied"]],
            )
            for one in self._last["candidates"]
        ]

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> "MageEnv":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # -- info -------------------------------------------------------------

    def _info(self, view: Mapping[str, Any]) -> dict[str, Any]:
        """Diagnostics, and **not** a learning signal.

        ``agent-api``'s gate says the rejection reason is *"never fed back to the
        agent: it is not in the observation, and making it one would be a channel
        the mask does not have."* It is honoured literally — the reason is not in
        the observation and not in the mask — and it rides here because a client
        debugging its own masking needs it. A policy that reads from ``info`` has
        a channel the mask does not have, and the convention that ``info`` is not
        for learning is the only thing preventing that.
        """
        info: dict[str, Any] = {
            "status": view["status"],
            "world_tick": view["worldTick"],
            "illegal_action_count": view["illegalActionCount"],
            "terminal_reason": view["outcome"]["terminalReason"],
            "era": view["outcome"]["era"],
        }
        if "admitted" in view:
            info["admitted"] = view["admitted"]
        if "rejection" in view:
            info["rejection"] = view["rejection"]
        if "snapshotHash" in view:
            info["snapshot_hash"] = view["snapshotHash"]
        return info


class VectorMageEnv:
    """Every env of one bridge process, stepped in one frame.

    **Amortization, not parallelism.** One frame carrying *N* observations pays
    the JSON encode, the JSON decode and the pipe round-trip once instead of *N*
    times; it does not use a second core. For cores, construct several of these
    over several bridge processes — ``subprocess`` is in the standard library, so
    that costs nothing and adds no dependency.

    The bridge deliberately offers no rollout or sweep mode. Work with no learned
    policy in the loop belongs to ``mm-run-sweep``, which already has a worker
    pool, published seed derivation and canonical-order aggregation.
    """

    def __init__(
        self,
        command: Sequence[str],
        *,
        reward_fn: Callable[[Outcome], float],
        world_tick_cap: int,
        expect: EnvSpec | None = None,
        stderr_sink: Callable[[str], None] | None = None,
        cwd: str | None = None,
    ) -> None:
        if not callable(reward_fn):
            raise TypeError(
                "VectorMageEnv requires a reward_fn, for the reason MageEnv does: contracts.md "
                "§4.3 puts the objective in the training loop."
            )
        self._reward_fn = reward_fn
        self._cap = int(world_tick_cap)
        self._client = BridgeClient(command, stderr_sink=stderr_sink, cwd=cwd)
        ready = self._client.hello(None if expect is None else expect.to_wire())
        self.spec = EnvSpec.from_wire(ready["contract"])
        self.env_count = int(ready.get("envCount", 1))
        self.advisories = list(ready.get("advisories", ()))
        if expect is not None:
            expect.require(self.spec)

    def reset(self, seeds: Sequence[int]) -> list[array.array]:
        """Starts one episode per env. One seed per env, in env order."""
        if len(seeds) != self.env_count:
            raise ValueError(
                f"{len(seeds)} seeds for {self.env_count} envs. Every env's seed is named by the "
                "caller because this bridge derives none."
            )
        views = self._client.reset(
            [
                {"env": index, "runSeed": int(seed), "worldTickCap": self._cap}
                for index, seed in enumerate(seeds)
            ]
        )
        self._last = views
        return [_observation(view["observation"]) for view in views]

    def step(
        self, actions: Sequence[int | tuple[int, int]]
    ) -> tuple[list[array.array], list[float], list[bool], list[bool], list[dict[str, Any]]]:
        """Steps every env in one frame.

        **No auto-reset.** A terminated env must be reset explicitly before it is
        stepped again, or the bridge refuses the frame. Auto-reset is the
        convention in most vectorized wrappers and is left out deliberately: it
        hides an episode boundary inside a step, which is the same class of
        mistake as conflating terminal with truncated.
        """
        if len(actions) != self.env_count:
            raise ValueError(f"{len(actions)} actions for {self.env_count} envs.")
        entries = []
        for index, action in enumerate(actions):
            entry: dict[str, Any] = {"env": index}
            if isinstance(action, tuple):
                entry["action"], entry["slot"] = int(action[0]), int(action[1])
            else:
                entry["action"] = int(action)
            entries.append(entry)

        views = self._client.step(entries)
        self._last = views
        outcomes = [Outcome.from_wire(view["outcome"]) for view in views]
        return (
            [_observation(view["observation"]) for view in views],
            [float(self._reward_fn(outcome)) for outcome in outcomes],
            [outcome.terminal for outcome in outcomes],
            [outcome.truncated for outcome in outcomes],
            [dict(status=view["status"], world_tick=view["worldTick"]) for view in views],
        )

    def reset_one(self, env_index: int, seed: int) -> array.array:
        """Restarts one env of the vector, leaving the others where they are."""
        view = self._client.reset(
            [{"env": int(env_index), "runSeed": int(seed), "worldTickCap": self._cap}]
        )[0]
        return _observation(view["observation"])

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "VectorMageEnv":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


__all__ = [
    "BridgeError",
    "Candidates",
    "MageEnv",
    "Outcome",
    "VectorMageEnv",
]
