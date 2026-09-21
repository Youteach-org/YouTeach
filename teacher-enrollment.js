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
import {
  EVALUATION_SOURCE_OPTIONS,
  criteriaToFirebaseObject,
  evaluationBlockNames,
  groupEvaluationConfig,
  evaluationWeightTotal,
  normalizeEvaluationCriteria,
  normalizeEvaluationUnitCount
} from "./group-evaluation-model.js";

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupEditorTitle = document.getElementById("groupEditorTitle");
const groupEditorSubtitle = document.getElementById("groupEditorSubtitle");
const groupNameInput = document.getElementById("groupNameInput");
const evaluationEditor = document.getElementById("evaluationEditor");
const toggleEvaluationBtn = document.getElementById("toggleEvaluationBtn");
const cancelGroupEditBtn = document.getElementById("cancelGroupEditBtn");
const evaluationUnitCountInput = document.getElementById("evaluationUnitCountInput");
const useEvaluationTemplateBtn = document.getElementById("useEvaluationTemplateBtn");
const saveEvaluationTemplateBtn = document.getElementById("saveEvaluationTemplateBtn");
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
const rosterBody = document.getElementById("rosterBody");
const toggleRosterBtn = document.getElementById("toggleRosterBtn");
const managedGroupStatus = document.getElementById("managedGroupStatus");
const managedGroupName = document.getElementById("managedGroupName");
const pendingEnrollmentCount = document.getElementById("pendingEnrollmentCount");
const createEnrollmentLinkBtn = document.getElementById("createEnrollmentLinkBtn");
const copyEnrollmentLinkBtn = document.getElementById("copyEnrollmentLinkBtn");
const rotateEnrollmentLinkBtn = document.getElementById("rotateEnrollmentLinkBtn");
const enrollmentLinkBox = document.getElementById("enrollmentLinkBox");
const enrollmentLinkInput = document.getElementById("enrollmentLinkInput");
const enrollmentLinkStatus = document.getElementById("enrollmentLinkStatus");
const openAddStudentModalBtn = document.getElementById("openAddStudentModalBtn");
const selectAllStudents = document.getElementById("selectAllStudents");
const selectedStudentCount = document.getElementById("selectedStudentCount");
const selectedRosterActions = document.getElementById("selectedRosterActions");
const selectedRosterLabel = document.getElementById("selectedRosterLabel");
const openSelectedStudentBtn = document.getElementById("openSelectedStudentBtn");
const externalIdEditor = document.getElementById("externalIdEditor");
const selectedExternalIdInput = document.getElementById("selectedExternalIdInput");
const saveExternalIdBtn = document.getElementById("saveExternalIdBtn");
const approveEnrollmentBtn = document.getElementById("approveEnrollmentBtn");
const denyEnrollmentBtn = document.getElementById("denyEnrollmentBtn");
const expelStudentBtn = document.getElementById("expelStudentBtn");
const managedStudentsList = document.getElementById("managedStudentsList");

const groupsTableBody = document.getElementById("groupsTableBody");
const selectedGroupActions = document.getElementById("selectedGroupActions");
const selectedGroupActionLabel = document.getElementById("selectedGroupActionLabel");
const deleteSelectedGroupBtn = document.getElementById("deleteSelectedGroupBtn");

const addStudentDialog = document.getElementById("addStudentDialog");
const addStudentGroupLabel = document.getElementById("addStudentGroupLabel");
const closeAddStudentDialogBtn = document.getElementById("closeAddStudentDialogBtn");
const manualStudentTabBtn = document.getElementById("manualStudentTabBtn");
const csvStudentTabBtn = document.getElementById("csvStudentTabBtn");
const pasteStudentTabBtn = document.getElementById("pasteStudentTabBtn");
const manualStudentPane = document.getElementById("manualStudentPane");
const csvStudentPane = document.getElementById("csvStudentPane");
const pasteStudentPane = document.getElementById("pasteStudentPane");
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

let groupsCache = {};
let studentsCache = {};
let enrollmentRequestsCache = {};
let evaluationTemplatesCache = {};
let selectedManagedGroup = "";
let editingGroupName = "";
let pendingReportSettings = null;
let evaluationEditorOpen = true;
let rosterCollapsed = true;
let selectedTemplateId = "";
let groupsLoaded = false;
let templatesLoaded = false;
let harvestingTemplates = false;
const selectedRosterItems = new Set();

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

function sourceOptionsHtml(selected = "manual") {
  return EVALUATION_SOURCE_OPTIONS.map((option) =>
    `<option value="${escapeHtml(option.key)}" ${option.key === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`
  ).join("");
}

function criterionRowHtml(criterion = {}) {
  const id = String(criterion.id || makeCriterionId());
  return `
    <div class="criterion-row" data-evaluation-criterion data-criterion-id="${escapeHtml(id)}">
      <input data-criterion-name value="${escapeHtml(criterion.name || "")}" placeholder="Criterion name">
      <input data-criterion-short-label value="${escapeHtml(criterion.shortLabel || "")}" placeholder="Abbr." aria-label="Abbreviation" title="Abbreviation used in reports">
      <input data-criterion-weight type="number" min="0" max="100" step="0.1"
        value="${Number(criterion.weight || 0) || ""}" placeholder="%">
      <select data-criterion-source>${sourceOptionsHtml(criterion.source || "manual")}</select>
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
      source: String(row.querySelector("[data-criterion-source]")?.value || "manual"),
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
  evaluationEditor.hidden = Boolean(editingGroupName && !evaluationEditorOpen);
  toggleEvaluationBtn.hidden = !editingGroupName;

  if (!editingGroupName) {
    evaluationEditorOpen = true;
    evaluationEditor.hidden = false;
    return;
  }

  const config = groupEvaluationConfig(groupsCache?.[editingGroupName] || {});
  toggleEvaluationBtn.textContent = evaluationEditorOpen
    ? "Hide Evaluation"
    : (config.configured ? "Edit Evaluation" : "Set Evaluation");
}

function reusableReportSettings(value) {
  if (!value || typeof value !== "object") return null;
  const result = {
    title: String(value.title || "").trim(),
    organization: String(value.organization || "").trim(),
    department: String(value.department || "").trim(),
    period: String(value.period || "").trim(),
    courseProgram: String(value.courseProgram || "").trim(),
    parallels: String(value.parallels || "").trim(),
    includeSignature: value.includeSignature !== false
  };
  return Object.values(result).some((item) => item !== "" && item !== true) ? result : null;
}

function templateComparable({ evaluationUnitCount, evaluationCriteria, reportSettings }) {
  const criteria = normalizeEvaluationCriteria(evaluationCriteria || []).map((criterion) => ({
    name: String(criterion.name || "").trim(),
    shortLabel: String(criterion.shortLabel || "").trim(),
    weight: Number(criterion.weight || 0),
    source: String(criterion.source || "manual"),
    order: Number(criterion.order || 0)
  }));

  return {
    evaluationUnitCount: normalizeEvaluationUnitCount(evaluationUnitCount, 3),
    criteria,
    reportSettings: reusableReportSettings(reportSettings)
  };
}

function templateSignature(value) {
  return JSON.stringify(templateComparable(value));
}

function automaticTemplateName(criteria = []) {
  const text = normalizeEvaluationCriteria(criteria)
    .map((criterion) => `${criterion.name} ${criterion.weight}%`)
    .join(" · ");
  return (text || "Evaluation setup").slice(0, 140);
}

function equivalentTemplateId(setup) {
  const signature = templateSignature(setup);
  return Object.entries(evaluationTemplatesCache || {}).find(([, template]) =>
    String(template?.signature || templateSignature(template)) === signature
  )?.[0] || "";
}

async function ensureIndependentTemplate({
  evaluationUnitCount,
  evaluationCriteria,
  reportSettings = null,
  name = "",
  renameExisting = false
}) {
  const criteria = normalizeEvaluationCriteria(evaluationCriteria || []);
  if (!criteria.length || Math.abs(evaluationWeightTotal(criteria) - 100) >= 0.01) return "";

  const setup = {
    evaluationUnitCount: normalizeEvaluationUnitCount(evaluationUnitCount, 3),
    evaluationCriteria: criteria,
    reportSettings: reusableReportSettings(reportSettings)
  };
  const signature = templateSignature(setup);
  const existingId = equivalentTemplateId(setup);

  if (existingId) {
    if (renameExisting && name && evaluationTemplatesCache?.[existingId]?.name !== name) {
      await update(ref(db, `groupEvaluationTemplates/${existingId}`), {
        name,
        signature,
        updatedAt: Date.now()
      });
      evaluationTemplatesCache[existingId] = {
        ...evaluationTemplatesCache[existingId],
        name,
        signature,
        updatedAt: Date.now()
      };
    }
    return existingId;
  }

  const target = push(ref(db, "groupEvaluationTemplates"));
  const now = Date.now();
  const record = {
    name: name || automaticTemplateName(criteria),
    evaluationUnitCount: setup.evaluationUnitCount,
    evaluationCriteria: criteriaToFirebaseObject(criteria),
    reportSettings: setup.reportSettings,
    signature,
    createdAt: now,
    updatedAt: now,
    createdBy: getTeacherName()
  };

  await set(target, record);
  evaluationTemplatesCache[target.key] = record;
  return target.key;
}

async function harvestConfiguredGroupsToTemplates() {
  if (!groupsLoaded || !templatesLoaded || harvestingTemplates) return;
  harvestingTemplates = true;

  try {
    for (const group of Object.values(groupsCache || {})) {
      const config = groupEvaluationConfig(group);
      if (!config.configured) continue;

      await ensureIndependentTemplate({
        evaluationUnitCount: config.unitCount,
        evaluationCriteria: config.criteria,
        reportSettings: group.reportSettings || null
      });
    }
    renderEvaluationTemplateList();
  } finally {
    harvestingTemplates = false;
  }
}

function renderEvaluationTemplateList() {
  const entries = Object.entries(evaluationTemplatesCache || {})
    .filter(([, template]) => groupEvaluationConfig(template).configured)
    .sort((a, b) =>
      Number(b[1]?.updatedAt || b[1]?.createdAt || 0) - Number(a[1]?.updatedAt || a[1]?.createdAt || 0) ||
      String(a[1]?.name || "").localeCompare(String(b[1]?.name || ""))
    );

  if (!entries.length) {
    selectedTemplateId = "";
    evaluationTemplateList.innerHTML =
      '<div class="student-list-empty">No reusable evaluation templates yet.</div>';
    useSelectedEvaluationTemplateBtn.disabled = true;
    return;
  }

  if (!entries.some(([id]) => id === selectedTemplateId)) selectedTemplateId = "";

  evaluationTemplateList.innerHTML = entries.map(([id, template]) => {
    const config = groupEvaluationConfig(template);
    const summary = config.criteria
      .map((criterion) => `${criterion.name} ${criterion.weight}%`)
      .join(" · ");

    return `
      <div class="template-row ${id === selectedTemplateId ? "selected" : ""}"
        data-template-id="${escapeHtml(id)}">
        <input type="radio" name="evaluation-template-choice" value="${escapeHtml(id)}"
          ${id === selectedTemplateId ? "checked" : ""} aria-label="Select template">
        <div>
          <div class="template-name">${escapeHtml(template.name || automaticTemplateName(config.criteria))}</div>
          <div class="template-meta">${config.unitCount} block(s) · ${escapeHtml(summary)}</div>
        </div>
      </div>
    `;
  }).join("");

  useSelectedEvaluationTemplateBtn.disabled = !selectedTemplateId;
}

function openEvaluationTemplateDialog() {
  selectedTemplateId = "";
  renderEvaluationTemplateList();
  evaluationTemplateDialog.showModal();
}

function applyEvaluationTemplate(template) {
  if (!template) return;
  const config = groupEvaluationConfig(template);
  evaluationUnitCountInput.value = String(config.unitCount);
  setCriteriaEditor(config.criteria);
  pendingReportSettings = template.reportSettings && typeof template.reportSettings === "object"
    ? { ...template.reportSettings }
    : null;
  evaluationEditorOpen = true;
  renderEvaluationEditorVisibility();
  groupEvaluationStatus.textContent = `Loaded template: ${template.name || "Evaluation setup"}.`;
  groupEvaluationStatus.className = "status-text ok";
}

async function saveCurrentEvaluationAsTemplate() {
  const criteria = criteriaFromForm();
  const total = evaluationWeightTotal(criteria);

  if (!criteria.length || Math.abs(total - 100) >= 0.01) {
    groupEvaluationStatus.textContent = "Complete criteria totaling 100% before saving a template.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  const suggested = automaticTemplateName(criteria);
  const name = String(prompt("Template name:", suggested) || "").trim();
  if (!name) return;

  const id = await ensureIndependentTemplate({
    evaluationUnitCount: normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3),
    evaluationCriteria: criteria,
    reportSettings: editingGroupName
      ? (groupsCache?.[editingGroupName]?.reportSettings || pendingReportSettings)
      : pendingReportSettings,
    name,
    renameExisting: true
  });

  groupEvaluationStatus.textContent = id ? `Template ready: ${name}.` : "Template could not be saved.";
  groupEvaluationStatus.className = id ? "status-text ok" : "status-text bad";
}

function renderSelectedGroupActions() {
  const hasGroup = Boolean(selectedManagedGroup && groupsCache[selectedManagedGroup]);
  selectedGroupActions.hidden = !hasGroup;
  selectedGroupActionLabel.textContent = hasGroup ? `Selected: ${selectedManagedGroup}` : "";
}

function resetGroupForm() {
  editingGroupName = "";
  selectedManagedGroup = "";
  sessionStorage.removeItem(WORKING_GROUP_KEY);
  selectedRosterItems.clear();
  rosterCollapsed = true;

  groupEditorTitle.textContent = "Create Group";
  groupEditorSubtitle.textContent = "Create a new group and define its evaluation setup.";
  groupNameInput.disabled = false;
  groupNameInput.value = "";
  evaluationUnitCountInput.value = "3";
  pendingReportSettings = null;
  setCriteriaEditor([]);
  createGroupBtn.textContent = "Create Group";
  cancelGroupEditBtn.hidden = true;
  evaluationEditorOpen = true;
  groupEvaluationStatus.textContent = "";
  groupEvaluationStatus.className = "status-text";

  renderEvaluationEditorVisibility();
  renderManagedStudents();
  renderGroupsTable();
  renderSelectedGroupActions();
}

function loadGroupEditor(groupName) {
  const group = groupsCache[groupName];
  if (!group) return;

  const config = groupEvaluationConfig(group);
  editingGroupName = groupName;
  groupEditorTitle.textContent = `Manage Group: ${groupName}`;
  groupEditorSubtitle.textContent = "Group actions and evaluation settings appear here only for the selected group.";
  groupNameInput.value = groupName;
  groupNameInput.disabled = true;
  evaluationUnitCountInput.value = String(config.unitCount);
  pendingReportSettings = group.reportSettings && typeof group.reportSettings === "object"
    ? { ...group.reportSettings }
    : null;
  setCriteriaEditor(config.criteria);
  createGroupBtn.textContent = "Save Group Settings";
  cancelGroupEditBtn.hidden = false;
  evaluationEditorOpen = false;
  groupEvaluationStatus.textContent = config.configured
    ? "Group selected. Open Edit Evaluation only when you need to change the criteria."
    : "This group needs evaluation settings. Use Set Evaluation.";
  groupEvaluationStatus.className = config.configured ? "status-text" : "status-text bad";
  renderEvaluationEditorVisibility();
}

function selectManagedGroup(groupName) {
  const group = groupsCache[groupName];
  if (!group) return;

  if (selectedManagedGroup === groupName) {
    rosterCollapsed = !rosterCollapsed;
    renderManagedStudents();
    renderGroupsTable();
    return;
  }

  selectedManagedGroup = groupName;
  editingGroupName = groupName;
  sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  selectedRosterItems.clear();
  rosterCollapsed = false;

  loadGroupEditor(groupName);
  renderManagedStudents();
  renderGroupsTable();
  renderSelectedGroupActions();
}

function groupStudents(groupName) {
  return Object.entries(studentsCache || {})
    .filter(([, student]) => String(student?.groupName || "") === groupName)
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
  enrollmentLinkInput.value = link;
  enrollmentLinkBox.hidden = !link;
  copyEnrollmentLinkBtn.hidden = !link;
  createEnrollmentLinkBtn.textContent = link ? "Enrollment Link Active" : "Create Enrollment Link";
  createEnrollmentLinkBtn.disabled = Boolean(link);
  enrollmentLinkStatus.textContent = selectedManagedGroup && link
    ? "Enrollment requests require teacher approval."
    : "";
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

function renderRosterContextActions() {
  const requests = selectedRosterIds("request");
  const students = selectedRosterIds("student");
  const total = requests.length + students.length;

  selectedRosterActions.hidden = total === 0;
  selectedRosterLabel.textContent = total ? `${total} selected` : "";

  approveEnrollmentBtn.hidden = requests.length === 0;
  denyEnrollmentBtn.hidden = requests.length === 0;
  expelStudentBtn.hidden = students.length === 0;

  const singleStudent = total === 1 && students.length === 1 ? students[0] : "";
  openSelectedStudentBtn.hidden = !singleStudent;
  externalIdEditor.hidden = !singleStudent;

  if (singleStudent) {
    selectedExternalIdInput.value = String(studentsCache?.[singleStudent]?.studentNumber || "");
  } else {
    selectedExternalIdInput.value = "";
  }
}

function renderManagedStudents() {
  const groupName = selectedManagedGroup;

  if (!groupName || !groupsCache[groupName]) {
    enrollmentControls.hidden = true;
    toggleRosterBtn.hidden = true;
    managedGroupStatus.textContent = "Select a group from the Groups list below.";
    pendingEnrollmentCount.textContent = "";
    managedStudentsList.innerHTML = "";
    selectedRosterActions.hidden = true;
    return;
  }

  enrollmentControls.hidden = false;
  toggleRosterBtn.hidden = false;
  toggleRosterBtn.textContent = rosterCollapsed ? "▸" : "▾";
  toggleRosterBtn.setAttribute("aria-expanded", String(!rosterCollapsed));
  rosterBody.hidden = rosterCollapsed;

  managedGroupName.textContent = groupName;
  managedGroupStatus.textContent = rosterCollapsed
    ? `${groupStudents(groupName).length} enrolled · click the group or arrow to expand`
    : "Select a row to show the actions for that student or request.";

  const pending = groupPendingRequests(groupName);
  const enrolled = groupStudents(groupName);
  pendingEnrollmentCount.textContent = pending.length ? `${pending.length} pending` : "";

  const visibleKeys = new Set([
    ...pending.map(([id]) => rosterSelectionKey("request", id)),
    ...enrolled.map(([id]) => rosterSelectionKey("student", id))
  ]);

  [...selectedRosterItems].forEach((key) => {
    if (!visibleKeys.has(key)) selectedRosterItems.delete(key);
  });

  const pendingHtml = pending.map(([requestId, request]) => {
    const key = rosterSelectionKey("request", requestId);
    return `
      <div class="student-row pending student-grid ${selectedRosterItems.has(key) ? "selected" : ""}"
        data-roster-kind="request" data-roster-id="${escapeHtml(requestId)}" data-selection-key="${escapeHtml(key)}">
        <input class="roster-checkbox" type="checkbox" ${selectedRosterItems.has(key) ? "checked" : ""} aria-label="Select pending request">
        <span class="student-status pending">PENDING</span>
        <span class="student-cell student-name">${escapeHtml(request.fullName || request.name || "Pending student")}</span>
        <span class="student-cell">${escapeHtml(request.nickname || "—")}</span>
        <span class="student-cell">${escapeHtml(request.externalId || request.studentNumber || "—")}</span>
      </div>
    `;
  }).join("");

  const enrolledHtml = enrolled.map(([studentKey, student]) => {
    const key = rosterSelectionKey("student", studentKey);
    return `
      <div class="student-row enrolled student-grid ${selectedRosterItems.has(key) ? "selected" : ""}"
        data-roster-kind="student" data-roster-id="${escapeHtml(studentKey)}" data-selection-key="${escapeHtml(key)}">
        <input class="roster-checkbox" type="checkbox" ${selectedRosterItems.has(key) ? "checked" : ""} aria-label="Select enrolled student">
        <span class="student-status enrolled">ENROLLED</span>
        <span class="student-cell student-name">${escapeHtml(student.fullName || student.name || student.nickname || "Student")}</span>
        <span class="student-cell">${escapeHtml(student.nickname || "—")}</span>
        <span class="student-cell">${escapeHtml(student.studentNumber || "—")}</span>
      </div>
    `;
  }).join("");

  managedStudentsList.innerHTML = pendingHtml + enrolledHtml ||
    '<div class="student-list-empty">No enrolled students or pending requests yet.</div>';

  const visibleCheckboxes = [...managedStudentsList.querySelectorAll(".roster-checkbox")];
  selectAllStudents.checked =
    visibleCheckboxes.length > 0 && visibleCheckboxes.every((checkbox) => checkbox.checked);
  selectAllStudents.indeterminate =
    visibleCheckboxes.some((checkbox) => checkbox.checked) && !selectAllStudents.checked;
  selectedStudentCount.textContent = `${selectedRosterItems.size} selected`;

  renderRosterContextActions();
  renderEnrollmentLink();
  renderSelectedGroupActions();
}

function renderGroupsTable() {
  const groups = Object.keys(groupsCache || {})
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  if (!groups.length) {
    groupsTableBody.innerHTML = '<tr><td colspan="5">No groups yet.</td></tr>';
    renderSelectedGroupActions();
    return;
  }

  groupsTableBody.innerHTML = groups.map((groupName) => {
    const group = groupsCache[groupName] || {};
    const count = groupStudents(groupName).length;
    const pending = groupPendingRequests(groupName).length;
    const config = groupEvaluationConfig(group);
    const selected = groupName === selectedManagedGroup;
    const chevron = selected && !rosterCollapsed ? "▾" : "▸";
    const evaluationSummary = config.configured
      ? config.criteria.map((criterion) =>
          `${escapeHtml(criterion.name)} ${criterion.weight}%`
        ).join(" · ")
      : '<span class="setup-required">Evaluation setup required</span>';

    return `
      <tr class="${selected ? "selected-group-row" : ""}">
        <td>
          <button class="group-select-button" type="button" data-manage-group="${escapeHtml(groupName)}"
            aria-expanded="${selected ? String(!rosterCollapsed) : "false"}">
            <span class="group-chevron">${chevron}</span>
            <span>${escapeHtml(groupName)}</span>
          </button>
        </td>
        <td>${count}</td>
        <td>${pending}</td>
        <td>${config.configured ? config.unitCount : "—"}</td>
        <td class="group-evaluation-summary">${evaluationSummary}</td>
      </tr>
    `;
  }).join("");

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

function setModalPane(active) {
  const panes = {
    manual: [manualStudentTabBtn, manualStudentPane],
    csv: [csvStudentTabBtn, csvStudentPane],
    paste: [pasteStudentTabBtn, pasteStudentPane]
  };

  Object.entries(panes).forEach(([key, [button, pane]]) => {
    const isActive = key === active;
    button.classList.toggle("active", isActive);
    pane.hidden = !isActive;
  });
}

function openAddStudentDialog() {
  if (!selectedManagedGroup) return;
  addStudentGroupLabel.textContent = `Group: ${selectedManagedGroup}`;
  addStudentStatus.textContent = "";
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

  enrollmentLinkStatus.textContent = rotate ? "Enrollment link rotated." : "Enrollment link created.";
}

async function copyEnrollmentLink() {
  const value = enrollmentLinkInput.value;
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    enrollmentLinkStatus.textContent = "Enrollment link copied.";
  } catch (_) {
    enrollmentLinkInput.focus();
    enrollmentLinkInput.select();
    document.execCommand("copy");
    enrollmentLinkStatus.textContent = "Enrollment link copied.";
  }
}

function openStudentRecord(studentKey) {
  if (!studentKey) return;
  sessionStorage.setItem("teacherViewStudentKey", studentKey);
  window.location.href = `student-summary.html?teacherViewStudentKey=${encodeURIComponent(studentKey)}`;
}

async function saveSelectedExternalId() {
  const students = selectedRosterIds("student");
  const requests = selectedRosterIds("request");
  if (students.length !== 1 || requests.length) return;

  const studentKey = students[0];
  await update(ref(db, `students/${studentKey}`), {
    studentNumber: String(selectedExternalIdInput.value || "").trim()
  });
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
}

async function expelSelectedStudents() {
  if (!selectedManagedGroup) return;
  const selectedStudents = selectedRosterIds("student");

  if (!selectedStudents.length) {
    alert("Select at least one enrolled student.");
    return;
  }

  if (!confirm(`Expel ${selectedStudents.length} student(s) from ${selectedManagedGroup}? Their student record will be archived for recovery.`)) return;

  const updates = {};
  const now = Date.now();

  selectedStudents.forEach((studentKey) => {
    const student = studentsCache[studentKey];
    if (!student) return;
    updates[`groupFormerStudents/${selectedManagedGroup}/${studentKey}`] = {
      ...student,
      expelledAt: now,
      expelledBy: getTeacherName()
    };
    updates[`students/${studentKey}`] = null;
  });

  await update(ref(db), updates);
  selectedRosterItems.clear();
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
    String(student?.groupName || "") === groupName
  );
  const formerStudents = root?.groupFormerStudents?.[groupName] || {};
  const studentKeys = new Set([...Object.keys(students), ...Object.keys(formerStudents)]);
  const assignments = objectFilter(root?.assignments, ([, assignment]) =>
    String(assignment?.groupName || "") === groupName
  );
  const assignmentIds = new Set(Object.keys(assignments));

  const assignmentSubmissions = {};
  Object.entries(root?.assignmentSubmissions || {}).forEach(([assignmentId, byStudent]) => {
    const relevant = objectFilter(byStudent, ([studentKey]) => studentKeys.has(studentKey));
    if (assignmentIds.has(assignmentId)) {
      assignmentSubmissions[assignmentId] = byStudent || {};
    } else if (Object.keys(relevant).length) {
      assignmentSubmissions[assignmentId] = relevant;
    }
  });

  const attendance = {};
  Object.entries(root?.attendance || {}).forEach(([dateKey, byStudent]) => {
    const relevant = objectFilter(byStudent, ([studentKey, row]) =>
      studentKeys.has(studentKey) || String(row?.groupName || "") === groupName
    );
    if (Object.keys(relevant).length) attendance[dateKey] = relevant;
  });

  const pointsLog = objectFilter(root?.pointsLog, ([, entry]) =>
    String(entry?.groupName || "") === groupName ||
    studentKeys.has(String(entry?.studentKey || ""))
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

  const studentKeys = new Set([
    ...Object.keys(backup.students || {}),
    ...Object.keys(backup.formerStudents || {})
  ]);

  studentKeys.forEach((studentKey) => {
    updates[`students/${studentKey}`] = null;
  });

  Object.keys(backup.assignments || {}).forEach((assignmentId) => {
    updates[`assignments/${assignmentId}`] = null;
    updates[`assignmentSubmissions/${assignmentId}`] = null;
  });

  Object.entries(root?.assignmentSubmissions || {}).forEach(([assignmentId, byStudent]) => {
    if (backup.assignments?.[assignmentId]) return;
    Object.keys(byStudent || {}).forEach((studentKey) => {
      if (studentKeys.has(studentKey)) {
        updates[`assignmentSubmissions/${assignmentId}/${studentKey}`] = null;
      }
    });
  });

  Object.entries(root?.attendance || {}).forEach(([dateKey, byStudent]) => {
    Object.entries(byStudent || {}).forEach(([studentKey, row]) => {
      if (studentKeys.has(studentKey) || String(row?.groupName || "") === groupName) {
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

async function deleteGroupWithBackup(groupName) {
  const typed = String(prompt(
    `Deleting "${groupName}" will download a reconstruction backup and then remove the group and its live records.\n\nType the exact group name to confirm:`
  ) || "");

  if (typed !== groupName) {
    alert("Group name did not match. Nothing was deleted.");
    return;
  }

  const rootSnapshot = await get(ref(db));
  const root = rootSnapshot.val() || {};
  const backup = buildGroupBackup(root, groupName);
  const date = new Date().toISOString().slice(0, 10);
  triggerJsonDownload(`group-backup-${cleanFilePart(groupName)}-${date}.json`, backup);

  await update(ref(db), buildGroupDeletionUpdates(root, backup));

  if (selectedManagedGroup === groupName) resetGroupForm();
  alert(`Group "${groupName}" deleted after the backup download was started.`);
}

createGroupBtn.addEventListener("click", async () => {
  const groupName = groupNameInput.value.trim();

  if (!groupName) {
    groupEvaluationStatus.textContent = "Enter a group name.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  const evaluationUnitCount = normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3);
  const evaluationCriteria = criteriaFromForm();
  const total = evaluationWeightTotal(evaluationCriteria);

  if (!evaluationCriteria.length || evaluationCriteria.some((criterion) => !criterion.name)) {
    groupEvaluationStatus.textContent = "Add at least one named evaluation criterion.";
    groupEvaluationStatus.className = "status-text bad";
    evaluationEditorOpen = true;
    renderEvaluationEditorVisibility();
    return;
  }

  if (Math.abs(total - 100) >= 0.01) {
    groupEvaluationStatus.textContent = "Evaluation criteria must total exactly 100%.";
    groupEvaluationStatus.className = "status-text bad";
    evaluationEditorOpen = true;
    renderEvaluationEditorVisibility();
    refreshEvaluationWeightTotal();
    return;
  }

  if (!editingGroupName && groupsCache[groupName]) {
    groupEvaluationStatus.textContent = "That group already exists. Select it from the Groups list.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  const now = Date.now();
  const existing = groupsCache[groupName] || {};
  const savedGroupRecord = {
    ...existing,
    name: groupName,
    createdAt: Number(existing.createdAt || now),
    evaluationUnitCount,
    evaluationCriteria: criteriaToFirebaseObject(evaluationCriteria),
    ...(pendingReportSettings ? { reportSettings: pendingReportSettings } : {}),
    evaluationConfiguredAt: now,
    evaluationConfiguredBy: getTeacherName()
  };

  await update(ref(db, `groups/${groupName}`), {
    ...savedGroupRecord,
    evaluationWeights: null
  });

  groupsCache[groupName] = savedGroupRecord;

  await ensureIndependentTemplate({
    evaluationUnitCount,
    evaluationCriteria,
    reportSettings: savedGroupRecord.reportSettings || null
  });

  selectedManagedGroup = groupName;
  rosterCollapsed = false;
  loadGroupEditor(groupName);
  sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  renderManagedStudents();
  renderGroupsTable();
  renderSelectedGroupActions();

  groupEvaluationStatus.textContent = existing.createdAt ? "Group settings saved." : "Group created.";
  groupEvaluationStatus.className = "status-text ok";
});

toggleEvaluationBtn.addEventListener("click", () => {
  evaluationEditorOpen = !evaluationEditorOpen;
  renderEvaluationEditorVisibility();
});

cancelGroupEditBtn.addEventListener("click", resetGroupForm);
addEvaluationCriterionBtn.addEventListener("click", () => addEvaluationCriterionRow());

evaluationCriteriaRows.addEventListener("input", refreshEvaluationWeightTotal);
evaluationCriteriaRows.addEventListener("change", refreshEvaluationWeightTotal);
evaluationCriteriaRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-evaluation-criterion]");
  if (!button) return;
  button.closest("[data-evaluation-criterion]")?.remove();
  if (!evaluationCriteriaRows.querySelector("[data-evaluation-criterion]")) addEvaluationCriterionRow();
  refreshEvaluationWeightTotal();
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
  const template = evaluationTemplatesCache?.[selectedTemplateId];
  if (!template) return;
  applyEvaluationTemplate(template);
  evaluationTemplateDialog.close();
});

saveEvaluationTemplateBtn.addEventListener("click", saveCurrentEvaluationAsTemplate);

groupsTableBody.addEventListener("click", (event) => {
  const manageButton = event.target.closest("[data-manage-group]");
  if (!manageButton) return;
  selectManagedGroup(String(manageButton.dataset.manageGroup || ""));
});

deleteSelectedGroupBtn.addEventListener("click", async () => {
  if (!selectedManagedGroup) return;
  await deleteGroupWithBackup(selectedManagedGroup);
});

toggleRosterBtn.addEventListener("click", () => {
  if (!selectedManagedGroup) return;
  rosterCollapsed = !rosterCollapsed;
  renderManagedStudents();
  renderGroupsTable();
});

managedStudentsList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-selection-key]");
  if (!row) return;

  const checkbox = row.querySelector(".roster-checkbox");
  if (event.target !== checkbox) checkbox.checked = !checkbox.checked;

  const key = String(row.dataset.selectionKey || "");
  if (checkbox.checked) selectedRosterItems.add(key);
  else selectedRosterItems.delete(key);

  renderManagedStudents();
});

managedStudentsList.addEventListener("dblclick", (event) => {
  if (event.target.closest("input,button,select,textarea")) return;
  const row = event.target.closest('[data-roster-kind="student"]');
  if (!row) return;
  openStudentRecord(String(row.dataset.rosterId || ""));
});

selectAllStudents.addEventListener("change", () => {
  const rows = [...managedStudentsList.querySelectorAll("[data-selection-key]")];
  rows.forEach((row) => {
    const key = String(row.dataset.selectionKey || "");
    if (selectAllStudents.checked) selectedRosterItems.add(key);
    else selectedRosterItems.delete(key);
  });
  renderManagedStudents();
});

openSelectedStudentBtn.addEventListener("click", () => {
  const students = selectedRosterIds("student");
  const requests = selectedRosterIds("request");
  if (students.length === 1 && !requests.length) openStudentRecord(students[0]);
});

saveExternalIdBtn.addEventListener("click", saveSelectedExternalId);
createEnrollmentLinkBtn.addEventListener("click", () => createOrRotateEnrollmentLink());
rotateEnrollmentLinkBtn.addEventListener("click", () => createOrRotateEnrollmentLink({ rotate: true }));
copyEnrollmentLinkBtn.addEventListener("click", copyEnrollmentLink);
approveEnrollmentBtn.addEventListener("click", approveSelectedRequests);
denyEnrollmentBtn.addEventListener("click", denySelectedRequests);
expelStudentBtn.addEventListener("click", expelSelectedStudents);

openAddStudentModalBtn.addEventListener("click", openAddStudentDialog);
closeAddStudentDialogBtn.addEventListener("click", () => addStudentDialog.close());
manualStudentTabBtn.addEventListener("click", () => setModalPane("manual"));
csvStudentTabBtn.addEventListener("click", () => setModalPane("csv"));
pasteStudentTabBtn.addEventListener("click", () => setModalPane("paste"));

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

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  groupsLoaded = true;
  renderGroupsTable();

  if (selectedManagedGroup && !groupsCache[selectedManagedGroup]) {
    resetGroupForm();
  } else if (selectedManagedGroup) {
    renderManagedStudents();
    renderEnrollmentLink();
  }

  harvestConfiguredGroupsToTemplates().catch(console.error);
});

onValue(ref(db, "groupEvaluationTemplates"), (snapshot) => {
  evaluationTemplatesCache = snapshot.val() || {};
  templatesLoaded = true;
  renderEvaluationTemplateList();
  harvestConfiguredGroupsToTemplates().catch(console.error);
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderGroupsTable();
  renderManagedStudents();
});

onValue(ref(db, "groupEnrollmentRequests"), (snapshot) => {
  enrollmentRequestsCache = snapshot.val() || {};
  renderGroupsTable();
  renderManagedStudents();
});
