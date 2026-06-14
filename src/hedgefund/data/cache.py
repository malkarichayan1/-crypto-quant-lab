from __future__ import annotations

from pathlib import Path

import pandas as pd

DEFAULT_CACHE_DIR = Path("data/cache")


def _safe_name(symbol: str) -> str:
    return symbol.replace("/", "_")


def write_symbol(symbol: str, df: pd.DataFrame, cache_dir: Path = DEFAULT_CACHE_DIR) -> Path:
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{_safe_name(symbol)}.parquet"
    df.to_parquet(path)
    return path


def read_symbol(symbol: str, cache_dir: Path = DEFAULT_CACHE_DIR) -> pd.DataFrame:
    path = Path(cache_dir) / f"{_safe_name(symbol)}.parquet"
    df = pd.read_parquet(path)
    if not df.index.is_monotonic_increasing:
        raise ValueError(f"cache for {symbol} is not time-sorted")
    return df


def cached_symbols(cache_dir: Path = DEFAULT_CACHE_DIR) -> list[str]:
    cache_dir = Path(cache_dir)
    if not cache_dir.exists():
        return []
    return [p.stem.replace("_", "/") for p in cache_dir.glob("*.parquet")]
