"""add paper_sessions, paper_trades, paper_equity tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paper_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("spec_json", postgresql.JSONB(), nullable=False),
        sa.Column("source_backtest_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("backtests.id"), nullable=True),
        sa.Column("universe", postgresql.JSONB(), nullable=False),
        sa.Column("timeframe", sa.String(), nullable=False, server_default="1h"),
        sa.Column("starting_cash", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("state_json", postgresql.JSONB(), nullable=False),
        sa.Column("last_processed_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "paper_trades",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("paper_sessions.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("units", sa.Float(), nullable=False),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("is_catchup", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_table(
        "paper_equity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("paper_sessions.id"), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("equity", sa.Float(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("paper_equity")
    op.drop_table("paper_trades")
    op.drop_table("paper_sessions")
