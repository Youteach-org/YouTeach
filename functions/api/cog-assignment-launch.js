import { verifyStudentSession } from "../_shared/student-session.js";

const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";
const COG_ORIGIN = "https://classroom-online-games.pages.dev";

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

async function firebasePut(path, value) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error(`Firebase write failed: ${response.status}`);
}

function bearerToken(request) {
  const header = String(request.headers.get("Authorization") || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function assignmentTypeCodeFor(assignment) {
  return String(assignment?.assignmentTypeCode || "").trim().toUpperCase();
}

function validateCogConfig(assignment) {
  const config = assignment?.cogActivity;
  if (!config || typeof config !== "object" || assignmentTypeCodeFor(assignment) !== "COG") {
    throw new Error("This assignment is not configured as a COG activity.");
  }

  const gameId = String(config.gameId || "").trim();
  const modeId = String(config.modeId || "").trim();
  const difficultyId = String(config.difficultyId || "").trim();

  const validModes = new Set(["verb", "sentence", "time-clues", "perfect-race", "final-race"]);
  const validDifficulties = new Set(["easy", "medium", "hard"]);

  if (gameId !== "verb-runner") throw new Error("This COG game is not available for launch.");
  if (!validModes.has(modeId)) throw new Error("This COG assignment has an invalid mode.");
  if (!validDifficulties.has(difficultyId)) throw new Error("This COG assignment has an invalid difficulty.");

  const minimumPercent = config.minimumPercent == null || config.minimumPercent === ""
    ? null
    : Number(config.minimumPercent);
  if (minimumPercent != null && (!Number.isFinite(minimumPercent) || minimumPercent < 0 || minimumPercent > 100)) {
    throw new Error("This COG assignment has an invalid minimum performance.");
  }

  const pointValue = Number(assignment?.pointValue ?? config.pointValue ?? 100);
  if (!Number.isFinite(pointValue) || pointValue <= 0) {
    throw new Error("This COG assignment has an invalid point value.");
  }

  return {
    gameId,
    modeId,
    difficultyId,
    minimumPercent,
    pointValue,
    contractVersion: Number(config.contractVersion || 1)
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const signedSession = bearerToken(request);
    if (!signedSession) {
      return json(401, { ok: false, error: "Sign in again before opening this COG activity." });
    }

    const session = await verifyStudentSession(
      signedSession,
      env.YOUTEACH_SESSION_SECRET
    );
    if (!session) {
      return json(401, { ok: false, error: "Your YouTeach session expired. Sign in again." });
    }

    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const assignmentId = String(body.assignmentId || "").trim();
    if (!assignmentId) {
      return json(400, { ok: false, error: "Missing assignment." });
    }

    const [student, assignment] = await Promise.all([
      firebaseGet(`students/${encodeURIComponent(session.studentKey)}`),
      firebaseGet(`assignments/${encodeURIComponent(assignmentId)}`)
    ]);

    if (!student || !assignment) {
      return json(404, { ok: false, error: "Student or assignment not found." });
    }

    const expectedExternalId = String(student.studentNumber || student.id || "").trim();
    if (!expectedExternalId || expectedExternalId !== session.externalId) {
      return json(403, { ok: false, error: "Student identity does not match this session." });
    }

    const studentGroup = String(student.groupName || "GENERAL");
    const assignmentGroup = String(assignment.groupName || "ALL");
    if (assignmentGroup !== "ALL" && assignmentGroup !== studentGroup) {
      return json(403, { ok: false, error: "This assignment is not assigned to your group." });
    }

    const cogActivity = validateCogConfig(assignment);
    const token = makeToken();
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000;

    await firebasePut(`classroomGames/verbRunnerV2/launchTokens/${token}`, {
      studentKey: session.studentKey,
      game: "verb-runner",
      purpose: "assignment-practice",
      officialSubmissionAllowed: false,
      assignmentId,
      assignmentCode: String(assignment.code || ""),
      cogActivity,
      createdAt: now,
      expiresAt,
      used: false
    });

    return json(200, {
      ok: true,
      purpose: "assignment-practice",
      officialSubmissionAllowed: false,
      expiresAt,
      launchUrl: `${COG_ORIGIN}/Verb-Runner/?launch=${encodeURIComponent(token)}`
    });
  } catch (error) {
    console.error(error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not create the COG launch credential."
    });
  }
}
