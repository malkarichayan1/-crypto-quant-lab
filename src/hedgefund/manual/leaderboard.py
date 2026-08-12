from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

SPARKLINE_POINTS = 40

Point = tuple[datetime, float]


@dataclass(frozen=True)
class LeaderboardRow:
    label: str
    kind: str  # "you" | "ai" | "benchmark"
    start_date: datetime
    total_return_pct: float
    equity: float
    sparkline: tuple[float, ...]


def _downsample(values: Sequence[float], target: int = SPARKLINE_POINTS) -> tuple[float, ...]:
    """Evenly thin a series to at most `target` points, always keeping the
    first and last so the sparkline's endpoints match the stated return."""
    if len(values) <= target:
        return tuple(values)
    step = (len(values) - 1) / (target - 1)
    picked = [values[round(i * step)] for i in range(target)]
    picked[-1] = values[-1]
    return tuple(picked)


def row_from_series(
    label: str, points: Sequence[Point], *, starting_cash: float, kind: str = "you"
) -> LeaderboardRow | None:
    """Build one row from an equity series. None when there is nothing to show.

    Return is measured against `starting_cash`, not against the first snapshot:
    snapshots can begin after trading has already moved the balance, and
    anchoring on the first point would silently hide that early performance.
    """
    if not points:
        return None

    values = [v for _ts, v in points]
    equity = values[-1]
    return LeaderboardRow(
        label=label,
        kind=kind,
        start_date=points[0][0],
        total_return_pct=((equity - starting_cash) / starting_cash) if starting_cash else 0.0,
        equity=equity,
        sparkline=_downsample(values),
    )


def buy_and_hold_series(
    closes: Sequence[Point], *, starting_cash: float, since: datetime | None = None
) -> list[Point]:
    """Equity curve for putting all the cash into the asset at the first close
    on or after `since` and never trading again."""
    window = [p for p in closes if since is None or p[0] >= since]
    if not window:
        return []
    entry_price = window[0][1]
    if entry_price <= 0:
        return []
    units = starting_cash / entry_price
    return [(ts, units * price) for ts, price in window]


def rank_rows(rows: Sequence[LeaderboardRow | None]) -> list[LeaderboardRow]:
    """Best return first. Nones (participants with no data) are dropped."""
    return sorted(
        (r for r in rows if r is not None),
        key=lambda r: r.total_return_pct,
        reverse=True,
    )
