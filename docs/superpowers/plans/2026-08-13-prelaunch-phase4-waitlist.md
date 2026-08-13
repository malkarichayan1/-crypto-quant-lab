# Pre-Launch Phase 4: Email Capture & Thank-You Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real "get notified" email-capture form on the landing page, backed by a new FastAPI endpoint + Postgres table (not a third-party form vendor), with honeypot + rate-limit spam protection, and a `/thank-you` page it redirects to on success.

**Architecture:** Backend follows the exact pattern already used by `watchlist.py`/`ManualRepository` — a thin route, a repository, a SQLAlchemy model, an Alembic migration. A new small in-memory fixed-window `rate_limit` dependency (no Redis needed — Render's free tier runs a single process). Frontend follows the existing `api/*.ts` + `useMutation` pattern already used elsewhere in the dashboard.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, `email-validator` (new dependency, required for Pydantic's `EmailStr`), pytest. React 18, `@tanstack/react-query`, Vitest.

Reference spec: `docs/superpowers/specs/2026-08-13-pre-launch-seo-marketing-design.md`, section 7.

**Depends on:** Phase 1 (`LandingPage.tsx`, `App.tsx` routes) and Phase 2 (`usePageMeta`). Independent of Phase 3, but Task 7 here composes into the same `LandingPage.tsx` Phase 3 also modifies — do Phase 3 first to avoid a merge conflict on that file, or resolve the conflict manually (both additions are small, non-overlapping JSX blocks).

---

### Task 1: In-memory rate limiter

**Files:**
- Create: `src/hedgefund/api/rate_limit.py`
- Test: `tests/api/test_rate_limit.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_rate_limit.py
from __future__ import annotations

import pytest
from fastapi import HTTPException, Request

from hedgefund.api.rate_limit import _hits, rate_limit


def make_request(ip: str) -> Request:
    return Request({"type": "http", "client": (ip, 1234)})


@pytest.fixture(autouse=True)
def _clear_hits():
    _hits.clear()
    yield
    _hits.clear()


def test_allows_requests_under_the_limit():
    for _ in range(5):
        rate_limit(make_request("1.2.3.4"))  # should not raise


def test_blocks_the_6th_request_within_the_window():
    for _ in range(5):
        rate_limit(make_request("1.2.3.4"))
    with pytest.raises(HTTPException) as exc_info:
        rate_limit(make_request("1.2.3.4"))
    assert exc_info.value.status_code == 429


def test_tracks_ips_independently():
    for _ in range(5):
        rate_limit(make_request("1.1.1.1"))
    rate_limit(make_request("2.2.2.2"))  # different IP, should not raise
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/api/test_rate_limit.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.api.rate_limit'`

- [ ] **Step 3: Write the implementation**

```python
# src/hedgefund/api/rate_limit.py
from __future__ import annotations

import time
from collections import defaultdict

from fastapi import HTTPException, Request

# In-memory fixed-window limiter. Render's free tier runs a single process,
# so a module-level dict is sufficient — no Redis needed for one low-traffic
# endpoint. Resets on process restart; that's fine for abuse mitigation, not
# billing-grade accuracy.
_WINDOW_SECONDS = 3600
_MAX_REQUESTS = 5
_hits: dict[str, list[float]] = defaultdict(list)


def rate_limit(request: Request) -> None:
    """FastAPI dependency: raises 429 if the caller's IP has made
    _MAX_REQUESTS or more requests within the trailing _WINDOW_SECONDS."""
    client_host = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = [t for t in _hits[client_host] if now - t < _WINDOW_SECONDS]
    if len(recent) >= _MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    recent.append(now)
    _hits[client_host] = recent
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/api/test_rate_limit.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hedgefund/api/rate_limit.py tests/api/test_rate_limit.py
git commit -m "feat(waitlist): add in-memory per-IP rate limiter"
```

---

### Task 2: waitlist_signups table

**Files:**
- Create: `src/hedgefund/api/db/waitlist_models.py`
- Create: `migrations/versions/0007_add_waitlist.py`
- Modify: `pyproject.toml`

- [ ] **Step 1: Confirm the current migration head**

Run: `sed -n '1,15p' migrations/versions/0006_add_advice_log.py`
Expected: `revision = "0006"` — confirmed already; the new migration's
`down_revision` below depends on this staying `"0006"`. If a newer migration
has been added since this plan was written, use its `revision` value instead.

- [ ] **Step 2: Add the SQLAlchemy model**

```python
# src/hedgefund/api/db/waitlist_models.py
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from hedgefund.api.db.models import Base


class WaitlistSignupRow(Base):
    __tablename__ = "waitlist_signups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 3: Add the Alembic migration**

```python
# migrations/versions/0007_add_waitlist.py
"""add waitlist_signups table

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "waitlist_signups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("waitlist_signups")
```

- [ ] **Step 4: Add email-validator to the api dependency group**

In `pyproject.toml`, add `"email-validator>=2.0"` to the `api` list (needed
for Pydantic's `EmailStr`, used in Task 3):

```toml
api = [
    "fastapi>=0.110",
    "uvicorn[standard]>=0.29",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "psycopg[binary]>=3.1",
    "python-dotenv>=1.0",
    "httpx>=0.27",
    "anthropic>=0.30",
    "langgraph>=0.2,<0.3",
    "feedparser>=6.0",
    "email-validator>=2.0",
]
```

- [ ] **Step 5: Reinstall and verify the migration applies**

Run: `pip install -e ".[dev,api]"`
Run: `alembic upgrade head`
Expected: applies `0007_add_waitlist` cleanly against your local/dev database
with no errors. (The `tests/api/conftest.py` test suite creates tables
directly from `Base.metadata`, not via Alembic, so this step is a real-DB
sanity check independent of the test suite in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add src/hedgefund/api/db/waitlist_models.py migrations/versions/0007_add_waitlist.py pyproject.toml
git commit -m "feat(waitlist): add waitlist_signups table and migration"
```

---

### Task 3: Waitlist endpoint

**Files:**
- Create: `src/hedgefund/api/waitlist_schemas.py`
- Create: `src/hedgefund/api/db/waitlist_repository.py`
- Create: `src/hedgefund/api/routes/waitlist.py`
- Test: `tests/api/test_waitlist_routes.py`
- Modify: `src/hedgefund/api/app.py`

**Depends on:** Tasks 1–2.

- [ ] **Step 1: Write the failing tests**

```python
# tests/api/test_waitlist_routes.py
from __future__ import annotations

import pytest
from sqlalchemy import select

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


def test_waitlist_rate_limits_after_5_requests_from_the_same_client(client):
    for i in range(5):
        res = client.post("/waitlist", json={"email": f"person{i}@example.com"})
        assert res.status_code == 200
    res = client.post("/waitlist", json={"email": "person6@example.com"})
    assert res.status_code == 429
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/api/test_waitlist_routes.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'hedgefund.api.waitlist_schemas'` (and
`waitlist_repository`, once that import is reached)

- [ ] **Step 3: Write the schemas**

```python
# src/hedgefund/api/waitlist_schemas.py
from __future__ import annotations

from pydantic import BaseModel, EmailStr


class WaitlistRequest(BaseModel):
    email: EmailStr
    # Honeypot: hidden from real users via CSS on the frontend form. Any
    # non-empty value here means an automated submitter filled every field
    # it could find — the route accepts it (200) but stores nothing.
    company: str = ""


class WaitlistResponse(BaseModel):
    status: str
```

- [ ] **Step 4: Write the repository**

```python
# src/hedgefund/api/db/waitlist_repository.py
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from hedgefund.api.db.waitlist_models import WaitlistSignupRow


class WaitlistRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add_email(self, email: str) -> None:
        """Idempotent: re-submitting an email already on the list is a
        silent no-op success, never a user-facing "already registered"
        leak."""
        normalized = email.strip().lower()
        existing = self._session.scalar(
            select(WaitlistSignupRow).where(WaitlistSignupRow.email == normalized)
        )
        if existing is not None:
            return
        self._session.add(WaitlistSignupRow(id=uuid.uuid4(), email=normalized))
```

- [ ] **Step 5: Write the route**

```python
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
```

- [ ] **Step 6: Register the router**

In `src/hedgefund/api/app.py`, add the import near the other route imports:

```python
from hedgefund.api.routes.waitlist import router as waitlist_router
```

And register it alongside the others in `create_app()`:

```python
    app.include_router(leaderboard_router)
    app.include_router(waitlist_router)
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pytest tests/api/test_waitlist_routes.py -v`
Expected: PASS (6 tests)

- [ ] **Step 8: Run the full backend suite**

Run: `pytest`
Expected: PASS — confirms `app.py`'s new import/router registration didn't
break anything else.

- [ ] **Step 9: Commit**

```bash
git add src/hedgefund/api/waitlist_schemas.py src/hedgefund/api/db/waitlist_repository.py \
  src/hedgefund/api/routes/waitlist.py src/hedgefund/api/app.py tests/api/test_waitlist_routes.py
git commit -m "feat(waitlist): add POST /waitlist endpoint"
```

---

### Task 4: Frontend waitlist API client

**Files:**
- Create: `dashboard/src/api/waitlist.ts`
- Test: `dashboard/src/api/waitlist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// dashboard/src/api/waitlist.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinWaitlist } from './waitlist'

describe('joinWaitlist', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the email and honeypot field to /waitlist', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await joinWaitlist('person@example.com', '')

    expect(result).toEqual({ status: 'ok' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/waitlist$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'person@example.com', company: '' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/api/waitlist.test.ts`
Expected: FAIL — `Cannot find module './waitlist'`

- [ ] **Step 3: Write the implementation**

```ts
// dashboard/src/api/waitlist.ts
import { apiFetch } from './client'

export function joinWaitlist(email: string, company: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, company }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/api/waitlist.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/api/waitlist.ts dashboard/src/api/waitlist.test.ts
git commit -m "feat(waitlist): add frontend waitlist API client"
```

---

### Task 5: WaitlistForm component

**Files:**
- Create: `dashboard/src/components/landing/WaitlistForm.tsx`
- Test: `dashboard/src/components/landing/WaitlistForm.test.tsx`

**Depends on:** Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
// dashboard/src/components/landing/WaitlistForm.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WaitlistForm } from './WaitlistForm'
import * as waitlistApi from '../../api/waitlist'

vi.mock('../../api/waitlist')

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WaitlistForm />} />
          <Route path="/thank-you" element={<p>thank you</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WaitlistForm', () => {
  beforeEach(() => {
    vi.mocked(waitlistApi.joinWaitlist).mockResolvedValue({ status: 'ok' })
  })

  it('submits the email and navigates to /thank-you on success', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(/email address/i), 'person@example.com')
    await user.click(screen.getByRole('button', { name: /notify me/i }))
    expect(await screen.findByText('thank you')).toBeInTheDocument()
    expect(waitlistApi.joinWaitlist).toHaveBeenCalledWith('person@example.com', '')
  })

  it('shows an error message and does not navigate on failure', async () => {
    vi.mocked(waitlistApi.joinWaitlist).mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(/email address/i), 'person@example.com')
    await user.click(screen.getByRole('button', { name: /notify me/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.queryByText('thank you')).not.toBeInTheDocument()
  })

  it('has a honeypot field hidden from view and screen readers', () => {
    renderForm()
    const honeypot = screen.getByTestId('waitlist-honeypot')
    expect(honeypot).toHaveAttribute('aria-hidden', 'true')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/components/landing/WaitlistForm.test.tsx`
Expected: FAIL — `Cannot find module './WaitlistForm'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/components/landing/WaitlistForm.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { joinWaitlist } from '../../api/waitlist'

export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => joinWaitlist(email, company),
    onSuccess: () => navigate('/thank-you'),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <section className="mx-auto w-full max-w-sm px-6 py-16">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <h2 className="text-center text-xl font-bold">Get notified about new features</h2>
        <div className="flex gap-2">
          <Input
            type="email"
            required
            placeholder="you@example.com"
            aria-label="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Notify me'}
          </Button>
        </div>
        {/* Honeypot: hidden from real users via CSS and aria-hidden. Bots
            that fill every field they find trip this; the backend accepts
            the request but stores nothing (see waitlist_schemas.py). */}
        <input
          type="text"
          name="company"
          data-testid="waitlist-honeypot"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        {mutation.isError && (
          <p role="alert" className="text-sm text-loss">
            Something went wrong. Please try again.
          </p>
        )}
      </form>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/components/landing/WaitlistForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/landing/WaitlistForm.tsx dashboard/src/components/landing/WaitlistForm.test.tsx
git commit -m "feat(waitlist): add WaitlistForm component"
```

---

### Task 6: Thank-you page and route

**Files:**
- Create: `dashboard/src/pages/ThankYouPage.tsx`
- Test: `dashboard/src/pages/ThankYouPage.test.tsx`
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/App.test.tsx`

**Depends on:** Phase 1's `App.tsx`.

- [ ] **Step 1: Write the failing test for ThankYouPage**

```tsx
// dashboard/src/pages/ThankYouPage.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThankYouPage } from './ThankYouPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ThankYouPage />
    </MemoryRouter>,
  )
}

describe('ThankYouPage', () => {
  it('renders a confirmation heading, a CTA into the app, and a unique title', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
    expect(document.title).toBe('Thanks! — HedgeFund Simulator')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/ThankYouPage.test.tsx`
Expected: FAIL — `Cannot find module './ThankYouPage'`

- [ ] **Step 3: Write the implementation**

```tsx
// dashboard/src/pages/ThankYouPage.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'

export function ThankYouPage() {
  usePageMeta(
    'Thanks! — HedgeFund Simulator',
    "You're on the list. Head into the app to start simulating trades right now.",
  )

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">You're on the list</h1>
      <p className="text-muted-foreground">
        Thanks for signing up. In the meantime, there's nothing stopping you
        from starting right now — no account needed.
      </p>
      <Button asChild size="lg">
        <Link to="/app">Start simulating — it's free</Link>
      </Button>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/ThankYouPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Add the route in App.tsx**

In `dashboard/src/App.tsx`, add the import:

```tsx
import { ThankYouPage } from './pages/ThankYouPage'
```

And add the route as a sibling of the `/` route (public, no `AppShell`):

```tsx
      <Route path="/" element={<LandingPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
```

- [ ] **Step 6: Add a routing test**

Add to `dashboard/src/App.test.tsx`:

```tsx
  it('renders the thank-you page at /thank-you', () => {
    renderAt('/thank-you')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start simulating/i })).toHaveAttribute(
      'href',
      '/app',
    )
  })
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd dashboard && npm test -- src/App.test.tsx src/pages/ThankYouPage.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/pages/ThankYouPage.tsx dashboard/src/pages/ThankYouPage.test.tsx \
  dashboard/src/App.tsx dashboard/src/App.test.tsx
git commit -m "feat(waitlist): add /thank-you page and route"
```

---

### Task 7: Wire WaitlistForm into LandingPage

**Files:**
- Modify: `dashboard/src/pages/LandingPage.tsx`
- Modify: `dashboard/src/pages/LandingPage.test.tsx`

**Depends on:** Task 5, and Phase 3 (if already implemented — `FaqSection`/
`SiteFooter`/`StickyMobileCta` composition). If Phase 3 hasn't been
implemented yet, skip the `FaqSection`/`SiteFooter`/`StickyMobileCta`
imports and JSX below and just add `WaitlistForm` after the hero `<main>`.

- [ ] **Step 1: Extend LandingPage.test.tsx**

Add a `QueryClientProvider` wrapper (required now that `LandingPage` renders
`WaitlistForm`, which calls `useMutation`) and a new test:

```tsx
// dashboard/src/pages/LandingPage.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LandingPage } from './LandingPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LandingPage', () => {
  // ...existing tests from Phase 1/2/3 unchanged, now using the updated renderPage...

  it('renders the waitlist form', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: FAIL — `renders the waitlist form` fails (not composed in yet)

- [ ] **Step 3: Update LandingPage.tsx**

```tsx
// dashboard/src/pages/LandingPage.tsx
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../hooks/usePageMeta'
import { FaqSection } from '../components/landing/FaqSection'
import { SiteFooter } from '../components/landing/SiteFooter'
import { StickyMobileCta } from '../components/landing/StickyMobileCta'
import { WaitlistForm } from '../components/landing/WaitlistForm'

export function LandingPage() {
  usePageMeta(
    'HedgeFund Simulator — Practice investing risk-free',
    'Trade crypto with $100,000 in virtual cash, real market prices, and free AI advice. No real money, ever.',
  )

  return (
    <div className="pb-20 sm:pb-0">
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Learn to invest without risking a cent
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Trade crypto with $100,000 in virtual cash, real market prices, and
          plain-English AI advice. No real money, ever.
        </p>
        <Button asChild size="lg">
          <Link to="/app">Start simulating — it's free</Link>
        </Button>
      </main>
      <FaqSection />
      <WaitlistForm />
      <SiteFooter />
      <StickyMobileCta />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npm test -- src/pages/LandingPage.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full frontend suite**

Run: `cd dashboard && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/pages/LandingPage.tsx dashboard/src/pages/LandingPage.test.tsx
git commit -m "feat(waitlist): compose WaitlistForm into the landing page"
```

---

## Phase 4 exit check

```bash
pytest
cd dashboard && npm run build && npm test
```

Manually smoke-test end to end in the dev server against a local backend:
submit the waitlist form with a real-looking email, confirm it lands on
`/thank-you`, resubmit the same email and confirm no error (idempotent),
and confirm the row appears in your local Postgres `waitlist_signups` table.
