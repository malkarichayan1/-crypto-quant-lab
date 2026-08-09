from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from hedgefund.agents.llm import CallLLM
from hedgefund.manual.market_data import (
    AssetQuote,
    MarketDataProvider,
    PricesUnavailableError,
    UnknownSymbolError,
)
from hedgefund.manual.portfolio_service import PortfolioViewData
from hedgefund.manual.signals import CoinSignal, PortfolioContext, coin_signal, portfolio_context

DISCLAIMER = "Simulated learning advice — not financial advice."
MAX_ADVICE_SYMBOLS = 6
MAX_SUGGESTIONS = 3
PORTFOLIO_SCOPE = "portfolio"

# Thresholds that trigger a template line. Named so the intent is readable.
IDLE_CASH_THRESHOLD = 0.60
CONCENTRATION_THRESHOLD = 0.50

CACHE_TTL = timedelta(minutes=15)
# The candle range signals are computed over. 1W of hourly bars is enough to
# warm a 20-period SMA and a 14-period RSI with room to spare.
SIGNAL_RANGE = "1W"
LLM_MAX_TOKENS = 1024

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SuggestionAction:
    side: Literal["buy", "sell"]
    symbol: str
    usd_amount: float


@dataclass(frozen=True)
class Suggestion:
    text: str
    why: str
    action: SuggestionAction | None = None


def select_symbols(
    *, held: Sequence[str], quotes: Sequence[AssetQuote], limit: int = MAX_ADVICE_SYMBOLS
) -> list[str]:
    """Held coins first, then the biggest absolute 24h movers, capped at `limit`.

    Bounds the number of get_candles() calls one advice request can trigger.
    """
    known = {q.symbol for q in quotes}
    picked = [s for s in held if s in known][:limit]

    movers = sorted(quotes, key=lambda q: abs(q.change_24h_pct), reverse=True)
    for quote in movers:
        if len(picked) >= limit:
            break
        if quote.symbol not in picked:
            picked.append(quote.symbol)
    return picked


def template_advice(
    signals: Sequence[CoinSignal], context: PortfolioContext
) -> list[Suggestion]:
    """Deterministic advice from the same facts the LLM would have seen.

    This is the fallback that fires whenever the LLM is unavailable, slow, or
    returns something unparseable — the card must never break. It deliberately
    proposes no one-tap action: a template has no judgement about size.
    """
    out: list[Suggestion] = []

    if context.holdings_count == 0:
        out.append(Suggestion(
            text="Your portfolio is all cash — consider making a first small buy.",
            why=(
                f"You are holding {context.cash:,.0f} dollars in buying power and own no "
                "coins yet. Starting small is the usual way to learn how price moves feel."
            ),
        ))
    elif context.idle_cash_pct >= IDLE_CASH_THRESHOLD:
        out.append(Suggestion(
            text=f"About {context.idle_cash_pct:.0%} of your portfolio is sitting in cash.",
            why=(
                "Idle cash earns nothing in this simulator. That is fine if it is "
                "deliberate — worth noticing if it is not."
            ),
        ))

    if (
        context.top_symbol is not None
        and context.top_concentration_pct >= CONCENTRATION_THRESHOLD
    ):
        out.append(Suggestion(
            text=(
                f"{context.top_symbol} is {context.top_concentration_pct:.0%} of your "
                "portfolio — that is concentrated."
            ),
            why=(
                f"When one coin dominates, your total return mostly tracks that coin. "
                f"Spreading across more coins reduces how much a single {context.top_symbol} "
                "move swings your balance."
            ),
        ))

    for signal in signals:
        if len(out) >= MAX_SUGGESTIONS:
            break
        if signal.rsi_zone == "oversold":
            out.append(Suggestion(
                text=f"{signal.symbol} looks oversold right now.",
                why=(
                    f"Its RSI is {signal.rsi:.0f}, below the 30 line traders treat as "
                    "oversold. That often follows a sharp fall — it is a signal, not a "
                    "guarantee of a bounce."
                ),
            ))
        elif signal.rsi_zone == "overbought":
            out.append(Suggestion(
                text=f"{signal.symbol} looks overbought right now.",
                why=(
                    f"Its RSI is {signal.rsi:.0f}, above the 70 line traders treat as "
                    "overbought — the recent run has been steep."
                ),
            ))
        elif signal.sma_cross == "golden":
            out.append(Suggestion(
                text=f"{signal.symbol} is trending up on its short-term average.",
                why=(
                    "Its 5-period average is above its 20-period average, which traders "
                    "read as short-term strength."
                ),
            ))

    if not out:
        out.append(Suggestion(
            text="Nothing stands out in your portfolio right now.",
            why=(
                "No coin you hold or track is showing an overbought, oversold, or "
                "trend-crossing signal, and your cash and concentration look balanced."
            ),
        ))

    return out[:MAX_SUGGESTIONS]


def build_prompt(
    signals: Sequence[CoinSignal], context: PortfolioContext, *, scope: str
) -> str:
    """Compact structured summary + an explicit JSON contract."""
    facts = [
        {
            "symbol": s.symbol,
            "price": round(s.price, 4),
            "sma_cross": s.sma_cross,
            "rsi": None if s.rsi is None else round(s.rsi, 1),
            "rsi_zone": s.rsi_zone,
            "momentum_24_pct": None if s.momentum_pct is None else round(s.momentum_pct * 100, 2),
        }
        for s in signals
    ]
    portfolio = {
        "equity_usd": round(context.equity, 2),
        "buying_power_usd": round(context.cash, 2),
        "idle_cash_pct": round(context.idle_cash_pct * 100, 1),
        "largest_holding": context.top_symbol,
        "largest_holding_pct": round(context.top_concentration_pct * 100, 1),
        "holdings_count": context.holdings_count,
        "total_return_pct": round(context.total_return_pct * 100, 2),
    }

    focus = (
        "The user is looking at the whole portfolio."
        if scope == PORTFOLIO_SCOPE
        else f"The user is looking at the {scope} trade page. Focus your advice on {scope}."
    )

    return f"""You are a friendly trading coach inside a *simulated* crypto paper-trading app for absolute beginners. No real money is involved.

{focus}

Market signals:
{json.dumps(facts, indent=2)}

Portfolio:
{json.dumps(portfolio, indent=2)}

Write 2-3 short suggestions grounded ONLY in the numbers above. Do not invent
prices, news, or indicators that are not listed. Explain like the reader has
never traded before: no jargon without a plain-English gloss.

Respond with JSON only, no prose and no code fences, in exactly this shape:

{{
  "suggestions": [
    {{
      "text": "one sentence, under 120 characters",
      "why": "two or three sentences explaining the reasoning in plain English",
      "action": {{"side": "buy", "symbol": "BTC", "usd_amount": 250}}
    }}
  ]
}}

"action" is optional — set it to null unless you are proposing a specific,
affordable trade. Never propose a buy larger than the buying power shown above.
Never propose selling a coin the portfolio does not hold."""


def suggestions_to_payload(suggestions: Sequence[Suggestion], *, source: str) -> dict:
    """Serialize for the advice_log JSONB column and the API response."""
    return {
        "suggestions": [asdict(s) for s in suggestions],
        "disclaimer": DISCLAIMER,
        "source": source,
    }


class AdviceParseError(ValueError):
    """The LLM response could not be read as advice. Caller falls back to templates."""


class _LLMAction(BaseModel):
    side: Literal["buy", "sell"]
    symbol: str
    usd_amount: float = Field(gt=0)


class _LLMSuggestion(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    why: str = Field(min_length=1, max_length=800)
    action: _LLMAction | None = None


class _LLMAdvice(BaseModel):
    suggestions: list[_LLMSuggestion] = Field(min_length=1)


def _extract_json_object(text: str) -> str:
    """Pull the outermost {...} out of a response that may carry code fences or
    a chatty preamble. Models do this often enough that failing on it would
    push us to the template fallback for no good reason."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise AdviceParseError("no JSON object found in response")
    return text[start : end + 1]


def _action_is_safe(
    action: _LLMAction, *, known_symbols: set[str], cash: float, holdings: dict[str, float]
) -> bool:
    """Would this action survive POST /portfolio/orders right now?

    A one-tap button that is guaranteed to 400 is worse than no button, so an
    unsafe action is dropped while the suggestion's text is kept.
    """
    if action.symbol not in known_symbols:
        return False
    if action.side == "buy":
        return action.usd_amount <= cash
    return action.usd_amount <= holdings.get(action.symbol, 0.0)


def parse_llm_advice(
    raw: str, *, known_symbols: set[str], cash: float, holdings: dict[str, float]
) -> list[Suggestion]:
    """Parse and sanity-check an LLM advice response.

    `holdings` maps symbol → current market value in USD.
    Raises AdviceParseError on anything unusable; the caller then falls back to
    template_advice().
    """
    try:
        parsed = _LLMAdvice.model_validate_json(_extract_json_object(raw))
    except (ValidationError, ValueError) as exc:
        raise AdviceParseError(str(exc)) from exc

    out: list[Suggestion] = []
    for item in parsed.suggestions[:MAX_SUGGESTIONS]:
        action = None
        if item.action is not None and _action_is_safe(
            item.action, known_symbols=known_symbols, cash=cash, holdings=holdings
        ):
            action = SuggestionAction(
                side=item.action.side,
                symbol=item.action.symbol,
                usd_amount=item.action.usd_amount,
            )
        out.append(Suggestion(text=item.text, why=item.why, action=action))
    return out


def read_cached_advice(repo, portfolio_id: uuid.UUID, *, scope: str) -> dict | None:
    """Cached payload for this scope if it is still fresh, else None.

    Never calls the LLM. This is what GET /advice serves, which is why simply
    loading the Dashboard costs nothing.
    """
    row = repo.get_fresh_advice(
        portfolio_id, scope=scope, not_before=datetime.now(timezone.utc) - CACHE_TTL
    )
    return None if row is None else row.payload


def _gather_signals(
    market: MarketDataProvider, symbols: Sequence[str], *, scope: str
) -> list[CoinSignal]:
    """Signals for each symbol, skipping any the exchange cannot price.

    One bad symbol must not sink the whole advice request — the card degrades
    to fewer facts rather than erroring. `scope` is only carried for logging,
    so a failure for one scope's request is distinguishable from another's.
    """
    out: list[CoinSignal] = []
    for symbol in symbols:
        try:
            series = market.get_candles(symbol, SIGNAL_RANGE)
            out.append(coin_signal(symbol, series.candles))
        except (UnknownSymbolError, PricesUnavailableError, ValueError) as exc:
            logger.warning("skipping %s for scope=%s (%s)", symbol, scope, exc)
    return out


def generate_advice(
    repo, market: MarketDataProvider, call_llm: CallLLM, *, view: PortfolioViewData, scope: str
) -> dict:
    """Produce (or reuse) an advice payload for `scope` and cache it.

    Returns the payload dict — never raises for LLM problems. `view` is a
    PortfolioViewData the caller has already loaded. Caller commits.
    """
    cached = read_cached_advice(repo, view.portfolio_id, scope=scope)
    if cached is not None:
        return cached

    snapshot = market.get_assets()
    quotes = snapshot.assets

    if scope == PORTFOLIO_SCOPE:
        held = [p.symbol for p in view.positions]
        symbols = select_symbols(held=held, quotes=quotes)
    else:
        symbols = [scope]
    signals = _gather_signals(market, symbols, scope=scope)
    context = portfolio_context(
        equity=view.equity,
        cash=view.cash,
        total_return_pct=view.total_return_pct,
        positions=[(p.symbol, p.market_value) for p in view.positions],
    )

    # Built outside the try block: a bug in prompt formatting is a real defect,
    # not an "LLM unavailable" condition, and must not be masked by the
    # template fallback below.
    prompt = build_prompt(signals, context, scope=scope)

    suggestions: list[Suggestion]
    source = "llm"
    try:
        raw, _cost = call_llm(
            [{"role": "user", "content": prompt}], max_tokens=LLM_MAX_TOKENS
        )
        suggestions = parse_llm_advice(
            raw,
            known_symbols={q.symbol for q in quotes},
            cash=view.cash,
            holdings={p.symbol: p.market_value for p in view.positions},
        )
    except Exception as exc:  # noqa: BLE001 — any LLM failure degrades, never breaks
        logger.warning("LLM unavailable for scope=%s, using template fallback (%s)", scope, exc)
        suggestions = template_advice(signals, context)
        source = "template"

    payload = suggestions_to_payload(suggestions, source=source)
    # Two concurrent requests for the same scope could both miss the cache and
    # both write here — accepted as a non-issue in this single-user app; the
    # cost is one harmless extra row, not a correctness problem.
    repo.add_advice(view.portfolio_id, scope=scope, payload=payload)
    return payload
