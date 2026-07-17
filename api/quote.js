// Server-side quote proxy: /api/quote?symbols=SPY,AAPL,BRK-B
// Fetches delayed public quotes + 2y monthly history from Yahoo Finance
// (server-side, so no browser CORS issues). Cached ~60s per warm instance.
// Requires a signed-in session so the proxy can't be abused by outsiders.
import { readSession } from "../lib/auth.js";

const TTL_MS = 60_000;
const cache = new Map(); // symbol -> { at, data }

function ymOf(d) {
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

function parseChart(j) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.meta || !(res.meta.regularMarketPrice > 0)) throw new Error("bad payload");
  const m = res.meta;
  const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
  const hist = [];
  (res.timestamp || []).forEach((ts, i) => {
    const c = closes[i];
    if (c != null && c > 0) {
      const ym = ymOf(new Date(ts * 1000));
      const last = hist[hist.length - 1];
      if (last && last.ym === ym) last.close = c; else hist.push({ ym, close: c });
    }
  });
  // "Today" change must compare against the previous trading day's close.
  // NOTE: chartPreviousClose is the close before the requested RANGE (2 years
  // ago here) — using it showed multi-year moves as daily changes.
  return {
    price: m.regularMarketPrice,
    prev: m.regularMarketPreviousClose > 0 ? m.regularMarketPreviousClose : null,
    name: m.shortName || m.longName || null,
    hist
  };
}

async function fetchSymbol(sym) {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  for (const host of ["query1", "query2"]) {
    try {
      const url = "https://" + host + ".finance.yahoo.com/v8/finance/chart/" +
        encodeURIComponent(sym) + "?range=2y&interval=1mo";
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; portfolio-tracker)", "Accept": "application/json" }
      });
      if (!r.ok) continue;
      const data = parseChart(await r.json());
      cache.set(sym, { at: Date.now(), data });
      return data;
    } catch (e) { /* try next host */ }
  }
  return null;
}

export default async function handler(req, res) {
  if (!readSession(req)) return res.status(401).json({ error: "unauthorized" });
  const raw = (req.query && req.query.symbols) || "";
  const symbols = [...new Set(
    String(raw).split(",").map(s => s.trim().toUpperCase())
      .filter(s => /^[A-Z0-9.\-^=]{1,12}$/.test(s))
  )].slice(0, 40);

  const out = {};
  await Promise.all(symbols.map(async s => {
    const d = await fetchSymbol(s);
    if (d) out[s] = d;
  }));

  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  return res.status(200).json(out);
}
