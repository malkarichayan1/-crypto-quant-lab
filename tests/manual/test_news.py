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


def test_parse_feed_treats_an_unrepresentable_date_as_undated_not_a_crash():
    # year 1 parses to a valid struct_time that time.mktime cannot represent.
    body = _RSS.replace("Fri, 08 Aug 2026 12:00:00 GMT", "Mon, 01 Jan 0001 00:00:00 GMT")

    items = parse_feed(body, source="Example")

    assert len(items) == 2
    dated = next(i for i in items if i.title == "Ethereum does another thing")
    undated = next(i for i in items if i.title == "Bitcoin does a thing")
    assert dated.published_at is not None
    assert undated.published_at is None
