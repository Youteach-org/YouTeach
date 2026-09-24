import { db } from "./firebase.js";
import {
  ref,
  push,
  set,
  get,
  onValue,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js?v=group-evaluation-20260920";
import { calculateStudentBlockGrade } from "./group-grade-runtime.js";
import { visibleGroups } from "./group-state.js";
import { studentGroupNames, studentInGroup } from "./student-groups.js";
import { planStudentRemovalFromGroup } from "./group-membership-deletion.js";
import { ensureGroupsDialog, renderGroupsDialog } from "./groups-dialog.js";
import { SYSTEM_CATEGORIES } from "./assignment-activity-model.js";

import {
  activeEvaluationBlockForGroup,
  criteriaToFirebaseObject,
  evaluationBlockNames,
  groupEvaluationConfig,
  evaluationWeightTotal,
  normalizeEvaluationCriteria,
  normalizeEvaluationUnitCount
} from "./group-evaluation-model.js";

requireTeacherAuth();
ensureGroupsDialog();

const WORKING_GROUP_KEY = "youteachWorkingGroup";
const MANAGEMENT_STATE_KEY = "youteachGroupManagementState";
const REQUESTED_CRITERIA_RESET_GROUP = "e6c fall 2026";
const REQUESTED_CRITERIA_RESET_MARKER = "criteriaReset20260921";
const groupActionParams = new URLSearchParams(window.location.search);
const REQUESTED_GROUP_ACTION = String(groupActionParams.get("action") || "").trim();
const REQUESTED_GROUP_NAME = String(groupActionParams.get("group") || "").trim();
let requestedGroupActionHandled = false;

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupsDialog = document.getElementById("groupsDialog");
const openGroupsDialogBtn = document.getElementById("openGroupsDialogBtn");
const closeGroupsDialogBtn = document.getElementById("closeGroupsDialogBtn");
const deleteGroupDialog = document.getElementById("deleteGroupDialog");
const deleteGroupDialogSubtitle = document.getElementById("deleteGroupDialogSubtitle");
const deleteGroupConfirmInput = document.getElementById("deleteGroupConfirmInput");
const deleteGroupStatus = document.getElementById("deleteGroupStatus");
const closeDeleteGroupDialogBtn = document.getElementById("closeDeleteGroupDialogBtn");
const cancelDeleteGroupBtn = document.getElementById("cancelDeleteGroupBtn");
const confirmDeleteGroupBtn = document.getElementById("confirmDeleteGroupBtn");
const groupEditorDialog = document.getElementById("groupEditorDialog");
const groupEditorTitle = document.getElementById("groupEditorTitle");
const groupEditorSubtitle = document.getElementById("groupEditorSubtitle");
const groupNameInput = document.getElementById("groupNameInput");
const evaluationEditor = document.getElementById("evaluationEditor");
const cancelGroupEditBtn = document.getElementById("cancelGroupEditBtn");
const openCreateGroupDialogBtn = document.getElementById("openCreateGroupDialogBtn");
const openGroupEvaluationDialogBtn = document.getElementById("openGroupEvaluationDialogBtn");
const evaluationUnitCountInput = document.getElementById("evaluationUnitCountInput");
const useEvaluationTemplateBtn = document.getElementById("useEvaluationTemplateBtn");
const addEvaluationCriterionBtn = document.getElementById("addEvaluationCriterionBtn");
const evaluationCriteriaRows = document.getElementById("evaluationCriteriaRows");
const evaluationWeightTotalLabel = document.getElementById("evaluationWeightTotal");
const groupEvaluationStatus = document.getElementById("groupEvaluationStatus");
const createGroupBtn = document.getElementById("createGroupBtn");

const evaluationTemplateDialog = document.getElementById("evaluationTemplateDialog");
const closeEvaluationTemplateDialogBtn = document.getElementById("closeEvaluationTemplateDialogBtn");
const evaluationTemplateList = document.getElementById("evaluationTemplateList");
const useSelectedEvaluationTemplateBtn = document.getElementById("useSelectedEvaluationTemplateBtn");

const enrollmentControls = document.getElementById("enrollmentControls");
const createEnrollmentLinkBtn = document.getElementById("createEnrollmentLinkBtn");
const enrollmentLinkInlineControls = document.getElementById("enrollmentLinkInlineControls");
const enrollmentLinkInput = document.getElementById("enrollmentLinkInput");
const copyEnrollmentLinkBtn = document.getElementById("copyEnrollmentLinkBtn");
const rotateEnrollmentLinkBtn = document.getElementById("rotateEnrollmentLinkBtn");
const openAddStudentModalBtn = document.getElementById("openAddStudentModalBtn");
const selectAllStudents = document.getElementById("selectAllStudents");
const pendingRequestsPanel = document.getElementById("pendingRequestsPanel");
const pendingRequestsList = document.getElementById("pendingRequestsList");
const managedStudentsCount = document.getElementById("managedStudentsCount");
const managedStudentDisplayModeBtn = document.getElementById("managedStudentDisplayModeBtn");
const managedStudentSearchToggle = document.getElementById("managedStudentSearchToggle");
const managedStudentSearchPanel = document.getElementById("managedStudentSearchPanel");
const managedStudentSearch = document.getElementById("managedStudentSearch");
const managedStudentsTableHeadRow = document.getElementById("managedStudentsTableHeadRow");
const managedStudentsTableBody = document.getElementById("managedStudentsTableBody");
const openManagedBlockReportBtn = document.getElementById("openManagedBlockReportBtn");
const activeEvaluationBlockBtn = document.getElementById("activeEvaluationBlockBtn");
const activeEvaluationBlockDialog = document.getElementById("activeEvaluationBlockDialog");
const activeEvaluationBlockGroupLabel = document.getElementById("activeEvaluationBlockGroupLabel");
const activeEvaluationBlockSelect = document.getElementById("activeEvaluationBlockSelect");
const activeEvaluationBlockStatus = document.getElementById("activeEvaluationBlockStatus");
const closeActiveEvaluationBlockDialogBtn = document.getElementById("closeActiveEvaluationBlockDialogBtn");
const cancelActiveEvaluationBlockBtn = document.getElementById("cancelActiveEvaluationBlockBtn");
const saveActiveEvaluationBlockBtn = document.getElementById("saveActiveEvaluationBlockBtn");
const takeAttendanceBtn = document.getElementById("takeAttendanceBtn");
const pendingRequestActions = document.getElementById("pendingRequestActions");
const pendingRequestLabel = document.getElementById("pendingRequestLabel");
const approveEnrollmentBtn = document.getElementById("approveEnrollmentBtn");
const denyEnrollmentBtn = document.getElementById("denyEnrollmentBtn");

const groupsTableBody = document.getElementById("groupsTableBody");
const selectedGroupActions = document.getElementById("selectedGroupActions");
const selectPopupGroupBtn = document.getElementById("selectPopupGroupBtn");
const selectedGroupActionLabel = document.getElementById("selectedGroupActionLabel");
const deleteSelectedGroupBtn = document.getElementById("deleteSelectedGroupBtn");

const addStudentDialog = document.getElementById("addStudentDialog");
const addStudentGroupLabel = document.getElementById("addStudentGroupLabel");
const closeAddStudentDialogBtn = document.getElementById("closeAddStudentDialogBtn");
const manualStudentTabBtn = document.getElementById("manualStudentTabBtn");
const csvStudentTabBtn = document.getElementById("csvStudentTabBtn");
const pasteStudentTabBtn = document.getElementById("pasteStudentTabBtn");
const existingStudentTabBtn = document.getElementById("existingStudentTabBtn");
const manualStudentPane = document.getElementById("manualStudentPane");
const csvStudentPane = document.getElementById("csvStudentPane");
const pasteStudentPane = document.getElementById("pasteStudentPane");
const existingStudentPane = document.getElementById("existingStudentPane");
const existingStudentSearch = document.getElementById("existingStudentSearch");
const existingStudentGroupFilter = document.getElementById("existingStudentGroupFilter");
const existingStudentsMasterCheckbox = document.getElementById("existingStudentsMasterCheckbox");
const existingStudentsList = document.getElementById("existingStudentsList");
const existingStudentSelectionCount = document.getElementById("existingStudentSelectionCount");
const enrollExistingStudentsBtn = document.getElementById("enrollExistingStudentsBtn");
const studentNameInput = document.getElementById("studentName");
const studentNicknameInput = document.getElementById("studentNickname");
const studentNumberManualInput = document.getElementById("studentNumberManual");
const createStudentBtn = document.getElementById("createStudent");
const csvFileInput = document.getElementById("csvFile");
const importCsvBtn = document.getElementById("importCsv");
const bulkTextInput = document.getElementById("bulkText");
const importTextBtn = document.getElementById("importText");
const addStudentStatus = document.getElementById("addStudentStatus");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function takeAttendanceForGreenStudents() {
  const groupName = selectedManagedGroup;
  if (!groupName || !groupsCache[groupName]) return;

  const presentStudents = groupStudents(groupName)
    .filter(([, student]) => student?.activeNow === true);

  if (!presentStudents.length) {
    alert("No green students to confirm for attendance.");
    return;
  }

  const now = Date.now();
  const dateKey = todayKey();
  const updates = {};

  presentStudents.forEach(([studentKey, student]) => {
    const name = student.fullName || student.name || student.nickname || "";
    const studentNumber = student.studentNumber || student.externalId || "";
    const base = `attendance/${dateKey}/${studentKey}`;

    updates[`${base}/studentKey`] = studentKey;
    updates[`${base}/studentName`] = name;
    updates[`${base}/externalId`] = studentNumber;
    updates[`${base}/studentNumber`] = studentNumber;
    updates[`${base}/groupName`] = groupName;
    updates[`${base}/present`] = true;
    updates[`${base}/attendanceValidated`] = true;
    updates[`${base}/attendanceValidatedAt`] = now;
    updates[`${base}/confirmedAt`] = now;
    updates[`${base}/confirmedBy`] = getTeacherName();
    updates[`${base}/activeNow`] = true;
    updates[`${base}/detectedAt`] = Number(student.lastSeenAt || now);
  });

  try {
    takeAttendanceBtn.disabled = true;
    await update(ref(db), updates);
    alert(`Attendance confirmed for ${presentStudents.length} green student(s) in ${groupName}.`);
  } catch (error) {
    console.error("Take attendance failed:", error);
    alert(`Could not confirm attendance: ${error?.message || "unknown Firebase error"}`);
  } finally {
    takeAttendanceBtn.disabled = false;
  }
}

function readManagementState() {
  try {
    const raw = sessionStorage.getItem(MANAGEMENT_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

const restoredManagementState = readManagementState();

let groupsCache = {};
let settingsCache = {};
let studentsCache = {};
let assignmentsCache = {};
let assignmentSubmissionsCache = {};
let pointsLogCache = {};
let enrollmentRequestsCache = {};
let evaluationTemplatesCache = {};
let legacyEvaluationTemplatesCache = {};
let selectedManagedGroup = String(
  restoredManagementState.groupName || sessionStorage.getItem(WORKING_GROUP_KEY) || ""
);
let popupSelectedGroup = "";
let deletionTargetGroup = "";
let editingGroupName = "";
let pendingReportSettings = null;
let creatingGroup = false;
let enrollmentLinkExpanded = restoredManagementState.enrollmentLinkExpanded === true;
let selectedTemplateId = "";
let groupsLoaded = false;
let templatesLoaded = false;
let harvestingTemplates = false;
let requestedCriteriaResetChecked = false;
let requestedCriteriaResetInProgress = false;
let evaluationAutosaveTimer = null;
let evaluationAutosaveVersion = 0;
const selectedExistingStudentKeys = new Set();

const selectedRosterItems = new Set(
  Array.isArray(restoredManagementState.selectedRosterItems)
    ? restoredManagementState.selectedRosterItems.map(String)
    : []
);

function persistManagementState() {
  if (!selectedManagedGroup) {
    sessionStorage.removeItem(MANAGEMENT_STATE_KEY);
    return;
  }

  sessionStorage.setItem(MANAGEMENT_STATE_KEY, JSON.stringify({
    groupName: selectedManagedGroup,
    enrollmentLinkExpanded,
    selectedRosterItems: [...selectedRosterItems]
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanFilePart(value) {
  return String(value || "group")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "group";
}

function makeCriterionId() {
  return `criterion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeEnrollmentToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function systemCategoryOptions(selected = "OTHER") {
  const current = String(selected || "OTHER").trim().toUpperCase();
  return SYSTEM_CATEGORIES.map((category) =>
    `<option value="${escapeHtml(category.key)}" ${category.key === current ? "selected" : ""}>${escapeHtml(category.label)}</option>`
  ).join("");
}

function criterionRowHtml(criterion = {}) {
  const id = String(criterion.id || makeCriterionId());
  return `
    <div class="criterion-row" data-evaluation-criterion data-criterion-id="${escapeHtml(id)}"
      data-criterion-source="${escapeHtml(criterion.source || "manual")}">
      <input data-criterion-name value="${escapeHtml(criterion.name || "")}" placeholder="Category name">
      <select data-criterion-system-category aria-label="Underlying system category" title="Controls which activity types and grading modes are available">
        ${systemCategoryOptions(criterion.systemCategory || "OTHER")}
      </select>
      <input data-criterion-short-label value="${escapeHtml(criterion.shortLabel || "")}" placeholder="Abbr." aria-label="Abbreviation" title="Abbreviation used in reports">
      <input data-criterion-weight type="number" min="0" max="100" step="0.1"
        value="${Number(criterion.weight || 0) || ""}" placeholder="%">
      <button class="criterion-remove" type="button" data-remove-evaluation-criterion title="Remove criterion">×</button>
    </div>
  `;
}

function addEvaluationCriterionRow(criterion = {}) {
  evaluationCriteriaRows.insertAdjacentHTML("beforeend", criterionRowHtml(criterion));
  refreshEvaluationWeightTotal();
}

function criteriaFromForm() {
  return normalizeEvaluationCriteria(
    [...evaluationCriteriaRows.querySelectorAll("[data-evaluation-criterion]")].map((row, order) => ({
      id: String(row.dataset.criterionId || makeCriterionId()),
      name: String(row.querySelector("[data-criterion-name]")?.value || "").trim(),
      shortLabel: String(row.querySelector("[data-criterion-short-label]")?.value || "").trim(),
      weight: Number(row.querySelector("[data-criterion-weight]")?.value || 0),
      source: String(row.dataset.criterionSource || "manual"),
      systemCategory: String(row.querySelector("[data-criterion-system-category]")?.value || "OTHER"),
      order
    }))
  );
}

function setCriteriaEditor(criteria = []) {
  const normalized = normalizeEvaluationCriteria(criteria);
  evaluationCriteriaRows.innerHTML = "";
  if (normalized.length) normalized.forEach((criterion) => addEvaluationCriterionRow(criterion));
  else addEvaluationCriterionRow();
  refreshEvaluationWeightTotal();
}

function refreshEvaluationWeightTotal() {
  const total = evaluationWeightTotal(criteriaFromForm());
  evaluationWeightTotalLabel.textContent = `${total} / 100%`;
  evaluationWeightTotalLabel.classList.toggle("ok", Math.abs(total - 100) < 0.01);
  evaluationWeightTotalLabel.classList.toggle("bad", Math.abs(total - 100) >= 0.01);
  return total;
}

function renderEvaluationEditorVisibility() {
  evaluationEditor.hidden = false;
}

function templateComparable({ evaluationCriteria } = {}) {
  return {
    criteria: normalizeEvaluationCriteria(evaluationCriteria || []).map((criterion) =>
      `${String(criterion.name || "").trim().toLocaleLowerCase()}::${criterion.systemCategory}`
    )
  };
}

function templateSignature(value) {
  return JSON.stringify(templateComparable(value));
}

function automaticTemplateName(criteria = []) {
  const text = normalizeEvaluationCriteria(criteria)
    .map((criterion) => String(criterion.name || "").trim())
    .filter(Boolean)
    .join(" · ");
  return (text || "Evaluation criteria").slice(0, 180);
}

function equivalentTemplateId(setup) {
  const signature = templateSignature(setup);
  return Object.entries(evaluationTemplatesCache || {}).find(([, template]) =>
    templateSignature(template) === signature
  )?.[0] || "";
}

const TEMPLATE_LIBRARY_PATH = "settings/groupEvaluationTemplates";

async function ensureIndependentTemplate({
  evaluationCriteria,
  refreshDefaults = false
}) {
  const criteria = normalizeEvaluationCriteria(evaluationCriteria || []);
  if (!criteria.length || Math.abs(evaluationWeightTotal(criteria) - 100) >= 0.01) return "";

  const setup = { evaluationCriteria: criteria };
  const signature = templateSignature(setup);
  const canonicalName = automaticTemplateName(criteria);
  const existingId = equivalentTemplateId(setup);
  const now = Date.now();

  if (existingId) {
    const existing = evaluationTemplatesCache?.[existingId] || {};
    const patch = {};
    const defaults = criteriaToFirebaseObject(criteria);

    if (String(existing.name || "") !== canonicalName) patch.name = canonicalName;
    if (String(existing.signature || "") !== signature) patch.signature = signature;
    if (Object.prototype.hasOwnProperty.call(existing, "evaluationUnitCount")) patch.evaluationUnitCount = null;
    if (Object.prototype.hasOwnProperty.call(existing, "reportSettings")) patch.reportSettings = null;
    if (Object.prototype.hasOwnProperty.call(existing, "sourceGroup")) patch.sourceGroup = null;
    if (refreshDefaults) patch.evaluationCriteria = defaults;

    if (Object.keys(patch).length) {
      patch.updatedAt = now;
      await update(ref(db, `${TEMPLATE_LIBRARY_PATH}/${existingId}`), patch);
      evaluationTemplatesCache[existingId] = {
        ...existing,
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.signature ? { signature: patch.signature } : {}),
        ...(refreshDefaults ? { evaluationCriteria: defaults } : {}),
        updatedAt: now
      };
      if (patch.evaluationUnitCount === null) delete evaluationTemplatesCache[existingId].evaluationUnitCount;
      if (patch.reportSettings === null) delete evaluationTemplatesCache[existingId].reportSettings;
      if (patch.sourceGroup === null) delete evaluationTemplatesCache[existingId].sourceGroup;
    }

    return existingId;
  }

  const target = push(ref(db, TEMPLATE_LIBRARY_PATH));
  const record = {
    name: canonicalName,
    evaluationCriteria: criteriaToFirebaseObject(criteria),
    signature,
    createdAt: now,
    updatedAt: now,
    createdBy: getTeacherName()
  };

  await set(target, record);
  evaluationTemplatesCache[target.key] = record;
  return target.key;
}

function mergedTemplateCache() {
  return {
    ...(legacyEvaluationTemplatesCache || {}),
    ...(evaluationTemplatesCache || {})
  };
}

async function harvestConfiguredGroupsToTemplates({ force = false } = {}) {
  if (!groupsLoaded || harvestingTemplates || requestedCriteriaResetInProgress) return 0;
  if (!force && (!templatesLoaded || !requestedCriteriaResetChecked)) return 0;

  harvestingTemplates = true;
  let harvested = 0;

  try {
    for (const group of Object.values(groupsCache || {})) {
      const config = groupEvaluationConfig(group);
      if (!config.configured) continue;

      const before = Object.keys(evaluationTemplatesCache || {}).length;
      const id = await ensureIndependentTemplate({
        evaluationCriteria: config.criteria,
        refreshDefaults: false
      });
      if (id) {
        const after = Object.keys(evaluationTemplatesCache || {}).length;
        if (after > before) harvested += 1;
      }
    }
    renderEvaluationTemplateList();
    return harvested;
  } finally {
    harvestingTemplates = false;
  }
}

function renderEvaluationTemplateList() {
  const entries = Object.entries(mergedTemplateCache())
    .map(([id, template]) => [id, template, normalizeEvaluationCriteria(template?.evaluationCriteria || [])])
    .filter(([, , criteria]) => criteria.length > 0 && Math.abs(evaluationWeightTotal(criteria) - 100) < 0.01)
    .sort((a, b) =>
      String(a[1]?.name || automaticTemplateName(a[2])).localeCompare(
        String(b[1]?.name || automaticTemplateName(b[2])),
        undefined,
        { sensitivity: "base" }
      )
    );

  if (!entries.length) {
    selectedTemplateId = "";
    evaluationTemplateList.innerHTML =
      '<div class="student-list-empty">No reusable evaluation templates yet.</div>';
    useSelectedEvaluationTemplateBtn.disabled = true;
    return;
  }

  if (!entries.some(([id]) => id === selectedTemplateId)) {
    selectedTemplateId = entries[0][0];
  }

  evaluationTemplateList.innerHTML = entries.map(([id, template, criteria]) => {
    const summary = criteria
      .map((criterion) => `${criterion.name} ${criterion.weight}%`)
      .join(" · ");

    return `
      <label class="template-row ${id === selectedTemplateId ? "selected" : ""}"
        data-template-id="${escapeHtml(id)}" title="${escapeHtml(automaticTemplateName(criteria))}">
        <input type="radio" name="evaluation-template-choice" value="${escapeHtml(id)}"
          ${id === selectedTemplateId ? "checked" : ""} aria-label="Select template">
        <span class="template-summary">${escapeHtml(summary)}</span>
      </label>
    `;
  }).join("");

  useSelectedEvaluationTemplateBtn.disabled = !selectedTemplateId;
}

async function openEvaluationTemplateDialog() {
  useEvaluationTemplateBtn.disabled = true;
  groupEvaluationStatus.textContent = "Loading reusable templates…";
  groupEvaluationStatus.className = "status-text";

  try {
    await harvestConfiguredGroupsToTemplates({ force: true });
    renderEvaluationTemplateList();
    evaluationTemplateDialog.showModal();

    const count = Object.entries(mergedTemplateCache())
      .map(([, template]) => normalizeEvaluationCriteria(template?.evaluationCriteria || []))
      .filter((criteria) => criteria.length > 0 && Math.abs(evaluationWeightTotal(criteria) - 100) < 0.01)
      .length;

    groupEvaluationStatus.textContent = count
      ? `${count} reusable template${count === 1 ? "" : "s"} available.`
      : "No reusable templates yet. Complete a group's criteria to 100% and they will appear here.";
    groupEvaluationStatus.className = "status-text";
  } catch (error) {
    console.error("Template library refresh failed:", error);
    renderEvaluationTemplateList();
    evaluationTemplateDialog.showModal();
    groupEvaluationStatus.textContent = "Could not refresh the template library.";
    groupEvaluationStatus.className = "status-text bad";
  } finally {
    useEvaluationTemplateBtn.disabled = false;
  }
}

function applyEvaluationTemplate(template) {
  if (!template) return;
  const criteria = normalizeEvaluationCriteria(template.evaluationCriteria || []);
  if (!criteria.length) return;
  setCriteriaEditor(criteria);
  renderEvaluationEditorVisibility();
  groupEvaluationStatus.textContent = `Loaded template: ${automaticTemplateName(criteria)}. Adjust percentages if needed.`;
  groupEvaluationStatus.className = "status-text ok";
}

function renderSelectedGroupActions() {
  const hasGroup = Boolean(popupSelectedGroup && groupsCache[popupSelectedGroup]);
  selectedGroupActions.hidden = !hasGroup;
  selectedGroupActionLabel.textContent = hasGroup ? `Marked: ${popupSelectedGroup}` : "";
}

function markPopupGroup(groupName) {
  if (!groupName || !groupsCache[groupName]) return;
  popupSelectedGroup = groupName;
  renderGroupsTable();
}

function resetGroupForm() {
  creatingGroup = false;
  editingGroupName = "";
  selectedManagedGroup = "";
  popupSelectedGroup = "";
  deletionTargetGroup = "";
  sessionStorage.removeItem(WORKING_GROUP_KEY);
  sessionStorage.removeItem(MANAGEMENT_STATE_KEY);
  selectedRosterItems.clear();

  if (groupEditorDialog.open) groupEditorDialog.close();
  groupEditorTitle.textContent = "Create Group";
  groupEditorSubtitle.textContent = "Create a new group and define its evaluation setup.";
  groupNameInput.disabled = false;
  groupNameInput.value = "";
  evaluationUnitCountInput.value = "3";
  evaluationUnitCountInput.min = "1";
  evaluationUnitCountInput.title = "";
  pendingReportSettings = null;
  setCriteriaEditor([]);
  createGroupBtn.textContent = "Create Group";
  createGroupBtn.hidden = false;
  cancelGroupEditBtn.hidden = false;
  cancelGroupEditBtn.textContent = "Cancel";
  groupEvaluationStatus.textContent = "";
  groupEvaluationStatus.className = "status-text";

  renderEvaluationEditorVisibility();
  renderManagedStudents();
  renderGroupsTable();
  renderSelectedGroupActions();
}

function prepareCreateGroupDialog() {
  creatingGroup = true;
  editingGroupName = "";
  groupEditorTitle.textContent = "Create Group";
  groupEditorSubtitle.textContent = "Create a new group and define its evaluation blocks and criteria.";
  groupNameInput.disabled = false;
  groupNameInput.value = "";
  evaluationUnitCountInput.value = "3";
  evaluationUnitCountInput.min = "1";
  evaluationUnitCountInput.title = "";
  pendingReportSettings = null;
  setCriteriaEditor([]);
  createGroupBtn.textContent = "Create Group";
  createGroupBtn.hidden = false;
  cancelGroupEditBtn.hidden = false;
  cancelGroupEditBtn.textContent = "Cancel";
  groupEvaluationStatus.textContent = "";
  groupEvaluationStatus.className = "status-text";
  renderEvaluationEditorVisibility();
  groupEditorDialog.showModal();
}

function openSelectedGroupEvaluationDialog() {
  const groupName = popupSelectedGroup;
  if (!groupName || !groupsCache[groupName]) return;
  editingGroupName = groupName;
  loadGroupEditor(groupName);
  if (!groupEditorDialog.open) groupEditorDialog.showModal();
}

function clearRequestedGroupActionQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("action");
  url.searchParams.delete("group");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function maybeHandleRequestedGroupAction() {
  if (requestedGroupActionHandled || !REQUESTED_GROUP_ACTION) return false;

  if (REQUESTED_GROUP_ACTION === "create") {
    requestedGroupActionHandled = true;
    if (groupsDialog.open) groupsDialog.close();
    prepareCreateGroupDialog();
    clearRequestedGroupActionQuery();
    return true;
  }

  if (!REQUESTED_GROUP_NAME || !groupsCache[REQUESTED_GROUP_NAME]) {
    requestedGroupActionHandled = true;
    clearRequestedGroupActionQuery();
    return false;
  }

  popupSelectedGroup = REQUESTED_GROUP_NAME;
  renderGroupsTable();

  if (REQUESTED_GROUP_ACTION === "evaluation") {
    requestedGroupActionHandled = true;
    if (groupsDialog.open) groupsDialog.close();
    openSelectedGroupEvaluationDialog();
    clearRequestedGroupActionQuery();
    return true;
  }

  if (REQUESTED_GROUP_ACTION === "delete") {
    requestedGroupActionHandled = true;
    if (groupsDialog.open) groupsDialog.close();
    openDeleteGroupDialog();
    clearRequestedGroupActionQuery();
    return true;
  }

  requestedGroupActionHandled = true;
  clearRequestedGroupActionQuery();
  return false;
}

function blockNumberFromName(value) {
  const match = String(value || "").match(/block\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function hasRecordedScalar(container, blockName) {
  return Boolean(
    container &&
    Object.prototype.hasOwnProperty.call(container, blockName) &&
    container[blockName] !== null &&
    container[blockName] !== ""
  );
}

function markRecordedBlock(currentMax, blockName) {
  const number = blockNumberFromName(blockName);
  return number > currentMax ? number : currentMax;
}

function assignmentRecipientKeys(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.values(raw).map(String);
  return [];
}

function assignmentAppliesToGroupStudent(assignment, studentKey, student) {
  const assignmentGroup = String(assignment?.groupName || "");
  if (assignmentGroup && assignmentGroup !== "ALL" && assignmentGroup !== String(student?.groupName || "")) {
    return false;
  }

  const recipients = assignmentRecipientKeys(assignment?.recipientStudentKeys);
  if (recipients.length && !recipients.includes(String(studentKey))) return false;
  return true;
}

function minimumEvaluationUnitCountForGroup(groupName) {
  if (!groupName) return 1;

  const groupEntries = Object.entries(studentsCache || {})
    .filter(([, student]) => String(student?.groupName || "") === groupName);
  const groupStudentKeys = new Set(groupEntries.map(([studentKey]) => String(studentKey)));
  let highestRecorded = 0;

  groupEntries.forEach(([, student]) => {
    Object.entries(student?.examPoints || {}).forEach(([blockName, exam]) => {
      if (!exam || typeof exam !== "object") return;
      const recorded = ["written", "oral", "verbs"].some((key) =>
        Object.prototype.hasOwnProperty.call(exam, key) &&
        exam[key] !== null &&
        exam[key] !== ""
      );
      if (recorded) highestRecorded = markRecordedBlock(highestRecorded, blockName);
    });

    Object.entries(student?.evaluationCriterionScores || {}).forEach(([blockName, scores]) => {
      if (!scores || typeof scores !== "object") return;
      const recorded = Object.values(scores).some((value) => value !== null && value !== "");
      if (recorded) highestRecorded = markRecordedBlock(highestRecorded, blockName);
    });

    Object.keys(student?.taskPoints || {}).forEach((blockName) => {
      if (hasRecordedScalar(student.taskPoints, blockName)) {
        highestRecorded = markRecordedBlock(highestRecorded, blockName);
      }
    });

    Object.keys(student?.attendancePoints || {}).forEach((blockName) => {
      if (hasRecordedScalar(student.attendancePoints, blockName)) {
        highestRecorded = markRecordedBlock(highestRecorded, blockName);
      }
    });

    Object.entries(student?.blockPoints || {}).forEach(([blockName, value]) => {
      // blockPoints is initialized to zero for new students, so zero alone is
      // not evidence that the block has actually been graded.
      if (value !== null && value !== "" && Number(value) !== 0) {
        highestRecorded = markRecordedBlock(highestRecorded, blockName);
      }
    });
  });

  Object.values(pointsLogCache || {}).forEach((entry) => {
    const belongsToGroup =
      String(entry?.groupName || "") === groupName ||
      groupStudentKeys.has(String(entry?.studentKey || ""));
    if (!belongsToGroup) return;
    highestRecorded = markRecordedBlock(highestRecorded, entry?.block || entry?.blockName);
  });

  Object.entries(assignmentsCache || {}).forEach(([assignmentId, assignment]) => {
    const blockName = String(assignment?.evaluationBlock || assignment?.block || "");
    const blockNumber = blockNumberFromName(blockName);
    if (!blockNumber) return;

    const submissions = assignmentSubmissionsCache?.[assignmentId] || {};
    const hasRecordedGrade = Object.entries(submissions).some(([studentKey, submission]) => {
      const student = studentsCache?.[studentKey];
      if (!student || !groupStudentKeys.has(String(studentKey))) return false;
      if (!assignmentAppliesToGroupStudent(assignment, studentKey, student)) return false;
      const raw = submission?.grading?.totalScore;
      return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw));
    });

    if (hasRecordedGrade) highestRecorded = Math.max(highestRecorded, blockNumber);
  });

  return Math.max(1, highestRecorded);
}

function applyEvaluationUnitFloor(groupName, { announce = false } = {}) {
  const minimum = minimumEvaluationUnitCountForGroup(groupName);
  evaluationUnitCountInput.min = String(minimum);
  evaluationUnitCountInput.title = minimum > 1
    ? `Cannot reduce below ${minimum} because Block ${minimum} already has recorded grades.`
    : "";

  const requested = normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3);
  if (requested < minimum) {
    evaluationUnitCountInput.value = String(minimum);
    if (announce) {
      groupEvaluationStatus.textContent =
        `Cannot reduce to ${requested} block(s): Block ${minimum} already has recorded grades. Remove those grades first before reducing below ${minimum}.`;
      groupEvaluationStatus.className = "status-text bad";
    }
    return false;
  }

  return true;
}

function loadGroupEditor(groupName, { preserveView = false } = {}) {
  const group = groupsCache[groupName];
  if (!group) return;

  const config = groupEvaluationConfig(group);
  creatingGroup = false;
  editingGroupName = groupName;
  groupEditorTitle.textContent = `Blocks & Criteria: ${groupName}`;
  groupEditorSubtitle.textContent = "Changes are saved automatically for this group.";
  groupNameInput.value = groupName;
  groupNameInput.disabled = true;
  evaluationUnitCountInput.value = String(config.unitCount);
  applyEvaluationUnitFloor(groupName);
  pendingReportSettings = group.reportSettings && typeof group.reportSettings === "object"
    ? { ...group.reportSettings }
    : null;
  setCriteriaEditor(config.criteria);
  createGroupBtn.hidden = true;
  cancelGroupEditBtn.hidden = false;
  cancelGroupEditBtn.textContent = "Close";
  groupEvaluationStatus.textContent = config.configured
    ? "Evaluation settings are saved automatically."
    : "Evaluation settings are saved automatically as you edit. Complete 100% to enable grading and update the reusable template.";
  groupEvaluationStatus.className = "status-text";
  renderEvaluationEditorVisibility();
}


async function refreshGradeEvidenceCaches() {
  const [studentsSnapshot, assignmentsSnapshot, submissionsSnapshot, pointsLogSnapshot] = await Promise.all([
    get(ref(db, "students")),
    get(ref(db, "assignments")),
    get(ref(db, "assignmentSubmissions")),
    get(ref(db, "pointsLog"))
  ]);

  studentsCache = studentsSnapshot.val() || {};
  assignmentsCache = assignmentsSnapshot.val() || {};
  assignmentSubmissionsCache = submissionsSnapshot.val() || {};
  pointsLogCache = pointsLogSnapshot.val() || {};
}

async function saveExistingGroupEvaluation(groupName = editingGroupName) {
  if (!groupName || !groupsCache[groupName]) return;

  const version = ++evaluationAutosaveVersion;
  const storedUnitCount = groupEvaluationConfig(groupsCache[groupName]).unitCount;
  let evaluationUnitCount = normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3);

  if (evaluationUnitCount < storedUnitCount) {
    groupEvaluationStatus.textContent = "Checking recorded grades before reducing blocks…";
    groupEvaluationStatus.className = "status-text";
    try {
      await refreshGradeEvidenceCaches();
    } catch (error) {
      console.error("Could not refresh grade evidence:", error);
      groupEvaluationStatus.textContent = "Could not verify existing grades. Block count was not reduced.";
      groupEvaluationStatus.className = "status-text bad";
      evaluationUnitCountInput.value = String(storedUnitCount);
      return;
    }
    if (version !== evaluationAutosaveVersion) return;
    if (!applyEvaluationUnitFloor(groupName, { announce: true })) return;
    evaluationUnitCount = normalizeEvaluationUnitCount(evaluationUnitCountInput.value, storedUnitCount);
  } else if (!applyEvaluationUnitFloor(groupName, { announce: true })) {
    return;
  }

  const evaluationCriteria = criteriaFromForm();
  const total = evaluationWeightTotal(evaluationCriteria);
  const allNamed = evaluationCriteria.every((criterion) => Boolean(String(criterion.name || "").trim()));
  const valid = evaluationCriteria.length > 0 && allNamed && Math.abs(total - 100) < 0.01;
  const now = Date.now();

  groupEvaluationStatus.textContent = "Saving…";
  groupEvaluationStatus.className = "status-text";

  const patch = {
    evaluationUnitCount,
    evaluationCriteria: evaluationCriteria.length ? criteriaToFirebaseObject(evaluationCriteria) : null,
    evaluationWeights: null,
    evaluationConfiguredAt: valid ? now : null,
    evaluationConfiguredBy: valid ? getTeacherName() : null,
    evaluationUpdatedAt: now,
    evaluationUpdatedBy: getTeacherName()
  };

  try {
    await update(ref(db, `groups/${groupName}`), patch);
    if (version !== evaluationAutosaveVersion) return;

    groupsCache[groupName] = {
      ...groupsCache[groupName],
      ...patch
    };

    if (valid) {
      await ensureIndependentTemplate({
        evaluationCriteria,
        refreshDefaults: true
      });
      if (version !== evaluationAutosaveVersion) return;
      groupEvaluationStatus.textContent = "Saved automatically. Reusable template updated.";
      groupEvaluationStatus.className = "status-text ok";
    } else if (!evaluationCriteria.length) {
      groupEvaluationStatus.textContent = "Saved automatically. Add evaluation criteria when ready.";
      groupEvaluationStatus.className = "status-text";
    } else {
      const nameNote = allNamed ? "" : " Add a name for every criterion.";
      groupEvaluationStatus.textContent = `Saved automatically. Current total: ${total}%. Complete 100% to enable grading and update the template.${nameNote}`;
      groupEvaluationStatus.className = "status-text";
    }

    renderGroupsTable();
  } catch (error) {
    if (version !== evaluationAutosaveVersion) return;
    console.error("Evaluation autosave failed:", error);
    groupEvaluationStatus.textContent = "Could not save automatically. Try editing the field again.";
    groupEvaluationStatus.className = "status-text bad";
  }
}

function scheduleExistingGroupEvaluationSave({ immediate = false } = {}) {
  const groupName = editingGroupName;
  if (!groupName || !groupsCache[groupName]) return;

  clearTimeout(evaluationAutosaveTimer);
  if (immediate) {
    saveExistingGroupEvaluation(groupName);
    return;
  }

  evaluationAutosaveTimer = setTimeout(() => {
    evaluationAutosaveTimer = null;
    if (editingGroupName !== groupName) return;
    saveExistingGroupEvaluation(groupName);
  }, 450);
}

function selectManagedGroup(groupName) {
  const group = groupsCache[groupName];
  if (!group) return;

  const changedGroup = selectedManagedGroup !== groupName;
  selectedManagedGroup = groupName;
  editingGroupName = groupName;
  sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  window.dispatchEvent(new CustomEvent("youteach:working-group-changed", { detail: { groupName } }));

  if (changedGroup) {
    selectedRosterItems.clear();
    enrollmentLinkExpanded = false;
  }

  loadGroupEditor(groupName);
  persistManagementState();
  renderManagedStudents();
  renderGroupsTable();
  renderSelectedGroupActions();

  if (groupsDialog.open) groupsDialog.close();
}
function groupStudents(groupName) {
  return Object.entries(studentsCache || {})
    .filter(([, student]) => studentInGroup(student, groupName))
    .sort((a, b) =>
      String(a[1]?.fullName || a[1]?.name || "").localeCompare(
        String(b[1]?.fullName || b[1]?.name || ""),
        undefined,
        { sensitivity: "base" }
      )
    );
}

function groupPendingRequests(groupName) {
  return Object.entries(enrollmentRequestsCache?.[groupName] || {})
    .filter(([, request]) => String(request?.status || "pending") === "pending")
    .sort((a, b) => Number(a[1]?.requestedAt || 0) - Number(b[1]?.requestedAt || 0));
}

function enrollmentUrl(groupName) {
  const group = groupsCache?.[groupName] || {};
  const token = String(group?.enrollment?.token || "");
  if (!token || group?.enrollment?.enabled === false) return "";

  const url = new URL("student-enroll.html", window.location.href);
  url.searchParams.set("group", groupName);
  url.searchParams.set("token", token);
  return url.toString();
}

function renderEnrollmentLink() {
  const link = selectedManagedGroup ? enrollmentUrl(selectedManagedGroup) : "";
  const active = Boolean(link);

  enrollmentLinkInput.value = link;
  createEnrollmentLinkBtn.hidden = !selectedManagedGroup;
  createEnrollmentLinkBtn.textContent = "Active enrollment link";
  createEnrollmentLinkBtn.classList.toggle("active", active);
  createEnrollmentLinkBtn.setAttribute("aria-pressed", String(active));
  createEnrollmentLinkBtn.setAttribute("aria-expanded", String(active && enrollmentLinkExpanded));
  createEnrollmentLinkBtn.title = active
    ? "Show or hide the active enrollment link"
    : "Create the enrollment link for this group";
  enrollmentLinkInlineControls.hidden = !(active && enrollmentLinkExpanded);
}
const MANAGED_DISPLAY_MODES = ["name", "lastNames", "nickname"];

function managedFullName(student) {
  return String(student?.fullName || student?.name || student?.nickname || "").trim();
}

function managedNameParts(student) {
  const fullName = managedFullName(student);
  const explicitGiven = String(student?.firstName || student?.givenName || "").trim();
  const explicitLast = String(student?.lastName || student?.lastNames || student?.surname || "").trim();
  if (explicitGiven || explicitLast) {
    return {
      givenNames: explicitGiven || fullName,
      lastNames: explicitLast,
      fullName
    };
  }

  const tokens = fullName.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { givenNames: fullName, lastNames: "", fullName };
  if (tokens.length === 2) {
    return { givenNames: tokens[0], lastNames: tokens[1], fullName };
  }

  const letters = fullName.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  const surnameFirst = letters && letters === letters.toLocaleUpperCase();
  return surnameFirst
    ? { givenNames: tokens.slice(2).join(" "), lastNames: tokens.slice(0, 2).join(" "), fullName }
    : { givenNames: tokens.slice(0, -2).join(" "), lastNames: tokens.slice(-2).join(" "), fullName };
}

function managedOrderedFullName(student, { lastNamesFirst = false } = {}) {
  const parts = managedNameParts(student);
  const fullName = parts.fullName;
  const lastNames = String(parts.lastNames || "").trim();
  let givenNames = String(parts.givenNames || "").trim();

  if (!lastNames) return fullName || givenNames;
  if (!givenNames) return fullName || lastNames;

  if (givenNames === fullName && fullName) {
    const fullLower = fullName.toLocaleLowerCase();
    const lastLower = lastNames.toLocaleLowerCase();
    if (fullLower.endsWith(` ${lastLower}`)) {
      givenNames = fullName.slice(0, -(lastNames.length + 1)).trim();
    } else if (fullLower.startsWith(`${lastLower} `)) {
      givenNames = fullName.slice(lastNames.length + 1).trim();
    } else {
      return fullName;
    }
  }

  if (!givenNames) return fullName || lastNames;
  return lastNamesFirst
    ? `${lastNames} ${givenNames}`.trim()
    : `${givenNames} ${lastNames}`.trim();
}

function managedDisplayMode(groupName) {
  const raw = String(groupsCache?.[groupName]?.studentListDisplayMode || "name");
  return MANAGED_DISPLAY_MODES.includes(raw) ? raw : "name";
}

function managedPrimaryDisplay(student, mode) {
  if (mode === "lastNames") return managedOrderedFullName(student, { lastNamesFirst: true });
  if (mode === "nickname") return String(student?.nickname || "").trim() || managedOrderedFullName(student);
  return managedOrderedFullName(student);
}

function managedSecondaryDisplay(student, mode) {
  const parts = managedNameParts(student);
  const nickname = String(student?.nickname || "").trim();
  const id = String(student?.studentNumber || "").trim();
  const pieces = [];

  if (mode === "nickname") {
    const orderedName = managedOrderedFullName(student);
    if (orderedName && orderedName !== nickname) pieces.push(orderedName);
  } else if (nickname) {
    pieces.push(nickname);
  }
  if (id) pieces.push(`ID ${id}`);
  return pieces.join(" · ");
}

function managedDisplayModeLabel(mode) {
  if (mode === "lastNames") return "Last names";
  if (mode === "nickname") return "Nicknames";
  return "Names";
}

function managedGradeNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function managedStudentNameFontSize(name) {
  const length = Array.from(String(name || "").trim()).length;
  if (length <= 14) return 18;
  if (length <= 20) return 16;
  if (length <= 28) return 14;
  if (length <= 36) return 12;
  return 10.5;
}

function managedCriterionHeaderLabel(criterion) {
  const words = String(criterion?.name || "").trim().split(/\s+/).filter(Boolean);
  const weight = `${managedGradeNumber(criterion?.weight)}%`;
  if (!words.length) return weight;
  if (words.length === 1) return `${escapeHtml(words[0])}<br>${weight}`;
  const firstLine = escapeHtml(words.slice(0, -1).join(" "));
  const secondLine = `${escapeHtml(words[words.length - 1])} ${weight}`;
  return `${firstLine}<br>${secondLine}`;
}

function managedBlockCriteriaHeaderHtml(config) {
  if (!config.configured) {
    return '<span class="block-grade-setup-required">Evaluation setup required</span>';
  }
  const columns = config.criteria.length + 1;
  return `
    <span class="managed-block-criteria-grid" style="--criterion-columns:${columns}">
      ${config.criteria.map((criterion) =>
        `<span class="managed-block-label">${managedCriterionHeaderLabel(criterion)}</span>`
      ).join("")}
      <span class="managed-block-label managed-block-total">Total</span>
    </span>
  `;
}

function renderManagedBlockHeaders(blockNames, config) {
  const criteria = managedBlockCriteriaHeaderHtml(config);
  managedStudentsTableHeadRow.innerHTML = `
    <th class="managed-student-column-header">Student</th>
    ${blockNames.map((blockName) => `
      <th class="managed-block-grade-header">
        <span class="managed-block-title">${escapeHtml(blockName)}</span>
        ${criteria}
      </th>
    `).join("")}
  `;
}

function managedBlockGradeHtml(studentKey, student, blockName, config) {
  if (!config.configured) {
    return '<span class="block-grade-setup-required">Setup required</span>';
  }

  const result = calculateStudentBlockGrade({
    studentKey,
    student,
    blockName,
    config,
    assignments: assignmentsCache,
    submissions: assignmentSubmissionsCache
  });
  const columns = result.criteria.length + 1;

  return `
    <span class="managed-block-values-grid" style="--criterion-columns:${columns}">
      ${result.criteria.map((criterion) =>
        `<span class="managed-block-value">${managedGradeNumber(criterion.contribution)}%</span>`
      ).join("")}
      <span class="managed-block-value managed-block-total">${managedGradeNumber(result.total)}%</span>
    </span>
  `;
}

function managedFilteredStudents(groupName) {
  const query = String(managedStudentSearch?.value || "").trim().toLocaleLowerCase();
  const mode = managedDisplayMode(groupName);

  return groupStudents(groupName)
    .filter(([, student]) => {
      if (!query) return true;
      const parts = managedNameParts(student);
      const searchable = [
        parts.fullName,
        parts.givenNames,
        parts.lastNames,
        student?.nickname || "",
        student?.studentNumber || "",
        student?.id || ""
      ].join(" ").toLocaleLowerCase();
      return searchable.includes(query);
    })
    .sort((a, b) =>
      managedPrimaryDisplay(a[1], mode).localeCompare(
        managedPrimaryDisplay(b[1], mode),
        undefined,
        { sensitivity: "base" }
      )
    );
}

function rosterSelectionKey(kind, id) {
  return `${kind}:${id}`;
}

function selectedRosterIds(kind) {
  const prefix = `${kind}:`;
  return [...selectedRosterItems]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

function renderPendingRequestActions() {
  const requests = selectedRosterIds("request");
  pendingRequestActions.hidden = requests.length === 0;
  pendingRequestLabel.textContent = requests.length
    ? `${requests.length} pending request${requests.length === 1 ? "" : "s"} selected`
    : "";
}

function renderActiveEvaluationBlockControl() {
  const groupName = selectedManagedGroup;
  const group = groupName ? groupsCache?.[groupName] : null;
  const hasGroup = Boolean(groupName && group);

  activeEvaluationBlockBtn.hidden = !hasGroup;
  if (!hasGroup) {
    activeEvaluationBlockBtn.textContent = "Active Block";
    return;
  }

  const activeBlock = activeEvaluationBlockForGroup(group, settingsCache);
  activeEvaluationBlockBtn.textContent = `Active Block: ${activeBlock}`;
  activeEvaluationBlockBtn.title = `Change the persistent working block for ${groupName}`;
}

function openActiveEvaluationBlockDialog() {
  const groupName = selectedManagedGroup;
  const group = groupName ? groupsCache?.[groupName] : null;
  if (!groupName || !group) return;

  const blocks = evaluationBlockNames(group);
  const activeBlock = activeEvaluationBlockForGroup(group, settingsCache);
  activeEvaluationBlockGroupLabel.textContent = groupName;
  activeEvaluationBlockSelect.innerHTML = blocks
    .map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`)
    .join("");
  activeEvaluationBlockSelect.value = blocks.includes(activeBlock) ? activeBlock : (blocks[0] || "");
  activeEvaluationBlockStatus.textContent = "";
  activeEvaluationBlockStatus.className = "status-text";

  if (!activeEvaluationBlockDialog.open) activeEvaluationBlockDialog.showModal();
}

async function saveActiveEvaluationBlock() {
  const groupName = selectedManagedGroup;
  const group = groupName ? groupsCache?.[groupName] : null;
  if (!groupName || !group) return;

  const blocks = evaluationBlockNames(group);
  const selectedBlock = String(activeEvaluationBlockSelect.value || "").trim();
  if (!blocks.includes(selectedBlock)) {
    activeEvaluationBlockStatus.textContent = "Choose a valid block / unit.";
    activeEvaluationBlockStatus.className = "status-text bad";
    return;
  }

  saveActiveEvaluationBlockBtn.disabled = true;
  activeEvaluationBlockStatus.textContent = "Saving…";
  activeEvaluationBlockStatus.className = "status-text";

  try {
    const updates = {
      [`groups/${groupName}/activeEvaluationBlock`]: selectedBlock
    };

    if (sessionStorage.getItem(WORKING_GROUP_KEY) === groupName) {
      updates["settings/activeBlock"] = selectedBlock;
    }

    await update(ref(db), updates);

    groupsCache[groupName] = {
      ...groupsCache[groupName],
      activeEvaluationBlock: selectedBlock
    };
    if (sessionStorage.getItem(WORKING_GROUP_KEY) === groupName) {
      settingsCache = { ...settingsCache, activeBlock: selectedBlock };
    }

    renderActiveEvaluationBlockControl();
    activeEvaluationBlockDialog.close();
  } catch (error) {
    console.error("Active block save failed:", error);
    activeEvaluationBlockStatus.textContent =
      `Could not save the active block: ${error?.message || "unknown Firebase error"}`;
    activeEvaluationBlockStatus.className = "status-text bad";
  } finally {
    saveActiveEvaluationBlockBtn.disabled = false;
  }
}

function renderManagedStudents() {
  const groupName = selectedManagedGroup;
  renderActiveEvaluationBlockControl();

  if (!groupName || !groupsCache[groupName]) {
    enrollmentControls.hidden = true;
    createEnrollmentLinkBtn.hidden = true;
    enrollmentLinkInlineControls.hidden = true;
    openAddStudentModalBtn.hidden = true;
    takeAttendanceBtn.hidden = true;
    pendingRequestsPanel.hidden = true;
    pendingRequestsList.innerHTML = "";
    managedStudentsTableHeadRow.innerHTML = '<th class="managed-student-column-header">Student</th>';
    managedStudentsTableBody.innerHTML = '<tr><td>No enrolled students yet.</td></tr>';
    managedStudentsCount.textContent = "0";
    pendingRequestActions.hidden = true;
    return;
  }

  enrollmentControls.hidden = false;
  openAddStudentModalBtn.hidden = false;
  takeAttendanceBtn.hidden = false;

  const enrolled = groupStudents(groupName);
  const pending = groupPendingRequests(groupName);
  const displayMode = managedDisplayMode(groupName);
  managedStudentsCount.textContent = String(enrolled.length);
  managedStudentDisplayModeBtn.textContent = managedDisplayModeLabel(displayMode);
  managedStudentDisplayModeBtn.title = "Names, Last names, or Nicknames";

  const visibleKeys = new Set(
    pending.map(([id]) => rosterSelectionKey("request", id))
  );
  [...selectedRosterItems].forEach((key) => {
    if (!visibleKeys.has(key)) selectedRosterItems.delete(key);
  });

  pendingRequestsPanel.hidden = pending.length === 0;
  pendingRequestsList.innerHTML = pending.map(([requestId, request]) => {
    const key = rosterSelectionKey("request", requestId);
    return `
      <div class="pending-request-row ${selectedRosterItems.has(key) ? "selected" : ""}"
        data-selection-key="${escapeHtml(key)}" data-roster-kind="request" data-roster-id="${escapeHtml(requestId)}">
        <input class="pending-request-checkbox" type="checkbox" ${selectedRosterItems.has(key) ? "checked" : ""} aria-label="Select pending request">
        <span>${escapeHtml(request.fullName || request.name || "Pending student")}</span>
        <span>${escapeHtml(request.nickname || "—")}</span>
        <span>${escapeHtml(request.externalId || request.studentNumber || "—")}</span>
      </div>
    `;
  }).join("");

  const config = groupEvaluationConfig(groupsCache[groupName] || {});
  const blockNames = evaluationBlockNames(groupsCache[groupName] || {});
  renderManagedBlockHeaders(blockNames, config);

  const filtered = managedFilteredStudents(groupName);
  const columnCount = 1 + blockNames.length;
  managedStudentsTableBody.innerHTML = filtered.length
    ? filtered.map(([studentKey, student]) => {
        const displayName = managedPrimaryDisplay(student, displayMode);
        const secondary = managedSecondaryDisplay(student, displayMode);
        return `
          <tr class="managed-student-row ${student.activeNow ? "active-student" : ""}"
            data-roster-kind="student" data-roster-id="${escapeHtml(studentKey)}">
            <td class="managed-student-identity-cell">
              <span class="managed-student-name" style="font-size:${managedStudentNameFontSize(displayName)}px" title="${escapeHtml(managedFullName(student))}">${escapeHtml(displayName)}</span>
              ${secondary ? `<span class="managed-student-meta">${escapeHtml(secondary)}</span>` : ""}
            </td>
            ${blockNames.map((blockName) =>
              `<td class="managed-block-grade-cell">${managedBlockGradeHtml(studentKey, student, blockName, config)}</td>`
            ).join("")}
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="${columnCount}">No students found for this group.</td></tr>`;

  const pendingCheckboxes = [...pendingRequestsList.querySelectorAll(".pending-request-checkbox")];
  selectAllStudents.checked =
    pendingCheckboxes.length > 0 && pendingCheckboxes.every((checkbox) => checkbox.checked);
  selectAllStudents.indeterminate =
    pendingCheckboxes.some((checkbox) => checkbox.checked) && !selectAllStudents.checked;

  persistManagementState();
  renderPendingRequestActions();
  renderEnrollmentLink();
  renderSelectedGroupActions();
}
function renderGroupsTable() {
  renderGroupsDialog({
    groups: groupsCache,
    students: studentsCache,
    pendingRequests: enrollmentRequestsCache,
    markedGroup: popupSelectedGroup
  });
  renderSelectedGroupActions();
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n")
    .map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  return lines.map((line) => {
    const cols = parseCsvLine(line);
    return {
      studentNumber: (cols[0] || "").trim(),
      fullName: (cols[1] || "").trim(),
      nickname: (cols[2] || "").trim()
    };
  }).filter((student) => student.fullName);
}

function parseBulkText(text) {
  return String(text || "").replace(/\r/g, "").split("\n")
    .map((line) => line.trim()).filter(Boolean).map((line) => {
      if (line.includes("\t")) {
        const parts = line.split("\t");
        return {
          studentNumber: (parts[0] || "").trim(),
          fullName: parts.slice(1).join(" ").trim(),
          nickname: ""
        };
      }

      const parts = parseCsvLine(line);
      return {
        studentNumber: (parts[0] || "").trim(),
        fullName: (parts[1] || "").trim() || line,
        nickname: (parts[2] || "").trim()
      };
    }).filter((student) => student.fullName);
}

function initialBlockPoints(groupName) {
  const group = groupsCache?.[groupName] || {};
  return Object.fromEntries(evaluationBlockNames(group).map((blockName) => [blockName, 0]));
}

async function saveStudent(fullName, nickname = "", studentNumber = "", groupName = "", extras = {}) {
  const cleanName = String(fullName || "").trim();
  const cleanNickname = String(nickname || "").trim() || cleanName.split(" ")[0] || "Student";
  const cleanNumber = String(studentNumber || "").trim();
  const internalId = generateId();
  const newRef = push(ref(db, "students"));

  await set(newRef, {
    fullName: cleanName,
    name: cleanName,
    nickname: cleanNickname,
    studentNumber: cleanNumber,
    groupName,
    groupMemberships: groupName ? { [groupName]: true } : {},
    id: internalId,
    password: "1234",
    activeNow: false,
    enrollmentStatus: "approved",
    enrolledAt: Date.now(),
    blockPoints: initialBlockPoints(groupName),
    ...extras
  });

  return newRef.key;
}


function normalizeStudentSearch(value) {
  return String(value || "").toLocaleLowerCase().trim();
}

function existingStudentCandidates() {
  const targetGroup = String(selectedManagedGroup || "");
  const query = normalizeStudentSearch(existingStudentSearch?.value || "");
  const groupFilter = String(existingStudentGroupFilter?.value || "");

  return Object.entries(studentsCache || {})
    .filter(([, student]) => !studentInGroup(student, targetGroup))
    .filter(([, student]) => !groupFilter || studentInGroup(student, groupFilter))
    .filter(([studentKey, student]) => {
      if (!query) return true;
      const haystack = [
        studentKey,
        student?.fullName,
        student?.name,
        student?.nickname,
        student?.studentNumber,
        student?.externalId,
        student?.id,
        ...studentGroupNames(student)
      ].map(normalizeStudentSearch).join(" ");
      return haystack.includes(query);
    })
    .sort((a, b) =>
      managedFullName(a[1]).localeCompare(managedFullName(b[1]), undefined, { sensitivity: "base" })
    );
}

function renderExistingStudentGroupFilter() {
  if (!existingStudentGroupFilter) return;
  const previous = existingStudentGroupFilter.value;
  const groups = [...new Set(
    Object.values(studentsCache || {})
      .flatMap((student) => studentGroupNames(student))
      .map((groupName) => String(groupName || "").trim())
      .filter(Boolean)
      .filter((groupName) => groupName !== selectedManagedGroup)
  )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  existingStudentGroupFilter.innerHTML =
    '<option value="">All groups</option>' +
    groups.map((groupName) => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)}</option>`).join("");

  if (groups.includes(previous)) existingStudentGroupFilter.value = previous;
}

function syncExistingStudentsMasterCheckbox(entries = existingStudentCandidates()) {
  const visibleKeys = entries.map(([studentKey]) => studentKey);
  const selectedVisible = visibleKeys.filter((studentKey) => selectedExistingStudentKeys.has(studentKey));
  existingStudentsMasterCheckbox.disabled = visibleKeys.length === 0;
  existingStudentsMasterCheckbox.checked =
    visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;
  existingStudentsMasterCheckbox.indeterminate =
    selectedVisible.length > 0 && selectedVisible.length < visibleKeys.length;
  existingStudentSelectionCount.textContent =
    `${selectedExistingStudentKeys.size} selected`;
  enrollExistingStudentsBtn.disabled = selectedExistingStudentKeys.size === 0;
}

function renderExistingStudents() {
  if (!existingStudentsList) return;
  renderExistingStudentGroupFilter();
  const entries = existingStudentCandidates();

  if (!entries.length) {
    existingStudentsList.innerHTML = '<tr><td colspan="5">No existing students match this search.</td></tr>';
    syncExistingStudentsMasterCheckbox(entries);
    return;
  }

  existingStudentsList.innerHTML = entries.map(([studentKey, student]) => {
    const checked = selectedExistingStudentKeys.has(studentKey) ? "checked" : "";
    const fullName = managedFullName(student) || studentKey;
    const nickname = String(student?.nickname || "").trim();
    const groupName = studentGroupNames(student).join(" · ");
    const externalId = String(student?.studentNumber || student?.externalId || "").trim();
    return `
      <tr>
        <td><input class="existing-student-checkbox" type="checkbox"
          data-existing-student-key="${escapeHtml(studentKey)}" ${checked}
          aria-label="Select ${escapeHtml(fullName)}"></td>
        <td><span class="existing-student-name">${escapeHtml(fullName)}</span></td>
        <td>${escapeHtml(nickname || "—")}</td>
        <td>${escapeHtml(groupName || "—")}</td>
        <td>${escapeHtml(externalId || "—")}</td>
      </tr>
    `;
  }).join("");

  syncExistingStudentsMasterCheckbox(entries);
}

async function enrollSelectedExistingStudents() {
  const targetGroup = String(selectedManagedGroup || "");
  const selectedKeys = [...selectedExistingStudentKeys]
    .filter((studentKey) => studentsCache?.[studentKey])
    .filter((studentKey) => !studentInGroup(studentsCache[studentKey], targetGroup));

  if (!targetGroup || !selectedKeys.length) {
    addStudentStatus.textContent = "Select at least one existing student.";
    return;
  }

  const now = Date.now();
  const updates = {};
  selectedKeys.forEach((studentKey) => {
    updates[`students/${studentKey}/groupMemberships/${targetGroup}`] = true;
    updates[`students/${studentKey}/enrollmentStatus`] = "approved";
    updates[`students/${studentKey}/enrollmentSource`] = "teacher-existing";
    updates[`students/${studentKey}/enrolledAt`] = now;
    updates[`students/${studentKey}/enrolledBy`] = getTeacherName();
  });

  enrollExistingStudentsBtn.disabled = true;
  try {
    await update(ref(db), updates);
    selectedExistingStudentKeys.clear();
    addStudentStatus.textContent =
      `${selectedKeys.length} existing student(s) enrolled in ${targetGroup}.`;
    renderExistingStudents();
  } catch (error) {
    console.error("Enroll existing students failed:", error);
    addStudentStatus.textContent =
      `Could not enroll selected students: ${error?.message || "unknown Firebase error"}`;
  } finally {
    enrollExistingStudentsBtn.disabled = selectedExistingStudentKeys.size === 0;
  }
}

function setModalPane(active) {
  const panes = {
    manual: [manualStudentTabBtn, manualStudentPane],
    csv: [csvStudentTabBtn, csvStudentPane],
    paste: [pasteStudentTabBtn, pasteStudentPane],
    existing: [existingStudentTabBtn, existingStudentPane]
  };

  Object.entries(panes).forEach(([key, [button, pane]]) => {
    const isActive = key === active;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    pane.hidden = !isActive;
  });

  if (active === "existing") renderExistingStudents();
}

function openAddStudentDialog() {
  if (!selectedManagedGroup) return;
  addStudentGroupLabel.textContent = `Group: ${selectedManagedGroup}`;
  addStudentStatus.textContent = "";
  selectedExistingStudentKeys.clear();
  existingStudentSearch.value = "";
  existingStudentGroupFilter.value = "";
  setModalPane("manual");
  addStudentDialog.showModal();
}

async function createOrRotateEnrollmentLink({ rotate = false } = {}) {
  const groupName = selectedManagedGroup;
  if (!groupName) return;

  const current = groupsCache?.[groupName]?.enrollment?.token || "";
  if (rotate && current && !confirm("Rotate the enrollment link? The previous link will stop working.")) return;

  const token = makeEnrollmentToken();
  await update(ref(db, `groups/${groupName}/enrollment`), {
    token,
    enabled: true,
    updatedAt: Date.now(),
    updatedBy: getTeacherName()
  });

  if (groupsCache?.[groupName]) {
    groupsCache[groupName] = {
      ...groupsCache[groupName],
      enrollment: {
        ...(groupsCache[groupName].enrollment || {}),
        token,
        enabled: true,
        updatedAt: Date.now(),
        updatedBy: getTeacherName()
      }
    };
  }
}

async function copyEnrollmentLink() {
  const link = selectedManagedGroup ? enrollmentUrl(selectedManagedGroup) : "";
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
  } catch (_) {
    enrollmentLinkInput.focus();
    enrollmentLinkInput.select();
    document.execCommand("copy");
    enrollmentLinkInput.setSelectionRange(0, 0);
  }
  enrollmentLinkExpanded = false;
  persistManagementState();
  renderEnrollmentLink();

  const previous = copyEnrollmentLinkBtn.textContent;
  copyEnrollmentLinkBtn.textContent = "Copied";
  setTimeout(() => {
    copyEnrollmentLinkBtn.textContent = previous || "Copy link";
  }, 1200);
}

function openStudentRecord(studentKey) {
  if (!studentKey) return;
  sessionStorage.setItem("teacherViewStudentKey", studentKey);
  window.location.href = `student-summary.html?teacherViewStudentKey=${encodeURIComponent(studentKey)}`;
}

async function approveSelectedRequests() {
  if (!selectedManagedGroup) return;
  const selectedRequests = selectedRosterIds("request");

  if (!selectedRequests.length) {
    alert("Select at least one pending enrollment request.");
    return;
  }

  for (const requestId of selectedRequests) {
    const request = enrollmentRequestsCache?.[selectedManagedGroup]?.[requestId];
    if (!request || String(request.status || "pending") !== "pending") continue;

    const studentKey = await saveStudent(
      request.fullName || request.name || "",
      request.nickname || "",
      request.externalId || request.studentNumber || "",
      selectedManagedGroup,
      { enrollmentRequestId: requestId }
    );

    await update(ref(db, `groupEnrollmentRequests/${selectedManagedGroup}/${requestId}`), {
      status: "approved",
      studentKey,
      decidedAt: Date.now(),
      decidedBy: getTeacherName()
    });
  }

  selectedRosterItems.clear();
  persistManagementState();
}

async function denySelectedRequests() {
  if (!selectedManagedGroup) return;
  const selectedRequests = selectedRosterIds("request");

  if (!selectedRequests.length) {
    alert("Select at least one pending enrollment request.");
    return;
  }

  if (!confirm(`Deny ${selectedRequests.length} enrollment request(s)?`)) return;

  const updates = {};
  selectedRequests.forEach((requestId) => {
    updates[`groupEnrollmentRequests/${selectedManagedGroup}/${requestId}/status`] = "denied";
    updates[`groupEnrollmentRequests/${selectedManagedGroup}/${requestId}/decidedAt`] = Date.now();
    updates[`groupEnrollmentRequests/${selectedManagedGroup}/${requestId}/decidedBy`] = getTeacherName();
  });
  await update(ref(db), updates);
  selectedRosterItems.clear();
  persistManagementState();
}

function triggerJsonDownload(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function objectFilter(source, predicate) {
  return Object.fromEntries(Object.entries(source || {}).filter(predicate));
}

function buildGroupBackup(root, groupName) {
  const group = root?.groups?.[groupName] || {};
  const students = objectFilter(root?.students, ([, student]) =>
    studentInGroup(student, groupName)
  );
  const formerStudents = root?.groupFormerStudents?.[groupName] || {};
  const studentKeys = new Set([...Object.keys(students), ...Object.keys(formerStudents)]);
  const assignments = objectFilter(root?.assignments, ([, assignment]) =>
    String(assignment?.groupName || "") === groupName
  );
  const assignmentIds = new Set(Object.keys(assignments));

  const assignmentSubmissions = {};
  Object.entries(root?.assignmentSubmissions || {}).forEach(([assignmentId, byStudent]) => {
    const relevant = objectFilter(byStudent, ([studentKey]) => deletedStudentKeys.has(studentKey));
    if (assignmentIds.has(assignmentId)) {
      assignmentSubmissions[assignmentId] = byStudent || {};
    } else if (Object.keys(relevant).length) {
      assignmentSubmissions[assignmentId] = relevant;
    }
  });

  const attendance = {};
  Object.entries(root?.attendance || {}).forEach(([dateKey, byStudent]) => {
    const relevant = objectFilter(byStudent, ([studentKey, row]) =>
      deletedStudentKeys.has(studentKey) || String(row?.groupName || "") === groupName
    );
    if (Object.keys(relevant).length) attendance[dateKey] = relevant;
  });

  const pointsLog = objectFilter(root?.pointsLog, ([, entry]) =>
    String(entry?.groupName || "") === groupName
  );

  const sessionHistory = objectFilter(root?.sessionHistory, ([, session]) =>
    String(session?.groupName || "") === groupName
  );

  const pairHistory = objectFilter(root?.pairHistory, ([, entry]) =>
    String(entry?.groupName || "") === groupName
  );

  return {
    schema: "youteach-group-backup",
    schemaVersion: 1,
    exportedAt: Date.now(),
    exportedAtIso: new Date().toISOString(),
    exportedBy: getTeacherName(),
    groupName,
    group,
    students,
    formerStudents,
    enrollmentRequests: root?.groupEnrollmentRequests?.[groupName] || {},
    assignments,
    assignmentSubmissions,
    attendance,
    pointsLog,
    sessionHistory,
    pairHistory,
    currentSession:
      String(root?.session?.current?.groupName || "") === groupName
        ? (root.session.current || null)
        : null
  };
}

function buildGroupDeletionUpdates(root, backup) {
  const groupName = backup.groupName;
  const updates = {
    [`groups/${groupName}`]: null,
    [`groupEnrollmentRequests/${groupName}`]: null,
    [`groupFormerStudents/${groupName}`]: null
  };

  const membershipPlan = planStudentRemovalFromGroup(root?.students || {}, groupName);
  Object.assign(updates, membershipPlan.updates);
  const deletedStudentKeys = new Set(membershipPlan.deletedStudentKeys);

  Object.keys(backup.assignments || {}).forEach((assignmentId) => {
    updates[`assignments/${assignmentId}`] = null;
    updates[`assignmentSubmissions/${assignmentId}`] = null;
  });

  Object.entries(root?.assignmentSubmissions || {}).forEach(([assignmentId, byStudent]) => {
    if (backup.assignments?.[assignmentId]) return;
    Object.keys(byStudent || {}).forEach((studentKey) => {
      if (deletedStudentKeys.has(studentKey)) {
        updates[`assignmentSubmissions/${assignmentId}/${studentKey}`] = null;
      }
    });
  });

  Object.entries(root?.attendance || {}).forEach(([dateKey, byStudent]) => {
    Object.entries(byStudent || {}).forEach(([studentKey, row]) => {
      if (deletedStudentKeys.has(studentKey) || String(row?.groupName || "") === groupName) {
        updates[`attendance/${dateKey}/${studentKey}`] = null;
      }
    });
  });

  Object.keys(backup.pointsLog || {}).forEach((id) => {
    updates[`pointsLog/${id}`] = null;
  });
  Object.keys(backup.sessionHistory || {}).forEach((id) => {
    updates[`sessionHistory/${id}`] = null;
  });
  Object.keys(backup.pairHistory || {}).forEach((id) => {
    updates[`pairHistory/${id}`] = null;
  });

  if (backup.currentSession) {
    updates["session/current"] = null;
  }

  return updates;
}

function groupCleanupPaths(root, backup) {
  const updates = buildGroupDeletionUpdates(root, backup);
  delete updates[`groups/${backup.groupName}`];
  return Object.keys(updates);
}

async function cleanupDeletedGroupPaths(paths) {
  const results = await Promise.allSettled(
    paths.map((path) => set(ref(db, path), null))
  );
  return results.filter((result) => result.status === "rejected");
}

function openDeleteGroupDialog() {
  const groupName = popupSelectedGroup;
  if (!groupName || !groupsCache[groupName]) return;
  deletionTargetGroup = groupName;

  deleteGroupDialogSubtitle.textContent =
    `A backup will download before "${groupName}" is deleted.`;
  deleteGroupConfirmInput.value = "";
  deleteGroupConfirmInput.placeholder = groupName;
  deleteGroupStatus.textContent = "";
  deleteGroupStatus.className = "status-text";
  confirmDeleteGroupBtn.disabled = false;

  if (groupsDialog.open) groupsDialog.close();
  deleteGroupDialog.showModal();
  deleteGroupConfirmInput.focus();
}

async function readDeletionBranch(path, fallback = {}) {
  try {
    const snapshot = await get(ref(db, path));
    const value = snapshot.val();
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    console.warn(`Delete backup could not read ${path}:`, error);
    return fallback;
  }
}

async function loadGroupDeletionRoot(groupName) {
  const [
    group,
    students,
    formerStudents,
    enrollmentRequests,
    assignments,
    assignmentSubmissions,
    attendance,
    pointsLog,
    sessionHistory,
    pairHistory,
    currentSession
  ] = await Promise.all([
    readDeletionBranch(`groups/${groupName}`, {}),
    readDeletionBranch("students", {}),
    readDeletionBranch(`groupFormerStudents/${groupName}`, {}),
    readDeletionBranch(`groupEnrollmentRequests/${groupName}`, {}),
    readDeletionBranch("assignments", {}),
    readDeletionBranch("assignmentSubmissions", {}),
    readDeletionBranch("attendance", {}),
    readDeletionBranch("pointsLog", {}),
    readDeletionBranch("sessionHistory", {}),
    readDeletionBranch("pairHistory", {}),
    readDeletionBranch("session/current", null)
  ]);

  return {
    groups: { [groupName]: group || {} },
    students: students || {},
    groupFormerStudents: { [groupName]: formerStudents || {} },
    groupEnrollmentRequests: { [groupName]: enrollmentRequests || {} },
    assignments: assignments || {},
    assignmentSubmissions: assignmentSubmissions || {},
    attendance: attendance || {},
    pointsLog: pointsLog || {},
    sessionHistory: sessionHistory || {},
    pairHistory: pairHistory || {},
    session: { current: currentSession || null }
  };
}

function isPermissionDeniedError(error) {
  const text = String(error?.code || error?.message || error || "");
  return /permission[-_ ]?denied/i.test(text);
}

async function markGroupDeleted(groupName) {
  await update(ref(db, `groups/${groupName}`), {
    deleted: true,
    deletedAt: Date.now(),
    deletedBy: getTeacherName()
  });
}

async function deleteGroupWithBackup(groupName) {
  const typed = String(deleteGroupConfirmInput.value || "").trim();

  if (typed !== groupName) {
    deleteGroupStatus.textContent = "Group name does not match.";
    deleteGroupStatus.className = "status-text bad";
    return false;
  }

  confirmDeleteGroupBtn.disabled = true;
  deleteGroupStatus.textContent = "Creating backup…";
  deleteGroupStatus.className = "status-text";

  try {
    const root = await loadGroupDeletionRoot(groupName);
    const backup = buildGroupBackup(root, groupName);
    const date = new Date().toISOString().slice(0, 10);

    triggerJsonDownload(`group-backup-${cleanFilePart(groupName)}-${date}.json`, backup);

    deleteGroupStatus.textContent = "Deleting group…";

    let softDeleted = false;
    try {
      await set(ref(db, `groups/${groupName}`), null);
    } catch (error) {
      if (!isPermissionDeniedError(error)) throw error;
      await markGroupDeleted(groupName);
      softDeleted = true;
    }

    if (groupsCache[groupName]) delete groupsCache[groupName];
    if (popupSelectedGroup === groupName) popupSelectedGroup = "";
    if (deletionTargetGroup === groupName) deletionTargetGroup = "";

    const cleanupFailures = await cleanupDeletedGroupPaths(groupCleanupPaths(root, backup));

    if (selectedManagedGroup === groupName) resetGroupForm();
    renderGroupsTable();

    if (softDeleted) {
      deleteGroupStatus.textContent = cleanupFailures.length
        ? `Group removed from YouTeach. Firebase blocked physical deletion; ${cleanupFailures.length} related record(s) also could not be cleaned.`
        : "Group removed from YouTeach. Firebase blocked physical deletion, so it was archived as deleted.";
      deleteGroupStatus.className = cleanupFailures.length ? "status-text bad" : "status-text ok";
    } else {
      deleteGroupStatus.textContent = cleanupFailures.length
        ? `Group deleted. ${cleanupFailures.length} related record(s) could not be cleaned automatically.`
        : "Group deleted.";
      deleteGroupStatus.className = cleanupFailures.length ? "status-text bad" : "status-text ok";
    }

    setTimeout(() => {
      if (deleteGroupDialog.open) deleteGroupDialog.close();
    }, cleanupFailures.length ? 2200 : 700);

    return true;
  } catch (error) {
    console.error("Delete group failed:", error);
    deleteGroupStatus.textContent =
      `Could not delete group: ${error?.message || "unknown Firebase error"}`;
    deleteGroupStatus.className = "status-text bad";
    confirmDeleteGroupBtn.disabled = false;
    return false;
  }
}

createGroupBtn.addEventListener("click", async () => {
  const groupName = groupNameInput.value.trim();

  if (!groupName) {
    groupEvaluationStatus.textContent = "Enter a group name.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  if (groupsCache[groupName]) {
    groupEvaluationStatus.textContent = "That group already exists. Select it from the Groups list.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  const evaluationUnitCount = normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3);
  const evaluationCriteria = criteriaFromForm();
  const total = evaluationWeightTotal(evaluationCriteria);
  const allNamed = evaluationCriteria.every((criterion) => Boolean(String(criterion.name || "").trim()));
  const valid = evaluationCriteria.length > 0 && allNamed && Math.abs(total - 100) < 0.01;
  const now = Date.now();

  const savedGroupRecord = {
    name: groupName,
    createdAt: now,
    evaluationUnitCount,
    evaluationCriteria: evaluationCriteria.length ? criteriaToFirebaseObject(evaluationCriteria) : null,
    ...(pendingReportSettings ? { reportSettings: pendingReportSettings } : {}),
    evaluationConfiguredAt: valid ? now : null,
    evaluationConfiguredBy: valid ? getTeacherName() : null,
    evaluationUpdatedAt: now,
    evaluationUpdatedBy: getTeacherName()
  };

  await update(ref(db, `groups/${groupName}`), {
    ...savedGroupRecord,
    evaluationWeights: null
  });

  groupsCache[groupName] = savedGroupRecord;

  if (valid) {
    await ensureIndependentTemplate({
      evaluationCriteria,
      refreshDefaults: true
    });
  }

  selectedManagedGroup = groupName;
  editingGroupName = groupName;
  sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  loadGroupEditor(groupName);
  renderEvaluationEditorVisibility();
  persistManagementState();
  renderManagedStudents();
  renderGroupsTable();
  renderSelectedGroupActions();

  groupEvaluationStatus.textContent = valid
    ? "Group created. Evaluation settings are saved automatically."
    : "Group created. Evaluation settings will save automatically as you edit.";
  groupEvaluationStatus.className = "status-text ok";
  creatingGroup = false;
  if (groupEditorDialog.open) groupEditorDialog.close();
});

cancelGroupEditBtn.addEventListener("click", () => groupEditorDialog.close());
groupEditorDialog.addEventListener("close", () => {
  const wasCreating = creatingGroup;
  creatingGroup = false;
  if (wasCreating && selectedManagedGroup && groupsCache[selectedManagedGroup]) {
    loadGroupEditor(selectedManagedGroup);
  }
});
addEvaluationCriterionBtn.addEventListener("click", () => {
  addEvaluationCriterionRow();
  scheduleExistingGroupEvaluationSave({ immediate: true });
});

evaluationUnitCountInput.addEventListener("input", () => scheduleExistingGroupEvaluationSave());
evaluationUnitCountInput.addEventListener("change", () => {
  if (!applyEvaluationUnitFloor(editingGroupName, { announce: true })) return;
  scheduleExistingGroupEvaluationSave({ immediate: true });
});

evaluationCriteriaRows.addEventListener("input", () => {
  refreshEvaluationWeightTotal();
  scheduleExistingGroupEvaluationSave();
});
evaluationCriteriaRows.addEventListener("change", () => {
  refreshEvaluationWeightTotal();
  scheduleExistingGroupEvaluationSave({ immediate: true });
});
evaluationCriteriaRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-evaluation-criterion]");
  if (!button) return;
  button.closest("[data-evaluation-criterion]")?.remove();
  if (!evaluationCriteriaRows.querySelector("[data-evaluation-criterion]")) addEvaluationCriterionRow();
  refreshEvaluationWeightTotal();
  scheduleExistingGroupEvaluationSave({ immediate: true });
});

useEvaluationTemplateBtn.addEventListener("click", openEvaluationTemplateDialog);
closeEvaluationTemplateDialogBtn.addEventListener("click", () => evaluationTemplateDialog.close());

evaluationTemplateList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-template-id]");
  if (!row) return;
  selectedTemplateId = String(row.dataset.templateId || "");
  renderEvaluationTemplateList();
});

useSelectedEvaluationTemplateBtn.addEventListener("click", () => {
  const template = mergedTemplateCache()?.[selectedTemplateId];
  if (!template) return;
  applyEvaluationTemplate(template);
  evaluationTemplateDialog.close();
  scheduleExistingGroupEvaluationSave({ immediate: true });
});


groupsTableBody.addEventListener("click", (event) => {
  const groupButton = event.target.closest("[data-popup-group]");
  if (!groupButton) return;
  markPopupGroup(String(groupButton.dataset.popupGroup || ""));
});

groupsTableBody.addEventListener("dblclick", (event) => {
  const groupButton = event.target.closest("[data-popup-group]");
  const groupRow = event.target.closest("[data-popup-group-row]");
  const groupName = String(
    groupButton?.dataset.popupGroup ||
    groupRow?.dataset.popupGroupRow ||
    ""
  );
  if (!groupName) return;
  markPopupGroup(groupName);
  selectManagedGroup(groupName);
});

openGroupsDialogBtn.addEventListener("click", () => {
  popupSelectedGroup = "";
  renderGroupsTable();
  groupsDialog.showModal();
});
closeGroupsDialogBtn.addEventListener("click", () => {
  popupSelectedGroup = "";
  groupsDialog.close();
});

selectPopupGroupBtn.addEventListener("click", () => {
  if (!popupSelectedGroup) return;
  selectManagedGroup(popupSelectedGroup);
});

openCreateGroupDialogBtn.addEventListener("click", () => {
  popupSelectedGroup = "";
  if (groupsDialog.open) groupsDialog.close();
  prepareCreateGroupDialog();
});
openGroupEvaluationDialogBtn.addEventListener("click", () => {
  if (!popupSelectedGroup) return;
  if (groupsDialog.open) groupsDialog.close();
  openSelectedGroupEvaluationDialog();
});

deleteSelectedGroupBtn.addEventListener("click", openDeleteGroupDialog);
closeDeleteGroupDialogBtn.addEventListener("click", () => {
  deletionTargetGroup = "";
  deleteGroupDialog.close();
});
cancelDeleteGroupBtn.addEventListener("click", () => {
  deletionTargetGroup = "";
  deleteGroupDialog.close();
});
confirmDeleteGroupBtn.addEventListener("click", async () => {
  if (!deletionTargetGroup) return;
  await deleteGroupWithBackup(deletionTargetGroup);
});
deleteGroupConfirmInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" || !deletionTargetGroup) return;
  event.preventDefault();
  await deleteGroupWithBackup(deletionTargetGroup);
});


pendingRequestsList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-selection-key]");
  if (!row) return;
  const checkbox = row.querySelector(".pending-request-checkbox");
  if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
  const key = String(row.dataset.selectionKey || "");
  if (checkbox.checked) selectedRosterItems.add(key);
  else selectedRosterItems.delete(key);
  persistManagementState();
  renderManagedStudents();
});

managedStudentsTableBody.addEventListener("dblclick", (event) => {
  const row = event.target.closest('[data-roster-kind="student"]');
  if (!row) return;
  openStudentRecord(String(row.dataset.rosterId || ""));
});

selectAllStudents.addEventListener("change", () => {
  const rows = [...pendingRequestsList.querySelectorAll("[data-selection-key]")];
  rows.forEach((row) => {
    const key = String(row.dataset.selectionKey || "");
    if (selectAllStudents.checked) selectedRosterItems.add(key);
    else selectedRosterItems.delete(key);
  });
  persistManagementState();
  renderManagedStudents();
});

managedStudentSearchToggle.addEventListener("click", () => {
  const opening = managedStudentSearchPanel.hidden;
  managedStudentSearchPanel.hidden = !opening;
  managedStudentSearchToggle.setAttribute("aria-expanded", String(opening));
  if (opening) managedStudentSearch.focus();
});

managedStudentSearch.addEventListener("input", renderManagedStudents);

takeAttendanceBtn.addEventListener("click", takeAttendanceForGreenStudents);

activeEvaluationBlockBtn.addEventListener("click", openActiveEvaluationBlockDialog);
closeActiveEvaluationBlockDialogBtn.addEventListener("click", () => activeEvaluationBlockDialog.close());
cancelActiveEvaluationBlockBtn.addEventListener("click", () => activeEvaluationBlockDialog.close());
saveActiveEvaluationBlockBtn.addEventListener("click", saveActiveEvaluationBlock);

openManagedBlockReportBtn.addEventListener("click", () => {
  const group = selectedManagedGroup || "";
  const query = group ? `?group=${encodeURIComponent(group)}` : "";
  window.location.href = `teacher-block-report.html${query}`;
});

copyEnrollmentLinkBtn.addEventListener("click", copyEnrollmentLink);

createEnrollmentLinkBtn.addEventListener("click", async () => {
  const activeLink = selectedManagedGroup ? enrollmentUrl(selectedManagedGroup) : "";
  if (activeLink) {
    enrollmentLinkExpanded = !enrollmentLinkExpanded;
    persistManagementState();
    renderEnrollmentLink();
    return;
  }

  await createOrRotateEnrollmentLink();
  enrollmentLinkExpanded = true;
  persistManagementState();
  renderEnrollmentLink();
});

rotateEnrollmentLinkBtn.addEventListener("click", async () => {
  await createOrRotateEnrollmentLink({ rotate: true });
  enrollmentLinkExpanded = true;
  persistManagementState();
  renderEnrollmentLink();
});

managedStudentDisplayModeBtn.addEventListener("click", async () => {
  const groupName = selectedManagedGroup;
  if (!groupName || !groupsCache[groupName]) return;

  const current = managedDisplayMode(groupName);
  const index = MANAGED_DISPLAY_MODES.indexOf(current);
  const next = MANAGED_DISPLAY_MODES[(index + 1) % MANAGED_DISPLAY_MODES.length];

  groupsCache[groupName] = {
    ...groupsCache[groupName],
    studentListDisplayMode: next
  };
  renderManagedStudents();

  await update(ref(db, `groups/${groupName}`), {
    studentListDisplayMode: next,
    studentListDisplayUpdatedAt: Date.now(),
    studentListDisplayUpdatedBy: getTeacherName()
  });
});

approveEnrollmentBtn.addEventListener("click", approveSelectedRequests);
denyEnrollmentBtn.addEventListener("click", denySelectedRequests);

openAddStudentModalBtn.addEventListener("click", openAddStudentDialog);
closeAddStudentDialogBtn.addEventListener("click", () => addStudentDialog.close());
manualStudentTabBtn.addEventListener("click", () => setModalPane("manual"));
csvStudentTabBtn.addEventListener("click", () => setModalPane("csv"));
pasteStudentTabBtn.addEventListener("click", () => setModalPane("paste"));
existingStudentTabBtn.addEventListener("click", () => setModalPane("existing"));
existingStudentSearch.addEventListener("input", renderExistingStudents);
existingStudentGroupFilter.addEventListener("change", renderExistingStudents);
existingStudentsList.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".existing-student-checkbox");
  if (!checkbox) return;
  const studentKey = String(checkbox.dataset.existingStudentKey || "");
  if (!studentKey) return;
  if (checkbox.checked) selectedExistingStudentKeys.add(studentKey);
  else selectedExistingStudentKeys.delete(studentKey);
  syncExistingStudentsMasterCheckbox();
});
existingStudentsMasterCheckbox.addEventListener("change", () => {
  const entries = existingStudentCandidates();
  entries.forEach(([studentKey]) => {
    if (existingStudentsMasterCheckbox.checked) selectedExistingStudentKeys.add(studentKey);
    else selectedExistingStudentKeys.delete(studentKey);
  });
  renderExistingStudents();
});
enrollExistingStudentsBtn.addEventListener("click", enrollSelectedExistingStudents);

createStudentBtn.addEventListener("click", async () => {
  const fullName = studentNameInput.value.trim();
  if (!selectedManagedGroup) return;

  if (!fullName) {
    addStudentStatus.textContent = "Enter the student's full name.";
    return;
  }

  await saveStudent(
    fullName,
    studentNicknameInput.value.trim(),
    studentNumberManualInput.value.trim(),
    selectedManagedGroup,
    { enrollmentSource: "teacher-manual" }
  );

  studentNameInput.value = "";
  studentNicknameInput.value = "";
  studentNumberManualInput.value = "";
  addStudentStatus.textContent = "Student added.";
});

importCsvBtn.addEventListener("click", async () => {
  const file = csvFileInput.files[0];

  if (!selectedManagedGroup || !file) {
    addStudentStatus.textContent = "Choose a CSV file first.";
    return;
  }

  const students = parseCsv(await file.text());
  for (const student of students) {
    await saveStudent(
      student.fullName,
      student.nickname,
      student.studentNumber,
      selectedManagedGroup,
      { enrollmentSource: "teacher-csv" }
    );
  }

  csvFileInput.value = "";
  addStudentStatus.textContent = `${students.length} student(s) imported.`;
});

importTextBtn.addEventListener("click", async () => {
  if (!selectedManagedGroup) return;

  const students = parseBulkText(bulkTextInput.value);
  if (!students.length) {
    addStudentStatus.textContent = "Paste at least one valid student.";
    return;
  }

  for (const student of students) {
    await saveStudent(
      student.fullName,
      student.nickname,
      student.studentNumber,
      selectedManagedGroup,
      { enrollmentSource: "teacher-paste" }
    );
  }

  bulkTextInput.value = "";
  addStudentStatus.textContent = `${students.length} student(s) imported.`;
});

setCriteriaEditor([]);
renderEvaluationEditorVisibility();
renderManagedStudents();
renderGroupsTable();

(async () => {
  try {
    await migrateExistingStudentsForTeacher();
  } catch (error) {
    console.error("Migration failed:", error);
  }
})();


function normalizedGroupName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

async function clearRequestedGroupEvaluationOnce() {
  if (requestedCriteriaResetChecked || requestedCriteriaResetInProgress) return false;

  const entry = Object.entries(groupsCache || {}).find(([groupName]) =>
    normalizedGroupName(groupName) === REQUESTED_CRITERIA_RESET_GROUP
  );

  if (!entry) {
    requestedCriteriaResetChecked = true;
    return false;
  }

  const [groupName, group] = entry;
  if (group?.maintenance?.[REQUESTED_CRITERIA_RESET_MARKER]) {
    requestedCriteriaResetChecked = true;
    return false;
  }

  requestedCriteriaResetInProgress = true;
  try {
    const now = Date.now();
    const marker = {
      completedAt: now,
      completedBy: getTeacherName(),
      reason: "Requested one-time reset before recreating reusable evaluation criteria"
    };

    await update(ref(db, `groups/${groupName}`), {
      evaluationCriteria: null,
      evaluationWeights: null,
      evaluationConfiguredAt: null,
      evaluationConfiguredBy: null,
      [`maintenance/${REQUESTED_CRITERIA_RESET_MARKER}`]: marker
    });

    groupsCache[groupName] = {
      ...group,
      evaluationCriteria: null,
      evaluationWeights: null,
      evaluationConfiguredAt: null,
      evaluationConfiguredBy: null,
      maintenance: {
        ...(group?.maintenance || {}),
        [REQUESTED_CRITERIA_RESET_MARKER]: marker
      }
    };

    if (!creatingGroup && selectedManagedGroup === groupName) {
      loadGroupEditor(groupName, { preserveView: true });
    }

    requestedCriteriaResetChecked = true;
    return true;
  } finally {
    requestedCriteriaResetInProgress = false;
  }
}

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  renderActiveEvaluationBlockControl();
});

onValue(ref(db, "groups"), async (snapshot) => {
  groupsCache = visibleGroups(snapshot.val() || {});
  groupsLoaded = true;

  const resetPerformed = await clearRequestedGroupEvaluationOnce();
  renderGroupsTable();
  if (resetPerformed) {
    renderManagedStudents();
    renderEvaluationTemplateList();
    return;
  }

  if (selectedManagedGroup && !groupsCache[selectedManagedGroup]) {
    resetGroupForm();
  } else if (selectedManagedGroup) {
    if (
      !creatingGroup &&
      !groupEditorDialog.open &&
      editingGroupName !== selectedManagedGroup
    ) {
      editingGroupName = selectedManagedGroup;
      loadGroupEditor(selectedManagedGroup, { preserveView: true });
    }
    persistManagementState();
    renderManagedStudents();
    renderEnrollmentLink();
  }

  maybeHandleRequestedGroupAction();

  harvestConfiguredGroupsToTemplates().catch(console.error);
});

onValue(ref(db, TEMPLATE_LIBRARY_PATH), (snapshot) => {
  evaluationTemplatesCache = snapshot.val() || {};
  templatesLoaded = true;
  renderEvaluationTemplateList();
  harvestConfiguredGroupsToTemplates().catch(console.error);
});

onValue(ref(db, "groupEvaluationTemplates"), (snapshot) => {
  legacyEvaluationTemplatesCache = snapshot.val() || {};
  renderEvaluationTemplateList();

  // Migrate any readable legacy templates into the canonical library.
  Object.values(legacyEvaluationTemplatesCache).forEach((template) => {
    const criteria = normalizeEvaluationCriteria(template?.evaluationCriteria || []);
    if (!criteria.length || Math.abs(evaluationWeightTotal(criteria) - 100) >= 0.01) return;
    ensureIndependentTemplate({
      evaluationCriteria: criteria,
      refreshDefaults: false
    }).catch(console.error);
  });
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  if (editingGroupName) applyEvaluationUnitFloor(editingGroupName);
  renderGroupsTable();
  renderManagedStudents();
  if (existingStudentPane && !existingStudentPane.hidden) renderExistingStudents();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  if (editingGroupName) applyEvaluationUnitFloor(editingGroupName);
  renderManagedStudents();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  assignmentSubmissionsCache = snapshot.val() || {};
  if (editingGroupName) applyEvaluationUnitFloor(editingGroupName);
  renderManagedStudents();
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  if (editingGroupName) applyEvaluationUnitFloor(editingGroupName);
});

onValue(ref(db, "groupEnrollmentRequests"), (snapshot) => {
  enrollmentRequestsCache = snapshot.val() || {};
  renderGroupsTable();
  renderManagedStudents();
});
