"""Against a real bridge process, if one has been built.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

Skipped unless ``packages/gym-bridge/dist`` and ``packages/scenario/dist``
exist — run ``npm run typecheck`` first. Skipping is deliberate rather than
failing: a Python developer with no Node toolchain should still be able to run
the contract tests, and a suite that fails for a missing build teaches people to
ignore it.

The one property here that nothing on the TypeScript side can show: that the
digest **a second implementation recomputes from the transported layout** equals
the one the bridge declares. ``digest.ts`` chose FNV-1a specifically so that this
would be possible *"from the document rather than from the source"*, and until
somebody writes the second implementation that sentence is a hope.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mm_gym import EnvSpec, MageEnv, ObservationContractError, VectorMageEnv, digest_of  # noqa: E402
from mm_gym.rewards import sparse_terminal  # noqa: E402

REPO = Path(__file__).resolve().parents[4]
BRIDGE = REPO / "packages/gym-bridge/bin/serve.mjs"
SCENARIO = REPO / "packages/scenario/bin/scenario.mjs"
BUILT = (REPO / "packages/gym-bridge/dist").is_dir() and (REPO / "packages/scenario/dist").is_dir()

COMMAND = ["node", str(BRIDGE), "--scenario", str(SCENARIO)]


def command(envs: int = 1) -> list[str]:
    return [*COMMAND, "--envs", str(envs)]


@unittest.skipUnless(BUILT, "run `npm run typecheck` to build the bridge first")
class TestAgainstARealBridge(unittest.TestCase):
    def test_a_session_observes_at_the_pinned_width(self):
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=8) as env:
            observation, info = env.reset(seed=0x5EED_0001)
            self.assertEqual(len(observation), env.spec.observation_size)
            self.assertTrue(all(0.0 <= value <= 1.0 for value in observation))
            self.assertEqual(info["world_tick"], 0)
            self.assertEqual(len(env.legal_actions()), env.spec.action_space_size)

    def test_the_transported_layout_hashes_to_the_declared_digest(self):
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=4) as env:
            self.assertEqual(digest_of(env.layout_encoding), env.spec.observation_layout_digest)
            self.assertTrue(env.layout_encoding.startswith("mm-observation-layout/1\t"))

    def test_an_illegal_action_is_a_tick_and_a_count_rather_than_an_error(self):
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=8) as env:
            env.reset(seed=0x5EED_0002)
            mask = env.legal_actions()
            illegal = next((index for index, bit in enumerate(mask) if bit == 0), None)
            self.assertIsNotNone(illegal, "the probe universe should mask something")
            _obs, _reward, terminated, truncated, info = env.step(illegal)
            self.assertFalse(terminated)
            self.assertFalse(truncated)
            self.assertFalse(info["admitted"])
            self.assertEqual(info["world_tick"], 1)
            self.assertEqual(info["illegal_action_count"], 1)

    def test_a_cap_reports_truncated_and_not_terminated(self):
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=3) as env:
            env.reset(seed=0x5EED_0003)
            for _ in range(3):
                _obs, reward, terminated, truncated, info = env.step(0)
            self.assertTrue(truncated)
            self.assertFalse(terminated)
            self.assertEqual(reward, 0.0)
            self.assertEqual(info["status"], "truncated")
            # The last frame of an episode carries the snapshot hash whether or
            # not anyone asked, because a record's footer needs it and there is
            # no later frame to ask on.
            self.assertIn("snapshot_hash", info)

    def test_a_stale_checkpoint_refuses_before_the_first_observation(self):
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=4) as probe:
            live = probe.spec
        stale = EnvSpec(
            protocol_version=live.protocol_version,
            observation_schema_version=live.observation_schema_version,
            observation_layout_digest="deadbeefdeadbeef",
            observation_size=live.observation_size,
            action_space_size=live.action_space_size,
            candidate_slots=live.candidate_slots,
        )
        with self.assertRaises(Exception) as caught:
            MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=4, expect=stale)
        self.assertIn("deadbeefdeadbeef", str(caught.exception))

    def test_a_matching_checkpoint_is_served(self):
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=4) as probe:
            live = probe.spec
        with MageEnv(
            command(), reward_fn=sparse_terminal, world_tick_cap=4, expect=live
        ) as env:
            observation, _info = env.reset(seed=0x5EED_0004)
            self.assertEqual(len(observation), live.observation_size)

    def test_a_sidecar_written_now_loads_against_this_build(self):
        import tempfile

        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=4) as env:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "policy.envspec.json"
                env.spec.save(path)
                reloaded = EnvSpec.load(path)
        with MageEnv(
            command(), reward_fn=sparse_terminal, world_tick_cap=4, expect=reloaded
        ) as env:
            self.assertEqual(env.spec.observation_layout_digest, reloaded.observation_layout_digest)

    def test_a_vector_steps_every_env_in_one_frame(self):
        with VectorMageEnv(command(4), reward_fn=sparse_terminal, world_tick_cap=6) as vector:
            self.assertEqual(vector.env_count, 4)
            observations = vector.reset([1, 2, 3, 4])
            self.assertEqual(len(observations), 4)
            obs, rewards, terminated, truncated, info = vector.step([0, 0, 0, 0])
            self.assertEqual(len(obs), 4)
            self.assertEqual(rewards, [0.0, 0.0, 0.0, 0.0])
            self.assertEqual(terminated, [False] * 4)
            self.assertEqual(truncated, [False] * 4)
            self.assertEqual([one["world_tick"] for one in info], [1, 1, 1, 1])

    def test_vector_width_does_not_change_an_episode(self):
        # The property that makes vectorization safe: if it were false, a
        # throughput decision would move a balance number and every value would
        # still look plausible.
        seed = 0x5EED_0005
        with MageEnv(command(), reward_fn=sparse_terminal, world_tick_cap=6) as narrow:
            narrow.reset(seed=seed)
            alone = [list(narrow.step(0)[0]) for _ in range(4)]
        with VectorMageEnv(command(4), reward_fn=sparse_terminal, world_tick_cap=6) as vector:
            vector.reset([seed, seed + 1, seed + 2, seed + 3])
            together = []
            for _ in range(4):
                observations, *_ = vector.step([0, 0, 0, 0])
                together.append(list(observations[0]))
        self.assertEqual(alone, together)

    def test_a_reward_function_is_what_scores_the_run(self):
        # The bridge carries no reward; the objective is the caller's. Two envs
        # over the same episode with different objectives disagree about the
        # return and agree about everything else.
        seed = 0x5EED_0006
        scores = {}
        for name, fn in (("sparse", sparse_terminal), ("always_one", lambda _o: 1.0)):
            with MageEnv(command(), reward_fn=fn, world_tick_cap=3) as env:
                env.reset(seed=seed)
                scores[name] = sum(env.step(0)[1] for _ in range(3))
        self.assertEqual(scores["sparse"], 0.0)
        self.assertEqual(scores["always_one"], 3.0)


if __name__ == "__main__":
    unittest.main()
