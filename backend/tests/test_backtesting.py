"""Walk-forward backtesting tests (PRD 7.4, 9.11, 20.1).

The tests in :class:`TestNoTemporalLeakage` are the most important in the
repository. Every headline claim the project makes rests on forecasts having
been produced without sight of their own outcome, and a leak would not announce
itself: it makes every model look *better*, so the output would still be
plausible and the conclusions would be worthless.

The approach is direct rather than structural. Instead of inspecting how slices
are taken, a future observation is replaced with an extreme value and the
forecasts are required to be bit-for-bit unchanged. If any future information
reached an earlier forecast, that equality breaks.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.schemas.analysis import VarModel
from app.services.backtesting import compare_models, walk_forward_backtest
from app.services.var_models import estimate_var


@pytest.fixture
def returns() -> pd.Series:
    rng = np.random.default_rng(101)
    values = rng.standard_normal(400) * 0.011
    return pd.Series(values, index=pd.bdate_range("2020-01-01", periods=400))


class TestNoTemporalLeakage:
    @pytest.mark.parametrize("model", list(VarModel))
    def test_altering_the_final_return_leaves_every_forecast_unchanged(
        self, returns: pd.Series, model: VarModel
    ) -> None:
        window = 250
        baseline = walk_forward_backtest(returns, model, 0.95, window)

        # A -50% day at the very end. Its own forecast is built from the 250
        # days before it, so no threshold anywhere may move.
        tampered_values = returns.copy()
        tampered_values.iloc[-1] = -0.5
        tampered = walk_forward_backtest(tampered_values, model, 0.95, window)

        baseline_thresholds = [p.var_threshold for p in baseline.series]
        tampered_thresholds = [p.var_threshold for p in tampered.series]
        assert baseline_thresholds == tampered_thresholds

        # Only the realised loss on that final day should differ.
        assert baseline.series[-1].loss != tampered.series[-1].loss
        assert [p.loss for p in baseline.series[:-1]] == [
            p.loss for p in tampered.series[:-1]
        ]

    @pytest.mark.parametrize("model", list(VarModel))
    def test_a_shock_only_influences_forecasts_made_after_it(
        self, returns: pd.Series, model: VarModel
    ) -> None:
        window = 100
        baseline = walk_forward_backtest(returns, model, 0.95, window)

        shock_position = 300
        tampered_values = returns.copy()
        tampered_values.iloc[shock_position] = -0.4
        tampered = walk_forward_backtest(tampered_values, model, 0.95, window)

        # Forecasts for dates at or before the shock cannot have seen it.
        for i, (base, tamper) in enumerate(
            zip(baseline.series, tampered.series, strict=True)
        ):
            forecast_for = window + i
            if forecast_for <= shock_position:
                assert base.var_threshold == tamper.var_threshold, (
                    f"forecast for position {forecast_for} changed after a shock at "
                    f"{shock_position}: future data leaked into the estimation window"
                )

        # And the shock must actually matter afterwards, or the test proves nothing.
        later = [
            (b.var_threshold, t.var_threshold)
            for i, (b, t) in enumerate(zip(baseline.series, tampered.series, strict=True))
            if window + i > shock_position
        ]
        assert any(b != t for b, t in later)

    def test_each_threshold_equals_a_direct_estimate_on_the_prior_window(
        self, returns: pd.Series
    ) -> None:
        window = 60
        result = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, window)
        values = returns.to_numpy()

        for i, point in enumerate(result.series):
            t = window + i
            expected = estimate_var(values[t - window : t], VarModel.HISTORICAL, 0.95)
            assert point.var_threshold == pytest.approx(expected, rel=1e-15)


class TestShape:
    def test_produces_exactly_n_minus_window_forecasts(self, returns: pd.Series) -> None:
        for window in (50, 100, 250):
            result = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, window)
            assert result.observations == len(returns) - window

    def test_the_first_forecast_is_for_the_day_after_the_first_window(
        self, returns: pd.Series
    ) -> None:
        window = 250
        result = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, window)
        assert result.series[0].date == returns.index[window].date()
        assert result.series[-1].date == returns.index[-1].date()

    def test_insufficient_history_is_rejected(self, returns: pd.Series) -> None:
        with pytest.raises(ValueError, match="at least"):
            walk_forward_backtest(returns.iloc[:100], VarModel.HISTORICAL, 0.95, 100)

    def test_a_degenerate_window_is_rejected(self, returns: pd.Series) -> None:
        with pytest.raises(ValueError, match="at least two"):
            walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, 1)

    def test_an_unordered_index_is_rejected(self, returns: pd.Series) -> None:
        # "Prior observations" is only meaningful on a sorted index.
        shuffled = returns.sample(frac=1.0, random_state=0)
        with pytest.raises(ValueError, match="sorted by date"):
            walk_forward_backtest(shuffled, VarModel.HISTORICAL, 0.95, 100)

    def test_a_duplicated_date_is_rejected(self, returns: pd.Series) -> None:
        duplicated = pd.concat([returns, returns.iloc[[-1]]])
        with pytest.raises(ValueError, match="duplicate dates"):
            walk_forward_backtest(duplicated, VarModel.HISTORICAL, 0.95, 100)


class TestExceptions:
    def test_an_exception_is_flagged_exactly_when_the_loss_exceeds_the_threshold(
        self, returns: pd.Series
    ) -> None:
        result = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, 100)
        for point in result.series:
            assert point.is_exception == (point.loss > point.var_threshold)

    def test_the_exception_count_agrees_with_the_kupiec_input(
        self, returns: pd.Series
    ) -> None:
        result = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, 100)
        counted = sum(1 for p in result.series if p.is_exception)
        assert result.kupiec.exceptions == counted
        assert result.kupiec.observations == result.observations

    def test_a_loss_exactly_on_the_threshold_is_not_an_exception(self) -> None:
        # The convention is strict inequality, L > VaR (PRD 9.11).
        #
        # A constant window of -1% gives losses that are all exactly 0.01, so
        # every quantile of them is 0.01 too. The test day then lands precisely
        # on its own threshold at a non-zero value, which is what makes this
        # exercise the boundary rather than compare 0.0 with 0.0.
        series = pd.Series(
            [-0.01] * 21,
            index=pd.bdate_range("2024-01-01", periods=21),
        )
        result = walk_forward_backtest(series, VarModel.HISTORICAL, 0.95, 20)

        point = result.series[0]
        assert point.var_threshold == pytest.approx(0.01, abs=1e-15)
        assert point.loss == pytest.approx(0.01, abs=1e-15)
        assert point.is_exception is False

    def test_a_loss_one_ulp_above_the_threshold_is_an_exception(self) -> None:
        # The companion to the test above: the boundary is only meaningful if
        # crossing it by any margin flips the flag.
        series = pd.Series(
            [-0.01] * 20 + [-0.0100001],
            index=pd.bdate_range("2024-01-01", periods=21),
        )
        result = walk_forward_backtest(series, VarModel.HISTORICAL, 0.95, 20)
        assert result.series[0].is_exception is True

    def test_mean_severity_is_undefined_when_nothing_breached(self) -> None:
        # Not zero. There are no exception days to average, so the quantity
        # does not exist, and zero would misreport "no breaches" as "costless
        # breaches" (PRD 16.4).
        flat = pd.Series(np.zeros(60), index=pd.bdate_range("2024-01-01", periods=60))
        result = walk_forward_backtest(flat, VarModel.HISTORICAL, 0.95, 50)

        assert result.exceptions == 0
        assert result.mean_exception_severity is None

    def test_mean_severity_averages_only_the_breaching_days(
        self, returns: pd.Series
    ) -> None:
        result = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, 100)
        breaches = [p.loss for p in result.series if p.is_exception]

        assert result.mean_exception_severity == pytest.approx(float(np.mean(breaches)))
        # Every breach exceeded its own threshold, so their mean must exceed
        # the mean of the thresholds they breached.
        breached_thresholds = [p.var_threshold for p in result.series if p.is_exception]
        assert result.mean_exception_severity > float(np.mean(breached_thresholds))


class TestCalibration:
    def test_a_well_specified_normal_model_is_roughly_calibrated_on_normal_data(
        self,
    ) -> None:
        # A sanity check on the machinery as a whole: when the data really is
        # Normal and homoscedastic, the parametric model should not be rejected.
        rng = np.random.default_rng(202)
        series = pd.Series(
            rng.standard_normal(3000) * 0.01,
            index=pd.bdate_range("2010-01-01", periods=3000),
        )
        result = walk_forward_backtest(series, VarModel.PARAMETRIC_NORMAL, 0.95, 250)

        assert result.kupiec.exception_rate == pytest.approx(0.05, abs=0.015)
        assert result.kupiec.verdict == "pass"

    def test_a_higher_confidence_level_produces_fewer_exceptions(
        self, returns: pd.Series
    ) -> None:
        at95 = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.95, 250)
        at99 = walk_forward_backtest(returns, VarModel.HISTORICAL, 0.99, 250)
        assert at99.exceptions <= at95.exceptions
        assert at99.average_var >= at95.average_var


class TestCompareModels:
    def test_returns_one_result_per_model_and_confidence_pair(
        self, returns: pd.Series
    ) -> None:
        results = compare_models(
            returns,
            models=list(VarModel),
            confidence_levels=[0.95, 0.99],
            window=250,
        )
        assert len(results) == 6
        assert {(r.model, r.confidence) for r in results} == {
            (model, confidence) for model in VarModel for confidence in (0.95, 0.99)
        }

    def test_every_pair_is_scored_over_the_same_number_of_days(
        self, returns: pd.Series
    ) -> None:
        results = compare_models(returns, list(VarModel), [0.95], window=250)
        assert len({r.observations for r in results}) == 1
