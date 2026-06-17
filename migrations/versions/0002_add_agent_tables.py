"""add agent_runs and agent_iterations tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("universe", postgresql.JSONB(), nullable=False),
        sa.Column("date_start", sa.Date(), nullable=False),
        sa.Column("date_end", sa.Date(), nullable=False),
        sa.Column("starting_cash", sa.Float(), nullable=False),
        sa.Column("budget_usd", sa.Float(), nullable=False),
        sa.Column("target_metric", sa.String(), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("model", sa.String(), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("winner_backtest_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("backtests.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "agent_iterations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("iteration_index", sa.Integer(), nullable=False),
        sa.Column("research_note", sa.Text(), nullable=True),
        sa.Column("spec_json", postgresql.JSONB(), nullable=True),
        sa.Column("backtest_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("backtests.id"), nullable=True),
        sa.Column("metrics_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("critic_note", sa.Text(), nullable=True),
        sa.Column("failed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_iterations")
    op.drop_table("agent_runs")
