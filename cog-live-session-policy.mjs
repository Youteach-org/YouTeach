export const LIVE_COG_IDLE_TTL_MS = 60 * 60 * 1000;

function text(value, field) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new TypeError(`${field} is required.`);
  return clean;
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
    status,
    launchMode,
    startedAt: timestamp(raw.startedAt, "startedAt"),
    updatedAt: timestamp(raw.updatedAt ?? raw.startedAt, "updatedAt"),
    teacherPresenceAt: timestamp(raw.teacherPresenceAt ?? raw.startedAt, "teacherPresenceAt"),
    noPresenceSince: timestamp(raw.noPresenceSince, "noPresenceSince", { nullable: true }),
    endedAt: timestamp(raw.endedAt, "endedAt", { nullable: true }),
    expiredAt: timestamp(raw.expiredAt, "expiredAt", { nullable: true })
  };
}

export function shouldExpireConnectedGame({ connectedGame, now = Date.now() } = {}) {
  if (!connectedGame) return false;
  const game = validateConnectedGame(connectedGame);
  if (game.status !== "active" || game.noPresenceSince == null) return false;
  const current = timestamp(now, "now");
  return current - game.noPresenceSince >= LIVE_COG_IDLE_TTL_MS;
}

export function canStudentAccessLiveGame({ connectedGame, studentGroup, now = Date.now() } = {}) {
  if (!connectedGame) return false;
  let game;
  try {
    game = validateConnectedGame(connectedGame);
  } catch {
    return false;
  }
  const group = String(studentGroup || "").trim();
  if (!group || game.groupName !== group || game.status !== "active") return false;
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
