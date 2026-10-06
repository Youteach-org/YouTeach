import { evaluationBlockNames, groupEvaluationConfig } from "./group-evaluation-model.js";
import { systemCategoryForLegacyTypeCode } from "./assignment-activity-model.js";

const TYPE_HINTS = Object.freeze({
  CT: ["classroom", "class", "activity", "task", "trabajo", "actividad", "tarea"],
  HW: ["homework", "task", "tarea"],
  PJ: ["project", "proyecto"],
  PC: ["practice", "practica", "práctica", "laboratory", "lab", "laboratorio"],
  RS: ["research", "investigacion", "investigación", "investigation"],
  PT: ["presentation", "presentacion", "presentación", "exposition", "exposición"],
  COG: ["participation", "activity", "game", "participacion", "participación", "actividad"],
  EX: ["exam", "test", "oral", "verb", "examen", "evaluacion", "evaluación"]
});

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function assignmentTypeCode(assignment = {}) {
  return String(assignment?.assignmentTypeCode || "")
    .trim()
    .toUpperCase();
}

export function isExamAssignment(assignment = {}) {
  const code = assignmentTypeCode(assignment);
  return code === "EX" || String(assignment?.code || "").trim().toUpperCase().startsWith("EX-");
}

export function evaluationTargetForAssignment(assignment = {}, groupName = "") {
  const requestedGroup = String(groupName || assignment?.groupName || "").trim();
  const perGroup = assignment?.evaluationTargets?.[requestedGroup];
  const target = perGroup && typeof perGroup === "object"
    ? perGroup
    : (assignment?.evaluationTarget && typeof assignment.evaluationTarget === "object"
      ? assignment.evaluationTarget
      : null);

  if (target) {
    return {
      groupName: String(target.groupName || requestedGroup || ""),
      block: String(target.block || target.evaluationBlock || "").trim(),
      criterionId: String(target.criterionId || target.groupEvaluationCriterionId || "").trim(),
      criterionNameSnapshot: String(
        target.criterionNameSnapshot || target.groupEvaluationCriterionName || ""
      ).trim(),
      systemCategory: String(target.systemCategory || assignment?.systemCategory || "").trim(),
      mode: String(target.mode || (isExamAssignment(assignment) ? "exam" : "assignment"))
    };
  }

  return {
    groupName: requestedGroup,
    block: String(assignment?.evaluationBlock || assignment?.block || "").trim(),
    criterionId: String(assignment?.groupEvaluationCriterionId || "").trim(),
    criterionNameSnapshot: String(assignment?.groupEvaluationCriterionName || "").trim(),
    systemCategory: String(assignment?.systemCategory || "").trim(),
    mode: isExamAssignment(assignment) ? "exam" : "assignment"
  };
}

export function validBlockForGroup(group = {}, preferred = "") {
  const blocks = evaluationBlockNames(group || {});
  const requested = String(preferred || "").trim();
  if (blocks.includes(requested)) return requested;
  return blocks[0] || "Block 1";
}

function explicitDefaultCriterion(group = {}, typeCode = "", criteria = []) {
  const configuredId = String(group?.assignmentCriterionDefaults?.[String(typeCode || "").toUpperCase()] || "");
  return criteria.find((criterion) => criterion.id === configuredId) || null;
}

function uniqueAssignmentSourceCriterion(criteria = []) {
  const candidates = criteria.filter((criterion) =>
    criterion.source === "assignments" || criterion.source === "tasks"
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function uniqueSystemCategoryCriterion(criteria = [], typeCode = "") {
  const family = systemCategoryForLegacyTypeCode(typeCode);
  const candidates = criteria.filter((criterion) => criterion.systemCategory === family);
  return candidates.length === 1 ? candidates[0] : null;
}

function uniqueNameHintCriterion(criteria = [], typeCode = "") {
  const hints = TYPE_HINTS[String(typeCode || "").toUpperCase()] || [];
  if (!hints.length) return null;

  const matches = criteria.filter((criterion) => {
    const name = normalizeText(criterion.name);
    return hints.some((hint) => name.includes(normalizeText(hint)));
  });
  return matches.length === 1 ? matches[0] : null;
}

export function resolveAssignmentCriterion(group = {}, typeCode = "") {
  const config = groupEvaluationConfig(group || {});
  if (!config.configured || !config.criteria.length) return null;

  const explicit = explicitDefaultCriterion(group, typeCode, config.criteria);
  if (explicit) return explicit;

  const familyMatch = uniqueSystemCategoryCriterion(config.criteria, typeCode);
  if (familyMatch) return familyMatch;

  if (String(typeCode || "").toUpperCase() !== "EX") {
    const sourceMatch = uniqueAssignmentSourceCriterion(config.criteria);
    if (sourceMatch) return sourceMatch;
  }

  const nameMatch = uniqueNameHintCriterion(config.criteria, typeCode);
  if (nameMatch) return nameMatch;

  return config.criteria.length === 1 ? config.criteria[0] : null;
}

export function buildAssignmentEvaluationTarget({
  groupName = "",
  block = "",
  criterion = null,
  assignment = {}
} = {}) {
  const exam = isExamAssignment(assignment);
  return {
    groupName: String(groupName || "").trim(),
    block: String(block || "").trim(),
    criterionId: String(criterion?.id || "").trim(),
    criterionNameSnapshot: String(criterion?.name || "").trim(),
    systemCategory: String(criterion?.systemCategory || "").trim(),
    mode: exam ? "exam" : "assignment"
  };
}

export function hasAiGradedSubmission(submissions = {}) {
  return Object.values(submissions || {}).some((submission) => {
    const rawScore = submission?.grading?.totalScore;
    const score = rawScore === null || rawScore === undefined || rawScore === "" ? NaN : Number(rawScore);
    if (!Number.isFinite(score)) return false;
    const gradedBy = normalizeText(submission?.grading?.gradedBy);
    return gradedBy === "chatgpt" || Boolean(submission?.aiGradingSyncedAt);
  });
}

export function legacyAssignmentMigrationTarget({
  assignment = {},
  group = {},
  groupName = "",
  submissions = {}
} = {}) {
  const resolvedGroupName = String(groupName || assignment?.groupName || "").trim();
  if (!resolvedGroupName || resolvedGroupName === "ALL") return null;

  const current = evaluationTargetForAssignment(assignment, resolvedGroupName);
  const block = validBlockForGroup(group, current.block || assignment?.evaluationBlock || "Block 1");

  if (isExamAssignment(assignment)) {
    if (!hasAiGradedSubmission(submissions)) return null;
    return buildAssignmentEvaluationTarget({
      groupName: resolvedGroupName,
      block,
      assignment
    });
  }

  const config = groupEvaluationConfig(group || {});
  const existingCriterion =
    config.criteria.find((criterion) => criterion.id === current.criterionId) || null;

  const legacyCriterionName = normalizeText(
    current.criterionNameSnapshot ||
    assignment?.groupEvaluationCriterionName ||
    ""
  );
  const sameNameCriteria = legacyCriterionName
    ? config.criteria.filter((criterion) => normalizeText(criterion.name) === legacyCriterionName)
    : [];
  const exactLegacyNameCriterion = sameNameCriteria.length === 1 ? sameNameCriteria[0] : null;

  if (existingCriterion || exactLegacyNameCriterion) {
    const criterion = existingCriterion || exactLegacyNameCriterion;
    return {
      ...buildAssignmentEvaluationTarget({
        groupName: resolvedGroupName,
        block,
        criterion,
        assignment
      }),
      needsReview: false
    };
  }

  if (!hasAiGradedSubmission(submissions)) return null;

  const criterion = resolveAssignmentCriterion(group, assignmentTypeCode(assignment));

  return {
    ...buildAssignmentEvaluationTarget({
      groupName: resolvedGroupName,
      block,
      criterion,
      assignment
    }),
    needsReview: !criterion
  };
}
