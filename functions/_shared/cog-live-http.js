export const DATABASE_URL = "https://youteach-d9a79-default-rtdb.firebaseio.com";

export const LIVE_COG_GAMES = Object.freeze({
  "verb-runner": Object.freeze({
    id: "verb-runner",
    name: "Verb Runner",
    studentPath: "/Verb-Runner/"
  }),
  "support-meter": Object.freeze({
    id: "support-meter",
    name: "Support Meter",
    studentPath: "/Support-Meter/"
  }),
  "100-students-said": Object.freeze({
    id: "100-students-said",
    name: "100 Students Said",
    studentPath: null
  }),
  "osascomp": Object.freeze({
    id: "osascomp",
    name: "OSASCOMP",
    studentPath: "/OSASCOMP/"
  })
});

export function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export async function firebaseGet(path) {
  const response = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

export function youTeachSessionId(session) {
  return String(session?.sessionId || session?.createdAt || "").trim();
}

export function normalizeRecipientKeys(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean))];
  }
  if (raw && typeof raw === "object") {
    return [...new Set(Object.keys(raw).filter((key) => raw[key]))];
  }
  return [];
}

export function liveGame(gameId) {
  return LIVE_COG_GAMES[String(gameId || "").trim()] || null;
}

export function cogOriginForRequest(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host === "youteach.pages.dev") {
    return "https://classroom-online-games.pages.dev";
  }
  const suffix = ".youteach.pages.dev";
  if (host.endsWith(suffix)) {
    const prefix = host.slice(0, -suffix.length);
    if (prefix) return `https://${prefix}.classroom-online-games.pages.dev`;
  }
  return "https://classroom-online-games.pages.dev";
}

export function isCogAssignmentForSession(assignment, session) {
  if (!assignment || assignment.active === false) return false;
  if (String(assignment.assignmentTypeCode || "").trim().toUpperCase() !== "COG") return false;
  if (!session?.active || !youTeachSessionId(session)) return false;

  const sessionGroup = String(session.groupName || "").trim();
  const assignmentGroup = String(assignment.groupName || "").trim();
  if (!sessionGroup || !assignmentGroup) return false;
  if (assignmentGroup !== "ALL" && assignmentGroup !== sessionGroup) return false;

  const sourceSession = Number(assignment.sourceBuzzerSessionCreatedAt || 0);
  const currentCreatedAt = Number(session.createdAt || 0);
  if (sourceSession && currentCreatedAt && sourceSession !== currentCreatedAt) return false;
  return true;
}

export function studentMatchesExternalId(student, externalId) {
  const clean = String(externalId || "").trim();
  if (!clean || !student) return false;
  return [student.studentNumber, student.id]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .includes(clean);
}

export function canStudentAccessConnectedGame({ studentKey, student, session } = {}) {
  const game = session?.connectedGame || null;
  if (!session?.active || !game) return false;
  if (String(game.status || "") !== "active") return false;
  if (String(game.launchMode || "") !== "live-buzzer") return false;

  const studentGroup = String(student?.groupName || "").trim();
  const gameGroup = String(game.groupName || "").trim();
  if (!studentGroup || studentGroup !== gameGroup) return false;

  const recipients = normalizeRecipientKeys(game.recipientStudentKeys);
  if (recipients.length && !recipients.includes(String(studentKey || "").trim())) return false;
  return true;
}
