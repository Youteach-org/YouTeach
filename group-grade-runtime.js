import { calculateBlockGrade } from "./group-evaluation-model.js";

function normalizedRecipientKeys(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.values(raw).map(String);
  return [];
}

function assignmentAppliesToStudent(assignment, studentKey, student) {
  if (!assignment || !student) return false;

  const assignmentGroup = String(assignment.groupName || "");
  if (assignmentGroup && assignmentGroup !== "ALL" && assignmentGroup !== String(student.groupName || "")) {
    return false;
  }

  const exactRecipients = normalizedRecipientKeys(assignment.recipientStudentKeys);
  if (exactRecipients.length && !exactRecipients.includes(String(studentKey))) return false;
  return true;
}

function assignmentBlock(assignment) {
  return String(assignment?.evaluationBlock || assignment?.block || "").trim();
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
    const criterionId = String(assignment.groupEvaluationCriterionId || "");

    if (criterionId === criterion.id) {
      tagged.push(normalizedScore);
      return;
    }

    if (!criterionId && criterion.source === "tasks") {
      const typeCode = String(assignment.assignmentTypeCode || "").trim().toUpperCase();
      if (typeCode !== "EX") untaggedTaskFallback.push(normalizedScore);
    }
  });

  if (tagged.length) return tagged;

  const taskCriteria = (config?.criteria || []).filter((item) => item.source === "tasks");
  if (criterion.source === "tasks" && taskCriteria.length === 1) return untaggedTaskFallback;

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
    const scores = assignmentScoresForCriterion({
      studentKey,
      student,
      blockName,
      criterion,
      config,
      assignments,
      submissions
    });
    const score = average(scores);
    if (score !== null) return { value: score, mode: "score" };

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
