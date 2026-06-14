from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import pandas as pd

FIELDS = ("open", "high", "low", "close", "volume")


@dataclass(frozen=True)
class PricePanel:
    """OHLCV for a set of symbols over a date index.

    Each field is a DataFrame indexed by date with one column per symbol.
    A NaN close marks a bar where the symbol is not tradable (e.g. pre-listing).
    """

    open: pd.DataFrame
    high: pd.DataFrame
    low: pd.DataFrame
    close: pd.DataFrame
    volume: pd.DataFrame

    @property
    def dates(self) -> pd.DatetimeIndex:
        return self.close.index

    @property
    def symbols(self) -> pd.Index:
        return self.close.columns

    def is_tradable(self, symbol: str, t: date) -> bool:
        return bool(np.isfinite(self.close.loc[t, symbol]))

    def close_at(self, symbol: str, t: date) -> float:
        return float(self.close.loc[t, symbol])

    def open_at(self, symbol: str, t: date) -> float:
        return float(self.open.loc[t, symbol])

    @classmethod
    def from_field_frames(cls, frames: dict[str, pd.DataFrame]) -> "PricePanel":
        return cls(**{f: frames[f] for f in FIELDS})
