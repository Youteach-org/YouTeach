import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js";

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const groupFilter = document.getElementById("groupFilter");
const searchStudentInput = document.getElementById("searchStudent");
const selectedGroupCard = document.getElementById("selectedGroupCard");
const studentsInGroupCard = document.getElementById("studentsInGroupCard");
const studentsTableBody = document.getElementById("studentsTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);
menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

let studentsCache = {};
let groupsCache = {};
let sessionCache = null;
let selectedGroup = "";

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDisplayName(student) {
  return student.fullName || student.name || student.nickname || "";
}

function getExtraPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function getOfficialPoints(student, blockName) {
  const examBlock = student?.examPoints?.[blockName] || {};
  return Number(examBlock.written || 0) + Number(examBlock.oral || 0) + Number(examBlock.verbs || 0);
}

function getTotalPointsForBlock(student, blockName) {
  return getOfficialPoints(student, blockName) + getExtraPoints(student, blockName);
}

function getStoredWorkingGroup() {
  return sessionStorage.getItem(WORKING_GROUP_KEY) || "";
}

function setStoredWorkingGroup(groupName) {
  if (groupName) {
    sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  } else {
    sessionStorage.removeItem(WORKING_GROUP_KEY);
  }
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

function groupOptions(selectedValue) {
  const groups = getAllGroupNames();
  return ['<option value="">No group</option>']
    .concat(groups.map((groupName) => `<option value="${groupName}" ${groupName === selectedValue ? "selected" : ""}>${groupName}</option>`))
    .join("");
}

function renderGroupFilter() {
  const groups = getAllGroupNames();

  if (!groups.length) {
    selectedGroup = "";
    groupFilter.innerHTML = '<option value="">No groups available</option>';
    return;
  }

  const preferredGroup =
    (sessionCache?.groupName && groups.includes(sessionCache.groupName) ? sessionCache.groupName : "") ||
    (getStoredWorkingGroup() && groups.includes(getStoredWorkingGroup()) ? getStoredWorkingGroup() : "") ||
    selectedGroup ||
    groups[0];

  selectedGroup = preferredGroup;
  setStoredWorkingGroup(selectedGroup);

  groupFilter.innerHTML = groups.map((groupName) => `<option value="${groupName}" ${groupName === selectedGroup ? "selected" : ""}>${groupName}</option>`).join("");
  groupFilter.value = selectedGroup;
}

function getFilteredEntries() {
  const query = normalizeText(searchStudentInput.value);

  return Object.entries(studentsCache || {}).filter(([, student]) => {
    const matchesGroup = !selectedGroup || (student.groupName || "") === selectedGroup;
    if (!matchesGroup) return false;

    const searchable = normalizeText([
      getDisplayName(student),
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
      <td>${getDisplayName(student)}</td>
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
          ${groupOptions(student.groupName || selectedGroup || "")}
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
  setStoredWorkingGroup(selectedGroup);
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

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  if (sessionCache?.groupName) {
    setStoredWorkingGroup(sessionCache.groupName);
  }
  renderStudents();
});