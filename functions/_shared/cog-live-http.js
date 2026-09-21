import { verifyCogLiveToken } from "./cog-live-token.js";

export const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";

export const LIVE_COG_GAMES = Object.freeze({
  "verb-runner": Object.freeze({
    id: "verb-runner",
    name: "Verb Runner",
    studentPath: "/Verb-Runner/"
  }),
  "support-meter": Object.freeze({
    id: "support-meter",
    name: "Support Meter",
    studentPath: "/Support-Meter/"
  }),
  "100-students-said": Object.freeze({
    id: "100-students-said",
    name: "100 Students Said",
    studentPath: null,
    studentSurface: "buzzer"
  }),
  "osascomp": Object.freeze({
    id: "osascomp",
    name: "OSASCOMP",
    studentPath: "/OSASCOMP/"
  })
});

export function allowedCogOrigin(request) {
  const raw = String(request.headers.get("Origin") || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      (
        host === "utichgion.org" ||
        host === "classroom-online-games.pages.dev" ||
        host.endsWith(".classroom-online-games.pages.dev")
      )
    ) {
      return url.origin;
    }
  } catch {}
  return null;
}

export function corsHeaders(origin = "") {
  return {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {})
  };
}

export function json(status, payload, origin = "") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(origin)
  });
}

export function optionsResponse(request) {
  const origin = allowedCogOrigin(request);
  if (origin === null) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    }
  });
}

export function bearer(request) {
  const value = String(request.headers.get("Authorization") || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

export async function firebasePut(path, value) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error(`Firebase write failed: ${response.status}`);
}

export async function firebasePatch(path, value) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value || {})
  });
  if (!response.ok) throw new Error(`Firebase patch failed: ${response.status}`);
}

export function youTeachSessionId(session) {
  return String(session?.sessionId || session?.createdAt || "").trim();
}

export function liveGame(gameId) {
  return LIVE_COG_GAMES[String(gameId || "").trim()] || null;
}

export async function verifyTeacherBridge(request, env) {
  const token = bearer(request);
  if (!token) return null;
  return verifyCogLiveToken(
    token,
    env.YOUTEACH_SESSION_SECRET,
    Date.now(),
    "cog-live-teacher-session"
  );
}

export function matchesTeacherBridge(session, grant) {
  return Boolean(
    session?.active &&
    youTeachSessionId(session) &&
    youTeachSessionId(session) === String(grant?.youTeachSessionId || "") &&
    String(session?.groupName || "").trim() === String(grant?.groupName || "").trim()
  );
}
