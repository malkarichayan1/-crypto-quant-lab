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
