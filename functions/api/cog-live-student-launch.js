import { signCogLiveToken } from "../_shared/cog-live-token.js";
import {
  canStudentAccessConnectedGame,
  cogOriginForRequest,
  firebaseGet,
  json,
  liveGame,
  studentMatchesExternalId,
  youTeachSessionId
} from "../_shared/cog-live-http.js";

const STUDENT_LAUNCH_TTL_MS = 3 * 60 * 1000;

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanStudentKey(value) {
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

    const studentKey = cleanStudentKey(body.studentKey);
    const externalId = String(body.externalId || "").trim();
    if (!studentKey || !externalId) {
      return json(400, { ok: false, error: "Student identity is required." });
    }

    const [studentRecord, session] = await Promise.all([
      firebaseGet(`students/${studentKey}`),
      firebaseGet("session/current")
    ]);

    if (!studentMatchesExternalId(studentRecord, externalId)) {
      return json(403, { ok: false, error: "Student identity does not match Firebase." });
    }
    if (!canStudentAccessConnectedGame({ studentKey, student: studentRecord, session })) {
      return json(403, { ok: false, error: "This live game is not available to this student." });
    }

    const connectedGame = session.connectedGame;
    const game = liveGame(connectedGame.gameId);
    if (!game || !game.studentPath) {
      return json(409, { ok: false, error: "This activity stays inside Student Buzzer." });
    }

    const now = Date.now();
    const grant = {
      purpose: "cog-live-student",
      studentKey,
      externalId,
      fullName: String(studentRecord.fullName || studentRecord.name || "").trim(),
      nickname: String(studentRecord.nickname || "").trim(),
      groupName: String(studentRecord.groupName || "").trim(),
      youTeachSessionId: youTeachSessionId(session),
      assignmentId: String(connectedGame.assignmentId || "").trim(),
      gameId: game.id,
      gameName: game.name,
      cogSessionId: String(connectedGame.cogSessionId || "").trim(),
      iat: now,
      exp: now + STUDENT_LAUNCH_TTL_MS,
      nonce: nonce()
    };

    if (!grant.cogSessionId || !grant.youTeachSessionId) {
      return json(409, { ok: false, error: "The live game session is incomplete." });
    }

    const token = await signCogLiveToken(grant, env.YOUTEACH_SESSION_SECRET);
    const issuer = new URL(request.url).origin;
    const target = new URL(game.studentPath, cogOriginForRequest(request));
    target.searchParams.set("ytLiveStudent", token);
    target.searchParams.set("issuer", issuer);

    return json(200, {
      ok: true,
      launchUrl: target.toString(),
      expiresAt: grant.exp,
      gameId: game.id,
      cogSessionId: grant.cogSessionId
    });
  } catch (error) {
    console.error("COG student launch failed:", error?.message || error);
    return json(500, { ok: false, error: "Could not create the Classroom Online Games student launch." });
  }
}
