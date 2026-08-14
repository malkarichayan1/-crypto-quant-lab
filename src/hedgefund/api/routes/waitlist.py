# src/hedgefund/api/routes/waitlist.py
from __future__ import annotations

from fastapi import APIRouter, Depends
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
    session.commit()
    return WaitlistResponse(status="ok")
