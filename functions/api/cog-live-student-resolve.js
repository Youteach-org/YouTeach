import { signCogLiveToken, verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  allowedCogOrigin,
  canStudentAccessConnectedGame,
  corsJson,
  firebaseGet,
  optionsResponse,
  studentMatchesExternalId,
  youTeachSessionId
} from "../_shared/cog-live-http.js";

const BRIDGE_TTL_MS = 12 * 60 * 60 * 1000;

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function labelForTeamKey(teamKey) {
  const match = String(teamKey || "").match(/^team(\d+)$/i);
  return match ? `Team ${match[1]}` : String(teamKey || "").trim();
}

function canonicalTeamContext(session, studentKey) {
  const key = String(studentKey || "").trim();
  const assignments = session?.assignments || {};
  const teamLabel = String(assignments[key] || "").trim();
  if (!teamLabel) return null;

  const teams = session?.teams || {};
  const teamKey = Object.keys(teams).find((candidate) =>
    labelForTeamKey(candidate).toLowerCase() === teamLabel.toLowerCase()
  ) || teamLabel.toLowerCase().replace(/[^a-z0-9]+/g, "");

  const memberKeys = Object.entries(assignments)
    .filter(([, assignedLabel]) => String(assignedLabel || "") === teamLabel)
    .map(([memberKey]) => String(memberKey));

  const memberNames = Array.isArray(teams?.[teamKey])
    ? teams[teamKey].map(String)
    : [];

  return {
    teamKey,
    teamLabel,
    memberKeys,
    memberNames,
    teamRevision: `${youTeachSessionId(session)}:${teamKey}:${memberKeys.join(",")}`
  };
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
      "cog-live-student"
    );
    if (!launch) {
      return corsJson(request, 401, { ok: false, error: "The YouTeach student launch is invalid or expired." });
    }

    const studentKey = String(launch.studentKey || "").trim();
    const [student, session] = await Promise.all([
      firebaseGet(`students/${studentKey}`),
      firebaseGet("session/current")
    ]);

    if (!studentMatchesExternalId(student, launch.externalId)) {
      return corsJson(request, 403, { ok: false, error: "The student identity no longer matches Firebase." });
    }
    if (!canStudentAccessConnectedGame({ studentKey, student, session })) {
      return corsJson(request, 410, { ok: false, error: "This live game is no longer available to the student." });
    }

    const connectedGame = session.connectedGame;
    if (
      youTeachSessionId(session) !== String(launch.youTeachSessionId || "") ||
      String(connectedGame.gameId || "") !== String(launch.gameId || "") ||
      String(connectedGame.cogSessionId || "") !== String(launch.cogSessionId || "")
    ) {
      return corsJson(request, 409, { ok: false, error: "The live game session changed. Return to Student Buzzer and join again." });
    }

    const teamContext = canonicalTeamContext(session, studentKey);

    const now = Date.now();
    const bridgePayload = {
      purpose: "cog-live-student-session",
      studentKey,
      externalId: String(student.studentNumber || student.id || launch.externalId || "").trim(),
      groupName: String(connectedGame.groupName || session.groupName || "").trim(),
      youTeachSessionId: youTeachSessionId(session),
      assignmentId: String(connectedGame.assignmentId || "").trim(),
      gameId: String(connectedGame.gameId || "").trim(),
      gameName: String(connectedGame.gameName || "").trim(),
      cogSessionId: String(connectedGame.cogSessionId || "").trim(),
      teamKey: String(teamContext?.teamKey || ""),
      teamRevision: String(teamContext?.teamRevision || ""),
      iat: now,
      exp: now + BRIDGE_TTL_MS,
      nonce: nonce()
    };
    const bridgeToken = await signCogLiveToken(bridgePayload, env.YOUTEACH_SESSION_SECRET);

    return corsJson(request, 200, {
      ok: true,
      identity: {
        studentKey,
        nickname: String(student.nickname || "Student").trim() || "Student",
        fullName: String(student.fullName || student.name || "").trim(),
        groupName: bridgePayload.groupName,
        studentNumber: bridgePayload.externalId
      },
      liveContext: {
        youTeachSessionId: bridgePayload.youTeachSessionId,
        groupName: bridgePayload.groupName,
        gameId: bridgePayload.gameId,
        gameName: bridgePayload.gameName,
        cogSessionId: bridgePayload.cogSessionId,
        assignmentId: bridgePayload.assignmentId,
        launchMode: "live-buzzer"
      },
      teamContext,
      bridgeToken,
      bridgeExpiresAt: bridgePayload.exp
    });
  } catch (error) {
    console.error("COG student resolve failed:", error?.message || error);
    return corsJson(request, 500, { ok: false, error: "Could not verify the YouTeach student launch." });
  }
}
