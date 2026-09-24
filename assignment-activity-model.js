export const SYSTEM_CATEGORIES = Object.freeze([
  { key: "EXAM", label: "Exams" },
  { key: "TASK", label: "Tasks / Work" },
  { key: "PARTICIPATION", label: "Participation" },
  { key: "ATTENDANCE", label: "Attendance" },
  { key: "OTHER", label: "Other" }
]);

const ACTIVITIES = Object.freeze({
  GENERIC_EXAM: { key: "GENERIC_EXAM", label: "Exam", systemCategory: "EXAM", legacyCode: "EX", gradingScheme: "ANSWER_KEY", gradingWorkflow: "HYBRID" },
  WRITTEN_EXAM: { key: "WRITTEN_EXAM", label: "Written Exam", systemCategory: "EXAM", legacyCode: "EX", gradingScheme: "ANSWER_KEY", gradingWorkflow: "HYBRID" },
  ORAL_EXAM: { key: "ORAL_EXAM", label: "Oral Exam", systemCategory: "EXAM", legacyCode: "EX", gradingScheme: "ORAL_RUBRIC", gradingWorkflow: "HYBRID" },
  VERBS_EXAM: { key: "VERBS_EXAM", label: "Verbs Exam", systemCategory: "EXAM", legacyCode: "EX", gradingScheme: "ANSWER_KEY", gradingWorkflow: "HYBRID" },
  ONLINE_EXAM: { key: "ONLINE_EXAM", label: "Online Exam", systemCategory: "EXAM", legacyCode: "EX", gradingScheme: "ANSWER_KEY", gradingWorkflow: "AUTOMATIC" },

  CLASSWORK: { key: "CLASSWORK", label: "Classwork", systemCategory: "TASK", legacyCode: "CT", gradingScheme: "RUBRIC", gradingWorkflow: "AI_ASSISTED" },
  HOMEWORK: { key: "HOMEWORK", label: "Homework", systemCategory: "TASK", legacyCode: "HW", gradingScheme: "RUBRIC", gradingWorkflow: "AI_ASSISTED" },
  PROJECT: { key: "PROJECT", label: "Project", systemCategory: "TASK", legacyCode: "PJ", gradingScheme: "RUBRIC", gradingWorkflow: "HYBRID" },
  PRACTICE: { key: "PRACTICE", label: "Practice / Lab", systemCategory: "TASK", legacyCode: "PC", gradingScheme: "CHECKLIST", gradingWorkflow: "MANUAL" },
  RESEARCH: { key: "RESEARCH", label: "Research", systemCategory: "TASK", legacyCode: "RS", gradingScheme: "RUBRIC", gradingWorkflow: "AI_ASSISTED" },
  PRESENTATION: { key: "PRESENTATION", label: "Presentation", systemCategory: "TASK", legacyCode: "PT", gradingScheme: "RUBRIC", gradingWorkflow: "HYBRID" },
  PORTFOLIO: { key: "PORTFOLIO", label: "Portfolio", systemCategory: "TASK", legacyCode: "PF", gradingScheme: "RUBRIC", gradingWorkflow: "HYBRID" },

  CLASSROOM_PARTICIPATION: { key: "CLASSROOM_PARTICIPATION", label: "Classroom Participation", systemCategory: "PARTICIPATION", legacyCode: "CP", gradingScheme: "POINTS", gradingWorkflow: "MANUAL" },
  DISCUSSION: { key: "DISCUSSION", label: "Discussion", systemCategory: "PARTICIPATION", legacyCode: "DS", gradingScheme: "POINTS", gradingWorkflow: "MANUAL" },
  TEAMWORK: { key: "TEAMWORK", label: "Teamwork", systemCategory: "PARTICIPATION", legacyCode: "TW", gradingScheme: "RUBRIC", gradingWorkflow: "MANUAL" },
  COG: { key: "COG", label: "Classroom Online Game", systemCategory: "PARTICIPATION", legacyCode: "COG", gradingScheme: "POINTS", gradingWorkflow: "AUTOMATIC" },

  ATTENDANCE_EVENT: { key: "ATTENDANCE_EVENT", label: "Attendance", systemCategory: "ATTENDANCE", legacyCode: "AT", gradingScheme: "POINTS", gradingWorkflow: "AUTOMATIC" },

  OTHER: { key: "OTHER", label: "Other", systemCategory: "OTHER", legacyCode: "OTHER", gradingScheme: "RUBRIC", gradingWorkflow: "MANUAL" }
});

const LEGACY_TO_ACTIVITY = Object.freeze({
  EX: "GENERIC_EXAM",
  CT: "CLASSWORK",
  HW: "HOMEWORK",
  PJ: "PROJECT",
  PC: "PRACTICE",
  RS: "RESEARCH",
  PT: "PRESENTATION",
  COG: "COG"
});

function cleanKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeSystemCategory(value, fallback = "OTHER") {
  const requested = cleanKey(value);
  return SYSTEM_CATEGORIES.some((category) => category.key === requested)
    ? requested
    : cleanKey(fallback) || "OTHER";
}

export function activityDefinition(activitySubtype = "") {
  return ACTIVITIES[cleanKey(activitySubtype)] || null;
}

export function activityTypesForSystemCategory(systemCategory = "OTHER") {
  const family = normalizeSystemCategory(systemCategory);
  return Object.values(ACTIVITIES).filter((activity) => activity.systemCategory === family);
}

export function activitySubtypeForLegacyCode(code = "") {
  return LEGACY_TO_ACTIVITY[cleanKey(code)] || "OTHER";
}

export function systemCategoryForLegacyTypeCode(code = "") {
  const subtype = activitySubtypeForLegacyCode(code);
  return (activityDefinition(subtype) || ACTIVITIES.OTHER).systemCategory;
}

export function activityMetadataForAssignment(assignment = {}) {
  const explicitSubtype = cleanKey(assignment.activitySubtype);
  const explicitDefinition = activityDefinition(explicitSubtype);

  if (explicitSubtype && !explicitDefinition) {
    const fallbackDefinition = activityDefinition(
      activitySubtypeForLegacyCode(assignment.assignmentTypeCode)
    ) || ACTIVITIES.OTHER;
    return {
      systemCategory: normalizeSystemCategory(assignment.systemCategory, fallbackDefinition.systemCategory),
      activitySubtype: explicitSubtype,
      activitySubtypeLabel: String(
        assignment.activitySubtypeLabel || assignment.assignmentType || "Custom activity"
      ).trim(),
      assignmentTypeCode: cleanKey(assignment.assignmentTypeCode) || fallbackDefinition.legacyCode,
      gradingScheme: cleanKey(assignment.gradingScheme) || fallbackDefinition.gradingScheme,
      gradingWorkflow: cleanKey(assignment.gradingWorkflow) || fallbackDefinition.gradingWorkflow
    };
  }

  const subtype = explicitDefinition
    ? explicitSubtype
    : activitySubtypeForLegacyCode(assignment.assignmentTypeCode);
  const definition = activityDefinition(subtype) || ACTIVITIES.OTHER;

  return {
    systemCategory: normalizeSystemCategory(assignment.systemCategory, definition.systemCategory),
    activitySubtype: definition.key,
    activitySubtypeLabel: String(assignment.activitySubtypeLabel || assignment.assignmentType || definition.label).trim(),
    assignmentTypeCode: cleanKey(assignment.assignmentTypeCode) || definition.legacyCode,
    gradingScheme: cleanKey(assignment.gradingScheme) || definition.gradingScheme,
    gradingWorkflow: cleanKey(assignment.gradingWorkflow) || definition.gradingWorkflow
  };
}

export function defaultGradingForActivity(activitySubtype = "") {
  const definition = activityDefinition(activitySubtype) || ACTIVITIES.OTHER;
  return {
    gradingScheme: definition.gradingScheme,
    gradingWorkflow: definition.gradingWorkflow
  };
}
