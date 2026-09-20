import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudentsForTeacher } from "./student-auth.js?v=group-evaluation-20260920";
import {
  calculateBlockGrade,
  evaluationBlockNames,
  groupEvaluationConfig
} from "./group-evaluation-model.js";

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const groupFilter = document.getElementById("groupFilter");
const searchStudentInput = document.getElementById("searchStudent");
const selectedGroupCard = document.getElementById("selectedGroupCard");
const studentsInGroupCard = document.getElementById("studentsInGroupCard");
const evaluationUnitCountCard = document.getElementById("evaluationUnitCountCard");
const evaluationSetupSummary = document.getElementById("evaluationSetupSummary");
const studentsTableBody = document.getElementById("studentsTableBody");
const studentsTableHeadRow = studentsTableBody.closest("table")?.querySelector("thead tr");
const saveAllStudentsBtn = document.getElementById("saveAllStudentsBtn");

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

function getDisplayName(student){
  return student.fullName || student.name || student.nickname || "";
}

function formatGradeNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function normalizedRecipientKeys(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.values(raw).map(String);
  return [];
}

function assignmentAppliesToStudent(assignment, studentKey, student) {
  if (!assignment || !student) return false;

  const assignmentGroup = String(assignment.groupName || "");
  if (assignmentGroup && assignmentGroup !== "ALL" && assignmentGroup !== String(student.groupName || "")) {
    return false;
  }

  const exactRecipients = normalizedRecipientKeys(assignment.recipientStudentKeys);
  if (exactRecipients.length && !exactRecipients.includes(String(studentKey))) return false;

  return true;
}

function assignmentBlock(assignment) {
  return String(assignment?.evaluationBlock || assignment?.block || "").trim();
}

function assignmentScoresForCriterion(studentKey, student, blockName, criterion, config) {
  const tagged = [];
  const untaggedTaskFallback = [];

  Object.entries(assignmentsCache || {}).forEach(([assignmentId, assignment]) => {
    if (!assignmentAppliesToStudent(assignment, studentKey, student)) return;
    if (assignmentBlock(assignment) !== blockName) return;

    const raw = assignmentSubmissionsCache?.[assignmentId]?.[studentKey]?.grading?.totalScore;
    if (raw === null || raw === undefined || raw === "") return;
    const score = Number(raw);
    if (!Number.isFinite(score)) return;

    const normalizedScore = Math.min(100, Math.max(0, score));
    const criterionId = String(assignment.groupEvaluationCriterionId || "");

    if (criterionId === criterion.id) {
      tagged.push(normalizedScore);
      return;
    }

    if (!criterionId && criterion.source === "tasks") {
      const typeCode = String(assignment.assignmentTypeCode || "").trim().toUpperCase();
      if (typeCode !== "EX") untaggedTaskFallback.push(normalizedScore);
    }
  });

  if (tagged.length) return tagged;

  const taskCriteria = (config?.criteria || []).filter((item) => item.source === "tasks");
  if (criterion.source === "tasks" && taskCriteria.length === 1) return untaggedTaskFallback;

  return [];
}

function average(values) {
  const valid = (values || []).map(Number).filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function criterionValue(studentKey, student, blockName, criterion, config) {
  const exam = student?.examPoints?.[blockName] || {};

  if (criterion.source === "writtenExam") {
    return { value: Number(exam.written || 0), mode: "contribution" };
  }
  if (criterion.source === "oralExam") {
    return { value: Number(exam.oral || 0), mode: "contribution" };
  }
  if (criterion.source === "verbsExam") {
    return { value: Number(exam.verbs || 0), mode: "contribution" };
  }
  if (criterion.source === "participation") {
    return { value: Number(student?.blockPoints?.[blockName] || 0), mode: "contribution" };
  }
  if (criterion.source === "attendance") {
    return { value: Number(student?.attendancePoints?.[blockName] || 0), mode: "contribution" };
  }

  if (criterion.source === "tasks" || criterion.source === "assignments") {
    const scores = assignmentScoresForCriterion(studentKey, student, blockName, criterion, config);
    const score = average(scores);
    if (score !== null) return { value: score, mode: "score" };

    if (criterion.source === "tasks") {
      return { value: Number(student?.taskPoints?.[blockName] || 0), mode: "contribution" };
    }
    return null;
  }

  const manualScore = student?.evaluationCriterionScores?.[blockName]?.[criterion.id];
  if (manualScore === null || manualScore === undefined || manualScore === "") return null;
  return { value: Number(manualScore), mode: "score" };
}

function currentBlockGrade(studentKey, student, blockName, config) {
  const valuesByCriterion = Object.fromEntries(
    (config.criteria || []).map((criterion) => [
      criterion.id,
      criterionValue(studentKey, student, blockName, criterion, config)
    ])
  );

  return calculateBlockGrade({
    criteria: config.criteria,
    valuesByCriterion
  });
}

function renderEvaluationSummary(group) {
  const config = groupEvaluationConfig(group);

  if (!config.configured) {
    evaluationUnitCountCard.textContent = "Setup required";
    evaluationSetupSummary.innerHTML =
      '<span class="evaluation-setup-required">Evaluation setup required in Groups / Import.</span>';
    return config;
  }

  evaluationUnitCountCard.textContent = String(config.unitCount);
  evaluationSetupSummary.innerHTML = config.criteria.map((criterion) =>
    `<span class="evaluation-weight-chip">${escapeHtml(criterion.name)} <strong>${formatGradeNumber(criterion.weight)}%</strong></span>`
  ).join("");

  return config;
}

function renderBlockHeaders(blockNames) {
  if (!studentsTableHeadRow) return;
  studentsTableHeadRow.innerHTML = `
    <th style="min-width:140px;">External ID</th>
    <th style="min-width:320px;">Full Name</th>
    <th style="min-width:180px;">Nickname</th>
    <th>Today Active</th>
    ${blockNames.map((blockName) => `<th>${escapeHtml(blockName)} Grade</th>`).join("")}
  `;
}

function blockGradeHtml(studentKey, student, blockName, config) {
  if (!config.configured) {
    return '<span class="block-grade-setup-required">Setup required</span>';
  }

  const result = currentBlockGrade(studentKey, student, blockName, config);
  const breakdown = result.criteria.map((criterion) =>
    `${escapeHtml(criterion.name)} ${formatGradeNumber(criterion.contribution)}/${formatGradeNumber(criterion.weight)}`
  ).join(" · ");

  return `
    <span class="block-grade-total">${formatGradeNumber(result.total)}</span>
    <span class="block-grade-breakdown">${breakdown}</span>
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
  const selectedGroupRecord = groupsCache?.[selectedGroup] || {};
  const config = renderEvaluationSummary(selectedGroupRecord);
  const blockNames = evaluationBlockNames(selectedGroupRecord);
  renderBlockHeaders(blockNames);

  selectedGroupCard.textContent = selectedGroup || "No group selected";
  studentsInGroupCard.textContent = String(entries.length);

  const columnCount = 4 + blockNames.length;
  if(!entries.length){
    studentsTableBody.innerHTML = `<tr><td colspan="${columnCount}">No students found for this group.</td></tr>`;
    return;
  }

  studentsTableBody.innerHTML = entries.map(([key, student]) => `
    <tr class="editable-row" data-student-key="${escapeHtml(key)}">
      <td class="external-id-cell">${escapeHtml(student.studentNumber || "")}</td>
      <td><input class="table-input student-name-input name-column-input" data-student-key="${escapeHtml(key)}" value="${escapeHtml(getDisplayName(student))}"></td>
      <td><input class="table-input student-nickname-input" data-student-key="${escapeHtml(key)}" value="${escapeHtml(student.nickname || "")}"></td>
      <td>${student.activeNow ? "YES" : "NO"}</td>
      ${blockNames.map((blockName) =>
        `<td class="block-grade-cell">${blockGradeHtml(key, student, blockName, config)}</td>`
      ).join("")}
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