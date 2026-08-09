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


def test_advisor_is_enabled_by_default(monkeypatch):
    from hedgefund.api.config import get_settings

    monkeypatch.delenv("MANUAL_ADVISOR_ENABLED", raising=False)
    get_settings.cache_clear()
    try:
        assert get_settings().advisor_enabled is True
    finally:
        get_settings.cache_clear()


def test_advisor_can_be_disabled_by_env(monkeypatch):
    from hedgefund.api.config import get_settings

    monkeypatch.setenv("MANUAL_ADVISOR_ENABLED", "0")
    get_settings.cache_clear()
    try:
        assert get_settings().advisor_enabled is False
    finally:
        get_settings.cache_clear()
