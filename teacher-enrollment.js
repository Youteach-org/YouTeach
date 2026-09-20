import { db } from "./firebase.js";
import { ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js?v=group-evaluation-20260920";
import {
  EVALUATION_SOURCE_OPTIONS,
  criteriaToFirebaseObject,
  groupEvaluationConfig,
  evaluationWeightTotal,
  normalizeEvaluationCriteria,
  normalizeEvaluationUnitCount
} from "./group-evaluation-model.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupNameInput = document.getElementById("groupNameInput");
const evaluationUnitCountInput = document.getElementById("evaluationUnitCountInput");
const evaluationTemplateSelect = document.getElementById("evaluationTemplateSelect");
const useEvaluationTemplateBtn = document.getElementById("useEvaluationTemplateBtn");
const saveEvaluationTemplateBtn = document.getElementById("saveEvaluationTemplateBtn");
const addEvaluationCriterionBtn = document.getElementById("addEvaluationCriterionBtn");
const evaluationCriteriaRows = document.getElementById("evaluationCriteriaRows");
const evaluationWeightTotalLabel = document.getElementById("evaluationWeightTotal");
const groupEvaluationStatus = document.getElementById("groupEvaluationStatus");
const createGroupBtn = document.getElementById("createGroupBtn");
const cancelGroupEditBtn = document.getElementById("cancelGroupEditBtn");
const deleteGroupSelect = document.getElementById("deleteGroupSelect");
const deleteGroupBtn = document.getElementById("deleteGroupBtn");

const studentNameInput = document.getElementById("studentName");
const studentNicknameInput = document.getElementById("studentNickname");
const studentNumberManualInput = document.getElementById("studentNumberManual");
const studentGroupSelect = document.getElementById("studentGroupSelect");
const createStudentBtn = document.getElementById("createStudent");

const csvGroupSelect = document.getElementById("csvGroupSelect");
const csvFileInput = document.getElementById("csvFile");
const importCsvBtn = document.getElementById("importCsv");

const textGroupSelect = document.getElementById("textGroupSelect");
const bulkTextInput = document.getElementById("bulkText");
const importTextBtn = document.getElementById("importText");

const groupsTableBody = document.getElementById("groupsTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let groupsCache = {};
let studentsCache = {};
let evaluationTemplatesCache = {};
let editingGroupName = "";


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeCriterionId() {
  return `criterion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

function renderEvaluationTemplateOptions() {
  const previous = evaluationTemplateSelect.value;
  const savedOptions = Object.entries(evaluationTemplatesCache || {})
    .filter(([, template]) => template && typeof template === "object")
    .sort((a, b) => String(a[1]?.name || "").localeCompare(String(b[1]?.name || "")))
    .map(([id, template]) =>
      `<option value="saved:${escapeHtml(id)}">${escapeHtml(template.name || "Evaluation template")}</option>`
    )
    .join("");

  evaluationTemplateSelect.innerHTML = `
    <option value="">Start with custom criteria</option>
    ${savedOptions}
  `;

  if ([...evaluationTemplateSelect.options].some((option) => option.value === previous)) {
    evaluationTemplateSelect.value = previous;
  }
}

function selectedEvaluationTemplate() {
  const value = String(evaluationTemplateSelect.value || "");
  if (value.startsWith("saved:")) {
    return evaluationTemplatesCache[value.slice(6)] || null;
  }
  return null;
}

function applyEvaluationTemplate(template) {
  if (!template) return;
  evaluationUnitCountInput.value = String(normalizeEvaluationUnitCount(template.evaluationUnitCount, 3));
  setCriteriaEditor(template.evaluationCriteria || []);
  groupEvaluationStatus.textContent = `Loaded template: ${template.name || "Evaluation template"}.`;
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

  const suggested = editingGroupName ? `${editingGroupName} evaluation` : "";
  const name = String(prompt("Template name:", suggested) || "").trim();
  if (!name) return;

  const target = push(ref(db, "groupEvaluationTemplates"));
  const now = Date.now();
  await set(target, {
    name,
    evaluationUnitCount: normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3),
    evaluationCriteria: criteriaToFirebaseObject(criteria),
    createdAt: now,
    updatedAt: now,
    createdBy: getTeacherName()
  });

  groupEvaluationStatus.textContent = `Template saved: ${name}.`;
  groupEvaluationStatus.className = "status-text ok";
}

function resetGroupForm() {
  editingGroupName = "";
  groupNameInput.disabled = false;
  groupNameInput.value = "";
  evaluationUnitCountInput.value = "3";
  evaluationTemplateSelect.value = "";
  setCriteriaEditor([]);
  createGroupBtn.textContent = "Create Group";
  cancelGroupEditBtn.hidden = true;
  groupEvaluationStatus.textContent = "";
  groupEvaluationStatus.className = "status-text";
  refreshEvaluationWeightTotal();
}

function beginGroupEvaluationEdit(groupName) {
  const group = groupsCache[groupName];
  if (!group) return;

  const config = groupEvaluationConfig(group);
  editingGroupName = groupName;
  groupNameInput.value = groupName;
  groupNameInput.disabled = true;
  evaluationUnitCountInput.value = String(config.unitCount);
  evaluationTemplateSelect.value = "";
  setCriteriaEditor(config.criteria);
  createGroupBtn.textContent = "Save Group Settings";
  cancelGroupEditBtn.hidden = false;
  groupEvaluationStatus.textContent = config.configured
    ? "Editing this group's evaluation criteria. You may remove old criteria and add new ones."
    : "This group still needs evaluation settings.";
  groupEvaluationStatus.className = config.configured ? "status-text" : "status-text bad";
  refreshEvaluationWeightTotal();
  groupNameInput.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderGroupSelectors() {
  const groups = Object.keys(groupsCache || {}).sort();
  const options = ['<option value="">Select group</option>']
    .concat(groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`))
    .join("");

  studentGroupSelect.innerHTML = options;
  csvGroupSelect.innerHTML = '<option value="">Select group for imported students</option>' + groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
  textGroupSelect.innerHTML = '<option value="">Select group for pasted students</option>' + groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
  deleteGroupSelect.innerHTML = '<option value="">Select group</option>' + groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
}

function renderGroupsTable() {
  const groups = Object.keys(groupsCache || {}).sort();

  if (!groups.length) {
    groupsTableBody.innerHTML = `<tr><td colspan="5">No groups yet.</td></tr>`;
    return;
  }

  groupsTableBody.innerHTML = groups.map((groupName) => {
    const group = groupsCache[groupName] || {};
    const count = Object.values(studentsCache || {}).filter((student) => (student.groupName || "") === groupName).length;
    const config = groupEvaluationConfig(group);
    const evaluationSummary = config.configured
      ? config.criteria.map((criterion) =>
          `${escapeHtml(criterion.name)} ${criterion.weight}%`
        ).join(" · ")
      : '<span class="setup-required">Evaluation setup required</span>';

    return `
      <tr>
        <td>${escapeHtml(groupName)}</td>
        <td>${count}</td>
        <td>${config.configured ? config.unitCount : "—"}</td>
        <td class="group-evaluation-summary">${evaluationSummary}</td>
        <td><button type="button" data-edit-group-evaluation="${escapeHtml(groupName)}">${config.configured ? "Edit Evaluation" : "Set Evaluation"}</button></td>
      </tr>
    `;
  }).join("");
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
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  return lines.map((line) => {
    const cols = parseCsvLine(line);
    return {
      studentNumber: (cols[0] || "").trim(),
      fullName: (cols[1] || "").trim(),
      nickname: ""
    };
  }).filter((student) => student.fullName);
}

function parseBulkText(text) {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
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
      nickname: ""
    };
  }).filter((student) => student.fullName);
}

async function saveStudent(fullName, nickname = "", studentNumber = "", groupName = "") {
  const cleanName = fullName.trim();
  const cleanNickname = nickname.trim() || cleanName.split(" ")[0];
  const cleanNumber = studentNumber.trim();
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
    activeNow: true,
    blockPoints: {
      "Block 1": 0,
      "Block 2": 0,
      "Block 3": 0
    }
  });
}

createGroupBtn.addEventListener("click", async () => {
  const groupName = groupNameInput.value.trim();
  if (!groupName) {
    alert("Enter a group name.");
    return;
  }

  const evaluationUnitCount = normalizeEvaluationUnitCount(evaluationUnitCountInput.value, 3);
  const evaluationCriteria = criteriaFromForm();
  const total = evaluationWeightTotal(evaluationCriteria);

  if (!evaluationCriteria.length || evaluationCriteria.some((criterion) => !criterion.name)) {
    groupEvaluationStatus.textContent = "Add at least one named evaluation criterion.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  if (Math.abs(total - 100) >= 0.01) {
    groupEvaluationStatus.textContent = "Evaluation criteria must total exactly 100%.";
    groupEvaluationStatus.className = "status-text bad";
    refreshEvaluationWeightTotal();
    return;
  }

  if (!editingGroupName && groupsCache[groupName]) {
    groupEvaluationStatus.textContent = "That group already exists. Use Edit Evaluation in the Groups table.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }

  const now = Date.now();
  const existing = groupsCache[groupName] || {};
  await update(ref(db, `groups/${groupName}`), {
    name: groupName,
    createdAt: Number(existing.createdAt || now),
    evaluationUnitCount,
    evaluationCriteria: criteriaToFirebaseObject(evaluationCriteria),
    evaluationWeights: null,
    evaluationConfiguredAt: now,
    evaluationConfiguredBy: getTeacherName()
  });

  const wasEditing = Boolean(editingGroupName);
  resetGroupForm();
  alert(wasEditing ? "Group evaluation settings saved." : "Group created.");
});

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

useEvaluationTemplateBtn.addEventListener("click", () => {
  const template = selectedEvaluationTemplate();
  if (!template) {
    groupEvaluationStatus.textContent = "Select an evaluation template first.";
    groupEvaluationStatus.className = "status-text bad";
    return;
  }
  applyEvaluationTemplate(template);
});

saveEvaluationTemplateBtn.addEventListener("click", saveCurrentEvaluationAsTemplate);
cancelGroupEditBtn.addEventListener("click", resetGroupForm);

groupsTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-group-evaluation]");
  if (!button) return;
  beginGroupEvaluationEdit(String(button.dataset.editGroupEvaluation || ""));
});

deleteGroupBtn.addEventListener("click", async () => {
  const groupName = deleteGroupSelect.value;
  if (!groupName) {
    alert("Select a group.");
    return;
  }

  const hasStudents = Object.values(studentsCache || {}).some((student) => (student.groupName || "") === groupName);
  if (hasStudents) {
    alert("This group still has students assigned. Reassign them first.");
    return;
  }

  await remove(ref(db, `groups/${groupName}`));
  alert("Group deleted.");
});

createStudentBtn.addEventListener("click", async () => {
  const fullName = studentNameInput.value.trim();
  const nickname = studentNicknameInput.value.trim();
  const studentNumber = studentNumberManualInput.value.trim();
  const groupName = studentGroupSelect.value;

  if (!fullName) {
    alert("Please enter a student name.");
    return;
  }

  if (!groupName) {
    alert("Select a group.");
    return;
  }

  await saveStudent(fullName, nickname, studentNumber, groupName);
  studentNameInput.value = "";
  studentNicknameInput.value = "";
  studentNumberManualInput.value = "";
  alert("Student added.");
});

importCsvBtn.addEventListener("click", async () => {
  const file = csvFileInput.files[0];
  const groupName = csvGroupSelect.value;

  if (!file) {
    alert("Please choose a CSV file.");
    return;
  }

  if (!groupName) {
    alert("Select a group for the imported students.");
    return;
  }

  const text = await file.text();
  const students = parseCsv(text);

  if (!students.length) {
    alert("No valid students were found.");
    return;
  }

  for (const student of students) {
    await saveStudent(student.fullName, student.nickname || "", student.studentNumber || "", groupName);
  }

  csvFileInput.value = "";
  alert(`${students.length} students imported successfully.`);
});

importTextBtn.addEventListener("click", async () => {
  const text = bulkTextInput.value.trim();
  const groupName = textGroupSelect.value;

  if (!text) {
    alert("Paste the student list first.");
    return;
  }

  if (!groupName) {
    alert("Select a group for the pasted students.");
    return;
  }

  const students = parseBulkText(text);

  if (!students.length) {
    alert("No valid students were found.");
    return;
  }

  for (const student of students) {
    await saveStudent(student.fullName, student.nickname || "", student.studentNumber || "", groupName);
  }

  bulkTextInput.value = "";
  alert(`${students.length} students imported successfully.`);
});

renderEvaluationTemplateOptions();
setCriteriaEditor([]);

(async () => {
  try {
    await migrateExistingStudentsForTeacher();
  } catch (error) {
    console.error("Migration failed:", error);
  }
})();

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupSelectors();
  renderGroupsTable();
});

onValue(ref(db, "groupEvaluationTemplates"), (snapshot) => {
  evaluationTemplatesCache = snapshot.val() || {};
  renderEvaluationTemplateOptions();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderGroupsTable();
});

