"""Reward functions a caller may choose. None of them is a default.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later

``contracts.md`` §4.3:

    The core emits **no reward**. Reward is a property of a training objective,
    not of the game, and baking one in would make every trained agent a hostage
    to one researcher's choice.

Nothing on the wire carries a reward, and :class:`mm_gym.MageEnv` takes
``reward_fn`` as a **required** argument. The functions here are offered by
name; no code path applies one unless a caller passes it. Offering is not
defaulting — a default is what gets measured, and the first paper written
against this bridge would be about the default whether or not its author chose
it.

A reward function receives an :class:`~mm_gym.env.Outcome` and nothing else: not
the observation, not the info mapping, not the environment. That signature is
the enforcement, exactly as ``RewardFunction`` is in TypeScript. A function
handed the whole state could read anything, and the moment one does, §4.3's
separation between what the game reports and what this researcher is optimizing
stops being enforced by anything.
"""

from __future__ import annotations

from typing import Callable, Protocol


class _HasOutcome(Protocol):
    terminal: bool
    truncated: bool
    terminal_reason: int
    era: int


#: ``contracts.md`` §1.1's terminal reasons for the two ascension routes.
#:
#: Written out rather than derived: they are serialized in every episode record
#: and in every run this bridge produces, so they are the same kind of permanent
#: identifier §4.2's action ids are. A client that guessed them from an enum's
#: ordering would be guessing.
TERMINAL_REASON_ASCENSION_APOTHEOSIS = 1
TERMINAL_REASON_ASCENSION_CANON = 2

RewardFn = Callable[[_HasOutcome], float]


def sparse_terminal(outcome: _HasOutcome) -> float:
    """The Python twin of ``agent-api``'s ``sparseTerminalReward``.

    §4.3: *"ascension +1, stagnation 0, nothing in between."* Both ascension
    routes score ``+1``; the document says "ascension" without distinguishing
    them, and vision §8a treats them as two routes to the same end. A truncated
    episode scores ``0`` and is *not* terminal — the caller's bootstrapping, not
    this function, is what has to treat it differently, which is why the outcome
    carries the two flags separately.

    **This is a default nobody applies for you.** A sparse terminal reward over a
    run hundreds of world-years long is a hard credit-assignment problem, and a
    researcher will almost certainly want shaping. The point of §4.3 is that they
    write it rather than inherit ours.
    """
    if not outcome.terminal:
        return 0.0
    if outcome.terminal_reason in (
        TERMINAL_REASON_ASCENSION_APOTHEOSIS,
        TERMINAL_REASON_ASCENSION_CANON,
    ):
        return 1.0
    return 0.0


def zero(_outcome: _HasOutcome) -> float:
    """No reward at all, for a researcher computing their own from the observation.

    Not a placeholder: an intrinsic-motivation or offline-RL setup genuinely
    wants the environment to score nothing, and spelling that as an explicit
    choice is better than passing ``lambda o: 0.0`` and leaving a reader to
    wonder whether it was deliberate.
    """
    return 0.0
