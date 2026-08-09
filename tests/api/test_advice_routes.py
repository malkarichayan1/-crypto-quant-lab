from __future__ import annotations

import json

import pytest

from hedgefund.api.deps import get_call_llm

_GOOD = json.dumps({"suggestions": [
    {"text": "Consider buying BTC", "why": "It looks oversold.",
     "action": {"side": "buy", "symbol": "BTC", "usd_amount": 100}},
]})


@pytest.fixture
def llm_ok(client):
    """Override the LLM dependency with a deterministic canned response.

    Yields the list of calls made, so tests can assert the LLM was (or was
    not) reached.
    """
    calls = []

    def fake(messages, model="m", max_tokens=1024):
        calls.append(messages)
        return _GOOD, 0.0

    client.app.dependency_overrides[get_call_llm] = lambda: fake
    yield calls
    client.app.dependency_overrides.pop(get_call_llm, None)


def test_get_advice_returns_null_when_nothing_is_cached(client, llm_ok):
    response = client.get("/advice")

    assert response.status_code == 200
    assert response.json()["advice"] is None
    assert response.json()["enabled"] is True


def test_get_advice_never_calls_the_llm(client, llm_ok):
    client.get("/advice")

    assert llm_ok == []


def test_post_advice_generates_and_returns_suggestions(client, llm_ok):
    response = client.post("/advice")

    assert response.status_code == 201
    body = response.json()["advice"]
    assert body["source"] == "llm"
    assert body["suggestions"][0]["text"] == "Consider buying BTC"
    assert body["disclaimer"]


def test_post_advice_calls_the_llm_exactly_once(client, llm_ok):
    client.post("/advice")

    assert len(llm_ok) == 1


def test_get_advice_serves_the_cache_written_by_post(client, llm_ok):
    client.post("/advice")

    response = client.get("/advice")

    assert response.json()["advice"]["suggestions"][0]["text"] == "Consider buying BTC"
    assert len(llm_ok) == 1  # still only the POST's call


def test_post_advice_reuses_a_fresh_cache_instead_of_calling_again(client, llm_ok):
    client.post("/advice")
    client.post("/advice")

    assert len(llm_ok) == 1


def test_post_advice_accepts_a_symbol_scope(client, llm_ok):
    response = client.post("/advice?symbol=BTC")

    assert response.status_code == 201
    assert response.json()["advice"]["suggestions"]


def test_symbol_scoped_advice_is_cached_separately_from_portfolio_advice(client, llm_ok):
    client.post("/advice")
    client.post("/advice?symbol=BTC")

    assert len(llm_ok) == 2


def test_post_advice_rejects_an_unknown_symbol(client, llm_ok):
    response = client.post("/advice?symbol=NOTACOIN")

    assert response.status_code == 404


def test_post_advice_falls_back_to_template_when_the_llm_fails(client):
    def boom(messages, model="m", max_tokens=1024):
        raise RuntimeError("down")

    client.app.dependency_overrides[get_call_llm] = lambda: boom
    try:
        response = client.post("/advice")
    finally:
        client.app.dependency_overrides.pop(get_call_llm, None)

    assert response.status_code == 201
    assert response.json()["advice"]["source"] == "template"
    assert response.json()["advice"]["suggestions"]


def test_advice_reports_disabled_when_the_kill_switch_is_off(client, llm_ok, monkeypatch):
    from hedgefund.api.config import get_settings

    monkeypatch.setenv("MANUAL_ADVISOR_ENABLED", "0")
    get_settings.cache_clear()
    try:
        get_response = client.get("/advice")
        post_response = client.post("/advice")
    finally:
        get_settings.cache_clear()

    assert get_response.json() == {"enabled": False, "advice": None}
    assert post_response.status_code == 200
    assert post_response.json() == {"enabled": False, "advice": None}
    assert llm_ok == []


def test_post_advice_returns_503_when_prices_are_unavailable(client, llm_ok, market_data):
    market_data.unavailable = True

    response = client.post("/advice")

    assert response.status_code == 503
