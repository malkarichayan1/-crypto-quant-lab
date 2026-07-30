from __future__ import annotations

from hedgefund.api.db.manual_repository import ManualRepository


def test_watchlist_star_list_unstar(session):
    repo = ManualRepository(session)
    assert repo.list_watchlist() == []

    repo.star("BTC")
    repo.star("ETH")
    assert repo.list_watchlist() == ["BTC", "ETH"]

    repo.star("BTC")  # idempotent
    assert repo.list_watchlist() == ["BTC", "ETH"]

    repo.unstar("BTC")
    assert repo.list_watchlist() == ["ETH"]

    repo.unstar("BTC")  # idempotent
    assert repo.list_watchlist() == ["ETH"]
