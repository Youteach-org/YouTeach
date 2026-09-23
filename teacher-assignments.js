import { db } from "./firebase.js";
import { visibleGroups } from "./group-state.js";
import { studentGroupNames, studentInGroup } from "./student-groups.js";
import { ref, get, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { openAssignmentsModule, readAssignmentsModuleContext } from "./assignment-module-launcher.js?v=unsaved-close-20260922";
import {
  buildAssignmentTemplateRecord,
  buildAssignedInstanceFromTemplate,
  filterAssignmentTemplates,
  buildAssignmentTemplateArchivePatch
} from "./assignment-library-model.js";
import {
  assignmentTypeCode as evaluationAssignmentTypeCode,
  evaluationTargetForAssignment,
  legacyAssignmentMigrationTarget
} from "./assignment-evaluation-target.js";
import {
  assignmentMatchesGroupEvidence,
  buildRecoveredAssignmentFromSubmissions,
  submissionGroupNames
} from "./assignment-recovery.js";
import {
  cogGameName,
  cogMetricEntries,
  cogResultHistoryForStudent,
  cogResultStudentCount,
  studentHasCogResult
} from "./cog-assignment-results.mjs";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const RUBRIC_MARKER = "\n\n[[YOUTEACH_RUBRIC_V1:";
const RUBRIC_END = "]]";

const PRESET_CRITERIA = [
  {
    key: "originality",
    title: "Originality",
    description: "The work shows the student's own development and is not merely copied or mechanically reproduced.",
    defaultPoints: 0
  },
  {
    key: "neatness",
    title: "Neatness",
    description: "The submission is clean, careful, orderly, and visually well presented.",
    defaultPoints: 0
  },
  {
    key: "analysis",
    title: "Analysis",
    description: "The student interprets, relates, explains, or evaluates the information rather than only reproducing it.",
    defaultPoints: 0
  },
  {
    key: "conclusions",
    title: "Conclusions",
    description: "The work includes clear conclusions that are consistent with the development and evidence presented.",
    defaultPoints: 0
  },
  {
    key: "completeness",
    title: "Complete work",
    description: "All requested sections, questions, steps, or components are included.",
    defaultPoints: 0
  },
  {
    key: "labeled-visuals",
    title: "Correctly labeled diagrams, tables, or drawings",
    description: "Required diagrams, tables, figures, or drawings are correctly identified and labeled.",
    defaultPoints: 0
  },
  {
    key: "required-format",
    title: "Compliance with requested format",
    description: "The submission follows the requested structure, presentation, and formatting requirements.",
    defaultPoints: 0
  }
];

const assignmentCode = document.getElementById("assignmentCode");
const assignmentType = document.getElementById("assignmentType");
const assignmentOtherTypeField = document.getElementById("assignmentOtherTypeField");
const assignmentOtherType = document.getElementById("assignmentOtherType");
const taskCodeStatus = document.getElementById("taskCodeStatus");
const assignmentTitle = document.getElementById("assignmentTitle");
const assignmentGroup = document.getElementById("assignmentGroup");
const assignmentTargetField = document.getElementById("assignmentTargetField");
const assignmentTargetSelect = document.getElementById("assignmentTargetSelect");
const assignmentTargetHelp = document.getElementById("assignmentTargetHelp");
const assignmentGroupHelp = document.getElementById("assignmentGroupHelp");
const assignmentInstructions = document.getElementById("assignmentInstructions");
const assignmentDueAt = document.getElementById("assignmentDueAt");
const createPresetCriteria = document.getElementById("createPresetCriteria");
const createCriteriaRows = document.getElementById("createCriteriaRows");
const createCriteriaTotal = document.getElementById("createCriteriaTotal");
const createDistributionRadios = document.querySelectorAll('input[name="createDistribution"]');
const addCreateCriterionBtn = document.getElementById("addCreateCriterionBtn");
const assignmentEvaluationNotes = document.getElementById("assignmentEvaluationNotes");
const assignmentTemplateSource = document.getElementById("assignmentTemplateSource");
const loadAssignmentTemplateBtn = document.getElementById("loadAssignmentTemplateBtn");
const saveSelectedTemplateBtn = document.getElementById("saveSelectedTemplateBtn");
const assignmentTemplateStatus = document.getElementById("assignmentTemplateStatus");
const assignmentLibraryPanel = document.getElementById("assignmentLibraryPanel");
const assignmentLibrarySearch = document.getElementById("assignmentLibrarySearch");
const assignmentLibraryTypeFilter = document.getElementById("assignmentLibraryTypeFilter");
const assignmentLibraryCourseFilter = document.getElementById("assignmentLibraryCourseFilter");
const assignmentLibrarySubjectFilter = document.getElementById("assignmentLibrarySubjectFilter");
const assignmentLibraryUnitFilter = document.getElementById("assignmentLibraryUnitFilter");
const assignmentLibraryTopicFilter = document.getElementById("assignmentLibraryTopicFilter");
const assignmentLibraryTagFilter = document.getElementById("assignmentLibraryTagFilter");
const assignmentLibraryUsageFilter = document.getElementById("assignmentLibraryUsageFilter");
const assignmentLibraryStatusFilter = document.getElementById("assignmentLibraryStatusFilter");
const clearAssignmentLibraryFiltersBtn = document.getElementById("clearAssignmentLibraryFiltersBtn");
const assignmentLibraryList = document.getElementById("assignmentLibraryList");
const assignmentLibraryCount = document.getElementById("assignmentLibraryCount");
const assignmentLibraryStatus = document.getElementById("assignmentLibraryStatus");
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
const createAssignmentStatus = document.getElementById("createAssignmentStatus");
const createAssignmentPanel = document.getElementById("createAssignmentPanel");
const assignmentActionsMenu = document.getElementById("assignmentActionsMenu");
const teacherAssignmentList = document.getElementById("teacherAssignmentList");
const assignmentBrowserCount = document.getElementById("assignmentBrowserCount");
const assignmentFilterCode = document.getElementById("assignmentFilterCode");
const assignmentFilterDate = document.getElementById("assignmentFilterDate");
const assignmentFilterBlock = document.getElementById("assignmentFilterBlock");
const assignmentFilterCriterion = document.getElementById("assignmentFilterCriterion");
const clearAssignmentFiltersBtn = document.getElementById("clearAssignmentFiltersBtn");
const assignmentScrollLeftBtn = document.getElementById("assignmentScrollLeftBtn");
const assignmentScrollRightBtn = document.getElementById("assignmentScrollRightBtn");
const assignmentDetailEmpty = document.getElementById("assignmentDetailEmpty");
const assignmentDetail = document.getElementById("assignmentDetail");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const eligibleCount = document.getElementById("eligibleCount");
const submittedCount = document.getElementById("submittedCount");
const missingCount = document.getElementById("missingCount");
const eligibleCountLabel = document.getElementById("eligibleCountLabel");
const submittedCountLabel = document.getElementById("submittedCountLabel");
const missingCountLabel = document.getElementById("missingCountLabel");
const submissionList = document.getElementById("submissionList");
const cogResultsPanel = document.getElementById("cogResultsPanel");
const cogResultsList = document.getElementById("cogResultsList");
const missingList = document.getElementById("missingList");
const missingSummary = document.getElementById("missingSummary");
const openDriveFolderBtn = document.getElementById("openDriveFolderBtn");
const toggleAssignmentBtn = document.getElementById("toggleAssignmentBtn");
const driveStatus = document.getElementById("driveStatus");
const criteriaReadOnly = document.getElementById("criteriaReadOnly");
const editCriteriaBtn = document.getElementById("editCriteriaBtn");
const criteriaEditPanel = document.getElementById("criteriaEditPanel");
const editPresetCriteria = document.getElementById("editPresetCriteria");
const editCriteriaRows = document.getElementById("editCriteriaRows");
const editCriteriaTotal = document.getElementById("editCriteriaTotal");
const editDistributionRadios = document.querySelectorAll('input[name="editDistribution"]');
const editEvaluationNotes = document.getElementById("editEvaluationNotes");
const addEditCriterionBtn = document.getElementById("addEditCriterionBtn");
const saveCriteriaBtn = document.getElementById("saveCriteriaBtn");
const cancelCriteriaBtn = document.getElementById("cancelCriteriaBtn");
const criteriaSaveStatus = document.getElementById("criteriaSaveStatus");
const projectCheckpointBuilder = document.getElementById("projectCheckpointBuilder");
const projectCheckpointRows = document.getElementById("projectCheckpointRows");
const addProjectCheckpointBtn = document.getElementById("addProjectCheckpointBtn");
const projectProgressPanel = document.getElementById("projectProgressPanel");
const projectProgressTimeline = document.getElementById("projectProgressTimeline");
const examAnnotationPanel = document.getElementById("examAnnotationPanel");
const examAnnotationTitle = document.getElementById("examAnnotationTitle");
const examPrevPageBtn = document.getElementById("examPrevPageBtn");
const examNextPageBtn = document.getElementById("examNextPageBtn");
const examPageLabel = document.getElementById("examPageLabel");
const examQuestionNumber = document.getElementById("examQuestionNumber");
const examQuestionPoints = document.getElementById("examQuestionPoints");
const examQuestionComment = document.getElementById("examQuestionComment");
const examUndoMarkBtn = document.getElementById("examUndoMarkBtn");
const examClearPageBtn = document.getElementById("examClearPageBtn");
const examPdfCanvas = document.getElementById("examPdfCanvas");
const examAnnotationOverlay = document.getElementById("examAnnotationOverlay");
const examAnnotationCount = document.getElementById("examAnnotationCount");
const examAnnotationList = document.getElementById("examAnnotationList");
const examSaveAnnotatedPdfBtn = document.getElementById("examSaveAnnotatedPdfBtn");
const examOpenAnnotatedPdfLink = document.getElementById("examOpenAnnotatedPdfLink");
const examAnnotationStatus = document.getElementById("examAnnotationStatus");
const examToolButtons = document.querySelectorAll("[data-exam-tool]");
const manualGradingPanel = document.getElementById("manualGradingPanel");
const manualGradingTitle = document.getElementById("manualGradingTitle");
const manualGradingList = document.getElementById("manualGradingList");
const detailAiGradingBtn = document.getElementById("detailAiGradingBtn");
const detailManualGradingBtn = document.getElementById("detailManualGradingBtn");
const syncAiGradesBtn = detailAiGradingBtn;
const retryAiSyncBtn = document.getElementById("retryAiSyncBtn");
const aiSyncStatus = document.getElementById("aiSyncStatus");
const logoutBtn = document.getElementById("logoutBtn");
const teacherIdentity = document.getElementById("teacherIdentity");
const openAssignmentsModuleBtn = document.getElementById("openAssignmentsModuleBtn");

let assignmentsCache = {};
let assignmentTemplatesCache = {};
let submissionsCache = {};
let studentsCache = {};
let groupsCache = {};
let projectEvidenceCache = {};
let loadedAssignmentTemplateId = "";
const WORKING_GROUP_KEY = "youteachWorkingGroup";
const ASSIGNMENTS_MODULE_MODE = new URLSearchParams(window.location.search).get("module") === "1";
const assignmentsModuleContext = ASSIGNMENTS_MODULE_MODE ? readAssignmentsModuleContext() : null;

let selectedAssignmentId = "";
let selectedDriveFolderUrl = "";
let selectedManualStudentKey = "";
let assignmentCardClickTimer = null;
let submissionCardClickTimer = null;
const CARD_CLICK_DELAY_MS = 240;
const SUBMISSION_CARD_CLICK_DELAY_MS = CARD_CLICK_DELAY_MS;
let examAnnotationState = {
  assignmentId: "",
  studentKey: "",
  pdfBytes: null,
  pdfDocument: null,
  page: 1,
  pageCount: 0,
  tool: "correct",
  annotations: []
};
const aiAutoSyncTimers = new Map();
const AI_PENDING_RUN_KEY = "youteachAiGradingPendingRunV1";
let lastPassiveAiSyncAt = 0;
let initialAiSyncRequested = false;
let assignmentEvaluationMigrationBusy = false;
let assignmentEvaluationMigrationQueued = false;
let assignmentRecoveryBusy = false;
let assignmentRecoveryQueued = false;

teacherIdentity.textContent = getTeacherName();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  return value ? new Date(value).toLocaleString() : "No due date";
}

function formatCompactDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function slugCode(value, fallback = "ITEM") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || fallback;
}

function dateCode(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function compactInitials(value, max = 3) {
  const words = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, max);

  const initials = words.map((word) => word[0]).join("").slice(0, max);
  return initials || words[0].slice(0, max);
}

function compactTitleCode(value) {
  const words = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 6);
  return words.slice(0, 2).map((word) => word.slice(0, 3)).join("").slice(0, 6);
}

function compactGroupCode(value) {
  const tokens = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  if (!tokens.length) return "";

  if (tokens.length === 1) {
    const token = tokens[0];

    // Keep already-compact alphanumeric/numeric group keys such as E6C or 533.
    if (token.length <= 3 || /\d/.test(token)) return token.slice(0, 6);

    // Reduce a single long word to a compact 3-character group key.
    return token.slice(0, 3);
  }

  const withDigit = tokens.find((token) => /\d/.test(token));
  if (withDigit) return withDigit.slice(0, 6);

  return tokens.map((token) => token[0]).join("").slice(0, 4);
}

function normalizeRecipientKeys(raw) {
  if (Array.isArray(raw)) return raw.map((value) => String(value || "")).filter(Boolean);
  if (raw && typeof raw === "object") {
    return Object.values(raw).map((value) => String(value || "")).filter(Boolean);
  }
  return [];
}

function moduleGeneratedTeams() {
  const rawTeams = Array.isArray(assignmentsModuleContext?.teams)
    ? assignmentsModuleContext.teams
    : [];

  return rawTeams.map((team) => ({
    label: String(team?.label || "").trim(),
    memberKeys: [...new Set(normalizeRecipientKeys(team?.memberKeys))]
  })).filter((team) => team.label && team.memberKeys.length);
}

function hasGeneratedTeamContext() {
  return Boolean(
    ASSIGNMENTS_MODULE_MODE &&
    assignmentsModuleContext?.source === "team-creator" &&
    moduleGeneratedTeams().length
  );
}

function selectedGeneratedTeamTarget() {
  const teams = moduleGeneratedTeams();
  const value = String(assignmentTargetSelect?.value || "all-generated");
  const selectedTeams = value === "all-generated"
    ? teams
    : teams.filter((team) => team.label === value);
  const memberKeys = [...new Set(selectedTeams.flatMap((team) => team.memberKeys))];

  return {
    value,
    label: value === "all-generated" ? "All Generated Teams" : value,
    teamLabels: selectedTeams.map((team) => team.label),
    memberKeys
  };
}

function assignmentTargetMetadata() {
  if (!hasGeneratedTeamContext()) return {};
  const target = selectedGeneratedTeamTarget();
  return {
    recipientMode: "generated-teams",
    recipientStudentKeys: target.memberKeys,
    recipientTeamLabels: target.teamLabels,
    recipientTeamTarget: target.label,
    sourceBuzzerSessionCreatedAt: Number(assignmentsModuleContext?.sessionCreatedAt || 0)
  };
}

function generatedTeamCodePart() {
  if (!hasGeneratedTeamContext()) return "";
  const target = selectedGeneratedTeamTarget();
  if (target.value === "all-generated") return "TMS";
  const number = target.label.match(/\d+/)?.[0];
  return number ? `T${number}` : (compactInitials(target.label, 3) || "TM");
}

function renderAssignmentTargetOptions() {
  if (!assignmentTargetField || !assignmentTargetSelect) return;

  if (!hasGeneratedTeamContext()) {
    assignmentTargetField.hidden = true;
    assignmentGroup.disabled = false;
    return;
  }

  const teams = moduleGeneratedTeams();
  const previous = assignmentTargetSelect.value || "all-generated";
  assignmentTargetField.hidden = false;
  assignmentTargetSelect.innerHTML =
    '<option value="all-generated">All Generated Teams</option>' +
    teams.map((team) => `<option value="${escapeHtml(team.label)}">${escapeHtml(team.label)} · ${team.memberKeys.length} students</option>`).join("");

  assignmentTargetSelect.value = teams.some((team) => team.label === previous)
    ? previous
    : "all-generated";

  const target = selectedGeneratedTeamTarget();
  if (assignmentTargetHelp) {
    assignmentTargetHelp.textContent =
      `${target.label}: ${target.memberKeys.length} student${target.memberKeys.length === 1 ? "" : "s"}. This means the generated teams only, not the whole group.`;
  }
}

function currentCreateWorkingGroup() {
  if (hasGeneratedTeamContext()) {
    return String(assignmentsModuleContext?.groupName || "").trim();
  }

  const workingGroup = getWorkingGroup();
  return workingGroup && workingGroup !== "ALL" ? workingGroup : "";
}

function applyAssignmentGroupContext() {
  const workingGroup = currentCreateWorkingGroup();

  if (workingGroup) {
    assignmentGroup.value = workingGroup;
    assignmentGroup.disabled = true;
    if (assignmentGroupHelp) {
      assignmentGroupHelp.textContent = `Working group: ${workingGroup}. This assignment will use the current group context.`;
    }
    return;
  }

  assignmentGroup.disabled = false;
  if (assignmentGroupHelp) {
    assignmentGroupHelp.textContent = "No working group is active. Choose who should receive this assignment.";
  }
}

function applyAssignmentModuleContext() {
  if (hasGeneratedTeamContext()) {
    const groupName = String(assignmentsModuleContext?.groupName || "").trim();
    if (groupName) {
      sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
      window.dispatchEvent(new CustomEvent("youteach:working-group-changed", { detail: { groupName } }));
    }
  }

  applyAssignmentGroupContext();
  renderAssignmentTargetOptions();

  if (hasGeneratedTeamContext()) {
    createAssignmentPanel.hidden = false;
  }

  refreshAutomaticTaskCode();
}

function selectedAssignmentTypeCode() {
  if (assignmentType.value !== "OTHER") return assignmentType.value;
  return compactInitials(assignmentOtherType.value, 3) || "OT";
}

function selectedAssignmentTypeLabel() {
  if (assignmentType.value === "OTHER") {
    return assignmentOtherType.value.trim() || "Other";
  }
  const option = assignmentType.options[assignmentType.selectedIndex];
  return option?.textContent?.replace(/\s*\([^)]*\)\s*$/, "").trim() || assignmentType.value;
}

function taskCodeBase() {
  const typePart = selectedAssignmentTypeCode();
  const titlePart = compactTitleCode(assignmentTitle.value);
  const groupPart = compactGroupCode(assignmentGroup.value);
  const teamPart = generatedTeamCodePart();
  const datePart = dateCode(assignmentDueAt.value);

  if (!typePart || !titlePart || !groupPart || !datePart) return "";
  return [typePart, titlePart, groupPart, teamPart, datePart].filter(Boolean).join("-");
}

function taskCodeExists(code, excludeAssignmentId = "") {
  const target = String(code || "").trim().toUpperCase();
  return Object.entries(assignmentsCache || {}).some(([id, assignment]) => {
    if (excludeAssignmentId && id === excludeAssignmentId) return false;
    return String(assignment?.code || "").trim().toUpperCase() === target;
  });
}

function refreshAutomaticTaskCode() {
  assignmentOtherTypeField.hidden = assignmentType.value !== "OTHER";
  const base = taskCodeBase();
  assignmentCode.value = base;

  if (!base) {
    taskCodeStatus.textContent = "Complete type, title, group, and due date to generate the code.";
    taskCodeStatus.style.color = "#64748b";
    return;
  }

  if (taskCodeExists(base)) {
    taskCodeStatus.textContent = "This task code already exists. Change the title, group, date, or type.";
    taskCodeStatus.style.color = "#b91c1c";
    return;
  }

  taskCodeStatus.textContent = "Available task code.";
  taskCodeStatus.style.color = "#166534";
}

function encodeRubricMetadata(value) {
  const json = JSON.stringify(value || {});
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeRubricMetadata(value) {
  try {
    const binary = atob(String(value || ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) {
    return {};
  }
}

function splitStoredInstructions(value) {
  const raw = String(value || "");
  const markerIndex = raw.lastIndexOf(RUBRIC_MARKER);
  if (markerIndex < 0) {
    return { visibleInstructions: raw, rubric: {} };
  }

  const encodedStart = markerIndex + RUBRIC_MARKER.length;
  const endIndex = raw.indexOf(RUBRIC_END, encodedStart);
  if (endIndex < 0) {
    return { visibleInstructions: raw, rubric: {} };
  }

  return {
    visibleInstructions: raw.slice(0, markerIndex).trimEnd(),
    rubric: decodeRubricMetadata(raw.slice(encodedStart, endIndex))
  };
}

function buildStoredInstructions(visibleInstructions, rubric) {
  const visible = String(visibleInstructions || "").trim() ||
    "Upload your completed work as one PDF file.";
  return `${visible}${RUBRIC_MARKER}${encodeRubricMetadata(rubric)}${RUBRIC_END}`;
}

function getAssignmentRubric(assignment) {
  const embedded = splitStoredInstructions(assignment?.instructions).rubric || {};
  const directCriteria = normalizeCriteria(assignment?.evaluationCriteria);
  const embeddedCriteria = normalizeCriteria(embedded.criteria);

  return {
    criteria: directCriteria.length ? directCriteria : embeddedCriteria,
    distribution: String(
      assignment?.evaluationDistribution ||
      embedded.distribution ||
      "manual"
    ),
    notes: String(
      assignment?.evaluationNotes ??
      embedded.notes ??
      ""
    )
  };
}

function assignmentTypeCodeFor(assignment) {
  const embedded = splitStoredInstructions(assignment?.instructions).rubric || {};
  return String(
    assignment?.assignmentTypeCode ||
    embedded.assignmentTypeCode ||
    ""
  ).trim().toUpperCase();
}

function isProjectAssignment(assignment) {
  return assignmentTypeCodeFor(assignment) === "PJ";
}

function scheduleAssignmentEvaluationMigration() {
  if (assignmentEvaluationMigrationQueued) return;
  assignmentEvaluationMigrationQueued = true;
  queueMicrotask(async () => {
    assignmentEvaluationMigrationQueued = false;
    await migrateAiGradedAssignmentEvaluationTargets();
  });
}

async function migrateAiGradedAssignmentEvaluationTargets() {
  if (assignmentEvaluationMigrationBusy) return;
  assignmentEvaluationMigrationBusy = true;

  try {
    const updates = {};
    const now = Date.now();

    Object.entries(assignmentsCache || {}).forEach(([assignmentId, assignment]) => {
      const groupName = String(assignment?.groupName || "").trim();
      if (!groupName || groupName === "ALL") return;

      const group = groupsCache?.[groupName];
      if (!group) return;

      const target = legacyAssignmentMigrationTarget({
        assignment,
        group,
        groupName,
        submissions: submissionsCache?.[assignmentId] || {}
      });
      if (!target) return;

      const existingPerGroup = assignment?.evaluationTargets?.[groupName] || null;
      const existingTarget = assignment?.evaluationTarget || null;
      const existingBlock = String(assignment?.evaluationBlock || assignment?.block || "").trim();
      const existingCriterionId = String(assignment?.groupEvaluationCriterionId || "").trim();
      const targetAlreadyStored =
        existingPerGroup &&
        String(existingPerGroup.block || "") === target.block &&
        String(existingPerGroup.criterionId || "") === target.criterionId &&
        existingTarget &&
        String(existingTarget.block || "") === target.block &&
        String(existingTarget.criterionId || "") === target.criterionId;

      const needsLegacyBackfill =
        existingBlock !== target.block ||
        (!isExamAssignment(assignment) && existingCriterionId !== target.criterionId);

      const needsReviewFlag = Boolean(target.needsReview);
      const flagAlreadyCorrect = Boolean(assignment?.evaluationTargetNeedsReview) === needsReviewFlag;

      if (targetAlreadyStored && !needsLegacyBackfill && flagAlreadyCorrect) return;

      const base = `assignments/${assignmentId}`;
      updates[`${base}/evaluationBlock`] = target.block;
      updates[`${base}/evaluationTarget`] = {
        groupName: target.groupName,
        block: target.block,
        criterionId: target.criterionId,
        criterionNameSnapshot: target.criterionNameSnapshot,
        mode: target.mode
      };
      updates[`${base}/evaluationTargets/${groupName}`] = {
        groupName: target.groupName,
        block: target.block,
        criterionId: target.criterionId,
        criterionNameSnapshot: target.criterionNameSnapshot,
        mode: target.mode
      };
      updates[`${base}/evaluationTargetNeedsReview`] = needsReviewFlag || null;
      updates[`${base}/evaluationTargetMigratedAt`] = now;

      if (!isExamAssignment(assignment) && target.criterionId) {
        updates[`${base}/groupEvaluationCriterionId`] = target.criterionId;
        updates[`${base}/groupEvaluationCriterionName`] = target.criterionNameSnapshot;
        const typeCode = evaluationAssignmentTypeCode(assignment);
        if (typeCode && !group?.assignmentCriterionDefaults?.[typeCode]) {
          updates[`groups/${groupName}/assignmentCriterionDefaults/${typeCode}`] = target.criterionId;
        }
      }
    });

    if (Object.keys(updates).length) {
      await update(ref(db), updates);
      console.info("Migrated AI-graded assignments to explicit evaluation targets.");
    }
  } catch (error) {
    console.error("Could not migrate assignment evaluation targets", error);
  } finally {
    assignmentEvaluationMigrationBusy = false;
  }
}

function isExamAssignment(assignment) {
  return assignmentTypeCodeFor(assignment) === "EX" ||
    String(assignment?.code || "").toUpperCase().startsWith("EX-");
}

function normalizeExamAnnotations(submission) {
  return Object.entries(submission?.examAnnotations || {})
    .map(([id, annotation]) => ({
      id,
      type: String(annotation?.type || "note"),
      page: Math.max(1, Number(annotation?.page || 1)),
      x: Math.min(1, Math.max(0, Number(annotation?.x || 0))),
      y: Math.min(1, Math.max(0, Number(annotation?.y || 0))),
      question: String(annotation?.question || ""),
      points: annotation?.points === null || annotation?.points === undefined || annotation?.points === ""
        ? null
        : Number(annotation.points),
      comment: String(annotation?.comment || ""),
      createdAt: Number(annotation?.createdAt || 0),
      createdBy: String(annotation?.createdBy || "")
    }))
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

function examAnnotationsMap() {
  return Object.fromEntries(
    examAnnotationState.annotations.map((annotation) => [annotation.id, {
      type: annotation.type,
      page: annotation.page,
      x: annotation.x,
      y: annotation.y,
      question: annotation.question,
      points: annotation.points,
      comment: annotation.comment,
      createdAt: annotation.createdAt,
      createdBy: annotation.createdBy
    }])
  );
}

function examMarkLabel(annotation) {
  if (annotation.type === "correct") return "✓";
  if (annotation.type === "wrong") return "✗";
  return "Note";
}

function examAnnotationMeta(annotation) {
  const parts = [];
  if (annotation.question) parts.push(`Q${annotation.question}`);
  if (annotation.points !== null && Number.isFinite(Number(annotation.points))) {
    parts.push(`${Number(annotation.points)} pt${Number(annotation.points) === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

function renderExamAnnotationList() {
  examAnnotationCount.textContent = String(examAnnotationState.annotations.length);
  examAnnotationList.innerHTML = examAnnotationState.annotations.length
    ? [...examAnnotationState.annotations].reverse().map((annotation) => `
        <div class="exam-annotation-item">
          <div class="exam-annotation-item-head">
            <strong>Page ${annotation.page} · ${escapeHtml(examMarkLabel(annotation))} ${escapeHtml(examAnnotationMeta(annotation))}</strong>
            <button type="button" data-remove-exam-annotation="${escapeHtml(annotation.id)}">Remove</button>
          </div>
          ${annotation.comment ? `<span>${escapeHtml(annotation.comment)}</span>` : ""}
          <small>${escapeHtml(annotation.createdBy || "Teacher")}</small>
        </div>
      `).join("")
    : '<div class="status-text">No marks yet.</div>';
}

function renderExamAnnotationOverlay() {
  const pageAnnotations = examAnnotationState.annotations.filter(
    (annotation) => Number(annotation.page) === Number(examAnnotationState.page)
  );

  examAnnotationOverlay.innerHTML = pageAnnotations.map((annotation) => {
    const meta = examAnnotationMeta(annotation);
    const detail = [meta, annotation.comment].filter(Boolean).join(" · ");
    return `
      <div
        class="exam-overlay-mark ${escapeHtml(annotation.type)}"
        style="left:${Number(annotation.x * 100).toFixed(3)}%;top:${Number(annotation.y * 100).toFixed(3)}%"
      >
        <strong>${escapeHtml(examMarkLabel(annotation))}</strong>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </div>
    `;
  }).join("");

  renderExamAnnotationList();
}

async function persistExamAnnotations() {
  if (!examAnnotationState.assignmentId || !examAnnotationState.studentKey) return;
  const now = Date.now();
  const totalPoints = examAnnotationState.annotations.reduce((sum, annotation) => {
    const value = Number(annotation.points);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  await update(
    ref(db, `assignmentSubmissions/${examAnnotationState.assignmentId}/${examAnnotationState.studentKey}`),
    {
      examAnnotations: examAnnotationState.annotations.length ? examAnnotationsMap() : null,
      examAnnotationPointsTotal: Number(totalPoints.toFixed(2)),
      examAnnotationsUpdatedAt: now,
      examAnnotationsUpdatedBy: getTeacherName(),
      updatedAt: now
    }
  );
}

function setExamTool(tool) {
  examAnnotationState.tool = ["correct", "wrong", "note"].includes(tool) ? tool : "correct";
  examToolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.examTool === examAnnotationState.tool);
  });
}

async function renderExamPage() {
  if (!examAnnotationState.pdfDocument) return;
  const page = await examAnnotationState.pdfDocument.getPage(examAnnotationState.page);
  const baseViewport = page.getViewport({ scale: 1 });
  const available = Math.max(560, Math.min(940, Number(examAnnotationPanel.clientWidth || 900) - 280));
  const scale = Math.max(0.7, Math.min(1.5, available / baseViewport.width));
  const viewport = page.getViewport({ scale });
  const context = examPdfCanvas.getContext("2d");

  examPdfCanvas.width = Math.ceil(viewport.width);
  examPdfCanvas.height = Math.ceil(viewport.height);
  examPdfCanvas.style.width = `${Math.ceil(viewport.width)}px`;
  examPdfCanvas.style.height = `${Math.ceil(viewport.height)}px`;
  examAnnotationOverlay.style.width = `${Math.ceil(viewport.width)}px`;
  examAnnotationOverlay.style.height = `${Math.ceil(viewport.height)}px`;

  await page.render({ canvasContext: context, viewport }).promise;
  examPageLabel.textContent = `Page ${examAnnotationState.page} / ${examAnnotationState.pageCount}`;
  examPrevPageBtn.disabled = examAnnotationState.page <= 1;
  examNextPageBtn.disabled = examAnnotationState.page >= examAnnotationState.pageCount;
  renderExamAnnotationOverlay();
}

async function openExamAnnotation(studentKey) {
  const assignment = assignmentsCache[selectedAssignmentId];
  const submission = submissionsCache?.[selectedAssignmentId]?.[studentKey];

  if (!assignment || !submission?.driveFileId || !isExamAssignment(assignment)) return;

  if (
    !examAnnotationPanel.hidden &&
    examAnnotationState.assignmentId === selectedAssignmentId &&
    examAnnotationState.studentKey === studentKey
  ) {
    examAnnotationPanel.hidden = true;
    return;
  }

  if (!window.pdfjsLib) {
    examAnnotationStatus.textContent = "PDF viewer library did not load.";
    examAnnotationStatus.className = "status-text bad";
    examAnnotationPanel.hidden = false;
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  manualGradingPanel.hidden = true;
  selectedManualStudentKey = "";
  examAnnotationPanel.hidden = false;
  examAnnotationTitle.textContent = `Exam annotations · ${submission.studentName || "Student"}`;
  examAnnotationStatus.textContent = "Loading submitted PDF...";
  examAnnotationStatus.className = "status-text";
  examSaveAnnotatedPdfBtn.disabled = true;

  examAnnotationState = {
    assignmentId: selectedAssignmentId,
    studentKey,
    pdfBytes: null,
    pdfDocument: null,
    page: 1,
    pageCount: 0,
    tool: "correct",
    annotations: normalizeExamAnnotations(submission)
  };
  setExamTool("correct");
  renderExamAnnotationList();

  examOpenAnnotatedPdfLink.hidden = !submission.examAnnotatedDriveFileUrl;
  examOpenAnnotatedPdfLink.href = submission.examAnnotatedDriveFileUrl || "#";

  try {
    const response = await fetch("/api/exam-pdf-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: selectedAssignmentId,
        studentKey
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not load exam PDF.");
    }

    const bytes = await response.arrayBuffer();
    const pdfData = new Uint8Array(bytes);
    examAnnotationState.pdfBytes = pdfData.slice().buffer;
    const pdfDocument = await window.pdfjsLib.getDocument({
      data: pdfData
    }).promise;
    examAnnotationState.pdfDocument = pdfDocument;
    examAnnotationState.pageCount = pdfDocument.numPages;
    examAnnotationState.page = 1;
    examAnnotationStatus.textContent = "Click the PDF to place the selected mark.";
    examAnnotationStatus.className = "status-text ok";
    examSaveAnnotatedPdfBtn.disabled = false;
    await renderExamPage();
    examAnnotationPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error(error);
    examAnnotationStatus.textContent = error?.message || "Could not load exam PDF.";
    examAnnotationStatus.className = "status-text bad";
  }
}

async function removeExamAnnotation(annotationId) {
  examAnnotationState.annotations = examAnnotationState.annotations.filter(
    (annotation) => annotation.id !== annotationId
  );
  renderExamAnnotationOverlay();
  await persistExamAnnotations();
}

async function addExamAnnotationFromClick(event) {
  if (!examAnnotationState.pdfDocument) return;
  const rect = examAnnotationOverlay.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  const pointsRaw = examQuestionPoints.value.trim();
  const points = pointsRaw === "" ? null : Number(pointsRaw);

  if (points !== null && (!Number.isFinite(points) || points < 0)) {
    examAnnotationStatus.textContent = "Points must be zero or greater.";
    examAnnotationStatus.className = "status-text bad";
    return;
  }

  const now = Date.now();
  examAnnotationState.annotations.push({
    id: `annotation-${now}-${Math.random().toString(36).slice(2, 8)}`,
    type: examAnnotationState.tool,
    page: examAnnotationState.page,
    x,
    y,
    question: examQuestionNumber.value.trim(),
    points,
    comment: examQuestionComment.value.trim(),
    createdAt: now,
    createdBy: getTeacherName()
  });

  renderExamAnnotationOverlay();
  examAnnotationStatus.textContent = "Saving mark...";
  examAnnotationStatus.className = "status-text";
  try {
    await persistExamAnnotations();
    examAnnotationStatus.textContent = "Mark saved.";
    examAnnotationStatus.className = "status-text ok";
  } catch (error) {
    console.error(error);
    examAnnotationStatus.textContent = "Could not save the mark.";
    examAnnotationStatus.className = "status-text bad";
  }
}

function asciiPdfText(value) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7EÀ-ÿ]/g, "")
    .slice(0, 120);
}

async function buildAnnotatedExamPdf() {
  if (!window.PDFLib || !examAnnotationState.pdfBytes) {
    throw new Error("PDF annotation library did not load.");
  }

  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(examAnnotationState.pdfBytes.slice(0));
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const annotation of examAnnotationState.annotations) {
    const page = pages[Number(annotation.page) - 1];
    if (!page) continue;

    const { width, height } = page.getSize();
    const x = Number(annotation.x) * width;
    const y = (1 - Number(annotation.y)) * height;
    const markSize = Math.max(10, Math.min(20, width * 0.025));
    const lineWidth = Math.max(1.4, width * 0.0025);

    if (annotation.type === "correct") {
      page.drawLine({
        start: { x: x - markSize * 0.5, y: y },
        end: { x: x - markSize * 0.1, y: y - markSize * 0.45 },
        thickness: lineWidth,
        color: rgb(0.09, 0.64, 0.29)
      });
      page.drawLine({
        start: { x: x - markSize * 0.1, y: y - markSize * 0.45 },
        end: { x: x + markSize * 0.65, y: y + markSize * 0.5 },
        thickness: lineWidth,
        color: rgb(0.09, 0.64, 0.29)
      });
    } else if (annotation.type === "wrong") {
      page.drawLine({
        start: { x: x - markSize * 0.45, y: y - markSize * 0.45 },
        end: { x: x + markSize * 0.45, y: y + markSize * 0.45 },
        thickness: lineWidth,
        color: rgb(0.86, 0.15, 0.15)
      });
      page.drawLine({
        start: { x: x - markSize * 0.45, y: y + markSize * 0.45 },
        end: { x: x + markSize * 0.45, y: y - markSize * 0.45 },
        thickness: lineWidth,
        color: rgb(0.86, 0.15, 0.15)
      });
    } else {
      page.drawCircle({
        x,
        y,
        size: markSize * 0.48,
        borderWidth: lineWidth,
        borderColor: rgb(0.15, 0.39, 0.92)
      });
    }

    const meta = asciiPdfText(examAnnotationMeta(annotation));
    const comment = asciiPdfText(annotation.comment);
    const label = [meta, comment].filter(Boolean).join(" · ");
    if (label) {
      const size = Math.max(6, Math.min(9, width * 0.011));
      const boxX = Math.min(width - 160, x + markSize * 0.8);
      const boxY = Math.max(8, Math.min(height - 14, y - 4));
      page.drawText(label, {
        x: Math.max(4, boxX),
        y: boxY,
        size,
        font: meta ? bold : font,
        color: rgb(0.12, 0.16, 0.23),
        maxWidth: 155
      });
    }
  }

  return pdfDoc.save();
}

async function saveAnnotatedExamPdf() {
  if (!examAnnotationState.assignmentId || !examAnnotationState.studentKey) return;
  examSaveAnnotatedPdfBtn.disabled = true;
  examAnnotationStatus.textContent = "Generating annotated PDF...";
  examAnnotationStatus.className = "status-text";

  try {
    await persistExamAnnotations();
    const pdfBytes = await buildAnnotatedExamPdf();
    const response = await fetch("/api/exam-annotation-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Assignment-Id": examAnnotationState.assignmentId,
        "X-Student-Key": examAnnotationState.studentKey,
        "X-File-Size": String(pdfBytes.byteLength)
      },
      body: pdfBytes
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.driveFileUrl) {
      throw new Error(result.error || "Could not save annotated PDF.");
    }

    const now = Date.now();
    await update(
      ref(db, `assignmentSubmissions/${examAnnotationState.assignmentId}/${examAnnotationState.studentKey}`),
      {
        examAnnotationStatus: "annotated",
        examAnnotationSavedAt: now,
        examAnnotationSavedBy: getTeacherName(),
        updatedAt: now
      }
    );

    examOpenAnnotatedPdfLink.href = result.driveFileUrl;
    examOpenAnnotatedPdfLink.hidden = false;
    examAnnotationStatus.textContent = "Annotated PDF saved. Original submission was not modified.";
    examAnnotationStatus.className = "status-text ok";
  } catch (error) {
    console.error(error);
    examAnnotationStatus.textContent = error?.message || "Could not save annotated PDF.";
    examAnnotationStatus.className = "status-text bad";
  } finally {
    examSaveAnnotatedPdfBtn.disabled = false;
  }
}


function normalizeProjectCheckpoints(assignment) {
  return Object.entries(assignment?.projectCheckpoints || {})
    .map(([id, checkpoint]) => ({
      id,
      title: String(checkpoint?.title || "Checkpoint"),
      dueAt: Number(checkpoint?.dueAt || 0),
      instructions: String(checkpoint?.instructions || ""),
      requiredEvidenceTypes: Array.isArray(checkpoint?.requiredEvidenceTypes)
        ? checkpoint.requiredEvidenceTypes.map((value) => String(value))
        : Object.keys(checkpoint?.requiredEvidenceTypes || {}).filter((key) => checkpoint.requiredEvidenceTypes[key]),
      createdAt: Number(checkpoint?.createdAt || 0)
    }))
    .sort((a, b) => Number(a.dueAt || 0) - Number(b.dueAt || 0));
}

function makeCheckpointId() {
  return `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function checkpointRowHtml(checkpoint = {}) {
  const evidence = new Set(
    Array.isArray(checkpoint.requiredEvidenceTypes)
      ? checkpoint.requiredEvidenceTypes
      : ["image"]
  );
  const dueValue = checkpoint.dueAt
    ? new Date(Number(checkpoint.dueAt)).toISOString().slice(0, 16)
    : "";

  return `
    <div class="project-checkpoint-row" data-project-checkpoint-row data-checkpoint-id="${escapeHtml(checkpoint.id || makeCheckpointId())}">
      <input type="text" data-checkpoint-title placeholder="Checkpoint title" value="${escapeHtml(checkpoint.title || "")}">
      <input type="datetime-local" data-checkpoint-due value="${escapeHtml(dueValue)}">
      <textarea data-checkpoint-instructions placeholder="What progress should the student show?">${escapeHtml(checkpoint.instructions || "")}</textarea>
      <div class="checkpoint-evidence-types" aria-label="Required evidence types">
        <label><input type="checkbox" data-checkpoint-evidence="image" ${evidence.has("image") ? "checked" : ""}> Photo</label>
        <label><input type="checkbox" data-checkpoint-evidence="video" ${evidence.has("video") ? "checked" : ""}> Video</label>
        <label><input type="checkbox" data-checkpoint-evidence="document" ${evidence.has("document") ? "checked" : ""}> Document</label>
      </div>
      <button type="button" class="remove-checkpoint-btn" data-remove-checkpoint>Remove</button>
    </div>
  `;
}

function addProjectCheckpointRow(checkpoint = {}) {
  projectCheckpointRows.insertAdjacentHTML("beforeend", checkpointRowHtml(checkpoint));
}

function refreshProjectCheckpointBuilder() {
  const projectSelected = assignmentType.value === "PJ";
  projectCheckpointBuilder.hidden = !projectSelected;
  if (projectSelected && !projectCheckpointRows.querySelector("[data-project-checkpoint-row]")) {
    addProjectCheckpointRow();
  }
}

function collectProjectCheckpoints(finalDueAt) {
  if (assignmentType.value !== "PJ") return { checkpoints: {}, error: "" };

  const rows = [...projectCheckpointRows.querySelectorAll("[data-project-checkpoint-row]")];
  const checkpoints = {};

  for (const [index, row] of rows.entries()) {
    const id = String(row.dataset.checkpointId || makeCheckpointId());
    const title = row.querySelector("[data-checkpoint-title]")?.value.trim() || "";
    const dueValue = row.querySelector("[data-checkpoint-due]")?.value || "";
    const dueAt = dueValue ? new Date(dueValue).getTime() : 0;
    const instructions = row.querySelector("[data-checkpoint-instructions]")?.value.trim() || "";
    const requiredEvidenceTypes = [...row.querySelectorAll("[data-checkpoint-evidence]:checked")]
      .map((input) => String(input.dataset.checkpointEvidence || ""))
      .filter(Boolean);

    if (!title) return { checkpoints: {}, error: `Checkpoint ${index + 1} needs a title.` };
    if (!dueAt || Number.isNaN(dueAt)) return { checkpoints: {}, error: `Checkpoint ${index + 1} needs a review date.` };
    if (finalDueAt && dueAt > finalDueAt) {
      return { checkpoints: {}, error: `Checkpoint ${index + 1} cannot be later than the final project due date.` };
    }
    if (!requiredEvidenceTypes.length) {
      return { checkpoints: {}, error: `Checkpoint ${index + 1} needs at least one evidence type.` };
    }

    checkpoints[id] = {
      title,
      dueAt,
      instructions,
      requiredEvidenceTypes,
      createdAt: Date.now()
    };
  }

  return { checkpoints, error: "" };
}

function projectEvidenceEntries(assignmentId, studentKey, checkpointId) {
  return Object.entries(
    projectEvidenceCache?.[assignmentId]?.[studentKey]?.[checkpointId] || {}
  )
    .map(([id, evidence]) => ({ id, ...(evidence || {}) }))
    .sort((a, b) => Number(a.uploadedAt || 0) - Number(b.uploadedAt || 0));
}

function evidenceTypeLabel(type) {
  if (type === "image") return "Photo";
  if (type === "video") return "Video";
  if (type === "document") return "Document";
  return "Evidence";
}

function renderProjectProgress(assignment) {
  if (!isProjectAssignment(assignment)) {
    projectProgressPanel.hidden = true;
    projectProgressTimeline.innerHTML = "";
    return;
  }

  projectProgressPanel.hidden = false;
  const checkpoints = normalizeProjectCheckpoints(assignment);
  if (!checkpoints.length) {
    projectProgressTimeline.innerHTML = '<div class="status-text">No progress checkpoints were configured for this project.</div>';
    return;
  }

  const students = assignmentStudents(assignment, selectedAssignmentId);
  projectProgressTimeline.innerHTML = checkpoints.map((checkpoint) => {
    const typeText = checkpoint.requiredEvidenceTypes.map(evidenceTypeLabel).join(", ");
    return `
      <section class="teacher-checkpoint">
        <div class="teacher-checkpoint-head">
          <div>
            <strong>${escapeHtml(checkpoint.title)}</strong>
            <div class="teacher-checkpoint-instructions">${escapeHtml(checkpoint.instructions || "No additional instructions.")}</div>
          </div>
          <span>${escapeHtml(formatDate(checkpoint.dueAt))} · ${escapeHtml(typeText)}</span>
        </div>
        <div class="teacher-checkpoint-students">
          ${students.map(([studentKey, student]) => {
            const evidence = projectEvidenceEntries(selectedAssignmentId, studentKey, checkpoint.id);
            const reviewed = evidence.length > 0 && evidence.every((item) => item.reviewStatus === "reviewed");
            return `
              <article class="teacher-checkpoint-student">
                <strong>${escapeHtml(student.fullName || student.name || student.nickname || "Student")}</strong>
                <span>${evidence.length ? `${evidence.length} evidence file${evidence.length === 1 ? "" : "s"} · ${reviewed ? "Reviewed" : "Pending review"}` : "No evidence yet"}</span>
                ${evidence.length ? `
                  <div class="teacher-evidence-links">
                    ${evidence.map((item, evidenceIndex) => `
                      <a href="${escapeHtml(item.driveFileUrl || "#")}" target="_blank" rel="noopener">
                        ${escapeHtml(item.originalFileName || `Evidence ${evidenceIndex + 1}`)}
                      </a>
                    `).join("")}
                  </div>
                  <div class="teacher-evidence-actions">
                    ${evidence.map((item) => `
                      <button
                        type="button"
                        data-review-project-evidence
                        data-student-key="${escapeHtml(studentKey)}"
                        data-checkpoint-id="${escapeHtml(checkpoint.id)}"
                        data-evidence-id="${escapeHtml(item.id)}"
                      >${item.reviewStatus === "reviewed" ? "Reopen" : "Mark reviewed"}</button>
                    `).join("")}
                  </div>
                ` : ""}
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");
}

async function toggleProjectEvidenceReview(button) {
  const studentKey = String(button.dataset.studentKey || "");
  const checkpointId = String(button.dataset.checkpointId || "");
  const evidenceId = String(button.dataset.evidenceId || "");
  const evidence = projectEvidenceCache?.[selectedAssignmentId]?.[studentKey]?.[checkpointId]?.[evidenceId];
  if (!evidence) return;

  const reviewed = evidence.reviewStatus === "reviewed";
  let note = String(evidence.teacherNote || "");
  if (!reviewed) {
    const entered = prompt("Teacher note for this evidence (optional):", note);
    if (entered === null) return;
    note = entered.trim();
  }

  const now = Date.now();
  await update(
    ref(db, `assignmentProjectEvidence/${selectedAssignmentId}/${studentKey}/${checkpointId}/${evidenceId}`),
    reviewed
      ? {
          reviewStatus: "pending",
          reviewedAt: null,
          reviewedBy: null,
          updatedAt: now
        }
      : {
          reviewStatus: "reviewed",
          teacherNote: note,
          reviewedAt: now,
          reviewedBy: getTeacherName(),
          updatedAt: now
        }
  );
}

function makeCriterionId() {
  return `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCriteria(value) {
  const raw = Array.isArray(value) ? value : Object.values(value || {});
  return raw
    .filter(Boolean)
    .map((criterion, index) => ({
      id: String(criterion.id || `criterion-${index + 1}`),
      type: criterion.type === "preset" ? "preset" : "custom",
      presetKey: String(criterion.presetKey || ""),
      title: String(criterion.title || criterion.name || "").trim(),
      description: String(criterion.description || "").trim(),
      maxPoints: Number(criterion.maxPoints || criterion.points || 0)
    }))
    .filter((criterion) => criterion.title || criterion.description || criterion.maxPoints);
}

function presetCardHtml(preset, selectedCriterion = null) {
  const checked = Boolean(selectedCriterion);
  const points = selectedCriterion?.maxPoints > 0
    ? selectedCriterion.maxPoints
    : preset.defaultPoints;

  return `
    <div class="preset-card" data-preset-key="${escapeHtml(preset.key)}">
      <label class="preset-main">
        <input type="checkbox" data-preset-enabled ${checked ? "checked" : ""}>
        <span class="preset-copy">
          <strong>${escapeHtml(preset.title)}</strong>
          <span>${escapeHtml(preset.description)}</span>
        </span>
      </label>
      <input
        class="preset-points"
        data-preset-points
        type="number"
        min="0.1"
        step="0.1"
        value="${escapeHtml(points)}"
        aria-label="Points for ${escapeHtml(preset.title)}"
        ${checked ? "" : "disabled"}
      >
    </div>
  `;
}

function renderPresetEditor(container, criteria = []) {
  if (!PRESET_CRITERIA.length) {
    container.innerHTML = '<div class="status-text">No preset criteria have been approved yet.</div>';
    return;
  }

  const normalized = normalizeCriteria(criteria);
  const byKey = new Map(
    normalized
      .filter((criterion) => criterion.type === "preset" && criterion.presetKey)
      .map((criterion) => [criterion.presetKey, criterion])
  );

  container.innerHTML = PRESET_CRITERIA.map((preset) =>
    presetCardHtml(preset, byKey.get(preset.key) || null)
  ).join("");
}

function criterionRowHtml(criterion = {}) {
  const id = criterion.id || makeCriterionId();
  const points = Number(criterion.maxPoints || 0);
  return `
    <div class="criteria-row" data-criterion-id="${escapeHtml(id)}">
      <input data-criterion-title placeholder="Criterion" value="${escapeHtml(criterion.title || "")}">
      <textarea data-criterion-description placeholder="What should be evaluated?">${escapeHtml(criterion.description || "")}</textarea>
      <input data-criterion-points type="number" min="0.1" step="0.1" placeholder="Points" value="${points > 0 ? escapeHtml(points) : ""}">
      <button class="criteria-remove" type="button" data-remove-criterion title="Remove criterion">×</button>
    </div>
  `;
}

function addCustomCriterionRow(container, criterion = {}) {
  container.insertAdjacentHTML("beforeend", criterionRowHtml(criterion));
}

function renderCustomEditor(container, criteria = []) {
  const approvedPresetKeys = new Set(PRESET_CRITERIA.map((preset) => preset.key));
  const custom = normalizeCriteria(criteria).filter(
    (criterion) => criterion.type !== "preset" || !approvedPresetKeys.has(criterion.presetKey)
  );
  container.innerHTML = "";
  if (custom.length) {
    custom.forEach((criterion) => addCustomCriterionRow(container, criterion));
  } else {
    addCustomCriterionRow(container);
  }
}

function collectPresetCriteria(container) {
  const criteria = [];

  for (const card of container.querySelectorAll(".preset-card")) {
    const enabled = card.querySelector("[data-preset-enabled]")?.checked;
    if (!enabled) continue;

    const presetKey = String(card.dataset.presetKey || "");
    const preset = PRESET_CRITERIA.find((item) => item.key === presetKey);
    if (!preset) continue;

    const maxPoints = Number(card.querySelector("[data-preset-points]")?.value || 0);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: `Enter points greater than 0 for "${preset.title}".`, criteria: [] };
    }

    criteria.push({
      id: `preset-${preset.key}`,
      type: "preset",
      presetKey: preset.key,
      title: preset.title,
      description: preset.description,
      maxPoints: Number(maxPoints.toFixed(2))
    });
  }

  return { error: "", criteria };
}

function collectCustomCriteria(container) {
  const criteria = [];

  for (const row of container.querySelectorAll(".criteria-row")) {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    const description = row.querySelector("[data-criterion-description]")?.value.trim() || "";
    const pointsRaw = row.querySelector("[data-criterion-points]")?.value.trim() || "";
    const isBlank = !title && !description && !pointsRaw;
    if (isBlank) continue;

    const maxPoints = Number(pointsRaw);
    if (!title) return { error: "Each custom criterion needs a name.", criteria: [] };
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: `Enter points greater than 0 for "${title}".`, criteria: [] };
    }

    criteria.push({
      id: row.dataset.criterionId || makeCriterionId(),
      type: "custom",
      presetKey: "",
      title,
      description,
      maxPoints: Number(maxPoints.toFixed(2))
    });
  }

  return { error: "", criteria };
}

function collectRubric(presetContainer, customContainer) {
  const presetResult = collectPresetCriteria(presetContainer);
  if (presetResult.error) return presetResult;

  const customResult = collectCustomCriteria(customContainer);
  if (customResult.error) return customResult;

  return {
    error: "",
    criteria: [...presetResult.criteria, ...customResult.criteria]
  };
}

function getDistributionMode(radios) {
  return [...radios].find((radio) => radio.checked)?.value || "manual";
}

function setDistributionMode(radios, mode) {
  const safeMode = mode === "equal" ? "equal" : "manual";
  for (const radio of radios) radio.checked = radio.value === safeMode;
}

function activePointInputs(presetContainer, customContainer) {
  const inputs = [];

  for (const card of presetContainer.querySelectorAll(".preset-card")) {
    if (!card.querySelector("[data-preset-enabled]")?.checked) continue;
    const input = card.querySelector("[data-preset-points]");
    if (input) inputs.push(input);
  }

  for (const row of customContainer.querySelectorAll(".criteria-row")) {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    if (!title) continue;
    const input = row.querySelector("[data-criterion-points]");
    if (input) inputs.push(input);
  }

  return inputs;
}

function applyEqualDistribution(presetContainer, customContainer) {
  const activeInputs = activePointInputs(presetContainer, customContainer);

  for (const card of presetContainer.querySelectorAll(".preset-card")) {
    const enabled = card.querySelector("[data-preset-enabled]")?.checked;
    const input = card.querySelector("[data-preset-points]");
    if (input) input.disabled = true;
    if (!enabled && input) input.value = "";
  }

  for (const row of customContainer.querySelectorAll(".criteria-row")) {
    const title = row.querySelector("[data-criterion-title]")?.value.trim() || "";
    const input = row.querySelector("[data-criterion-points]");
    if (!input) continue;
    input.disabled = true;
    if (!title) input.value = "";
  }

  if (!activeInputs.length) return;

  const totalHundredths = 10000;
  const base = Math.floor(totalHundredths / activeInputs.length);
  let remainder = totalHundredths - base * activeInputs.length;

  activeInputs.forEach((input) => {
    const hundredths = base + (remainder-- > 0 ? 1 : 0);
    input.value = (hundredths / 100).toFixed(2).replace(/\.00$/, "");
  });
}

function applyManualDistribution(presetContainer, customContainer) {
  for (const card of presetContainer.querySelectorAll(".preset-card")) {
    const enabled = card.querySelector("[data-preset-enabled]")?.checked;
    const input = card.querySelector("[data-preset-points]");
    if (input) input.disabled = !enabled;
  }

  for (const input of customContainer.querySelectorAll("[data-criterion-points]")) {
    input.disabled = false;
  }
}

function rubricTotal(presetContainer, customContainer) {
  return Number(activePointInputs(presetContainer, customContainer)
    .reduce((sum, input) => sum + Math.max(0, Number(input.value || 0)), 0)
    .toFixed(2));
}

function updateRubricTotal(presetContainer, customContainer, totalElement) {
  const activeCount = activePointInputs(presetContainer, customContainer).length;
  const total = rubricTotal(presetContainer, customContainer);
  totalElement.textContent = `${total} / 100`;
  totalElement.classList.remove("ok", "bad");
  if (!activeCount) return;
  totalElement.classList.add(Math.abs(total - 100) < 0.01 ? "ok" : "bad");
}

function refreshDistribution(presetContainer, customContainer, totalElement, radios) {
  if (getDistributionMode(radios) === "equal") {
    applyEqualDistribution(presetContainer, customContainer);
  } else {
    applyManualDistribution(presetContainer, customContainer);
  }
  updateRubricTotal(presetContainer, customContainer, totalElement);
}

function fillRubricEditor(
  presetContainer,
  customContainer,
  totalElement,
  criteria = [],
  radios,
  mode = "equal"
) {
  renderPresetEditor(presetContainer, criteria);
  renderCustomEditor(customContainer, criteria);
  setDistributionMode(radios, mode);
  refreshDistribution(presetContainer, customContainer, totalElement, radios);
}

function renderCriteriaGroup(title, criteria) {
  if (!criteria.length) return "";
  return `
    <div class="criteria-view-group">
      <h5>${escapeHtml(title)}</h5>
      ${criteria.map((criterion) => `
        <div class="criteria-view-item">
          <strong>${escapeHtml(criterion.title)} <span class="criteria-points">· ${escapeHtml(criterion.maxPoints)} pts</span></strong>
          ${criterion.description ? `<span>${escapeHtml(criterion.description)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderEvaluationCriteria(assignment) {
  const rubric = getAssignmentRubric(assignment);
  const criteria = rubric.criteria;
  const notes = String(rubric.notes || "").trim();
  const studentInstructions = String(
    splitStoredInstructions(assignment.instructions).visibleInstructions || ""
  ).trim();
  const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0);

  if (!criteria.length && !notes && !studentInstructions) {
    criteriaReadOnly.innerHTML = '<div class="status-text">No instructions or evaluation criteria.</div>';
    return;
  }

  const instructionsHtml = studentInstructions
    ? `<section class="criteria-assignment-instructions">
        <strong>Assignment instructions</strong>
        <div>${escapeHtml(studentInstructions)}</div>
      </section>`
    : "";

  const criteriaHtml = criteria.length
    ? `<div class="criteria-compact-list">
        ${criteria.map((criterion) => `
          <div class="criteria-compact-item" title="${escapeHtml(criterion.description || criterion.title)}">
            <strong>${escapeHtml(criterion.title)}</strong>
            <span>${escapeHtml(Number(Number(criterion.maxPoints || 0).toFixed(2)))} pts</span>
          </div>
        `).join("")}
      </div>`
    : "";

  const chatGptHtml = notes
    ? `<div class="criteria-chatgpt-instructions">
        <strong>ChatGPT review instructions:</strong>
        <span>${escapeHtml(notes)}</span>
      </div>`
    : "";

  criteriaReadOnly.innerHTML = `
    ${instructionsHtml}
    ${criteriaHtml}
    <div class="criteria-compact-footer">
      ${chatGptHtml}
      ${criteria.length
        ? `<div class="criteria-compact-total">${Number(total.toFixed(2))} / 100 points</div>`
        : ""}
    </div>
  `;
}

function assignmentStudents(assignment, assignmentId = "") {
  const recipientKeys = normalizeRecipientKeys(assignment?.recipientStudentKeys);
  const recipientSet = new Set(recipientKeys);
  const target = assignmentEffectiveGroup(assignmentId, assignment);

  return Object.entries(studentsCache || {})
    .filter(([studentKey, student]) => {
      if (recipientSet.size) return recipientSet.has(studentKey);
      return target === "ALL" || studentInGroup(student, target);
    })
    .sort((a, b) => String(a[1]?.fullName || a[1]?.name || "").localeCompare(String(b[1]?.fullName || b[1]?.name || "")));
}

function assignmentSubmissions(assignmentId) {
  return submissionsCache?.[assignmentId] || {};
}

function openStudentRecord(studentKey) {
  const key = String(studentKey || "").trim();
  if (!key) return;
  sessionStorage.setItem("teacherViewStudentKey", key);
  window.location.href = `student-summary.html?teacherViewStudentKey=${encodeURIComponent(key)}`;
}

function assignmentCogResults(assignmentId) {
  const submissions = assignmentSubmissions(assignmentId);
  return Object.fromEntries(
    Object.entries(submissions)
      .map(([studentKey, submission]) => [studentKey, submission?.cogResults || {}])
      .filter(([, cogResults]) => cogResults && typeof cogResults === "object" && Object.keys(cogResults).length)
  );
}

function cogResultKeysForStudents(resultsByStudent, students) {
  return new Set(
    students
      .map(([studentKey]) => studentKey)
      .filter((studentKey) => studentHasCogResult(resultsByStudent, studentKey))
  );
}

function cogResultSummary(receipt) {
  const percentage = Number(receipt?.percentage);
  const points = receipt?.points === null || receipt?.points === undefined || receipt?.points === ""
    ? null
    : Number(receipt.points);
  const parts = [];
  if (Number.isFinite(percentage)) parts.push(`${Number(percentage.toFixed(2))}%`);
  if (Number.isFinite(points)) parts.push(`${Number(points.toFixed(2))} game points`);
  return parts.join(" · ") || "Completed result";
}

function cogMetricsHtml(receipt) {
  const entries = cogMetricEntries(receipt);
  return entries.length
    ? `<div class="cog-metric-grid">${entries.map((entry) => `
        <span class="cog-metric-chip">
          <small>${escapeHtml(entry.label)}</small>
          <strong>${escapeHtml(entry.value)}</strong>
        </span>
      `).join("")}</div>`
    : '<div class="status-text">No additional game metrics were reported.</div>';
}

function renderCogResults(assignment, students) {
  if (!cogResultsPanel || !cogResultsList) return;
  const isCogAssignment = assignmentTypeCodeFor(assignment) === "COG";
  cogResultsPanel.hidden = !isCogAssignment;
  if (!isCogAssignment) {
    cogResultsList.innerHTML = "";
    return;
  }

  const resultsByStudent = assignmentCogResults(selectedAssignmentId);
  const completed = students.filter(([studentKey]) => studentHasCogResult(resultsByStudent, studentKey));

  cogResultsList.innerHTML = completed.length
    ? completed.map(([studentKey, student]) => {
        const history = cogResultHistoryForStudent(resultsByStudent, studentKey);
        const latest = history[0];
        const studentName = student?.fullName || student?.name || student?.nickname || latest?.externalId || "Student";
        const studentId = student?.studentNumber || student?.externalId || student?.studentId || latest?.externalId || studentKey;
        const group = latest?.groupName || assignmentEffectiveGroup(selectedAssignmentId, assignment) || student?.groupName || "GENERAL";
        const attemptsLabel = `${history.length} result${history.length === 1 ? "" : "s"}`;

        return `
          <article class="cog-result-card" data-cog-result-student-key="${escapeHtml(studentKey)}">
            <div class="cog-result-head">
              <div>
                <h4>${escapeHtml(studentName)}</h4>
                <div class="submission-meta">${escapeHtml(studentId)} · ${escapeHtml(group)} · ${escapeHtml(attemptsLabel)}</div>
              </div>
              <div class="cog-result-chip">
                <small>Latest game result</small>
                <strong>${escapeHtml(cogResultSummary(latest))}</strong>
              </div>
            </div>
            <div class="cog-result-game-row">
              <strong>${escapeHtml(cogGameName(latest?.gameId))}</strong>
              <span>Completed ${escapeHtml(formatDate(latest?.completedAt || latest?.acceptedAt))}</span>
            </div>
            ${cogMetricsHtml(latest)}
            <details class="cog-attempts" ${history.length === 1 ? "open" : ""}>
              <summary>Result history (${history.length})</summary>
              <div class="cog-attempt-list">
                ${history.map((receipt, index) => `
                  <div class="cog-attempt-row">
                    <div class="cog-attempt-title">
                      <strong>${index === 0 ? "Latest" : `Attempt ${history.length - index}`} · ${escapeHtml(cogResultSummary(receipt))}</strong>
                      <span>${escapeHtml(formatDate(receipt.completedAt || receipt.acceptedAt))}</span>
                    </div>
                    ${cogMetricsHtml(receipt)}
                  </div>
                `).join("")}
              </div>
            </details>
          </article>
        `;
      }).join("")
    : '<div class="status-text">No verified Classroom Online Games results yet.</div>';
}

function assignmentHasSubmissions(assignmentId) {
  return Object.values(assignmentSubmissions(assignmentId))
    .some((submission) => Boolean(submission?.driveFileId));
}

function assignmentEvaluationState(assignmentId, assignment) {
  const totalStudents = assignmentStudents(assignment, assignmentId).length;

  if (assignmentTypeCodeFor(assignment) === "COG") {
    const resultCount = cogResultStudentCount(assignmentCogResults(assignmentId));
    const missing = Math.max(0, totalStudents - resultCount);
    return {
      submitted: resultCount,
      graded: 0,
      totalStudents,
      missing,
      complete: resultCount > 0 && missing === 0,
      isCog: true
    };
  }

  const submissions = Object.values(assignmentSubmissions(assignmentId))
    .filter((submission) => submission?.driveFileId);
  const submitted = submissions.length;
  const graded = submissions.filter((submission) => submissionIsGraded(submission)).length;
  const missing = Math.max(0, totalStudents - submitted);
  const complete = submitted > 0 && graded === submitted && (!assignment?.active || missing === 0);

  return { submitted, graded, totalStudents, missing, complete, isCog: false };
}

function buildChatGPTGradingPrompt(assignmentId) {
  const assignment = assignmentsCache[assignmentId];
  if (!assignment) return "";

  const code = String(assignment.code || "").trim();
  const title = String(assignment.title || "Assignment").trim();
  const group = String(assignment.groupName || "ALL").trim();
  const visibleInstructions = splitStoredInstructions(assignment.instructions).visibleInstructions.trim();
  const rubric = getAssignmentRubric(assignment);
  const teacherNotes = String(rubric.notes || "").trim();

  return [
    `Califica la actividad de YouTeach con Task Code: ${code}.`,
    `Título: ${title}. Grupo: ${group}.`,
    "",
    "INSTRUCCIONES DE LA ACTIVIDAD EN YOUTEACH (OBLIGATORIAS):",
    visibleInstructions || "(Sin instrucciones visibles adicionales.)",
    "",
    teacherNotes ? "NOTAS DEL MAESTRO PARA EVALUACIÓN:" : "",
    teacherNotes || "",
    teacherNotes ? "" : "",
    "Usa mi conexión de Google Drive. Trabaja ÚNICAMENTE dentro de la carpeta YouTeach Assignments/" + code + ".",
    "",
    "REGLA PRINCIPAL: sigue literalmente las instrucciones de la actividad y los criterios del JSON. No sustituyas un tipo de evidencia por otro.",
    "Ejemplo: si se pide verificar una maqueta/modelo físico mediante evidencia visual, debes buscar y evaluar una FOTOGRAFÍA del modelo físico. Un dibujo, diagrama, esquema, render o descripción escrita NO equivale a una fotografía de la maqueta salvo que las instrucciones lo permitan expresamente.",
    "Revisa TODAS las páginas, imágenes y anexos de cada entrega antes de concluir que una evidencia falta.",
    "",
    "1. Abre y lee " + code + "--evaluation-criteria.json. Trata sus criterios, puntajes, descripciones y notas como autoridad de evaluación.",
    "2. Si ya existe " + code + "--grading-results.json, léelo primero como ledger/historial de calificación. No dupliques resultados para una misma versión de archivo.",
    "3. Revisa todos los archivos de entrega de estudiantes dentro de esa carpeta que correspondan a esta actividad.",
    "4. Para CADA criterio, antes de puntuar identifica: (a) qué exige exactamente, (b) qué tipo de evidencia lo demuestra, (c) dónde aparece esa evidencia, y (d) si realmente cumple.",
    "5. Evalúa cada entrega sobre 100 usando exactamente los criterios y máximos del JSON.",
    "6. Verifica identidad comparando el nombre esperado del alumno con el nombre visible/escrito en la entrega. Si falta, es ilegible o no coincide, usa identityStatus = \"manual-review\" o \"mismatch\". Nunca inventes identidad.",
    "7. DIFERENCIA IMPORTANTE:",
    "   - Si falta un componente que la tarea EXIGÍA y la entrega sí permite comprobar esa ausencia, califica el incumplimiento según la rúbrica; puede corresponder 0.",
    "   - Usa status=\"not-gradable\" y score=null SOLO cuando el criterio no pueda juzgarse justamente con la modalidad/evidencia disponible (por ejemplo pronunciación sin audio).",
    "8. No extrapoles, no inventes evidencia y no des crédito por materiales fuera de esta carpeta salvo que las instrucciones lo pidan expresamente.",
    "9. En la nota de cada criterio incluye una referencia breve de evidencia cuando sea posible: página, pregunta, imagen/fotografía o ubicación.",
    "10. Devuélveme en el chat una tabla por alumno con calificación /100 cuando sea calculable, identidad, desglose por criterio y feedback breve.",
    "",
    "11. OBLIGATORIO: al terminar, abre y ACTUALIZA el archivo YA EXISTENTE dentro de ESTA MISMA carpeta:",
    code + "--grading-results.json",
    "NO CREES otro archivo con el mismo nombre. YouTeach precrea este archivo para que pueda leerlo después. Conserva el mismo archivo/ID y reemplaza únicamente su contenido JSON.",
    "",
    "El JSON debe seguir esta estructura (puedes conservar resultados anteriores sin cambios si la misma versión del archivo ya estaba calificada):",
    "{",
    '  "schemaVersion": 2,',
    '  "source": "ChatGPT",',
    '  "taskCode": "' + code + '",',
    '  "gradedAt": 0,',
    '  "results": [',
    "    {",
    '      "driveFileId": "",',
    '      "driveFileName": "NOMBRE-DEL-ARCHIVO",',
    '      "sourceModifiedTime": "",',
    '      "sourceSize": 0,',
    '      "expectedStudentName": "Nombre esperado por YouTeach",',
    '      "studentNumber": "",',
    '      "identityStatus": "verified | manual-review | mismatch",',
    '      "criterionScores": [',
    "        {",
    '          "criterionId": "ID exacto del criterio",',
    '          "title": "Título exacto del criterio",',
    '          "score": 0,',
    '          "status": "graded | not-gradable",',
    '          "evidence": "Página/pregunta/foto/ubicación breve",',
    '          "note": ""',
    "        }",
    "      ],",
    '      "totalScore": 0,',
    '      "feedback": "",',
    '      "notes": ""',
    "    }",
    "  ]",
    "}",
    "",
    "Para criterios not-gradable usa score:null. Si existe al menos un criterio not-gradable, usa totalScore:null; no extrapoles ni reescales.",
    "gradedAt debe ser timestamp en milisegundos.",
    "Si puedes obtener metadata de Drive, usa driveFileId + sourceModifiedTime + sourceSize para reconocer una entrega ya calificada sin cambios y evitar calificarla dos veces.",
    "No renombres, modifiques ni borres la entrega original ni evaluation-criteria.json.",
    "Después de guardar grading-results.json, confirma en el chat cuántas entregas fueron calificadas, cuántas ya estaban calificadas sin cambios y cuántas requieren revisión manual."
  ].filter(Boolean).join("\n");
}

function stopAiAutoSync(assignmentId) {
  const timer = aiAutoSyncTimers.get(assignmentId);
  if (timer) clearInterval(timer);
  aiAutoSyncTimers.delete(assignmentId);
}

function startAiAutoSync(assignmentId, startedAt) {
  stopAiAutoSync(assignmentId);
  let attempts = 0;
  const maxAttempts = 180;

  const check = async () => {
    attempts += 1;
    const result = await syncAiGrades({
      assignmentId,
      minimumResultsModifiedTime: startedAt,
      forceRegrade: true,
      silentPending: true
    });

    if (result?.ok) {
      stopAiAutoSync(assignmentId);
      try { localStorage.removeItem(AI_PENDING_RUN_KEY); } catch (_) {}
      return;
    }

    if (attempts >= maxAttempts) {
      stopAiAutoSync(assignmentId);
      if (selectedAssignmentId === assignmentId) {
        aiSyncStatus.textContent = "AI result not detected yet.";
        aiSyncStatus.style.color = "#b45309";
        retryAiSyncBtn.hidden = false;
      }
    }
  };

  const timer = setInterval(check, 10000);
  aiAutoSyncTimers.set(assignmentId, timer);
  setTimeout(check, 5000);
}

function openChatGPTGrading(assignmentId) {
  const prompt = buildChatGPTGradingPrompt(assignmentId);
  if (!prompt) return;

  selectedAssignmentId = assignmentId;
  renderAssignmentList();

  navigator.clipboard?.writeText(prompt).catch(() => {});

  const startedAt = Date.now();
  try {
    localStorage.setItem(AI_PENDING_RUN_KEY, JSON.stringify({ assignmentId, startedAt }));
  } catch (_) {}

  aiSyncStatus.textContent = "Waiting for AI results...";
  aiSyncStatus.style.color = "#64748b";
  startAiAutoSync(assignmentId, startedAt);

  const url = `https://chatgpt.com/?prompt=${encodeURIComponent(prompt)}`;
  window.open(url, "_blank", "noopener");
}

function gradingTotalForSubmission(submission) {
  const raw = submission?.grading?.totalScore;
  if (raw === null || raw === undefined || raw === "") return null;
  const total = Number(raw);
  return Number.isFinite(total) ? total : null;
}

function gradingTotalFromGrade(grading) {
  const raw = grading?.totalScore;
  if (raw === null || raw === undefined || raw === "") return null;
  const total = Number(raw);
  return Number.isFinite(total) ? total : null;
}

function gradeHistoryEntries(submission) {
  const stored = Object.entries(submission?.gradingHistory || {})
    .map(([id, event]) => ({ id, ...(event || {}) }))
    .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));

  if (stored.length || !submission?.grading) return stored;

  return [{
    id: "current-grade-baseline",
    action: "current-grade-baseline",
    timestamp: Number(submission?.grading?.gradedAt || submission?.updatedAt || 0),
    actor: String(submission?.grading?.gradedBy || "YouTeach"),
    from: { grading: null, published: false },
    to: {
      grading: submission.grading,
      published: Boolean(submission?.gradePublished)
    }
  }];
}

function gradeHistoryActionLabel(action) {
  const value = String(action || "");
  if (value === "ai-grade-applied") return "AI grade applied";
  if (value === "manual-grade-saved") return "Manual grade saved";
  if (value === "grade-published") return "Grade published";
  if (value === "grade-unpublished") return "Grade unpublished";
  if (value === "grade-cleared") return "Grade cleared";
  if (value === "current-grade-baseline") return "Current grade";
  return "Grade updated";
}

function gradeHistoryScoreLabel(state) {
  const total = gradingTotalFromGrade(state?.grading);
  if (total === null) return "No numeric grade";
  const mode = String(state?.grading?.mode || "").toUpperCase();
  return `${Number(total.toFixed(2))} / 100${mode ? ` · ${mode}` : ""}`;
}

function gradeHistoryHtml(submission) {
  const entries = gradeHistoryEntries(submission);
  if (!entries.length) return "";

  return `
    <details class="grade-history-details">
      <summary>Grade history (${entries.length})</summary>
      <div class="grade-history-list">
        ${entries.map((event) => `
          <div class="grade-history-event">
            <div class="grade-history-event-head">
              <strong>${escapeHtml(gradeHistoryActionLabel(event.action))}</strong>
              <span>${escapeHtml(formatDate(event.timestamp))}</span>
            </div>
            <div class="grade-history-event-change">
              ${escapeHtml(gradeHistoryScoreLabel(event.from))} → ${escapeHtml(gradeHistoryScoreLabel(event.to))}
            </div>
            <div class="grade-history-event-meta">
              ${escapeHtml(event.actor || "YouTeach")}
              ${event.to?.published ? " · Published" : " · Unpublished"}
            </div>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function withGradeHistory(studentKey, submission, action, patch, options = {}) {
  const timestamp = Number(options.timestamp || Date.now());
  const historyKey = push(
    ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}/gradingHistory`)
  ).key || `event-${timestamp}`;

  const hasNextGrading = Object.prototype.hasOwnProperty.call(patch, "grading");
  const nextGrading = hasNextGrading ? patch.grading : (submission?.grading || null);
  const hasNextPublished = Object.prototype.hasOwnProperty.call(patch, "gradePublished");
  const nextPublished = hasNextPublished ? Boolean(patch.gradePublished) : Boolean(submission?.gradePublished);

  return {
    ...patch,
    [`gradingHistory/${historyKey}`]: {
      action,
      timestamp,
      actor: String(options.actor || getTeacherName() || "Teacher"),
      from: {
        grading: submission?.grading || null,
        published: Boolean(submission?.gradePublished)
      },
      to: {
        grading: nextGrading,
        published: nextPublished
      },
      sourceDriveFileId: String(submission?.driveFileId || ""),
      sourceSubmissionUpdatedAt: Number(submission?.uploadedAt || submission?.submittedAt || 0)
    }
  };
}

function submissionIsGraded(submission) {
  if (!submission?.grading || gradingTotalForSubmission(submission) === null) return false;
  return ["graded", "ai-graded", "manual-graded"].includes(String(submission?.reviewStatus || ""));
}

function identityStatusLabel(status) {
  const value = String(status || "pending");
  if (value === "verified") return "Identity verified";
  if (value === "mismatch") return "Identity mismatch";
  if (value === "manual-review") return "Identity manual review";
  return "Identity pending review";
}

async function syncAiGrades(options = {}) {
  const assignmentId = String(options.assignmentId || selectedAssignmentId || "");
  const assignment = assignmentsCache[assignmentId];
  if (!assignment) return { ok: false };

  const isSelected = assignmentId === selectedAssignmentId;
  if (isSelected) {
    retryAiSyncBtn.disabled = true;
    if (!options.silentPending) {
      aiSyncStatus.textContent = "Checking AI results...";
      aiSyncStatus.style.color = "#64748b";
    }
  }

  try {
    const response = await fetch("/api/sync-ai-grades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId,
        minimumResultsModifiedTime: Number(options.minimumResultsModifiedTime || 0),
        forceRegrade: Boolean(options.forceRegrade)
      })
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 202 && result.pending) {
      if (isSelected && !options.silentPending) {
        aiSyncStatus.textContent = "AI results are not ready yet.";
        aiSyncStatus.style.color = "#64748b";
      }
      return { ok: false, pending: true };
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not apply AI grades.");
    }

    const parts = [];
    if (result.imported) parts.push(`${result.imported} AI grade${result.imported === 1 ? "" : "s"} applied`);
    if (result.skippedAlready) parts.push(`${result.skippedAlready} already applied`);
    if (result.skippedManual) parts.push(`${result.skippedManual} manual grade${result.skippedManual === 1 ? "" : "s"} preserved`);
    if (!parts.length) parts.push("AI results checked");
    if (result.unmatched?.length) parts.push(`${result.unmatched.length} unmatched`);
    if (result.errors?.length) parts.push(`${result.errors.length} errors`);

    if (isSelected) {
      aiSyncStatus.textContent = parts.join(" · ");
      aiSyncStatus.style.color =
        result.errors?.length || result.unmatched?.length ? "#b45309" : "#166534";
      retryAiSyncBtn.hidden = !(result.errors?.length || result.unmatched?.length);
    }

    return result;
  } catch (error) {
    console.error(error);
    if (isSelected && !options.silentPending) {
      aiSyncStatus.textContent = error?.message || "Could not apply AI grades.";
      aiSyncStatus.style.color = "#b91c1c";
      retryAiSyncBtn.hidden = false;
    }
    return { ok: false, error: error?.message || "Could not apply AI grades." };
  } finally {
    if (isSelected) retryAiSyncBtn.disabled = false;
  }
}

function renderManualGrading() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment || manualGradingPanel.hidden) return;

  const rubric = getAssignmentRubric(assignment);
  const criteria = rubric.criteria;
  const allSubmissions = Object.entries(assignmentSubmissions(selectedAssignmentId))
    .filter(([, submission]) => submission?.driveFileId)
    .sort((a, b) => {
      const aGraded = submissionIsGraded(a[1]);
      const bGraded = submissionIsGraded(b[1]);
      if (aGraded !== bGraded) return aGraded ? 1 : -1;
      return String(a[1]?.studentName || "").localeCompare(String(b[1]?.studentName || ""));
    });

  if (!criteria.length) {
    manualGradingTitle.textContent = `Manual Grading · ${assignment.code || ""}`;
    manualGradingList.innerHTML =
      '<div class="status-text bad">This assignment has no evaluation criteria. Manual grading requires a rubric.</div>';
    return;
  }

  if (!allSubmissions.length) {
    manualGradingTitle.textContent = `Manual Grading · ${assignment.code || ""}`;
    manualGradingList.innerHTML =
      '<div class="status-text">No submitted PDFs are available to grade.</div>';
    return;
  }

  let selectedEntry = allSubmissions.find(([studentKey]) => studentKey === selectedManualStudentKey);
  if (!selectedEntry) {
    selectedEntry = allSubmissions.find(([, submission]) => !submissionIsGraded(submission)) || allSubmissions[0];
    selectedManualStudentKey = selectedEntry[0];
  }

  const [studentKey, submission] = selectedEntry;
  const savedScores = submission?.grading?.criterionScores || {};
  const savedFeedback = String(submission?.grading?.feedback || "");
  const savedTotal = gradingTotalForSubmission(submission);

  manualGradingTitle.textContent = `Manual Grading · ${submission.studentName || "Student"}`;

  manualGradingList.innerHTML = `
    <article class="manual-grade-card" data-manual-grade-card="${escapeHtml(studentKey)}">
      <div class="manual-grade-card-head">
        <div>
          <h5>${escapeHtml(submission.studentName || "Student")}</h5>
          <div class="manual-grade-meta">
            ${escapeHtml(submission.studentNumber || "No ID")} ·
            ${escapeHtml(submission.groupName || "")}
          </div>
        </div>
        <div class="manual-grade-total" data-manual-total>
          ${savedTotal === null ? "0" : Number(savedTotal.toFixed(2))} / 100
        </div>
      </div>

      <div class="manual-criterion-list">
        ${criteria.map((criterion) => {
          const rawScore = savedScores?.[criterion.id];
          const value = Number.isFinite(Number(rawScore)) ? Number(rawScore) : "";
          const percentage = value === "" || !Number(criterion.maxPoints)
            ? ""
            : Number(((Number(value) / Number(criterion.maxPoints)) * 100).toFixed(2));
          return `
            <label class="manual-criterion-row">
              <span class="manual-criterion-name" title="${escapeHtml(criterion.description || criterion.title)}">
                ${escapeHtml(criterion.title)}
              </span>
              <span class="manual-percent-input">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value="${escapeHtml(percentage)}"
                  data-manual-percent
                  data-criterion-id="${escapeHtml(criterion.id)}"
                  data-max-points="${escapeHtml(criterion.maxPoints)}"
                  aria-label="${escapeHtml(criterion.title)} percentage"
                >
                <span>%</span>
              </span>
              <span class="manual-points-input">
                <input
                  type="number"
                  min="0"
                  max="${escapeHtml(criterion.maxPoints)}"
                  step="0.01"
                  value="${escapeHtml(value)}"
                  data-manual-score
                  data-criterion-id="${escapeHtml(criterion.id)}"
                  data-max-points="${escapeHtml(criterion.maxPoints)}"
                  aria-label="${escapeHtml(criterion.title)} points"
                >
                <span class="manual-criterion-max">/ ${escapeHtml(criterion.maxPoints)}</span>
              </span>
            </label>
          `;
        }).join("")}
      </div>

      <textarea
        class="manual-grade-feedback"
        data-manual-feedback
        placeholder="Feedback for this student..."
      >${escapeHtml(savedFeedback)}</textarea>

      <div class="manual-grade-actions">
        <a class="pdf-link" href="${escapeHtml(submission.driveFileUrl || "#")}" target="_blank" rel="noopener">
          Open PDF
        </a>
        <div class="manual-grade-action-buttons">
          ${submission?.grading?.mode === "manual"
            ? `<button type="button" class="clear-manual-grade-btn" data-clear-manual-grade="${escapeHtml(studentKey)}">Clear Grade</button>`
            : ""
          }
          <button type="button" data-save-manual-grade="${escapeHtml(studentKey)}">Save Grade</button>
        </div>
      </div>
      <div class="manual-grade-status" data-manual-grade-status>
        ${savedTotal === null ? "" : "Saved manual grade"}
      </div>
    </article>
  `;
}

function updateManualCardTotal(card) {
  if (!card) return;
  const inputs = [...card.querySelectorAll("[data-manual-score]")];
  const total = inputs.reduce((sum, input) => {
    const value = Number(input.value);
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
  const totalElement = card.querySelector("[data-manual-total]");
  if (totalElement) totalElement.textContent = `${Number(total.toFixed(2))} / 100`;
}

function syncManualCriterionInputs(input) {
  const row = input.closest(".manual-criterion-row");
  if (!row || input.value === "") return;

  const scoreInput = row.querySelector("[data-manual-score]");
  const percentInput = row.querySelector("[data-manual-percent]");
  const maxPoints = Number(input.dataset.maxPoints || scoreInput?.dataset.maxPoints || 0);
  if (!scoreInput || !percentInput || !Number.isFinite(maxPoints) || maxPoints <= 0) return;

  if (input.matches("[data-manual-percent]")) {
    const percent = Math.min(100, Math.max(0, Number(input.value) || 0));
    input.value = String(Number(percent.toFixed(2)));
    scoreInput.value = String(Number(((maxPoints * percent) / 100).toFixed(2)));
  } else {
    const score = Math.min(maxPoints, Math.max(0, Number(input.value) || 0));
    input.value = String(Number(score.toFixed(2)));
    percentInput.value = String(Number(((score / maxPoints) * 100).toFixed(2)));
  }
}

function openManualGrading(assignmentId, studentKey = "") {
  const sameAssignment = selectedAssignmentId === assignmentId;
  const sameStudent = !studentKey || selectedManualStudentKey === studentKey;

  if (!manualGradingPanel.hidden && sameAssignment && sameStudent) {
    manualGradingPanel.hidden = true;
    selectedManualStudentKey = "";
    renderDetail();
    return;
  }

  selectedAssignmentId = assignmentId;
  selectedManualStudentKey = studentKey;
  manualGradingPanel.hidden = false;
  renderAssignmentList();
  renderManualGrading();
  renderDetail();
  setTimeout(() => manualGradingPanel.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
}

async function saveManualGrade(studentKey) {
  const assignment = assignmentsCache[selectedAssignmentId];
  const card = manualGradingList.querySelector(
    `[data-manual-grade-card="${CSS.escape(studentKey)}"]`
  );
  if (!assignment || !card) return;

  const rubric = getAssignmentRubric(assignment);
  const criteria = rubric.criteria;
  const inputs = [...card.querySelectorAll("[data-manual-score]")];
  const status = card.querySelector("[data-manual-grade-status]");
  const saveButton = card.querySelector("[data-save-manual-grade]");
  const criterionScores = {};
  let totalScore = 0;

  for (const input of inputs) {
    const valueText = input.value.trim();
    const maxPoints = Number(input.dataset.maxPoints || 0);
    const criterionId = String(input.dataset.criterionId || "");

    if (valueText === "") {
      status.textContent = "Enter a score for every criterion.";
      status.style.color = "#b91c1c";
      return;
    }

    const value = Number(valueText);
    if (!Number.isFinite(value) || value < 0 || value > maxPoints) {
      status.textContent = `Each score must be between 0 and its criterion maximum.`;
      status.style.color = "#b91c1c";
      return;
    }

    criterionScores[criterionId] = Number(value.toFixed(2));
    totalScore += value;
  }

  if (totalScore > 100.01) {
    status.textContent = "Total score cannot exceed 100.";
    status.style.color = "#b91c1c";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving...";
  status.style.color = "#64748b";

  try {
    const feedback = card.querySelector("[data-manual-feedback]")?.value.trim() || "";
    const submission = submissionsCache?.[selectedAssignmentId]?.[studentKey] || {};
    const now = Date.now();
    const patch = {
      grading: {
        mode: "manual",
        criterionScores,
        totalScore: Number(totalScore.toFixed(2)),
        rubricTotal: Number(criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0).toFixed(2)),
        feedback,
        gradedAt: now,
        gradedBy: getTeacherName()
      },
      reviewStatus: "manual-graded",
      teacherReviewStatus: "accepted",
      gradePublished: false,
      gradePublishedAt: null,
      gradePublishedBy: null,
      gradingSourceSubmissionUpdatedAt: Number(
        submission?.uploadedAt ||
        submission?.submittedAt ||
        0
      ),
      gradingSourceDriveFileId: String(submission?.driveFileId || ""),
      updatedAt: now
    };
    await update(
      ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}`),
      withGradeHistory(studentKey, submission, "manual-grade-saved", patch, {
        timestamp: now,
        actor: getTeacherName()
      })
    );

    status.textContent = `Saved · ${Number(totalScore.toFixed(2))} / 100`;
    status.style.color = "#166534";
  } catch (error) {
    console.error(error);
    status.textContent = "Could not save the grade.";
    status.style.color = "#b91c1c";
  } finally {
    saveButton.disabled = false;
  }
}

async function clearManualGrade(studentKey) {
  const submission = submissionsCache?.[selectedAssignmentId]?.[studentKey];
  const card = manualGradingList.querySelector(
    `[data-manual-grade-card="${CSS.escape(studentKey)}"]`
  );
  const status = card?.querySelector("[data-manual-grade-status]");

  if (!submission || submission?.grading?.mode !== "manual") {
    if (status) {
      status.textContent = "There is no manual grade to clear.";
      status.style.color = "#b45309";
    }
    return;
  }

  const studentName = submission.studentName || "this student";
  const confirmed = window.confirm(
    `Clear the manual grade for ${studentName}? The submitted file will NOT be deleted. The grade will return to pending and can be graded again manually or with AI.`
  );
  if (!confirmed) return;

  const clearButton = card?.querySelector("[data-clear-manual-grade]");
  if (clearButton) clearButton.disabled = true;
  if (status) {
    status.textContent = "Clearing manual grade...";
    status.style.color = "#64748b";
  }

  try {
    const now = Date.now();
    const patch = {
      grading: null,
      reviewStatus: "pending",
      teacherReviewStatus: null,
      gradePublished: false,
      gradePublishedAt: null,
      gradePublishedBy: null,
      gradingSourceSubmissionUpdatedAt: null,
      gradingSourceDriveFileId: null,
      aiGradingResultsFileModifiedTime: null,
      aiGradingSyncedAt: null,
      aiGradingCandidate: null,
      aiGradingCandidateState: null,
      updatedAt: now
    };
    await update(
      ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}`),
      withGradeHistory(studentKey, submission, "grade-cleared", patch, {
        timestamp: now,
        actor: getTeacherName()
      })
    );

    if (status) {
      status.textContent = "Manual grade cleared. Ready to grade again.";
      status.style.color = "#166534";
    } else {
      aiSyncStatus.textContent = "Manual grade cleared. Ready to grade again.";
      aiSyncStatus.style.color = "#166534";
    }
  } catch (error) {
    console.error(error);
    if (status) {
      status.textContent = "Could not clear the manual grade.";
      status.style.color = "#b91c1c";
    }
    if (clearButton) clearButton.disabled = false;
  }
}

async function toggleGradePublication(studentKey) {
  const submission = submissionsCache?.[selectedAssignmentId]?.[studentKey];
  const total = gradingTotalForSubmission(submission);
  if (!submission || total === null) return;

  const publish = !Boolean(submission.gradePublished);

  const now = Date.now();
  const patch = publish
    ? {
        gradePublished: true,
        gradePublishedAt: now,
        gradePublishedBy: getTeacherName(),
        teacherReviewStatus: "accepted",
        updatedAt: now
      }
    : {
        gradePublished: false,
        gradePublishedAt: null,
        gradePublishedBy: null,
        updatedAt: now
      };

  await update(
    ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}`),
    withGradeHistory(
      studentKey,
      submission,
      publish ? "grade-published" : "grade-unpublished",
      patch,
      { timestamp: now, actor: getTeacherName() }
    )
  );
}

function renderGroupOptions() {
  const workingGroup = getWorkingGroup();
  assignmentGroup.value = workingGroup || "";
  assignmentGroupHelp.textContent = workingGroup
    ? `Working group: ${workingGroup}.`
    : "Select a working group from the group button beside the teacher name.";
  renderAssignmentTargetOptions();
  refreshAutomaticTaskCode();
}

function dateFilterKey(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getWorkingGroup() {
  return String(
    sessionStorage.getItem(WORKING_GROUP_KEY) ||
    localStorage.getItem(WORKING_GROUP_KEY) ||
    ""
  ).trim();
}

function normalizeGroupName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function workingGroupAliases() {
  const workingGroup = getWorkingGroup();
  if (!workingGroup) return new Set();

  const normalizedWorkingGroup = normalizeGroupName(workingGroup);
  const group =
    groupsCache?.[workingGroup] ||
    Object.values(groupsCache || {}).find((candidate) => {
      const names = [candidate?.name, candidate?.groupName]
        .map(normalizeGroupName)
        .filter(Boolean);
      return names.includes(normalizedWorkingGroup);
    }) ||
    null;

  return new Set(
    [workingGroup, group?.name, group?.groupName]
      .map(normalizeGroupName)
      .filter(Boolean)
  );
}

function assignmentMatchesWorkingGroup(assignment, assignmentId = "") {
  return assignmentMatchesGroupEvidence({
    assignment,
    submissions: submissionsCache?.[assignmentId] || {},
    workingGroup: getWorkingGroup(),
    groups: groupsCache
  });
}

function assignmentHistoricalGroupLabel(assignmentId, assignment) {
  const workingGroup = getWorkingGroup();
  if (!workingGroup) return "";

  const storedGroup = String(assignment?.groupName || "ALL").trim();
  if (!storedGroup || storedGroup.toUpperCase() === "ALL") return "";

  const active = normalizeGroupName(workingGroup);
  if (normalizeGroupName(storedGroup) === active) return "";

  const historical = submissionGroupNames(submissionsCache?.[assignmentId] || {})
    .find((groupName) => normalizeGroupName(groupName) === active);

  return historical ? `Submission history: ${historical}` : "";
}

function assignmentEffectiveGroup(assignmentId, assignment) {
  const historicalLabel = assignmentHistoricalGroupLabel(assignmentId, assignment);
  if (historicalLabel) return getWorkingGroup();
  return String(assignment?.groupName || "ALL").trim() || "ALL";
}

function scheduleAssignmentRecovery() {
  if (assignmentRecoveryQueued) return;
  assignmentRecoveryQueued = true;
  queueMicrotask(async () => {
    assignmentRecoveryQueued = false;
    await recoverOrphanAssignmentsFromSubmissions();
  });
}

async function recoverOrphanAssignmentsFromSubmissions() {
  if (assignmentRecoveryBusy) return;
  if (!Object.keys(submissionsCache || {}).length) return;
  if (!Object.keys(groupsCache || {}).length) return;

  assignmentRecoveryBusy = true;
  try {
    for (const [assignmentId, submissions] of Object.entries(submissionsCache || {})) {
      if (assignmentsCache?.[assignmentId]) continue;

      const recovered = buildRecoveredAssignmentFromSubmissions({
        assignmentId,
        submissions,
        groups: groupsCache,
        recoveredAt: Date.now(),
        recoveredBy: getTeacherName()
      });
      if (!recovered) continue;

      const current = await get(ref(db, `assignments/${assignmentId}`));
      if (current.exists()) continue;

      await set(ref(db, `assignments/${assignmentId}`), recovered);
      console.warn(`Recovered missing assignment ${assignmentId} from preserved submission metadata.`);
    }
  } catch (error) {
    console.error("Could not recover assignments from submission history", error);
  } finally {
    assignmentRecoveryBusy = false;
  }
}

function availableAssignmentGroups() {
  const names = new Set();

  Object.values(groupsCache || {}).forEach((group) => {
    const name = String(group?.name || "").trim();
    if (name) names.add(name);
  });

  Object.keys(groupsCache || {}).forEach((key) => {
    const clean = String(key || "").trim();
    if (clean && clean !== "ALL") names.add(clean);
  });

  Object.values(assignmentsCache || {}).forEach((assignment) => {
    const name = String(assignment?.groupName || "").trim();
    if (name && name !== "ALL") names.add(name);
  });

  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderAssignmentFilterOptions() {
  renderAssignmentEvaluationFilterOptions();
}

function assignmentEvaluationTarget(assignment) {
  return evaluationTargetForAssignment(
    assignment,
    String(assignment?.groupName || "").trim()
  );
}

function assignmentCriterionFilterKey(assignment, target = assignmentEvaluationTarget(assignment)) {
  if (isExamAssignment(assignment)) return "__EXAM__";
  if (!target.criterionId) return "__UNASSIGNED__";
  return `${String(assignment?.groupName || "")}::${target.criterionId}`;
}

function assignmentCriterionLabel(assignment, target = assignmentEvaluationTarget(assignment)) {
  if (isExamAssignment(assignment)) return "Exam";
  return String(
    target.criterionNameSnapshot ||
    assignment?.groupEvaluationCriterionName ||
    target.criterionId ||
    "Unassigned category"
  ).trim();
}

function renderAssignmentEvaluationFilterOptions() {
  if (!assignmentFilterBlock || !assignmentFilterCriterion) return;

  const previousBlock = String(assignmentFilterBlock.value || "ALL");
  const previousCriterion = String(assignmentFilterCriterion.value || "ALL");
  const blocks = new Set();
  const criteria = new Map();

  Object.entries(assignmentsCache || {}).forEach(([assignmentId, assignment]) => {
    const groupName = String(assignment?.groupName || "ALL").trim();
    if (!assignmentMatchesWorkingGroup(assignment, assignmentId)) return;

    const target = assignmentEvaluationTarget(assignment);
    if (target.block) blocks.add(target.block);

    const key = assignmentCriterionFilterKey(assignment, target);
    const baseLabel = assignmentCriterionLabel(assignment, target);
    const label = baseLabel;
    criteria.set(key, label);
  });

  assignmentFilterBlock.innerHTML =
    '<option value="ALL">All blocks</option>' +
    [...blocks].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`)
      .join("");

  assignmentFilterCriterion.innerHTML =
    '<option value="ALL">All categories</option>' +
    [...criteria.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }))
      .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
      .join("");

  assignmentFilterBlock.value =
    [...assignmentFilterBlock.options].some((option) => option.value === previousBlock)
      ? previousBlock
      : "ALL";
  assignmentFilterCriterion.value =
    [...assignmentFilterCriterion.options].some((option) => option.value === previousCriterion)
      ? previousCriterion
      : "ALL";
}

function assignmentMatchesFilters(assignment, assignmentId = "") {
  const codeQuery = String(assignmentFilterCode.value || "").trim().toUpperCase();
  const dateQuery = String(assignmentFilterDate.value || "").trim();
  const blockQuery = String(assignmentFilterBlock?.value || "ALL").trim();
  const criterionQuery = String(assignmentFilterCriterion?.value || "ALL").trim();

  const code = String(assignment?.code || "").toUpperCase();
  const target = assignmentEvaluationTarget(assignment);
  const criterionKey = assignmentCriterionFilterKey(assignment, target);

  if (codeQuery && !code.includes(codeQuery)) return false;
  if (dateQuery && dateFilterKey(assignment?.dueAt) !== dateQuery) return false;
  if (!assignmentMatchesWorkingGroup(assignment, assignmentId)) return false;
  if (blockQuery !== "ALL" && target.block !== blockQuery) return false;
  if (criterionQuery !== "ALL" && criterionKey !== criterionQuery) return false;

  return true;
}

function renderAssignmentList() {
  const allEntries = Object.entries(assignmentsCache || {})
    .map(([id, assignment]) => ({
      id,
      assignment,
      evaluation: assignmentEvaluationState(id, assignment)
    }))
    .sort((a, b) => {
      if (a.evaluation.complete !== b.evaluation.complete) {
        return a.evaluation.complete ? 1 : -1;
      }
      return Number(b.assignment?.createdAt || 0) - Number(a.assignment?.createdAt || 0);
    });

  const entries = allEntries.filter(({ id, assignment }) => assignmentMatchesFilters(assignment, id));

  const recoveredCount = allEntries.filter(({ assignment }) =>
    assignment?.recoveredFromSubmissionHistory
  ).length;
  assignmentBrowserCount.textContent =
    `${entries.length} shown · ${allEntries.length} existing${recoveredCount ? ` · ${recoveredCount} recovered` : ""}`;

  if (!entries.length) {
    const workingGroup = getWorkingGroup();
    teacherAssignmentList.innerHTML = allEntries.length
      ? `<div class="status-text">No assignments are linked to ${escapeHtml(workingGroup || "the active group")} with the current filters. ${allEntries.length} existing assignment${allEntries.length === 1 ? "" : "s"} remain stored in YouTeach. Use the group button beside the teacher name to switch groups.</div>`
      : '<div class="status-text">No assignments exist yet.</div>';
    selectedAssignmentId = "";
    renderDetail();
    return;
  }

  if (!entries.some(({ id }) => id === selectedAssignmentId)) {
    selectedAssignmentId = entries[0].id;
  }

  teacherAssignmentList.innerHTML = entries.map(({ id, assignment, evaluation }) => {
    const count = evaluation.submitted;
    const total = evaluation.totalStudents;
    const missing = evaluation.missing;
    const isCogAssignment = evaluation.isCog;
    const evaluatedClass = evaluation.complete && !evaluation.isCog ? "evaluated" : "";
    const target = assignmentEvaluationTarget(assignment);
    const criterionLabel = assignmentCriterionLabel(assignment, target);
    const historicalGroupLabel = assignmentHistoricalGroupLabel(id, assignment);

    return `
      <article
        class="assignment-item ${id === selectedAssignmentId ? "active" : ""} ${evaluatedClass}"
        data-assignment-select="${id}"
        title="${escapeHtml(assignment.title || "Assignment")}"
      >

        <div class="assignment-code-row">
          <span class="assignment-code">${escapeHtml(assignment.code || "")}</span>
        </div>

        <strong>${escapeHtml(assignment.title || "Assignment")}</strong>

        <span class="assignment-item-meta">
          <span class="assignment-mini-chip">${escapeHtml(assignment.groupName || "ALL")}</span>
          ${historicalGroupLabel
            ? `<span class="assignment-mini-chip assignment-history-group">${escapeHtml(historicalGroupLabel)}</span>`
            : ""}
          <span class="assignment-mini-chip assignment-target-block">${escapeHtml(target.block || "No block")}</span>
          <span class="assignment-mini-chip assignment-target-criterion">${escapeHtml(criterionLabel)}</span>
          ${assignment.recipientTeamTarget
            ? `<span class="assignment-mini-chip">${escapeHtml(assignment.recipientTeamTarget)}</span>`
            : ""}
          <span class="assignment-mini-chip">${escapeHtml(formatCompactDate(assignment.dueAt))}</span>
          <span class="assignment-mini-chip ${assignment.active ? "open" : "closed"}">
            ${assignment.active ? "Open" : "Closed"}
          </span>
          ${evaluation.complete && !evaluation.isCog ? '<span class="evaluated-chip">Evaluated</span>' : ""}
        </span>

        <span class="assignment-progress">
          ${isCogAssignment
            ? `${count}/${total} results · ${missing} no result`
            : `${count}/${total} submitted · ${evaluation.graded}/${count || 0} graded · ${missing} missing`}
        </span>
      </article>
    `;
  }).join("");

  renderDetail();
}

function renderDetail() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) {
    assignmentDetail.hidden = true;
    assignmentDetailEmpty.hidden = false;
    selectedDriveFolderUrl = "";
    if (cogResultsPanel) cogResultsPanel.hidden = true;
    if (saveSelectedTemplateBtn) saveSelectedTemplateBtn.disabled = true;
    return;
  }

  assignmentDetail.hidden = false;
  assignmentDetailEmpty.hidden = true;

  const isCogAssignment = assignmentTypeCodeFor(assignment) === "COG";
  const students = assignmentStudents(assignment, selectedAssignmentId);
  const resultsByStudent = assignmentCogResults(selectedAssignmentId);
  const cogResultKeys = cogResultKeysForStudents(resultsByStudent, students);
  const submissions = assignmentSubmissions(selectedAssignmentId);
  const validSubmissionEntries = Object.entries(submissions)
    .filter(([, submission]) => submission?.driveFileId)
    .sort((a, b) => {
      const aGraded = submissionIsGraded(a[1]);
      const bGraded = submissionIsGraded(b[1]);
      if (aGraded !== bGraded) return aGraded ? 1 : -1;
      return String(a[1]?.studentName || "")
        .localeCompare(String(b[1]?.studentName || ""));
    });

  const submittedKeys = isCogAssignment
    ? cogResultKeys
    : new Set(validSubmissionEntries.map(([studentKey]) => studentKey));
  const missing = students.filter(([studentKey]) => !submittedKeys.has(studentKey));

  selectedDriveFolderUrl =
    validSubmissionEntries.find(([, submission]) => submission.driveFolderUrl)?.[1]?.driveFolderUrl || "";

  openDriveFolderBtn.disabled = isCogAssignment || !selectedDriveFolderUrl;
  syncAiGradesBtn.disabled = isCogAssignment || validSubmissionEntries.length === 0;
  detailManualGradingBtn.disabled = isCogAssignment || validSubmissionEntries.length === 0;
  driveStatus.textContent = isCogAssignment
    ? "Verified game receipts are stored in YouTeach as Classroom Online Games results."
    : (selectedDriveFolderUrl
      ? "PDFs are stored in the Google Drive folder for this task."
      : "The Drive folder is created automatically with the first PDF submission.");

  detailTitle.textContent = `${assignment.code || ""} · ${assignment.title || "Assignment"}`;
  const lockedBySubmissions = assignmentHasSubmissions(selectedAssignmentId) || (isCogAssignment && cogResultKeys.size > 0);
  const codeLockText = lockedBySubmissions
    ? (isCogAssignment ? " · Definition locked after first result" : " · Code locked after first submission")
    : "";
  const recipientScopeText = assignment.recipientTeamTarget
    ? ` · ${assignment.recipientTeamTarget}`
    : "";
  const detailTarget = assignmentEvaluationTarget(assignment);
  const detailCriterion = assignmentCriterionLabel(assignment, detailTarget);
  const historicalGroupLabel = assignmentHistoricalGroupLabel(selectedAssignmentId, assignment);
  const recoveryText = assignment.recoveredFromSubmissionHistory
    ? " · Recovered from preserved submissions"
    : "";
  const historyText = historicalGroupLabel ? ` · ${historicalGroupLabel}` : "";
  detailMeta.textContent = `${assignment.groupName || "ALL"}${historyText}${recipientScopeText} · ${detailTarget.block || "No block"} → ${detailCriterion} · Due: ${formatDate(assignment.dueAt)} · ${assignment.active ? "Open" : "Closed"}${recoveryText}${codeLockText}`;
  eligibleCount.textContent = students.length;
  submittedCount.textContent = isCogAssignment ? cogResultKeys.size : validSubmissionEntries.length;
  missingCount.textContent = missing.length;
  if (eligibleCountLabel) eligibleCountLabel.textContent = "Students";
  if (submittedCountLabel) submittedCountLabel.textContent = isCogAssignment ? "Results" : "Submitted";
  if (missingCountLabel) missingCountLabel.textContent = isCogAssignment ? "No result" : "Missing";
  detailAiGradingBtn.disabled = isCogAssignment || validSubmissionEntries.length === 0;
  detailManualGradingBtn.disabled = isCogAssignment || validSubmissionEntries.length === 0;
  if (saveSelectedTemplateBtn) saveSelectedTemplateBtn.disabled = false;
  toggleAssignmentBtn.textContent = assignment.active ? "Close Assignment" : "Reopen Assignment";
  editCriteriaBtn.disabled = lockedBySubmissions;
  editCriteriaBtn.title = lockedBySubmissions
    ? (isCogAssignment ? "Criteria locked after the first game result." : "This assignment already has submissions and its definition is locked.")
    : "Edit evaluation criteria";
  renderEvaluationCriteria(assignment);
  renderProjectProgress(assignment);
  renderCogResults(assignment, students);
  submissionList.hidden = isCogAssignment;

  if (isCogAssignment) {
    manualGradingPanel.hidden = true;
    selectedManualStudentKey = "";
    examAnnotationPanel.hidden = true;
    aiSyncStatus.textContent = "";
  } else if (lockedBySubmissions) {
    editCriteriaBtn.title = "Criteria locked after the first submission.";
  }

  submissionList.innerHTML = isCogAssignment ? "" : (validSubmissionEntries.length
    ? validSubmissionEntries.map(([studentKey, submission]) => {
        const graded = submissionIsGraded(submission);
        const gradeTotal = gradingTotalForSubmission(submission);
        const published = Boolean(submission?.gradePublished && gradeTotal !== null);
        const gradingMode = String(submission?.grading?.mode || "");
        const gradingStateLabel = gradeTotal === null
          ? (gradingMode === "ai" ? "AI reviewed · manual review needed" : "Pending grading")
          : (published
            ? "Published"
            : (gradingMode === "ai" ? "AI graded · teacher review pending" : "Manual grade · unpublished"));
        return `
          <article class="submission-card ${graded ? "graded" : "pending-grade"} ${!manualGradingPanel.hidden && selectedManualStudentKey === studentKey ? "selected-for-grading" : ""}" data-submission-student-key="${escapeHtml(studentKey)}" data-student-record-key="${escapeHtml(studentKey)}">
            <h4>${escapeHtml(submission.studentName || "Student")}</h4>
            <div class="submission-meta">
              ${escapeHtml(submission.studentNumber || "No ID")} ·
              ${escapeHtml(submission.groupName || "")} ·
              ${Math.max(1, Math.round(Number(submission.size || 0) / 1024))} KB ·
              ${escapeHtml(formatDate(submission.updatedAt || submission.submittedAt))}
            </div>

            <div class="grading-state-chip ${published ? "graded" : (graded ? "pending" : "pending")}">
              ${escapeHtml(gradingStateLabel)}
            </div>

            <div class="review-chip">${escapeHtml(identityStatusLabel(submission.identityReviewStatus))}</div>

            ${gradeTotal === null
              ? (gradingMode === "ai"
                ? '<div class="grade-display needs-review"><span>AI review</span><strong>Manual review needed</strong></div>'
                : "")
              : `<div class="grade-display ${gradingMode === "ai" ? "ai" : "manual"}">
                   <span>${gradingMode === "ai" ? "AI grade" : "Manual grade"}</span>
                   <strong>${escapeHtml(Number(gradeTotal.toFixed(2)))} / 100</strong>
                   <small>${published ? "Published" : "Unpublished"}</small>
                 </div>`
            }

            ${gradeHistoryHtml(submission)}

            <div class="submission-card-actions">
              <a class="pdf-link" href="${escapeHtml(submission.driveFileUrl || "#")}" target="_blank" rel="noopener">
                Open submitted PDF →
              </a>
              <div class="submission-grade-actions">
                ${isExamAssignment(assignment)
                  ? `<button type="button" class="manual-takeover-btn" data-annotate-exam="${escapeHtml(studentKey)}">${submission.examAnnotatedDriveFileId ? "Edit annotations" : "Annotate exam"}</button>`
                  : ""
                }
                ${submission.examAnnotatedDriveFileUrl
                  ? `<a class="pdf-link" href="${escapeHtml(submission.examAnnotatedDriveFileUrl)}" target="_blank" rel="noopener">Graded PDF</a>`
                  : ""
                }
                ${gradingMode === "ai" && gradeTotal !== null
                  ? `<button type="button" class="manual-takeover-btn" data-manual-card-grade="${escapeHtml(studentKey)}">Manual grading</button>`
                  : ""
                }
                ${gradingMode === "manual" && gradeTotal !== null
                  ? `<button type="button" class="clear-manual-grade-btn" data-clear-card-grade="${escapeHtml(studentKey)}">Clear grade</button>`
                  : ""
                }
                ${gradeTotal !== null
                  ? `<button type="button" class="publish-grade-btn" data-publish-grade="${escapeHtml(studentKey)}">${published ? "Unpublish" : "Publish grade"}</button>`
                  : ""
                }
              </div>
            </div>
          </article>
        `;
      }).join("")
    : '<div class="status-text">No PDF submissions yet.</div>');

  if (missingSummary) {
    missingSummary.textContent = isCogAssignment
      ? `No result yet (${missing.length})`
      : `Missing submissions (${missing.length})`;
  }

  missingList.innerHTML = missing.length
    ? missing.map(([studentKey, student]) => {
        const name = student.fullName || student.name || student.nickname || "Student";
        const id = student.studentNumber || student.externalId || student.studentId || studentKey || "No ID";
        const group = student.groupName || assignment.groupName || "GENERAL";

        return `
          <article class="missing-student-card" data-student-record-key="${escapeHtml(studentKey)}">
            <div class="missing-student-main">
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(id)} · ${escapeHtml(group)}</span>
            </div>
            <span class="missing-student-chip">${isCogAssignment ? "No result" : "Not submitted"}</span>
          </article>
        `;
      }).join("")
    : `<div class="missing-empty-state">${isCogAssignment ? "Every eligible student has a result." : "No missing submissions."}</div>`;

  if (!isCogAssignment && !manualGradingPanel.hidden) renderManualGrading();
}

function replaceAssignmentLibraryFilterOptions(select, values, allLabel) {
  const previous = select.value;
  const unique = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  select.innerHTML =
    `<option value="">${escapeHtml(allLabel)}</option>` +
    unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  if (unique.includes(previous)) select.value = previous;
  select.disabled = unique.length === 0;
}

function renderAssignmentLibraryFilterOptions() {
  const templates = Object.values(assignmentTemplatesCache || {});
  const contents = templates.map((template) => template?.content || {});
  replaceAssignmentLibraryFilterOptions(
    assignmentLibraryTypeFilter,
    contents.map((content) => content.assignmentTypeCode || content.assignmentType),
    "All types"
  );
  replaceAssignmentLibraryFilterOptions(
    assignmentLibraryCourseFilter,
    contents.map((content) => content.course),
    "All courses"
  );
  replaceAssignmentLibraryFilterOptions(
    assignmentLibrarySubjectFilter,
    contents.map((content) => content.subject),
    "All subjects"
  );
  replaceAssignmentLibraryFilterOptions(
    assignmentLibraryUnitFilter,
    contents.map((content) => content.unit),
    "All units"
  );
  replaceAssignmentLibraryFilterOptions(
    assignmentLibraryTopicFilter,
    contents.map((content) => content.topic),
    "All topics"
  );
  replaceAssignmentLibraryFilterOptions(
    assignmentLibraryTagFilter,
    contents.flatMap((content) => Array.isArray(content.tags) ? content.tags : []),
    "All tags"
  );
}

function assignmentLibraryFilters() {
  return {
    query: assignmentLibrarySearch.value,
    type: assignmentLibraryTypeFilter.value,
    course: assignmentLibraryCourseFilter.value,
    subject: assignmentLibrarySubjectFilter.value,
    unit: assignmentLibraryUnitFilter.value,
    topic: assignmentLibraryTopicFilter.value,
    tag: assignmentLibraryTagFilter.value,
    usage: assignmentLibraryUsageFilter.value,
    status: assignmentLibraryStatusFilter.value
  };
}

function renderAssignmentLibrary() {
  const templates = filterAssignmentTemplates(assignmentTemplatesCache, assignmentLibraryFilters());
  assignmentLibraryCount.textContent = `${templates.length} template${templates.length === 1 ? "" : "s"}`;

  if (!templates.length) {
    assignmentLibraryList.innerHTML =
      '<div class="assignment-library-empty">No templates match these filters.</div>';
    return;
  }

  assignmentLibraryList.innerHTML = templates.map(([id, template]) => {
    const content = template?.content || {};
    const archived = Boolean(template?.archived);
    const type = String(content.assignmentTypeCode || content.assignmentType || "Template");
    const uses = Number(template?.usageCount || 0);
    const meta = [content.course, content.subject, content.unit, content.topic]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const tags = Array.isArray(content.tags) ? content.tags.filter(Boolean) : [];

    return `
      <article class="assignment-template-card${archived ? " archived" : ""}" data-template-id="${escapeHtml(id)}">
        <div class="assignment-template-card-head">
          <h4>${escapeHtml(content.title || "Untitled template")}</h4>
          <span class="assignment-template-type">${escapeHtml(type)}</span>
        </div>
        <div class="assignment-template-meta">
          ${meta.length ? `${meta.map(escapeHtml).join(" · ")}<br>` : ""}
          ${uses} historical use${uses === 1 ? "" : "s"}${archived ? " · Archived" : ""}
        </div>
        ${tags.length ? `
          <div class="assignment-template-tags">
            ${tags.map((tag) => `<span class="assignment-template-tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
        ` : ""}
        <div class="assignment-template-actions">
          ${archived
            ? `<button type="button" data-template-action="restore" data-template-id="${escapeHtml(id)}">Restore</button>`
            : `
              <button type="button" data-template-action="load" data-template-id="${escapeHtml(id)}">Load</button>
              <button type="button" data-template-action="archive" data-template-id="${escapeHtml(id)}">Archive</button>
            `}
        </div>
      </article>
    `;
  }).join("");
}

async function setAssignmentTemplateArchived(templateId, archived) {
  const template = assignmentTemplatesCache[templateId];
  if (!template) return;

  assignmentLibraryStatus.textContent = archived ? "Archiving..." : "Restoring...";
  assignmentLibraryStatus.className = "status-text";

  try {
    const patch = buildAssignmentTemplateArchivePatch({
      template,
      archived,
      now: Date.now(),
      actor: getTeacherName()
    });
    await update(ref(db, `assignmentTemplates/${templateId}`), patch);

    if (archived && loadedAssignmentTemplateId === templateId) {
      loadedAssignmentTemplateId = "";
      assignmentTemplateSource.value = "";
      loadAssignmentTemplateBtn.disabled = true;
    }

    assignmentLibraryStatus.textContent = archived ? "Template archived." : "Template restored.";
    assignmentLibraryStatus.className = "status-text ok";
  } catch (error) {
    console.error(error);
    assignmentLibraryStatus.textContent = error?.message || "Could not update the template.";
    assignmentLibraryStatus.className = "status-text bad";
  }
}

function renderAssignmentTemplateOptions() {
  const previous = assignmentTemplateSource.value;
  const selectedType = selectedAssignmentTypeCode();
  const standardTypeCodes = new Set(["CT", "HW", "EX", "PJ", "PC", "RS", "PT", "COG"]);

  const templates = Object.entries(assignmentTemplatesCache || {})
    .filter(([, template]) => !template?.archived)
    .filter(([, template]) => {
      const templateType = String(template?.content?.assignmentTypeCode || "").trim().toUpperCase();
      if (assignmentType.value === "OTHER") return !standardTypeCodes.has(templateType);
      return templateType === selectedType;
    })
    .sort((a, b) => {
      const aTitle = String(a[1]?.content?.title || "");
      const bTitle = String(b[1]?.content?.title || "");
      return aTitle.localeCompare(bTitle);
    });

  const availableIds = new Set(templates.map(([id]) => id));
  assignmentTemplateSource.innerHTML =
    `<option value="">${templates.length ? "No template selected" : "No saved templates for this type"}</option>` +
    templates.map(([id, template]) => {
      const title = String(template?.content?.title || "Untitled template");
      const uses = Number(template?.usageCount || 0);
      return `<option value="${escapeHtml(id)}">${escapeHtml(title)} · ${uses} use${uses === 1 ? "" : "s"}</option>`;
    }).join("");

  if (previous && availableIds.has(previous)) {
    assignmentTemplateSource.value = previous;
  } else if (loadedAssignmentTemplateId && !availableIds.has(loadedAssignmentTemplateId)) {
    loadedAssignmentTemplateId = "";
  }

  loadAssignmentTemplateBtn.disabled = !assignmentTemplateSource.value;
}

async function saveSelectedAssignmentAsTemplate() {
  if (!saveSelectedTemplateBtn || !assignmentTemplateStatus) return;
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) {
    assignmentTemplateStatus.textContent = "Select an assignment first.";
    assignmentTemplateStatus.className = "status-text bad";
    return;
  }

  if (saveSelectedTemplateBtn) saveSelectedTemplateBtn.disabled = true;
  assignmentTemplateStatus.textContent = "Saving template...";
  assignmentTemplateStatus.className = "status-text";

  try {
    const rubric = getAssignmentRubric(assignment);
    const target = push(ref(db, "assignmentTemplates"));
    const template = buildAssignmentTemplateRecord({
      id: target.key,
      assignment: {
        ...assignment,
        evaluationCriteria: rubric.criteria,
        evaluationDistribution: rubric.distribution,
        evaluationNotes: rubric.notes
      },
      now: Date.now(),
      actor: getTeacherName()
    });
    await set(target, template);
    assignmentTemplateStatus.textContent = "Template saved.";
    assignmentTemplateStatus.className = "status-text ok";
    if (assignmentActionsMenu) assignmentActionsMenu.open = false;
  } catch (error) {
    console.error(error);
    assignmentTemplateStatus.textContent = error?.message || "Could not save the template.";
    assignmentTemplateStatus.className = "status-text bad";
  } finally {
    if (saveSelectedTemplateBtn) saveSelectedTemplateBtn.disabled = !assignmentsCache[selectedAssignmentId];
  }
}

function loadSelectedAssignmentTemplate(templateIdOverride = "") {
  const explicitTemplateId = typeof templateIdOverride === "string" ? templateIdOverride : "";
  const templateId = explicitTemplateId || String(assignmentTemplateSource.value || "");
  const template = assignmentTemplatesCache[templateId];
  if (!template?.content) return;

  const content = template.content;
  const typeCode = String(content.assignmentTypeCode || "").trim().toUpperCase();
  const standardTypeCodes = new Set(["CT", "HW", "EX", "PJ", "PC", "RS", "PT", "COG"]);
  if (standardTypeCodes.has(typeCode)) {
    assignmentType.value = typeCode;
    assignmentOtherType.value = "";
  } else {
    assignmentType.value = "OTHER";
    assignmentOtherType.value = String(content.assignmentType || typeCode || "");
  }
  assignmentOtherTypeField.hidden = assignmentType.value !== "OTHER";
  renderAssignmentTemplateOptions();
  assignmentTemplateSource.value = templateId;
  loadAssignmentTemplateBtn.disabled = false;

  assignmentTitle.value = String(content.title || "");
  assignmentInstructions.value = splitStoredInstructions(content.instructions).visibleInstructions;
  const rubric = getAssignmentRubric(content);
  assignmentEvaluationNotes.value = rubric.notes || "";
  fillRubricEditor(
    createPresetCriteria,
    createCriteriaRows,
    createCriteriaTotal,
    rubric.criteria,
    createDistributionRadios,
    rubric.distribution || "equal"
  );

  assignmentDueAt.value = "";
  projectCheckpointRows.innerHTML = "";
  if (typeCode === "PJ") {
    Object.entries(content.projectCheckpoints || {}).forEach(([id, checkpoint]) => {
      addProjectCheckpointRow({ id, ...(checkpoint || {}), dueAt: null });
    });
  }
  refreshProjectCheckpointBuilder();

  loadedAssignmentTemplateId = templateId;
  createAssignmentPanel.hidden = false;
  if (assignmentActionsMenu) assignmentActionsMenu.open = false;
  createAssignmentStatus.textContent = "Template loaded. Choose group and dates for this assignment.";
  createAssignmentStatus.className = "status-text ok";
  refreshAutomaticTaskCode();
  createAssignmentPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function createAssignment() {
  refreshAutomaticTaskCode();
  const code = assignmentCode.value.trim().toUpperCase();
  const typeValue = selectedAssignmentTypeLabel();
  const typeCode = selectedAssignmentTypeCode();
  const title = assignmentTitle.value.trim();
  const groupName = assignmentGroup.value || "ALL";
  const targetMetadata = assignmentTargetMetadata();
  const instructions = assignmentInstructions.value.trim();
  const dueValue = assignmentDueAt.value;
  const dueAt = dueValue ? new Date(dueValue).getTime() : null;
  refreshDistribution(createPresetCriteria, createCriteriaRows, createCriteriaTotal, createDistributionRadios);
  const rubricResult = collectRubric(createPresetCriteria, createCriteriaRows);
  const evaluationDistribution = getDistributionMode(createDistributionRadios);
  const evaluationNotes = assignmentEvaluationNotes.value.trim();

  if (rubricResult.error) {
    createAssignmentStatus.textContent = rubricResult.error;
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (rubricResult.criteria.length) {
    const rubricPoints = rubricResult.criteria.reduce(
      (sum, criterion) => sum + Number(criterion.maxPoints || 0),
      0
    );
    if (Math.abs(rubricPoints - 100) >= 0.01) {
      createAssignmentStatus.textContent = "Evaluation criteria must total exactly 100 points.";
      createAssignmentStatus.className = "status-text bad";
      return;
    }
  }

  if (!title) {
    createAssignmentStatus.textContent = "Enter an assignment title.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (assignmentType.value === "OTHER" && !assignmentOtherType.value.trim()) {
    createAssignmentStatus.textContent = "Specify the assignment type.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (!assignmentDueAt.value) {
    createAssignmentStatus.textContent = "Select the due date.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (hasGeneratedTeamContext() && !normalizeRecipientKeys(targetMetadata.recipientStudentKeys).length) {
    createAssignmentStatus.textContent = "The selected generated team has no students.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  const projectResult = collectProjectCheckpoints(dueAt);
  if (projectResult.error) {
    createAssignmentStatus.textContent = projectResult.error;
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (!code) {
    createAssignmentStatus.textContent = "Complete type, title, group, and due date to generate the task code.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  if (taskCodeExists(code)) {
    createAssignmentStatus.textContent = "That activity already exists. Change the title, group, date, or type.";
    createAssignmentStatus.className = "status-text bad";
    return;
  }

  createAssignmentBtn.disabled = true;
  createAssignmentStatus.textContent = "Creating...";
  createAssignmentStatus.className = "status-text";

  try {
    const target = push(ref(db, "assignments"));
    const now = Date.now();
    const storedInstructions = buildStoredInstructions(instructions, {
      schemaVersion: 1,
      assignmentType: typeValue,
      assignmentTypeCode: typeCode,
      criteria: rubricResult.criteria,
      distribution: evaluationDistribution,
      notes: evaluationNotes,
      updatedAt: now
    });

    const reusableAssignment = {
      title,
      instructions: storedInstructions,
      assignmentType: typeValue,
      assignmentTypeCode: typeCode,
      evaluationCriteria: rubricResult.criteria,
      evaluationDistribution,
      evaluationNotes,
      projectCheckpoints: typeCode === "PJ" ? projectResult.checkpoints : null
    };

    const sourceTemplate = loadedAssignmentTemplateId
      ? assignmentTemplatesCache[loadedAssignmentTemplateId]
      : null;

    let assignmentPayload;
    if (loadedAssignmentTemplateId) {
      if (!sourceTemplate) throw new Error("The selected template is no longer available.");
      assignmentPayload = buildAssignedInstanceFromTemplate({
        template: { ...sourceTemplate, content: reusableAssignment },
        code,
        groupName,
        dueAt,
        now,
        actor: getTeacherName()
      });
      assignmentPayload = { ...assignmentPayload, ...targetMetadata };
      const templateSnapshot = assignmentPayload.templateSnapshot;
      if (!templateSnapshot) throw new Error("Could not freeze the template snapshot.");

      const multiLocationUpdates = {};
      multiLocationUpdates[`assignments/${target.key}`] = assignmentPayload;
      multiLocationUpdates[`assignmentTemplates/${loadedAssignmentTemplateId}/usageCount`] =
        Number(sourceTemplate.usageCount || 0) + 1;
      multiLocationUpdates[`assignmentTemplates/${loadedAssignmentTemplateId}/lastUsedAt`] = now;
      await update(ref(db), multiLocationUpdates);
    } else {
      assignmentPayload = {
        code,
        ...reusableAssignment,
        groupName,
        ...targetMetadata,
        dueAt,
        active: true,
        storageProvider: "google-drive",
        createdAt: now,
        createdBy: getTeacherName()
      };
      await set(target, assignmentPayload);
    }

    selectedAssignmentId = target.key;
    assignmentType.value = "CT";
    assignmentOtherType.value = "";
    assignmentOtherTypeField.hidden = true;
    assignmentCode.value = "";
    assignmentTitle.value = "";
    assignmentInstructions.value = "";
    assignmentEvaluationNotes.value = "";
    assignmentDueAt.value = "";
    loadedAssignmentTemplateId = "";
    assignmentTemplateSource.value = "";
    applyAssignmentGroupContext();
    loadAssignmentTemplateBtn.disabled = true;
    projectCheckpointRows.innerHTML = "";
    refreshProjectCheckpointBuilder();
    fillRubricEditor(
      createPresetCriteria,
      createCriteriaRows,
      createCriteriaTotal,
      [],
      createDistributionRadios,
      "equal"
    );
    refreshAutomaticTaskCode();
    createAssignmentStatus.textContent = "Assignment created.";
    createAssignmentStatus.className = "status-text ok";
    if (ASSIGNMENTS_MODULE_MODE && window.parent !== window) {
      window.parent.postMessage({ type: "youteach:assignment-created", assignmentId: target.key }, window.location.origin);
    }
    createAssignmentPanel.hidden = true;
    if (assignmentActionsMenu) assignmentActionsMenu.open = false;
  } catch (error) {
    console.error(error);
    const code = String(error?.code || "").replace(/^database\//, "");
    const message = String(error?.message || "").trim();
    createAssignmentStatus.textContent = code
      ? `Could not create the assignment (${code}).`
      : (message ? `Could not create the assignment: ${message}` : "Could not create the assignment.");
    createAssignmentStatus.className = "status-text bad";
  } finally {
    createAssignmentBtn.disabled = false;
  }
}

async function toggleAssignment() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) return;
  await update(ref(db, `assignments/${selectedAssignmentId}`), {
    active: !assignment.active,
    updatedAt: Date.now()
  });
}

function beginCriteriaEdit() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) return;
  if (assignmentHasSubmissions(selectedAssignmentId)) {
    criteriaSaveStatus.textContent = "This assignment already has submissions and can no longer be modified.";
    criteriaSaveStatus.className = "status-text bad";
    criteriaEditPanel.hidden = true;
    return;
  }
  const rubric = getAssignmentRubric(assignment);
  fillRubricEditor(
    editPresetCriteria,
    editCriteriaRows,
    editCriteriaTotal,
    rubric.criteria,
    editDistributionRadios,
    rubric.distribution
  );
  editEvaluationNotes.value = rubric.notes || "";
  criteriaSaveStatus.textContent = "";
  criteriaEditPanel.hidden = false;
}

function cancelCriteriaEdit() {
  criteriaEditPanel.hidden = true;
  criteriaSaveStatus.textContent = "";
}

async function saveEvaluationCriteria() {
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) return;
  if (assignmentHasSubmissions(selectedAssignmentId)) {
    criteriaSaveStatus.textContent = "This assignment already has submissions and can no longer be modified.";
    criteriaSaveStatus.className = "status-text bad";
    criteriaEditPanel.hidden = true;
    return;
  }

  refreshDistribution(editPresetCriteria, editCriteriaRows, editCriteriaTotal, editDistributionRadios);
  const result = collectRubric(editPresetCriteria, editCriteriaRows);
  const evaluationDistribution = getDistributionMode(editDistributionRadios);
  if (result.error) {
    criteriaSaveStatus.textContent = result.error;
    criteriaSaveStatus.className = "status-text bad";
    return;
  }

  if (result.criteria.length) {
    const rubricPoints = result.criteria.reduce(
      (sum, criterion) => sum + Number(criterion.maxPoints || 0),
      0
    );
    if (Math.abs(rubricPoints - 100) >= 0.01) {
      criteriaSaveStatus.textContent = "Evaluation criteria must total exactly 100 points.";
      criteriaSaveStatus.className = "status-text bad";
      return;
    }
  }

  saveCriteriaBtn.disabled = true;
  criteriaSaveStatus.textContent = "Saving...";
  criteriaSaveStatus.className = "status-text";

  try {
    const visibleInstructions = splitStoredInstructions(assignment.instructions).visibleInstructions;
    const storedInstructions = buildStoredInstructions(visibleInstructions, {
      schemaVersion: 1,
      criteria: result.criteria,
      distribution: evaluationDistribution,
      notes: editEvaluationNotes.value.trim(),
      updatedAt: Date.now()
    });

    await update(ref(db, `assignments/${selectedAssignmentId}`), {
      instructions: storedInstructions,
      updatedAt: Date.now()
    });
    criteriaSaveStatus.textContent = "Evaluation criteria saved.";
    criteriaSaveStatus.className = "status-text ok";
    criteriaEditPanel.hidden = true;
  } catch (error) {
    console.error(error);
    criteriaSaveStatus.textContent = "Could not save the evaluation criteria.";
    criteriaSaveStatus.className = "status-text bad";
  } finally {
    saveCriteriaBtn.disabled = false;
  }
}

function wireRubricEditor(presetContainer, customContainer, totalElement, radios) {
  presetContainer.addEventListener("change", () => {
    refreshDistribution(presetContainer, customContainer, totalElement, radios);
  });

  presetContainer.addEventListener("input", () => {
    if (getDistributionMode(radios) === "manual") {
      updateRubricTotal(presetContainer, customContainer, totalElement);
    }
  });

  customContainer.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-criterion]");
    if (!removeButton) return;
    removeButton.closest(".criteria-row")?.remove();
    if (!customContainer.querySelector(".criteria-row")) addCustomCriterionRow(customContainer);
    refreshDistribution(presetContainer, customContainer, totalElement, radios);
  });

  customContainer.addEventListener("input", (event) => {
    if (event.target.matches("[data-criterion-title]")) {
      refreshDistribution(presetContainer, customContainer, totalElement, radios);
      return;
    }
    if (getDistributionMode(radios) === "manual") {
      updateRubricTotal(presetContainer, customContainer, totalElement);
    }
  });

  for (const radio of radios) {
    radio.addEventListener("change", () => {
      refreshDistribution(presetContainer, customContainer, totalElement, radios);
    });
  }
}

let lastAssignmentEditorOpen = { assignmentId: "", at: 0 };

function openAssignmentEditorFromCard(card) {
  if (!card) return false;

  clearTimeout(assignmentCardClickTimer);
  assignmentCardClickTimer = null;

  const assignmentId = String(card.dataset.assignmentSelect || "");
  const assignment = assignmentsCache[assignmentId];
  if (!assignment) return false;

  const now = Date.now();
  if (
    lastAssignmentEditorOpen.assignmentId === assignmentId &&
    now - lastAssignmentEditorOpen.at < 600
  ) {
    return false;
  }

  lastAssignmentEditorOpen = { assignmentId, at: now };
  openAssignmentsModule({
    source: "assignments",
    mode: "edit",
    assignmentId,
    groupName: String(assignment.groupName || getWorkingGroup() || "")
  });
  return true;
}

teacherAssignmentList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-assignment-select]");
  if (!card) return;

  if (event.detail > 1) {
    clearTimeout(assignmentCardClickTimer);
    assignmentCardClickTimer = null;
    openAssignmentEditorFromCard(card);
    return;
  }

  clearTimeout(assignmentCardClickTimer);
  const assignmentId = String(card.dataset.assignmentSelect || "");
  assignmentCardClickTimer = setTimeout(() => {
    assignmentCardClickTimer = null;
    manualGradingPanel.hidden = true;
    examAnnotationPanel.hidden = true;
    selectedManualStudentKey = "";
    selectedAssignmentId = assignmentId;
    renderAssignmentList();
    setTimeout(refreshSelectedAiResults, 0);
  }, CARD_CLICK_DELAY_MS);
});

teacherAssignmentList.addEventListener("dblclick", (event) => {
  const card = event.target.closest("[data-assignment-select]");
  if (!card) return;
  event.preventDefault();
  clearTimeout(assignmentCardClickTimer);
  assignmentCardClickTimer = null;
  openAssignmentEditorFromCard(card);
});

submissionList.addEventListener("click", (event) => {
  const annotateButton = event.target.closest("[data-annotate-exam]");
  if (annotateButton) {
    openExamAnnotation(annotateButton.dataset.annotateExam).catch((error) => {
      console.error(error);
      aiSyncStatus.textContent = "Could not open exam annotations.";
      aiSyncStatus.style.color = "#b91c1c";
    });
    return;
  }

  const manualButton = event.target.closest("[data-manual-card-grade]");
  if (manualButton) {
    openManualGrading(selectedAssignmentId, manualButton.dataset.manualCardGrade);
    return;
  }

  const clearButton = event.target.closest("[data-clear-card-grade]");
  if (clearButton) {
    clearManualGrade(clearButton.dataset.clearCardGrade).catch((error) => {
      console.error(error);
      aiSyncStatus.textContent = "Could not clear the manual grade.";
      aiSyncStatus.style.color = "#b91c1c";
    });
    return;
  }

  const publishButton = event.target.closest("[data-publish-grade]");
  if (publishButton) {
    toggleGradePublication(publishButton.dataset.publishGrade).catch((error) => {
      console.error(error);
      aiSyncStatus.textContent = "Could not change grade publication.";
      aiSyncStatus.style.color = "#b91c1c";
    });
    return;
  }

  if (event.target.closest("a,button")) return;
  const card = event.target.closest("[data-submission-student-key]");
  if (!card) return;

  if (event.detail > 1) {
    clearTimeout(submissionCardClickTimer);
    submissionCardClickTimer = null;
    return;
  }

  clearTimeout(submissionCardClickTimer);
  const assignmentId = selectedAssignmentId;
  const studentKey = card.dataset.submissionStudentKey;
  submissionCardClickTimer = setTimeout(() => {
    submissionCardClickTimer = null;
    openManualGrading(assignmentId, studentKey);
  }, SUBMISSION_CARD_CLICK_DELAY_MS);
});

submissionList.addEventListener("dblclick", (event) => {
  if (event.target.closest("a,button")) return;
  const card = event.target.closest("[data-student-record-key]");
  if (!card) return;

  clearTimeout(submissionCardClickTimer);
  submissionCardClickTimer = null;
  openStudentRecord(card.dataset.studentRecordKey);
});

missingList.addEventListener("dblclick", (event) => {
  const card = event.target.closest("[data-student-record-key]");
  if (!card) return;
  openStudentRecord(card.dataset.studentRecordKey);
});

examToolButtons.forEach((button) => {
  button.addEventListener("click", () => setExamTool(button.dataset.examTool));
});

examAnnotationOverlay.addEventListener("click", (event) => {
  addExamAnnotationFromClick(event);
});

examPrevPageBtn.addEventListener("click", async () => {
  if (examAnnotationState.page <= 1) return;
  examAnnotationState.page -= 1;
  await renderExamPage();
});

examNextPageBtn.addEventListener("click", async () => {
  if (examAnnotationState.page >= examAnnotationState.pageCount) return;
  examAnnotationState.page += 1;
  await renderExamPage();
});

examUndoMarkBtn.addEventListener("click", async () => {
  if (!examAnnotationState.annotations.length) return;
  examAnnotationState.annotations.pop();
  renderExamAnnotationOverlay();
  await persistExamAnnotations().catch(console.error);
});

examClearPageBtn.addEventListener("click", async () => {
  const pageCount = examAnnotationState.annotations.filter(
    (annotation) => annotation.page === examAnnotationState.page
  ).length;
  if (!pageCount) return;
  if (!window.confirm(`Clear all ${pageCount} mark${pageCount === 1 ? "" : "s"} from page ${examAnnotationState.page}?`)) return;
  examAnnotationState.annotations = examAnnotationState.annotations.filter(
    (annotation) => annotation.page !== examAnnotationState.page
  );
  renderExamAnnotationOverlay();
  await persistExamAnnotations().catch(console.error);
});

examAnnotationList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-exam-annotation]");
  if (!button) return;
  removeExamAnnotation(button.dataset.removeExamAnnotation).catch(console.error);
});

examSaveAnnotatedPdfBtn.addEventListener("click", () => {
  saveAnnotatedExamPdf();
});

projectProgressTimeline.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review-project-evidence]");
  if (!button) return;
  button.disabled = true;
  toggleProjectEvidenceReview(button)
    .catch((error) => {
      console.error(error);
      aiSyncStatus.textContent = "Could not update project evidence review.";
      aiSyncStatus.style.color = "#b91c1c";
    })
    .finally(() => {
      button.disabled = false;
    });
});

manualGradingList.addEventListener("input", (event) => {
  if (!event.target.matches("[data-manual-score],[data-manual-percent]")) return;
  syncManualCriterionInputs(event.target);
  updateManualCardTotal(event.target.closest("[data-manual-grade-card]"));
});

manualGradingList.addEventListener("click", (event) => {
  const clearButton = event.target.closest("[data-clear-manual-grade]");
  if (clearButton) {
    clearManualGrade(clearButton.dataset.clearManualGrade);
    return;
  }

  const saveButton = event.target.closest("[data-save-manual-grade]");
  if (!saveButton) return;
  saveManualGrade(saveButton.dataset.saveManualGrade);
});

function refreshSelectedAiResults() {
  const assignmentId = selectedAssignmentId;
  const assignment = assignmentsCache[assignmentId];
  if (!assignment || !assignmentHasSubmissions(assignmentId)) return;

  const now = Date.now();
  if (now - lastPassiveAiSyncAt < 5000) return;
  lastPassiveAiSyncAt = now;

  let pendingRun = null;
  try {
    pendingRun = JSON.parse(localStorage.getItem(AI_PENDING_RUN_KEY) || "null");
  } catch (_) {}

  const isPendingRun =
    pendingRun &&
    String(pendingRun.assignmentId || "") === assignmentId &&
    Number(pendingRun.startedAt || 0) > 0;

  syncAiGrades({
    assignmentId,
    minimumResultsModifiedTime: isPendingRun ? Number(pendingRun.startedAt) : 0,
    forceRegrade: Boolean(isPendingRun),
    silentPending: true
  }).then((result) => {
    if (result?.ok && isPendingRun) {
      try { localStorage.removeItem(AI_PENDING_RUN_KEY); } catch (_) {}
    }

    if (result?.error && assignmentId === selectedAssignmentId) {
      aiSyncStatus.textContent = `AI sync error: ${result.error}`;
      aiSyncStatus.style.color = "#b91c1c";
    }
  }).catch((error) => {
    if (assignmentId === selectedAssignmentId) {
      aiSyncStatus.textContent = `AI sync error: ${error?.message || "Unknown error"}`;
      aiSyncStatus.style.color = "#b91c1c";
    }
  });
}

function requestInitialAiSync() {
  if (initialAiSyncRequested) return;
  if (!selectedAssignmentId || !assignmentsCache[selectedAssignmentId]) return;
  if (!assignmentHasSubmissions(selectedAssignmentId)) return;

  initialAiSyncRequested = true;
  setTimeout(refreshSelectedAiResults, 600);
}

retryAiSyncBtn.addEventListener("click", syncAiGrades);
detailAiGradingBtn.addEventListener("click", () => {
  if (selectedAssignmentId) openChatGPTGrading(selectedAssignmentId);
});
detailManualGradingBtn.addEventListener("click", () => {
  if (selectedAssignmentId) openManualGrading(selectedAssignmentId);
});

window.addEventListener("youteach:working-group-changed", () => {
  selectedAssignmentId = "";
  renderGroupOptions();
  renderAssignmentEvaluationFilterOptions();
  renderAssignmentList();
});
window.addEventListener("focus", refreshSelectedAiResults);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshSelectedAiResults();
});

openDriveFolderBtn.addEventListener("click", () => {
  if (selectedDriveFolderUrl) window.open(selectedDriveFolderUrl, "_blank", "noopener");
});

assignmentType.addEventListener("change", () => {
  assignmentOtherTypeField.hidden = assignmentType.value !== "OTHER";
  loadedAssignmentTemplateId = "";
  assignmentTemplateSource.value = "";
  refreshAutomaticTaskCode();
  refreshProjectCheckpointBuilder();
});
assignmentOtherType.addEventListener("input", refreshAutomaticTaskCode);
assignmentTitle.addEventListener("input", refreshAutomaticTaskCode);
assignmentGroup.addEventListener("change", refreshAutomaticTaskCode);
assignmentTargetSelect?.addEventListener("change", () => {
  renderAssignmentTargetOptions();
  refreshAutomaticTaskCode();
});
assignmentDueAt.addEventListener("input", refreshAutomaticTaskCode);

assignmentFilterCode.addEventListener("input", renderAssignmentList);
assignmentFilterDate.addEventListener("change", renderAssignmentList);
assignmentFilterBlock?.addEventListener("change", renderAssignmentList);
assignmentFilterCriterion?.addEventListener("change", renderAssignmentList);

clearAssignmentFiltersBtn.addEventListener("click", () => {
  assignmentFilterCode.value = "";
  assignmentFilterDate.value = "";
  renderAssignmentEvaluationFilterOptions();
  assignmentFilterBlock.value = "ALL";
  assignmentFilterCriterion.value = "ALL";
  renderAssignmentList();
});

assignmentScrollLeftBtn.addEventListener("click", () => {
  teacherAssignmentList.scrollBy({
    left: -Math.max(300, teacherAssignmentList.clientWidth * 0.8),
    behavior: "smooth"
  });
});

assignmentScrollRightBtn.addEventListener("click", () => {
  teacherAssignmentList.scrollBy({
    left: Math.max(300, teacherAssignmentList.clientWidth * 0.8),
    behavior: "smooth"
  });
});

createAssignmentBtn.addEventListener("click", createAssignment);
saveSelectedTemplateBtn?.addEventListener("click", saveSelectedAssignmentAsTemplate);
openAssignmentsModuleBtn?.addEventListener("click", () => {
  if (ASSIGNMENTS_MODULE_MODE) return;
  openAssignmentsModule({ source: "assignments" });
});

assignmentLibrarySearch.addEventListener("input", renderAssignmentLibrary);
[
  assignmentLibraryTypeFilter,
  assignmentLibraryCourseFilter,
  assignmentLibrarySubjectFilter,
  assignmentLibraryUnitFilter,
  assignmentLibraryTopicFilter,
  assignmentLibraryTagFilter,
  assignmentLibraryUsageFilter,
  assignmentLibraryStatusFilter
].forEach((select) => select.addEventListener("change", renderAssignmentLibrary));

clearAssignmentLibraryFiltersBtn.addEventListener("click", () => {
  assignmentLibrarySearch.value = "";
  assignmentLibraryTypeFilter.value = "";
  assignmentLibraryCourseFilter.value = "";
  assignmentLibrarySubjectFilter.value = "";
  assignmentLibraryUnitFilter.value = "";
  assignmentLibraryTopicFilter.value = "";
  assignmentLibraryTagFilter.value = "";
  assignmentLibraryUsageFilter.value = "all";
  assignmentLibraryStatusFilter.value = "active";
  renderAssignmentLibrary();
});

assignmentLibraryList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-template-action][data-template-id]");
  if (!button) return;

  const templateId = String(button.dataset.templateId || "");
  const action = String(button.dataset.templateAction || "");
  if (!templateId || !assignmentTemplatesCache[templateId]) return;

  if (action === "load") {
    loadSelectedAssignmentTemplate(templateId);
    return;
  }

  if (action === "archive" || action === "restore") {
    button.disabled = true;
    await setAssignmentTemplateArchived(templateId, action === "archive");
  }
});


assignmentTemplateSource.addEventListener("change", () => {
  loadAssignmentTemplateBtn.disabled = !assignmentTemplateSource.value;
  if (!assignmentTemplateSource.value) loadedAssignmentTemplateId = "";
});
loadAssignmentTemplateBtn.addEventListener("click", () => loadSelectedAssignmentTemplate());
toggleAssignmentBtn.addEventListener("click", toggleAssignment);
addProjectCheckpointBtn.addEventListener("click", () => addProjectCheckpointRow());
projectCheckpointRows.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-checkpoint]");
  if (!removeButton) return;
  removeButton.closest("[data-project-checkpoint-row]")?.remove();
  if (!projectCheckpointRows.querySelector("[data-project-checkpoint-row]")) addProjectCheckpointRow();
});
addCreateCriterionBtn.addEventListener("click", () => {
  addCustomCriterionRow(createCriteriaRows);
  refreshDistribution(createPresetCriteria, createCriteriaRows, createCriteriaTotal, createDistributionRadios);
});
addEditCriterionBtn.addEventListener("click", () => {
  addCustomCriterionRow(editCriteriaRows);
  refreshDistribution(editPresetCriteria, editCriteriaRows, editCriteriaTotal, editDistributionRadios);
});
editCriteriaBtn.addEventListener("click", beginCriteriaEdit);
cancelCriteriaBtn.addEventListener("click", cancelCriteriaEdit);
saveCriteriaBtn.addEventListener("click", saveEvaluationCriteria);

wireRubricEditor(createPresetCriteria, createCriteriaRows, createCriteriaTotal, createDistributionRadios);
wireRubricEditor(editPresetCriteria, editCriteriaRows, editCriteriaTotal, editDistributionRadios);
fillRubricEditor(
  createPresetCriteria,
  createCriteriaRows,
  createCriteriaTotal,
  [],
  createDistributionRadios,
  "equal"
);
applyAssignmentModuleContext();
refreshAutomaticTaskCode();
refreshProjectCheckpointBuilder();
renderAssignmentTemplateOptions();
renderAssignmentLibraryFilterOptions();
renderAssignmentLibrary();
if (saveSelectedTemplateBtn) saveSelectedTemplateBtn.disabled = true;

logoutBtn.addEventListener("click", logoutTeacher);

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = visibleGroups(snapshot.val() || {});
  renderGroupOptions();
  renderAssignmentFilterOptions();
  renderAssignmentEvaluationFilterOptions();
  renderAssignmentList();
  scheduleAssignmentEvaluationMigration();
  scheduleAssignmentRecovery();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderDetail();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderAssignmentFilterOptions();
  renderAssignmentEvaluationFilterOptions();
  renderAssignmentList();
  refreshAutomaticTaskCode();
  requestInitialAiSync();
  scheduleAssignmentEvaluationMigration();
  scheduleAssignmentRecovery();
});

onValue(ref(db, "assignmentTemplates"), (snapshot) => {
  assignmentTemplatesCache = snapshot.val() || {};
  renderAssignmentTemplateOptions();
  renderAssignmentLibraryFilterOptions();
  renderAssignmentLibrary();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  submissionsCache = snapshot.val() || {};
  renderAssignmentEvaluationFilterOptions();
  renderAssignmentList();
  requestInitialAiSync();
  scheduleAssignmentEvaluationMigration();
  scheduleAssignmentRecovery();
});

onValue(ref(db, "assignmentProjectEvidence"), (snapshot) => {
  projectEvidenceCache = snapshot.val() || {};
  renderDetail();
});

