from __future__ import annotations

import json
from pathlib import Path

import typer

from hedgefund.data.cache import DEFAULT_CACHE_DIR
from hedgefund.data.panel import load_panel
from hedgefund.dsl.spec import StrategySpec
from hedgefund.dsl.validate import validate_spec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize

app = typer.Typer(help="Crypto hedge fund research core")


def _load_spec(spec_path: Path) -> StrategySpec:
    spec = StrategySpec.model_validate(json.loads(Path(spec_path).read_text()))
    validate_spec(spec)
    return spec


@app.command()
def validate(spec_path: Path) -> None:
    """Validate a strategy spec file without running it."""
    _load_spec(spec_path)
    typer.echo("OK: spec is valid")


@app.command()
def run(spec_path: Path, cache_dir: Path = DEFAULT_CACHE_DIR, starting_cash: float = 10_000.0) -> None:
    """Run a backtest from a spec file against the local cache."""
    spec = _load_spec(spec_path)
    if not isinstance(spec.universe, list):
        typer.echo("universe='all' not supported yet; pass an explicit list", err=True)
        raise typer.Exit(code=1)
    symbols = list(dict.fromkeys([*spec.universe, spec.benchmark]))
    panel = load_panel(symbols, spec.start, spec.end, cache_dir=cache_dir)
    result = run_backtest(spec, panel, starting_cash=starting_cash)
    if result.benchmark_curve is not None:
        metrics = summarize(result.equity_curve, benchmark=result.benchmark_curve)
    else:
        typer.echo(
            f"note: benchmark '{spec.benchmark}' not in cache; relative metrics skipped",
            err=True,
        )
        metrics = summarize(result.equity_curve)
    for k, v in metrics.items():
        typer.echo(f"{k:>18}: {v: .4f}")


@app.command()
def fetch(cache_dir: Path = DEFAULT_CACHE_DIR) -> None:
    """Fetch/refresh daily OHLCV for the default universe into the local cache."""
    import ccxt

    from hedgefund.data.cache import write_symbol
    from hedgefund.data.fetch import fetch_ohlcv, ohlcv_to_frame
    from hedgefund.data.universe import DEFAULT_UNIVERSE

    exchange = ccxt.binance({"enableRateLimit": True})
    for symbol in DEFAULT_UNIVERSE:
        rows = fetch_ohlcv(exchange, symbol, since_ms=None, limit=1000)
        frame = ohlcv_to_frame(rows)
        write_symbol(symbol, frame, cache_dir=cache_dir)
        typer.echo(f"cached {symbol}: {len(frame)} bars")


if __name__ == "__main__":
    app()
