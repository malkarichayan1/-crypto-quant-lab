export type IndicatorType =
  | 'momentum'
  | 'sma'
  | 'rsi'
  | 'volatility'
  | 'zscore'

export interface IndicatorRow {
  type: IndicatorType
  id: string
  param: number // lookback (momentum/volatility/zscore) or period (sma/rsi)
  sourceId: string // used only when type === 'zscore'
}

export type SizingScheme = 'equal_weight' | 'inverse_vol' | 'fixed_fraction'

export interface SpecFormState {
  name: string
  universe: string[]
  benchmark: string
  start: string // 'YYYY-MM-DD'
  end: string
  startingCash: number
  indicators: IndicatorRow[]
  rankBy: string
  longTop: number
  shortBottom: number
  sizingScheme: SizingScheme
  grossLeverage: number
  fraction: number
  volIndicatorId: string
  rebalance: 'daily' | 'weekly'
  feeBps: number
  slippageBps: number
}

export const INITIAL_FORM_STATE: SpecFormState = {
  name: '',
  universe: [],
  benchmark: 'BTC/USDT',
  start: '2021-01-01',
  end: '2024-12-31',
  startingCash: 10000,
  indicators: [{ type: 'momentum', id: 'm1', param: 20, sourceId: '' }],
  rankBy: 'm1',
  longTop: 3,
  shortBottom: 0,
  sizingScheme: 'equal_weight',
  grossLeverage: 1.0,
  fraction: 0.1,
  volIndicatorId: '',
  rebalance: 'daily',
  feeBps: 10,
  slippageBps: 5,
}
