// Shared auth + storage helpers for the API functions.
import crypto from "node:crypto";
import { put, get } from "@vercel/blob";

const COOKIE = "fp_session";
export const STATE_PATH = "portal-state.json";
export const AUTH_PATH = "portal-auth.json";

/* ---------- session tokens (HMAC-signed, httpOnly cookie) ---------- */
export function secretKey() {
  // Prefer an explicit SESSION_SECRET; otherwise derive one from the Blob token
  // (already a server-only secret). Rotating either invalidates sessions.
  const src = process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN;
  if (!src) return null;
  return crypto.createHash("sha256").update("fund-portal-session:" + src).digest();
}
export function sign(payload) {
  const key = secretKey();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", key).update(body).digest("base64url");
  return body + "." + mac;
}
export function verify(token) {
  try {
    const key = secretKey();
    if (!key || !token) return null;
    const [body, mac] = String(token).split(".");
    if (!body || !mac) return null;
    const expect = crypto.createHmac("sha256", key).update(body).digest("base64url");
    const a = Buffer.from(mac), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p || !p.exp || Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}
export function readSession(req) {
  const raw = (req.headers && req.headers.cookie) || "";
  const hit = raw.split(/;\s*/).find(x => x.startsWith(COOKIE + "="));
  return hit ? verify(decodeURIComponent(hit.slice(COOKIE.length + 1))) : null;
}
export function sessionCookie(token, maxAgeSec) {
  return COOKIE + "=" + encodeURIComponent(token) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAgeSec;
}
export function clearCookie() {
  return COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

/* ---------- passwords (scrypt, per-user salt) ---------- */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return "s2$" + salt.toString("base64url") + "$" + h.toString("base64url");
}
export function verifyPassword(pw, stored) {
  try {
    const [v, saltB, hashB] = String(stored).split("$");
    if (v !== "s2") return false;
    const salt = Buffer.from(saltB, "base64url");
    const expect = Buffer.from(hashB, "base64url");
    const got = crypto.scryptSync(String(pw), salt, expect.length);
    return got.length === expect.length && crypto.timingSafeEqual(got, expect);
  } catch (e) { return false; }
}
export function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  const max = Math.max(A.length, B.length, 1);
  const pa = Buffer.alloc(max), pb = Buffer.alloc(max);
  A.copy(pa); B.copy(pb);
  const same = crypto.timingSafeEqual(pa, pb);
  return same && A.length === B.length;
}

/* ---------- request body (Vercel parses POST json; PUT/streams vary) ---------- */
export async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return null; } }
    return req.body;
  }
  try {
    const chunks = [];
    for await (const ch of req) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* ---------- blob-backed JSON documents ----------
   Vercel Blob stores can be PRIVATE (blobs need auth to read — recommended
   for fund data) or PUBLIC (readable by URL). We detect which one this store
   is on first use and remember it for the warm instance. */
let storeAccess = null; // "private" | "public" once detected

function accessOrder() {
  if (storeAccess === "public") return ["public", "private"];
  return ["private", "public"]; // private first: newer stores default to it
}
const isAccessError = (e) => /private store|public store|access/i.test(String(e && e.message || e));

export async function readBlobJSON(pathname) {
  let lastErr = null;
  for (const access of accessOrder()) {
    try {
      // useCache:false bypasses the CDN — reads are always the latest write
      const r = await get(pathname, { access, useCache: false });
      storeAccess = access;
      if (!r || !r.stream) return null; // blob doesn't exist yet
      return await new Response(r.stream).json();
    } catch (e) { lastErr = e; if (!isAccessError(e)) break; }
  }
  throw new Error(String(lastErr && lastErr.message || lastErr));
}

export async function writeBlobJSON(pathname, obj) {
  const data = JSON.stringify(obj);
  let lastErr = null;
  for (const access of accessOrder()) {
    const base = { access, addRandomSuffix: false, contentType: "application/json", allowOverwrite: true };
    for (const opts of [{ ...base, cacheControlMaxAge: 60 }, base]) {
      try {
        await put(pathname, data, opts);
        storeAccess = access;
        return;
      } catch (e) {
        lastErr = e;
        if (isAccessError(e)) break; // wrong access mode — try the other one
      }
    }
  }
  throw new Error(String(lastErr && lastErr.message || lastErr));
}
