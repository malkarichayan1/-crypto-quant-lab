from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timezone

import feedparser

# Free, no-API-key crypto feeds. (label, url) pairs.
DEFAULT_FEEDS: tuple[tuple[str, str], ...] = (
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("CoinTelegraph", "https://cointelegraph.com/rss"),
)
NEWS_TTL_SECONDS = 600.0  # 10 minutes, per spec §7
NEWS_LIMIT = 30
FETCH_TIMEOUT_SECONDS = 10.0

_log = logging.getLogger(__name__)


class NewsUnavailableError(RuntimeError):
    """No feed could be read and there is no cached snapshot to fall back to."""


@dataclass(frozen=True)
class NewsItem:
    title: str
    source: str
    url: str
    published_at: datetime | None


@dataclass(frozen=True)
class NewsSnapshot:
    items: tuple[NewsItem, ...]
    fetched_at: datetime
    stale: bool = False


def _published(entry) -> datetime | None:
    """feedparser normalizes every date dialect into a struct_time, or omits it.

    A pathological (but syntactically valid) date — e.g. year 1 — parses to a
    struct_time that time.mktime/datetime.fromtimestamp can't represent. That's
    one malformed entry, not a reason to lose the rest of the feed.
    """
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed is None:
        return None
    try:
        return datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def parse_feed(body: str, *, source: str) -> list[NewsItem]:
    """Parse one feed body into items. Returns [] on anything unreadable —
    news is decorative, so a malformed feed degrades rather than raising."""
    parsed = feedparser.parse(body)
    items: list[NewsItem] = []
    for entry in parsed.entries:
        title = getattr(entry, "title", "").strip()
        url = getattr(entry, "link", "").strip()
        if not title or not url:
            continue
        items.append(
            NewsItem(title=title, source=source, url=url, published_at=_published(entry))
        )
    return items


def http_get(url: str) -> str:
    """Default fetcher. httpx is imported lazily so tests never touch the network
    and never need it resolved at import time."""
    import httpx

    response = httpx.get(url, timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True)
    response.raise_for_status()
    return response.text


class NewsCache:
    """TTL cache over RSS feeds, shaped like MarketDataCache.

    Unlike market data, a partial refresh is acceptable: if one feed is down
    and another works, we serve what we got. Only a total failure falls back
    to the previous snapshot with stale=True.
    """

    def __init__(
        self,
        fetch: Callable[[str], str] = http_get,
        *,
        feeds: Sequence[tuple[str, str]] = DEFAULT_FEEDS,
        ttl: float = NEWS_TTL_SECONDS,
        limit: int = NEWS_LIMIT,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._fetch = fetch
        self._feeds = tuple(feeds)
        self._ttl = ttl
        self._limit = limit
        self._clock = clock
        self._lock = threading.Lock()
        self._snapshot: NewsSnapshot | None = None
        self._fetched_at = 0.0

    def get_news(self) -> NewsSnapshot:
        with self._lock:
            now = self._clock()
            if self._snapshot is not None and now - self._fetched_at < self._ttl:
                return self._snapshot

            items: list[NewsItem] = []
            for source, url in self._feeds:
                try:
                    items.extend(parse_feed(self._fetch(url), source=source))
                except Exception as exc:  # noqa: BLE001 - one bad feed must not sink the rest
                    _log.warning("news: feed %s failed (%s)", url, exc)

            if not items:
                if self._snapshot is not None:
                    return replace(self._snapshot, stale=True)
                raise NewsUnavailableError("no feed could be read")

            # Undated items sort last rather than crashing the comparison.
            items.sort(
                key=lambda i: i.published_at or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            )
            self._snapshot = NewsSnapshot(
                items=tuple(items[: self._limit]),
                fetched_at=datetime.now(timezone.utc),
                stale=False,
            )
            self._fetched_at = now
            return self._snapshot
