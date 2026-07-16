// Sign-in, sign-out, session status, and investor password management.
// Admin signs in with username "admin" + the ADMIN_PASSWORD env var.
// Investor password hashes live in a separate blob (portal-auth.json),
// so they can never be read or overwritten through /api/state.
import {
  readSession, sign, sessionCookie, clearCookie,
  hashPassword, verifyPassword, safeEqual,
  readBlobJSON, writeBlobJSON, secretKey,
  STATE_PATH, AUTH_PATH
} from "../lib/auth.js";

const WEEK_S = 7 * 24 * 3600;

export default async function handler(req, res) {
  const flags = {
    api: true,
    blob: !!process.env.BLOB_READ_WRITE_TOKEN,
    admin: !!process.env.ADMIN_PASSWORD
  };
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const s = readSession(req);
    return res.status(200).json({
      ...flags,
      authed: !!s,
      role: s ? s.role : null,
      name: s ? s.name : null,
      cid: s ? s.cid : null
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method-not-allowed" });
  }

  const body = req.body || {};
  const action = body.action;

  if (action === "logout") {
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ ok: true });
  }

  if (!flags.blob || !flags.admin || !secretKey()) {
    return res.status(501).json({ error: "not-configured", ...flags });
  }

  try {
    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const pw = String(body.password || "");
      if (!email || !pw) return res.status(400).json({ error: "missing-fields" });

      if (email === "admin") {
        if (!safeEqual(pw, process.env.ADMIN_PASSWORD)) {
          return res.status(401).json({ error: "bad-credentials" });
        }
        const tok = sign({ role: "admin", name: "Fund Admin", cid: null, exp: Date.now() + WEEK_S * 1000 });
        res.setHeader("Set-Cookie", sessionCookie(tok, WEEK_S));
        return res.status(200).json({ ok: true, role: "admin", name: "Fund Admin", cid: null });
      }

      const state = await readBlobJSON(STATE_PATH);
      const c = state && Array.isArray(state.clients)
        ? state.clients.find(x => String(x.email || "").toLowerCase() === email)
        : null;
      if (!c) return res.status(401).json({ error: "bad-credentials" });

      const auth = (await readBlobJSON(AUTH_PATH)) || { clients: {} };
      const stored = auth.clients ? auth.clients[String(c.id)] : null;
      if (!stored) return res.status(401).json({ error: "no-password" });
      if (!verifyPassword(pw, stored)) return res.status(401).json({ error: "bad-credentials" });

      const tok = sign({ role: "investor", name: c.name, cid: c.id, exp: Date.now() + WEEK_S * 1000 });
      res.setHeader("Set-Cookie", sessionCookie(tok, WEEK_S));
      return res.status(200).json({ ok: true, role: "investor", name: c.name, cid: c.id });
    }

    if (action === "set-password") {
      const s = readSession(req);
      if (!s || s.role !== "admin") return res.status(401).json({ error: "unauthorized" });
      const cid = String(body.cid || "");
      const pw = String(body.password || "");
      if (!cid) return res.status(400).json({ error: "missing-cid" });
      if (pw.length < 6) return res.status(400).json({ error: "weak-password" });
      const auth = (await readBlobJSON(AUTH_PATH)) || { clients: {} };
      if (!auth.clients) auth.clients = {};
      auth.clients[cid] = hashPassword(pw);
      await writeBlobJSON(AUTH_PATH, auth);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown-action" });
  } catch (e) {
    return res.status(500).json({ error: "auth-error", detail: String(e && e.message || e) });
  }
}
