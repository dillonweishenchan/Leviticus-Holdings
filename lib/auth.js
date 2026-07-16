// Shared auth + storage helpers for the API functions.
import crypto from "node:crypto";
import { put, list } from "@vercel/blob";

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

/* ---------- blob-backed JSON documents ---------- */
export async function readBlobJSON(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  if (!blobs.length) return null;
  // ?ts= busts the blob CDN cache so reads are always fresh
  const r = await fetch(blobs[0].url + "?ts=" + Date.now(), { cache: "no-store" });
  if (!r.ok) return null;
  return await r.json();
}
export async function writeBlobJSON(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
}
