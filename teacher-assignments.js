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
const teacherAssignmentList = document.getElementById("teacherAssignmentList");
const assignmentDetailEmpty = document.getElementById("assignmentDetailEmpty");
const assignmentDetail = document.getElementById("assignmentDetail");
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const eligibleCount = document.getElementById("eligibleCount");
const submittedCount = document.getElementById("submittedCount");
const missingCount = document.getElementById("missingCount");
const submissionList = document.getElementById("submissionList");
const missingList = document.getElementById("missingList");
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
const logoutBtn = document.getElementById("logoutBtn");
const teacherIdentity = document.getElementById("teacherIdentity");

let assignmentsCache = {};
let submissionsCache = {};
let studentsCache = {};
let groupsCache = {};
let selectedAssignmentId = "";
let selectedDriveFolderUrl = "";

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
  const presets = criteria.filter((criterion) => criterion.type === "preset");
  const custom = criteria.filter((criterion) => criterion.type !== "preset");
  const notes = String(rubric.notes || "").trim();
  const total = criteria.reduce((sum, criterion) => sum + Number(criterion.maxPoints || 0), 0);

  if (!criteria.length && !notes) {
    criteriaReadOnly.innerHTML = '<div class="status-text">No evaluation criteria have been set.</div>';
    return;
  }

  const notesBlock = notes
    ? `<div class="criteria-view-item"><strong>Teacher grading notes</strong><span>${escapeHtml(notes)}</span></div>`
    : "";

  criteriaReadOnly.innerHTML = `
    ${renderCriteriaGroup("Preset criteria", presets)}
    ${renderCriteriaGroup("Custom criteria", custom)}
    ${notesBlock}
    <div class="criteria-total">${Number(total.toFixed(2))} / 100 points</div>
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

function renderAssignmentList() {
  const entries = Object.entries(assignmentsCache || {})
    .sort((a, b) => Number(b[1]?.createdAt || 0) - Number(a[1]?.createdAt || 0));

  if (!entries.length) {
    teacherAssignmentList.innerHTML = '<div class="status-text">No assignments yet.</div>';
    selectedAssignmentId = "";
    renderDetail();
    return;
  }

  if (!selectedAssignmentId || !assignmentsCache[selectedAssignmentId]) {
    selectedAssignmentId = entries[0][0];
  }

  teacherAssignmentList.innerHTML = entries.map(([id, assignment]) => {
    const submissions = assignmentSubmissions(id);
    const count = Object.values(submissions).filter((submission) => submission?.driveFileId).length;
    return `
      <button class="assignment-item ${id === selectedAssignmentId ? "active" : ""}" data-assignment-select="${id}">
        <strong>${escapeHtml(assignment.code || "")} · ${escapeHtml(assignment.title || "Assignment")}</strong>
        <span>${escapeHtml(assignment.groupName || "ALL")} · ${assignment.active ? "Open" : "Closed"} · ${count} submitted</span>
      </button>
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
    .sort((a, b) => String(a[1]?.studentName || "").localeCompare(String(b[1]?.studentName || "")));

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
    criteriaReadOnly.insertAdjacentHTML(
      "afterbegin",
      '<div class="status-text">Assignment definition locked after the first submission. Type, title, group, due date, instructions, task code, and grading criteria can no longer be changed.</div>'
    );
  }

  submissionList.innerHTML = validSubmissionEntries.length
    ? validSubmissionEntries.map(([, submission]) => `
        <article class="submission-card">
          <h4>${escapeHtml(submission.studentName || "Student")}</h4>
          <div class="submission-meta">
            ${escapeHtml(submission.studentNumber || "No ID")} ·
            ${escapeHtml(submission.groupName || "")} ·
            ${Math.max(1, Math.round(Number(submission.size || 0) / 1024))} KB ·
            ${escapeHtml(formatDate(submission.updatedAt || submission.submittedAt))}
          </div>
          <div class="review-chip">Identity pending review</div><br>
          <a class="pdf-link" href="${escapeHtml(submission.driveFileUrl || "#")}" target="_blank" rel="noopener">
            Open submitted PDF →
          </a>
        </article>
      `).join("")
    : '<div class="status-text">No PDF submissions yet.</div>';

  missingList.textContent = missing.length
    ? missing.map(([, student]) => student.fullName || student.name || student.nickname || "Student").join(", ")
    : "None";
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
    createAssignmentStatus.textContent = "Assignment created.";
    createAssignmentStatus.className = "status-text ok";
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
  const button = event.target.closest("[data-assignment-select]");
  if (!button) return;
  selectedAssignmentId = button.dataset.assignmentSelect;
  renderAssignmentList();
});

openDriveFolderBtn.addEventListener("click", () => {
  if (selectedDriveFolderUrl) window.open(selectedDriveFolderUrl, "_blank", "noopener");
});

assignmentType.addEventListener("change", refreshAutomaticTaskCode);
assignmentOtherType.addEventListener("input", refreshAutomaticTaskCode);
assignmentTitle.addEventListener("input", refreshAutomaticTaskCode);
assignmentGroup.addEventListener("change", refreshAutomaticTaskCode);
assignmentDueAt.addEventListener("input", refreshAutomaticTaskCode);

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
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderDetail();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderAssignmentList();
  refreshAutomaticTaskCode();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  submissionsCache = snapshot.val() || {};
  renderAssignmentList();
});
