import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { evaluationBlockNames, groupEvaluationConfig } from "./group-evaluation-model.js";

requireTeacherAuth();

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const gradeBlockSelect = document.getElementById("gradeBlockSelect");
const gradesPasteBox = document.getElementById("gradesPasteBox");
const previewGradesBtn = document.getElementById("previewGradesBtn");
const saveGradesBtn = document.getElementById("saveGradesBtn");
const clearGradesBtn = document.getElementById("clearGradesBtn");

const gradesSummaryBox = document.getElementById("gradesSummaryBox");
const gradesPreviewBody = document.getElementById("gradesPreviewBody");
const manualCriterionGroupSelect = document.getElementById("manualCriterionGroupSelect");
const manualCriterionBlockSelect = document.getElementById("manualCriterionBlockSelect");
const manualCriterionSelect = document.getElementById("manualCriterionSelect");
const manualCriterionStudentSelect = document.getElementById("manualCriterionStudentSelect");
const manualCriterionScoreInput = document.getElementById("manualCriterionScoreInput");
const manualCriterionHelp = document.getElementById("manualCriterionHelp");
const saveManualCriterionScoreBtn = document.getElementById("saveManualCriterionScoreBtn");
const exportBlockSelect = document.getElementById("exportBlockSelect");
const exportGroupSelect = document.getElementById("exportGroupSelect");
const exportGradesBtn = document.getElementById("exportGradesBtn");
const deleteBlockSelect = document.getElementById("deleteBlockSelect");
const deleteGroupSelect = document.getElementById("deleteGroupSelect");
const deleteGradesBtn = document.getElementById("deleteGradesBtn");
const deleteGradesResultBox = document.getElementById("deleteGradesResultBox");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let groupsCache = {};
let settingsCache = {};
let parsedRowsCache = [];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function parseNumber(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

function getDisplayName(student) {
  return student?.fullName || student?.name || student?.nickname || "";
}

function getStudentExternalId(student) {
  return student?.studentNumber || student?.externalId || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function maxConfiguredUnitCount() {
  const configuredCounts = Object.values(groupsCache || {})
    .map((group) => groupEvaluationConfig(group))
    .filter((config) => config.configured)
    .map((config) => config.unitCount);
  return Math.max(3, ...configuredCounts);
}

function blockNamesForGroup(groupName = "") {
  if (groupName && groupsCache?.[groupName]) {
    const config = groupEvaluationConfig(groupsCache[groupName]);
    if (config.configured) return evaluationBlockNames(groupsCache[groupName]);
  }
  return Array.from({ length: maxConfiguredUnitCount() }, (_, index) => `Block ${index + 1}`);
}

function replaceBlockOptions(select, blockNames, fallback = "Block 1") {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = blockNames
    .map((blockName) => `<option value="${escapeHtml(blockName)}">${escapeHtml(blockName)}</option>`)
    .join("");
  select.value = blockNames.includes(previous)
    ? previous
    : (blockNames.includes(fallback) ? fallback : blockNames[0] || "");
}

function renderBlockSelectors() {
  const activeBlock = settingsCache.activeBlock || "Block 1";
  replaceBlockOptions(gradeBlockSelect, blockNamesForGroup(), activeBlock);
  replaceBlockOptions(exportBlockSelect, blockNamesForGroup(exportGroupSelect.value || ""), activeBlock);
  replaceBlockOptions(deleteBlockSelect, blockNamesForGroup(deleteGroupSelect?.value || ""), activeBlock);
}

function renderExportGroups() {
  const groups = getAllGroupNames();
  const previousExportGroup = exportGroupSelect.value;
  const previousDeleteGroup = deleteGroupSelect?.value || "";
  const options =
    '<option value="">All groups</option>' +
    groups.map((groupName) => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)}</option>`).join("");

  exportGroupSelect.innerHTML = options;
  if (groups.includes(previousExportGroup)) exportGroupSelect.value = previousExportGroup;

  if (deleteGroupSelect) {
    deleteGroupSelect.innerHTML = options;
    if (groups.includes(previousDeleteGroup)) deleteGroupSelect.value = previousDeleteGroup;
  }

  renderBlockSelectors();
}

function renderManualCriterionGroups() {
  const previous = manualCriterionGroupSelect.value;
  const groups = getAllGroupNames();
  manualCriterionGroupSelect.innerHTML =
    '<option value="">Select group</option>' +
    groups.map((groupName) => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)}</option>`).join("");
  if (groups.includes(previous)) manualCriterionGroupSelect.value = previous;
  renderManualCriterionContext();
}

function renderManualCriterionContext() {
  const groupName = manualCriterionGroupSelect.value || "";
  const group = groupsCache?.[groupName] || null;
  const config = groupEvaluationConfig(group || {});

  const blocks = group && config.configured ? evaluationBlockNames(group) : ["Block 1"];
  replaceBlockOptions(manualCriterionBlockSelect, blocks, settingsCache.activeBlock || "Block 1");

  const manualCriteria = config.configured
    ? config.criteria.filter((criterion) => criterion.source === "manual")
    : [];

  const previousCriterion = manualCriterionSelect.value;
  manualCriterionSelect.innerHTML =
    '<option value="">Select manual criterion</option>' +
    manualCriteria.map((criterion) =>
      `<option value="${escapeHtml(criterion.id)}">${escapeHtml(criterion.name)} · ${criterion.weight}%</option>`
    ).join("");
  if (manualCriteria.some((criterion) => criterion.id === previousCriterion)) {
    manualCriterionSelect.value = previousCriterion;
  }

  const previousStudent = manualCriterionStudentSelect.value;
  const students = Object.entries(studentsCache || {})
    .filter(([, student]) => String(student?.groupName || "") === groupName)
    .sort((a, b) => getDisplayName(a[1]).localeCompare(getDisplayName(b[1]), undefined, { sensitivity: "base" }));

  manualCriterionStudentSelect.innerHTML =
    '<option value="">Select student</option>' +
    students.map(([studentKey, student]) =>
      `<option value="${escapeHtml(studentKey)}">${escapeHtml(getDisplayName(student))}</option>`
    ).join("");
  if (students.some(([studentKey]) => studentKey === previousStudent)) {
    manualCriterionStudentSelect.value = previousStudent;
  }

  if (!groupName) {
    manualCriterionHelp.textContent = "Select a group first.";
  } else if (!config.configured) {
    manualCriterionHelp.textContent = "This group needs a valid evaluation setup.";
  } else if (!manualCriteria.length) {
    manualCriterionHelp.textContent =
      "This group has no criteria using Manual / imported criterion score.";
  } else {
    manualCriterionHelp.textContent =
      "Enter the student's raw score from 0 to 100. YouTeach applies the criterion percentage automatically.";
  }
}

async function saveManualCriterionScore() {
  const groupName = manualCriterionGroupSelect.value || "";
  const blockName = manualCriterionBlockSelect.value || "";
  const criterionId = manualCriterionSelect.value || "";
  const studentKey = manualCriterionStudentSelect.value || "";
  const score = Number(manualCriterionScoreInput.value);

  if (!groupName || !blockName || !criterionId || !studentKey) {
    alert("Select group, block, criterion, and student.");
    return;
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    alert("Enter a score from 0 to 100.");
    return;
  }

  await update(ref(db), {
    [`students/${studentKey}/evaluationCriterionScores/${blockName}/${criterionId}`]: Number(score.toFixed(2))
  });
  manualCriterionScoreInput.value = "";
  alert("Criterion score saved.");
}

function findStudent(id, fullName) {
  const cleanId = normalizeText(id);
  const cleanName = normalizeText(fullName);

  for (const [studentKey, student] of Object.entries(studentsCache || {})) {
    const studentId = normalizeText(getStudentExternalId(student));
    const studentName = normalizeText(getDisplayName(student));

    if (cleanId && studentId === cleanId) {
      return { studentKey, student };
    }

    if (cleanName && studentName === cleanName) {
      return { studentKey, student };
    }
  }

  return { studentKey: "", student: null };
}

function rowLooksLikeHeader(cells) {
  const normalized = cells.map((cell) => normalizeText(cell).replace(/[^a-z0-9]/g, ""));
  return normalized.includes("e") ||
    normalized.includes("eo") ||
    normalized.includes("ev") ||
    normalized.includes("total") ||
    normalized.includes("nombre") ||
    normalized.includes("name");
}

function normalizePastedText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .map((line) => line.includes("\t") ? line.split("\t") : line.split(","));
}

function rowsFromWorksheetRows(rows) {
  return rows.map((row) => [
    row[0] ?? "",
    row[1] ?? "",
    row[2] ?? "",
    row[3] ?? "",
    row[4] ?? "",
    row[5] ?? "",
    row[6] ?? "",
    row[7] ?? "",
    row[8] ?? ""
  ]);
}

function parseGradeRows(rawRows) {
  const rows = rawRows.length && rowLooksLikeHeader(rawRows[0]) ? rawRows.slice(1) : rawRows;
  const blockName = gradeBlockSelect.value || "Block 1";

  return rows.map((row, index) => {
    const id = cleanCell(row[0]);
    const fullName = cleanCell(row[1]);
    const written = parseNumber(row[2]);
    const oral = parseNumber(row[3]);
    const verbs = parseNumber(row[4]);
    const points = parseNumber(row[5]);
    const attendance = parseNumber(row[6]);
    const task = parseNumber(row[7]);
    const uploadedTotal = parseNumber(row[8]);

    const match = findStudent(id, fullName);
    const student = match.student;
    const hasExisting = Boolean(
      student &&
      (
        student?.examPoints?.[blockName] ||
        student?.blockPoints?.[blockName] !== undefined ||
        student?.attendancePoints?.[blockName] !== undefined ||
        student?.taskPoints?.[blockName] !== undefined
      )
    );

    const calculatedTotal =
      (Number.isFinite(written) ? written : 0) +
      (Number.isFinite(oral) ? oral : 0) +
      (Number.isFinite(verbs) ? verbs : 0) +
      (Number.isFinite(points) ? points : 0) +
      (Number.isFinite(attendance) ? attendance : 0) +
      (Number.isFinite(task) ? task : 0);

    const hasBadNumber = [written, oral, verbs, points, attendance, task, uploadedTotal].some((value) => !Number.isFinite(value));

    return {
      rowNumber: index + 1,
      id,
      fullName,
      written,
      oral,
      verbs,
      points,
      attendance,
      task,
      uploadedTotal,
      calculatedTotal,
      studentKey: match.studentKey,
      matchedName: student ? getDisplayName(student) : "",
      hasExisting,
      hasBadNumber
    };
  });
}

function renderPreview(rows) {
  parsedRowsCache = rows;

  if (!rows.length) {
    gradesPreviewBody.innerHTML = '<tr><td colspan="11">No rows found.</td></tr>';
    gradesSummaryBox.textContent = "No rows found.";
    return;
  }

  const successRows = rows.filter((row) => row.studentKey && !row.hasBadNumber);
  const existingRows = successRows.filter((row) => row.hasExisting);
  const errorRows = rows.filter((row) => !row.studentKey || row.hasBadNumber);

  gradesSummaryBox.innerHTML = `
    Rows: ${rows.length}<br>
    Ready to save: ${successRows.length}<br>
    Existing grades detected: ${existingRows.length}<br>
    Errors: ${errorRows.length}
  `;

  gradesPreviewBody.innerHTML = rows.map((row) => {
    let status = '<span class="status-pill status-new">NEW</span>';

    if (row.hasBadNumber || !row.studentKey) {
      status = '<span class="status-pill status-error">ERROR</span>';
    } else if (row.hasExisting) {
      status = '<span class="status-pill status-existing">EXISTS</span>';
    }

    return `
      <tr>
        <td>${status}</td>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.fullName)}</td>
        <td>${Number.isFinite(row.written) ? row.written : "ERROR"}</td>
        <td>${Number.isFinite(row.oral) ? row.oral : "ERROR"}</td>
        <td>${Number.isFinite(row.verbs) ? row.verbs : "ERROR"}</td>
        <td>${Number.isFinite(row.points) ? row.points : "ERROR"}</td>
        <td>${Number.isFinite(row.attendance) ? row.attendance : "ERROR"}</td>
        <td>${Number.isFinite(row.task) ? row.task : "ERROR"}</td>
        <td>${Number.isFinite(row.uploadedTotal) ? row.uploadedTotal : ""}</td>
        <td>${row.studentKey ? escapeHtml(row.matchedName) : "Student not found"}</td>
      </tr>
    `;
  }).join("");
}

function previewPastedGrades() {
  const rawRows = normalizePastedText(gradesPasteBox.value);
  const parsedRows = parseGradeRows(rawRows);
  renderPreview(parsedRows);
}

async function saveGrades() {
  if (!parsedRowsCache.length) {
    previewPastedGrades();
  }

  const validRows = parsedRowsCache.filter((row) => row.studentKey && !row.hasBadNumber);
  const existingRows = validRows.filter((row) => row.hasExisting);
  const blockName = gradeBlockSelect.value || "Block 1";

  if (!validRows.length) {
    alert("There are no valid rows to save.");
    return;
  }

  if (existingRows.length) {
    const replace = confirm(`${existingRows.length} students already have grades for ${blockName}. Replace them with the new values?`);
    if (!replace) return;
  }

  const updates = {};

  validRows.forEach((row) => {
    updates[`students/${row.studentKey}/examPoints/${blockName}/written`] = row.written;
    updates[`students/${row.studentKey}/examPoints/${blockName}/oral`] = row.oral;
    updates[`students/${row.studentKey}/examPoints/${blockName}/verbs`] = row.verbs;
    updates[`students/${row.studentKey}/blockPoints/${blockName}`] = row.points;
    updates[`students/${row.studentKey}/attendancePoints/${blockName}`] = row.attendance;
    updates[`students/${row.studentKey}/taskPoints/${blockName}`] = row.task;
  });

  await update(ref(db), updates);

  alert(`Grades saved for ${validRows.length} students.`);
  renderPreview(parseGradeRows(normalizePastedText(gradesPasteBox.value)));
}

function clearGrades() {
  gradesPasteBox.value = "";
  parsedRowsCache = [];
  gradesSummaryBox.textContent = "Paste grades or upload a file, then preview.";
  gradesPreviewBody.innerHTML = '<tr><td colspan="11">No preview yet.</td></tr>';
}


async function deleteGradesByBlock() {
  const blockName = deleteBlockSelect?.value || "Block 1";
  const selectedGroup = deleteGroupSelect?.value || "";

  const targetStudents = Object.entries(studentsCache || {})
    .filter(([, student]) => !selectedGroup || (student.groupName || "") === selectedGroup);

  if (!targetStudents.length) {
    alert("No students found for that selection.");
    return;
  }

  const confirmMessage = selectedGroup
    ? `Delete grades for ${blockName} in group ${selectedGroup}? This removes E, E.O, E.V, P, A, and T.`
    : `Delete grades for ${blockName} in ALL groups? This removes E, E.O, E.V, P, A, and T.`;

  if (!confirm(confirmMessage)) return;

  const secondConfirm = prompt('Type DELETE to confirm:');
  if (secondConfirm !== "DELETE") {
    alert("Deletion cancelled.");
    return;
  }

  const updates = {};

  targetStudents.forEach(([studentKey]) => {
    updates[`students/${studentKey}/examPoints/${blockName}`] = null;
    updates[`students/${studentKey}/blockPoints/${blockName}`] = null;
    updates[`students/${studentKey}/attendancePoints/${blockName}`] = null;
    updates[`students/${studentKey}/taskPoints/${blockName}`] = null;
  });

  await update(ref(db), updates);

  if (deleteGradesResultBox) {
    deleteGradesResultBox.innerHTML = `
      <strong>Deleted grades.</strong><br>
      Block: ${blockName}<br>
      Group: ${selectedGroup || "All groups"}<br>
      Students affected: ${targetStudents.length}
    `;
  }

  alert(`Deleted ${blockName} grades for ${targetStudents.length} students.`);
}

function exportGrades() {
  const blockName = exportBlockSelect.value || settingsCache.activeBlock || "Block 1";
  const selectedGroup = exportGroupSelect.value || "";

  const students = Object.entries(studentsCache || {})
    .filter(([, student]) => !selectedGroup || (student.groupName || "") === selectedGroup)
    .sort((a, b) => getDisplayName(a[1]).localeCompare(getDisplayName(b[1])));

  if (!students.length) {
    alert("No students available to export.");
    return;
  }

  const lines = [["externalId", "fullName", "E", "E.O", "E.V", "P", "A", "T", "TOTAL"].join(",")];

  students.forEach(([, student]) => {
    const exam = student?.examPoints?.[blockName] || {};
    const written = Number(exam.written || 0);
    const oral = Number(exam.oral || 0);
    const verbs = Number(exam.verbs || 0);
    const points = Number(student?.blockPoints?.[blockName] || 0);
    const attendance = Number(student?.attendancePoints?.[blockName] || 0);
    const task = Number(student?.taskPoints?.[blockName] || 0);
    const total = written + oral + verbs + points + attendance + task;

    lines.push([
      escapeCsv(getStudentExternalId(student)),
      escapeCsv(getDisplayName(student)),
      escapeCsv(written),
      escapeCsv(oral),
      escapeCsv(verbs),
      escapeCsv(points),
      escapeCsv(attendance),
      escapeCsv(task),
      escapeCsv(total)
    ].join(","));
  });

  const groupSuffix = selectedGroup ? selectedGroup.replace(/\s+/g, "_") : "all_groups";
  downloadTextFile(`${blockName.replace(/\s+/g, "_").toLowerCase()}_${groupSuffix}_grades.csv`, lines.join("\n"));
}

manualCriterionGroupSelect.addEventListener("change", renderManualCriterionContext);
manualCriterionBlockSelect.addEventListener("change", renderManualCriterionContext);
saveManualCriterionScoreBtn.addEventListener("click", saveManualCriterionScore);

exportGroupSelect.addEventListener("change", renderBlockSelectors);
if (deleteGroupSelect) deleteGroupSelect.addEventListener("change", renderBlockSelectors);

previewGradesBtn.addEventListener("click", previewPastedGrades);
saveGradesBtn.addEventListener("click", saveGrades);
clearGradesBtn.addEventListener("click", clearGrades);
exportGradesBtn.addEventListener("click", exportGrades);
if (deleteGradesBtn) deleteGradesBtn.addEventListener("click", deleteGradesByBlock);

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderExportGroups();
  renderManualCriterionGroups();

  if (parsedRowsCache.length) {
    renderPreview(parsedRowsCache);
  }
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderExportGroups();
  renderBlockSelectors();
  renderManualCriterionGroups();
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  renderBlockSelectors();
  renderManualCriterionContext();
});