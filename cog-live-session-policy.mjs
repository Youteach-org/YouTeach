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

function recipientKeys(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((value) => String(value || "").trim()).filter(Boolean))];
  }
  if (raw && typeof raw === "object") {
    return [...new Set(Object.keys(raw).filter((key) => raw[key]))];
  }
  return [];
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
    ...raw,
    gameId: text(raw.gameId, "gameId"),
    gameName: text(raw.gameName, "gameName"),
    cogSessionId: text(raw.cogSessionId, "cogSessionId"),
    groupName: text(raw.groupName, "groupName"),
    status,
    launchMode,
    recipientStudentKeys: recipientKeys(raw.recipientStudentKeys),
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
  return Number(now) - game.noPresenceSince >= LIVE_COG_IDLE_TTL_MS;
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
  const key = String(studentKey || "").trim();
  if (!group || game.groupName !== group || game.status !== "active") return false;
  if (game.recipientStudentKeys.length && !game.recipientStudentKeys.includes(key)) return false;
  return !shouldExpireConnectedGame({ connectedGame: game, now });
}
