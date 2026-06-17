import uuid

import pandas as pd

from hedgefund.data.panel import PricePanel
from hedgefund.paper.state import PaperState
from hedgefund.paper.ticker import catch_up_session


class FakeRepo:
    def __init__(self, status="active"):
        self.ticks = []
        self.errors = []
        self._status = status

    def get_status(self, sid):
        return self._status

    def record_tick(self, *, session_id, state_json, fills, equity, ts, is_catchup):
        self.ticks.append({"ts": ts, "equity": equity, "fills": fills,
                           "is_catchup": is_catchup, "state": state_json})

    def set_error(self, sid, msg):
        self.errors.append(msg)


class FakeSession:
    def __init__(self, spec_json, state, universe=("BTC/USDT",), tf="1h"):
        self.id = uuid.uuid4()
        self.spec_json = spec_json
        self.state_json = state.to_json()
        self.universe = list(universe)
        self.timeframe = tf
        self.starting_cash = 10_000.0


def _panel(index, prices):
    df = pd.DataFrame({"BTC/USDT": prices}, index=pd.DatetimeIndex(index))
    return PricePanel(open=df, high=df, low=df, close=df, volume=df * 0 + 1.0)


def _spec_json():
    return {"name": "always-long", "universe": ["BTC/USDT"],
            "indicators": [{"type": "sma", "id": "s", "period": 1}],
            "selection": {"mode": "time_series",
                          "entry": {"indicator_id": "s", "op": ">", "value": 0},
                          "exit": {"indicator_id": "s", "op": "<", "value": 0}},
            "sizing": {"scheme": "equal_weight", "gross_leverage": 1.0},
            "costs": {"fee_bps": 0.0, "slippage_bps": 0.0},
            "start": "2026-06-17", "end": "2026-06-30"}


def test_processes_only_candles_after_high_water_mark():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00", "2026-06-17T02:00:00"]
    panel = _panel(index, [100.0, 110.0, 120.0])
    state = PaperState.initial(10_000.0)
    state.last_processed_ts = pd.Timestamp(index[0]).isoformat()  # bar 0 already done
    sess = FakeSession(_spec_json(), state)
    repo = FakeRepo()
    published = []

    catch_up_session(sess, panel, repo, publish=lambda ev: published.append(ev))

    assert [t["ts"] for t in repo.ticks] == [
        panel.close.index[1].to_pydatetime(), panel.close.index[2].to_pydatetime()]
    assert all(t["is_catchup"] for t in repo.ticks)   # >1 candle => catch-up
    assert all(ev["type"] == "tick" for ev in published)


def test_single_new_candle_is_not_catchup():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00"]
    panel = _panel(index, [100.0, 110.0])
    state = PaperState.initial(10_000.0)
    state.last_processed_ts = pd.Timestamp(index[0]).isoformat()
    sess = FakeSession(_spec_json(), state)
    repo = FakeRepo()

    catch_up_session(sess, panel, repo, publish=lambda ev: None)

    assert len(repo.ticks) == 1
    assert repo.ticks[0]["is_catchup"] is False


def test_stop_mid_backfill_halts():
    index = ["2026-06-17T00:00:00", "2026-06-17T01:00:00", "2026-06-17T02:00:00"]
    panel = _panel(index, [100.0, 110.0, 120.0])
    state = PaperState.initial(10_000.0)  # last_processed_ts None => all candles pending
    sess = FakeSession(_spec_json(), state)
    repo = FakeRepo(status="stopped")  # already stopped
    catch_up_session(sess, panel, repo, publish=lambda ev: None)
    assert repo.ticks == []  # status checked before each candle


def test_error_is_isolated_and_recorded():
    panel = _panel(["2026-06-17T00:00:00"], [100.0])
    sess = FakeSession({"bad": "spec"}, PaperState.initial(10_000.0))  # invalid spec
    repo = FakeRepo()
    catch_up_session(sess, panel, repo, publish=lambda ev: None)
    assert repo.errors  # set_error called, no exception escapes
