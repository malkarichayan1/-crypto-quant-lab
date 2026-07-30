from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from hedgefund.api.db.models import Base


class WatchlistRow(Base):
    __tablename__ = "watchlist"

    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    starred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
