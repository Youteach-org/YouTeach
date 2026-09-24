const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret) {
  const clean = String(secret || "").trim();
  if (clean.length < 32) {
    throw new Error("YOUTEACH_SESSION_SECRET must be configured with at least 32 characters.");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(clean),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signCogLiveToken(payload, secret) {
  const purpose = String(payload?.purpose || "").trim();
  const exp = Number(payload?.exp || 0);
  if (!purpose) throw new TypeError("COG live token purpose is required.");
  if (!Number.isFinite(exp) || exp <= 0) throw new TypeError("COG live token expiry is required.");

  const body = bytesToBase64Url(encoder.encode(JSON.stringify({ ...payload, purpose })));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`coglive1.${body}`));
  return `coglive1.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyCogLiveToken(token, secret, now = Date.now(), expectedPurpose = "") {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "coglive1") return null;

  let payload;
  let signature;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return null;
  }

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`coglive1.${parts[1]}`)
  );
  if (!valid) return null;

  const exp = Number(payload?.exp || 0);
  const purpose = String(payload?.purpose || "");
  if (!purpose || !Number.isFinite(exp) || exp <= Number(now)) return null;
  if (expectedPurpose && purpose !== expectedPurpose) return null;
  return payload;
}
