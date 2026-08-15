"""The composed objectives score what they claim to, including the awkward cases.

Multiverse Mages — Copyright (C) 2026 Ann Kelner

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. See the LICENSE file at the repository root, or
<https://www.gnu.org/licenses/>.

SPDX-License-Identifier: AGPL-3.0-or-later
"""

from __future__ import annotations

import unittest
from dataclasses import dataclass

from mm_gym.rewards import (
    ASCENSION_ROUTES,
    TERMINAL_REASON_ASCENSION_APOTHEOSIS,
    TERMINAL_REASON_ASCENSION_CANON,
    TERMINAL_REASON_STAGNATION,
    outcome_scored,
    route_conditioned,
    sparse_terminal,
    survival,
)


@dataclass(frozen=True)
class FakeOutcome:
    """The four scalars a reward may see. Deliberately not `mm_gym.env.Outcome`.

    A reward function's whole contract is that it reads these and nothing else,
    so a fixture carrying only these is the test of that contract: if a reward
    ever reaches for an observation, it stops compiling against this.
    """

    terminal: bool = False
    truncated: bool = False
    terminal_reason: int = 0
    era: int = 0


LIVE = FakeOutcome()
APOTHEOSIS = FakeOutcome(terminal=True, terminal_reason=TERMINAL_REASON_ASCENSION_APOTHEOSIS)
CANON = FakeOutcome(terminal=True, terminal_reason=TERMINAL_REASON_ASCENSION_CANON)
STAGNATED = FakeOutcome(terminal=True, terminal_reason=TERMINAL_REASON_STAGNATION)
TRUNCATED = FakeOutcome(truncated=True)


class TestOutcomeScored(unittest.TestCase):
    def test_every_weight_is_required(self) -> None:
        # No defaults: the balance between the three IS the research question,
        # and a default is what gets measured whether or not anyone chose it.
        with self.assertRaises(TypeError):
            outcome_scored(ascension=1.0, stagnation=-1.0)  # type: ignore[call-arg]

    def test_scores_the_three_endings_separately(self) -> None:
        score = outcome_scored(ascension=1.0, stagnation=-0.5, truncation=0.25)
        self.assertEqual(score(APOTHEOSIS), 1.0)
        self.assertEqual(score(CANON), 1.0)
        self.assertEqual(score(STAGNATED), -0.5)
        self.assertEqual(score(TRUNCATED), 0.25)
        self.assertEqual(score(LIVE), 0.0)

    def test_a_run_that_ascends_on_the_cap_tick_is_paid_for_ascending(self) -> None:
        # §4.3 keeps terminal and truncated separate precisely because a run can
        # be both. It earned the summit; the step limit arriving simultaneously
        # must not downgrade it to the truncation payout.
        both = FakeOutcome(
            terminal=True,
            truncated=True,
            terminal_reason=TERMINAL_REASON_ASCENSION_CANON,
        )
        score = outcome_scored(ascension=1.0, stagnation=-0.5, truncation=0.0)
        self.assertEqual(score(both), 1.0)

    def test_era_penalty_makes_an_earlier_summit_worth_more(self) -> None:
        score = outcome_scored(
            ascension=1.0, stagnation=0.0, truncation=0.0, era_penalty=0.2, era_cap=10
        )
        early = score(FakeOutcome(terminal=True, terminal_reason=1, era=1))
        late = score(FakeOutcome(terminal=True, terminal_reason=1, era=9))
        self.assertGreater(early, late)

    def test_era_penalty_never_makes_a_late_win_worse_than_a_failure(self) -> None:
        # The constraint that keeps "sooner is better" from becoming "gamble".
        score = outcome_scored(
            ascension=1.0, stagnation=0.0, truncation=0.0, era_penalty=0.2, era_cap=10
        )
        latest_possible = score(FakeOutcome(terminal=True, terminal_reason=1, era=10))
        self.assertGreater(latest_possible, score(STAGNATED))
        self.assertGreater(latest_possible, score(TRUNCATED))

    def test_a_nonzero_era_penalty_without_a_cap_is_refused(self) -> None:
        # Not a division-by-zero at step 40,000 of a training run.
        with self.assertRaises(ValueError):
            outcome_scored(ascension=1.0, stagnation=0.0, truncation=0.0, era_penalty=0.2)
        with self.assertRaises(ValueError):
            outcome_scored(
                ascension=1.0, stagnation=0.0, truncation=0.0, era_penalty=0.2, era_cap=0
            )

    def test_era_is_ignored_when_no_penalty_was_asked_for(self) -> None:
        score = outcome_scored(ascension=1.0, stagnation=0.0, truncation=0.0)
        self.assertEqual(score(FakeOutcome(terminal=True, terminal_reason=1, era=0)), 1.0)
        self.assertEqual(score(FakeOutcome(terminal=True, terminal_reason=1, era=999)), 1.0)


class TestRouteConditioned(unittest.TestCase):
    def test_pays_its_own_route_and_not_the_other(self) -> None:
        score = route_conditioned(TERMINAL_REASON_ASCENSION_CANON, other_route=0.0)
        self.assertEqual(score(CANON), 1.0)
        self.assertEqual(score(APOTHEOSIS), 0.0)

    def test_the_other_route_may_be_penalised_for_an_ablation(self) -> None:
        score = route_conditioned(TERMINAL_REASON_ASCENSION_CANON, other_route=-1.0)
        self.assertEqual(score(APOTHEOSIS), -1.0)

    def test_stagnation_and_truncation_score_zero_not_the_other_route(self) -> None:
        # A ruined run is not "the other summit"; paying it other_route would
        # make a -1.0 ablation punish losing and winning-differently alike.
        score = route_conditioned(TERMINAL_REASON_ASCENSION_CANON, other_route=-1.0)
        self.assertEqual(score(STAGNATED), 0.0)
        self.assertEqual(score(TRUNCATED), 0.0)

    def test_refuses_a_route_that_is_not_an_ascension(self) -> None:
        for reason in (0, TERMINAL_REASON_STAGNATION, 4, 99):
            with self.assertRaises(ValueError):
                route_conditioned(reason, other_route=0.0)

    def test_both_routes_are_reachable_as_arguments(self) -> None:
        for route in ASCENSION_ROUTES:
            self.assertEqual(route_conditioned(route, other_route=0.0)(
                FakeOutcome(terminal=True, terminal_reason=route)
            ), 1.0)


class TestSurvival(unittest.TestCase):
    def test_pays_while_alive_and_stops_at_any_ending(self) -> None:
        score = survival(per_step=0.01, ascension_bonus=10.0)
        self.assertEqual(score(LIVE), 0.01)
        self.assertEqual(score(TRUNCATED), 0.0)
        self.assertEqual(score(STAGNATED), 0.0)

    def test_ascension_pays_the_bonus(self) -> None:
        score = survival(per_step=0.01, ascension_bonus=10.0)
        self.assertEqual(score(APOTHEOSIS), 10.0)
        self.assertEqual(score(CANON), 10.0)

    def test_the_documented_pathology_is_real_and_detectable(self) -> None:
        # The docstring warns that a bonus smaller than the remaining income
        # teaches the agent NOT to press the button. Assert the arithmetic that
        # warning rests on, so the warning cannot rot into a nice sentence.
        remaining_steps = 1000
        per_step = 0.01
        stingy = survival(per_step=per_step, ascension_bonus=5.0)
        generous = survival(per_step=per_step, ascension_bonus=50.0)
        income_if_it_never_declares = per_step * remaining_steps  # 10.0
        self.assertLess(stingy(CANON), income_if_it_never_declares)
        self.assertGreater(generous(CANON), income_if_it_never_declares)


class TestSparseTerminalIsUnchanged(unittest.TestCase):
    """The existing function keeps its exact behaviour — other tests pin it."""

    def test_both_routes_one_everything_else_zero(self) -> None:
        self.assertEqual(sparse_terminal(APOTHEOSIS), 1.0)
        self.assertEqual(sparse_terminal(CANON), 1.0)
        self.assertEqual(sparse_terminal(STAGNATED), 0.0)
        self.assertEqual(sparse_terminal(TRUNCATED), 0.0)
        self.assertEqual(sparse_terminal(LIVE), 0.0)


if __name__ == "__main__":
    unittest.main()
