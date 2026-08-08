from __future__ import annotations

# Explicit, version-controlled large-cap universe (quote = USDT on Binance).
# Chosen for liquidity + long history. No dynamic top-N (avoids survivorship bias).
# Used for historical backtesting (parquet panels), independent of live quotes.
DEFAULT_UNIVERSE: list[str] = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT",
    "SOL/USDT", "DOGE/USDT", "DOT/USDT", "LTC/USDT", "BCH/USDT",
    "LINK/USDT", "XLM/USDT", "ETC/USDT", "TRX/USDT", "EOS/USDT",
    "ATOM/USDT", "XMR/USDT", "AAVE/USDT", "AVAX/USDT", "ALGO/USDT",
]

# Live-quote universe for the beginner Markets/Portfolio/Dashboard surfaces
# (MarketDataCache), served via ccxt Kraken rather than Binance. Binance
# blocks requests from Render's hosting IP range even in the EU (Frankfurt),
# independent of the geo-block seen in some dev sandboxes — confirmed via
# repeated 503s from the deployed backend. Kraken carries 15 of
# DEFAULT_UNIVERSE's 20 pairs; the missing 5 (XLM, ETC, TRX, EOS, AAVE aren't
# on Kraken as *_USDT) are simply absent from live quotes/trading, not from
# backtesting, which still uses the full DEFAULT_UNIVERSE via parquet panels.
KRAKEN_LIVE_UNIVERSE: list[str] = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT",
    "SOL/USDT", "DOGE/USDT", "DOT/USDT", "LTC/USDT", "BCH/USDT",
    "LINK/USDT", "ATOM/USDT", "XMR/USDT", "AVAX/USDT", "ALGO/USDT",
]
