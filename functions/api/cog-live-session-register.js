import {
  allowedCogOrigin,
  firebaseGet,
  firebasePut,
  json,
  liveGame,
  matchesTeacherBridge,
  optionsResponse,
  verifyTeacherBridge,
  youTeachSessionId
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

    const game = liveGame(body.gameId);
    const cogSessionId = String(body.cogSessionId || "").trim();
    if (!game || !cogSessionId) {
      return json(400, { ok: false, error: "Invalid live game session." }, origin);
    }

    const currentSession = await firebaseGet("session/current");
    if (!matchesTeacherBridge(currentSession, grant)) {
      return json(409, {
        ok: false,
        error: "The YouTeach Buzzer session changed. Reopen Classroom Online Games from Buzzer."
      }, origin);
    }

    const now = Date.now();
    const connectedGame = {
      gameId: game.id,
      gameName: game.name,
      cogSessionId,
      groupName: String(currentSession.groupName || ""),
      assignmentId: String(grant.assignmentId || ""),
      assignmentCode: String(grant.assignmentCode || ""),
      assignmentTitle: String(grant.assignmentTitle || ""),
      recipientStudentKeys: Array.isArray(grant.recipientStudentKeys)
        ? [...new Set(grant.recipientStudentKeys.map((value) => String(value || "").trim()).filter(Boolean))]
        : [],
      recipientTeamLabels: Array.isArray(grant.recipientTeamLabels)
        ? [...new Set(grant.recipientTeamLabels.map((value) => String(value || "").trim()).filter(Boolean))]
        : [],
      recipientTeamTarget: String(grant.recipientTeamTarget || ""),
      status: "active",
      launchMode: "live-buzzer",
      youTeachSessionId: youTeachSessionId(currentSession),
      startedAt: now,
      updatedAt: now,
      teacherPresenceAt: now,
      noPresenceSince: null
    };

    await firebasePut("session/current/connectedGame", connectedGame);

    return json(200, {
      ok: true,
      connectedGame
    }, origin);
  } catch (error) {
    console.error("COG live session registration failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not register the live game session."
    }, origin || "");
  }
}
