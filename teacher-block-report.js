import { db } from "./firebase.js";
import { visibleGroups } from "./group-state.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { evaluationBlockNames, groupEvaluationConfig } from "./group-evaluation-model.js";
import { calculateStudentBlockGrade } from "./group-grade-runtime.js";

requireTeacherAuth();

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const reportGroupSelect = document.getElementById("reportGroupSelect");
const reportBlockSelect = document.getElementById("reportBlockSelect");
const reportTitleInput = document.getElementById("reportTitleInput");
const reportOrganizationInput = document.getElementById("reportOrganizationInput");
const reportDepartmentInput = document.getElementById("reportDepartmentInput");
const reportPeriodInput = document.getElementById("reportPeriodInput");
const reportCourseInput = document.getElementById("reportCourseInput");
const reportParallelsInput = document.getElementById("reportParallelsInput");
const reportSignatureSelect = document.getElementById("reportSignatureSelect");
const saveReportSettingsBtn = document.getElementById("saveReportSettingsBtn");
const printReportBtn = document.getElementById("printReportBtn");
const reportStatus = document.getElementById("reportStatus");
const reportPaper = document.getElementById("reportPaper");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let groupsCache = {};
let studentsCache = {};
let assignmentsCache = {};
let submissionsCache = {};
let initialGroupApplied = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function currentGroupName() {
  return String(reportGroupSelect.value || "");
}

function currentGroup() {
  return groupsCache?.[currentGroupName()] || null;
}

function currentReportSettings() {
  return {
    title: String(reportTitleInput.value || "").trim(),
    organization: String(reportOrganizationInput.value || "").trim(),
    department: String(reportDepartmentInput.value || "").trim(),
    period: String(reportPeriodInput.value || "").trim(),
    courseProgram: String(reportCourseInput.value || "").trim(),
    parallels: String(reportParallelsInput.value || "").trim(),
    includeSignature: reportSignatureSelect.value !== "no"
  };
}

function applyReportSettings(group) {
  const settings = group?.reportSettings || {};
  reportTitleInput.value = String(settings.title || "Block Grade Report");
  reportOrganizationInput.value = String(settings.organization || "");
  reportDepartmentInput.value = String(settings.department || "");
  reportPeriodInput.value = String(settings.period || "");
  reportCourseInput.value = String(settings.courseProgram || "");
  reportParallelsInput.value = String(settings.parallels || "");
  reportSignatureSelect.value = settings.includeSignature === false ? "no" : "yes";
}

function renderGroupOptions() {
  const previous = currentGroupName();
  const names = Object.keys(groupsCache || {}).sort((a, b) => a.localeCompare(b));
  reportGroupSelect.innerHTML =
    '<option value="">Select group</option>' +
    names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");

  const requested = new URLSearchParams(window.location.search).get("group") || "";
  const preferred = !initialGroupApplied && names.includes(requested)
    ? requested
    : (names.includes(previous) ? previous : "");

  reportGroupSelect.value = preferred;
  initialGroupApplied = true;
  if (preferred) {
    applyReportSettings(groupsCache[preferred]);
    renderBlockOptions();
  }
}

function renderBlockOptions() {
  const group = currentGroup();
  const blocks = group ? evaluationBlockNames(group) : ["Block 1"];
  const previous = reportBlockSelect.value;
  const requested = new URLSearchParams(window.location.search).get("block") || "";
  reportBlockSelect.innerHTML = blocks
    .map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`)
    .join("");
  reportBlockSelect.value = blocks.includes(requested)
    ? requested
    : (blocks.includes(previous) ? previous : blocks[0] || "Block 1");
  renderReport();
}

function groupStudents(groupName) {
  return Object.entries(studentsCache || {})
    .filter(([, student]) => String(student?.groupName || "") === groupName)
    .sort((a, b) => String(a[1]?.fullName || a[1]?.name || "").localeCompare(
      String(b[1]?.fullName || b[1]?.name || ""),
      undefined,
      { sensitivity: "base" }
    ));
}

function reportCriterionLabel(criterion) {
  return String(criterion.shortLabel || criterion.name || "");
}

function renderReport() {
  const groupName = currentGroupName();
  const group = currentGroup();
  if (!groupName || !group) {
    reportPaper.innerHTML = '<div class="report-empty">Select a configured group to generate the block report.</div>';
    return;
  }

  const config = groupEvaluationConfig(group);
  if (!config.configured) {
    reportPaper.innerHTML = '<div class="report-empty">This group needs a valid evaluation setup totaling 100%.</div>';
    return;
  }

  const blockName = reportBlockSelect.value || "Block 1";
  const settings = currentReportSettings();
  const students = groupStudents(groupName);
  const teacher = getTeacherName();

  const rows = students.map(([studentKey, student], index) => {
    const grade = calculateStudentBlockGrade({
      studentKey,
      student,
      blockName,
      config,
      assignments: assignmentsCache,
      submissions: submissionsCache
    });

    return `
      <tr>
        <td>${index + 1}</td>
        <td class="name">${escapeHtml(student.fullName || student.name || student.nickname || "")}</td>
        ${grade.criteria.map((criterion) => `<td>${formatNumber(criterion.contribution)}</td>`).join("")}
        <td><strong>${formatNumber(grade.total)}</strong></td>
        ${settings.includeSignature ? '<td class="signature"></td>' : ""}
      </tr>
    `;
  }).join("");

  reportPaper.innerHTML = `
    <div class="report-heading">
      ${settings.organization ? `<h1>${escapeHtml(settings.organization)}</h1>` : ""}
      ${settings.department ? `<p>${escapeHtml(settings.department)}</p>` : ""}
      <h2>${escapeHtml(settings.title || "Block Grade Report")}</h2>
    </div>

    <div class="report-meta">
      <div><strong>Period</strong>${escapeHtml(settings.period || "—")}</div>
      <div><strong>Teacher</strong>${escapeHtml(teacher)}</div>
      <div><strong>Course / Program</strong>${escapeHtml(settings.courseProgram || "—")}</div>
      <div><strong>Group</strong>${escapeHtml(groupName)}</div>
      <div><strong>Block / Unit</strong>${escapeHtml(blockName)}</div>
      <div><strong>Parallel groups</strong>${escapeHtml(settings.parallels || "—")}</div>
      <div><strong>Students</strong>${students.length}</div>
    </div>

    <div class="report-legend">
      ${config.criteria.map((criterion) =>
        `<span><strong>${escapeHtml(reportCriterionLabel(criterion))}</strong> = ${escapeHtml(criterion.name)} (${formatNumber(criterion.weight)}%)</span>`
      ).join("")}
      <span><strong>Total</strong> = total weighted points obtained</span>
    </div>

    <table class="report-table">
      <thead>
        <tr>
          <th>No.</th>
          <th class="name">Full Name</th>
          ${config.criteria.map((criterion) => `<th>${escapeHtml(reportCriterionLabel(criterion))}</th>`).join("")}
          <th>TOTAL</th>
          ${settings.includeSignature ? "<th>Signature</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="${config.criteria.length + (settings.includeSignature ? 4 : 3)}">No students in this group.</td></tr>`}
      </tbody>
    </table>

    <div class="report-footer">
      <div class="signature-line">Teacher name and signature</div>
      <div class="signature-line">Approval / Department</div>
    </div>
  `;
}

async function saveReportSettings() {
  const groupName = currentGroupName();
  if (!groupName) {
    reportStatus.textContent = "Select a group first.";
    return;
  }

  await update(ref(db, `groups/${groupName}/reportSettings`), currentReportSettings());
  reportStatus.textContent = "Report setup saved for this group.";
}

reportGroupSelect.addEventListener("change", () => {
  applyReportSettings(currentGroup());
  renderBlockOptions();
});

reportBlockSelect.addEventListener("change", renderReport);
[
  reportTitleInput,
  reportOrganizationInput,
  reportDepartmentInput,
  reportPeriodInput,
  reportCourseInput,
  reportParallelsInput,
  reportSignatureSelect
].forEach((control) => {
  control.addEventListener("input", renderReport);
  control.addEventListener("change", renderReport);
});

saveReportSettingsBtn.addEventListener("click", saveReportSettings);
printReportBtn.addEventListener("click", () => window.print());

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = visibleGroups(snapshot.val() || {});
  renderGroupOptions();
  renderReport();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderReport();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderReport();
});

onValue(ref(db, "assignmentSubmissions"), (snapshot) => {
  submissionsCache = snapshot.val() || {};
  renderReport();
});
