from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from hedgefund.api.db.models import Base

_TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://hedgefund:hedgefund@localhost:5432/hedgefund_test",
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(_TEST_URL, future=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def session(engine):
    """A session bound to a transaction that is rolled back after each test."""
    connection = engine.connect()
    trans = connection.begin()
    TestSession = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
    sess = TestSession()
    try:
        yield sess
    finally:
        sess.close()
        trans.rollback()
        connection.close()
