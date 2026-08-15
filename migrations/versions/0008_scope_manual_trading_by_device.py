"""scope watchlist and portfolios by device_id

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows represent the single shared "everyone's portfolio" bucket
    # that predates per-device isolation. There's no real device to
    # attribute them to, so this clears them rather than guessing. Children
    # of portfolios first, to respect FK constraints.
    op.execute("DELETE FROM advice_log")
    op.execute("DELETE FROM manual_orders")
    op.execute("DELETE FROM portfolio_equity")
    op.execute("DELETE FROM portfolios")
    op.execute("DELETE FROM watchlist")

    op.add_column("portfolios", sa.Column("device_id", sa.String(), nullable=False))
    op.create_index("ix_portfolios_device_id", "portfolios", ["device_id"])

    op.drop_constraint("watchlist_pkey", "watchlist", type_="primary")
    op.add_column("watchlist", sa.Column("device_id", sa.String(), nullable=False))
    op.create_primary_key("watchlist_pkey", "watchlist", ["device_id", "symbol"])


def downgrade() -> None:
    op.drop_constraint("watchlist_pkey", "watchlist", type_="primary")
    op.drop_column("watchlist", "device_id")
    op.create_primary_key("watchlist_pkey", "watchlist", ["symbol"])

    op.drop_index("ix_portfolios_device_id", table_name="portfolios")
    op.drop_column("portfolios", "device_id")
