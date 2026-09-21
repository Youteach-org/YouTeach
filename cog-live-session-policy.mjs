export const LIVE_COG_IDLE_TTL_MS = 60 * 60 * 1000;
export const LIVE_COG_PRESENCE_STALE_MS = 90 * 1000;

function text(value, field) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new TypeError(`${field} is required.`);
  return clean;
}

function normalizeStringArray(raw) {
  const values = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" ? Object.values(raw) : []);
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizePresenceMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [String(key || "").trim(), Number(value || 0)])
      .filter(([key, value]) => key && Number.isFinite(value) && value >= 0)
  );
}

function timestamp(value, field, { nullable = false } = {}) {
  if (nullable && (value == null || value === "")) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${field} must be a valid timestamp.`);
  }
  return number;
}

export function validateConnectedGame(raw = {}) {
  const status = String(raw.status || "").trim();
  if (!["active", "ended", "expired"].includes(status)) {
    throw new TypeError("connected game status is invalid.");
  }

  const launchMode = String(raw.launchMode || "").trim();
  if (launchMode !== "live-buzzer") {
    throw new TypeError("connected game launch mode must be live-buzzer.");
  }

  return {
    gameId: text(raw.gameId, "gameId"),
    gameName: text(raw.gameName, "gameName"),
    cogSessionId: text(raw.cogSessionId, "cogSessionId"),
    groupName: text(raw.groupName, "groupName"),
    assignmentId: String(raw.assignmentId || "").trim(),
    assignmentCode: String(raw.assignmentCode || "").trim(),
    assignmentTitle: String(raw.assignmentTitle || "").trim(),
    recipientStudentKeys: normalizeStringArray(raw.recipientStudentKeys),
    recipientTeamLabels: normalizeStringArray(raw.recipientTeamLabels),
    recipientTeamTarget: String(raw.recipientTeamTarget || "").trim(),
    status,
    launchMode,
    startedAt: timestamp(raw.startedAt, "startedAt"),
    updatedAt: timestamp(raw.updatedAt ?? raw.startedAt, "updatedAt"),
    teacherPresenceAt: timestamp(raw.teacherPresenceAt ?? raw.startedAt, "teacherPresenceAt"),
    studentPresence: normalizePresenceMap(raw.studentPresence),
    noPresenceSince: timestamp(raw.noPresenceSince, "noPresenceSince", { nullable: true }),
    endedAt: timestamp(raw.endedAt, "endedAt", { nullable: true }),
    expiredAt: timestamp(raw.expiredAt, "expiredAt", { nullable: true })
  };
}

export function livePresenceState({ connectedGame, now = Date.now() } = {}) {
  const game = validateConnectedGame(connectedGame);
  const current = timestamp(now, "now");

  if (game.status !== "active") {
    return {
      hasPresence: false,
      latestPresenceAt: 0,
      noPresenceSince: game.noPresenceSince,
      expired: game.status === "expired"
    };
  }

  const presenceTimes = [
    game.startedAt,
    game.teacherPresenceAt,
    ...Object.values(game.studentPresence || {})
  ].filter((value) => Number.isFinite(Number(value)) && Number(value) >= 0)
    .map(Number);

  const latestPresenceAt = presenceTimes.length ? Math.max(...presenceTimes) : game.startedAt;
  const hasPresence = current - latestPresenceAt < LIVE_COG_PRESENCE_STALE_MS;

  if (hasPresence) {
    return {
      hasPresence: true,
      latestPresenceAt,
      noPresenceSince: null,
      expired: false
    };
  }

  const inferredZeroSince = latestPresenceAt + LIVE_COG_PRESENCE_STALE_MS;
  const storedZeroSince = game.noPresenceSince == null ? null : Number(game.noPresenceSince);
  const noPresenceSince = storedZeroSince == null
    ? inferredZeroSince
    : Math.min(storedZeroSince, inferredZeroSince);

  return {
    hasPresence: false,
    latestPresenceAt,
    noPresenceSince,
    expired: current - noPresenceSince >= LIVE_COG_IDLE_TTL_MS
  };
}

export function shouldExpireConnectedGame({ connectedGame, now = Date.now() } = {}) {
  if (!connectedGame) return false;
  try {
    return livePresenceState({ connectedGame, now }).expired;
  } catch {
    return false;
  }
}

export function canStudentAccessLiveGame({
  connectedGame,
  studentGroup,
  studentKey = "",
  now = Date.now()
} = {}) {
  if (!connectedGame) return false;
  let game;
  try {
    game = validateConnectedGame(connectedGame);
  } catch {
    return false;
  }
  const group = String(studentGroup || "").trim();
  if (!group || game.groupName !== group || game.status !== "active") return false;

  if (game.recipientStudentKeys.length) {
    const key = String(studentKey || "").trim();
    if (!key || !game.recipientStudentKeys.includes(key)) return false;
  }

  return !shouldExpireConnectedGame({ connectedGame: game, now });
}

export function nextPresenceState({
  connectedGame,
  teacherPresent = false,
  studentPresenceCount = 0,
  now = Date.now()
} = {}) {
  const game = validateConnectedGame(connectedGame);
  const current = timestamp(now, "now");
  const count = Math.max(0, Math.trunc(Number(studentPresenceCount) || 0));
  const hasPresence = Boolean(teacherPresent) || count > 0;

  return {
    ...game,
    updatedAt: current,
    teacherPresenceAt: teacherPresent ? current : game.teacherPresenceAt,
    noPresenceSince: hasPresence
      ? null
      : (game.noPresenceSince == null ? current : game.noPresenceSince)
  };
}

function keyPart(value, field) {
  return encodeURIComponent(text(value, field));
}

export function liveResultKey({ gameId, cogSessionId, studentKey, resultId } = {}) {
  return [
    keyPart(gameId, "gameId"),
    keyPart(cogSessionId, "cogSessionId"),
    keyPart(studentKey, "studentKey"),
    keyPart(resultId, "resultId")
  ].join(":");
}
