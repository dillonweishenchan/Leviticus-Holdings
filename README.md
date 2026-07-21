# Fund Portal

An investor portal with real sign-in: live stock prices, holdings entered as ticker + shares, and performance shown as **current market value vs. principal invested**.

There are exactly **two logins**:

- **Admin** — username `admin` + your `ADMIN_PASSWORD`. Full access; edits sync to all devices.
- **Investors** — username `investor` + the shared `INVESTOR_PASSWORD` you give your clients. Read-only: they see the fund, every investor's performance, and can browse each account view; they can't change anything, and investor emails are never sent to them.

## Deploy (GitHub → Vercel, ~5 minutes)

1. **Put these files in a GitHub repository.**
   Easiest way without git: create a new repo on github.com (private is fine) → **Add file → Upload files** → drag in everything in this folder → **Commit changes**. Keep the folder structure: `state.js`, `quote.js`, `auth.js` inside `api/`, and `auth.js` inside `lib/`.

2. **Import to Vercel.**
   At [vercel.com](https://vercel.com): **Add New → Project** → import the repo → leave settings as-is → **Deploy**.

3. **Set the two passwords.**
   Project → **Settings → Environment Variables** → add `ADMIN_PASSWORD` (yours) and `INVESTOR_PASSWORD` (shared by all investors) — strong, different passwords, applied to all environments.

4. **Create the storage.**
   Project → **Storage** tab → **Create Database → Blob** → create and **Connect** to this project (adds `BLOB_READ_WRITE_TOKEN` automatically). If asked to choose an access mode, **Private** is recommended (both work — the app auto-detects).

5. **Redeploy once.**
   **Deployments** tab → latest → **⋯ → Redeploy**, so both variables take effect.

Open the site. Until steps 3–5 are done it shows a setup checklist; after that, a sign-in screen.

## Using it

- **Sign in as admin** — username `admin`, password: your `ADMIN_PASSWORD`.
- **Admin tab** — positions (ticker + shares), cash, add investors, add contributions, withdraw funds, annual returns vs the S&P 500, fund name and YTD (Settings).
- **Portfolio vs S&P 500 chart** — driven entirely by the yearly figures you type in Admin → Annual returns. Nothing is computed or fetched for it.
- **Withdrawals** — figures shown are net of withdrawals: redeeming units reduces both principal and current value, so Total gain reflects the position still held, not profit already taken out. A disclaimer to this effect appears under the performance tables. Adding a contribution raises the fund's cash by that amount; a withdrawal lowers it (units are redeemed at the current unit price, and the investor's gain % is preserved on the remaining balance).
- **Give investors access** — send them the site URL + username `investor` + the shared `INVESTOR_PASSWORD`. To change it later, update the env var in Vercel and redeploy.
- **Viewer menu** — everyone can switch between the whole fund and any investor's view; only the admin can edit.
- Sessions last 7 days; **Sign out** is in the top bar.
- **Local preview** — double-clicking `index.html` runs an open, browser-only mode with no accounts (for trying the UI). Accounts only exist on the deployed site.

## Price data

Quotes come from the site's `/api/quote` endpoint (server-side Yahoo Finance, delayed public data, cached ~60s, auto-refresh every 5 min, sign-in required). If unavailable, the page falls back to public quote routes, an optional free [finnhub.io](https://finnhub.io) key (Settings), then last-known prices — always labeled live/fallback.

## Troubleshooting

**"SYNC ERROR (storage-error: …)"** — the server can't write to Blob storage. The text after the colon says why; the usual causes:

1. **Store not connected.** Vercel project → **Storage** tab → the Blob store must show **Connected** to this project. If it isn't, connect it.
2. **Stale token.** If you ever deleted/recreated the store, the old `BLOB_READ_WRITE_TOKEN` lingers. Disconnect and reconnect the store (or delete the env var and reconnect), then **redeploy** — env changes only apply on redeploy.
3. Check the function logs: Vercel → project → **Logs** → filter `/api/state` for the full error.

**Setup checklist appears instead of sign-in** — `ADMIN_PASSWORD` or the Blob store is missing from the *running* deployment; add it and redeploy.

## Security notes

- Both passwords live only in Vercel environment variables (never in the data store); sessions are signed, httpOnly, secure cookies lasting 7 days. Investor sessions are read-only and never receive investor emails; note that investors DO see each other's names and performance figures by design, and the shared login means investors are not individually identified.
- Optional: add a `SESSION_SECRET` env var (any long random string). Without it, sessions are keyed off the Blob token and everyone is signed out if you recreate the store.
- Suitable for a small fund sharing statements with clients. For production-grade needs (2FA, audit logs, rate limiting, password self-reset, compliance review), treat this as the starting point, not the finish line.
- Ownership uses a **NAV/unit system**: each contribution buys units at its entry price (units = amount ÷ entry $/unit); the unit price is market value ÷ total units and moves with live prices. Current value = units × unit price (derived, never edited directly), so gains genuinely differ by when each investor came in. New contributions default to the current unit price; backfilled entries default to $1.00/unit until you set their real entry price (Admin → Edit contributions). The fund-level YTD figure is entered manually in Settings (e.g. from IBKR), shown "as of" the current date — never computed.
- Remaining limits: last write wins if two admins edit simultaneously; quotes are delayed and unofficial.
