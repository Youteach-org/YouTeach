import { calculateBlockGrade } from "./group-evaluation-model.js";
import { studentInGroup } from "./student-groups.js";
import { evaluationTargetForAssignment } from "./assignment-evaluation-target.js";

function normalizedRecipientKeys(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.values(raw).map(String);
  return [];
}

function assignmentAppliesToStudent(assignment, studentKey, student) {
  if (!assignment || !student) return false;

  const assignmentGroup = String(assignment.groupName || "");
  if (assignmentGroup && assignmentGroup !== "ALL" && !studentInGroup(student, assignmentGroup)) {
    return false;
  }

  const exactRecipients = normalizedRecipientKeys(assignment.recipientStudentKeys);
  if (exactRecipients.length && !exactRecipients.includes(String(studentKey))) return false;
  return true;
}

function assignmentTarget(assignment) {
  const groupName = String(assignment?.groupName || "").trim();
  return evaluationTargetForAssignment(assignment, groupName);
}

function assignmentBlock(assignment) {
  return String(assignmentTarget(assignment).block || "").trim();
}

function normalizeCriterionText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function assignmentTypeCodeForRuntime(assignment = {}) {
  const explicit = String(assignment?.assignmentTypeCode || "").trim().toUpperCase();
  if (explicit) return explicit;
  return String(assignment?.code || "")
    .trim()
    .toUpperCase()
    .split("-")
    .filter(Boolean)[0] || "";
}

function isTaskCriterion(criterion = {}) {
  if (criterion?.source === "tasks") return true;
  const name = normalizeCriterionText(criterion?.name);
  const shortLabel = normalizeCriterionText(criterion?.shortLabel);
  return (
    ["task", "tasks", "tarea", "tareas", "homework"].includes(name) ||
    ["t", "task", "tasks"].includes(shortLabel)
  );
}

function isProjectCriterion(criterion = {}) {
  const name = normalizeCriterionText(criterion?.name);
  const shortLabel = normalizeCriterionText(criterion?.shortLabel);
  return (
    name.includes("project") ||
    name.includes("proyecto") ||
    ["pj", "proj"].includes(shortLabel)
  );
}

export function taskCriterionForConfig(config = {}) {
  const criteria = Array.isArray(config?.criteria) ? config.criteria : [];
  const sourceTasks = criteria.filter((criterion) => criterion?.source === "tasks");
  if (sourceTasks.length === 1) return sourceTasks[0];

  const semanticTasks = criteria.filter(isTaskCriterion);
  return semanticTasks.length === 1 ? semanticTasks[0] : null;
}

function assignmentHasSeparateProjectCriterion(assignment, config, taskCriterion) {
  if (assignmentTypeCodeForRuntime(assignment) !== "PJ") return false;
  return (config?.criteria || []).some((criterion) =>
    criterion?.id !== taskCriterion?.id && isProjectCriterion(criterion)
  );
}

function taskAssignmentsForCriterion({
  studentKey,
  student,
  blockName,
  criterion,
  config,
  assignments
}) {
  const tagged = [];
  const untaggedFallback = [];

  Object.entries(assignments || {}).forEach(([assignmentId, assignment]) => {
    if (!assignmentAppliesToStudent(assignment, studentKey, student)) return;
    if (assignmentBlock(assignment) !== blockName) return;

    const target = assignmentTarget(assignment);
    const criterionId = String(
      target.criterionId || assignment.groupEvaluationCriterionId || ""
    );

    if (criterionId === criterion.id) {
      tagged.push([assignmentId, assignment]);
      return;
    }

    if (!criterionId) {
      const typeCode = assignmentTypeCodeForRuntime(assignment);
      if (typeCode === "EX") return;
      if (assignmentHasSeparateProjectCriterion(assignment, config, criterion)) return;
      untaggedFallback.push([assignmentId, assignment]);
    }
  });

  const configuredTaskCriterion = taskCriterionForConfig(config);
  if (configuredTaskCriterion?.id === criterion?.id) {
    return [...tagged, ...untaggedFallback];
  }

  return tagged;
}

export function taskCriterionContribution({
  studentKey,
  student,
  blockName,
  criterion,
  config,
  assignments = {},
  submissions = {},
  requirePublished = false
}) {
  if (!isTaskCriterion(criterion)) return null;

  const taskAssignments = taskAssignmentsForCriterion({
    studentKey,
    student,
    blockName,
    criterion,
    config,
    assignments
  });

  if (!taskAssignments.length) return null;

  const weight = Math.max(0, Number(criterion.weight || 0));
  const share = taskAssignments.length ? weight / taskAssignments.length : 0;
  let contribution = 0;
  let gradedCount = 0;

  taskAssignments.forEach(([assignmentId]) => {
    const submission = submissions?.[assignmentId]?.[studentKey] || null;
    if (!submission) return;
    if (requirePublished && submission.gradePublished !== true) return;

    const raw = submission?.grading?.totalScore;
    if (raw === null || raw === undefined || raw === "") return;

    const score = Number(raw);
    if (!Number.isFinite(score)) return;

    const normalizedScore = Math.min(100, Math.max(0, score));
    gradedCount += 1;
    contribution += (normalizedScore / 100) * share;
  });

  return {
    contribution: Number(contribution.toFixed(2)),
    assignmentCount: taskAssignments.length,
    gradedCount
  };
}

function assignmentScoresForCriterion({
  studentKey,
  student,
  blockName,
  criterion,
  config,
  assignments,
  submissions
}) {
  const tagged = [];
  const untaggedTaskFallback = [];

  Object.entries(assignments || {}).forEach(([assignmentId, assignment]) => {
    if (!assignmentAppliesToStudent(assignment, studentKey, student)) return;
    if (assignmentBlock(assignment) !== blockName) return;

    const raw = submissions?.[assignmentId]?.[studentKey]?.grading?.totalScore;
    if (raw === null || raw === undefined || raw === "") return;
    const score = Number(raw);
    if (!Number.isFinite(score)) return;

    const normalizedScore = Math.min(100, Math.max(0, score));
    const criterionId = String(
      assignmentTarget(assignment).criterionId || assignment.groupEvaluationCriterionId || ""
    );

    if (criterionId === criterion.id) {
      tagged.push(normalizedScore);
      return;
    }

    if (!criterionId && isTaskCriterion(criterion)) {
      const typeCode = assignmentTypeCodeForRuntime(assignment);
      if (typeCode === "EX") return;
      if (assignmentHasSeparateProjectCriterion(assignment, config, criterion)) return;
      untaggedTaskFallback.push(normalizedScore);
    }
  });

  if (tagged.length) return tagged;

  const configuredTaskCriterion = taskCriterionForConfig(config);
  if (configuredTaskCriterion?.id === criterion?.id) return untaggedTaskFallback;

  return [];
}

function average(values) {
  const valid = (values || []).map(Number).filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function criterionValue({
  studentKey,
  student,
  blockName,
  criterion,
  config,
  assignments = {},
  submissions = {}
}) {
  const exam = student?.examPoints?.[blockName] || {};

  if (isTaskCriterion(criterion)) {
    const taskResult = taskCriterionContribution({
      studentKey,
      student,
      blockName,
      criterion,
      config,
      assignments,
      submissions
    });
    if (taskResult) {
      return { value: taskResult.contribution, mode: "contribution" };
    }

    if (student?.taskPoints?.[blockName] !== undefined) {
      return { value: Number(student.taskPoints[blockName] || 0), mode: "contribution" };
    }
  }

  // Explicit assignment-to-criterion links are universal. A teacher should not
  // have to expose or understand an internal "source" selector just to make a
  // custom criterion receive grades from assignments.
  const linkedScores = assignmentScoresForCriterion({
    studentKey,
    student,
    blockName,
    criterion,
    config,
    assignments,
    submissions
  });
  const linkedScore = average(linkedScores);
  if (linkedScore !== null) return { value: linkedScore, mode: "score" };

  if (criterion.source === "writtenExam") {
    return { value: Number(exam.written || 0), mode: "contribution" };
  }
  if (criterion.source === "oralExam") {
    return { value: Number(exam.oral || 0), mode: "contribution" };
  }
  if (criterion.source === "verbsExam") {
    return { value: Number(exam.verbs || 0), mode: "contribution" };
  }
  if (criterion.source === "participation") {
    return { value: Number(student?.blockPoints?.[blockName] || 0), mode: "contribution" };
  }
  if (criterion.source === "attendance") {
    return { value: Number(student?.attendancePoints?.[blockName] || 0), mode: "contribution" };
  }

  if (criterion.source === "tasks" || criterion.source === "assignments") {
    if (criterion.source === "tasks") {
      return { value: Number(student?.taskPoints?.[blockName] || 0), mode: "contribution" };
    }
    return null;
  }

  const manualScore = student?.evaluationCriterionScores?.[blockName]?.[criterion.id];
  if (manualScore === null || manualScore === undefined || manualScore === "") return null;
  return { value: Number(manualScore), mode: "score" };
}

export function calculateStudentBlockGrade({
  studentKey,
  student,
  blockName,
  config,
  assignments = {},
  submissions = {}
}) {
  const valuesByCriterion = Object.fromEntries(
    (config?.criteria || []).map((criterion) => [
      criterion.id,
      criterionValue({
        studentKey,
        student,
        blockName,
        criterion,
        config,
        assignments,
        submissions
      })
    ])
  );

  return calculateBlockGrade({
    criteria: config?.criteria || [],
    valuesByCriterion
  });
}
