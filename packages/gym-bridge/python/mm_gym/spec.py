"""The observation contract, and how a checkpoint refuses to load against a changed one.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

The failure this file exists to prevent, stated plainly: a policy trained
against one observation layout, loaded against another, **works**. Every array
shape still matches, every value is still in ``[0, 1]``, nothing raises, and the
agent has simply been handed four hundred numbers that mean something else. The
run that produces looks exactly like a run that did not.

``agent-api`` publishes ``OBSERVATION_LAYOUT_DIGEST`` so a *baseline* can refuse
to compare across that change. A checkpoint is the same kind of consumer with a
worse failure mode, so the refusal is made the path of least resistance here:

- :meth:`EnvSpec.save` writes a sidecar next to a checkpoint.
- :meth:`EnvSpec.require` loads one and raises on a structural disagreement.
- Passing the loaded spec to ``MageEnv(expect=...)`` puts the refusal *in the
  bridge*, before the first observation exists.

The two halves catch different things and neither is redundant: the sidecar
catches a checkpoint loaded against a rebuilt bridge, and the handshake catches a
bridge started against a stale client.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

#: A disagreement on any of these is fatal — they are what a policy's shape and
#: index semantics depend on.
STRUCTURAL_FIELDS = (
    "protocol_version",
    "observation_schema_version",
    "observation_layout_digest",
    "observation_size",
    "action_space_size",
    "candidate_slots",
)

#: A disagreement on any of these is reported and never fatal. Balance tuning
#: retunes content daily, and a check people disable is worse than one that
#: reports — see ``design.md``.
ADVISORY_FIELDS = ("scenario_id", "content_hash", "build_version")

_WIRE_NAMES = {
    "protocol_version": "protocolVersion",
    "observation_schema_version": "observationSchemaVersion",
    "observation_layout_digest": "observationLayoutDigest",
    "observation_size": "observationSize",
    "action_space_size": "actionSpaceSize",
    "candidate_slots": "candidateSlots",
    "scenario_id": "scenarioId",
    "content_hash": "contentHash",
    "build_version": "buildVersion",
}


class ObservationContractError(RuntimeError):
    """A structural disagreement between a checkpoint and a build."""


@dataclass(frozen=True)
class EnvSpec:
    """What a build serves, and what a checkpoint was trained against."""

    protocol_version: int
    observation_schema_version: int
    observation_layout_digest: str
    observation_size: int
    action_space_size: int
    candidate_slots: Mapping[str, int] = field(default_factory=dict)
    scenario_id: str = ""
    content_hash: str = ""
    build_version: str = ""

    # -- wire -------------------------------------------------------------

    @classmethod
    def from_wire(cls, contract: Mapping[str, Any]) -> "EnvSpec":
        """Reads the contract out of a ``ready`` frame."""
        return cls(
            protocol_version=int(contract["protocolVersion"]),
            observation_schema_version=int(contract["observationSchemaVersion"]),
            observation_layout_digest=str(contract["observationLayoutDigest"]),
            observation_size=int(contract["observationSize"]),
            action_space_size=int(contract["actionSpaceSize"]),
            candidate_slots={str(k): int(v) for k, v in contract.get("candidateSlots", {}).items()},
            scenario_id=str(contract.get("scenarioId", "")),
            content_hash=str(contract.get("contentHash", "")),
            build_version=str(contract.get("buildVersion", "")),
        )

    def to_wire(self, fields: tuple[str, ...] = STRUCTURAL_FIELDS) -> dict[str, Any]:
        """The ``hello.expect`` block declaring this spec.

        Structural fields only by default. Declaring the advisory ones too is
        supported and is what a researcher does when they *want* to be told that
        the content moved under them.
        """
        return {_WIRE_NAMES[name]: getattr(self, name) for name in fields}

    # -- sidecar ----------------------------------------------------------

    def to_json(self) -> str:
        payload = {name: getattr(self, name) for name in (*STRUCTURAL_FIELDS, *ADVISORY_FIELDS)}
        # Sorted keys and a trailing newline: a sidecar lives next to a
        # checkpoint in version control often enough that a stable rendering is
        # worth the one argument.
        return json.dumps(payload, sort_keys=True, indent=2) + "\n"

    def save(self, path: str | Path) -> None:
        """Writes the sidecar a checkpoint is loaded against."""
        Path(path).write_text(self.to_json(), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "EnvSpec":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(
            protocol_version=int(payload["protocol_version"]),
            observation_schema_version=int(payload["observation_schema_version"]),
            observation_layout_digest=str(payload["observation_layout_digest"]),
            observation_size=int(payload["observation_size"]),
            action_space_size=int(payload["action_space_size"]),
            candidate_slots={str(k): int(v) for k, v in payload.get("candidate_slots", {}).items()},
            scenario_id=str(payload.get("scenario_id", "")),
            content_hash=str(payload.get("content_hash", "")),
            build_version=str(payload.get("build_version", "")),
        )

    # -- comparison -------------------------------------------------------

    def mismatches(self, other: "EnvSpec", fields: tuple[str, ...]) -> list[tuple[str, Any, Any]]:
        """Every field in ``fields`` the two disagree about, as ``(field, mine, theirs)``."""
        found = []
        for name in fields:
            mine, theirs = getattr(self, name), getattr(other, name)
            if isinstance(mine, Mapping) or isinstance(theirs, Mapping):
                # Key order is a property of how a mapping was built, not of
                # what it says, so the comparison is over the pairs.
                differs = dict(mine) != dict(theirs)
            else:
                differs = mine != theirs
            if differs:
                found.append((name, mine, theirs))
        return found

    def require(self, build: "EnvSpec") -> None:
        """Raises unless ``build`` serves the environment this spec describes.

        All disagreements at once rather than the first, for the reason
        ``agent-api``'s own validator gives: a check that reports one fault per
        run turns a client three fields out of date into three cycles, and the
        third is where somebody reaches for a flag that turns the check off.
        """
        structural = self.mismatches(build, STRUCTURAL_FIELDS)
        if structural:
            lines = "\n  ".join(
                f"{name}: checkpoint expects {mine!r}, build serves {theirs!r}"
                for name, mine, theirs in structural
            )
            raise ObservationContractError(
                "This build does not serve the environment this checkpoint was trained against:\n"
                f"  {lines}\n"
                "Loading anyway would hand the policy four hundred numbers that mean something "
                "else, and nothing would raise."
            )

    def advisories(self, build: "EnvSpec") -> list[tuple[str, Any, Any]]:
        """Disagreements worth saying out loud but not worth refusing over."""
        return self.mismatches(build, ADVISORY_FIELDS)
