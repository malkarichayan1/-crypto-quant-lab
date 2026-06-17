from __future__ import annotations

from collections.abc import Callable

from pydantic import ValidationError

from hedgefund.dsl.spec import StrategySpec

BacktestSpecLookup = Callable[[object], dict | None]


class SpecResolutionError(ValueError):
    """Raised when a paper-session request cannot be resolved to a valid spec."""


def resolve_spec(
    *,
    spec_json: dict | None,
    source_backtest_id: object | None,
    backtest_spec_lookup: BacktestSpecLookup,
) -> tuple[StrategySpec, list[str]]:
    """Resolve a create-session request into a validated StrategySpec + universe.

    Exactly one of `spec_json` / `source_backtest_id` must be provided."""
    if (spec_json is None) == (source_backtest_id is None):
        raise SpecResolutionError(
            "provide exactly one of 'spec_json' or 'source_backtest_id'"
        )

    raw = spec_json
    if source_backtest_id is not None:
        raw = backtest_spec_lookup(source_backtest_id)
        if raw is None:
            raise SpecResolutionError(f"backtest {source_backtest_id!r} not found")

    try:
        spec = StrategySpec.model_validate(raw)
    except ValidationError as exc:
        raise SpecResolutionError(f"invalid strategy spec: {exc}") from exc

    universe = spec.universe if isinstance(spec.universe, list) else []
    if not universe:
        raise SpecResolutionError(
            "spec.universe must be an explicit symbol list for paper trading"
        )
    return spec, universe
