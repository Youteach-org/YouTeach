import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js";

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const groupFilter = document.getElementById("groupFilter");
const searchStudentInput = document.getElementById("searchStudent");
const selectedGroupCard = document.getElementById("selectedGroupCard");
const studentsInGroupCard = document.getElementById("studentsInGroupCard");
const studentsTableBody = document.getElementById("studentsTableBody");
const saveAllStudentsBtn = document.getElementById("saveAllStudentsBtn");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let groupsCache = {};
let sessionCache = null;
let selectedGroup = "";

function escapeHtml(value){
  return String(value || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeText(text){
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .trim();
}

function getDisplayName(student){
  return student.fullName || student.name || student.nickname || "";
}

function formatGradeNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function getExtraPoints(student, blockName){
  return Number(student?.blockPoints?.[blockName] || 0);
}

function getAttendancePoints(student, blockName) {
  return Number(student?.attendancePoints?.[blockName] || 0);
}

function getTaskPoints(student, blockName) {
  return Number(student?.taskPoints?.[blockName] || 0);
}

function getOfficialPoints(student, blockName){
  const examBlock = student?.examPoints?.[blockName] || {};
  return Number(examBlock.written || 0) + Number(examBlock.oral || 0) + Number(examBlock.verbs || 0);
}

function getTotalPointsForBlock(student, blockName){
  const exam = student?.examPoints?.[blockName] || {};
  const E = Number(exam.written || 0);
  const EO = Number(exam.oral || 0);
  const EV = Number(exam.verbs || 0);
  const P = Number(student?.blockPoints?.[blockName] || 0);
  const A = Number(student?.attendancePoints?.[blockName] || 0);
  const T = Number(student?.taskPoints?.[blockName] || 0);
  return E + EO + EV + P + A + T;
}

function getStoredWorkingGroup(){
  return sessionStorage.getItem(WORKING_GROUP_KEY) || "";
}

function setStoredWorkingGroup(groupName){
  if(groupName) sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  else sessionStorage.removeItem(WORKING_GROUP_KEY);
}

function getAllGroupNames(){
  const names = new Set();

  Object.keys(groupsCache || {}).forEach((groupName) => {
    if(groupName) names.add(groupName);
  });

  Object.values(studentsCache || {}).forEach((student) => {
    if(student?.groupName) names.add(student.groupName);
  });

  return Array.from(names).sort((a,b) => a.localeCompare(b, undefined, { sensitivity:"base" }));
}

function groupOptions(selectedValue){
  const groups = getAllGroupNames();
  return ['<option value="">No group</option>']
    .concat(groups.map((groupName) => `<option value="${escapeHtml(groupName)}" ${groupName === selectedValue ? "selected" : ""}>${escapeHtml(groupName)}</option>`))
    .join("");
}

function renderGroupFilter(){
  const groups = getAllGroupNames();

  if(!groups.length){
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

  groupFilter.innerHTML = groups.map((groupName) => `<option value="${escapeHtml(groupName)}" ${groupName === selectedGroup ? "selected" : ""}>${escapeHtml(groupName)}</option>`).join("");
  groupFilter.value = selectedGroup;
}

function getFilteredEntries(){
  const query = normalizeText(searchStudentInput.value);

  return Object.entries(studentsCache || {}).filter(([, student]) => {
    const matchesGroup = !selectedGroup || (student.groupName || "") === selectedGroup;
    if(!matchesGroup) return false;

    const searchable = normalizeText([
      getDisplayName(student),
      student.nickname || "",
      student.studentNumber || "",
      student.id || ""
    ].join(" "));

    return !query || searchable.includes(query);
  });
}

function renderStudents(){
  renderGroupFilter();

  const entries = getFilteredEntries();
  selectedGroupCard.textContent = selectedGroup || "No group selected";
  studentsInGroupCard.textContent = String(entries.length);

  if(!entries.length){
    studentsTableBody.innerHTML = `<tr><td colspan="7">No students found for this group.</td></tr>`;
    return;
  }

  studentsTableBody.innerHTML = entries.map(([key, student]) => `
    <tr class="editable-row" data-student-key="${escapeHtml(key)}">
      <td class="external-id-cell">${escapeHtml(student.studentNumber || "")}</td>
      <td><input class="table-input student-name-input name-column-input" data-student-key="${escapeHtml(key)}" value="${escapeHtml(getDisplayName(student))}"></td>
      <td><input class="table-input student-nickname-input" data-student-key="${escapeHtml(key)}" value="${escapeHtml(student.nickname || "")}"></td>
      <td>${student.activeNow ? "YES" : "NO"}</td>
      <td>${formatGradeNumber(getTotalPointsForBlock(student, "Block 1"))}</td>
      <td>${formatGradeNumber(getTotalPointsForBlock(student, "Block 2"))}</td>
      <td>${formatGradeNumber(getTotalPointsForBlock(student, "Block 3"))}</td>
    </tr>
  `).join("");

  document.querySelectorAll(".editable-row").forEach((row) => {
    row.addEventListener("dblclick", (event) => {
      if(event.target.closest("input, select, button")) return;
      const studentKey = row.dataset.studentKey;
      sessionStorage.setItem("teacherViewStudentKey", studentKey);
      window.location.href = `student-summary.html?teacherViewStudentKey=${encodeURIComponent(studentKey)}`;
    });
  });
}

saveAllStudentsBtn.addEventListener("click", async () => {
  const updates = {};

  document.querySelectorAll(".editable-row").forEach((row) => {
    const key = row.dataset.studentKey;
    const nameInput = row.querySelector(".student-name-input");
    const nicknameInput = row.querySelector(".student-nickname-input");

    if(!key || !nameInput || !nicknameInput) return;

    const fullName = nameInput.value.trim();
    const nickname = nicknameInput.value.trim();

    updates[`students/${key}/fullName`] = fullName;
    updates[`students/${key}/name`] = fullName;
    updates[`students/${key}/nickname`] = nickname;
  });

  if(!Object.keys(updates).length){
    alert("No visible changes to save.");
    return;
  }

  await update(ref(db), updates);
  alert("All visible student changes saved.");
});

groupFilter.addEventListener("change", () => {
  selectedGroup = groupFilter.value || "";
  setStoredWorkingGroup(selectedGroup);
  renderStudents();
});

searchStudentInput.addEventListener("input", renderStudents);

(async () => {
  try {
    await migrateExistingStudentsForTeacher();
  } catch(error) {
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
  if(sessionCache?.groupName) {
    setStoredWorkingGroup(sessionCache.groupName);
  }
  renderStudents();
});