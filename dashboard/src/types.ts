export interface BacktestSummary {
  id: string
  name: string
  created_at: string
  duration_ms: number
  metrics: Record<string, number>
}

export interface BacktestResult extends BacktestSummary {
  starting_cash: number
  spec: Record<string, unknown>
  equity_curve: [string, number][]
  benchmark_curve: [string, number][] | null
  trade_log: Record<string, unknown>[]
}

export interface CreateBacktestRequest {
  spec: Record<string, unknown>
  starting_cash: number
}

export interface AgentRunSummary {
  id: string
  goal: string
  universe: string[]
  date_start: string
  date_end: string
  starting_cash: number
  budget_usd: number
  target_metric: string | null
  target_value: number | null
  model: string
  status: 'pending' | 'running' | 'done' | 'failed'
  cost_usd: number
  winner_backtest_id: string | null
  created_at: string
  finished_at: string | null
}

export interface AgentIteration {
  id: string
  run_id: string
  iteration_index: number
  research_note: string | null
  spec_json: Record<string, unknown> | null
  backtest_id: string | null
  metrics_snapshot: Record<string, number> | null
  critic_note: string | null
  failed: boolean
  created_at: string
}

export interface AgentRunDetail extends AgentRunSummary {
  iterations: AgentIteration[]
}

export interface CreateAgentRunRequest {
  goal: string
  universe: string[]
  date_start: string
  date_end: string
  starting_cash: number
  budget_usd: number
  target_metric: string | null
  target_value: number | null
}

export interface PaperSessionSummary {
  id: string
  label: string
  source_backtest_id: string | null
  universe: string[]
  timeframe: string
  starting_cash: number
  status: 'active' | 'stopped' | 'error'
  last_processed_ts: string | null
  error: string | null
  created_at: string
  stopped_at: string | null
}

export interface PaperTrade { ts: string; symbol: string; units: number; price: number; is_catchup: boolean }
export interface PaperEquityPoint { ts: string; equity: number }

export interface PaperSessionDetail extends PaperSessionSummary {
  spec_json: Record<string, unknown>
  equity: PaperEquityPoint[]
  trades: PaperTrade[]
}

export interface CreatePaperSessionRequest {
  label: string
  source_backtest_id?: string | null
  spec_json?: Record<string, unknown> | null
  starting_cash: number
}

export type PaperSSEEvent =
  | { type: 'tick'; ts: string; equity: number; cash?: number; positions?: Record<string, number>; fills: { symbol: string; units: number; price: number }[]; is_catchup: boolean }
  | { type: 'session_stopped'; status: string; final_equity?: number }
  | { type: 'session_error'; error: string }

export type SSEEvent =
  | { type: 'run_started'; run_id: string; goal: string; status: string }
  | {
      type: 'iteration_complete'
      iteration_index: number
      research_note: string | null
      spec_json: Record<string, unknown> | null
      backtest_id: string | null
      metrics: Record<string, number> | null
      critic_note: string | null
      failed: boolean
      cost_usd: number
    }
  | { type: 'run_done'; status: string; cost_usd: number; winner_backtest_id: string | null }

// ---- Beginner surfaces (Phase 2+) ----

export type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y'

export interface AssetQuote {
  symbol: string
  name: string
  price: number
  change_24h_pct: number
  high_24h: number
  low_24h: number
  volume_24h: number
  sparkline: number[]
}

export interface MarketAssetsResponse {
  assets: AssetQuote[]
  stale: boolean
  as_of: string
}

export interface Candle {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface CandlesResponse {
  symbol: string
  range: TimeRange
  candles: Candle[]
  stale: boolean
}

export interface WatchlistResponse {
  symbols: string[]
}
