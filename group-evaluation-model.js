const CATEGORY_KEYS = ["tasks", "exams", "participation", "attendance"];

export const GROUP_EVALUATION_CATEGORIES = Object.freeze([
  { key: "tasks", label: "Tasks" },
  { key: "exams", label: "Exams" },
  { key: "participation", label: "Participation" },
  { key: "attendance", label: "Attendance" }
]);

export function normalizeEvaluationUnitCount(value, fallback = 3) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(1, parsed));
}

export function normalizeEvaluationWeights(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(CATEGORY_KEYS.map((key) => {
    const number = Number(source[key] ?? 0);
    return [key, Number.isFinite(number) ? Math.max(0, number) : 0];
  }));
}

export function evaluationWeightTotal(weights = {}) {
  const normalized = normalizeEvaluationWeights(weights);
  return Number(CATEGORY_KEYS.reduce((sum, key) => sum + normalized[key], 0).toFixed(2));
}

export function groupEvaluationConfig(group = {}) {
  const unitCount = normalizeEvaluationUnitCount(group?.evaluationUnitCount, 3);
  const weights = normalizeEvaluationWeights(group?.evaluationWeights);
  const total = evaluationWeightTotal(weights);
  const explicitlyConfigured =
    Number.isInteger(Number(group?.evaluationUnitCount)) &&
    group?.evaluationWeights &&
    typeof group.evaluationWeights === "object";

  return {
    unitCount,
    weights,
    total,
    configured: Boolean(explicitlyConfigured && Math.abs(total - 100) < 0.01)
  };
}

export function evaluationBlockNames(group = {}) {
  const { unitCount } = groupEvaluationConfig(group);
  return Array.from({ length: unitCount }, (_, index) => `Block ${index + 1}`);
}

function average(values = []) {
  const valid = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.min(100, Math.max(0, value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function directContribution(rawValue, weight) {
  const raw = Number(rawValue || 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(0, Number(weight || 0)), Math.max(0, raw));
}

function percentContribution(scores, weight) {
  const avg = average(scores);
  if (avg === null) return null;
  return Number(((avg / 100) * Number(weight || 0)).toFixed(2));
}

export function calculateBlockGrade({
  weights = {},
  taskScores = [],
  examScores = [],
  legacyTaskPoints = 0,
  legacyExamPoints = 0,
  participationPoints = 0,
  attendancePoints = 0
} = {}) {
  const normalizedWeights = normalizeEvaluationWeights(weights);
  const modernTasks = percentContribution(taskScores, normalizedWeights.tasks);
  const modernExams = percentContribution(examScores, normalizedWeights.exams);

  const contributions = {
    tasks: modernTasks === null
      ? directContribution(legacyTaskPoints, normalizedWeights.tasks)
      : modernTasks,
    exams: modernExams === null
      ? directContribution(legacyExamPoints, normalizedWeights.exams)
      : modernExams,
    participation: directContribution(participationPoints, normalizedWeights.participation),
    attendance: directContribution(attendancePoints, normalizedWeights.attendance)
  };

  const total = Number(Math.min(
    100,
    CATEGORY_KEYS.reduce((sum, key) => sum + Number(contributions[key] || 0), 0)
  ).toFixed(2));

  return {
    total,
    contributions,
    sources: {
      tasks: modernTasks === null ? "legacy" : "assignments",
      exams: modernExams === null ? "legacy" : "assignments",
      participation: "legacy",
      attendance: "legacy"
    }
  };
}
