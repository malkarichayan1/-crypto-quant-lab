# Publishing to Google Play as a TWA

The dashboard is now an installable PWA (manifest + icons + service worker,
added in `dashboard/vite.config.ts` via `vite-plugin-pwa`). This doc covers
the remaining steps to wrap it as a Trusted Web Activity (TWA) and publish it
to the Play Store — these need your Google account and a signing key, so they
can't be automated from here.

**Total unavoidable cost: $25 one-time** (Google Play Developer registration).
Everything below is free tooling.

## 1. Deploy this branch first

Merge/deploy so the manifest, icons, and service worker are live at
`https://crypto-quant-lab.vercel.app`. PWABuilder (next step) audits the
*live* URL, not local code.

Sanity-check after deploy:
- `https://crypto-quant-lab.vercel.app/manifest.webmanifest` returns JSON (not the SPA's `index.html`).
- `https://crypto-quant-lab.vercel.app/pwa-192x192.png` and `/pwa-512x512.png` load.
- `https://crypto-quant-lab.vercel.app/robots.txt` and `/sitemap.xml` still return their real plain-text/XML content (not the SPA shell) — these already worked before the service worker was added, so re-check them specifically now that a service worker is in the mix.
- Chrome DevTools → Application → Manifest shows no errors, and "Installability" passes.

## 2. Generate the Android package with PWABuilder

1. Go to [pwabuilder.com](https://www.pwabuilder.com), enter the live URL above.
2. It scores the PWA (manifest, service worker, icons — all already in place) and lets you download an **Android package**.
3. Choose "Signing" → let PWABuilder **generate a new signing key** for you (simplest — it manages the keystore) unless you already have one you want to reuse.
4. Download the package. It includes:
   - A signed `.aab` (Android App Bundle) — this is what you upload to Play Console.
   - `signing.keystore` + `signing-key-info.txt` — **back these up somewhere safe** (e.g. a password manager or private cloud folder). If you lose the keystore, you cannot publish updates to the same app listing ever again; you'd have to ship as a new app.
   - The SHA256 fingerprint and your chosen Android package ID (e.g. `app.vercel.crypto_quant_lab.twa`).

## 3. Wire up Digital Asset Links

This step makes the app open with **no browser URL bar** (a "trusted" TWA)
instead of falling back to a Chrome Custom Tab with visible chrome.

1. Open `dashboard/public/.well-known/assetlinks.json` in this repo.
2. Replace the two placeholders with the real values from step 2:
   - `package_name` → the Android package ID PWABuilder assigned.
   - `sha256_cert_fingerprints` → the SHA256 fingerprint from `signing-key-info.txt`, as **uppercase hex byte-pairs separated by colons** (e.g. `"AA:BB:CC:..."`). Paste it exactly as PWABuilder outputs it — lowercase or missing colons is still valid JSON (nothing will error) but silently fails Google's verifier, which looks identical to never having filled it in.
3. Commit and deploy so `https://crypto-quant-lab.vercel.app/.well-known/assetlinks.json` serves the real values. `npm run build` prints a warning (via `scripts/check-assetlinks.mjs`) if the placeholder is still present, as a reminder in case this step gets missed.
4. Verify: [Google's Statement List Generator/validator](https://developers.google.com/digital-asset-links/tools/generator) can check the live URL, or just re-run the PWABuilder Android package step — it validates this automatically.

## 4. Google Play Console

1. Register a developer account at [play.google.com/console](https://play.google.com/console) (the $25 fee mentioned at the top of this doc).
2. Create a new app → fill in the store listing (title, short/full description, screenshots — you can screenshot the live site at phone width, e.g. 412×915, in Chrome DevTools device mode).
3. You'll need, before submission:
   - **Privacy policy URL** (required for every app, even free ones). If you don't have one, a simple static page is enough for a no-login-required simulator — note what data is collected (this app already writes to Neon/Postgres for watchlists, so say so).
   - **Data Safety form** — declare what data the app collects/shares.
   - **Financial Services declaration** — since this is a trading *simulator*, declare clearly that it's educational/no real money and does not facilitate real trading, lending, or investing. This keeps it out of the stricter fintech review lane.
4. Upload the `.aab` from step 2 to a release track. Start with **Internal testing** (free, no review, instant — good for a dry run with a shareable link) before promoting to Production (which does get reviewed, typically a few days).

## Known caveat: Render free-tier cold starts

The backend (`hedgefund-api` on Render's free tier) sleeps after ~15 min
idle; the first request after that can take 10–60s. A real Play Store user
hitting a cold backend on first open is a rough first impression — not a
blocker to publishing, but worth knowing. See `DEPLOY.md` for the wider
deployment context; upgrading Render's plan (if this becomes a problem) is a
separate, optional cost decision.
