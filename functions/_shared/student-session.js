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

function encodeJson(value) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value) {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function importHmacKey(secret) {
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

export async function signStudentSession(payload, secret) {
  const key = await importHmacKey(secret);
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`v1.${body}`));
  return `v1.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyStudentSession(token, secret, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;

  let payload;
  let signature;
  try {
    payload = decodeJson(parts[1]);
    signature = base64UrlToBytes(parts[2]);
  } catch (_) {
    return null;
  }

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`v1.${parts[1]}`)
  );
  if (!valid) return null;

  const studentKey = String(payload?.studentKey || "").trim();
  const externalId = String(payload?.externalId || "").trim();
  const expiresAt = Number(payload?.exp || 0);
  if (!studentKey || !externalId || !Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return {
    studentKey,
    externalId,
    issuedAt: Number(payload?.iat || 0),
    expiresAt,
    nonce: String(payload?.nonce || "")
  };
}
