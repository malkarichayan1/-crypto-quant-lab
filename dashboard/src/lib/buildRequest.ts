import type {
  CreateBacktestRequest,
} from '../types'
import type {
  IndicatorRow,
  SpecFormState,
} from '../components/spec-form/types'

export function indicatorToApi(row: IndicatorRow): Record<string, unknown> {
  switch (row.type) {
    case 'momentum':
    case 'volatility':
      return { type: row.type, id: row.id, lookback: row.param }
    case 'sma':
    case 'rsi':
      return { type: row.type, id: row.id, period: row.param }
    case 'zscore':
      return {
        type: 'zscore',
        id: row.id,
        source_id: row.sourceId,
        lookback: row.param,
      }
  }
}

export function buildCreateRequest(
  state: SpecFormState,
): CreateBacktestRequest {
  const sizing: Record<string, unknown> = {
    scheme: state.sizingScheme,
    gross_leverage: state.grossLeverage,
    fraction: state.fraction,
  }
  if (state.sizingScheme === 'inverse_vol') {
    sizing.vol_indicator_id = state.volIndicatorId
  }

  return {
    spec: {
      name: state.name,
      universe: state.universe,
      indicators: state.indicators.map(indicatorToApi),
      selection: {
        mode: 'cross_sectional',
        rank_by: state.rankBy,
        long_top: state.longTop,
        short_bottom: state.shortBottom,
      },
      sizing,
      rebalance: state.rebalance,
      costs: { fee_bps: state.feeBps, slippage_bps: state.slippageBps },
      start: state.start,
      end: state.end,
      benchmark: state.benchmark,
    },
    starting_cash: state.startingCash,
  }
}
