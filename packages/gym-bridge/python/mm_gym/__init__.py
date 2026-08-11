"""``mm_gym`` — the Python side of the Multiverse Mages agent boundary.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

Standard library only. No numpy, no gymnasium, no pydantic — see
``pyproject.toml`` for why the emptiness of the dependency list is a decision
rather than an omission.

A minimal session::

    from mm_gym import MageEnv, EnvSpec
    from mm_gym.rewards import sparse_terminal

    command = [
        "node", "packages/gym-bridge/bin/serve.mjs",
        "--scenario", "./packages/scenario/bin/scenario.mjs",
    ]
    with MageEnv(command, reward_fn=sparse_terminal, world_tick_cap=600) as env:
        env.spec.save("policy.envspec.json")     # pin it beside the checkpoint
        obs, info = env.reset(seed=0x5EED_0001)
        while True:
            action = policy(obs, env.legal_actions())
            obs, reward, terminated, truncated, info = env.step(action)
            if terminated or truncated:
                break

and loading a checkpoint later against whatever build is on disk::

    expected = EnvSpec.load("policy.envspec.json")
    env = MageEnv(command, reward_fn=sparse_terminal, world_tick_cap=600, expect=expected)
    # raises ObservationContractError — in the bridge, before the first
    # observation — if the layout, either width, the schema version or a
    # candidate slot count has moved.

``reward_fn`` is required. ``contracts.md`` §4.3 puts the objective in the
training loop, nothing on the wire carries a reward, and a default here is what
would end up measured.
"""

from .client import BridgeClient, BridgeError
from .env import Candidates, MageEnv, Outcome, VectorMageEnv
from .layout import blocks_of, digest_of, fnv1a64, slot_count
from .spec import (
    ADVISORY_FIELDS,
    STRUCTURAL_FIELDS,
    EnvSpec,
    ObservationContractError,
)

__all__ = [
    "ADVISORY_FIELDS",
    "STRUCTURAL_FIELDS",
    "BridgeClient",
    "BridgeError",
    "Candidates",
    "EnvSpec",
    "MageEnv",
    "ObservationContractError",
    "Outcome",
    "VectorMageEnv",
    "blocks_of",
    "digest_of",
    "fnv1a64",
    "slot_count",
]
