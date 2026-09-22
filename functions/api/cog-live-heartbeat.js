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
  const now = Date.now();

  const teacher = await verifyCogLiveToken(
    token,
    env?.YOUTEACH_SESSION_SECRET,
    now,
    "cog-live-teacher-session"
  );
  if (teacher) return { role: "teacher", grant: teacher };

  const student = await verifyCogLiveToken(
    token,
    env?.YOUTEACH_SESSION_SECRET,
    now,
    "cog-live-student-session"
  );
  if (student) return { role: "student", grant: student };

  return null;
}

export async function onRequestPost({ request, env }) {
  if (allowedCogOrigin(request) === null) {
    return corsJson(request, 403, { ok: false, error: "Origin is not allowed." });
  }

  try {
    const verified = await verifyBridgeGrant(request, env);
    if (!verified) {
      return corsJson(request, 401, {
        ok: false,
        error: "Invalid or expired live session credential."
      });
    }

    let body = {};
    try { body = await request.json(); } catch {}

    const currentSession = await firebaseGet("session/current");
    const connectedGame = currentSession?.connectedGame || null;
    const canonicalSessionId = youTeachSessionId(currentSession);
    const canonicalGroup = String(currentSession?.groupName || "").trim();
    const requestedCogSessionId = String(
      body.cogSessionId || verified.grant.cogSessionId || ""
    ).trim();

    if (
      !currentSession?.active ||
      !connectedGame ||
      connectedGame.status !== "active" ||
      !canonicalSessionId ||
      canonicalSessionId !== String(verified.grant.youTeachSessionId || "") ||
      canonicalGroup !== String(verified.grant.groupName || "") ||
      String(connectedGame.cogSessionId || "") !== requestedCogSessionId
    ) {
      return corsJson(request, 409, {
        ok: false,
        error: "The live activity no longer matches this YouTeach session."
      });
    }

    const assignmentId = String(connectedGame.assignmentId || "").trim();
    if (
      assignmentId &&
      assignmentId !== String(verified.grant.assignmentId || "").trim()
    ) {
      return corsJson(request, 409, {
        ok: false,
        error: "The live assignment changed."
      });
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
      return corsJson(request, 410, {
        ok: false,
        error: "This live activity expired after 60 minutes with no teacher or students present.",
        status: "expired"
      });
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
        return corsJson(request, 403, {
          ok: false,
          error: "You are not eligible for this live activity."
        });
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

    return corsJson(request, 200, {
      ok: true,
      status: "active",
      role: verified.role,
      cogSessionId: requestedCogSessionId,
      heartbeatAt: now
    });
  } catch (error) {
    console.error("COG live heartbeat failed:", error?.message || error);
    return corsJson(request, 500, {
      ok: false,
      error: error?.message || "Could not update live activity presence."
    });
  }
}
