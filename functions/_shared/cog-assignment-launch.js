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
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
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

export async function signCogAssignmentLaunch(payload, secret) {
  const key = await importHmacKey(secret);
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`cog1.${body}`));
  return `cog1.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyCogAssignmentLaunch(token, secret, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "cog1") return null;

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
    encoder.encode(`cog1.${parts[1]}`)
  );
  if (!valid) return null;

  const expiresAt = Number(payload?.exp || 0);
  if (
    !String(payload?.studentKey || "").trim() ||
    !String(payload?.assignmentId || "").trim() ||
    payload?.purpose !== "assignment-practice" ||
    payload?.officialSubmissionAllowed !== false ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return null;
  }

  return payload;
}
