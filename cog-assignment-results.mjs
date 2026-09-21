const GAME_NAMES = Object.freeze({
  "verb-runner": "Verb Runner",
  "support-meter": "Support Meter",
  "100-students-said": "100 Students Said",
  "osascomp": "OSASCOMP"
});

const METRIC_LABELS = Object.freeze({
  correct: "Correct",
  errors: "Errors",
  grammarErrors: "Grammar errors",
  obstacleHits: "Obstacle hits",
  bestStreak: "Best streak",
  timeMs: "Time",
  momentum: "Momentum",
  level: "Level",
  supportMeter: "Support meter",
  streak: "Streak",
  storiesCompleted: "Stories completed",
  translationAttempts: "Translation attempts",
  score: "Score",
  attempts: "Attempts",
  bestCombo: "Best combo",
  mode: "Mode",
  difficulty: "Difficulty"
});

const GAME_METRIC_ORDER = Object.freeze({
  "verb-runner": Object.freeze([
    "correct", "errors", "grammarErrors", "obstacleHits", "bestStreak",
    "timeMs", "momentum", "level", "difficulty", "mode"
  ]),
  "support-meter": Object.freeze([
    "supportMeter", "streak", "storiesCompleted", "translationAttempts", "mode"
  ]),
  "osascomp": Object.freeze([
    "score", "correct", "errors", "attempts", "bestCombo", "mode"
  ]),
  "100-students-said": Object.freeze([
    "score", "correct", "errors", "attempts", "bestCombo", "mode"
  ])
});

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resultTimestamp(result) {
  return Math.max(
    Number(result?.acceptedAt || 0),
    Number(result?.completedAt || 0)
  );
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatMetricValue(key, value) {
  if (key === "timeMs") return formatDuration(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Number(value.toFixed(2)));
  }
  return String(value ?? "");
}

export function cogGameName(gameId) {
  const key = String(gameId || "").trim();
  return GAME_NAMES[key] || key || "Classroom Online Game";
}

export function cogResultHistoryForStudent(resultsByStudent, studentKey) {
  const raw = objectRecord(objectRecord(resultsByStudent)[String(studentKey || "")]);
  return Object.entries(raw)
    .map(([resultId, value]) => ({
      ...objectRecord(value),
      resultId: String(value?.resultId || resultId),
      studentKey: String(value?.studentKey || studentKey || "")
    }))
    .filter((result) => result.resultId)
    .sort((a, b) => {
      const timeDiff = resultTimestamp(b) - resultTimestamp(a);
      if (timeDiff) return timeDiff;
      return String(b.resultId).localeCompare(String(a.resultId));
    });
}

export function studentHasCogResult(resultsByStudent, studentKey) {
  return cogResultHistoryForStudent(resultsByStudent, studentKey).length > 0;
}

export function cogResultStudentCount(resultsByStudent) {
  return Object.keys(objectRecord(resultsByStudent))
    .filter((studentKey) => studentHasCogResult(resultsByStudent, studentKey))
    .length;
}

export function cogMetricEntries(receipt) {
  const metrics = objectRecord(receipt?.metrics);
  const gameId = String(receipt?.gameId || "").trim();
  const preferred = GAME_METRIC_ORDER[gameId] || [];
  const ordered = [
    ...preferred,
    ...Object.keys(metrics).filter((key) => !preferred.includes(key))
  ];

  return [...new Set(ordered)]
    .filter((key) => Object.prototype.hasOwnProperty.call(metrics, key))
    .map((key) => ({
      key,
      label: METRIC_LABELS[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase()),
      value: formatMetricValue(key, metrics[key])
    }));
}
