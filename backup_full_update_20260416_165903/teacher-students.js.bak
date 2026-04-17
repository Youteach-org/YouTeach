import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const groupFilter = document.getElementById("groupFilter");
const selectedGroupCard = document.getElementById("selectedGroupCard");
const studentsInGroupCard = document.getElementById("studentsInGroupCard");
const searchStudentInput = document.getElementById("searchStudent");
const studentsTableBody = document.getElementById("studentsTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);
menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

let studentsCache = {};
let groupsCache = {};
let selectedGroup = "";

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAllGroupNames() {
  const names = new Set();

  Object.keys(groupsCache || {}).forEach((groupName) => {
    if (groupName) names.add(groupName);
  });

  Object.values(studentsCache || {}).forEach((student) => {
    if (student?.groupName) names.add(student.groupName);
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function ensureBlockPointsObject(student) {
  return {
    "Block 1": Number(student?.blockPoints?.["Block 1"] || 0),
    "Block 2": Number(student?.blockPoints?.["Block 2"] || 0),
    "Block 3": Number(student?.blockPoints?.["Block 3"] || 0)
  };
}

function ensureExamPointsObject(student) {
  const makeBlock = (blockName) => ({
    written: Number(student?.examPoints?.[blockName]?.written || 0),
    oral: Number(student?.examPoints?.[blockName]?.oral || 0),
    verbs: Number(student?.examPoints?.[blockName]?.verbs || 0)
  });

  return {
    "Block 1": makeBlock("Block 1"),
    "Block 2": makeBlock("Block 2"),
    "Block 3": makeBlock("Block 3")
  };
}

function getTotalPointsForBlock(student, blockName) {
  const blockPoints = ensureBlockPointsObject(student);
  const examPoints = ensureExamPointsObject(student);
  const examTotal =
    Number(examPoints[blockName]?.written || 0) +
    Number(examPoints[blockName]?.oral || 0) +
    Number(examPoints[blockName]?.verbs || 0);

  return Number(blockPoints[blockName] || 0) + examTotal;
}

function getGroupOptionsHtml(selectedValue) {
  const groups = getAllGroupNames();
  if (!groups.length) {
    return '<option value="">No groups available</option>';
  }

  return groups
    .map((groupName) => `<option value="${groupName}" ${groupName === selectedValue ? "selected" : ""}>${groupName}</option>`)
    .join("");
}

function renderGroupFilter() {
  const groups = getAllGroupNames();

  if (!groups.length) {
    selectedGroup = "";
    groupFilter.innerHTML = '<option value="">No groups available</option>';
    return;
  }

  if (!selectedGroup || !groups.includes(selectedGroup)) {
    selectedGroup = groups[0];
  }

  groupFilter.innerHTML = getGroupOptionsHtml(selectedGroup);
  groupFilter.value = selectedGroup;
}

function getFilteredEntries() {
  const query = normalizeText(searchStudentInput.value);

  return Object.entries(studentsCache || {}).filter(([, student]) => {
    const matchesGroup = !selectedGroup || (student.groupName || "") === selectedGroup;
    if (!matchesGroup) return false;

    const searchable = normalizeText([
      student.fullName || student.name || "",
      student.nickname || "",
      student.studentNumber || "",
      student.id || ""
    ].join(" "));

    return !query || searchable.includes(query);
  });
}

function renderStudents() {
  renderGroupFilter();

  const entries = getFilteredEntries();

  selectedGroupCard.textContent = selectedGroup || "No group selected";
  studentsInGroupCard.textContent = String(entries.length);

  if (!entries.length) {
    studentsTableBody.innerHTML = `<tr><td colspan="11">No students found for this group.</td></tr>`;
    return;
  }

  studentsTableBody.innerHTML = entries.map(([key, student]) => `
    <tr>
      <td>${student.fullName || student.name || student.nickname || ""}</td>
      <td>${student.nickname || ""}</td>
      <td>${student.studentNumber || ""}</td>
      <td>${student.id || ""}</td>
      <td>${student.activeNow ? "YES" : "NO"}</td>
      <td>${getTotalPointsForBlock(student, "Block 1")}</td>
      <td>${getTotalPointsForBlock(student, "Block 2")}</td>
      <td>${getTotalPointsForBlock(student, "Block 3")}</td>
      <td><input class="table-input" id="nickname-${key}" value="${(student.nickname || "").replace(/"/g, "&quot;")}"></td>
      <td>
        <select class="table-input" id="groupName-${key}">
          ${getGroupOptionsHtml(student.groupName || selectedGroup || "")}
        </select>
      </td>
      <td><button class="small-btn" onclick="window.saveStudentRow('${key}')">Save</button></td>
    </tr>
  `).join("");
}

window.saveStudentRow = async function(studentKey) {
  const nickname = document.getElementById(`nickname-${studentKey}`).value.trim();
  const groupName = document.getElementById(`groupName-${studentKey}`).value;

  await update(ref(db, `students/${studentKey}`), {
    nickname,
    groupName
  });

  alert("Student updated.");
};

groupFilter.addEventListener("change", () => {
  selectedGroup = groupFilter.value || "";
  renderStudents();
});

searchStudentInput.addEventListener("input", renderStudents);

(async () => {
  try {
    await migrateExistingStudentsForTeacher();
  } catch (error) {
    console.error("Migration failed:", error);
  }
})();

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderStudents();
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderStudents();
});