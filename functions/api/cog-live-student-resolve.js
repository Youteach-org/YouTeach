import { signCogLiveToken, verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  firebaseGet,
  json,
  optionsResponse,
  youTeachSessionId
} from "../_shared/cog-live-http.js";
import { canStudentAccessLiveGame } from "../../cog-live-session-policy.mjs";

const BRIDGE_TTL_MS = 12 * 60 * 60 * 1000;

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function externalIdFor(student) {
  return String(student?.studentNumber || student?.id || "").trim();
}

function identityFor(studentKey, student) {
  const fullName = String(student?.fullName || student?.name || "").trim();
  const nickname = String(
    student?.nickname || (fullName ? fullName.split(/\s+/)[0] : "Student")
  ).trim();

  return {
    studentKey: String(studentKey || ""),
    nickname: nickname || "Student",
    fullName,
    groupName: String(student?.groupName || "GENERAL").trim(),
    studentNumber: externalIdFor(student)
  };
}

export function onRequestOptions({ request }) {
  return optionsResponse(request);
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
    let body = {};
    try {
      body = await request.json();
    } catch {}

    const token = String(body.token || "").trim();
    if (!token) {
      return json(400, { ok: false, error: "Missing student launch credential." }, origin);
    }

    const launch = await verifyCogLiveToken(
      token,
      env.YOUTEACH_SESSION_SECRET,
      Date.now(),
      "cog-live-student"
    );
    if (!launch) {
      return json(401, { ok: false, error: "Invalid or expired student launch." }, origin);
    }

    const [student, currentSession] = await Promise.all([
      firebaseGet(`students/${encodeURIComponent(String(launch.studentKey || ""))}`),
      firebaseGet("session/current")
    ]);

    if (!student) {
      return json(401, { ok: false, error: "Student account is no longer available." }, origin);
    }

    const canonicalExternalId = externalIdFor(student);
    const studentGroup = String(student.groupName || "GENERAL").trim();
    const canonicalSessionId = youTeachSessionId(currentSession);
    const connectedGame = currentSession?.connectedGame || null;

    if (
      !canonicalExternalId ||
      canonicalExternalId !== String(launch.externalId || "") ||
      studentGroup !== String(launch.groupName || "")
    ) {
      return json(401, {
        ok: false,
        error: "Student identity changed. Reopen the activity from YouTeach."
      }, origin);
    }

    if (
      !currentSession?.active ||
      !canonicalSessionId ||
      canonicalSessionId !== String(launch.youTeachSessionId || "") ||
      String(currentSession.groupName || "").trim() !== studentGroup ||
      !connectedGame
    ) {
      return json(409, {
        ok: false,
        error: "The YouTeach Buzzer session changed. Reopen the activity from Student Buzzer."
      }, origin);
    }

    if (
      !canStudentAccessLiveGame({
        connectedGame,
        studentGroup,
        studentKey: String(launch.studentKey || ""),
        now: Date.now()
      }) ||
      String(connectedGame.gameId || "") !== String(launch.gameId || "") ||
      String(connectedGame.cogSessionId || "") !== String(launch.cogSessionId || "")
    ) {
      return json(409, {
        ok: false,
        error: "This live activity is no longer active."
      }, origin);
    }

    const now = Date.now();
    const expiresAt = Math.min(
      now + BRIDGE_TTL_MS,
      Number(launch.studentSessionExpiresAt || 0)
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return json(401, {
        ok: false,
        error: "Your YouTeach student session expired. Sign in again."
      }, origin);
    }

    const bridgeToken = await signCogLiveToken({
      purpose: "cog-live-student-session",
      studentKey: String(launch.studentKey || ""),
      externalId: canonicalExternalId,
      groupName: studentGroup,
      youTeachSessionId: canonicalSessionId,
      gameId: String(connectedGame.gameId || ""),
      gameName: String(connectedGame.gameName || launch.gameName || ""),
      cogSessionId: String(connectedGame.cogSessionId || ""),
      assignmentId: String(connectedGame.assignmentId || launch.assignmentId || ""),
      iat: now,
      exp: expiresAt,
      nonce: nonce()
    }, env.YOUTEACH_SESSION_SECRET);

    return json(200, {
      ok: true,
      identity: identityFor(launch.studentKey, student),
      liveContext: {
        youTeachSessionId: canonicalSessionId,
        groupName: studentGroup,
        gameId: String(connectedGame.gameId || ""),
        gameName: String(connectedGame.gameName || launch.gameName || ""),
        cogSessionId: String(connectedGame.cogSessionId || ""),
        assignmentId: String(connectedGame.assignmentId || launch.assignmentId || ""),
        launchMode: "live-buzzer"
      },
      bridgeToken,
      bridgeExpiresAt: expiresAt
    }, origin);
  } catch (error) {
    console.error("COG live student resolve failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not resolve the live student launch."
    }, origin || "");
  }
}
