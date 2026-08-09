"""add advice_log table

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "advice_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("portfolio_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("portfolios.id"), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("clock_timestamp()"), nullable=False),
    )
    op.create_index(
        "ix_advice_log_portfolio_scope_generated",
        "advice_log",
        ["portfolio_id", "scope", "generated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_advice_log_portfolio_scope_generated", table_name="advice_log")
    op.drop_table("advice_log")
