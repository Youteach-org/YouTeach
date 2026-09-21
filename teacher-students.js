import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js?v=group-evaluation-20260920";
import {
  evaluationBlockNames,
  groupEvaluationConfig
} from "./group-evaluation-model.js";
import { calculateStudentBlockGrade } from "./group-grade-runtime.js";

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const groupFilter = document.getElementById("groupFilter");
const searchStudentInput = document.getElementById("searchStudent");
const studentsInGroupCard = document.getElementById("studentsInGroupCard");
const toggleStudentSearchBtn = document.getElementById("toggleStudentSearchBtn");
const studentSearchPanel = document.getElementById("studentSearchPanel");
const studentsTableBody = document.getElementById("studentsTableBody");
const studentsTableHeadRow = studentsTableBody.closest("table")?.querySelector("thead tr");
const studentDisplayModeBtn = document.getElementById("studentDisplayModeBtn");
const openBlockReportBtn = document.getElementById("openBlockReportBtn");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let groupsCache = {};
let assignmentsCache = {};
let assignmentSubmissionsCache = {};
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

const STUDENT_DISPLAY_MODES = ["name", "lastNames", "nickname"];

function getDisplayName(student){
  return String(student?.fullName || student?.name || student?.nickname || "").trim();
}

function studentNameParts(student) {
  const fullName = getDisplayName(student);
  const explicitGiven = String(student?.firstName || student?.givenName || "").trim();
  const explicitLast = String(student?.lastName || student?.lastNames || student?.surname || "").trim();
  if (explicitGiven || explicitLast) {
    return { givenNames: explicitGiven || fullName, lastNames: explicitLast, fullName };
  }

  const tokens = fullName.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return { givenNames: fullName, lastNames: "", fullName };
  if (tokens.length === 2) return { givenNames: tokens[0], lastNames: tokens[1], fullName };

  const letters = fullName.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  const surnameFirst = letters && letters === letters.toLocaleUpperCase();
  return surnameFirst
    ? { givenNames: tokens.slice(2).join(" "), lastNames: tokens.slice(0, 2).join(" "), fullName }
    : { givenNames: tokens.slice(0, -2).join(" "), lastNames: tokens.slice(-2).join(" "), fullName };
}

function studentDisplayMode() {
  const raw = String(groupsCache?.[selectedGroup]?.studentListDisplayMode || "name");
  return STUDENT_DISPLAY_MODES.includes(raw) ? raw : "name";
}

function studentPrimaryDisplay(student, mode) {
  const parts = studentNameParts(student);
  if (mode === "lastNames") return parts.lastNames || parts.fullName;
  if (mode === "nickname") return String(student?.nickname || "").trim() || parts.givenNames || parts.fullName;
  return parts.givenNames || parts.fullName;
}

function studentSecondaryDisplay(student, mode) {
  const parts = studentNameParts(student);
  const nickname = String(student?.nickname || "").trim();
  const id = String(student?.studentNumber || "").trim();
  const pieces = [];
  if (mode === "nickname") {
    if (parts.fullName && parts.fullName !== nickname) pieces.push(parts.fullName);
  } else if (nickname) {
    pieces.push(nickname);
  }
  if (id) pieces.push(`ID ${id}`);
  return pieces.join(" · ");
}

function studentDisplayModeLabel(mode) {
  if (mode === "lastNames") return "Last names";
  if (mode === "nickname") return "Nickname";
  return "Name";
}

function studentNameFontSize(name) {
  const length = Array.from(String(name || "").trim()).length;
  if (length <= 14) return 18;
  if (length <= 20) return 16;
  if (length <= 28) return 14;
  if (length <= 36) return 12;
  return 10.5;
}

function formatGradeNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function currentBlockGrade(studentKey, student, blockName, config) {
  return calculateStudentBlockGrade({
    studentKey,
    student,
    blockName,
    config,
    assignments: assignmentsCache,
    submissions: assignmentSubmissionsCache
  });
}

function renderEvaluationSummary(group) {
  return groupEvaluationConfig(group);
}

function criterionHeaderLabel(criterion) {
  const words = String(criterion?.name || "").trim().split(/\s+/).filter(Boolean);
  const weight = `${formatGradeNumber(criterion?.weight)}%`;

  if (!words.length) return weight;
  if (words.length === 1) return `${escapeHtml(words[0])}<br>${weight}`;

  const firstLine = escapeHtml(words.slice(0, -1).join(" "));
  const secondLine = `${escapeHtml(words[words.length - 1])} ${weight}`;
  return `${firstLine}<br>${secondLine}`;
}

function blockCriteriaHeaderHtml(config) {
  if (!config.configured) {
    return '<span class="block-grade-setup-required">Evaluation setup required</span>';
  }

  const columns = config.criteria.length + 1;
  return `
    <span class="block-criteria-grid" style="--criterion-columns:${columns}">
      ${config.criteria.map((criterion) =>
        `<span class="block-criterion-label">${criterionHeaderLabel(criterion)}</span>`
      ).join("")}
      <span class="block-criterion-label block-criterion-total">Total</span>
    </span>
  `;
}

function renderBlockHeaders(blockNames, config) {
  if (!studentsTableHeadRow) return;
  const criteria = blockCriteriaHeaderHtml(config);

  studentsTableHeadRow.innerHTML = `
    <th class="student-column-header">Student</th>
    ${blockNames.map((blockName) => `
      <th class="block-grade-header">
        <span class="block-header-title">${escapeHtml(blockName)}</span>
        ${criteria}
      </th>
    `).join("")}
  `;
}

function blockGradeHtml(studentKey, student, blockName, config) {
  if (!config.configured) {
    return '<span class="block-grade-setup-required">Setup required</span>';
  }

  const result = currentBlockGrade(studentKey, student, blockName, config);
  const columns = result.criteria.length + 1;

  return `
    <span class="block-values-grid" style="--criterion-columns:${columns}">
      ${result.criteria.map((criterion) =>
        `<span class="block-criterion-value">${formatGradeNumber(criterion.contribution)}%</span>`
      ).join("")}
      <span class="block-criterion-value block-criterion-total">${formatGradeNumber(result.total)}%</span>
    </span>
  `;
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
    (selectedGroup && groups.includes(selectedGroup) ? selectedGroup : "") ||
    (getStoredWorkingGroup() && groups.includes(getStoredWorkingGroup()) ? getStoredWorkingGroup() : "") ||
    (sessionCache?.groupName && groups.includes(sessionCache.groupName) ? sessionCache.groupName : "") ||
    groups[0];

  selectedGroup = preferredGroup;
  setStoredWorkingGroup(selectedGroup);

  groupFilter.innerHTML = groups.map((groupName) => `<option value="${escapeHtml(groupName)}" ${groupName === selectedGroup ? "selected" : ""}>${escapeHtml(groupName)}</option>`).join("");
  groupFilter.value = selectedGroup;
}

function getGroupEntries(){
  return Object.entries(studentsCache || {}).filter(([, student]) =>
    !selectedGroup || (student.groupName || "") === selectedGroup
  );
}

function getFilteredEntries(){
  const query = normalizeText(searchStudentInput.value);
  const mode = studentDisplayMode();

  return getGroupEntries()
    .filter(([, student]) => {
      const parts = studentNameParts(student);
      const searchable = normalizeText([
        parts.fullName,
        parts.givenNames,
        parts.lastNames,
        student.nickname || "",
        student.studentNumber || "",
        student.id || ""
      ].join(" "));

      return !query || searchable.includes(query);
    })
    .sort((a, b) =>
      studentPrimaryDisplay(a[1], mode).localeCompare(
        studentPrimaryDisplay(b[1], mode),
        undefined,
        { sensitivity: "base" }
      )
    );
}

function renderStudents(){
  renderGroupFilter();

  const entries = getFilteredEntries();
  const selectedGroupRecord = groupsCache?.[selectedGroup] || {};
  const displayMode = studentDisplayMode();
  studentDisplayModeBtn.textContent = `Show: ${studentDisplayModeLabel(displayMode)}`;
  const config = renderEvaluationSummary(selectedGroupRecord);
  const blockNames = evaluationBlockNames(selectedGroupRecord);
  renderBlockHeaders(blockNames, config);

  studentsInGroupCard.textContent = String(getGroupEntries().length);

  const columnCount = 1 + blockNames.length;
  if(!entries.length){
    studentsTableBody.innerHTML = `<tr><td colspan="${columnCount}">No students found for this group.</td></tr>`;
    return;
  }

  studentsTableBody.innerHTML = entries.map(([key, student]) => {
    const primary = studentPrimaryDisplay(student, displayMode);
    const secondary = studentSecondaryDisplay(student, displayMode);
    return `
    <tr class="student-row ${student.activeNow ? "active-student" : ""}" data-student-key="${escapeHtml(key)}">
      <td class="student-identity-cell">
        <div class="student-name-line">
          <span class="student-name" style="font-size:${studentNameFontSize(primary)}px" title="${escapeHtml(getDisplayName(student))}">${escapeHtml(primary)}</span>
        </div>
        ${secondary ? `<div class="student-meta"><span class="student-meta-line">${escapeHtml(secondary)}</span></div>` : ""}
      </td>
      ${blockNames.map((blockName) =>
        `<td class="block-grade-cell">${blockGradeHtml(key, student, blockName, config)}</td>`
      ).join("")}
    </tr>
  `;
  }).join("");

  document.querySelectorAll(".student-row").forEach((row) => {
    row.addEventListener("dblclick", (event) => {
      if(event.target.closest("input, select, button, a")) return;
      const studentKey = row.dataset.studentKey;
      sessionStorage.setItem("teacherViewStudentKey", studentKey);
      window.location.href = `student-summary.html?teacherViewStudentKey=${encodeURIComponent(studentKey)}`;
    });
  });
}

studentDisplayModeBtn.addEventListener("click", async () => {
  const groupName = selectedGroup;
  if (!groupName || !groupsCache[groupName]) return;

  const current = studentDisplayMode();
  const index = STUDENT_DISPLAY_MODES.indexOf(current);
  const next = STUDENT_DISPLAY_MODES[(index + 1) % STUDENT_DISPLAY_MODES.length];

  groupsCache[groupName] = {
    ...groupsCache[groupName],
    studentListDisplayMode: next
  };
  renderStudents();

  await update(ref(db, `groups/${groupName}`), {
    studentListDisplayMode: next,
    studentListDisplayUpdatedAt: Date.now(),
    studentListDisplayUpdatedBy: getTeacherName()
  });
});

openBlockReportBtn.addEventListener("click", () => {
  const group = selectedGroup || groupFilter.value || "";
  const query = group ? `?group=${encodeURIComponent(group)}` : "";
  window.location.href = `teacher-block-report.html${query}`;
});

groupFilter.addEventListener("change", () => {
  selectedGroup = groupFilter.value || "";
  setStoredWorkingGroup(selectedGroup);
  renderStudents();
});

toggleStudentSearchBtn.addEventListener("click", () => {
  const opening = studentSearchPanel.hidden;
  studentSearchPanel.hidden = !opening;
  toggleStudentSearchBtn.setAttribute("aria-expanded", String(opening));
  if (opening) {
    searchStudentInput.focus();
  }
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

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderStudents();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  assignmentSubmissionsCache = snapshot.val() || {};
  renderStudents();
});

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  if(sessionCache?.groupName) {
    setStoredWorkingGroup(sessionCache.groupName);
  }
  renderStudents();
});