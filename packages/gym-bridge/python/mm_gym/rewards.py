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

#: The two non-ascension endings, from the same ``contracts.md`` §1.1 enum.
#:
#: ``stagnation`` is a real terminal state the universe reached — vision §8a:
#: *"Defeat is not the opposite of ascension. A universe that is raided to ruin
#: does not 'lose' — it stagnates, and stagnation is its own ending."*
#: ``truncated`` is the caller's step limit and is **not** a property of the
#: game; it appears here only so a reward author can assert they meant to ignore
#: it.
TERMINAL_REASON_STAGNATION = 3
TERMINAL_REASON_TRUNCATED = 4

#: Both ascension routes, for callers scoring them together.
ASCENSION_ROUTES = (
    TERMINAL_REASON_ASCENSION_APOTHEOSIS,
    TERMINAL_REASON_ASCENSION_CANON,
)

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


# ---------------------------------------------------------------------------
# Composed objectives
#
# What an ``Outcome`` carries is four scalars: ``terminal``, ``truncated``,
# ``terminal_reason`` and ``era``. ``metric_deltas`` is declared and is empty in
# every build to date — ``agent-api/src/outcome.ts`` freezes an empty map in both
# branches on purpose, leaving the definitions to the capability that owns them.
#
# So everything below is an *outcome* objective, not shaping in the usual
# progress sense. None of it solves credit assignment over a 2400-tick episode;
# it only says what winning was worth. That limit is a property of the interface
# and is stated here rather than worked around, because the obvious workaround —
# a wrapper that reads observations and computes its own progress signal — is
# exactly what §4.3 is trying to keep out of the *comparable* baseline.
# ---------------------------------------------------------------------------


def outcome_scored(
    *,
    ascension: float,
    stagnation: float,
    truncation: float,
    era_penalty: float = 0.0,
    era_cap: int | None = None,
) -> RewardFn:
    """The general outcome objective, as a factory. Every weight is required.

    ``ascension`` is paid for either route, ``stagnation`` for a run that ended
    as ruin, ``truncation`` for one that hit the caller's step limit. There are
    no defaults for the three because the balance between them *is* the research
    question; a default would become the thing everybody measured.

    ``era_penalty`` subtracts ``era_penalty * era / era_cap`` from a **successful**
    ascension only, expressing "sooner is better" without making an early failure
    preferable to a late win. It is off by default, and that default is a real
    recommendation rather than laziness:

    **A discount factor already encodes time preference.** With ``γ < 1`` a
    terminal reward received at era 40 is worth less than the same reward at era
    10, automatically. Stacking a large ``era_penalty`` on top of a discounted
    return double-counts speed, and the usual symptom is a policy that gambles on
    fast routes and accepts a much lower success rate. Set it deliberately or
    leave it at zero.

    :raises ValueError: if ``era_penalty`` is non-zero and ``era_cap`` is not a
        positive integer — a normaliser that is absent or zero would silently
        turn the penalty into a division error or an unbounded term.
    """
    if era_penalty != 0.0 and (era_cap is None or era_cap <= 0):
        raise ValueError(
            "era_penalty needs a positive era_cap to normalise against; "
            f"received era_cap={era_cap!r}. Pass the same horizon you gave "
            "MageEnv, in eras."
        )

    def score(outcome: _HasOutcome) -> float:
        # Truncation is checked first and independently. A run that ascends on
        # the very tick it hits the cap is *both*, and it earned the ascension.
        if outcome.terminal:
            if outcome.terminal_reason in ASCENSION_ROUTES:
                if era_penalty == 0.0:
                    return ascension
                assert era_cap is not None  # guarded in the factory
                return ascension - era_penalty * (outcome.era / era_cap)
            if outcome.terminal_reason == TERMINAL_REASON_STAGNATION:
                return stagnation
            return 0.0
        if outcome.truncated:
            return truncation
        return 0.0

    return score


def route_conditioned(route: int, *, other_route: float) -> RewardFn:
    """Scores **one** ascension route at ``+1``, the other at ``other_route``.

    For training a per-route baseline. The reason to want one is specific: a
    single objective that pays both routes equally can make one route look
    *absent* when it is merely harder to discover, and "no policy found it" is a
    different claim from "it is not viable". Training one policy per route and
    comparing both against a common evaluation separates those.

    ``other_route`` is required and is usually ``0.0``. Passing a *negative*
    value trains a policy that actively refuses the other summit, which is a
    legitimate ablation and a poor default — hence no default.

    Note the asymmetry this creates if used as a *shared* objective: fixed
    unequal route rewards predictably delete the cheaper-to-reach route from the
    learned population. That is why this is offered as a per-route baseline tool
    and not as a way to hand-weight the two routes against each other.

    :raises ValueError: if ``route`` is not one of the two ascension reasons.
    """
    if route not in ASCENSION_ROUTES:
        raise ValueError(
            f"route must be one of {ASCENSION_ROUTES} "
            f"(apotheosis, canon); received {route!r}."
        )

    def score(outcome: _HasOutcome) -> float:
        if not outcome.terminal:
            return 0.0
        if outcome.terminal_reason == route:
            return 1.0
        if outcome.terminal_reason in ASCENSION_ROUTES:
            return other_route
        return 0.0

    return score


def survival(*, per_step: float, ascension_bonus: float) -> RewardFn:
    """Pays ``per_step`` for every step the run is still alive, plus a bonus for ascending.

    Per **step**, not per era, and the name says so because the difference is a
    factor of 240 — ``ERA_TICKS`` is 240, so an era is 240 of these payments.
    A reward function is called once per step and is not told an era boundary was
    crossed; detecting one would mean holding state across calls, which would
    then have to be reset between episodes, and a reward that must be reset is a
    reward that will silently leak one episode into the next.

    The one objective here that is dense in anything, and it is dense only in
    time. Offered because it is the honest floor for "did the universe keep
    going", which vision §8a treats as a real achievement — canon ascension *is*
    a civilization that held its knowledge intact across enough eras.

    Its failure mode is worth stating before anyone reaches for it: a policy
    optimising ``per_step`` alone learns to survive and never to win, because
    declaring ascension **ends the run** and therefore ends the income. Keep
    ``ascension_bonus`` comfortably larger than ``per_step * expected_remaining_steps``
    or this objective actively teaches the agent not to press the button — the
    same pathology, arrived at from the opposite direction, as the idle-then-declare
    exploit it was written to avoid.
    """

    def score(outcome: _HasOutcome) -> float:
        if outcome.terminal and outcome.terminal_reason in ASCENSION_ROUTES:
            return ascension_bonus
        if outcome.terminal or outcome.truncated:
            return 0.0
        return per_step

    return score
