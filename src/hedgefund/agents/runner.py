from __future__ import annotations

import asyncio
import time
import uuid
from datetime import date

from hedgefund.agents.graph import (
    AgentState,
    critic_node,
    quant_node,
    research_node,
)
from hedgefund.agents.llm import CallLLM
from hedgefund.api.db.agent_repository import AgentRepository
from hedgefund.api.db.repository import BacktestRepository
from hedgefund.api.serialization import curve_to_json, trades_to_json
from hedgefund.dsl.spec import StrategySpec
from hedgefund.engine.backtest import run_backtest
from hedgefund.risk.metrics import summarize

MAX_ITERATIONS = 20


def _run_research(state: AgentState, call_llm: CallLLM) -> dict:
    return research_node(state, call_llm)


def _run_quant_with_retry(state: AgentState, call_llm: CallLLM) -> dict:
    result = quant_node(state, call_llm)
    if result["spec"] is None:
        accumulated_cost = result["cost_usd"]
        for _ in range(2):
            retry_state = {**state, "cost_usd": state["cost_usd"] + accumulated_cost}
            retry = quant_node(retry_state, call_llm, prior_error=result.get("quant_error"))
            accumulated_cost += retry["cost_usd"]
            if retry["spec"] is not None:
                return {**retry, "cost_usd": state["cost_usd"] + accumulated_cost}
            result["quant_error"] = retry.get("quant_error")
        result["cost_usd"] = state["cost_usd"] + accumulated_cost
    return result


def _run_backtest_sync(
    spec_dict: dict,
    date_start: str,
    date_end: str,
    starting_cash: float,
    panel_loader,
    session,
) -> tuple[uuid.UUID | None, dict | None]:
    spec = StrategySpec(**spec_dict)
    symbols = list(dict.fromkeys([*spec.universe, spec.benchmark]))
    try:
        panel = panel_loader(
            symbols,
            date.fromisoformat(date_start),
            date.fromisoformat(date_end),
        )
    except FileNotFoundError:
        return None, None

    t0 = time.perf_counter()
    result = run_backtest(spec, panel, starting_cash=starting_cash)
    duration_ms = int((time.perf_counter() - t0) * 1000)

    if result.benchmark_curve is not None:
        metrics = summarize(result.equity_curve, benchmark=result.benchmark_curve)
    else:
        metrics = summarize(result.equity_curve)

    repo = BacktestRepository(session)
    row = repo.create(
        name=spec.name,
        spec=spec.model_dump(mode="json"),
        equity_curve=curve_to_json(result.equity_curve),
        benchmark_curve=curve_to_json(result.benchmark_curve),
        trade_log=trades_to_json(result.trade_log),
        metrics=metrics,
        starting_cash=starting_cash,
        duration_ms=duration_ms,
    )
    session.commit()
    session.refresh(row)
    return row.id, metrics


def _run_critic(state: AgentState, call_llm: CallLLM) -> dict:
    return critic_node(state, call_llm)


def _find_winner(
    iterations: list, target_metric: str | None, target_value: float | None
) -> uuid.UUID | None:
    candidates = [
        it for it in iterations
        if it.backtest_id is not None and it.metrics_snapshot
    ]
    if not candidates:
        return None
    key_metric = target_metric or "sharpe"
    scored = sorted(
        candidates,
        key=lambda it: it.metrics_snapshot.get(key_metric, float("-inf")),
        reverse=True,
    )
    return scored[0].backtest_id if scored else None


async def run_agent_loop(
    *,
    run_id: uuid.UUID,
    goal: str,
    universe: list[str],
    date_start: str,
    date_end: str,
    starting_cash: float,
    budget_usd: float,
    target_metric: str | None,
    target_value: float | None,
    model: str,
    call_llm: CallLLM,
    session_factory,
    panel_loader,
    event_queue: asyncio.Queue,
) -> None:
    session = session_factory()
    agent_repo = AgentRepository(session)

    state: AgentState = AgentState(
        goal=goal,
        universe=universe,
        date_start=date_start,
        date_end=date_end,
        starting_cash=starting_cash,
        budget_usd=budget_usd,
        target_metric=target_metric,
        target_value=target_value,
        iteration=0,
        cost_usd=0.0,
        done=False,
        research_note="",
        spec=None,
        backtest_id=None,
        metrics=None,
        critic_note="",
        prior_iterations=[],
    )

    try:
        await event_queue.put(
            {"type": "run_started", "run_id": str(run_id), "goal": goal, "status": "running"}
        )
        await asyncio.to_thread(agent_repo.update_run_status, run_id, "running")
        session.commit()

        for iteration in range(MAX_ITERATIONS):
            if state["done"] or state["cost_usd"] >= budget_usd:
                break

            r_update = await asyncio.to_thread(_run_research, state, call_llm)
            state = {**state, **r_update, "iteration": iteration}
            await asyncio.to_thread(agent_repo.update_run_cost, run_id, state["cost_usd"])
            session.commit()

            q_update = await asyncio.to_thread(_run_quant_with_retry, state, call_llm)
            state = {**state, **q_update}
            await asyncio.to_thread(agent_repo.update_run_cost, run_id, state["cost_usd"])
            session.commit()

            backtest_id = None
            metrics = None
            if state["spec"] is not None:
                backtest_id, metrics = await asyncio.to_thread(
                    _run_backtest_sync,
                    state["spec"],
                    date_start,
                    date_end,
                    starting_cash,
                    panel_loader,
                    session,
                )
            state = {
                **state,
                "backtest_id": str(backtest_id) if backtest_id else None,
                "metrics": metrics,
            }

            c_update = await asyncio.to_thread(_run_critic, state, call_llm)
            state = {**state, **c_update}
            await asyncio.to_thread(agent_repo.update_run_cost, run_id, state["cost_usd"])
            session.commit()

            await asyncio.to_thread(
                agent_repo.create_iteration,
                run_id=run_id,
                iteration_index=iteration,
                research_note=state["research_note"],
                spec_json=state["spec"],
                backtest_id=backtest_id,
                metrics_snapshot=metrics,
                critic_note=state["critic_note"],
                failed=(state["spec"] is None),
            )
            session.commit()

            await event_queue.put({
                "type": "iteration_complete",
                "iteration_index": iteration,
                "research_note": state["research_note"],
                "spec_json": state["spec"],
                "backtest_id": str(backtest_id) if backtest_id else None,
                "metrics": metrics,
                "critic_note": state["critic_note"],
                "failed": state["spec"] is None,
                "cost_usd": state["cost_usd"],
            })

            state["prior_iterations"].append({
                "iteration": iteration,
                "research_note": state["research_note"],
                "metrics": metrics,
                "critic_note": state["critic_note"],
            })

            if state["done"]:
                break

        iterations = await asyncio.to_thread(agent_repo.list_iterations, run_id)
        winner_id = _find_winner(iterations, target_metric, target_value)
        await asyncio.to_thread(
            agent_repo.finish_run,
            run_id,
            cost_usd=state["cost_usd"],
            winner_backtest_id=winner_id,
            status="done",
        )
        session.commit()

        await event_queue.put({
            "type": "run_done",
            "status": "done",
            "cost_usd": state["cost_usd"],
            "winner_backtest_id": str(winner_id) if winner_id else None,
        })

    except Exception as exc:
        try:
            agent_repo.finish_run(
                run_id,
                cost_usd=state.get("cost_usd", 0.0),
                winner_backtest_id=None,
                status="failed",
            )
            session.commit()
        except Exception:
            pass
        await event_queue.put({"type": "run_done", "status": "failed", "error": str(exc)})
    finally:
        session.close()
        await event_queue.put(None)  # sentinel
