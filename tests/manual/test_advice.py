from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from hedgefund.manual import advice as adv
from hedgefund.manual.portfolio_service import PortfolioViewData
from hedgefund.manual.signals import CoinSignal, PortfolioContext
from tests.fixtures.market import make_quote


def _signal(symbol: str, *, cross="none", zone="neutral", momentum=0.0, price=100.0) -> CoinSignal:
    return CoinSignal(
        symbol=symbol, price=price, sma_short=1.0, sma_long=1.0,
        sma_cross=cross, rsi=50.0, rsi_zone=zone, momentum_pct=momentum,
    )


def _context(**overrides) -> PortfolioContext:
    base = dict(
        equity=10_000.0, cash=5_000.0, idle_cash_pct=0.5,
        top_symbol="BTC", top_concentration_pct=0.4,
        holdings_count=2, total_return_pct=0.05,
    )
    base.update(overrides)
    return PortfolioContext(**base)


# ---- symbol selection ----

def test_select_symbols_puts_held_coins_first():
    quotes = [make_quote("BTC", "Bitcoin", 100.0), make_quote("ETH", "Ethereum", 10.0)]

    picked = adv.select_symbols(held=["ETH"], quotes=quotes, limit=2)

    assert picked[0] == "ETH"


def test_select_symbols_fills_remaining_slots_with_biggest_movers():
    quotes = [
        make_quote("BTC", "Bitcoin", 100.0, change=0.01),
        make_quote("ETH", "Ethereum", 10.0, change=-0.30),
        make_quote("SOL", "Solana", 5.0, change=0.05),
    ]

    picked = adv.select_symbols(held=[], quotes=quotes, limit=2)

    # ETH moved 30% (absolute), SOL 5%, BTC 1%.
    assert picked == ["ETH", "SOL"]


def test_select_symbols_never_duplicates_a_held_coin():
    quotes = [make_quote("BTC", "Bitcoin", 100.0, change=0.90)]

    picked = adv.select_symbols(held=["BTC"], quotes=quotes, limit=3)

    assert picked == ["BTC"]


def test_select_symbols_respects_the_cap():
    quotes = [make_quote(s, s, 10.0, change=0.1) for s in ("A", "B", "C", "D", "E", "F", "G")]

    picked = adv.select_symbols(held=["A", "B", "C", "D", "E"], quotes=quotes, limit=3)

    assert len(picked) == 3


# ---- template fallback ----

def test_template_advice_always_returns_at_least_one_suggestion():
    suggestions = adv.template_advice([], _context())

    assert len(suggestions) >= 1


def test_template_advice_never_exceeds_three_suggestions():
    signals = [_signal(s, cross="golden", zone="oversold", momentum=0.5)
               for s in ("A", "B", "C", "D", "E")]

    suggestions = adv.template_advice(signals, _context())

    assert len(suggestions) <= 3


def test_template_advice_flags_all_cash_when_no_holdings():
    suggestions = adv.template_advice([], _context(holdings_count=0))

    assert any("cash" in s.text.lower() for s in suggestions)


def test_template_advice_flags_idle_cash():
    # holdings_count must be non-zero here, otherwise execution falls into the
    # "all cash" branch instead of the idle-cash elif this test is named for.
    suggestions = adv.template_advice([], _context(idle_cash_pct=0.95, holdings_count=1))

    assert any("cash" in s.text.lower() for s in suggestions)


def test_template_advice_flags_concentration():
    ctx = _context(idle_cash_pct=0.05, top_symbol="BTC",
                   top_concentration_pct=0.85, holdings_count=1)

    suggestions = adv.template_advice([], ctx)

    assert any("BTC" in s.text for s in suggestions)


def test_template_advice_mentions_an_oversold_coin_by_name():
    suggestions = adv.template_advice([_signal("SOL", zone="oversold")], _context())

    assert any("SOL" in s.text for s in suggestions)


def test_template_advice_mentions_an_overbought_coin_by_name():
    suggestions = adv.template_advice([_signal("SOL", zone="overbought")], _context())

    assert any("SOL" in s.text for s in suggestions)


def test_template_advice_mentions_a_golden_cross_coin_by_name():
    suggestions = adv.template_advice(
        [_signal("SOL", cross="golden", zone="neutral")], _context()
    )

    assert any("SOL" in s.text for s in suggestions)


def test_template_suggestions_carry_no_one_tap_action():
    # The deterministic fallback describes; it never proposes a concrete order.
    suggestions = adv.template_advice([_signal("SOL", zone="oversold")], _context())

    assert all(s.action is None for s in suggestions)


# ---- prompt ----

def test_build_prompt_includes_every_signal_symbol():
    prompt = adv.build_prompt([_signal("BTC"), _signal("ETH")], _context(), scope="portfolio")

    assert "BTC" in prompt
    assert "ETH" in prompt


def test_build_prompt_states_the_json_contract():
    prompt = adv.build_prompt([_signal("BTC")], _context(), scope="portfolio")

    assert "suggestions" in prompt
    assert "usd_amount" in prompt


def test_build_prompt_names_the_focus_coin_when_scoped_to_one():
    prompt = adv.build_prompt([_signal("BTC")], _context(), scope="BTC")

    assert "BTC" in prompt


# ---- payload serialization ----

def test_suggestions_to_payload_serializes_suggestions_and_action():
    suggestions = [
        adv.Suggestion(
            text="Consider a small BTC buy.",
            why="BTC looks oversold.",
            action=adv.SuggestionAction(side="buy", symbol="BTC", usd_amount=250.0),
        ),
    ]

    payload = adv.suggestions_to_payload(suggestions, source="llm")

    assert payload == {
        "suggestions": [
            {
                "text": "Consider a small BTC buy.",
                "why": "BTC looks oversold.",
                "action": {"side": "buy", "symbol": "BTC", "usd_amount": 250.0},
            },
        ],
        "disclaimer": adv.DISCLAIMER,
        "source": "llm",
    }


# ---- LLM response parsing ----

_GOOD = """{"suggestions": [
  {"text": "Consider buying BTC", "why": "It is oversold.",
   "action": {"side": "buy", "symbol": "BTC", "usd_amount": 100}},
  {"text": "Watch ETH", "why": "Nothing to do yet.", "action": null}
]}"""


def test_parse_llm_advice_reads_a_well_formed_response():
    parsed = adv.parse_llm_advice(_GOOD, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert len(parsed) == 2
    assert parsed[0].action.side == "buy"
    assert parsed[0].action.usd_amount == 100
    assert parsed[1].action is None


def test_parse_llm_advice_tolerates_markdown_code_fences():
    fenced = f"```json\n{_GOOD}\n```"

    parsed = adv.parse_llm_advice(fenced, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert len(parsed) == 2


def test_parse_llm_advice_tolerates_leading_prose():
    noisy = f"Sure! Here is my advice:\n\n{_GOOD}"

    parsed = adv.parse_llm_advice(noisy, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert len(parsed) == 2


def test_parse_llm_advice_rejects_non_json():
    with pytest.raises(adv.AdviceParseError):
        adv.parse_llm_advice("I cannot help with that.",
                             known_symbols={"BTC"}, cash=1_000.0, holdings={})


def test_parse_llm_advice_rejects_an_empty_suggestion_list():
    with pytest.raises(adv.AdviceParseError):
        adv.parse_llm_advice('{"suggestions": []}',
                             known_symbols={"BTC"}, cash=1_000.0, holdings={})


def test_parse_llm_advice_caps_the_suggestion_count():
    many = json.dumps({"suggestions": [
        {"text": f"t{i}", "why": "w", "action": None} for i in range(9)
    ]})

    parsed = adv.parse_llm_advice(many, known_symbols={"BTC"}, cash=1_000.0, holdings={})

    assert len(parsed) == adv.MAX_SUGGESTIONS


def test_parse_llm_advice_strips_an_unaffordable_buy_but_keeps_the_text():
    body = json.dumps({"suggestions": [
        {"text": "Buy a lot of BTC", "why": "why",
         "action": {"side": "buy", "symbol": "BTC", "usd_amount": 999_999}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC"}, cash=100.0, holdings={})

    assert parsed[0].text == "Buy a lot of BTC"
    assert parsed[0].action is None


def test_parse_llm_advice_strips_a_sell_of_an_unheld_coin():
    body = json.dumps({"suggestions": [
        {"text": "Sell ETH", "why": "why",
         "action": {"side": "sell", "symbol": "ETH", "usd_amount": 50}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={})

    assert parsed[0].action is None


def test_parse_llm_advice_keeps_a_sell_within_the_held_value():
    body = json.dumps({"suggestions": [
        {"text": "Trim ETH", "why": "why",
         "action": {"side": "sell", "symbol": "ETH", "usd_amount": 40}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC", "ETH"},
                                  cash=1_000.0, holdings={"ETH": 100.0})

    assert parsed[0].action.side == "sell"
    assert parsed[0].action.usd_amount == 40


def test_parse_llm_advice_strips_an_action_for_an_unknown_symbol():
    body = json.dumps({"suggestions": [
        {"text": "Buy DOGECOINX", "why": "why",
         "action": {"side": "buy", "symbol": "DOGECOINX", "usd_amount": 10}}
    ]})

    parsed = adv.parse_llm_advice(body, known_symbols={"BTC"}, cash=1_000.0, holdings={})

    assert parsed[0].action is None


# ---- generation orchestration ----

class _FakeRepo:
    """Minimal stand-in for ManualRepository — only what advice.py calls.

    Rows carry a real `generated_at` timestamp so tests can prove
    `read_cached_advice` actually wires `not_before`/`CACHE_TTL` correctly,
    rather than the fake unconditionally "finding" a match.
    """

    def __init__(self):
        self.rows: list[tuple[str, dict, datetime]] = []
        self.cleared = 0

    def get_fresh_advice(self, portfolio_id, *, scope, not_before):
        for row_scope, payload, generated_at in reversed(self.rows):
            if row_scope == scope and generated_at >= not_before:
                return type("Row", (), {"payload": payload, "generated_at": generated_at})()
        return None

    def add_advice(self, portfolio_id, *, scope, payload):
        generated_at = datetime.now(timezone.utc)
        self.rows.append((scope, payload, generated_at))
        return type("Row", (), {"payload": payload, "generated_at": generated_at})()

    def clear_advice(self, portfolio_id):
        self.cleared += 1
        return 0

    def backdate_last_row(self, delta: timedelta) -> None:
        """Test helper: age the most recently added row by `delta`."""
        scope, payload, generated_at = self.rows[-1]
        self.rows[-1] = (scope, payload, generated_at - delta)


def _view(cash=5_000.0, positions=()):
    return PortfolioViewData(
        portfolio_id=uuid.uuid4(), starting_cash=10_000.0, cash=cash,
        positions=tuple(positions), equity=10_000.0, today_pl=0.0,
        total_return_pct=0.0, stale=False,
        created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
    )


def test_generate_advice_uses_the_llm_when_it_returns_valid_json(market_data):
    repo = _FakeRepo()
    calls = []

    def fake_llm(messages, model="m", max_tokens=1024):
        calls.append(messages)
        return _GOOD, 0.001

    result = adv.generate_advice(
        repo, market_data, fake_llm, view=_view(), scope=adv.PORTFOLIO_SCOPE
    )

    assert result["source"] == "llm"
    assert len(result["suggestions"]) == 2
    assert len(calls) == 1


def test_generate_advice_falls_back_to_templates_when_the_llm_raises(market_data):
    repo = _FakeRepo()

    def boom(messages, model="m", max_tokens=1024):
        raise RuntimeError("anthropic is down")

    result = adv.generate_advice(
        repo, market_data, boom, view=_view(), scope=adv.PORTFOLIO_SCOPE
    )

    assert result["source"] == "template"
    assert len(result["suggestions"]) >= 1


def test_generate_advice_falls_back_when_the_llm_returns_garbage(market_data):
    repo = _FakeRepo()

    result = adv.generate_advice(
        repo, market_data, lambda *a, **k: ("nope", 0.0),
        view=_view(), scope=adv.PORTFOLIO_SCOPE,
    )

    assert result["source"] == "template"


def test_generate_advice_always_carries_the_disclaimer(market_data):
    repo = _FakeRepo()

    result = adv.generate_advice(
        repo, market_data, lambda *a, **k: ("nope", 0.0),
        view=_view(), scope=adv.PORTFOLIO_SCOPE,
    )

    assert result["disclaimer"] == adv.DISCLAIMER


def test_generate_advice_writes_the_result_to_the_cache(market_data):
    repo = _FakeRepo()

    adv.generate_advice(repo, market_data, lambda *a, **k: (_GOOD, 0.0),
                        view=_view(), scope=adv.PORTFOLIO_SCOPE)

    assert len(repo.rows) == 1
    assert repo.rows[0][0] == adv.PORTFOLIO_SCOPE


def test_generate_advice_reuses_a_fresh_cache_entry_without_calling_the_llm(market_data):
    repo = _FakeRepo()
    repo.add_advice(_view().portfolio_id, scope=adv.PORTFOLIO_SCOPE,
                    payload={"suggestions": [], "source": "llm",
                             "disclaimer": adv.DISCLAIMER})
    called = []

    adv.generate_advice(repo, market_data,
                        lambda *a, **k: called.append(1) or (_GOOD, 0.0),
                        view=_view(), scope=adv.PORTFOLIO_SCOPE)

    assert called == []


def test_generate_advice_recalls_the_llm_once_the_cached_entry_expires(market_data):
    # Proves CACHE_TTL/not_before are actually wired, not just present:
    # a row aged past CACHE_TTL must be treated as stale, not fresh.
    repo = _FakeRepo()
    repo.add_advice(_view().portfolio_id, scope=adv.PORTFOLIO_SCOPE,
                    payload={"suggestions": [], "source": "llm",
                             "disclaimer": adv.DISCLAIMER})
    repo.backdate_last_row(adv.CACHE_TTL + timedelta(seconds=1))
    calls = []

    adv.generate_advice(repo, market_data,
                        lambda *a, **k: calls.append(1) or (_GOOD, 0.0),
                        view=_view(), scope=adv.PORTFOLIO_SCOPE)

    assert calls == [1]


def test_read_cached_advice_returns_none_when_nothing_is_cached():
    assert adv.read_cached_advice(_FakeRepo(), _view().portfolio_id,
                                  scope=adv.PORTFOLIO_SCOPE) is None


def test_generate_advice_for_a_single_coin_scopes_to_that_symbol(market_data):
    repo = _FakeRepo()

    adv.generate_advice(repo, market_data, lambda *a, **k: (_GOOD, 0.0),
                        view=_view(), scope="BTC")

    assert repo.rows[0][0] == "BTC"


def test_gather_signals_skips_a_symbol_the_market_cannot_price_but_keeps_the_rest(market_data):
    # market_data's default universe is {"BTC", "ETH"} — "NOPE" is unknown and
    # must not sink the whole request.
    signals = adv._gather_signals(
        market_data, ["BTC", "NOPE", "ETH"], scope=adv.PORTFOLIO_SCOPE
    )

    assert {s.symbol for s in signals} == {"BTC", "ETH"}


def test_gather_signals_returns_an_empty_list_when_every_symbol_fails(market_data):
    signals = adv._gather_signals(market_data, ["NOPE"], scope=adv.PORTFOLIO_SCOPE)

    assert signals == []
