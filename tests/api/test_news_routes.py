from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone

import pytest

from hedgefund.api.deps import get_news_cache
from hedgefund.manual.news import NewsItem, NewsSnapshot, NewsUnavailableError


class FakeNews:
    def __init__(self):
        self.snapshot = NewsSnapshot(
            items=(
                NewsItem(title="Bitcoin news", source="CoinDesk",
                         url="https://example.test/a",
                         published_at=datetime(2026, 8, 8, 12, tzinfo=timezone.utc)),
                NewsItem(title="Undated news", source="CoinTelegraph",
                         url="https://example.test/b", published_at=None),
            ),
            fetched_at=datetime(2026, 8, 8, 12, 5, tzinfo=timezone.utc),
        )
        self.unavailable = False

    def get_news(self) -> NewsSnapshot:
        if self.unavailable:
            raise NewsUnavailableError("down")
        return self.snapshot


@pytest.fixture
def news(client):
    fake = FakeNews()
    client.app.dependency_overrides[get_news_cache] = lambda: fake
    yield fake
    client.app.dependency_overrides.pop(get_news_cache, None)


def test_get_news_returns_items(client, news):
    response = client.get("/news")

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 2
    assert body["items"][0]["title"] == "Bitcoin news"
    assert body["items"][0]["source"] == "CoinDesk"
    assert body["stale"] is False


def test_get_news_allows_a_null_published_date(client, news):
    response = client.get("/news")

    assert response.json()["items"][1]["published_at"] is None


def test_get_news_reports_stale(client, news):
    news.snapshot = replace(news.snapshot, stale=True)

    assert client.get("/news").json()["stale"] is True


def test_get_news_returns_503_when_no_feed_is_reachable(client, news):
    news.unavailable = True

    response = client.get("/news")

    assert response.status_code == 503
