export const EXAM_SCHEMA_VERSION = 1;

export const QUESTION_TYPES = Object.freeze({
  MULTIPLE_CHOICE: "multiple-choice",
  TRUE_FALSE: "true-false",
  MATCHING: "matching",
  OPEN_RESPONSE: "open-response"
});

export function makeExamId(prefix = "item") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${random}`;
}

export function normalizeQuestion(raw = {}) {
  const type = Object.values(QUESTION_TYPES).includes(raw.type)
    ? raw.type
    : QUESTION_TYPES.MULTIPLE_CHOICE;

  const options = Array.isArray(raw.options)
    ? raw.options.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  const matchingPairs = Array.isArray(raw.matchingPairs)
    ? raw.matchingPairs
        .map((pair) => ({
          left: String(pair?.left ?? "").trim(),
          right: String(pair?.right ?? "").trim()
        }))
        .filter((pair) => pair.left || pair.right)
    : [];

  let answerKey = raw.answerKey ?? null;
  if (type === QUESTION_TYPES.MULTIPLE_CHOICE) {
    const index = Number(answerKey);
    answerKey = Number.isInteger(index) && index >= 0 && index < options.length ? index : null;
  } else if (type === QUESTION_TYPES.TRUE_FALSE) {
    if (answerKey === true || answerKey === "true") answerKey = true;
    else if (answerKey === false || answerKey === "false") answerKey = false;
    else answerKey = null;
  } else if (type === QUESTION_TYPES.MATCHING) {
    answerKey = matchingPairs.map((pair) => pair.right);
  } else {
    answerKey = String(answerKey ?? "").trim();
  }

  const pointValue = Number(raw.pointValue ?? 1);

  return {
    schemaVersion: EXAM_SCHEMA_VERSION,
    id: String(raw.id || makeExamId("question")),
    course: String(raw.course || "").trim(),
    unit: String(raw.unit || "").trim(),
    topic: String(raw.topic || "").trim(),
    subtopic: String(raw.subtopic || "").trim(),
    type,
    prompt: String(raw.prompt || "").trim(),
    options,
    matchingPairs,
    answerKey,
    rationale: String(raw.rationale || "").trim(),
    pointValue: Number.isFinite(pointValue) && pointValue > 0 ? Number(pointValue.toFixed(2)) : 1,
    difficulty: String(raw.difficulty || "unspecified"),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : String(raw.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    sourceNotes: String(raw.sourceNotes || "").trim(),
    active: raw.active !== false,
    createdAt: Number(raw.createdAt || Date.now()),
    updatedAt: Number(raw.updatedAt || Date.now())
  };
}

export function validateQuestion(question) {
  const q = normalizeQuestion(question);
  const errors = [];

  if (!q.prompt) errors.push("Question prompt is required.");
  if (q.pointValue <= 0) errors.push("Point value must be greater than zero.");

  if (q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
    if (q.options.length < 2) errors.push("Multiple-choice questions need at least two options.");
    if (q.answerKey === null) errors.push("Multiple-choice questions need a correct option.");
  }

  if (q.type === QUESTION_TYPES.TRUE_FALSE && q.answerKey === null) {
    errors.push("True/false questions need a correct answer.");
  }

  if (q.type === QUESTION_TYPES.MATCHING) {
    if (q.matchingPairs.length < 2) errors.push("Matching questions need at least two pairs.");
    if (q.matchingPairs.some((pair) => !pair.left || !pair.right)) {
      errors.push("Each matching pair needs both sides.");
    }
  }

  return { question: q, errors };
}

export function snapshotQuestion(question) {
  const q = normalizeQuestion(question);
  return {
    bankQuestionId: q.id,
    snapshot: {
      schemaVersion: EXAM_SCHEMA_VERSION,
      type: q.type,
      prompt: q.prompt,
      options: [...q.options],
      matchingPairs: q.matchingPairs.map((pair) => ({ ...pair })),
      answerKey: Array.isArray(q.answerKey) ? [...q.answerKey] : q.answerKey,
      rationale: q.rationale,
      pointValue: q.pointValue,
      course: q.course,
      unit: q.unit,
      topic: q.topic,
      subtopic: q.subtopic,
      difficulty: q.difficulty,
      tags: [...q.tags]
    }
  };
}

export function normalizeSection(raw = {}, index = 0) {
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((item) => ({
        bankQuestionId: String(item?.bankQuestionId || ""),
        snapshot: normalizeQuestion({
          ...(item?.snapshot || {}),
          id: item?.bankQuestionId || item?.snapshot?.id || makeExamId("snapshot")
        })
      }))
    : [];

  return {
    id: String(raw.id || makeExamId("section")),
    title: String(raw.title || `Section ${index + 1}`).trim(),
    instructions: String(raw.instructions || "").trim(),
    questions
  };
}

export function normalizeTemplate(raw = {}) {
  return {
    schemaVersion: EXAM_SCHEMA_VERSION,
    id: String(raw.id || makeExamId("exam-template")),
    title: String(raw.title || "").trim(),
    course: String(raw.course || "").trim(),
    unit: String(raw.unit || "").trim(),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    sections: Array.isArray(raw.sections)
      ? raw.sections.map((section, index) => normalizeSection(section, index))
      : [],
    versionRules: {
      A: "original",
      B: String(raw?.versionRules?.B || "reverse-within-section")
    },
    active: raw.active !== false,
    createdAt: Number(raw.createdAt || Date.now()),
    updatedAt: Number(raw.updatedAt || Date.now()),
    createdBy: String(raw.createdBy || "")
  };
}

export function validateTemplate(template) {
  const exam = normalizeTemplate(template);
  const errors = [];
  if (!exam.title) errors.push("Exam title is required.");
  if (!exam.sections.length) errors.push("Add at least one section.");
  if (!exam.sections.some((section) => section.questions.length)) {
    errors.push("Add at least one question.");
  }
  return { template: exam, errors };
}

function versionedSection(section, rule) {
  const questions = [...section.questions];
  if (rule === "reverse-within-section") questions.reverse();
  return { ...section, questions };
}

export function buildExamVersion(template, version = "A") {
  const exam = normalizeTemplate(template);
  const normalizedVersion = String(version || "A").toUpperCase();
  const rule = normalizedVersion === "A"
    ? "original"
    : String(exam.versionRules?.[normalizedVersion] || exam.versionRules?.B || "reverse-within-section");

  const sections = exam.sections.map((section) => versionedSection(section, rule));
  let questionNumber = 0;

  const numberedSections = sections.map((section) => ({
    ...section,
    questions: section.questions.map((item) => {
      questionNumber += 1;
      return {
        ...item,
        number: questionNumber
      };
    })
  }));

  return {
    schemaVersion: EXAM_SCHEMA_VERSION,
    templateId: exam.id,
    templateTitle: exam.title,
    version: normalizedVersion,
    rule,
    sections: numberedSections,
    totalQuestions: questionNumber,
    totalPoints: Number(
      numberedSections.reduce(
        (sum, section) => sum + section.questions.reduce(
          (sectionSum, item) => sectionSum + Number(item.snapshot.pointValue || 0),
          0
        ),
        0
      ).toFixed(2)
    )
  };
}

export function answerKeyForVersion(template, version = "A") {
  const built = buildExamVersion(template, version);
  return built.sections.flatMap((section) =>
    section.questions.map((item) => ({
      number: item.number,
      sectionId: section.id,
      sectionTitle: section.title,
      bankQuestionId: item.bankQuestionId,
      type: item.snapshot.type,
      answerKey: Array.isArray(item.snapshot.answerKey)
        ? [...item.snapshot.answerKey]
        : item.snapshot.answerKey,
      pointValue: Number(item.snapshot.pointValue || 0)
    }))
  );
}

export function createExamInstance({
  template,
  version = "A",
  groupName = "ALL",
  dueAt = 0,
  title = "",
  createdBy = ""
}) {
  const exam = normalizeTemplate(template);
  const built = buildExamVersion(exam, version);

  return {
    schemaVersion: EXAM_SCHEMA_VERSION,
    id: makeExamId("exam-instance"),
    templateId: exam.id,
    templateSnapshot: exam,
    version: built.version,
    versionSnapshot: built,
    answerKeySnapshot: answerKeyForVersion(exam, built.version),
    title: String(title || exam.title),
    groupName: String(groupName || "ALL"),
    dueAt: Number(dueAt || 0),
    createdAt: Date.now(),
    createdBy: String(createdBy || ""),
    locked: false
  };
}
