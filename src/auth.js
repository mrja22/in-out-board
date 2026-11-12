export var jwksCache = { domain: null, keys: null, fetchedAt: 0 };
export function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
export async function signingKeys(domain) {
  const fresh = Date.now() - jwksCache.fetchedAt < 60 * 60 * 1e3;
  if (jwksCache.domain === domain && jwksCache.keys && fresh) return jwksCache.keys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { domain, keys, fetchedAt: Date.now() };
  return keys;
}
export async function verifyAccessJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== "RS256") return null;
  let jwk = (await signingKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) {
    jwksCache.fetchedAt = 0;
    jwk = (await signingKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) return null;
  const now = Date.now() / 1e3;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;
  if (!payload.email) return null;
  return String(payload.email).toLowerCase();
}
export function cookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
export async function getIdentity(request, env) {
  if (env.DEV_MODE === "1") {
    const email = request.headers.get("x-dev-user") || env.DEV_USER_EMAIL;
    return email ? { email: email.toLowerCase() } : null;
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || cookie(request, "CF_Authorization");
  if (!token) return null;
  try {
    const email = await verifyAccessJwt(token, env);
    return email ? { email } : null;
  } catch (err) {
    console.error("Access JWT verification error", err);
    return null;
  }
}
export function isAdmin(identity, env) {
  if (!identity) return false;
  const admins = String(env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(identity.email);
}
