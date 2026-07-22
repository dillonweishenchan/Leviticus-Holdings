// Shared portfolio state (Vercel Blob). Server-enforced access:
//   - admin sessions:    full state, read + write
//   - investor sessions: read-only; they see every investor's name,
//     contributions and performance (the manager's choice), but other
//     investors' emails are never sent and writes are rejected.
import { readSession, readBlobJSON, writeBlobJSON, readBody, STATE_PATH } from "../lib/auth.js";

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

      const filtered = {
        at: state.at || 0,
        fund: state.fund,
        cash: state.cash,
        ytd: state.ytd ?? null,          // manager-reported YTD figure
        annual: state.annual || [],      // manager-entered yearly returns vs S&P 500
        fees: state.fees || { total: null, taken: null }, // fee tracking
        holdings: state.holdings,
        quotes: state.quotes,
        clients: (state.clients || []).map(x => ({
          id: x.id,
          name: x.name,
          email: "", // emails stay private to the admin
          contributions: x.contributions || [],
          withdrawals: x.withdrawals || []
        })),
        investorMode: true
      };
      return res.status(200).json({ state: filtered });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (s.role !== "admin") return res.status(403).json({ error: "forbidden" });
      const body = await readBody(req); // robust for PUT and POST alike
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
    return res.status(500).json({
      error: "storage-error",
      detail: String(e && e.message || e).slice(0, 300),
      hint: "In Vercel: Storage tab -> the Blob store must show as Connected to this project. If you deleted/recreated the store, reconnect it, then redeploy (the old token stays in env vars until a redeploy)."
    });
  }
}
