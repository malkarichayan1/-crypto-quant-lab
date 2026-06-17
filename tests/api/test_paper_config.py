from hedgefund.api.config import Settings


def test_settings_has_paper_defaults():
    s = Settings(
        database_url="x",
        anthropic_api_key=None,
        anthropic_model="m",
        paper_tick_interval_seconds=60,
        paper_fetch_lookback_bars=1000,
    )
    assert s.paper_tick_interval_seconds == 60
    assert s.paper_fetch_lookback_bars == 1000
