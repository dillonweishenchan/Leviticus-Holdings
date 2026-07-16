# Fund Portal

A lightweight investor portal: live stock prices, holdings entered as ticker + shares, and performance shown as **current market value vs. principal invested**. Changes made in Admin sync across all devices via a tiny API backed by Vercel Blob storage.

## Deploy (GitHub → Vercel, ~5 minutes)

1. **Put these files in a GitHub repository.**
   Easiest way without git: create a new repo on github.com (private is fine) → **Add file → Upload files** → drag in everything in this folder (`index.html`, the `api` folder, `package.json`, `.gitignore`, `README.md`) → **Commit changes**. Make sure `state.js` and `quote.js` end up inside an `api/` folder.

2. **Import to Vercel.**
   At [vercel.com](https://vercel.com): **Add New → Project** → import the repo → leave every setting as-is → **Deploy**. The site will be live at `your-project.vercel.app`, but sync is not on yet.

3. **Create the storage.**
   In the Vercel project: **Storage** tab → **Create Database → Blob** → create and **Connect** it to this project. This adds the `BLOB_READ_WRITE_TOKEN` environment variable automatically.

4. **Redeploy once.**
   **Deployments** tab → latest deployment → **⋯ → Redeploy** (so the new environment variable takes effect).

Open the site — the yellow banner should read **"Synced across devices."** Edits made in the Admin tab now appear on every device (other open devices pick up changes within ~1 minute).

## Using it

- **Admin tab** — add positions (ticker + number of shares), cash balance, investors and contributions, and change the fund name (Settings).
- **Viewer menu** (top right) — switch between the whole fund and any investor's account.
- **Investor links** — share `https://your-site.vercel.app/?investor=their-email` to open the portal on their account.
- **Local preview** — you can also just double-click `index.html`; it runs in single-browser mode (no sync, quotes via public fallback routes).

## Price data

Deployed, quotes come from the site's own `/api/quote` endpoint (server-side Yahoo Finance, delayed public data, cached ~60s, auto-refresh every 5 min). If that's ever unavailable the page falls back to public quote routes, an optional free [finnhub.io](https://finnhub.io) API key (Settings), and finally last-known prices — always labeled with a live/fallback badge.

## Important limitations (read this)

- **No authentication.** Anyone who has the URL can view *and edit* everything. Don't put real client data on it in this state. Options: keep the URL private while prototyping, enable Vercel's Deployment Protection, or ask for a version with real sign-in (recommended before showing clients).
- **Last write wins.** If two people edit Admin at the same time, the later save overwrites the earlier one.
- **Delayed quotes.** Public Yahoo data is delayed and unofficial — fine for a tracker, not exchange-grade.
- Performance is pro-rata to principal: every investor shows the fund's overall return regardless of when they invested. Unitized (NAV-based) accounting can be added if timing-fair returns matter.
