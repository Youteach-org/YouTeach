import { verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  bearer,
  firebaseGet,
  firebasePatch,
  json,
  optionsResponse,
  youTeachSessionId
} from "../_shared/cog-live-http.js";
import {
  canStudentAccessLiveGame,
  livePresenceState
} from "../../cog-live-session-policy.mjs";

export function onRequestOptions({ request }) {
  return optionsResponse(request);
}

async function verifyBridgeGrant(request, env) {
  const token = bearer(request);
  if (!token) return null;

  const teacher = await verifyCogLiveToken(
    token,
    env.YOUTEACH_SESSION_SECRET,
    Date.now(),
    "cog-live-teacher-session"
  );
  if (teacher) return { role: "teacher", grant: teacher };

  const student = await verifyCogLiveToken(
    token,
    env.YOUTEACH_SESSION_SECRET,
    Date.now(),
    "cog-live-student-session"
  );
  if (student) return { role: "student", grant: student };

  return null;
}

export async function onRequestPost({ request, env }) {
  const origin = allowedCogOrigin(request);
  if (origin === null) {
    return json(403, {
      ok: false,
      error: "This endpoint is only available to Classroom Online Games."
    });
  }

  try {
    const verified = await verifyBridgeGrant(request, env);
    if (!verified) {
      return json(401, { ok: false, error: "Invalid or expired live session credential." }, origin);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {}

    const currentSession = await firebaseGet("session/current");
    const connectedGame = currentSession?.connectedGame || null;
    const canonicalSessionId = youTeachSessionId(currentSession);
    const canonicalGroup = String(currentSession?.groupName || "").trim();
    const requestedCogSessionId = String(body.cogSessionId || verified.grant.cogSessionId || "").trim();

    if (
      !currentSession?.active ||
      !connectedGame ||
      connectedGame.status !== "active" ||
      !canonicalSessionId ||
      canonicalSessionId !== String(verified.grant.youTeachSessionId || "") ||
      canonicalGroup !== String(verified.grant.groupName || "") ||
      String(connectedGame.cogSessionId || "") !== requestedCogSessionId
    ) {
      return json(409, {
        ok: false,
        error: "The live activity no longer matches this YouTeach session."
      }, origin);
    }

    const assignmentId = String(connectedGame.assignmentId || "").trim();
    if (
      assignmentId &&
      assignmentId !== String(verified.grant.assignmentId || "").trim()
    ) {
      return json(409, { ok: false, error: "The live assignment changed." }, origin);
    }

    const now = Date.now();
    const presence = livePresenceState({ connectedGame, now });
    if (presence.expired) {
      await firebasePatch("session/current/connectedGame", {
        status: "expired",
        expiredAt: now,
        updatedAt: now,
        noPresenceSince: presence.noPresenceSince
      });
      return json(410, {
        ok: false,
        error: "This live activity expired after 60 minutes with no teacher or students present.",
        status: "expired"
      }, origin);
    }

    if (verified.role === "student") {
      const studentKey = String(verified.grant.studentKey || "").trim();
      if (
        !studentKey ||
        String(verified.grant.gameId || "") !== String(connectedGame.gameId || "") ||
        String(verified.grant.cogSessionId || "") !== String(connectedGame.cogSessionId || "") ||
        !canStudentAccessLiveGame({
          connectedGame,
          studentGroup: canonicalGroup,
          studentKey,
          now
        })
      ) {
        return json(403, { ok: false, error: "You are not eligible for this live activity." }, origin);
      }

      await firebasePatch("session/current/connectedGame", {
        [`studentPresence/${studentKey}`]: now,
        noPresenceSince: null,
        updatedAt: now
      });
    } else {
      await firebasePatch("session/current/connectedGame", {
        teacherPresenceAt: now,
        noPresenceSince: null,
        updatedAt: now
      });
    }

    return json(200, {
      ok: true,
      status: "active",
      role: verified.role,
      cogSessionId: requestedCogSessionId,
      heartbeatAt: now
    }, origin);
  } catch (error) {
    console.error("COG live heartbeat failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not update live activity presence."
    }, origin || "");
  }
}
