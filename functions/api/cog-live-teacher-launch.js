import { verifyTeacherSession } from "../_shared/teacher-session.js";
import { resolveCogLiveOrigin } from "../_shared/cog-live-origin.js";
import { signCogLiveToken } from "../_shared/cog-live-token.js";

const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const LAUNCH_TTL_MS = 5 * 60 * 1000;

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function bearer(request) {
  const value = String(request.headers.get("Authorization") || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeStringArray(raw) {
  const values = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" ? Object.values(raw) : []);
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export async function onRequestPost({ request, env }) {
  try {
    const signedTeacherSession = bearer(request);
    if (!signedTeacherSession) {
      return json(401, { ok: false, error: "Sign in again before opening Classroom Online Games." });
    }

    const teacher = await verifyTeacherSession(
      signedTeacherSession,
      env.YOUTEACH_SESSION_SECRET
    );
    if (!teacher) {
      return json(401, { ok: false, error: "Your teacher session expired. Sign in again." });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {}
    const assignmentId = String(body.assignmentId || "").trim();
    if (!assignmentId) {
      return json(400, { ok: false, error: "Choose or create a Classroom Online Games assignment first." });
    }

    const [currentSession, assignment] = await Promise.all([
      firebaseGet("session/current"),
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`)
    ]);

    const groupName = String(currentSession?.groupName || "").trim();
    const youTeachSessionId = String(
      currentSession?.sessionId || currentSession?.createdAt || ""
    ).trim();

    if (!currentSession?.active || !groupName || !youTeachSessionId) {
      return json(409, {
        ok: false,
        error: "Create or activate a Buzzer session with a group before opening Classroom Online Games."
      });
    }

    const assignmentGroup = String(assignment?.groupName || "").trim();
    const assignmentTypeCode = String(assignment?.assignmentTypeCode || "").trim().toUpperCase();
    if (
      !assignment ||
      assignment?.active === false ||
      assignmentTypeCode !== "COG" ||
      !assignmentGroup ||
      assignmentGroup === "ALL" ||
      assignmentGroup !== groupName
    ) {
      return json(409, {
        ok: false,
        error: "The selected activity must be an active COG assignment for the current Buzzer group."
      });
    }

    const recipientStudentKeys = normalizeStringArray(assignment.recipientStudentKeys);
    const recipientTeamLabels = normalizeStringArray(assignment.recipientTeamLabels);
    const recipientTeamTarget = String(assignment.recipientTeamTarget || "").trim();

    const now = Date.now();
    const expiresAt = Math.min(now + LAUNCH_TTL_MS, Number(teacher.expiresAt || 0));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return json(401, { ok: false, error: "Your teacher session expired. Sign in again." });
    }

    const token = await signCogLiveToken(
      {
        purpose: "cog-live-teacher",
        teacherUsername: teacher.username,
        teacherRole: teacher.role,
        teacherDisplayName: teacher.displayName,
        teacherSessionExpiresAt: Number(teacher.expiresAt || 0),
        youTeachSessionId,
        groupName,
        assignmentId,
        assignmentCode: String(assignment.code || "").trim(),
        assignmentTitle: String(assignment.title || "Classroom Online Games").trim(),
        recipientStudentKeys,
        recipientTeamLabels,
        recipientTeamTarget,
        iat: now,
        exp: expiresAt,
        nonce: nonce()
      },
      env.YOUTEACH_SESSION_SECRET
    );

    const issuer = new URL(request.url).origin;
    const launchUrl = new URL(`${resolveCogLiveOrigin(env, request.url)}/teacher/`);
    launchUrl.searchParams.set("ytLiveTeacher", token);
    launchUrl.searchParams.set("issuer", issuer);

    return json(200, {
      ok: true,
      launchUrl: launchUrl.toString(),
      assignmentId,
      expiresAt
    });
  } catch (error) {
    console.error("COG live teacher launch failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not create the Classroom Online Games launch."
    });
  }
}
