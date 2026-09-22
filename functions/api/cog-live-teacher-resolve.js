import { signCogLiveToken, verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  corsJson,
  firebaseGet,
  isCogAssignmentForSession,
  normalizeRecipientKeys,
  optionsResponse,
  youTeachSessionId
} from "../_shared/cog-live-http.js";

const BRIDGE_TTL_MS = 12 * 60 * 60 * 1000;

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function onRequestOptions({ request }) {
  return optionsResponse(request);
}

export async function onRequestPost({ request, env }) {
  try {
    if (allowedCogOrigin(request) === null) {
      return corsJson(request, 403, { ok: false, error: "Origin is not allowed." });
    }

    let body = {};
    try { body = await request.json(); } catch {}
    const launch = await verifyCogLiveToken(
      String(body.token || ""),
      env?.YOUTEACH_SESSION_SECRET,
      Date.now(),
      "cog-live-teacher"
    );
    if (!launch) {
      return corsJson(request, 401, { ok: false, error: "The YouTeach teacher launch is invalid or expired." });
    }

    const assignmentId = String(launch.assignmentId || "").trim();
    const [session, assignment] = await Promise.all([
      firebaseGet("session/current"),
      firebaseGet(`assignments/${assignmentId}`)
    ]);

    if (!isCogAssignmentForSession(assignment, session)) {
      return corsJson(request, 409, { ok: false, error: "The COG assignment is no longer active for this Buzzer session." });
    }
    if (
      youTeachSessionId(session) !== String(launch.youTeachSessionId || "") ||
      String(session.groupName || "").trim() !== String(launch.groupName || "").trim()
    ) {
      return corsJson(request, 409, { ok: false, error: "The Buzzer session changed. Reopen Classroom Online Games from YouTeach." });
    }

    const now = Date.now();
    const recipientStudentKeys = normalizeRecipientKeys(assignment.recipientStudentKeys);
    const bridgePayload = {
      purpose: "cog-live-teacher-session",
      youTeachSessionId: youTeachSessionId(session),
      groupName: String(session.groupName || "").trim(),
      assignmentId,
      assignmentCode: String(assignment.code || launch.assignmentCode || "").trim(),
      assignmentTitle: String(assignment.title || launch.assignmentTitle || "Classroom Online Games").trim(),
      recipientStudentKeys,
      iat: now,
      exp: now + BRIDGE_TTL_MS,
      nonce: nonce()
    };
    const bridgeToken = await signCogLiveToken(bridgePayload, env.YOUTEACH_SESSION_SECRET);

    return corsJson(request, 200, {
      ok: true,
      teacher: {
        username: "firebase-teacher",
        role: "teacher",
        displayName: String(assignment.createdBy || "Teacher").trim() || "Teacher"
      },
      liveContext: {
        youTeachSessionId: bridgePayload.youTeachSessionId,
        groupName: bridgePayload.groupName,
        assignmentId,
        assignmentCode: bridgePayload.assignmentCode,
        assignmentTitle: bridgePayload.assignmentTitle,
        launchMode: "live-buzzer"
      },
      bridgeToken,
      bridgeExpiresAt: bridgePayload.exp
    });
  } catch (error) {
    console.error("COG teacher resolve failed:", error?.message || error);
    return corsJson(request, 500, { ok: false, error: "Could not verify the YouTeach teacher launch." });
  }
}
