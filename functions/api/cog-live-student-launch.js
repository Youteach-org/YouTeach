import { verifyStudentSession } from "../_shared/student-session.js";
import { signCogLiveToken } from "../_shared/cog-live-token.js";
import {
  firebaseGet,
  liveGame,
  youTeachSessionId
} from "../_shared/cog-live-http.js";
import { canStudentAccessLiveGame } from "../../cog-live-session-policy.mjs";

const DEFAULT_COG_ORIGIN = "https://classroom-online-games.pages.dev";
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

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cogOrigin(env) {
  const raw = String(env?.COG_LIVE_ORIGIN || DEFAULT_COG_ORIGIN).trim();
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !(
      host === "classroom-online-games.pages.dev" ||
      host.endsWith(".classroom-online-games.pages.dev")
    )
  ) {
    throw new Error("Invalid Classroom Online Games live origin.");
  }
  return url.origin;
}

function externalIdFor(student) {
  return String(student?.studentNumber || student?.id || "").trim();
}

export async function onRequestPost({ request, env }) {
  try {
    const signedStudentSession = bearer(request);
    if (!signedStudentSession) {
      return json(401, { ok: false, error: "Sign in again before opening the live activity." });
    }

    const sessionGrant = await verifyStudentSession(
      signedStudentSession,
      env.YOUTEACH_SESSION_SECRET
    );
    if (!sessionGrant) {
      return json(401, { ok: false, error: "Your student session expired. Sign in again." });
    }

    const [student, currentSession] = await Promise.all([
      firebaseGet(`students/${encodeURIComponent(sessionGrant.studentKey)}`),
      firebaseGet("session/current")
    ]);

    if (!student) {
      return json(401, { ok: false, error: "Student account is no longer available." });
    }

    const canonicalExternalId = externalIdFor(student);
    if (!canonicalExternalId || canonicalExternalId !== String(sessionGrant.externalId || "")) {
      return json(401, { ok: false, error: "Student identity changed. Sign in again." });
    }

    const studentGroup = String(student.groupName || "GENERAL").trim();
    const connectedGame = currentSession?.connectedGame || null;
    if (
      !currentSession?.active ||
      String(currentSession.groupName || "").trim() !== studentGroup ||
      !connectedGame
    ) {
      return json(403, { ok: false, error: "There is no live activity for your group." });
    }

    if (!canStudentAccessLiveGame({
      connectedGame,
      studentGroup,
      studentKey: sessionGrant.studentKey,
      now: Date.now()
    })) {
      return json(403, { ok: false, error: "This live activity is not available for your group." });
    }

    const game = liveGame(connectedGame.gameId);
    if (!game) {
      return json(409, { ok: false, error: "This live game is not supported." });
    }

    const canonicalSessionId = youTeachSessionId(currentSession);
    if (
      !canonicalSessionId ||
      String(connectedGame.youTeachSessionId || canonicalSessionId) !== canonicalSessionId
    ) {
      return json(409, { ok: false, error: "The live activity no longer matches this Buzzer session." });
    }

    const now = Date.now();
    const expiresAt = Math.min(
      now + LAUNCH_TTL_MS,
      Number(sessionGrant.expiresAt || 0)
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return json(401, { ok: false, error: "Your student session expired. Sign in again." });
    }

    const token = await signCogLiveToken({
      purpose: "cog-live-student",
      studentKey: sessionGrant.studentKey,
      externalId: canonicalExternalId,
      studentSessionExpiresAt: Number(sessionGrant.expiresAt || 0),
      groupName: studentGroup,
      youTeachSessionId: canonicalSessionId,
      gameId: game.id,
      gameName: game.name,
      cogSessionId: String(connectedGame.cogSessionId || ""),
      assignmentId: String(connectedGame.assignmentId || ""),
      iat: now,
      exp: expiresAt,
      nonce: nonce()
    }, env.YOUTEACH_SESSION_SECRET);

    const issuer = new URL(request.url).origin;
    const launchUrl = new URL(`${cogOrigin(env)}${game.studentPath}`);
    launchUrl.searchParams.set("ytLiveStudent", token);
    launchUrl.searchParams.set("issuer", issuer);

    return json(200, {
      ok: true,
      gameId: game.id,
      cogSessionId: String(connectedGame.cogSessionId || ""),
      launchUrl: launchUrl.toString(),
      expiresAt
    });
  } catch (error) {
    console.error("COG live student launch failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not open the live activity."
    });
  }
}
