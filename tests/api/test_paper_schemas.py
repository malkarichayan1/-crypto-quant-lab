import pytest
from pydantic import ValidationError

from hedgefund.api.paper_schemas import CreatePaperSessionRequest


def test_accepts_spec_json_only():
    req = CreatePaperSessionRequest(label="t", spec_json={"name": "x"}, starting_cash=5000.0)
    assert req.starting_cash == 5000.0


def test_defaults_starting_cash():
    req = CreatePaperSessionRequest(label="t", spec_json={"name": "x"})
    assert req.starting_cash == 10_000.0


def test_rejects_nonpositive_cash():
    with pytest.raises(ValidationError):
        CreatePaperSessionRequest(label="t", spec_json={"name": "x"}, starting_cash=0.0)
