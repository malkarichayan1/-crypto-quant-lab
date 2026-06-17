from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

import pandas as pd

from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.indicators import compute_all
from hedgefund.paper.engine import step
from hedgefund.paper.state import PaperState

logger = logging.getLogger(__name__)


def catch_up_session(session_row, panel, repo, publish: Callable[[dict], None]) -> None:
    """Advance one session through every candle after its high-water mark.

    I/O is the injected `repo` and `publish`. Isolates errors so one bad session
    never aborts the shared ticker. `panel` covers the lookback window through
    now for this session's universe."""
    try:
        spec = StrategySpec.model_validate(session_row.spec_json)
        state = PaperState.from_json(session_row.state_json)
        last = pd.Timestamp(state.last_processed_ts) if state.last_processed_ts else None
        candles = [ts for ts in panel.close.index if last is None or ts > last]
        if not candles:
            return
        is_catchup = len(candles) > 1
        indicators = compute_all(spec.indicators, panel.close)
        for ts in candles:
            if repo.get_status(session_row.id) != "active":
                break
            new_state, fills, equity = step(spec, state, panel, indicators, ts)
            fill_dicts = [{"symbol": f.symbol, "units": f.units, "price": f.price} for f in fills]
            repo.record_tick(
                session_id=session_row.id,
                state_json=new_state.to_json(),
                fills=fill_dicts,
                equity=equity,
                ts=ts.to_pydatetime(),
                is_catchup=is_catchup,
            )
            publish({
                "type": "tick",
                "ts": ts.isoformat(),
                "equity": equity,
                "cash": new_state.cash,
                "positions": new_state.positions,
                "fills": fill_dicts,
                "is_catchup": is_catchup,
            })
            state = new_state
    except Exception as exc:  # noqa: BLE001 - isolate per-session failure
        logger.exception("paper session %s failed", getattr(session_row, "id", "?"))
        repo.set_error(session_row.id, str(exc))


def run_ticker_cycle(repo, panel_loader, publish_for, lookback_bars: int) -> None:
    """One catch-up pass over all active sessions. Groups sessions by
    (universe, timeframe) so each group fetches a panel once."""
    active = repo.list_active_sessions()
    if not active:
        return
    groups: dict[tuple, list] = {}
    for s in active:
        groups.setdefault((frozenset(s.universe), s.timeframe), []).append(s)
    for (universe, timeframe), sessions in groups.items():
        try:
            panel = panel_loader(sorted(universe), timeframe, lookback_bars)
        except Exception:  # noqa: BLE001 - transient fetch failure; retry next cycle
            logger.warning("panel fetch failed for %s/%s; retrying next cycle", universe, timeframe)
            continue
        for s in sessions:
            catch_up_session(s, panel, repo, publish_for(s.id))


async def ticker_loop(
    session_factory, panel_loader, publish_for, interval_seconds: int, lookback_bars: int
) -> None:
    """Background loop: every `interval_seconds`, run one catch-up cycle in a
    worker thread (sync DB + ccxt) so the event loop stays responsive."""
    from hedgefund.api.db.paper_repository import PaperRepository

    while True:
        def _cycle() -> None:
            db = session_factory()
            try:
                repo = PaperRepository(db)
                run_ticker_cycle(repo, panel_loader, publish_for, lookback_bars)
                db.commit()
            finally:
                db.close()

        try:
            await asyncio.to_thread(_cycle)
        except Exception:  # noqa: BLE001 - never let the loop die
            logger.exception("ticker cycle crashed; continuing")
        await asyncio.sleep(interval_seconds)
