import { verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  bearer,
  corsJson,
  firebaseGet,
  firebasePatch,
  optionsResponse,
  youTeachSessionId
} from "../_shared/cog-live-http.js";

export function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
  if (allowedCogOrigin(request) === null) {
    return corsJson(request, 403, { ok: false, error: "Origin is not allowed." });
  }

  try {
    const grant = await verifyCogLiveToken(
      bearer(request),
      env?.YOUTEACH_SESSION_SECRET,
      Date.now(),
      "cog-live-teacher-session"
    );
    if (!grant) {
      return corsJson(request, 401, {
        ok: false,
        error: "Invalid or expired YouTeach teacher bridge."
      });
    }

    let body = {};
    try { body = await request.json(); } catch {}
    const cogSessionId = String(body.cogSessionId || "").trim();
    if (!cogSessionId) {
      return corsJson(request, 400, {
        ok: false,
        error: "Missing live game session."
      });
    }

    const currentSession = await firebaseGet("session/current");
    if (
      !currentSession?.active ||
      youTeachSessionId(currentSession) !== String(grant.youTeachSessionId || "") ||
      String(currentSession.groupName || "").trim() !== String(grant.groupName || "").trim()
    ) {
      return corsJson(request, 409, {
        ok: false,
        error: "The YouTeach Buzzer session changed."
      });
    }

    const connectedGame = currentSession.connectedGame || null;
    if (
      !connectedGame ||
      connectedGame.status !== "active" ||
      String(connectedGame.cogSessionId || "") !== cogSessionId ||
      String(connectedGame.assignmentId || "") !== String(grant.assignmentId || "")
    ) {
      return corsJson(request, 409, {
        ok: false,
        error: "That live activity is no longer active."
      });
    }

    const now = Date.now();
    await firebasePatch("session/current/connectedGame", {
      status: "ended",
      endedAt: now,
      updatedAt: now,
      noPresenceSince: connectedGame.noPresenceSince ?? null
    });

    return corsJson(request, 200, {
      ok: true,
      cogSessionId,
      status: "ended",
      endedAt: now
    });
  } catch (error) {
    console.error("COG live session end failed:", error?.message || error);
    return corsJson(request, 500, {
      ok: false,
      error: error?.message || "Could not end the live game session."
    });
  }
}
