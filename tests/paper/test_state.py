from hedgefund.paper.state import PaperState


def test_round_trip_json():
    state = PaperState(
        cash=9000.0,
        positions={"BTC/USDT": 0.1},
        pending_target={"BTC/USDT": 1.0},
        ts_state={"BTC/USDT": True},
        prev_ts="2026-06-17T00:00:00",
        last_processed_ts="2026-06-17T01:00:00",
    )
    restored = PaperState.from_json(state.to_json())
    assert restored == state


def test_initial_state_factory():
    state = PaperState.initial(starting_cash=10_000.0)
    assert state.cash == 10_000.0
    assert state.positions == {}
    assert state.pending_target is None
    assert state.ts_state == {}
    assert state.prev_ts is None
    assert state.last_processed_ts is None


def test_initial_with_start_ts_stamps_high_water_mark():
    state = PaperState.initial(10_000.0, start_ts="2026-06-17T12:00:00+00:00")
    assert state.last_processed_ts == "2026-06-17T12:00:00+00:00"
    assert state.cash == 10_000.0
    assert state.positions == {}
