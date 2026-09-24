import { normalizeSystemCategory } from "./assignment-activity-model.js";

export const EVALUATION_SOURCE_OPTIONS = Object.freeze([
  { key: "writtenExam", label: "Written exam weighted points (legacy/import)" },
  { key: "oralExam", label: "Oral exam weighted points (legacy/import)" },
  { key: "verbsExam", label: "Verbs exam weighted points (legacy/import)" },
  { key: "tasks", label: "Tasks / homework" },
  { key: "participation", label: "Participation / activity points" },
  { key: "attendance", label: "Attendance points" },
  { key: "assignments", label: "Assignments tagged to this criterion" },
  { key: "manual", label: "Manual / imported criterion score" }
]);

export function normalizeEvaluationUnitCount(value, fallback = 3) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(1, parsed));
}

function normalizeCriterionId(value, index) {
  const raw = String(value || "").trim();
  if (raw) return raw;
  return `criterion-${index + 1}`;
}

function sourceKeys() {
  return new Set(EVALUATION_SOURCE_OPTIONS.map((option) => option.key));
}

export function inferEvaluationSystemCategory(criterion = {}) {
  const explicit = String(criterion?.systemCategory || "").trim().toUpperCase();
  if (explicit) return normalizeSystemCategory(explicit);

  const source = String(criterion?.source || "").trim();
  if (["writtenExam", "oralExam", "verbsExam"].includes(source)) return "EXAM";
  if (source === "tasks") return "TASK";
  if (source === "participation") return "PARTICIPATION";
  if (source === "attendance") return "ATTENDANCE";

  const name = String(criterion?.name || criterion?.title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\b(exams?|tests?|oral|verbs?|quizzes?)\b/.test(name)) return "EXAM";
  if (/\b(attendance|asistencia)\b/.test(name)) return "ATTENDANCE";
  if (/\b(participation|participacion|discussions?|teamwork|games?|cog)\b/.test(name)) return "PARTICIPATION";
  if (/\b(tasks?|homework|projects?|practices?|labs?|research|presentations?|portfolios?|classwork|tareas?|proyectos?|practicas?|investigacion|investigaciones|presentaciones?|trabajos?)\b/.test(name)) return "TASK";

  return "OTHER";
}

export function normalizeEvaluationCriteria(value = []) {
  const raw = Array.isArray(value)
    ? value
    : Object.entries(value || {}).map(([id, criterion]) => ({ id, ...(criterion || {}) }));
  const allowedSources = sourceKeys();

  return raw
    .filter((criterion) => criterion && typeof criterion === "object")
    .map((criterion, index) => {
      const weight = Number(criterion.weight ?? criterion.maxPoints ?? criterion.points ?? 0);
      const source = allowedSources.has(String(criterion.source || ""))
        ? String(criterion.source)
        : "manual";

      return {
        id: normalizeCriterionId(criterion.id, index),
        name: String(criterion.name || criterion.title || "").trim(),
        shortLabel: String(criterion.shortLabel || criterion.abbreviation || "").trim(),
        weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
        source,
        systemCategory: inferEvaluationSystemCategory({ ...criterion, source }),
        order: Number.isFinite(Number(criterion.order)) ? Number(criterion.order) : index
      };
    })
    .filter((criterion) => criterion.name || criterion.weight > 0)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((criterion, index) => ({ ...criterion, order: index }));
}

export function evaluationWeightTotal(criteria = []) {
  return Number(
    normalizeEvaluationCriteria(criteria)
      .reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0)
      .toFixed(2)
  );
}

export function criteriaToFirebaseObject(criteria = []) {
  return Object.fromEntries(
    normalizeEvaluationCriteria(criteria).map((criterion) => [
      criterion.id,
      {
        id: criterion.id,
        name: criterion.name,
        shortLabel: criterion.shortLabel,
        weight: criterion.weight,
        source: criterion.source,
        systemCategory: criterion.systemCategory,
        order: criterion.order
      }
    ])
  );
}

export function groupEvaluationConfig(group = {}) {
  const unitCount = normalizeEvaluationUnitCount(group?.evaluationUnitCount, 3);
  const criteria = normalizeEvaluationCriteria(group?.evaluationCriteria || []);
  const total = evaluationWeightTotal(criteria);
  const explicitlyConfigured = criteria.length > 0;
  const legacyFixedWeightsPresent =
    !explicitlyConfigured &&
    group?.evaluationWeights &&
    typeof group.evaluationWeights === "object";

  return {
    unitCount,
    criteria,
    total,
    configured: Boolean(explicitlyConfigured && Math.abs(total - 100) < 0.01),
    legacyFixedWeightsPresent: Boolean(legacyFixedWeightsPresent)
  };
}

export function evaluationBlockNames(group = {}) {
  const { unitCount } = groupEvaluationConfig(group);
  return Array.from({ length: unitCount }, (_, index) => `Block ${index + 1}`);
}

export function validEvaluationBlockForGroup(group = {}, preferred = "") {
  const blocks = evaluationBlockNames(group);
  const requested = String(preferred || "").trim();
  if (blocks.includes(requested)) return requested;
  return blocks[0] || "Block 1";
}

export function activeEvaluationBlockForGroup(group = {}, legacySettings = {}) {
  const blocks = evaluationBlockNames(group);
  const stored = String(group?.activeEvaluationBlock || "").trim();
  if (blocks.includes(stored)) return stored;

  const legacy = String(legacySettings?.activeBlock || "").trim();
  if (blocks.includes(legacy)) return legacy;

  return blocks[0] || "Block 1";
}

export function averageScores(values = []) {
  const valid = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.min(100, Math.max(0, value)));

  if (!valid.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

export function calculateCriterionContribution(criterion, input = null) {
  const weight = Math.max(0, Number(criterion?.weight || 0));
  if (!input || input.value === null || input.value === undefined || input.value === "") {
    return { contribution: 0, score: null, sourceMode: "missing" };
  }

  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    return { contribution: 0, score: null, sourceMode: "missing" };
  }

  if (input.mode === "contribution") {
    const contribution = Number(Math.min(weight, Math.max(0, value)).toFixed(2));
    const score = weight > 0 ? Number(((contribution / weight) * 100).toFixed(2)) : 0;
    return { contribution, score, sourceMode: "contribution" };
  }

  const score = Math.min(100, Math.max(0, value));
  const contribution = Number(((score / 100) * weight).toFixed(2));
  return { contribution, score, sourceMode: "score" };
}

export function calculateBlockGrade({ criteria = [], valuesByCriterion = {} } = {}) {
  const normalizedCriteria = normalizeEvaluationCriteria(criteria);
  const details = normalizedCriteria.map((criterion) => {
    const calculated = calculateCriterionContribution(
      criterion,
      valuesByCriterion?.[criterion.id] || null
    );
    return {
      ...criterion,
      ...calculated
    };
  });

  const total = Number(
    Math.min(100, details.reduce((sum, criterion) => sum + criterion.contribution, 0)).toFixed(2)
  );

  return {
    total,
    criteria: details,
    configuredWeightTotal: evaluationWeightTotal(normalizedCriteria)
  };
}
