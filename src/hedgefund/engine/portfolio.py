from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Portfolio:
    cash: float
    positions: dict[str, float] = field(default_factory=dict)  # symbol -> units

    def value(self, prices: dict[str, float]) -> float:
        total = self.cash
        for sym, units in self.positions.items():
            total += units * prices[sym]
        return total
