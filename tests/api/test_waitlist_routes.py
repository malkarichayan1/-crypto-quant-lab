# tests/api/test_waitlist_routes.py
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from hedgefund.api.db.waitlist_models import WaitlistSignupRow


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    from hedgefund.api.rate_limit import _hits

    _hits.clear()
    yield
    _hits.clear()


def test_waitlist_signup_succeeds(client):
    res = client.post("/waitlist", json={"email": "person@example.com"})
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_waitlist_signup_is_idempotent_on_duplicate_email(client):
    client.post("/waitlist", json={"email": "person@example.com"})
    res = client.post("/waitlist", json={"email": "person@example.com"})
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_waitlist_normalizes_email_case_and_whitespace(client, session):
    client.post("/waitlist", json={"email": "  Person@Example.com  "})
    rows = session.scalars(select(WaitlistSignupRow)).all()
    assert [r.email for r in rows] == ["person@example.com"]


def test_waitlist_rejects_invalid_email(client):
    res = client.post("/waitlist", json={"email": "not-an-email"})
    assert res.status_code == 422


def test_waitlist_honeypot_silently_no_ops(client, session):
    res = client.post("/waitlist", json={"email": "bot@example.com", "company": "Acme"})
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    rows = session.scalars(select(WaitlistSignupRow)).all()
    assert rows == []


def test_waitlist_survives_concurrent_duplicate_commit_race(client, session, monkeypatch):
    """Simulates two near-simultaneous requests for the same email racing
    past WaitlistRepository.add_email's existing-row check before either
    commits: the second request's session.commit() hits the unique
    constraint on email. The route must catch that IntegrityError and still
    return the documented idempotent success response, not an unhandled
    500. We force this deterministically by making the session's own
    commit() raise IntegrityError once, rather than relying on real
    request timing."""

    def _commit_raises_integrity_error():
        raise IntegrityError(
            "INSERT INTO waitlist_signups ...",
            {},
            Exception('duplicate key value violates unique constraint "waitlist_signups_email_key"'),
        )

    monkeypatch.setattr(session, "commit", _commit_raises_integrity_error)

    res = client.post("/waitlist", json={"email": "racey@example.com"})

    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_waitlist_rate_limits_after_5_requests_from_the_same_client(client):
    for i in range(5):
        res = client.post("/waitlist", json={"email": f"person{i}@example.com"})
        assert res.status_code == 200
    res = client.post("/waitlist", json={"email": "person6@example.com"})
    assert res.status_code == 429
