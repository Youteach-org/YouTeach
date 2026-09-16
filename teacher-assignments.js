import { db } from "./firebase.js";
import { ref, onValue, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

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
const assignmentInstructions = document.getElementById("assignmentInstructions");
const assignmentDueAt = document.getElementById("assignmentDueAt");
const createPresetCriteria = document.getElementById("createPresetCriteria");
const createCriteriaRows = document.getElementById("createCriteriaRows");
const createCriteriaTotal = document.getElementById("createCriteriaTotal");
const createDistributionRadios = document.querySelectorAll('input[name="createDistribution"]');
const addCreateCriterionBtn = document.getElementById("addCreateCriterionBtn");
const assignmentEvaluationNotes = document.getElementById("assignmentEvaluationNotes");
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
const createAssignmentStatus = document.getElementById("createAssignmentStatus");
const createAssignmentPanel = document.getElementById("createAssignmentPanel");
const showCreateAssignmentBtn = document.getElementById("showCreateAssignmentBtn");
const hideCreateAssignmentBtn = document.getElementById("hideCreateAssignmentBtn");
const assignmentActionsMenu = document.getElementById("assignmentActionsMenu");
const teacherAssignmentList = document.getElementById("teacherAssignmentList");
const assignmentBrowserCount = document.getElementById("assignmentBrowserCount");
const assignmentFilterCode = document.getElementById("assignmentFilterCode");
const assignmentFilterDate = document.getElementById("assignmentFilterDate");
const assignmentFilterGroup = document.getElementById("assignmentFilterGroup");
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
const submissionList = document.getElementById("submissionList");
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
const manualGradingPanel = document.getElementById("manualGradingPanel");
const manualGradingTitle = document.getElementById("manualGradingTitle");
const manualGradingList = document.getElementById("manualGradingList");
const closeManualGradingBtn = document.getElementById("closeManualGradingBtn");
const syncAiGradesBtn = document.getElementById("syncAiGradesBtn");
const aiSyncStatus = document.getElementById("aiSyncStatus");
const logoutBtn = document.getElementById("logoutBtn");
const teacherIdentity = document.getElementById("teacherIdentity");

let assignmentsCache = {};
let submissionsCache = {};
let studentsCache = {};
let groupsCache = {};
const WORKING_GROUP_KEY = "youteachWorkingGroup";

let selectedAssignmentId = "";
let selectedDriveFolderUrl = "";
let selectedManualStudentKey = "";
let assignmentFilterGroupTouched = false;
const aiAutoSyncTimers = new Map();

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
  const datePart = dateCode(assignmentDueAt.value);

  if (!typePart || !titlePart || !groupPart || !datePart) return "";
  return [typePart, titlePart, groupPart, datePart].join("-");
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
  const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0);

  if (!criteria.length && !notes) {
    criteriaReadOnly.innerHTML = '<div class="status-text">No evaluation criteria.</div>';
    return;
  }

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

  const notesHtml = notes
    ? `<div class="criteria-compact-notes" title="${escapeHtml(notes)}">Notes: ${escapeHtml(notes)}</div>`
    : "";

  criteriaReadOnly.innerHTML = `
    ${criteriaHtml}
    <div class="criteria-compact-footer">
      ${notesHtml}
      <div class="criteria-compact-total">${Number(total.toFixed(2))} / 100 points</div>
    </div>
  `;
}

function assignmentStudents(assignment) {
  const target = String(assignment?.groupName || "ALL");
  return Object.entries(studentsCache || {})
    .filter(([, student]) => target === "ALL" || String(student.groupName || "GENERAL") === target)
    .sort((a, b) => String(a[1]?.fullName || a[1]?.name || "").localeCompare(String(b[1]?.fullName || b[1]?.name || "")));
}

function assignmentSubmissions(assignmentId) {
  return submissionsCache?.[assignmentId] || {};
}

function assignmentHasSubmissions(assignmentId) {
  return Object.values(assignmentSubmissions(assignmentId))
    .some((submission) => Boolean(submission?.driveFileId));
}

function assignmentEvaluationState(assignmentId, assignment) {
  const submissions = Object.values(assignmentSubmissions(assignmentId))
    .filter((submission) => submission?.driveFileId);

  const submitted = submissions.length;
  const graded = submissions.filter((submission) =>
    submission?.reviewStatus === "graded" &&
    submission?.grading &&
    submission?.grading?.totalScore !== null &&
    submission?.grading?.totalScore !== undefined
  ).length;

  const totalStudents = assignmentStudents(assignment).length;
  const missing = Math.max(0, totalStudents - submitted);

  const complete =
    submitted > 0 &&
    graded === submitted &&
    (!assignment?.active || missing === 0);

  return { submitted, graded, totalStudents, missing, complete };
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
    "11. OBLIGATORIO: al terminar, crea o reemplaza dentro de ESTA MISMA carpeta el archivo:",
    code + "--grading-results.json",
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
      silentPending: true
    });

    if (result?.ok) {
      stopAiAutoSync(assignmentId);
      return;
    }

    if (attempts >= maxAttempts) {
      stopAiAutoSync(assignmentId);
      if (selectedAssignmentId === assignmentId) {
        aiSyncStatus.textContent = "AI result not detected yet. Use Check AI Results later.";
        aiSyncStatus.style.color = "#b45309";
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

function aiCandidateTotalForSubmission(submission) {
  const raw = submission?.aiGradingCandidate?.totalScore;
  if (raw === null || raw === undefined || raw === "") return null;
  const total = Number(raw);
  return Number.isFinite(total) ? total : null;
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
    syncAiGradesBtn.disabled = true;
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
    }

    return result;
  } catch (error) {
    console.error(error);
    if (isSelected && !options.silentPending) {
      aiSyncStatus.textContent = error?.message || "Could not apply AI grades.";
      aiSyncStatus.style.color = "#b91c1c";
    }
    return { ok: false, error: error?.message || "Could not apply AI grades." };
  } finally {
    if (isSelected) syncAiGradesBtn.disabled = false;
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
  selectedAssignmentId = assignmentId;
  selectedManualStudentKey = studentKey;
  renderAssignmentList();
  manualGradingPanel.hidden = false;
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
    await update(
      ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}`),
      {
        grading: {
          mode: "manual",
          criterionScores,
          totalScore: Number(totalScore.toFixed(2)),
          rubricTotal: Number(criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0).toFixed(2)),
          feedback,
          gradedAt: Date.now(),
          gradedBy: getTeacherName()
        },
        reviewStatus: "manual-graded",
        teacherReviewStatus: "accepted",
        gradePublished: false,
        gradePublishedAt: null,
        gradePublishedBy: null,
        gradingSourceSubmissionUpdatedAt: Number(submissionsCache?.[selectedAssignmentId]?.[studentKey]?.updatedAt || submissionsCache?.[selectedAssignmentId]?.[studentKey]?.submittedAt || 0),
        gradingSourceDriveFileId: String(submissionsCache?.[selectedAssignmentId]?.[studentKey]?.driveFileId || ""),
        updatedAt: Date.now()
      }
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
    await update(
      ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}`),
      {
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
        updatedAt: Date.now()
      }
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

  await update(
    ref(db, `assignmentSubmissions/${selectedAssignmentId}/${studentKey}`),
    publish
      ? {
          gradePublished: true,
          gradePublishedAt: Date.now(),
          gradePublishedBy: getTeacherName(),
          teacherReviewStatus: "accepted",
          updatedAt: Date.now()
        }
      : {
          gradePublished: false,
          gradePublishedAt: null,
          gradePublishedBy: null,
          updatedAt: Date.now()
        }
  );
}

function renderGroupOptions() {
  const current = assignmentGroup.value;
  const groups = Object.values(groupsCache || {})
    .map((group) => String(group?.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  assignmentGroup.innerHTML =
    '<option value="ALL">All groups</option>' +
    groups.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  if ([...assignmentGroup.options].some((option) => option.value === current)) {
    assignmentGroup.value = current;
  }
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
  const groups = availableAssignmentGroups();
  const previous = assignmentFilterGroup.value;
  const workingGroup = getWorkingGroup();

  assignmentFilterGroup.innerHTML =
    '<option value="ALL">All groups</option>' +
    groups.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  const optionValues = new Set([...assignmentFilterGroup.options].map((option) => option.value));

  if (assignmentFilterGroupTouched && optionValues.has(previous)) {
    assignmentFilterGroup.value = previous;
    return;
  }

  if (!assignmentFilterGroupTouched && workingGroup && optionValues.has(workingGroup)) {
    assignmentFilterGroup.value = workingGroup;
    return;
  }

  if (optionValues.has(previous)) {
    assignmentFilterGroup.value = previous;
  } else {
    assignmentFilterGroup.value = "ALL";
  }
}

function assignmentMatchesFilters(assignment) {
  const codeQuery = String(assignmentFilterCode.value || "").trim().toUpperCase();
  const dateQuery = String(assignmentFilterDate.value || "").trim();
  const groupQuery = String(assignmentFilterGroup.value || "ALL").trim();

  const code = String(assignment?.code || "").toUpperCase();
  const group = String(assignment?.groupName || "ALL").trim();

  if (codeQuery && !code.includes(codeQuery)) return false;
  if (dateQuery && dateFilterKey(assignment?.dueAt) !== dateQuery) return false;
  if (groupQuery !== "ALL" && group !== groupQuery) return false;

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

  const entries = allEntries.filter(({ assignment }) => assignmentMatchesFilters(assignment));

  assignmentBrowserCount.textContent = `${entries.length} shown`;

  if (!entries.length) {
    teacherAssignmentList.innerHTML = '<div class="status-text">No assignments match these filters.</div>';
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
    const evaluatedClass = evaluation.complete ? "evaluated" : "";

    return `
      <article
        class="assignment-item ${id === selectedAssignmentId ? "active" : ""} ${evaluatedClass}"
        data-assignment-select="${id}"
        title="${escapeHtml(assignment.title || "Assignment")}"
      >
        <div class="grading-actions">
          <button
            type="button"
            class="ai-grading-btn"
            data-grade-assignment="${id}"
            ${count ? "" : "disabled"}
            title="${count ? "Open ChatGPT to grade this activity" : "No submissions to grade yet"}"
          >AI Grading</button>
          <button
            type="button"
            class="manual-grading-btn"
            data-manual-grade-assignment="${id}"
            ${count ? "" : "disabled"}
            title="${count ? "Grade this activity manually" : "No submissions to grade yet"}"
          >Manual Grading</button>
        </div>

        <div class="assignment-code-row">
          <span class="assignment-code">${escapeHtml(assignment.code || "")}</span>
        </div>

        <strong>${escapeHtml(assignment.title || "Assignment")}</strong>

        <span class="assignment-item-meta">
          <span class="assignment-mini-chip">${escapeHtml(assignment.groupName || "ALL")}</span>
          <span class="assignment-mini-chip">${escapeHtml(formatCompactDate(assignment.dueAt))}</span>
          <span class="assignment-mini-chip ${assignment.active ? "open" : "closed"}">
            ${assignment.active ? "Open" : "Closed"}
          </span>
          ${evaluation.complete ? '<span class="evaluated-chip">Evaluated</span>' : ""}
        </span>

        <span class="assignment-progress">
          ${count}/${total} submitted · ${evaluation.graded}/${count || 0} graded · ${missing} missing
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
    return;
  }

  assignmentDetail.hidden = false;
  assignmentDetailEmpty.hidden = true;

  const students = assignmentStudents(assignment);
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

  const submittedKeys = new Set(validSubmissionEntries.map(([studentKey]) => studentKey));
  const missing = students.filter(([studentKey]) => !submittedKeys.has(studentKey));

  selectedDriveFolderUrl =
    validSubmissionEntries.find(([, submission]) => submission.driveFolderUrl)?.[1]?.driveFolderUrl || "";

  openDriveFolderBtn.disabled = !selectedDriveFolderUrl;
  driveStatus.textContent = selectedDriveFolderUrl
    ? "PDFs are stored in the Google Drive folder for this task."
    : "The Drive folder is created automatically with the first PDF submission.";

  detailTitle.textContent = `${assignment.code || ""} · ${assignment.title || "Assignment"}`;
  const codeLockText = assignmentHasSubmissions(selectedAssignmentId)
    ? " · Code locked after first submission"
    : "";
  detailMeta.textContent = `${assignment.groupName || "ALL"} · Due: ${formatDate(assignment.dueAt)} · ${assignment.active ? "Open" : "Closed"}${codeLockText}`;
  eligibleCount.textContent = students.length;
  submittedCount.textContent = validSubmissionEntries.length;
  missingCount.textContent = missing.length;
  const lockedBySubmissions = assignmentHasSubmissions(selectedAssignmentId);
  toggleAssignmentBtn.textContent = assignment.active ? "Close Assignment" : "Reopen Assignment";
  editCriteriaBtn.disabled = lockedBySubmissions;
  editCriteriaBtn.title = lockedBySubmissions
    ? "This assignment already has submissions and its definition is locked."
    : "Edit evaluation criteria";
  renderEvaluationCriteria(assignment);

  if (lockedBySubmissions) {
    editCriteriaBtn.title = "Criteria locked after the first submission.";
  }

  submissionList.innerHTML = validSubmissionEntries.length
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
        const aiCandidateTotal = aiCandidateTotalForSubmission(submission);
        const aiCandidateState = String(submission?.aiGradingCandidateState || "");
        const aiCandidateLabel = submission?.aiGradingCandidate
          ? (aiCandidateState === "compare"
            ? `Compare · Manual: ${gradeTotal === null ? "—" : Number(gradeTotal.toFixed(2))} / 100 · AI: ${aiCandidateTotal === null ? "manual review needed" : `${Number(aiCandidateTotal.toFixed(2))} / 100`}`
            : `Manual kept · AI suggestion: ${aiCandidateTotal === null ? "manual review needed" : `${Number(aiCandidateTotal.toFixed(2))} / 100`}`)
          : "";

        return `
          <article class="submission-card ${graded ? "graded" : "pending-grade"}" data-submission-student-key="${escapeHtml(studentKey)}">
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
              ? (submission?.grading?.mode === "ai"
                ? '<div class="saved-grade-chip">AI reviewed · score pending manual review</div>'
                : "")
              : `<div class="saved-grade-chip">Grade: ${escapeHtml(Number(gradeTotal.toFixed(2)))} / 100 · ${escapeHtml(submission?.grading?.mode || "manual")}</div>`
            }

            ${aiCandidateLabel
              ? `<div class="ai-candidate-chip">${escapeHtml(aiCandidateLabel)}</div>`
              : ""
            }

            <div class="submission-card-actions">
              <a class="pdf-link" href="${escapeHtml(submission.driveFileUrl || "#")}" target="_blank" rel="noopener">
                Open submitted PDF →
              </a>
              <div class="submission-grade-actions">
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
    : '<div class="status-text">No PDF submissions yet.</div>';

  if (missingSummary) {
    missingSummary.textContent = `Missing submissions (${missing.length})`;
  }

  missingList.innerHTML = missing.length
    ? missing.map(([studentKey, student]) => {
        const name = student.fullName || student.name || student.nickname || "Student";
        const id = student.studentNumber || student.externalId || student.studentId || studentKey || "No ID";
        const group = student.groupName || assignment.groupName || "GENERAL";

        return `
          <article class="missing-student-card">
            <div class="missing-student-main">
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(id)} · ${escapeHtml(group)}</span>
            </div>
            <span class="missing-student-chip">Not submitted</span>
          </article>
        `;
      }).join("")
    : '<div class="missing-empty-state">No missing submissions.</div>';

  if (!manualGradingPanel.hidden) renderManualGrading();
}

async function createAssignment() {
  refreshAutomaticTaskCode();
  const code = assignmentCode.value.trim().toUpperCase();
  const typeValue = selectedAssignmentTypeLabel();
  const typeCode = selectedAssignmentTypeCode();
  const title = assignmentTitle.value.trim();
  const groupName = assignmentGroup.value || "ALL";
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
    const storedInstructions = buildStoredInstructions(instructions, {
      schemaVersion: 1,
      assignmentType: typeValue,
      assignmentTypeCode: typeCode,
      criteria: rubricResult.criteria,
      distribution: evaluationDistribution,
      notes: evaluationNotes,
      updatedAt: Date.now()
    });

    await set(target, {
      code,
      title,
      groupName,
      instructions: storedInstructions,
      dueAt,
      active: true,
      storageProvider: "google-drive",
      createdAt: Date.now(),
      createdBy: getTeacherName()
    });

    selectedAssignmentId = target.key;
    assignmentType.value = "CT";
    assignmentOtherType.value = "";
    assignmentOtherTypeField.hidden = true;
    assignmentCode.value = "";
    assignmentTitle.value = "";
    assignmentInstructions.value = "";
    assignmentEvaluationNotes.value = "";
    assignmentDueAt.value = "";
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
    createAssignmentPanel.hidden = true;
    assignmentActionsMenu.open = false;
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

teacherAssignmentList.addEventListener("click", (event) => {
  const gradeButton = event.target.closest("[data-grade-assignment]");
  if (gradeButton) {
    if (!gradeButton.disabled) openChatGPTGrading(gradeButton.dataset.gradeAssignment);
    return;
  }

  const manualButton = event.target.closest("[data-manual-grade-assignment]");
  if (manualButton) {
    if (!manualButton.disabled) openManualGrading(manualButton.dataset.manualGradeAssignment);
    return;
  }

  const card = event.target.closest("[data-assignment-select]");
  if (!card) return;
  manualGradingPanel.hidden = true;
  selectedManualStudentKey = "";
  selectedAssignmentId = card.dataset.assignmentSelect;
  renderAssignmentList();
});

submissionList.addEventListener("click", (event) => {
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
  openManualGrading(selectedAssignmentId, card.dataset.submissionStudentKey);
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

closeManualGradingBtn.addEventListener("click", () => {
  manualGradingPanel.hidden = true;
  selectedManualStudentKey = "";
  renderDetail();
});

syncAiGradesBtn.addEventListener("click", syncAiGrades);

openDriveFolderBtn.addEventListener("click", () => {
  if (selectedDriveFolderUrl) window.open(selectedDriveFolderUrl, "_blank", "noopener");
});

assignmentType.addEventListener("change", refreshAutomaticTaskCode);
assignmentOtherType.addEventListener("input", refreshAutomaticTaskCode);
assignmentTitle.addEventListener("input", refreshAutomaticTaskCode);
assignmentGroup.addEventListener("change", refreshAutomaticTaskCode);
assignmentDueAt.addEventListener("input", refreshAutomaticTaskCode);

showCreateAssignmentBtn.addEventListener("click", () => {
  createAssignmentPanel.hidden = false;
  assignmentActionsMenu.open = false;
  createAssignmentPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

hideCreateAssignmentBtn.addEventListener("click", () => {
  createAssignmentPanel.hidden = true;
});

assignmentFilterCode.addEventListener("input", renderAssignmentList);
assignmentFilterDate.addEventListener("change", renderAssignmentList);
assignmentFilterGroup.addEventListener("change", () => {
  assignmentFilterGroupTouched = true;
  renderAssignmentList();
});

clearAssignmentFiltersBtn.addEventListener("click", () => {
  assignmentFilterCode.value = "";
  assignmentFilterDate.value = "";
  assignmentFilterGroupTouched = true;
  assignmentFilterGroup.value = "ALL";
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
toggleAssignmentBtn.addEventListener("click", toggleAssignment);
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
refreshAutomaticTaskCode();

logoutBtn.addEventListener("click", logoutTeacher);

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupOptions();
  renderAssignmentFilterOptions();
  renderAssignmentList();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderDetail();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderAssignmentFilterOptions();
  renderAssignmentList();
  refreshAutomaticTaskCode();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  submissionsCache = snapshot.val() || {};
  renderAssignmentList();
});
