import {
  allowedCogOrigin,
  firebaseGet,
  firebasePatch,
  json,
  matchesTeacherBridge,
  optionsResponse,
  verifyTeacherBridge
} from "../_shared/cog-live-http.js";

export function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
  const origin = allowedCogOrigin(request);
  if (origin === null) {
    return json(403, { ok: false, error: "This endpoint is only available to Classroom Online Games." });
  }

  try {
    const grant = await verifyTeacherBridge(request, env);
    if (!grant) {
      return json(401, { ok: false, error: "Invalid or expired YouTeach teacher bridge." }, origin);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {}
    const cogSessionId = String(body.cogSessionId || "").trim();
    if (!cogSessionId) {
      return json(400, { ok: false, error: "Missing live game session." }, origin);
    }

    const currentSession = await firebaseGet("session/current");
    if (!matchesTeacherBridge(currentSession, grant)) {
      return json(409, {
        ok: false,
        error: "The YouTeach Buzzer session changed. Reopen Classroom Online Games from Buzzer."
      }, origin);
    }

    const connectedGame = currentSession?.connectedGame || null;
    if (
      !connectedGame ||
      connectedGame.status !== "active" ||
      String(connectedGame.cogSessionId || "") !== cogSessionId
    ) {
      return json(409, { ok: false, error: "That live activity is no longer active." }, origin);
    }

    const now = Date.now();
    await firebasePatch("session/current/connectedGame", {
      status: "ended",
      endedAt: now,
      updatedAt: now,
      noPresenceSince: connectedGame.noPresenceSince ?? null
    });

    return json(200, {
      ok: true,
      cogSessionId,
      status: "ended",
      endedAt: now
    }, origin);
  } catch (error) {
    console.error("COG live session end failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not end the live game session."
    }, origin || "");
  }
}
