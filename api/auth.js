// Sign-in, sign-out and session status. Exactly two logins:
//   username "admin"    + ADMIN_PASSWORD env var    -> full access
//   username "investor" + INVESTOR_PASSWORD env var -> read-only, shared by all investors
import {
  readSession, sign, sessionCookie, clearCookie,
  safeEqual, readBody, secretKey
} from "../lib/auth.js";

const WEEK_S = 7 * 24 * 3600;

export default async function handler(req, res) {
  const flags = {
    api: true,
    blob: !!process.env.BLOB_READ_WRITE_TOKEN,
    admin: !!process.env.ADMIN_PASSWORD,
    investor: !!process.env.INVESTOR_PASSWORD
  };
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const s = readSession(req);
    return res.status(200).json({
      ...flags,
      authed: !!s,
      role: s ? s.role : null,
      name: s ? s.name : null,
      cid: null
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method-not-allowed" });
  }

  const body = (await readBody(req)) || {};
  const action = body.action;

  if (action === "logout") {
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ ok: true });
  }

  if (!flags.blob || !flags.admin || !secretKey()) {
    return res.status(501).json({ error: "not-configured", ...flags });
  }

  if (action === "login") {
    const user = String(body.email || "").trim().toLowerCase();
    const pw = String(body.password || "");
    if (!user || !pw) return res.status(400).json({ error: "missing-fields" });

    if (user === "admin") {
      if (!safeEqual(pw, process.env.ADMIN_PASSWORD)) {
        return res.status(401).json({ error: "bad-credentials" });
      }
      const tok = sign({ role: "admin", name: "Fund Admin", cid: null, exp: Date.now() + WEEK_S * 1000 });
      res.setHeader("Set-Cookie", sessionCookie(tok, WEEK_S));
      return res.status(200).json({ ok: true, role: "admin", name: "Fund Admin", cid: null });
    }

    if (user === "investor") {
      if (!process.env.INVESTOR_PASSWORD) {
        return res.status(401).json({ error: "investor-login-not-configured" });
      }
      if (!safeEqual(pw, process.env.INVESTOR_PASSWORD)) {
        return res.status(401).json({ error: "bad-credentials" });
      }
      const tok = sign({ role: "investor", name: "Investor", cid: null, exp: Date.now() + WEEK_S * 1000 });
      res.setHeader("Set-Cookie", sessionCookie(tok, WEEK_S));
      return res.status(200).json({ ok: true, role: "investor", name: "Investor", cid: null });
    }

    return res.status(401).json({ error: "bad-credentials" });
  }

  return res.status(400).json({ error: "unknown-action" });
}
