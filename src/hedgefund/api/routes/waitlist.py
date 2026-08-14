# src/hedgefund/api/routes/waitlist.py
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from hedgefund.api.db.engine import get_session
from hedgefund.api.db.waitlist_repository import WaitlistRepository
from hedgefund.api.rate_limit import rate_limit
from hedgefund.api.waitlist_schemas import WaitlistRequest, WaitlistResponse

router = APIRouter(prefix="/waitlist", tags=["waitlist"], dependencies=[Depends(rate_limit)])


@router.post("", response_model=WaitlistResponse)
def join_waitlist(
    body: WaitlistRequest, session: Session = Depends(get_session)
) -> WaitlistResponse:
    if body.company:
        return WaitlistResponse(status="ok")

    repo = WaitlistRepository(session)
    repo.add_email(body.email)
    try:
        session.commit()
    except IntegrityError:
        # Two near-simultaneous requests for the same email (double-click,
        # client retry-on-timeout) can both pass add_email's existing-row
        # check before either commits; the loser hits the unique constraint
        # here. That's the same "already on the list" case add_email treats
        # as a silent no-op success — just discovered at commit time instead
        # of query time — so it gets the same idempotent 200, not a 500.
        session.rollback()
    return WaitlistResponse(status="ok")
