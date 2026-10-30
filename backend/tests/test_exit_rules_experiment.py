"""Mechanics of the exit-rule research experiment (research/exit_rules/).

The experiment lives outside ``backend/`` so its committed dataset is never
bundled into the deployed API, but its execution model is tested here, with the
rest of the suite, because a wrong lag or a missing cost would silently
invalidate every number in docs/experiments/exit-rules.md. No test touches the
network or the committed data.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

from tests.conftest import FLOAT_TOL

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "research" / "exit_rules"))

import exitlab
from exitlab import (
    EXECUTION_LAG,
    RULES,
    WARMUP,
    Costs,
    Series,
    simulate,
    static_mix,
)

N = WARMUP + 200
SHOCK_DAY = WARMUP + 60


def noisy_returns(seed: int = 7) -> np.ndarray:
    return np.random.default_rng(seed).normal(0.0004, 0.012, N)


def exposures(r: np.ndarray, costs: Costs | None = None) -> dict[str, np.ndarray]:
    s = Series.from_log_returns(r)
    return {rule.name: simulate(rule.target(s), r, costs or Costs())[1] for rule in RULES}


class TestExecutionLag:
    def test_lag_is_two_days(self) -> None:
        assert EXECUTION_LAG == 2

    def test_future_shock_cannot_move_earlier_exposure(self) -> None:
        """A -50% day at t leaves every rule's exposure on days <= t+1 bit-for-bit unchanged."""
        base = noisy_returns()
        shocked = base.copy()
        shocked[SHOCK_DAY] = np.log(0.5)
        before, after = exposures(base), exposures(shocked)
        for name in before:
            np.testing.assert_array_equal(
                before[name][: SHOCK_DAY + 2], after[name][: SHOCK_DAY + 2], err_msg=name
            )

    def test_shock_does_move_exposure_from_t_plus_two(self) -> None:
        """Guards against the test above passing vacuously."""
        r = np.zeros(N)
        r[SHOCK_DAY] = np.log(0.7)
        s = Series.from_log_returns(r)
        trailing = next(rule for rule in RULES if rule.fn is exitlab.trailing_stop)
        _, exposure = simulate(trailing.target(s), r, Costs())
        assert exposure[SHOCK_DAY + 1] == 1.0
        assert exposure[SHOCK_DAY + 2] == 0.0

    def test_ewma_sigma_uses_only_the_past(self) -> None:
        base = noisy_returns()
        shocked = base.copy()
        shocked[SHOCK_DAY] = np.log(0.5)
        a, b = exitlab.ewma_sigma(base), exitlab.ewma_sigma(shocked)
        np.testing.assert_array_equal(a[:SHOCK_DAY], b[:SHOCK_DAY])
        assert b[SHOCK_DAY] > a[SHOCK_DAY]
        assert np.isnan(a[: WARMUP - 1]).all()

    def test_no_rule_acts_during_warmup(self) -> None:
        r = noisy_returns()
        r[: WARMUP - 1] = np.log(0.9)  # brutal warm-up that would trigger every stop
        for name, exposure in exposures(r).items():
            assert (exposure[: WARMUP + 1] == 1.0).all(), name


class TestStaticMix:
    def test_same_mean_exposure(self) -> None:
        r = noisy_returns()
        for name, exposure in exposures(r).items():
            _, k = static_mix(exposure, r, Costs())
            assert k == pytest.approx(exposure.mean(), abs=FLOAT_TOL), name

    def test_constant_fraction_with_cash(self) -> None:
        r = noisy_returns()
        costs = Costs(cash_rate=0.04)
        exposure = np.r_[np.ones(N // 2), np.zeros(N - N // 2)]
        net, k = static_mix(exposure, r, costs)
        expected = 0.5 * np.expm1(r) + 0.5 * costs.cash_daily
        np.testing.assert_allclose(net, expected, atol=FLOAT_TOL)
        assert k == 0.5


class TestCosts:
    def test_round_trip_charges_fee_and_tax_on_exposure_changes(self) -> None:
        """On a flat price, the only P&L is cost: fee+tax on the sale, fee on the buy-back."""
        r = np.zeros(20)
        target = np.ones(20)
        target[5:10] = 0.0  # signal out at close 5, back in at close 10
        costs = Costs()
        net, exposure = simulate(target, r, costs)

        assert exposure[6] == 1.0 and exposure[7] == 0.0  # sold at close 6
        assert exposure[11] == 0.0 and exposure[12] == 1.0  # bought at close 11
        expected = np.zeros(20)
        expected[7] = -(costs.fee + costs.sales_tax)
        expected[12] = -costs.fee
        np.testing.assert_allclose(net, expected, atol=FLOAT_TOL)

    def test_partial_change_is_charged_pro_rata(self) -> None:
        r = np.zeros(10)
        target = np.ones(10)
        target[3:] = 0.6
        costs = Costs()
        net, _ = simulate(target, r, costs)
        assert net[5] == pytest.approx(-0.4 * (costs.fee + costs.sales_tax), abs=FLOAT_TOL)
        assert np.count_nonzero(net) == 1

    def test_buy_and_hold_pays_nothing(self) -> None:
        r = noisy_returns()
        net, _ = simulate(np.ones(N), r, Costs())
        np.testing.assert_allclose(net, np.expm1(r), atol=FLOAT_TOL)

    def test_cash_earns_the_cash_rate(self) -> None:
        r = np.zeros(10)
        costs = Costs(fee=0.0, sales_tax=0.0, cash_rate=0.04)
        net, _ = simulate(np.zeros(10), r, costs)
        assert net[EXECUTION_LAG:] == pytest.approx(costs.cash_daily)
        assert (1 + costs.cash_daily) ** 252 == pytest.approx(1.04)


class TestFloorDeferral:
    def setup_method(self) -> None:
        self.r = np.full(12, 0.001)
        self.target = np.ones(12)
        self.target[4:] = 0.0  # signal at close 4 -> sell would execute at close 5
        self.r[5] = np.log(0.93)  # ...but close 5 is at the -7% floor

    def test_sell_on_a_floor_day_rolls_to_the_next_close(self) -> None:
        _, exposure = simulate(self.target, self.r, Costs(), floor_blocks_sells=True)
        assert exposure[6] == 1.0  # still holding through day 6
        assert exposure[7] == 0.0  # sold at close 6

    def test_without_the_constraint_it_sells_on_schedule(self) -> None:
        _, exposure = simulate(self.target, self.r, Costs(), floor_blocks_sells=False)
        assert exposure[6] == 0.0

    def test_purchases_are_not_blocked(self) -> None:
        # Out from close 1; a re-entry signalled at close 4 fills at the floor close 5.
        target = np.zeros(12)
        target[4:] = 1.0
        _, exposure = simulate(target, self.r, Costs(), floor_blocks_sells=True)
        assert exposure[5] == 0.0 and exposure[6] == 1.0


class TestMetrics:
    def test_whipsaw_counts_exits_followed_by_a_higher_price(self) -> None:
        price = np.r_[np.full(10, 100.0), np.full(40, 120.0)]  # rises after the exit
        exposure = np.r_[np.ones(6), np.zeros(44)]  # exit executed at close 5
        exits, rate = exitlab.whipsaw_rate(exposure, price, 0, 50)
        assert exits == 1 and rate == 1.0

    def test_max_drawdown_counts_from_starting_capital(self) -> None:
        net = np.array([-0.10, 0.05])
        assert exitlab.max_drawdown(net) == pytest.approx(-0.10)
