"""Mechanics of the exit-rule experiment: rules, execution, costs and metrics.

Everything here works on one series of daily **log** returns ``r``, where
``r[t] = ln(P_t / P_{t-1})`` is known at the close of day ``t``.

Timing, which is the whole game in a study like this
-----------------------------------------------------
A rule produces ``target[t]``, the equity exposure it wants, using information
up to and including the close of day ``t`` and nothing later. The order is
executed at the close of day ``t + 1`` (a signal computed from today's close
cannot also trade at today's close). The first return the new exposure earns is
therefore ``r[t + 2]``::

    exposure[t] = target[t - EXECUTION_LAG]        with EXECUTION_LAG = 2

so a shock on day ``t`` cannot change exposure before day ``t + 2``. The lag is
applied in exactly one place, :func:`simulate`, and is tested adversarially.

Every rule is inactive (fully invested) until the close of day
``WARMUP - 1``: the EWMA volatility needs a 250-day seed, and starting all rules
on the same day keeps the comparison like for like. Metrics are measured from
day ``WARMUP`` onwards.

Only NumPy is used (no SciPy, no pandas), so this file has no dependency the
deployed backend would not already carry.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from statistics import NormalDist

import numpy as np

TRADING_DAYS = 252
#: Close t signal -> close t+1 trade -> first return earned on day t+2.
EXECUTION_LAG = 2
#: Days before any rule may act; also the EWMA seed window.
WARMUP = 250
#: RiskMetrics decay.
EWMA_LAMBDA = 0.94
Z_95 = NormalDist().inv_cdf(0.95)
#: HOSE's daily limit is -7%. A close at or below -6.5% is treated as "at the
#: floor": sell orders queue and typically do not fill. The margin absorbs tick
#: rounding and the vendor's back-adjustment of historical closes.
FLOOR_RETURN = -0.065
#: Horizon over which an exit is judged a whipsaw.
WHIPSAW_HORIZON = 20


@dataclass(frozen=True)
class Costs:
    """Trading frictions. Rates are decimals; ``cash_rate`` is annual."""

    fee: float = 0.0015  # brokerage, each side
    sales_tax: float = 0.001  # Vietnamese tax on the value sold
    cash_rate: float = 0.0  # what uninvested money earns

    @property
    def cash_daily(self) -> float:
        return (1.0 + self.cash_rate) ** (1.0 / TRADING_DAYS) - 1.0


@dataclass(frozen=True)
class Series:
    """A return series plus the quantities every rule reads.

    ``price[t]`` is the price index at the close of ``t`` (``price[-1]`` before
    the first return is 1). ``sigma[t]`` is the EWMA one-day volatility forecast
    for day ``t + 1`` built from ``r[0..t]``; it is ``nan`` before the seed
    window has been observed.
    """

    r: np.ndarray
    price: np.ndarray
    sigma: np.ndarray

    @classmethod
    def from_log_returns(cls, r: np.ndarray) -> Series:
        r = np.asarray(r, dtype=float)
        if len(r) <= WARMUP + EXECUTION_LAG:
            raise ValueError(f"need more than {WARMUP + EXECUTION_LAG} returns, got {len(r)}")
        return cls(r=r, price=np.exp(np.cumsum(r)), sigma=ewma_sigma(r))

    def __len__(self) -> int:
        return len(self.r)


def ewma_sigma(r: np.ndarray, lam: float = EWMA_LAMBDA, seed: int = WARMUP) -> np.ndarray:
    """Zero-mean EWMA volatility; ``out[t]`` uses ``r[0..t]`` only.

    Seeded with the sample variance of the first ``seed`` returns, so the first
    defined value is at ``t = seed - 1`` - the close at which those returns have
    all been observed. Earlier entries are ``nan`` rather than a value that
    would quietly use the future.
    """
    out = np.full(len(r), np.nan)
    s2 = float(np.var(r[:seed], ddof=1))
    out[seed - 1] = np.sqrt(s2)
    for t in range(seed, len(r)):
        s2 = lam * s2 + (1.0 - lam) * r[t] ** 2
        out[t] = np.sqrt(s2)
    return out


# --------------------------------------------------------------------------- rules
#
# Each rule returns target[t] for every t, computed in a forward loop that reads
# only index <= t. Before WARMUP - 1 the target is 1 (fully invested).

START = WARMUP - 1  # first close at which a rule may act


def fixed_stop(s: Series, stop: float = 0.07, wait: int = 20) -> np.ndarray:
    """Sell when the price is ``stop`` below the entry price; buy back ``wait`` days later.

    The common Vietnamese retail rule ("cut at -7% from cost"). The entry price
    resets on every re-entry.
    """
    target = np.ones(len(s))
    invested, entry, back_on = True, s.price[START], -1
    for t in range(START, len(s)):
        if invested and s.price[t] / entry - 1.0 <= -stop:
            invested, back_on = False, t + wait
        elif not invested and t >= back_on:
            invested, entry = True, s.price[t]
        target[t] = 1.0 if invested else 0.0
    return target


def trailing_stop(s: Series, stop: float = 0.10, wait: int = 20) -> np.ndarray:
    """Sell ``stop`` below the high since entry; buy back ``wait`` days later."""
    target = np.ones(len(s))
    invested, peak, back_on = True, s.price[START], -1
    for t in range(START, len(s)):
        if invested:
            peak = max(peak, s.price[t])
            if s.price[t] / peak - 1.0 <= -stop:
                invested, back_on = False, t + wait
        elif t >= back_on:
            invested, peak = True, s.price[t]
        target[t] = 1.0 if invested else 0.0
    return target


def vol_target(s: Series, target_vol: float, band: float = 0.10) -> np.ndarray:
    """Hold ``min(1, target_vol / forecast_vol)``; trade only on moves larger than ``band``."""
    target = np.ones(len(s))
    current = 1.0
    for t in range(START, len(s)):
        wanted = min(1.0, target_vol / (s.sigma[t] * np.sqrt(TRADING_DAYS)))
        if abs(wanted - current) > band:
            current = wanted
        target[t] = current
    return target


def default_target_vol(s: Series) -> float:
    """Three quarters of the series' own volatility over the warm-up window.

    A "textbook" setting that needs no fitting and uses only data seen by the
    first close at which a rule may act.
    """
    return 0.75 * float(np.std(s.r[:WARMUP], ddof=1)) * np.sqrt(TRADING_DAYS)


def var_breach(s: Series, breaches: int = 3, window: int = 20) -> np.ndarray:
    """Go to cash after ``breaches`` 95% EWMA-VaR exceptions in ``window`` days.

    Day ``t`` is an exception when its loss exceeds the VaR forecast made at the
    previous close, ``Z_95 * sigma[t-1]``. Re-enter once ``window`` days have
    passed without any.
    """
    n = len(s)
    exception = np.zeros(n, dtype=bool)
    exception[START + 1 :] = -s.r[START + 1 :] > Z_95 * s.sigma[START:-1]
    target = np.ones(n)
    invested = True
    for t in range(START, n):
        recent = int(exception[max(0, t - window + 1) : t + 1].sum())
        if invested and recent >= breaches:
            invested = False
        elif not invested and recent == 0:
            invested = True
        target[t] = 1.0 if invested else 0.0
    return target


def drawdown_control(s: Series, threshold: float = 0.20, reduced: float = 0.5) -> np.ndarray:
    """Cut to ``reduced`` exposure when the price is ``threshold`` below its running
    high; restore full exposure once the drawdown recovers to half that."""
    target = np.ones(len(s))
    peak, cut = s.price[START], False
    for t in range(START, len(s)):
        peak = max(peak, s.price[t])
        drawdown = s.price[t] / peak - 1.0
        if not cut and drawdown <= -threshold:
            cut = True
        elif cut and drawdown > -threshold / 2:
            cut = False
        target[t] = reduced if cut else 1.0
    return target


@dataclass(frozen=True)
class Rule:
    name: str
    fn: Callable[..., np.ndarray]
    #: Fixed "textbook" parameters. ``None`` means "derive from the series".
    default: tuple | None
    #: Grid searched when the rule is fitted in-sample.
    grid: tuple[tuple, ...]

    def params_for(self, s: Series) -> tuple:
        return self.default if self.default is not None else (default_target_vol(s),)

    def target(self, s: Series, params: tuple | None = None) -> np.ndarray:
        return self.fn(s, *(params if params is not None else self.params_for(s)))


RULES: tuple[Rule, ...] = (
    Rule("Fixed stop 7% from cost", fixed_stop, (0.07, 20),
         tuple((x, 20) for x in (0.05, 0.07, 0.10, 0.15))),
    Rule("Trailing stop", trailing_stop, (0.10, 20),
         tuple((x, w) for x in (0.05, 0.07, 0.10, 0.15, 0.20) for w in (10, 20, 60))),
    Rule("Vol targeting (EWMA)", vol_target, None,
         tuple((v,) for v in (0.10, 0.125, 0.15, 0.175, 0.20, 0.25))),
    Rule("VaR-breach exit", var_breach, (3, 20),
         tuple((k, 20) for k in (2, 3, 4, 5))),
    Rule("Drawdown control", drawdown_control, (0.20, 0.5),
         tuple((a, 0.5) for a in (0.10, 0.15, 0.20, 0.25))),
)  # fmt: skip


# ------------------------------------------------------------------- execution


def simulate(
    target: np.ndarray, r: np.ndarray, costs: Costs, floor_blocks_sells: bool = False
) -> tuple[np.ndarray, np.ndarray]:
    """Turn a target-exposure series into net daily simple returns.

    Returns ``(net, exposure)``. ``exposure[t]`` is the equity fraction held
    over day ``t`` and was fixed at the close of ``t - 1``. The portfolio starts
    fully invested, so no entry cost is charged on day 0 for any strategy.

    With ``floor_blocks_sells`` a *reduction* cannot execute at a close that was
    at the daily floor (single stocks only): the order is retried at the next
    close against whatever the rule then wants. Purchases are never blocked.
    """
    n = len(r)
    gross = np.expm1(r)

    # The lag, applied here and nowhere else.
    wanted = np.ones(n)
    wanted[EXECUTION_LAG:] = target[: n - EXECUTION_LAG]

    exposure = np.empty(n)
    held = 1.0
    for t in range(n):
        # The trade setting exposure[t] executes at the close of day t - 1.
        sell_blocked = (
            floor_blocks_sells and wanted[t] < held and t >= 1 and gross[t - 1] <= FLOOR_RETURN
        )
        if not sell_blocked:
            held = wanted[t]
        exposure[t] = held

    traded = np.diff(exposure, prepend=1.0)
    net = (
        exposure * gross
        + (1.0 - exposure) * costs.cash_daily
        - np.abs(traded) * costs.fee
        - np.clip(-traded, 0.0, None) * costs.sales_tax
    )
    return net, exposure


def static_mix(exposure: np.ndarray, r: np.ndarray, costs: Costs) -> tuple[np.ndarray, float]:
    """The fair benchmark: a constant equity fraction equal to the rule's mean exposure.

    Returns ``(net, k)``. It is treated exactly as a rule's constant-exposure
    stretches are: held at a fixed fraction with no trading cost. Comparing a
    rule with buy-and-hold mostly measures *how much less equity it held*; this
    comparison isolates whether its *timing* added anything.
    """
    k = float(np.mean(exposure))
    return k * np.expm1(r) + (1.0 - k) * costs.cash_daily, k


# --------------------------------------------------------------------- metrics


@dataclass(frozen=True)
class Metrics:
    cagr: float
    max_drawdown: float  # negative
    es95: float  # positive daily loss
    exposure: float
    exits: int
    whipsaw: float  # nan when there were no judgeable exits


def cagr(net: np.ndarray) -> float:
    return float(np.prod(1.0 + net) ** (TRADING_DAYS / len(net)) - 1.0)


def max_drawdown(net: np.ndarray) -> float:
    wealth = np.cumprod(1.0 + net)
    peak = np.maximum.accumulate(np.r_[1.0, wealth])[1:]
    return float(np.min(wealth / peak - 1.0))


def expected_shortfall(net: np.ndarray, level: float = 0.95) -> float:
    """Historical ES: mean loss at or beyond the linear-interpolated quantile."""
    loss = -net
    threshold = np.quantile(loss, level, method="linear")
    return float(loss[loss >= threshold].mean())


def whipsaw_rate(
    exposure: np.ndarray, price: np.ndarray, start: int, stop: int
) -> tuple[int, float]:
    """Share of exits after which the underlying was higher ``WHIPSAW_HORIZON`` days later.

    An exit is any executed reduction in exposure. It executes at the close of
    ``t - 1`` for ``exposure[t]``, so the price is compared from that close.
    Exits too close to the end of the data to be judged are excluded.
    """
    t = np.arange(max(start, 1), stop)
    t = t[exposure[t] < exposure[t - 1]]
    judgeable = t[t - 1 + WHIPSAW_HORIZON < len(price)]
    if len(judgeable) == 0:
        return len(t), float("nan")
    later_higher = price[judgeable - 1 + WHIPSAW_HORIZON] > price[judgeable - 1]
    return len(t), float(np.mean(later_higher))


def measure(
    net: np.ndarray,
    exposure: np.ndarray,
    price: np.ndarray,
    start: int = WARMUP,
    stop: int | None = None,
) -> Metrics:
    stop = len(net) if stop is None else stop
    window = net[start:stop]
    exits, whipsaw = whipsaw_rate(exposure, price, start, stop)
    return Metrics(
        cagr=cagr(window),
        max_drawdown=max_drawdown(window),
        es95=expected_shortfall(window),
        exposure=float(np.mean(exposure[start:stop])),
        exits=exits,
        whipsaw=whipsaw,
    )
