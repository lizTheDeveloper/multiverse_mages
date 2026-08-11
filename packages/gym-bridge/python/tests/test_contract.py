"""The contract, the digest, and the reward that must be named.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

These run under ``python3 -m unittest`` and are **not** run by ``npm run
verify``: there is no pinned Python toolchain in either CI job, and adding one to
a TypeScript monorepo's gate is a larger decision than this change should make
unilaterally. That gap is stated in ``design.md`` under *Risks*, and it is
mitigated by putting every load-bearing cross-language property on the
TypeScript side — the wire schema, the frame vocabulary, the digest encoding and
the recorded-episode replay are all tested in Vitest.
"""

from __future__ import annotations

import ast
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mm_gym import EnvSpec, ObservationContractError, digest_of, fnv1a64, slot_count  # noqa: E402
from mm_gym.env import MageEnv, Outcome  # noqa: E402
from mm_gym.rewards import sparse_terminal, zero  # noqa: E402


def a_spec(**overrides) -> EnvSpec:
    fields = dict(
        protocol_version=1,
        observation_schema_version=1,
        observation_layout_digest="46182c35d829b205",
        observation_size=400,
        action_space_size=16,
        candidate_slots={"8": 16, "9": 32},
        scenario_id="reference-universe-v1",
        content_hash="a" * 32,
        build_version="0.3.0",
    )
    fields.update(overrides)
    return EnvSpec(**fields)


class TestDigest(unittest.TestCase):
    def test_fnv1a_matches_the_published_vector(self):
        # FNV-1a of the empty string is the offset basis, which is the one test
        # vector the algorithm's definition gives for free. If this is wrong,
        # nothing else in this file means anything.
        self.assertEqual(f"{fnv1a64(b''):016x}", "cbf29ce484222325")

    def test_digest_is_sixteen_lowercase_hex(self):
        digest = digest_of("mm-observation-layout/1\tslots=1\n0\tclock\t0\tflag\t1\t0\t1\t-")
        self.assertRegex(digest, r"^[0-9a-f]{16}$")

    def test_a_changed_saturation_constant_changes_the_digest(self):
        # The property `agent-api`'s own suite asserts, reproduced on this side.
        # A second implementation that did not have it would agree with the
        # bridge by coincidence rather than by construction.
        one = "mm-observation-layout/1\tslots=1\n0\tclock\t0\tratio\t100\t0\t1\t-"
        two = "mm-observation-layout/1\tslots=1\n0\tclock\t0\tratio\t200\t0\t1\t-"
        self.assertNotEqual(digest_of(one), digest_of(two))

    def test_slot_count_reads_the_header(self):
        self.assertEqual(slot_count("mm-observation-layout/1\tslots=400\n"), 400)

    def test_a_foreign_header_is_refused(self):
        with self.assertRaises(ValueError):
            slot_count("some-other-format/3\tslots=400\n")


class TestEnvSpec(unittest.TestCase):
    def test_a_matching_build_is_accepted(self):
        a_spec().require(a_spec())

    def test_a_changed_layout_digest_refuses(self):
        with self.assertRaises(ObservationContractError) as caught:
            a_spec().require(a_spec(observation_layout_digest="deadbeefdeadbeef"))
        message = str(caught.exception)
        self.assertIn("observation_layout_digest", message)
        self.assertIn("deadbeefdeadbeef", message)

    def test_every_structural_disagreement_is_named_at_once(self):
        with self.assertRaises(ObservationContractError) as caught:
            a_spec().require(a_spec(observation_size=1, action_space_size=2, protocol_version=9))
        message = str(caught.exception)
        for field in ("observation_size", "action_space_size", "protocol_version"):
            self.assertIn(field, message)

    def test_a_changed_candidate_slot_count_refuses(self):
        # §4.4's `k` is what a policy's parameterized output head indexes into.
        # Changing one leaves both widths and the digest untouched, so it is
        # exactly the mismatch a coarser check waves through.
        with self.assertRaises(ObservationContractError):
            a_spec().require(a_spec(candidate_slots={"8": 16, "9": 64}))

    def test_a_changed_content_hash_is_advisory(self):
        build = a_spec(content_hash="b" * 32)
        a_spec().require(build)  # does not raise
        self.assertEqual([one[0] for one in a_spec().advisories(build)], ["content_hash"])

    def test_the_sidecar_round_trips(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.envspec.json"
            a_spec().save(path)
            self.assertEqual(EnvSpec.load(path), a_spec())
            # Stable rendering: a sidecar lives beside a checkpoint in version
            # control often enough to be worth a sorted, newline-terminated file.
            text = path.read_text(encoding="utf-8")
            self.assertTrue(text.endswith("\n"))
            self.assertEqual(json.loads(text)["observation_size"], 400)

    def test_the_hello_declaration_carries_only_structural_fields_by_default(self):
        declared = a_spec().to_wire()
        self.assertIn("observationLayoutDigest", declared)
        self.assertNotIn("contentHash", declared)

    def test_candidate_slot_key_order_is_not_a_disagreement(self):
        reordered = a_spec(candidate_slots={"9": 32, "8": 16})
        a_spec().require(reordered)


class TestRewardBoundary(unittest.TestCase):
    def test_an_environment_without_an_objective_cannot_be_constructed(self):
        with self.assertRaises(TypeError) as caught:
            MageEnv(["true"], reward_fn=None, world_tick_cap=10)  # type: ignore[arg-type]
        self.assertIn("§4.3", str(caught.exception))

    def test_reward_fn_is_keyword_only_and_has_no_default(self):
        with self.assertRaises(TypeError):
            MageEnv(["true"], world_tick_cap=10)  # type: ignore[call-arg]

    def test_sparse_terminal_scores_both_ascension_routes(self):
        for reason in (1, 2):
            self.assertEqual(
                sparse_terminal(Outcome(True, False, reason, 0, {})), 1.0, f"reason {reason}"
            )

    def test_sparse_terminal_scores_stagnation_and_truncation_zero(self):
        self.assertEqual(sparse_terminal(Outcome(True, False, 3, 0, {})), 0.0)
        self.assertEqual(sparse_terminal(Outcome(False, True, 0, 0, {})), 0.0)

    def test_a_reward_function_sees_the_outcome_and_nothing_else(self):
        seen = {}

        def probe(outcome):
            seen["fields"] = set(vars(outcome).keys())
            return 0.0

        probe(Outcome(False, False, 0, 3, {}))
        self.assertEqual(
            seen["fields"], {"terminal", "truncated", "terminal_reason", "era", "metric_deltas"}
        )

    def test_zero_is_offered_as_an_explicit_choice(self):
        self.assertEqual(zero(Outcome(True, False, 1, 0, {})), 0.0)


class TestNoThirdPartyImports(unittest.TestCase):
    def test_the_package_imports_only_the_standard_library(self):
        # The AGPL-compatibility question is removed by never asking it, and
        # this is what keeps it removed.
        allowed = {
            "__future__", "array", "dataclasses", "json", "pathlib", "subprocess",
            "sys", "threading", "typing",
        }
        root = Path(__file__).resolve().parents[1] / "mm_gym"
        # Parsed, never grepped. The package docstring shows a usage example
        # containing `from mm_gym import MageEnv`, and a line scanner reported
        # that as a third-party dependency — which is the same class of mistake
        # as a regex that cannot tell an import from the text of one.
        for source in sorted(root.glob("*.py")):
            tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        self.assertIn(alias.name.split(".")[0], allowed, source.name)
                elif isinstance(node, ast.ImportFrom):
                    if node.level > 0:
                        continue  # a relative import, i.e. this package itself
                    module = (node.module or "").split(".")[0]
                    self.assertIn(module, allowed, f"{source.name}: from {module}")

    def test_every_source_file_carries_the_licence_header(self):
        root = Path(__file__).resolve().parents[1] / "mm_gym"
        for source in sorted(root.glob("*.py")):
            text = source.read_text(encoding="utf-8")
            self.assertIn("SPDX-License-Identifier: AGPL-3.0-or-later", text, source.name)
            self.assertIn("Ann Kelner", text, source.name)


if __name__ == "__main__":
    unittest.main()
