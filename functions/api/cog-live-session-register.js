import { verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  bearer,
  corsJson,
  firebaseGet,
  firebasePut,
  isCogAssignmentForSession,
  liveGame,
  normalizeRecipientKeys,
  optionsResponse,
  youTeachSessionId
} from "../_shared/cog-live-http.js";

function cleanSessionId(value) {
  const clean = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(clean) ? clean : "";
}

export function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
  try {
    if (allowedCogOrigin(request) === null) {
      return corsJson(request, 403, { ok: false, error: "Origin is not allowed." });
    }

    const bridge = await verifyCogLiveToken(
      bearer(request),
      env?.YOUTEACH_SESSION_SECRET,
      Date.now(),
      "cog-live-teacher-session"
    );
    if (!bridge) {
      return corsJson(request, 401, { ok: false, error: "The YouTeach teacher bridge is invalid or expired." });
    }

    let body = {};
    try { body = await request.json(); } catch {}
    const game = liveGame(body.gameId);
    const cogSessionId = cleanSessionId(body.cogSessionId);
    if (!game || !cogSessionId) {
      return corsJson(request, 400, { ok: false, error: "A supported game and live session id are required." });
    }

    const assignmentId = String(bridge.assignmentId || "").trim();
    const [session, assignment] = await Promise.all([
      firebaseGet("session/current"),
      firebaseGet(`assignments/${assignmentId}`)
    ]);

    if (!isCogAssignmentForSession(assignment, session)) {
      return corsJson(request, 409, { ok: false, error: "The COG assignment is no longer active." });
    }
    if (
      youTeachSessionId(session) !== String(bridge.youTeachSessionId || "") ||
      String(session.groupName || "").trim() !== String(bridge.groupName || "").trim()
    ) {
      return corsJson(request, 409, { ok: false, error: "The Buzzer session changed." });
    }

    const current = session.connectedGame || null;
    if (
      current?.status === "active" &&
      String(current.cogSessionId || "") &&
      String(current.cogSessionId || "") !== cogSessionId
    ) {
      return corsJson(request, 409, { ok: false, error: "Another COG live activity is already active for this Buzzer session." });
    }

    const now = Date.now();
    const connectedGame = {
      gameId: game.id,
      gameName: game.name,
      cogSessionId,
      assignmentId,
      assignmentCode: String(assignment.code || bridge.assignmentCode || "").trim(),
      assignmentTitle: String(assignment.title || bridge.assignmentTitle || "").trim(),
      groupName: String(session.groupName || "").trim(),
      status: "active",
      launchMode: "live-buzzer",
      youTeachSessionId: youTeachSessionId(session),
      recipientMode: String(assignment.recipientMode || "").trim(),
      recipientStudentKeys: normalizeRecipientKeys(assignment.recipientStudentKeys),
      startedAt: now,
      updatedAt: now,
      teacherPresenceAt: now,
      noPresenceSince: null,
      endedAt: null,
      expiredAt: null
    };

    await firebasePut("session/current/connectedGame", connectedGame);
    return corsJson(request, 200, { ok: true, connectedGame });
  } catch (error) {
    console.error("COG live session registration failed:", error?.message || error);
    return corsJson(request, 500, { ok: false, error: "Could not register the COG live activity." });
  }
}
