# Beginner Frontend Phase 5 (Leaderboard + News + Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the last three `ComingSoon` placeholders with real surfaces — a "You vs the AI" leaderboard, a cached crypto news feed, and a complete Settings page — closing out the Surface E redesign.

**Architecture:** Two new pure computation modules (`manual/leaderboard.py`, `manual/news.py`) behind two new read-only endpoints. The leaderboard derives rows from data that already exists: the manual portfolio's equity snapshots, each paper session's equity series, and a buy-and-hold BTC benchmark computed from candles. News is a TTL cache over free RSS feeds, shaped exactly like the existing `MarketDataCache` (atomic refresh, stale fallback, never a broken page). Settings extends the page Phase 4 created. **No new database tables and no new migration.**

**Tech Stack:** FastAPI, pydantic v2, `feedparser` (new dependency), React 18, TanStack Query, shadcn/ui, Vitest + React Testing Library.

---

## Dependencies and scope

**Requires Phase 4 to be merged first.** Task 9 edits `dashboard/src/pages/SettingsPage.tsx`, which Phase 4 creates. If Phase 4 is not done, stop and do it first.

**Limit orders are cut.** Spec §5 says limit orders "unlock in Pro view"; §7's order endpoint is market-only. The user decided on 2026-08-08 to **drop them from the redesign entirely** rather than build a pending-order table and a fill-checking loop. Do not add a Limit tab. Do not add a `pending_orders` table. If you think this plan is missing limit orders — it is not, they were deliberately removed.

**Leaderboard comparability is imperfect, by design.** Participants have different start dates, so their total-return percentages are not strictly comparable. Spec §12 accepts this and mitigates it by **displaying start dates rather than hiding them**. Do not normalize returns to a common window; do not silently drop participants that started recently.

---

## Context an implementer needs

- **Spec:** `docs/superpowers/specs/2026-07-30-beginner-frontend-redesign-design.md` — §5 (Leaderboard, News, Settings), §7 (endpoints), §10 (error handling), §12 (risks).
- **Branch first.** `main` auto-deploys to Render + Vercel. Create `feature/beginner-frontend-phase5-final` off `main` before Task 1. This phase adds no migration, but the deploy caution still applies.
- **Caller commits.** `ManualRepository` and `PaperRepository` methods flush, never commit; the route commits.
- **Kraken is permanent.** `deps.py::get_market_data()` uses `ccxt.kraken()` with `KRAKEN_LIVE_UNIVERSE` (15 of 20 pairs), committed in `3b24f3a`. BTC is in that universe, so the benchmark works.
- **`RANGE_SPECS` caps out at `"1Y"` = 365 daily bars.** The BTC benchmark cannot look back further than a year. Task 5 handles a portfolio older than that explicitly.

### Baseline

```bash
pytest -q                                  # green before you start
cd dashboard && npm test && npm run build  # green + clean
```

---

## File Structure

### Backend

| File | Status | Responsibility |
|---|---|---|
| `src/hedgefund/manual/news.py` | new | `NewsItem`, `NewsCache` — TTL cache over RSS with stale fallback. |
| `src/hedgefund/manual/leaderboard.py` | new | **Pure.** Equity series → `LeaderboardRow`. No DB, no I/O. |
| `src/hedgefund/api/routes/news.py` | new | `GET /news`. |
| `src/hedgefund/api/routes/leaderboard.py` | new | `GET /leaderboard`. |
| `src/hedgefund/api/manual_schemas.py` | modified | News + leaderboard response schemas. |
| `src/hedgefund/api/deps.py` | modified | `get_news_cache()` singleton. |
| `src/hedgefund/api/app.py` | modified | Register both routers. |
| `pyproject.toml` | modified | Add `feedparser`. |
| `tests/manual/test_news.py` | new | Cache behavior with a fake fetcher. |
| `tests/manual/test_leaderboard.py` | new | Pure return/sparkline math. |
| `tests/api/test_news_routes.py` | new | Route tests. |
| `tests/api/test_leaderboard_routes.py` | new | Route tests. |

### Frontend

| File | Status | Responsibility |
|---|---|---|
| `dashboard/src/api/news.ts` | new | `getNews`. |
| `dashboard/src/api/leaderboard.ts` | new | `getLeaderboard`. |
| `dashboard/src/pages/NewsPage.tsx` | new | Headline cards. |
| `dashboard/src/pages/LeaderboardPage.tsx` | new | Comparison table. |
| `dashboard/src/pages/SettingsPage.tsx` | modified | Add reset-portfolio + starting cash. |
| `dashboard/src/api/portfolio.ts` | modified | Add `resetPortfolio`. |
| `dashboard/src/types.ts` | modified | News + leaderboard types. |
| `dashboard/src/App.tsx` | modified | Real `/news` and `/leaderboard` routes. |

---

## Task 0: Branch and baseline

- [ ] **Step 1: Confirm Phase 4 is merged**

```bash
git checkout main && git pull
test -f dashboard/src/pages/SettingsPage.tsx && echo "Phase 4 present" || echo "STOP - Phase 4 missing"
```

If it prints `STOP`, do not continue.

- [ ] **Step 2: Branch and confirm green**

```bash
git checkout -b feature/beginner-frontend-phase5-final
pytest -q
cd dashboard && npm test
```

Record the two pass counts — they are your regression baseline.

---

## Task 1: Add the `feedparser` dependency

**Files:** `pyproject.toml`

**Why a library and not `xml.etree`:** RSS in the wild is inconsistent (RSS 2.0 vs Atom, several date formats, namespaced elements), and stdlib `ElementTree` is vulnerable to entity-expansion attacks on untrusted XML. `feedparser` handles both the format variance and the XML hardening, and is the standard choice. Do not hand-roll a parser.

- [ ] **Step 1: Add the dependency**

In `pyproject.toml`, add to the `api` optional-dependency list, after `langgraph`:

```toml
    "feedparser>=6.0",
```

- [ ] **Step 2: Install and verify**

```bash
pip install -e ".[api,dev]"
python -c "import feedparser; print(feedparser.__version__)"
```

Expected: a `6.x` version prints.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "chore(news): add feedparser for RSS parsing"
```

---

## Task 2: News cache

**Files:**
- Create: `src/hedgefund/manual/news.py`
- Test: `tests/manual/test_news.py`

**Design note:** this mirrors `MarketDataCache` deliberately — same TTL-plus-stale-fallback shape, same injected clock for deterministic tests, same "one failure serves the last good snapshot" policy. Unlike market data, a *partial* success is fine: if CoinDesk is down but CoinTelegraph works, serve CoinTelegraph's items rather than failing the whole request. News is decorative; prices are not.

- [ ] **Step 1: Write the failing test**

Create `tests/manual/test_news.py`:

```python
from __future__ import annotations

import pytest

from hedgefund.manual.news import NewsCache, NewsUnavailableError, parse_feed

_RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Crypto</title>
  <item>
    <title>Bitcoin does a thing</title>
    <link>https://example.test/a</link>
    <pubDate>Fri, 08 Aug 2026 12:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Ethereum does another thing</title>
    <link>https://example.test/b</link>
    <pubDate>Fri, 08 Aug 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>"""

FEEDS = (("Example", "https://example.test/rss"),)


def test_parse_feed_reads_titles_links_and_dates():
    items = parse_feed(_RSS, source="Example")

    assert len(items) == 2
    assert items[0].title == "Bitcoin does a thing"
    assert items[0].url == "https://example.test/a"
    assert items[0].source == "Example"
    assert items[0].published_at.tzinfo is not None


def test_parse_feed_returns_empty_for_junk():
    assert parse_feed("not xml at all", source="Example") == []


def test_parse_feed_skips_items_with_no_link():
    body = _RSS.replace("<link>https://example.test/a</link>", "")

    items = parse_feed(body, source="Example")

    assert all(item.url for item in items)


class _Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def _fetcher(bodies: dict[str, str], fails: set[str] | None = None):
    fails = fails or set()
    calls: list[str] = []

    def fetch(url: str) -> str:
        calls.append(url)
        if url in fails:
            raise RuntimeError(f"{url} is down")
        return bodies[url]

    fetch.calls = calls  # type: ignore[attr-defined]
    return fetch


def test_cache_returns_parsed_items():
    cache = NewsCache(_fetcher({"https://example.test/rss": _RSS}), feeds=FEEDS)

    snapshot = cache.get_news()

    assert len(snapshot.items) == 2
    assert snapshot.stale is False


def test_cache_sorts_newest_first():
    cache = NewsCache(_fetcher({"https://example.test/rss": _RSS}), feeds=FEEDS)

    titles = [i.title for i in cache.get_news().items]

    assert titles == ["Bitcoin does a thing", "Ethereum does another thing"]


def test_cache_does_not_refetch_within_the_ttl():
    fetch = _fetcher({"https://example.test/rss": _RSS})
    clock = _Clock()
    cache = NewsCache(fetch, feeds=FEEDS, ttl=600.0, clock=clock)

    cache.get_news()
    clock.t = 100.0
    cache.get_news()

    assert len(fetch.calls) == 1


def test_cache_refetches_after_the_ttl_expires():
    fetch = _fetcher({"https://example.test/rss": _RSS})
    clock = _Clock()
    cache = NewsCache(fetch, feeds=FEEDS, ttl=600.0, clock=clock)

    cache.get_news()
    clock.t = 601.0
    cache.get_news()

    assert len(fetch.calls) == 2


def test_cache_serves_stale_items_when_a_refresh_fails():
    bodies = {"https://example.test/rss": _RSS}
    clock = _Clock()
    cache = NewsCache(_fetcher(bodies), feeds=FEEDS, ttl=1.0, clock=clock)
    cache.get_news()

    # Swap in a fetcher that fails, then expire the TTL.
    cache._fetch = _fetcher(bodies, fails={"https://example.test/rss"})
    clock.t = 10.0
    snapshot = cache.get_news()

    assert snapshot.stale is True
    assert len(snapshot.items) == 2


def test_cache_raises_when_the_first_ever_fetch_fails():
    cache = NewsCache(
        _fetcher({"https://example.test/rss": _RSS},
                 fails={"https://example.test/rss"}),
        feeds=FEEDS,
    )

    with pytest.raises(NewsUnavailableError):
        cache.get_news()


def test_cache_keeps_working_when_only_some_feeds_fail():
    bodies = {"https://a.test/rss": _RSS, "https://b.test/rss": _RSS}
    cache = NewsCache(
        _fetcher(bodies, fails={"https://b.test/rss"}),
        feeds=(("A", "https://a.test/rss"), ("B", "https://b.test/rss")),
    )

    snapshot = cache.get_news()

    assert len(snapshot.items) == 2  # A's items only
    assert snapshot.stale is False


def test_cache_caps_the_item_count():
    many = _RSS.replace(
        "</channel>",
        "".join(
            f"<item><title>t{i}</title><link>https://example.test/{i}</link>"
            f"<pubDate>Fri, 08 Aug 2026 0{i % 10}:00:00 GMT</pubDate></item>"
            for i in range(60)
        )
        + "</channel>",
    )
    cache = NewsCache(_fetcher({"https://example.test/rss": many}), feeds=FEEDS, limit=20)

    assert len(cache.get_news().items) == 20
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/manual/test_news.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.manual.news'`

- [ ] **Step 3: Write the implementation**

Create `src/hedgefund/manual/news.py`:

```python
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
    """feedparser normalizes every date dialect into a struct_time, or omits it."""
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed is None:
        return None
    return datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)


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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/manual/test_news.py -q`
Expected: PASS — 12 passed

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/manual/news.py tests/manual/test_news.py
git commit -m "feat(news): TTL-cached RSS reader with partial-failure tolerance"
```

---

## Task 3: News schema, dependency, and route

**Files:**
- Modify: `src/hedgefund/api/manual_schemas.py`, `src/hedgefund/api/deps.py`, `src/hedgefund/api/app.py`
- Create: `src/hedgefund/api/routes/news.py`
- Test: `tests/api/test_news_routes.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_news_routes.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/api/test_news_routes.py -q`
Expected: FAIL — `ImportError: cannot import name 'get_news_cache'`

- [ ] **Step 3: Add the schemas**

Append to `src/hedgefund/api/manual_schemas.py`:

```python
class NewsItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    source: str
    url: str
    published_at: datetime | None


class NewsResponse(BaseModel):
    items: list[NewsItemOut]
    stale: bool
    fetched_at: datetime
```

The existing `AssetQuoteOut` in this file already enables `from_attributes` — match whichever spelling it uses, and add `ConfigDict` to the pydantic import if it is not already there.

- [ ] **Step 4: Add the dependency**

Add the import at the top of `src/hedgefund/api/deps.py`:

```python
from hedgefund.manual.news import NewsCache
```

and append:

```python
@lru_cache
def get_news_cache() -> NewsCache:
    """Singleton NewsCache over the default free RSS feeds.

    lru_cache for the same reason as get_market_data: FastAPI dispatches sync
    dependency callables to a worker thread pool, so two concurrent first
    requests could otherwise build two caches and double the outbound fetches.

    Overridden in tests via app.dependency_overrides.
    """
    return NewsCache()
```

- [ ] **Step 5: Write the route**

Create `src/hedgefund/api/routes/news.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from hedgefund.api.deps import get_news_cache
from hedgefund.api.manual_schemas import NewsItemOut, NewsResponse
from hedgefund.manual.news import NewsCache, NewsUnavailableError

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=NewsResponse)
def list_news(news: NewsCache = Depends(get_news_cache)) -> NewsResponse:
    try:
        snapshot = news.get_news()
    except NewsUnavailableError:
        raise HTTPException(
            status_code=503, detail="News is temporarily unavailable — try again shortly."
        )
    return NewsResponse(
        items=[NewsItemOut.model_validate(i) for i in snapshot.items],
        stale=snapshot.stale,
        fetched_at=snapshot.fetched_at,
    )
```

- [ ] **Step 6: Register the router**

In `src/hedgefund/api/app.py`, add the import beside the others:

```python
from hedgefund.api.routes.news import router as news_router
```

and inside `create_app()`:

```python
    app.include_router(news_router)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pytest tests/api/test_news_routes.py -q`
Expected: PASS — 4 passed

- [ ] **Step 8: Commit**

```bash
git add src/hedgefund/api/manual_schemas.py src/hedgefund/api/deps.py src/hedgefund/api/routes/news.py src/hedgefund/api/app.py tests/api/test_news_routes.py
git commit -m "feat(news): GET /news endpoint over the cached RSS reader"
```

---

## Task 4: Pure leaderboard computation

**Files:**
- Create: `src/hedgefund/manual/leaderboard.py`
- Test: `tests/manual/test_leaderboard.py`

- [ ] **Step 1: Write the failing test**

Create `tests/manual/test_leaderboard.py`:

```python
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from hedgefund.manual import leaderboard as lb


def _points(values: list[float], start: datetime | None = None):
    base = start or datetime(2026, 8, 1, tzinfo=timezone.utc)
    return [(base + timedelta(hours=i), v) for i, v in enumerate(values)]


def test_row_from_series_computes_total_return():
    row = lb.row_from_series("You", _points([100.0, 110.0, 120.0]), starting_cash=100.0)

    assert row.total_return_pct == pytest.approx(0.20)


def test_row_from_series_handles_a_loss():
    row = lb.row_from_series("You", _points([100.0, 80.0]), starting_cash=100.0)

    assert row.total_return_pct == pytest.approx(-0.20)


def test_row_from_series_uses_starting_cash_not_the_first_point():
    # Snapshots may begin after some trading already moved the balance.
    row = lb.row_from_series("You", _points([150.0, 200.0]), starting_cash=100.0)

    assert row.total_return_pct == pytest.approx(1.0)


def test_row_from_series_reports_the_first_timestamp_as_the_start_date():
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)

    row = lb.row_from_series("You", _points([100.0, 110.0], start=start), starting_cash=100.0)

    assert row.start_date == start


def test_row_from_series_returns_none_for_an_empty_series():
    assert lb.row_from_series("You", [], starting_cash=100.0) is None


def test_row_from_series_treats_zero_starting_cash_as_zero_return():
    row = lb.row_from_series("You", _points([0.0, 5.0]), starting_cash=0.0)

    assert row.total_return_pct == 0.0


def test_row_from_series_downsamples_the_sparkline():
    row = lb.row_from_series(
        "You", _points([float(i) for i in range(500)]), starting_cash=1.0
    )

    assert len(row.sparkline) <= lb.SPARKLINE_POINTS


def test_sparkline_keeps_the_first_and_last_values():
    row = lb.row_from_series(
        "You", _points([float(i) for i in range(500)]), starting_cash=1.0
    )

    assert row.sparkline[0] == 0.0
    assert row.sparkline[-1] == 499.0


def test_short_series_is_not_padded():
    row = lb.row_from_series("You", _points([1.0, 2.0, 3.0]), starting_cash=1.0)

    assert row.sparkline == (1.0, 2.0, 3.0)


# ---- buy-and-hold benchmark ----

def test_benchmark_series_buys_at_the_first_close_and_marks_to_market():
    closes = [(datetime(2026, 8, 1, tzinfo=timezone.utc), 100.0),
              (datetime(2026, 8, 2, tzinfo=timezone.utc), 150.0)]

    series = lb.buy_and_hold_series(closes, starting_cash=1_000.0)

    assert series[0][1] == pytest.approx(1_000.0)
    assert series[-1][1] == pytest.approx(1_500.0)


def test_benchmark_series_is_empty_when_there_are_no_closes():
    assert lb.buy_and_hold_series([], starting_cash=1_000.0) == []


def test_benchmark_series_is_empty_when_the_first_close_is_zero():
    closes = [(datetime(2026, 8, 1, tzinfo=timezone.utc), 0.0)]

    assert lb.buy_and_hold_series(closes, starting_cash=1_000.0) == []


def test_benchmark_series_starts_at_the_portfolio_start_date():
    closes = [
        (datetime(2026, 7, 1, tzinfo=timezone.utc), 50.0),
        (datetime(2026, 8, 1, tzinfo=timezone.utc), 100.0),
        (datetime(2026, 8, 2, tzinfo=timezone.utc), 200.0),
    ]

    series = lb.buy_and_hold_series(
        closes, starting_cash=1_000.0, since=datetime(2026, 8, 1, tzinfo=timezone.utc)
    )

    # Entry is the 8/1 close of 100, so the 8/2 doubling is a 2x, not a 4x.
    assert len(series) == 2
    assert series[-1][1] == pytest.approx(2_000.0)


def test_benchmark_series_is_empty_when_since_is_after_every_close():
    closes = [(datetime(2026, 7, 1, tzinfo=timezone.utc), 50.0)]

    series = lb.buy_and_hold_series(
        closes, starting_cash=1_000.0, since=datetime(2026, 8, 1, tzinfo=timezone.utc)
    )

    assert series == []


# ---- ordering ----

def test_rank_rows_sorts_by_return_descending():
    rows = [
        lb.row_from_series("A", _points([100.0, 105.0]), starting_cash=100.0),
        lb.row_from_series("B", _points([100.0, 130.0]), starting_cash=100.0),
        lb.row_from_series("C", _points([100.0, 90.0]), starting_cash=100.0),
    ]

    ranked = lb.rank_rows(rows)

    assert [r.label for r in ranked] == ["B", "A", "C"]


def test_rank_rows_drops_nones():
    rows = [lb.row_from_series("A", _points([100.0, 105.0]), starting_cash=100.0), None]

    assert len(lb.rank_rows(rows)) == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/manual/test_leaderboard.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.manual.leaderboard'`

- [ ] **Step 3: Write the implementation**

Create `src/hedgefund/manual/leaderboard.py`:

```python
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

SPARKLINE_POINTS = 40

Point = tuple[datetime, float]


@dataclass(frozen=True)
class LeaderboardRow:
    label: str
    kind: str  # "you" | "ai" | "benchmark"
    start_date: datetime
    total_return_pct: float
    equity: float
    sparkline: tuple[float, ...]


def _downsample(values: Sequence[float], target: int = SPARKLINE_POINTS) -> tuple[float, ...]:
    """Evenly thin a series to at most `target` points, always keeping the
    first and last so the sparkline's endpoints match the stated return."""
    if len(values) <= target:
        return tuple(values)
    step = (len(values) - 1) / (target - 1)
    picked = [values[round(i * step)] for i in range(target)]
    picked[-1] = values[-1]
    return tuple(picked)


def row_from_series(
    label: str, points: Sequence[Point], *, starting_cash: float, kind: str = "you"
) -> LeaderboardRow | None:
    """Build one row from an equity series. None when there is nothing to show.

    Return is measured against `starting_cash`, not against the first snapshot:
    snapshots can begin after trading has already moved the balance, and
    anchoring on the first point would silently hide that early performance.
    """
    if not points:
        return None

    values = [v for _ts, v in points]
    equity = values[-1]
    return LeaderboardRow(
        label=label,
        kind=kind,
        start_date=points[0][0],
        total_return_pct=((equity - starting_cash) / starting_cash) if starting_cash else 0.0,
        equity=equity,
        sparkline=_downsample(values),
    )


def buy_and_hold_series(
    closes: Sequence[Point], *, starting_cash: float, since: datetime | None = None
) -> list[Point]:
    """Equity curve for putting all the cash into the asset at the first close
    on or after `since` and never trading again."""
    window = [p for p in closes if since is None or p[0] >= since]
    if not window:
        return []
    entry_price = window[0][1]
    if entry_price <= 0:
        return []
    units = starting_cash / entry_price
    return [(ts, units * price) for ts, price in window]


def rank_rows(rows: Sequence[LeaderboardRow | None]) -> list[LeaderboardRow]:
    """Best return first. Nones (participants with no data) are dropped."""
    return sorted(
        (r for r in rows if r is not None),
        key=lambda r: r.total_return_pct,
        reverse=True,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/manual/test_leaderboard.py -q`
Expected: PASS — 16 passed

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/manual/leaderboard.py tests/manual/test_leaderboard.py
git commit -m "feat(leaderboard): pure return, sparkline, and buy-and-hold math"
```

---

## Task 5: Leaderboard assembly and route

**Files:**
- Modify: `src/hedgefund/api/manual_schemas.py`, `src/hedgefund/api/app.py`
- Create: `src/hedgefund/api/routes/leaderboard.py`
- Test: `tests/api/test_leaderboard_routes.py`

**Design note — the BTC benchmark's lookback limit:** `RANGE_SPECS["1Y"]` is 365 daily bars, the longest range `MarketDataCache` offers. A portfolio older than a year cannot get a benchmark covering its whole life. Rather than silently show a shorter benchmark labelled as if it matched, clamp its start to the oldest candle available and let its own `start_date` say so — the UI displays start dates precisely because they differ.

**Read before writing the test:** open `src/hedgefund/api/db/paper_repository.py:73` and copy `record_tick`'s real keyword names into the test below. The plan cannot guess them.

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_leaderboard_routes.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone


def test_leaderboard_includes_your_portfolio(client):
    response = client.get("/leaderboard")

    assert response.status_code == 200
    labels = [row["label"] for row in response.json()["rows"]]
    assert "You" in labels


def test_your_row_is_marked_with_the_you_kind(client):
    rows = client.get("/leaderboard").json()["rows"]

    you = next(r for r in rows if r["label"] == "You")
    assert you["kind"] == "you"


def test_leaderboard_includes_a_buy_and_hold_btc_benchmark(client):
    rows = client.get("/leaderboard").json()["rows"]

    benchmark = next(r for r in rows if r["kind"] == "benchmark")
    assert "BTC" in benchmark["label"]


def test_leaderboard_includes_each_paper_session(client, session):
    from hedgefund.api.db.paper_repository import PaperRepository

    repo = PaperRepository(session)
    row = repo.create_session(
        label="Momentum v1", spec_json={}, source_backtest_id=None,
        universe=["BTC/USDT"], starting_cash=10_000.0,
    )
    session.commit()
    repo.record_tick(
        row.id, ts=datetime(2026, 8, 1, tzinfo=timezone.utc),
        equity=12_000.0, state={}, fills=[],
    )
    session.commit()

    rows = client.get("/leaderboard").json()["rows"]

    assert any(r["label"] == "Momentum v1" and r["kind"] == "ai" for r in rows)


def test_rows_are_sorted_by_return_descending(client):
    rows = client.get("/leaderboard").json()["rows"]

    returns = [r["total_return_pct"] for r in rows]
    assert returns == sorted(returns, reverse=True)


def test_every_row_carries_a_start_date_and_sparkline(client):
    rows = client.get("/leaderboard").json()["rows"]

    for row in rows:
        assert row["start_date"]
        assert isinstance(row["sparkline"], list)


def test_leaderboard_returns_503_when_prices_are_unavailable(client, market_data):
    market_data.unavailable = True

    assert client.get("/leaderboard").status_code == 503
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/api/test_leaderboard_routes.py -q`
Expected: FAIL — 404 on `/leaderboard`

- [ ] **Step 3: Add the schemas**

Append to `src/hedgefund/api/manual_schemas.py`:

```python
class LeaderboardRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    kind: Literal["you", "ai", "benchmark"]
    start_date: datetime
    total_return_pct: float
    equity: float
    sparkline: list[float]


class LeaderboardResponse(BaseModel):
    rows: list[LeaderboardRowOut]
    stale: bool
```

- [ ] **Step 4: Write the route**

Create `src/hedgefund/api/routes/leaderboard.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.manual_repository import ManualRepository
from hedgefund.api.db.paper_repository import PaperRepository
from hedgefund.api.deps import get_market_data
from hedgefund.api.manual_schemas import LeaderboardResponse, LeaderboardRowOut
from hedgefund.manual import leaderboard as lb
from hedgefund.manual.market_data import PricesUnavailableError, UnknownSymbolError
from hedgefund.manual.portfolio_service import get_equity_series, get_portfolio_view

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

_UNAVAILABLE_MSG = "Prices are temporarily unavailable — please try again shortly."
BENCHMARK_SYMBOL = "BTC"
# Longest range MarketDataCache offers. A portfolio older than this gets a
# benchmark clamped to the oldest candle available — its start_date says so.
BENCHMARK_RANGE = "1Y"


def _benchmark_row(market, view) -> lb.LeaderboardRow | None:
    """Buy-and-hold BTC over the same window as the manual portfolio.

    A benchmark failure must not take down the whole leaderboard — the other
    rows are still worth showing, so this degrades to None.
    """
    try:
        series = market.get_candles(BENCHMARK_SYMBOL, BENCHMARK_RANGE)
    except (UnknownSymbolError, PricesUnavailableError):
        return None

    closes = [(c.ts, c.close) for c in series.candles]
    points = lb.buy_and_hold_series(
        closes, starting_cash=view.starting_cash, since=view.created_at
    )
    if not points:
        # The portfolio is newer than the newest candle (or older than the
        # oldest available). Fall back to the full candle window rather than
        # dropping the benchmark — its start_date makes the mismatch visible.
        points = lb.buy_and_hold_series(closes, starting_cash=view.starting_cash)

    return lb.row_from_series(
        f"Buy & hold {BENCHMARK_SYMBOL}", points,
        starting_cash=view.starting_cash, kind="benchmark",
    )


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    session: Session = Depends(get_session), market=Depends(get_market_data)
) -> LeaderboardResponse:
    manual = ManualRepository(session)
    paper = PaperRepository(session)

    try:
        view = get_portfolio_view(manual, market)
        you = lb.row_from_series(
            "You",
            get_equity_series(manual, market, "ALL"),
            starting_cash=view.starting_cash,
            kind="you",
        )
    except PricesUnavailableError:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_MSG)
    session.commit()  # get_portfolio_view may have bootstrapped the portfolio

    rows: list[lb.LeaderboardRow | None] = [you]

    for paper_session in paper.list_sessions():
        points = [(e.ts, e.equity) for e in paper.list_equity(paper_session.id)]
        rows.append(
            lb.row_from_series(
                paper_session.label, points,
                starting_cash=paper_session.starting_cash, kind="ai",
            )
        )

    rows.append(_benchmark_row(market, view))

    return LeaderboardResponse(
        rows=[LeaderboardRowOut.model_validate(r) for r in lb.rank_rows(rows)],
        stale=view.stale,
    )
```

- [ ] **Step 5: Register the router**

In `src/hedgefund/api/app.py`:

```python
from hedgefund.api.routes.leaderboard import router as leaderboard_router
```

and inside `create_app()`:

```python
    app.include_router(leaderboard_router)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/api/test_leaderboard_routes.py -q`
Expected: PASS — 7 passed

- [ ] **Step 7: Run the whole backend suite**

Run: `pytest -q`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/hedgefund/api/manual_schemas.py src/hedgefund/api/routes/leaderboard.py src/hedgefund/api/app.py tests/api/test_leaderboard_routes.py
git commit -m "feat(leaderboard): GET /leaderboard comparing you, AI sessions, and buy-and-hold BTC"
```

---

## Task 6: Frontend types and API clients

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/api/news.ts`, `dashboard/src/api/leaderboard.ts`
- Test: `dashboard/src/api/news.test.ts`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/api/news.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLeaderboard } from './leaderboard'
import { getNews } from './news'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('getNews', () => {
  it('requests /news', async () => {
    const spy = stubFetch({ items: [], stale: false, fetched_at: '2026-08-08T12:00:00Z' })

    await getNews()

    expect(spy.mock.calls[0][0]).toMatch(/\/news$/)
  })

  it('returns the parsed items', async () => {
    stubFetch({
      items: [{ title: 'T', source: 'S', url: 'https://x.test', published_at: null }],
      stale: false,
      fetched_at: '2026-08-08T12:00:00Z',
    })

    const result = await getNews()

    expect(result.items[0].title).toBe('T')
  })
})

describe('getLeaderboard', () => {
  it('requests /leaderboard', async () => {
    const spy = stubFetch({ rows: [], stale: false })

    await getLeaderboard()

    expect(spy.mock.calls[0][0]).toMatch(/\/leaderboard$/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/api/news.test.ts`
Expected: FAIL — cannot resolve `./news`

- [ ] **Step 3: Add the types**

Append to `dashboard/src/types.ts`:

```ts
// ---- News + Leaderboard (Phase 5) ----

export interface NewsItem {
  title: string
  source: string
  url: string
  published_at: string | null
}

export interface NewsResponse {
  items: NewsItem[]
  stale: boolean
  fetched_at: string
}

export interface LeaderboardRow {
  label: string
  kind: 'you' | 'ai' | 'benchmark'
  start_date: string
  total_return_pct: number
  equity: number
  sparkline: number[]
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[]
  stale: boolean
}
```

- [ ] **Step 4: Write the clients**

Create `dashboard/src/api/news.ts`:

```ts
import { apiFetch } from './client'
import type { NewsResponse } from '../types'

export function getNews(): Promise<NewsResponse> {
  return apiFetch<NewsResponse>('/news')
}
```

Create `dashboard/src/api/leaderboard.ts`:

```ts
import { apiFetch } from './client'
import type { LeaderboardResponse } from '../types'

export function getLeaderboard(): Promise<LeaderboardResponse> {
  return apiFetch<LeaderboardResponse>('/leaderboard')
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/api/news.test.ts`
Expected: PASS — 3 passed

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/api/news.ts dashboard/src/api/leaderboard.ts dashboard/src/api/news.test.ts
git commit -m "feat(phase5): frontend types and API clients for news and leaderboard"
```

---

## Task 7: News page

**Files:**
- Create: `dashboard/src/pages/NewsPage.tsx`
- Test: `dashboard/src/pages/NewsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/NewsPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewsPage } from './NewsPage'

const getNews = vi.fn()
vi.mock('../api/news', () => ({ getNews: () => getNews() }))

const ITEM = {
  title: 'Bitcoin does a thing',
  source: 'CoinDesk',
  url: 'https://example.test/a',
  published_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NewsPage />
    </QueryClientProvider>,
  )
}

describe('NewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNews.mockResolvedValue({
      items: [ITEM], stale: false, fetched_at: '2026-08-08T12:00:00Z',
    })
  })

  it('renders a heading', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: /news/i })).toBeInTheDocument()
  })

  it('renders each headline as a link to the article', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /bitcoin does a thing/i })
    expect(link).toHaveAttribute('href', 'https://example.test/a')
  })

  it('opens articles in a new tab safely', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /bitcoin does a thing/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('shows the source', async () => {
    renderPage()

    expect(await screen.findByText('CoinDesk')).toBeInTheDocument()
  })

  it('shows a relative age', async () => {
    renderPage()

    expect(await screen.findByText(/2h ago/i)).toBeInTheDocument()
  })

  it('omits the age for an undated item', async () => {
    getNews.mockResolvedValue({
      items: [{ ...ITEM, published_at: null }], stale: false,
      fetched_at: '2026-08-08T12:00:00Z',
    })

    renderPage()

    await screen.findByText('CoinDesk')
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument()
  })

  it('shows an empty state when there is no news', async () => {
    getNews.mockResolvedValue({ items: [], stale: false, fetched_at: '2026-08-08T12:00:00Z' })

    renderPage()

    expect(await screen.findByText(/no headlines/i)).toBeInTheDocument()
  })

  it('offers a retry when the fetch fails', async () => {
    getNews.mockRejectedValue(new Error('boom'))

    renderPage()

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('notes when the feed is stale', async () => {
    getNews.mockResolvedValue({
      items: [ITEM], stale: true, fetched_at: '2026-08-08T12:00:00Z',
    })

    renderPage()

    await waitFor(() =>
      expect(screen.getByText(/may be out of date/i)).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/NewsPage.test.tsx`
Expected: FAIL — cannot resolve `./NewsPage`

- [ ] **Step 3: Write the page**

Create `dashboard/src/pages/NewsPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getNews } from '../api/news'

const POLL_INTERVAL_MS = 600_000 // matches the server's 10-minute cache

function relativeAge(iso: string | null): string | null {
  if (!iso) return null
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NewsPage() {
  const newsQuery = useQuery({
    queryKey: ['news'],
    queryFn: getNews,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const failed = newsQuery.isError && !newsQuery.data
  const items = newsQuery.data?.items ?? []

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">News</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Crypto headlines, refreshed every ten minutes.
      </p>

      {newsQuery.data?.stale && (
        <p className="mb-4 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Headlines may be out of date — we couldn't reach the feeds just now.
        </p>
      )}

      {failed && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">We couldn't load the news.</p>
          <Button variant="outline" size="sm" onClick={() => newsQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {newsQuery.isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!failed && !newsQuery.isLoading && items.length === 0 && (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          No headlines right now — check back shortly.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const age = relativeAge(item.published_at)
          return (
            <Card
              key={item.url}
              className="transition-colors duration-200 hover:border-primary/40"
            >
              <CardContent className="p-4">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3"
                >
                  <span className="text-sm font-medium group-hover:text-primary">
                    {item.title}
                  </span>
                  <ExternalLink
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </a>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.source}</span>
                  {age && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{age}</span>
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/NewsPage.test.tsx`
Expected: PASS — 9 passed

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/NewsPage.tsx dashboard/src/pages/NewsPage.test.tsx
git commit -m "feat(news): news page with headline cards and stale/empty/error states"
```

---

## Task 8: Leaderboard page

**Files:**
- Create: `dashboard/src/pages/LeaderboardPage.tsx`
- Test: `dashboard/src/pages/LeaderboardPage.test.tsx`

**Read before writing:** open `dashboard/src/components/Sparkline.tsx` and confirm its export name and prop shape. Adjust the mock and the usage below to match — do not guess.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/pages/LeaderboardPage.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaderboardPage } from './LeaderboardPage'

const getLeaderboard = vi.fn()
vi.mock('../api/leaderboard', () => ({ getLeaderboard: () => getLeaderboard() }))

vi.mock('../components/Sparkline', () => ({
  Sparkline: () => <div data-testid="sparkline" />,
}))

const ROWS = [
  {
    label: 'You', kind: 'you' as const, start_date: '2026-07-01T00:00:00Z',
    total_return_pct: 0.15, equity: 115_000, sparkline: [100, 115],
  },
  {
    label: 'Momentum v1', kind: 'ai' as const, start_date: '2026-07-15T00:00:00Z',
    total_return_pct: -0.05, equity: 9_500, sparkline: [100, 95],
  },
  {
    label: 'Buy & hold BTC', kind: 'benchmark' as const, start_date: '2026-07-01T00:00:00Z',
    total_return_pct: 0.08, equity: 108_000, sparkline: [100, 108],
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LeaderboardPage />
    </QueryClientProvider>,
  )
}

describe('LeaderboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLeaderboard.mockResolvedValue({ rows: ROWS, stale: false })
  })

  it('renders a heading', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: /leaderboard/i })).toBeInTheDocument()
  })

  it('renders one row per participant', async () => {
    renderPage()

    expect(await screen.findByText('You')).toBeInTheDocument()
    expect(screen.getByText('Momentum v1')).toBeInTheDocument()
    expect(screen.getByText('Buy & hold BTC')).toBeInTheDocument()
  })

  it('shows each return as a percentage', async () => {
    renderPage()

    expect(await screen.findByText('+15.00%')).toBeInTheDocument()
    expect(screen.getByText('-5.00%')).toBeInTheDocument()
  })

  it('shows start dates, since participants began at different times', async () => {
    renderPage()

    await screen.findByText('You')
    expect(screen.getAllByText(/Jul .*2026/).length).toBeGreaterThan(0)
  })

  it('renders a sparkline per row', async () => {
    renderPage()

    expect(await screen.findAllByTestId('sparkline')).toHaveLength(3)
  })

  it('explains that start dates differ', async () => {
    renderPage()

    expect(await screen.findByText(/different start dates/i)).toBeInTheDocument()
  })

  it('offers a retry when the fetch fails', async () => {
    getLeaderboard.mockRejectedValue(new Error('boom'))

    renderPage()

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows an empty state when there are no rows', async () => {
    getLeaderboard.mockResolvedValue({ rows: [], stale: false })

    renderPage()

    expect(await screen.findByText(/nothing to compare/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dashboard && npx vitest run src/pages/LeaderboardPage.test.tsx`
Expected: FAIL — cannot resolve `./LeaderboardPage`

- [ ] **Step 3: Write the page**

Create `dashboard/src/pages/LeaderboardPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { Bot, Trophy, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getLeaderboard } from '../api/leaderboard'
import { Sparkline } from '../components/Sparkline'
import { formatPct, formatUsd } from '../lib/format'
import type { LeaderboardRow } from '../types'

const POLL_INTERVAL_MS = 60_000

const KIND_ICON = { you: User, ai: Bot, benchmark: Trophy } as const

function formatStartDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function Row({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const Icon = KIND_ICON[row.kind]
  const isPositive = row.total_return_pct >= 0

  return (
    <Card className={cn(row.kind === 'you' && 'border-primary/40 bg-primary/[0.03]')}>
      <CardContent className="flex items-center gap-4 p-4">
        <span className="w-5 text-sm tabular-nums text-muted-foreground">{rank}</span>

        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{row.label}</span>
          <span className="block text-xs text-muted-foreground">
            since {formatStartDate(row.start_date)}
          </span>
        </span>

        <span className="hidden w-24 sm:block">
          <Sparkline values={row.sparkline} />
        </span>

        <span className="w-28 text-right text-sm tabular-nums">{formatUsd(row.equity)}</span>

        <span
          className={cn(
            'w-24 text-right text-sm font-medium tabular-nums',
            isPositive ? 'text-profit' : 'text-loss',
          )}
        >
          {formatPct(row.total_return_pct)}
        </span>
      </CardContent>
    </Card>
  )
}

export function LeaderboardPage() {
  const query = useQuery({
    queryKey: ['leaderboard'],
    queryFn: getLeaderboard,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const failed = query.isError && !query.data
  const rows = query.data?.rows ?? []

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold">Leaderboard</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your portfolio against the AI strategies and buy-and-hold Bitcoin. Participants
        have different start dates, so returns are not strictly comparable.
      </p>

      {failed && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">We couldn't load the leaderboard.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {query.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      )}

      {!failed && !query.isLoading && rows.length === 0 && (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          Nothing to compare yet — make a trade or start a paper session in the Lab.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <Row key={`${row.kind}-${row.label}`} row={row} rank={index + 1} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dashboard && npx vitest run src/pages/LeaderboardPage.test.tsx`
Expected: PASS — 8 passed

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/pages/LeaderboardPage.tsx dashboard/src/pages/LeaderboardPage.test.tsx
git commit -m "feat(leaderboard): leaderboard page with per-participant rows and start dates"
```

---

## Task 9: Complete the Settings page

**Files:**
- Modify: `dashboard/src/pages/SettingsPage.tsx` (created in Phase 4)
- Modify: `dashboard/src/api/portfolio.ts`
- Test: `dashboard/src/pages/SettingsPage.test.tsx`

**Adds:** a starting-cash input and a reset-portfolio button behind a confirmation dialog. Reset is destructive from the user's point of view — it abandons the current portfolio — so it gets an explicit dialog naming what happens, per spec §5.

- [ ] **Step 1: Write the failing test**

In `dashboard/src/pages/SettingsPage.test.tsx`, add these imports and mocks at the top:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

const resetPortfolio = vi.fn()
vi.mock('../api/portfolio', () => ({ resetPortfolio: (b: unknown) => resetPortfolio(b) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}
```

Replace every existing `render(<SettingsPage />)` from Phase 4 with `renderPage()`. Then append:

```tsx
  it('shows a starting cash input defaulting to 100,000', () => {
    renderPage()

    expect(screen.getByLabelText(/starting cash/i)).toHaveValue(100000)
  })

  it('does not reset until the dialog is confirmed', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(resetPortfolio).not.toHaveBeenCalled()
  })

  it('resets with the entered starting cash once confirmed', async () => {
    resetPortfolio.mockResolvedValue({ id: 'x', starting_cash: 5000, created_at: 'now' })
    renderPage()

    const input = screen.getByLabelText(/starting cash/i)
    await userEvent.clear(input)
    await userEvent.type(input, '5000')
    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))
    await userEvent.click(await screen.findByRole('button', { name: /yes, reset/i }))

    await waitFor(() => expect(resetPortfolio).toHaveBeenCalledWith({ starting_cash: 5000 }))
  })

  it('closes the dialog without resetting when cancelled', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))

    expect(resetPortfolio).not.toHaveBeenCalled()
  })

  it('warns that resetting is permanent', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /reset portfolio/i }))

    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('rejects a non-positive starting cash', async () => {
    renderPage()

    const input = screen.getByLabelText(/starting cash/i)
    await userEvent.clear(input)
    await userEvent.type(input, '0')

    expect(screen.getByRole('button', { name: /reset portfolio/i })).toBeDisabled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dashboard && npx vitest run src/pages/SettingsPage.test.tsx`
Expected: FAIL — no starting-cash input exists

- [ ] **Step 3: Add the API client function**

Append to `dashboard/src/api/portfolio.ts`:

```ts
export function resetPortfolio(body: { starting_cash: number }): Promise<{
  id: string
  starting_cash: number
  created_at: string
}> {
  return apiFetch('/portfolio/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

`POST /portfolio/reset` already exists — it shipped in Phase 3 (`src/hedgefund/api/routes/manual_portfolio.py:100`). No backend work is needed here.

- [ ] **Step 4: Rewrite the Settings page**

Replace `dashboard/src/pages/SettingsPage.tsx` with:

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { resetPortfolio } from '../api/portfolio'
import { setAdvisorEnabled, useAdvisorEnabled } from '../hooks/useAdvisorEnabled'
import { formatUsd } from '../lib/format'

const DEFAULT_STARTING_CASH = 100_000

export function SettingsPage() {
  const advisorEnabled = useAdvisorEnabled()
  const [startingCash, setStartingCash] = useState(String(DEFAULT_STARTING_CASH))
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const queryClient = useQueryClient()

  const parsed = Number(startingCash)
  const isValid = Number.isFinite(parsed) && parsed > 0

  const reset = useMutation({
    mutationFn: (body: { starting_cash: number }) => resetPortfolio(body),
    onSuccess: () => {
      setIsConfirmOpen(false)
      // Everything downstream of the portfolio is now wrong: holdings, orders,
      // equity history, the leaderboard's "You" row, and any cached advice.
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      queryClient.invalidateQueries({ queryKey: ['advice'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      toast.success(`Portfolio reset to ${formatUsd(parsed)} ✓`)
    },
    onError: () => setIsConfirmOpen(false),
  })

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Advisor</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex items-center justify-between gap-6">
              <span>
                <span className="block text-sm font-medium">AI Advisor</span>
                <span className="block text-xs text-muted-foreground">
                  Show suggestion cards on the Dashboard and coin pages. Suggestions are
                  only generated when you ask for them.
                </span>
              </span>
              <Switch
                aria-label="AI Advisor"
                checked={advisorEnabled}
                onCheckedChange={setAdvisorEnabled}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <label htmlFor="starting-cash" className="mb-1 block text-sm font-medium">
                Starting cash
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                The balance your next reset will begin from.
              </p>
              <Input
                id="starting-cash"
                type="number"
                min={1}
                value={startingCash}
                onChange={(event) => setStartingCash(event.target.value)}
                className="max-w-48"
              />
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Resetting starts a fresh portfolio. Your current holdings and order
                history are left behind.
              </p>
              <Button
                variant="outline"
                disabled={!isValid || reset.isPending}
                onClick={() => setIsConfirmOpen(true)}
                className="border-loss/40 text-loss hover:bg-loss/10"
              >
                Reset portfolio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your portfolio?</DialogTitle>
            <DialogDescription>
              You'll start over with {formatUsd(isValid ? parsed : 0)}. Your current
              holdings and order history will no longer be shown. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reset.isPending}
              onClick={() => reset.mutate({ starting_cash: parsed })}
              className="bg-loss text-white hover:bg-loss/90"
            >
              Yes, reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dashboard && npx vitest run src/pages/SettingsPage.test.tsx`
Expected: PASS — the 5 Phase 4 cases plus 6 new ones

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/SettingsPage.tsx dashboard/src/pages/SettingsPage.test.tsx dashboard/src/api/portfolio.ts
git commit -m "feat(settings): starting cash and confirmed portfolio reset"
```

---

## Task 10: Wire the routes and retire `ComingSoon`

**Files:**
- Modify: `dashboard/src/App.tsx:30-49`

- [ ] **Step 1: Replace the placeholders**

In `dashboard/src/App.tsx`, add the imports:

```tsx
import { LeaderboardPage } from './pages/LeaderboardPage'
import { NewsPage } from './pages/NewsPage'
```

Replace the `/leaderboard` and `/news` `ComingSoon` routes (lines 30-49) with:

```tsx
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/news" element={<NewsPage />} />
```

- [ ] **Step 2: Remove the now-dead imports**

Every placeholder route in `App.tsx` is gone, so these two import lines are dead — delete them:

```tsx
import { Newspaper, Settings, Trophy } from 'lucide-react'
import { ComingSoon } from './components/ComingSoon'
```

`Newspaper`, `Trophy`, and `Settings` are still used by `Sidebar.tsx`. Do **not** touch that file's imports.

- [ ] **Step 3: Decide the fate of `ComingSoon`**

```bash
cd dashboard && grep -rn "ComingSoon" src/ --include=*.tsx --include=*.ts
```

If the only remaining hits are `components/ComingSoon.tsx` itself and its test, delete both — this was the last consumer, and dead components rot:

```bash
git rm dashboard/src/components/ComingSoon.tsx dashboard/src/components/ComingSoon.test.tsx
```

If anything else still imports it, leave it in place.

- [ ] **Step 4: Verify**

Run: `cd dashboard && npm test`
Expected: PASS — no regressions

Run: `cd dashboard && npm run build`
Expected: clean build, no unused-import or type errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(phase5): route /leaderboard and /news to real pages, retire ComingSoon"
```

---

## Task 11: Manual smoke check

**No code changes unless something is broken.** Skip the fix commit if everything passes.

- [ ] **Step 1: Confirm everything is green**

```bash
pytest -q
cd dashboard && npm test && npm run build
```

- [ ] **Step 2: Start both servers**

```bash
uvicorn hedgefund.api.app:app --reload --port 8000
# separate terminal
cd dashboard && npm run dev
```

No `alembic upgrade` needed — this phase adds no migration.

- [ ] **Step 3: Walk the checklist**

**News**
- [ ] `/news` lists real headlines with source and relative age.
- [ ] Clicking a headline opens the article in a new tab.
- [ ] Reload within ten minutes: the backend serves cache (check the server log — no outbound fetch).
- [ ] Disconnect the network, wait past the TTL, reload: headlines still render with the "may be out of date" note. **Not** an error page.

**Leaderboard**
- [ ] `/leaderboard` shows a "You" row, a "Buy & hold BTC" row, and one row per paper session.
- [ ] The "You" row is visually distinguished.
- [ ] Rows are sorted best-return-first; each shows a start date and a sparkline.
- [ ] Place a trade, return here: your row's equity and return have moved.
- [ ] With zero paper sessions the page still renders (You + benchmark).

**Settings**
- [ ] `/settings` shows the advisor toggle (Phase 4) plus starting cash and Reset.
- [ ] Set starting cash to `0` — the Reset button disables.
- [ ] Click **Reset portfolio** — a dialog warns it cannot be undone. Cancel: nothing happens.
- [ ] Set starting cash to `50000`, Reset, confirm. A toast fires; the top-bar chip and Dashboard read $50,000 with no holdings.
- [ ] Return to `/leaderboard` — the "You" row reflects the new portfolio.

**Regression**
- [ ] Dashboard, Markets, a coin page, and Portfolio all still work.
- [ ] `/lab/backtests`, `/lab/research`, `/lab/paper` all still work.
- [ ] Every sidebar link lands on a real page — no `ComingSoon` remains anywhere.

- [ ] **Step 4: Fix anything broken, then re-verify**

```bash
pytest -q && cd dashboard && npm test && npm run build
git add -A && git commit -m "fix(phase5): smoke-check fixes"
```

*(Skip if clean.)*

---

## Task 12: Close out the redesign

- [ ] **Step 1: Confirm every spec surface exists**

Walk spec §5's seven sidebar items and confirm each is real: Dashboard, Markets, Portfolio, Leaderboard, News, Strategy Lab (3 sub-pages), Settings. Any remaining placeholder is a bug.

- [ ] **Step 2: Full verification**

```bash
pytest -q
cd dashboard && npm test && npm run build
```

- [ ] **Step 3: Hand back to the user**

Do **not** merge to `main` unprompted. `main` auto-deploys to Render and Vercel. Report the branch, the two suite counts, and the smoke-check results, then ask whether to merge — the same handling Phase 3 used.

---

## Exit criteria

1. `/leaderboard`, `/news`, and `/settings` are all real pages; no `ComingSoon` route remains.
2. News survives a total feed outage by serving stale items with a visible note, never an error page.
3. The leaderboard shows You, every paper session, and buy-and-hold BTC, sorted by return, each with its own start date displayed.
4. Portfolio reset requires an explicit confirmation dialog and honours the entered starting cash.
5. No new database tables and no new migration were added.
6. Backend and frontend suites green; production build clean.
7. Every `/lab/*` page still works.

---

## Self-review notes

**Spec coverage.** §5 Leaderboard ("You vs the AI" with start dates shown): Tasks 4, 5, 8. §5 News (title/source/age/link-out): Tasks 2, 3, 7. §5 Settings (reset with confirmation, starting cash, advisor on/off): Task 9 — the advisor toggle arrived in Phase 4. §7 `GET /news` (free RSS, ~10 min cache, no API key): Tasks 2, 3. §7 `GET /leaderboard` (label, start date, total return %, sparkline): Tasks 4, 5. §10 error handling (news failure → cached items or a designed empty state): Tasks 2, 7. §12 leaderboard comparability caveat (display start dates rather than hide them): Tasks 5, 8.

**Deliberate deviation.** Limit orders — spec §5 attaches them to Pro view — are cut from the redesign entirely per the 2026-08-08 decision. Nothing here implements them, and spec §5's Pro-view sentence should be treated as superseded.

**Two places this plan tells you to check rather than assume.** Task 5's `PaperRepository.record_tick` keyword names, and Task 8's `Sparkline` export/prop shape. Both are existing code the plan could only guess at; read them before writing the test.

**Carried-forward known gap.** The vendored shadcn `dialog.tsx` `forwardRef` dev warning (found in Phase 3, still open in Phase 4) gains a third consumer in the Settings reset dialog. Dev-only, stripped from production builds. Fix with `npx shadcn add dialog --overwrite` whenever someone picks it up.
