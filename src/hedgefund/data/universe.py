from __future__ import annotations

# Explicit, version-controlled large-cap universe (quote = USDT on Binance).
# Chosen for liquidity + long history. No dynamic top-N (avoids survivorship bias).
DEFAULT_UNIVERSE: list[str] = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT",
    "SOL/USDT", "DOGE/USDT", "DOT/USDT", "LTC/USDT", "BCH/USDT",
    "LINK/USDT", "XLM/USDT", "ETC/USDT", "TRX/USDT", "EOS/USDT",
    "ATOM/USDT", "XMR/USDT", "AAVE/USDT", "AVAX/USDT", "ALGO/USDT",
]
