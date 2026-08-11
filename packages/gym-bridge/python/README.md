<!--
Multiverse Mages — Copyright (C) 2026 Ann Kelner
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# `mm_gym` — the Python side of the agent boundary

The reference client for `packages/gym-bridge`, which exposes `contracts.md` §4's
observation vector, sixteen-action space, legality mask and slot-indexed candidate lists to a
process that is not the simulation's.

**Standard library only.** No `numpy`, no `gymnasium`, no `pydantic`. That is a decision about
audit surface, not about licence: an AGPL project that pulls in a training stack acquires a
transitive licence surface to re-audit on every upgrade, forever. `Observation` data is an
`array.array('d')`, which `numpy.frombuffer(obs, dtype='f8')` wraps with no copy.

## Running the tests

    cd packages/gym-bridge/python
    python3 -m unittest discover -s tests

`tests/test_contract.py` needs nothing but Python. `tests/test_bridge_e2e.py` spawns a real
bridge and **skips** unless `packages/gym-bridge/dist` and `packages/scenario/dist` exist — run
`npm run typecheck` from the repository root first.

> **`npm run verify` does not run these.** Neither CI job pins a Python toolchain, and adding one
> to a TypeScript monorepo's gate is a larger decision than the `gym-bridge` change made
> unilaterally. `design.md` records this as the change's largest stated gap. It is mitigated, not
> closed, by keeping every load-bearing cross-language property on the TypeScript side: the wire
> schema, the frame vocabulary, the digest encoding and the recorded-episode replay are all tested
> in Vitest, so what Python can break unnoticed is its own ergonomics rather than the contract.

## A session

```python
from mm_gym import EnvSpec, MageEnv
from mm_gym.rewards import sparse_terminal

command = [
    "node", "packages/gym-bridge/bin/serve.mjs",
    "--scenario", "./packages/scenario/bin/scenario.mjs",
]

with MageEnv(command, reward_fn=sparse_terminal, world_tick_cap=600) as env:
    env.spec.save("policy.envspec.json")        # pin the contract beside the checkpoint
    obs, info = env.reset(seed=0x5EED_0001)     # the seed is yours; this bridge derives none
    while True:
        action = policy(obs, env.legal_actions())
        obs, reward, terminated, truncated, info = env.step(action)
        if terminated or truncated:
            break
```

`reward_fn` has **no default**. `contracts.md` §4.3 puts the objective in the training loop, and
nothing on the wire carries a reward — `mm_gym.rewards.sparse_terminal` is offered by name so
that passing it is a choice somebody made.

## Loading a checkpoint later

```python
expected = EnvSpec.load("policy.envspec.json")
env = MageEnv(command, reward_fn=sparse_terminal, world_tick_cap=600, expect=expected)
```

This raises `ObservationContractError` — **inside the bridge, before the first observation
exists** — if the layout digest, the observation width, the action-space width, the schema
version or any candidate slot count has moved. A policy trained against one layout and loaded
against another *works*: every array shape still matches and every value is still in `[0, 1]`,
and the agent has simply been handed four hundred numbers that mean something else.

A changed `content_hash` is reported in `env.advisories` and is **not** fatal. Balance tuning
retunes content daily, and a check people disable is worse than one that reports.

`MageEnv` also recomputes the digest from the layout table the bridge transports
(`verify_digest=True` by default), which catches a bridge that misreports its own layout — the
one failure a declared digest cannot catch by itself.

## Parameterized actions

Actions 8–14 carry entity handles from a set that changes every tick, so §4.4 addresses them
through a fixed-length, salience-ordered candidate list and the agent picks a **slot index**:

```python
for group in env.candidates():
    if group.action == 9 and group.occupied:      # blessMage
        obs, reward, terminated, truncated, info = env.step((9, 0))
```

A slot naming an entity that died between observation and action is an ordinary illegal action:
`info["admitted"]` is `False`, the tick still advances, and `info["illegal_action_count"]` goes
up. It is never an exception — §4.2 requires illegal actions to be cheap and observable, because
learning agents submit them constantly.

`info` is diagnostics and **not a learning signal**. `agent-api`'s gate is explicit that a
rejection reason is *"never fed back to the agent"*; it is not in the observation and not in the
mask, and a policy that reads it has a channel the mask does not have.

## Many environments

```python
from mm_gym import VectorMageEnv

with VectorMageEnv([*command, "--envs", "8"], reward_fn=sparse_terminal, world_tick_cap=600) as v:
    observations = v.reset([seed + i for i in range(8)])
    observations, rewards, terminated, truncated, info = v.step([0] * 8)
```

A vector is **amortization, not parallelism**: one frame carrying eight observations pays the
JSON round trip once instead of eight times, on one thread. For cores, run several bridge
processes — `subprocess` is in the standard library, which is why doing so costs this package
nothing.

There is **no auto-reset**. A terminated env is reset explicitly with `reset_one`, or the bridge
refuses the frame. Auto-reset hides an episode boundary inside a step, which is the same class of
mistake as conflating terminated with truncated.

For sweeps, baselines, gates, tournaments or ablation — anything with no learned policy in the
loop — use `packages/mc-harness/bin/run-sweep.mjs`. It has the worker pool, the published seed
derivation and the canonical-order aggregation, and the bridge deliberately ships none of them.

## What this build actually contains

Stated because a learned agent will find it faster than a person will:

- `raid-engagement` is in flight, so the observation's 64-channel engagement block is zero in
  every run. An agent trained here is learning a game without raids.
- Four of `contracts.md` §7's balance metrics report `mechanic-absent`.
- Library depth sits near 1.7 distinct nodes across several hundred grimoires, because the
  scribable list is cost-ordered.

None of that is tuned away to make a first result look better. Release 0.12.0 exists to
re-establish the baselines against whatever a learned agent finds.
