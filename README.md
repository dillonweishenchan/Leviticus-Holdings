# Fund Portal

An investor portal with real sign-in: live stock prices, holdings entered as ticker + shares, and performance shown as **current market value vs. principal invested**.

- **You (admin)** sign in with the username `admin` — full access, edit everything; changes sync to all devices.
- **Each investor** signs in with their email + a password you give them — they see **only their own account** (enforced by the server, not just hidden in the page).

## Deploy (GitHub → Vercel, ~5 minutes)

1. **Put these files in a GitHub repository.**
   Easiest way without git: create a new repo on github.com (private is fine) → **Add file → Upload files** → drag in everything in this folder → **Commit changes**. Keep the folder structure: `state.js`, `quote.js`, `auth.js` inside `api/`, and `auth.js` inside `lib/`.

2. **Import to Vercel.**
   At [vercel.com](https://vercel.com): **Add New → Project** → import the repo → leave settings as-is → **Deploy**.

3. **Set your admin password.**
   Project → **Settings → Environment Variables** → add `ADMIN_PASSWORD` with a strong password of your choosing (apply to all environments).

4. **Create the storage.**
   Project → **Storage** tab → **Create Database → Blob** → create and **Connect** to this project (adds `BLOB_READ_WRITE_TOKEN` automatically).

5. **Redeploy once.**
   **Deployments** tab → latest → **⋯ → Redeploy**, so both variables take effect.

Open the site. Until steps 3–5 are done it shows a setup checklist; after that, a sign-in screen.

## Using it

- **Sign in as admin** — email field: `admin`, password: your `ADMIN_PASSWORD`.
- **Admin tab** — positions (ticker + shares), cash, investors and contributions, fund name (Settings).
- **Give investors access** — Admin → Investors → **Set password** next to a name. A password is generated and shown **once**; send it to the investor with the site URL. They sign in with their email. New investors get a password generated automatically when added.
- **Viewer menu** — as admin, switch between the whole fund and any investor's view.
- Sessions last 7 days; **Sign out** is in the top bar.
- **Local preview** — double-clicking `index.html` runs an open, browser-only mode with no accounts (for trying the UI). Accounts only exist on the deployed site.

## Price data

Quotes come from the site's `/api/quote` endpoint (server-side Yahoo Finance, delayed public data, cached ~60s, auto-refresh every 5 min, sign-in required). If unavailable, the page falls back to public quote routes, an optional free [finnhub.io](https://finnhub.io) key (Settings), then last-known prices — always labeled live/fallback.

## Security notes

- Passwords are hashed (scrypt) and stored separately from portfolio data; sessions are signed, httpOnly, secure cookies. Investors' API responses never include other investors' names or amounts.
- Optional: add a `SESSION_SECRET` env var (any long random string). Without it, sessions are keyed off the Blob token and everyone is signed out if you recreate the store.
- Suitable for a small fund sharing statements with clients. For production-grade needs (2FA, audit logs, rate limiting, password self-reset, compliance review), treat this as the starting point, not the finish line.
- Remaining limits: last write wins if two admins edit simultaneously; quotes are delayed and unofficial; performance is pro-rata to principal (every investor shows the fund's overall return regardless of entry timing — unitized NAV accounting can be added if that matters).
