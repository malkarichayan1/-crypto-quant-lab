# Deploying HedgeFund Simulator

Backend on Render, Postgres on Neon, frontend on Vercel, deployed from `main`. Written after the first deploy; update this file if the setup changes.

## Why this stack

- The backend is a long-running FastAPI process (in-memory market-data TTL cache, background startup tasks) — not a fit for pure serverless functions, so it needs a host that keeps a process alive. Render's free Web Service tier does this.
- Render's own free Postgres expires after 30 days; Neon's free tier doesn't, so the database is hosted separately.
- Binance (the exchange the app talks to via ccxt) geo-blocks some regions with an HTTP 451. The backend is deployed to Render's **Frankfurt** region specifically to avoid that — if you see "We couldn't load market data" on the deployed site, check whether Binance is blocking that region too and consider switching region or exchange.

## One-time setup

### 1. Neon (Postgres)

1. Create a free project at neon.tech.
2. Copy the connection string it gives you (starts with `postgresql://`). You'll paste this into Render as `DATABASE_URL` — SQLAlchemy needs the `postgresql+psycopg://` driver prefix, so replace `postgresql://` with `postgresql+psycopg://` at the start of the string before using it.

### 2. Render (backend)

1. Create a Render account, connect your GitHub account.
2. "New" → "Blueprint" → select this repo (`malkarichayan1/-crypto-quant-lab`) → branch `main`. Render reads `render.yaml` at the repo root and proposes the `hedgefund-api` web service.
3. Fill in the env vars Render prompts for (marked `sync: false` in `render.yaml`, so they're not committed to git):
   - `DATABASE_URL` — the Neon connection string from step 1 (with the `+psycopg` driver prefix).
   - `CORS_ORIGINS` — leave blank for now; you'll set this after step 3 (Vercel) once you know the frontend's URL. Until then, only `http://localhost:5173` will be allowed to call the API.
   - `ANTHROPIC_API_KEY` — optional. Only needed if you want the LLM-backed "Research"/agent features to work; the rest of the app functions without it.
4. Deploy. `render.yaml`'s `startCommand` runs `alembic upgrade head` before launching uvicorn on every start (Render's free tier doesn't support a separate pre-deploy command step, so migrations are chained into the start command instead — `alembic upgrade head` is idempotent, so this is a safe no-op once the DB is already current).
5. Once live, note the service URL (`https://hedgefund-api-xxxx.onrender.com` or similar) and confirm `https://<that-url>/health` returns `{"status": "ok"}`.

### 3. Vercel (frontend)

1. Create a Vercel account, import this GitHub repo as a new project.
2. Set the project's root directory to `dashboard`. Build command (`npm run build`) and output directory (`dist`) are Vite defaults — no override needed.
3. Add an environment variable `VITE_API_URL` = the Render URL from step 2.4 (no trailing slash).
4. Optionally add `VITE_GA_MEASUREMENT_ID` = your GA4 measurement ID (e.g. `G-XXXXXXXXXX`). Analytics won't load without it — `useGoogleAnalytics` no-ops when this var is unset — so set it before/at launch if you want traffic tracked.
5. Deploy. Note the resulting Vercel URL.

### 4. Close the loop

Go back to Render, set the `CORS_ORIGINS` env var to the Vercel URL from step 3.5 (comma-separate multiple origins if you have more than one, e.g. a preview URL too). Render redeploys automatically on env var change — no code push needed.

### 5. Verify

Open the Vercel URL:
- `/markets` should list real coins with prices and sparklines (not the "couldn't load market data" error — if you see that, check the Render logs for the underlying ccxt error).
- Star a coin, reload — it should still be starred (proves the Neon DB write path works).
- Open a coin's trade view (`/coins/BTC`), confirm the chart renders and the Pro-view toggle shows candles + volume + SMA + RSI.
- Check the browser console for errors.

## Redeploying later

Both Render and Vercel auto-deploy on every push to the connected branch. No manual steps needed for ordinary code changes — only re-run the steps above if you add a new required env var or change the deploy branch.
