import { verifyStudentSession } from "../_shared/student-session.js";
import { verifyTeacherSession } from "../_shared/teacher-session.js";
import { bearer, firebaseGet, firebasePatch, json } from "../_shared/cog-live-http.js";
import { livePresenceState } from "../../cog-live-session-policy.mjs";

async function verifyCaller(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const now = Date.now();

  const teacher = await verifyTeacherSession(
    token,
    env.YOUTEACH_SESSION_SECRET,
    now
  );
  if (teacher) return { role: "teacher", subject: teacher.username };

  const student = await verifyStudentSession(
    token,
    env.YOUTEACH_SESSION_SECRET,
    now
  );
  if (student) return { role: "student", subject: student.studentKey };

  return null;
}

export async function onRequestPost({ request, env }) {
  try {
    const caller = await verifyCaller(request, env);
    if (!caller) {
      return json(401, { ok: false, error: "Authentication required." });
    }

    const currentSession = await firebaseGet("session/current");
    const connectedGame = currentSession?.connectedGame || null;

    if (!currentSession?.active || !connectedGame) {
      return json(200, {
        ok: true,
        expired: false,
        status: "none"
      });
    }

    if (connectedGame.status !== "active") {
      return json(200, {
        ok: true,
        expired: connectedGame.status === "expired",
        status: String(connectedGame.status || "inactive")
      });
    }

    const now = Date.now();
    const state = livePresenceState({ connectedGame, now });

    if (state.expired) {
      await firebasePatch("session/current/connectedGame", {
        status: "expired",
        expiredAt: now,
        updatedAt: now,
        noPresenceSince: state.noPresenceSince
      });

      return json(200, {
        ok: true,
        expired: true,
        status: "expired",
        expiredAt: now
      });
    }

    if (
      !state.hasPresence &&
      state.noPresenceSince != null &&
      Number(connectedGame.noPresenceSince || 0) !== Number(state.noPresenceSince)
    ) {
      await firebasePatch("session/current/connectedGame", {
        noPresenceSince: state.noPresenceSince,
        updatedAt: now
      });
    }

    return json(200, {
      ok: true,
      expired: false,
      status: "active",
      noPresenceSince: state.noPresenceSince
    });
  } catch (error) {
    console.error("COG live expiry evaluation failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not evaluate live activity expiry."
    });
  }
}
