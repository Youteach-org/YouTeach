import { verifyCogLiveToken } from "../_shared/cog-live-token.js";
import {
  DATABASE_URL,
  allowedCogOrigin,
  bearer,
  firebaseGet,
  firebasePut,
  json,
  optionsResponse,
  youTeachSessionId
} from "../_shared/cog-live-http.js";
import { canStudentAccessLiveGame } from "../../cog-live-session-policy.mjs";

const RESULT_ID_RE = /^[A-Za-z0-9_-]{8,160}$/;
const ATTEMPT_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const RESULT_TYPES = new Set(["individual", "team"]);

function finiteNumber(value, { min = -Infinity, max = Infinity, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function cleanMetrics(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const output = {};
  const numericFields = {
    correct: { min: 0, max: 100000 },
    errors: { min: 0, max: 100000 },
    grammarErrors: { min: 0, max: 100000 },
    obstacleHits: { min: 0, max: 100000 },
    bestStreak: { min: 0, max: 100000 },
    timeMs: { min: 0, max: 24 * 60 * 60 * 1000 },
    momentum: { min: 0, max: 100 },
    level: { min: 0, max: 1000 },
    supportMeter: { min: 0, max: 100 },
    streak: { min: 0, max: 100000 },
    storiesCompleted: { min: 0, max: 10000 },
    translationAttempts: { min: 0, max: 10000 },
    score: { min: 0, max: 100000000 },
    attempts: { min: 0, max: 1000000 },
    bestCombo: { min: 0, max: 1000000 }
  };

  for (const [name, limits] of Object.entries(numericFields)) {
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    const value = finiteNumber(source[name], limits);
    if (value != null) output[name] = value;
  }

  for (const [name, maxLength] of [["mode", 80], ["difficulty", 40]]) {
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    const value = String(source[name] || "").trim().slice(0, maxLength);
    if (value) output[name] = value;
  }

  return output;
}

function normalizeResult(raw) {
  const result = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const resultId = String(result.resultId || "").trim();
  const attemptId = String(result.attemptId || "").trim();
  const resultType = String(result.resultType || "individual").trim().toLowerCase();
  const schemaVersion = Number(result.schemaVersion || 1);
  const completedAt = finiteNumber(result.completedAt, { min: 1 });
  const percentage = finiteNumber(result.percentage, { min: 0, max: 100 });
  const points = finiteNumber(result.points, { min: 0, max: 1_000_000, nullable: true });

  if (
    schemaVersion !== 1 ||
    !RESULT_ID_RE.test(resultId) ||
    !ATTEMPT_ID_RE.test(attemptId) ||
    !RESULT_TYPES.has(resultType) ||
    completedAt == null ||
    percentage == null
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    resultId,
    attemptId,
    resultType,
    completedAt,
    percentage,
    points,
    metrics: cleanMetrics(result.metrics)
  };
}

async function firebaseGetWithEtag(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "GET",
    headers: { "X-Firebase-ETag": "true" }
  });
  if (!response.ok) throw new Error(`Firebase result read failed: ${response.status}`);
  return {
    value: await response.json(),
    etag: response.headers.get("ETag") || response.headers.get("etag") || ""
  };
}

async function firebaseConditionalPut(path, value, etag) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "if-match": etag || "*"
    },
    body: JSON.stringify(value)
  });
  if (response.status === 412) return { written: false, conflict: true };
  if (!response.ok) throw new Error(`Firebase result write failed: ${response.status}`);
  return { written: true, conflict: false };
}

function sameCanonicalResult(existing, grant, result) {
  return Boolean(
    existing &&
    String(existing.resultId || "") === result.resultId &&
    String(existing.studentKey || "") === String(grant.studentKey || "") &&
    String(existing.assignmentId || "") === String(grant.assignmentId || "") &&
    String(existing.gameId || "") === String(grant.gameId || "") &&
    String(existing.cogSessionId || "") === String(grant.cogSessionId || "")
  );
}

async function mirrorAssignmentResult(record) {
  const assignmentId = String(record?.assignmentId || "").trim();
  const studentKey = String(record?.studentKey || "").trim();
  const resultId = String(record?.resultId || "").trim();
  if (!assignmentId || !studentKey || !resultId) {
    throw new Error("Cannot index a COG result without assignment, student and result identifiers.");
  }
  await firebasePut(
    `classroomGameResultsByAssignment/${assignmentId}/${studentKey}/${resultId}`,
    record
  );
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
    const token = bearer(request);
    const grant = token
      ? await verifyCogLiveToken(
          token,
          env.YOUTEACH_SESSION_SECRET,
          Date.now(),
          "cog-live-student-session"
        )
      : null;

    if (!grant) {
      return json(401, { ok: false, error: "Invalid or expired student live-session credential." }, origin);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {}
    const result = normalizeResult(body.result);
    if (!result) {
      return json(400, { ok: false, error: "Invalid Classroom Online Games result payload." }, origin);
    }

    const currentSession = await firebaseGet("session/current");
    const connectedGame = currentSession?.connectedGame || null;
    const canonicalSessionId = youTeachSessionId(currentSession);
    const canonicalGroup = String(currentSession?.groupName || "").trim();
    const studentKey = String(grant.studentKey || "").trim();
    const assignmentId = String(grant.assignmentId || "").trim();
    const gameId = String(grant.gameId || "").trim();
    const cogSessionId = String(grant.cogSessionId || "").trim();

    if (
      !currentSession?.active ||
      !connectedGame ||
      connectedGame.status !== "active" ||
      !studentKey ||
      !assignmentId ||
      !gameId ||
      !cogSessionId ||
      canonicalSessionId !== String(grant.youTeachSessionId || "") ||
      canonicalGroup !== String(grant.groupName || "") ||
      String(connectedGame.assignmentId || "") !== assignmentId ||
      String(connectedGame.gameId || "") !== gameId ||
      String(connectedGame.cogSessionId || "") !== cogSessionId
    ) {
      return json(409, {
        ok: false,
        error: "This result does not belong to the current YouTeach live activity."
      }, origin);
    }

    if (
      !canStudentAccessLiveGame({
        connectedGame,
        studentGroup: canonicalGroup,
        studentKey,
        now: Date.now()
      })
    ) {
      return json(403, { ok: false, error: "You are not eligible for this live activity." }, origin);
    }

    const resultPath = `classroomGameResults/${cogSessionId}/${studentKey}/${result.resultId}`;
    let snapshot = await firebaseGetWithEtag(resultPath);

    if (snapshot.value != null) {
      if (!sameCanonicalResult(snapshot.value, grant, result)) {
        return json(409, { ok: false, error: "This result ID is already used by another result." }, origin);
      }
      await mirrorAssignmentResult(snapshot.value);
      return json(200, {
        ok: true,
        duplicate: true,
        receipt: snapshot.value
      }, origin);
    }

    const acceptedAt = Date.now();
    const record = {
      ...result,
      studentKey,
      externalId: String(grant.externalId || ""),
      groupName: canonicalGroup,
      assignmentId,
      gameId,
      cogSessionId,
      youTeachSessionId: canonicalSessionId,
      acceptedAt
    };

    const write = await firebaseConditionalPut(resultPath, record, snapshot.etag);
    if (!write.written && write.conflict) {
      snapshot = await firebaseGetWithEtag(resultPath);
      if (sameCanonicalResult(snapshot.value, grant, result)) {
        await mirrorAssignmentResult(snapshot.value);
        return json(200, {
          ok: true,
          duplicate: true,
          receipt: snapshot.value
        }, origin);
      }
      return json(409, { ok: false, error: "This result ID was accepted concurrently for another result." }, origin);
    }

    await mirrorAssignmentResult(record);

    return json(200, {
      ok: true,
      duplicate: false,
      receipt: record
    }, origin);
  } catch (error) {
    console.error("COG live result submit failed:", error?.message || error);
    return json(500, {
      ok: false,
      error: error?.message || "Could not save the Classroom Online Games result."
    }, origin || "");
  }
}
