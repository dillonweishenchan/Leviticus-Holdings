// Shared portfolio state (Vercel Blob). Server-enforced access:
//   - admin sessions:    full state, read + write
//   - investor sessions: read-only, filtered to their own account
//     (other investors' identities and amounts are never sent)
import { readSession, readBlobJSON, writeBlobJSON, STATE_PATH } from "../lib/auth.js";

// Aggregate cumulative principal by month (no identities) so investor
// charts can show their ownership share over time without leaking data.
function tpSeriesOf(state) {
  const events = [];
  for (const c of state.clients || []) {
    for (const k of c.contributions || []) {
      if (k && k.ym && k.amount > 0) events.push({ ym: k.ym, amount: k.amount });
    }
  }
  events.sort((a, b) => (a.ym < b.ym ? -1 : 1));
  const out = [];
  let run = 0;
  for (const e of events) {
    run += e.amount;
    const last = out[out.length - 1];
    if (last && last.ym === e.ym) last.total = run;
    else out.push({ ym: e.ym, total: run });
  }
  return out;
}

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.ADMIN_PASSWORD) {
    return res.status(501).json({
      error: "not-configured",
      blob: !!process.env.BLOB_READ_WRITE_TOKEN,
      admin: !!process.env.ADMIN_PASSWORD
    });
  }
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });

  try {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      const state = await readBlobJSON(STATE_PATH);
      if (!state) return res.status(200).json({ state: null });

      if (s.role === "admin") return res.status(200).json({ state });

      const me = (state.clients || []).find(c => String(c.id) === String(s.cid));
      if (!me) return res.status(403).json({ error: "no-account" });
      const filtered = {
        at: state.at || 0,
        fund: state.fund,
        cash: state.cash,
        holdings: state.holdings,
        quotes: state.quotes,
        clients: [me],
        tpSeries: tpSeriesOf(state),
        investorMode: true
      };
      return res.status(200).json({ state: filtered });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (s.role !== "admin") return res.status(403).json({ error: "forbidden" });
      const body = req.body;
      if (!body || typeof body !== "object" || !Array.isArray(body.holdings) || !Array.isArray(body.clients)) {
        return res.status(400).json({ error: "bad-body" });
      }
      delete body.tpSeries;
      delete body.investorMode;
      await writeBlobJSON(STATE_PATH, body);
      return res.status(200).json({ ok: true, at: Date.now() });
    }

    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: "storage-error", detail: String(e && e.message || e) });
  }
}
