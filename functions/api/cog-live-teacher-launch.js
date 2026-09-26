import { signCogLiveToken } from "../_shared/cog-live-token.js";
import {
  cogOriginForRequest,
  firebaseGet,
  isCogAssignmentForSession,
  json,
  liveGame,
  normalizeRecipientKeys,
  youTeachSessionId
} from "../_shared/cog-live-http.js";

const TEACHER_LAUNCH_TTL_MS = 5 * 60 * 1000;

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanAssignmentId(value) {
  const clean = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : "";
}

export async function onRequestPost({ request, env }) {
  try {
    if (!String(env?.YOUTEACH_SESSION_SECRET || "").trim()) {
      return json(503, { ok: false, error: "Live COG signing is not configured." });
    }

    let body = {};
    try { body = await request.json(); } catch {}

    const assignmentId = cleanAssignmentId(body.assignmentId);
    if (!assignmentId) {
      return json(400, { ok: false, error: "A COG assignment is required." });
    }

    const [session, assignment] = await Promise.all([
      firebaseGet("session/current"),
      firebaseGet(`assignments/${assignmentId}`)
    ]);

    if (!session?.active || !youTeachSessionId(session)) {
      return json(409, { ok: false, error: "Start a Buzzer session before opening Classroom Online Games." });
    }
    if (!isCogAssignmentForSession(assignment, session)) {
      return json(409, { ok: false, error: "That assignment is not an active COG activity for the current Buzzer session." });
    }

    const requestedGame = liveGame(assignment.cogGameId);
    const now = Date.now();
    const groupName = String(session.groupName || "").trim();
    const recipientStudentKeys = normalizeRecipientKeys(assignment.recipientStudentKeys);
    const grant = {
      purpose: "cog-live-teacher",
      youTeachSessionId: youTeachSessionId(session),
      groupName,
      assignmentId,
      assignmentCode: String(assignment.code || "").trim(),
      assignmentTitle: String(assignment.title || "Classroom Online Games").trim(),
      recipientMode: String(assignment.recipientMode || "").trim(),
      recipientStudentKeys,
      gameId: String(requestedGame?.id || ""),
      iat: now,
      exp: now + TEACHER_LAUNCH_TTL_MS,
      nonce: nonce()
    };

    const token = await signCogLiveToken(grant, env.YOUTEACH_SESSION_SECRET);
    const issuer = new URL(request.url).origin;
    const teacherPath = String(requestedGame?.teacherPath || "/teacher/");
    const target = new URL(teacherPath, cogOriginForRequest(request));
    target.searchParams.set("ytLiveTeacher", token);
    target.searchParams.set("issuer", issuer);

    return json(200, {
      ok: true,
      launchUrl: target.toString(),
      expiresAt: grant.exp,
      groupName,
      assignmentId
    });
  } catch (error) {
    console.error("COG teacher launch failed:", error?.message || error);
    return json(500, { ok: false, error: "Could not create the Classroom Online Games launch." });
  }
}
