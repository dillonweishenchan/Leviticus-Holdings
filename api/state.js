// Shared portfolio state, stored in Vercel Blob so changes sync across devices.
// Requires a Blob store connected to the project (env var BLOB_READ_WRITE_TOKEN).
import { put, list } from "@vercel/blob";

const PATHNAME = "portal-state.json";

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(501).json({ error: "storage-not-configured" });
  }

  try {
    if (req.method === "GET") {
      const { blobs } = await list({ prefix: PATHNAME, limit: 1 });
      if (!blobs.length) return res.status(200).json({ state: null });
      // ?ts= busts the blob CDN cache so reads are always fresh
      const r = await fetch(blobs[0].url + "?ts=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return res.status(200).json({ state: null });
      const state = await r.json();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ state });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = req.body;
      if (!body || typeof body !== "object" || !Array.isArray(body.holdings) || !Array.isArray(body.clients)) {
        return res.status(400).json({ error: "bad-body" });
      }
      await put(PATHNAME, JSON.stringify(body), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      });
      return res.status(200).json({ ok: true, at: Date.now() });
    }

    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(500).json({ error: "storage-error", detail: String(e && e.message || e) });
  }
}
