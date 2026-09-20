import { db } from "./firebase.js";
import { ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js?v=group-evaluation-20260920";
import {
  groupEvaluationConfig,
  evaluationWeightTotal,
  normalizeEvaluationUnitCount
} from "./group-evaluation-model.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupNameInput = document.getElementById("groupNameInput");
const evaluationUnitCountInput = document.getElementById("evaluationUnitCountInput");
const tasksWeightInput = document.getElementById("tasksWeightInput");
const examsWeightInput = document.getElementById("examsWeightInput");
const participationWeightInput = document.getElementById("participationWeightInput");
const attendanceWeightInput = document.getElementById("attendanceWeightInput");
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

refreshEvaluationWeightTotal();


let groupsCache = {};
let studentsCache = {};
let editingGroupName = "";


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function evaluationWeightsFromForm() {
  return {
    tasks: Number(tasksWeightInput.value || 0),
    exams: Number(examsWeightInput.value || 0),
    participation: Number(participationWeightInput.value || 0),
    attendance: Number(attendanceWeightInput.value || 0)
  };
}

function refreshEvaluationWeightTotal() {
  const total = evaluationWeightTotal(evaluationWeightsFromForm());
  evaluationWeightTotalLabel.textContent = `${total} / 100%`;
  evaluationWeightTotalLabel.classList.toggle("ok", Math.abs(total - 100) < 0.01);
  evaluationWeightTotalLabel.classList.toggle("bad", Math.abs(total - 100) >= 0.01);
  return total;
}

function resetGroupForm() {
  editingGroupName = "";
  groupNameInput.disabled = false;
  groupNameInput.value = "";
  evaluationUnitCountInput.value = "3";
  tasksWeightInput.value = "";
  examsWeightInput.value = "";
  participationWeightInput.value = "";
  attendanceWeightInput.value = "";
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
  tasksWeightInput.value = String(config.weights.tasks || "");
  examsWeightInput.value = String(config.weights.exams || "");
  participationWeightInput.value = String(config.weights.participation || "");
  attendanceWeightInput.value = String(config.weights.attendance || "");
  createGroupBtn.textContent = "Save Group Settings";
  cancelGroupEditBtn.hidden = false;
  groupEvaluationStatus.textContent = config.configured
    ? "Editing evaluation settings."
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
      ? `Tasks ${config.weights.tasks}% · Exams ${config.weights.exams}% · Participation ${config.weights.participation}% · Attendance ${config.weights.attendance}%`
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
  const evaluationWeights = evaluationWeightsFromForm();
  const total = evaluationWeightTotal(evaluationWeights);

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
    evaluationWeights,
    evaluationConfiguredAt: now,
    evaluationConfiguredBy: getTeacherName()
  });

  const wasEditing = Boolean(editingGroupName);
  resetGroupForm();
  alert(wasEditing ? "Group evaluation settings saved." : "Group created.");
});

[tasksWeightInput, examsWeightInput, participationWeightInput, attendanceWeightInput]
  .forEach((input) => input.addEventListener("input", refreshEvaluationWeightTotal));

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

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderGroupsTable();
});

