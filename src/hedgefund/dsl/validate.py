from __future__ import annotations

from hedgefund.dsl.spec import (
    CrossSectionalSelection,
    StrategySpec,
    TimeSeriesSelection,
)


class SpecValidationError(ValueError):
    """Raised when a StrategySpec is internally inconsistent."""


def validate_spec(spec: StrategySpec) -> None:
    ids = {ind.id for ind in spec.indicators}
    if len(ids) != len(spec.indicators):
        raise SpecValidationError("duplicate indicator id")

    if spec.end <= spec.start:
        raise SpecValidationError("end must be after start")

    sel = spec.selection
    if isinstance(sel, CrossSectionalSelection):
        if sel.rank_by not in ids:
            raise SpecValidationError(f"rank_by '{sel.rank_by}' is not a defined indicator")
        if isinstance(spec.universe, list):
            if sel.long_top + sel.short_bottom > len(spec.universe):
                raise SpecValidationError("long_top + short_bottom exceeds universe size")
    elif isinstance(sel, TimeSeriesSelection):
        for cond in (sel.entry, sel.exit):
            if cond.indicator_id not in ids:
                raise SpecValidationError(
                    f"condition references unknown indicator '{cond.indicator_id}'"
                )

    if spec.sizing.scheme == "inverse_vol":
        vid = spec.sizing.vol_indicator_id
        vol_ids = {ind.id for ind in spec.indicators if ind.type == "volatility"}
        if vid not in vol_ids:
            raise SpecValidationError(
                "inverse_vol sizing requires vol_indicator_id pointing to a volatility indicator"
            )
