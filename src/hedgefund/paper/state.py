from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class PaperState:
    """Resumable runtime state of a paper-trading session.

    Mirrors the locals carried across bars in `engine.backtest.run_backtest`:
    a Portfolio (cash + positions), the target decided last bar (filled this
    bar), and the time-series indicator memory. All fields are JSON-serializable
    so the whole state persists in `paper_sessions.state_json`.
    """

    cash: float
    positions: dict[str, float] = field(default_factory=dict)
    pending_target: dict[str, float] | None = None
    ts_state: dict[str, bool] = field(default_factory=dict)
    prev_ts: str | None = None
    last_processed_ts: str | None = None

    @classmethod
    def initial(cls, starting_cash: float, *, start_ts: str | None = None) -> "PaperState":
        """Fresh session state. `start_ts` stamps the high-water mark so the
        lookback window warms indicators but only candles closing after launch
        are recorded (see H2 / Task 13). Omit it for pure-logic tests that want
        every candle processed."""
        return cls(cash=starting_cash, last_processed_ts=start_ts)

    def to_json(self) -> dict:
        return asdict(self)

    @classmethod
    def from_json(cls, data: dict) -> "PaperState":
        return cls(
            cash=data["cash"],
            positions=dict(data.get("positions") or {}),
            pending_target=(dict(data["pending_target"]) if data.get("pending_target") else None),
            ts_state=dict(data.get("ts_state") or {}),
            prev_ts=data.get("prev_ts"),
            last_processed_ts=data.get("last_processed_ts"),
        )
