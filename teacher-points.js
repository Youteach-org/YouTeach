import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const manualStudentSearch = document.getElementById("manualStudentSearch");
const manualStudentSelect = document.getElementById("manualStudentSelect");
const manualBlockSelect = document.getElementById("manualBlockSelect");
const manualStudentPreview = document.getElementById("manualStudentPreview");
const manualExamTypeSelect = document.getElementById("manualExamTypeSelect");
const manualExamPointsInput = document.getElementById("manualExamPointsInput");
const saveExamExactBtn = document.getElementById("saveExamExactBtn");
const addExamDeltaBtn = document.getElementById("addExamDeltaBtn");

const activeBlockSelect = document.getElementById("activeBlockSelect");
const saveBlockBtn = document.getElementById("saveBlockBtn");
const closeBlockBtn = document.getElementById("closeBlockBtn");
const reopenBlockBtn = document.getElementById("reopenBlockBtn");
const exportBlockSelect = document.getElementById("exportBlockSelect");
const exportGroupSelect = document.getElementById("exportGroupSelect");
const exportBlockBtn = document.getElementById("exportBlockBtn");
const currentBlockLabel = document.getElementById("currentBlockLabel");
const currentBlockStatusLabel = document.getElementById("currentBlockStatusLabel");

const examImportFile = document.getElementById("examImportFile");
const importBlockSelect = document.getElementById("importBlockSelect");
const importModeSelect = document.getElementById("importModeSelect");
const importExamScoresBtn = document.getElementById("importExamScoresBtn");
const importResultBox = document.getElementById("importResultBox");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);
menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

let studentsCache = {};
let settingsCache = {};
let activeBlockCache = "Block 1";
let groupsCache = {};

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeHeader(text) {
  return normalizeText(text).replace(/[^a-z0-9]/g, "");
}

function getDisplayName(student) {
  return student.fullName || student.name || student.nickname || "";
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

function getExtraPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function getOfficialPointsForBlock(student, blockName) {
  const examPoints = ensureExamPointsObject(student);
  return Number(examPoints[blockName]?.written || 0)
    + Number(examPoints[blockName]?.oral || 0)
    + Number(examPoints[blockName]?.verbs || 0);
}

function getTotalPointsForBlock(student, blockName) {
  return getOfficialPointsForBlock(student, blockName) + getExtraPoints(student, blockName);
}

function isBlockClosed(blockName) {
  return Boolean(settingsCache?.closedBlocks?.[blockName]);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
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

function renderExportGroups() {
  const groups = getAllGroupNames();
  exportGroupSelect.innerHTML =
    '<option value="">All groups</option>' +
    groups.map((groupName) => `<option value="${groupName}">${groupName}</option>`).join("");
}

function renderManualOptions() {
  const query = normalizeText(manualStudentSearch.value);

  const entries = Object.entries(studentsCache || {}).filter(([, student]) => {
    const searchable = normalizeText([
      getDisplayName(student),
      student.nickname || "",
      student.studentNumber || "",
      student.id || "",
      student.groupName || ""
    ].join(" "));

    return !query || searchable.includes(query);
  });

  manualStudentSelect.innerHTML =
    `<option value="">Select a student</option>` +
    entries.map(([key, student]) => `
      <option value="${key}">
        ${(student.nickname || getDisplayName(student) || "")} | ${student.studentNumber || "No ID"} | ${student.groupName || "No group"}
      </option>
    `).join("");

  renderManualPreview();
}

function renderManualPreview() {
  const studentKey = manualStudentSelect.value;

  if (!studentKey || !studentsCache[studentKey]) {
    manualStudentPreview.innerHTML = "No student selected.";
    return;
  }

  const student = studentsCache[studentKey];
  const selectedBlock = manualBlockSelect.value;
  const examPoints = ensureExamPointsObject(student);
  const officialPoints = getOfficialPointsForBlock(student, selectedBlock);
  const extraPoints = getExtraPoints(student, selectedBlock);
  const totalPoints = getTotalPointsForBlock(student, selectedBlock);

  manualStudentPreview.innerHTML = `
    <strong>${getDisplayName(student)}</strong><br>
    Nickname: ${student.nickname || ""}<br>
    External ID: ${student.studentNumber || ""}<br>
    Internal ID: ${student.id || ""}<br>
    Group: ${student.groupName || ""}<br>
    Written Exam: ${examPoints[selectedBlock].written}<br>
    Oral Exam: ${examPoints[selectedBlock].oral}<br>
    Verb Exam: ${examPoints[selectedBlock].verbs}<br>
    Official Points in ${selectedBlock}: ${officialPoints}<br>
    Extra Points in ${selectedBlock}: ${extraPoints}<br>
    Total Block Points in ${selectedBlock}: ${totalPoints}<br>
    Block Status: ${isBlockClosed(selectedBlock) ? "CLOSED" : "OPEN"}
  `;
}

function renderBlockInfo() {
  currentBlockLabel.textContent = `Current active block: ${activeBlockCache}`;
  currentBlockStatusLabel.textContent = `Current block status: ${isBlockClosed(activeBlockCache) ? "CLOSED" : "OPEN"}`;
  activeBlockSelect.value = activeBlockCache;
  exportBlockSelect.value = activeBlockCache;
  manualBlockSelect.value = activeBlockCache;
  importBlockSelect.value = activeBlockCache;
}

function exportBlock(selectedBlock, selectedGroup) {
  const students = Object.entries(studentsCache || {})
    .filter(([, student]) => !selectedGroup || (student.groupName || "") === selectedGroup)
    .sort((a, b) => getDisplayName(a[1]).localeCompare(getDisplayName(b[1])));

  if (!students.length) {
    alert("No students available to export.");
    return;
  }

  const lines = [[
    "internalId",
    "externalId",
    "nickname",
    "fullName",
    "group",
    "block",
    "written",
    "oral",
    "verbs",
    "officialPoints",
    "extraPoints",
    "totalBlockPoints"
  ].join(",")];

  for (const [, student] of students) {
    const examPoints = ensureExamPointsObject(student);
    const officialPoints = getOfficialPointsForBlock(student, selectedBlock);
    const extraPoints = getExtraPoints(student, selectedBlock);
    const totalBlockPoints = officialPoints + extraPoints;

    lines.push([
      escapeCsv(student.id || ""),
      escapeCsv(student.studentNumber || ""),
      escapeCsv(student.nickname || ""),
      escapeCsv(getDisplayName(student)),
      escapeCsv(student.groupName || ""),
      escapeCsv(selectedBlock),
      escapeCsv(examPoints[selectedBlock].written || 0),
      escapeCsv(examPoints[selectedBlock].oral || 0),
      escapeCsv(examPoints[selectedBlock].verbs || 0),
      escapeCsv(officialPoints || 0),
      escapeCsv(extraPoints || 0),
      escapeCsv(totalBlockPoints || 0)
    ].join(","));
  }

  const groupSuffix = selectedGroup ? `_${selectedGroup.replace(/\s+/g, "_")}` : "_all_groups";
  downloadTextFile(`${selectedBlock.replace(/\s+/g, "_").toLowerCase()}${groupSuffix}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
}

async function updateExamPointsForStudent(studentKey, blockName, examType, value, mode) {
  if (!studentKey || !studentsCache[studentKey]) {
    alert("Select a student first.");
    return false;
  }

  if (!["written", "oral", "verbs"].includes(examType)) {
    alert("Invalid exam type.");
    return false;
  }

  if (!Number.isFinite(value)) {
    alert("Enter a valid number.");
    return false;
  }

  const student = studentsCache[studentKey];
  const examPoints = ensureExamPointsObject(student);
  const currentValue = Number(examPoints[blockName][examType] || 0);
  examPoints[blockName][examType] = mode === "add" ? currentValue + value : value;

  await update(ref(db, `students/${studentKey}`), { examPoints });
  manualExamPointsInput.value = "";
  alert("Exam score updated.");
  return true;
}

function normalizeRecord(row) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });
  return normalized;
}

function getRecordValue(record, candidates) {
  for (const candidate of candidates) {
    const value = record[normalizeHeader(candidate)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function hasRecordField(record, candidates) {
  return candidates.some((candidate) => Object.prototype.hasOwnProperty.call(record, normalizeHeader(candidate)));
}

function findStudentKeyFromRecord(record) {
  const externalId = normalizeText(getRecordValue(record, ["externalId", "studentNumber", "external", "matricula"]));
  const internalId = normalizeText(getRecordValue(record, ["internalId", "id", "internal"]));
  const nickname = normalizeText(getRecordValue(record, ["nickname", "nick"]));
  const fullName = normalizeText(getRecordValue(record, ["fullName", "fullname", "full name", "name"]));

  for (const [studentKey, student] of Object.entries(studentsCache || {})) {
    if (externalId && normalizeText(student.studentNumber) === externalId) return studentKey;
    if (internalId && normalizeText(student.id) === internalId) return studentKey;
    if (nickname && normalizeText(student.nickname) === nickname) return studentKey;
    if (fullName && normalizeText(getDisplayName(student)) === fullName) return studentKey;
  }

  return "";
}

async function importExamScores() {
  const file = examImportFile.files?.[0];
  if (!file) {
    alert("Choose a CSV or Excel file first.");
    return;
  }

  if (!window.XLSX) {
    alert("Excel library not loaded. Reload the page and try again.");
    return;
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    alert("The file does not contain sheets.");
    return;
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  if (!rows.length) {
    alert("No rows found in the selected file.");
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const failures = [];
  const seenStudents = new Set();
  const mode = importModeSelect.value || "replace";
  const fallbackBlock = importBlockSelect.value || "Block 1";

  for (let index = 0; index < rows.length; index += 1) {
    const rawRow = rows[index];
    const record = normalizeRecord(rawRow);
    const studentKey = findStudentKeyFromRecord(record);

    if (!studentKey || !studentsCache[studentKey]) {
      failCount += 1;
      failures.push(`Row ${index + 2}: student not found`);
      continue;
    }

    const dedupeKey = `${studentKey}::${String(getRecordValue(record, ["block"]) || fallbackBlock).trim() || fallbackBlock}`;
    if (seenStudents.has(dedupeKey)) {
      failCount += 1;
      failures.push(`Row ${index + 2}: duplicate student/block in same import`);
      continue;
    }
    seenStudents.add(dedupeKey);

    const student = studentsCache[studentKey];
    const blockName = String(getRecordValue(record, ["block"]) || fallbackBlock).trim() || fallbackBlock;
    const examPoints = ensureExamPointsObject(student);

    const hasWritten = hasRecordField(record, ["written", "writtenExam", "escrito"]);
    const hasOral = hasRecordField(record, ["oral", "oralExam"]);
    const hasVerbs = hasRecordField(record, ["verbs", "verbsExam", "verbexam", "verbos"]);

    if (!hasWritten && !hasOral && !hasVerbs) {
      failCount += 1;
      failures.push(`Row ${index + 2}: no exam columns found`);
      continue;
    }

    const writtenValue = Number(getRecordValue(record, ["written", "writtenExam", "escrito"]) || 0);
    const oralValue = Number(getRecordValue(record, ["oral", "oralExam"]) || 0);
    const verbsValue = Number(getRecordValue(record, ["verbs", "verbsExam", "verbexam", "verbos"]) || 0);

    if ((hasWritten && !Number.isFinite(writtenValue)) || (hasOral && !Number.isFinite(oralValue)) || (hasVerbs && !Number.isFinite(verbsValue))) {
      failCount += 1;
      failures.push(`Row ${index + 2}: invalid numeric value`);
      continue;
    }

    if (!examPoints[blockName]) {
      examPoints[blockName] = { written: 0, oral: 0, verbs: 0 };
    }

    if (hasWritten) {
      examPoints[blockName].written = mode === "add"
        ? Number(examPoints[blockName].written || 0) + writtenValue
        : writtenValue;
    }

    if (hasOral) {
      examPoints[blockName].oral = mode === "add"
        ? Number(examPoints[blockName].oral || 0) + oralValue
        : oralValue;
    }

    if (hasVerbs) {
      examPoints[blockName].verbs = mode === "add"
        ? Number(examPoints[blockName].verbs || 0) + verbsValue
        : verbsValue;
    }

    await update(ref(db, `students/${studentKey}`), { examPoints });
    successCount += 1;
  }

  importResultBox.innerHTML = `
    <strong>Import finished.</strong><br>
    Success: ${successCount}<br>
    Failed: ${failCount}
    ${failures.length ? `<br><br>${failures.slice(0, 10).join("<br>")}` : ""}
  `;

  if (failCount) {
    alert(`Import finished. Success: ${successCount}. Failed: ${failCount}.`);
  } else {
    alert(`Import finished successfully. Rows updated: ${successCount}.`);
  }

  examImportFile.value = "";
}

saveExamExactBtn.addEventListener("click", async () => {
  const studentKey = manualStudentSelect.value;
  const blockName = manualBlockSelect.value;
  const examType = manualExamTypeSelect.value;
  const value = Number(manualExamPointsInput.value);
  await updateExamPointsForStudent(studentKey, blockName, examType, value, "replace");
});

addExamDeltaBtn.addEventListener("click", async () => {
  const studentKey = manualStudentSelect.value;
  const blockName = manualBlockSelect.value;
  const examType = manualExamTypeSelect.value;
  const value = Number(manualExamPointsInput.value);
  await updateExamPointsForStudent(studentKey, blockName, examType, value, "add");
});

saveBlockBtn.addEventListener("click", async () => {
  await update(ref(db, "settings"), { activeBlock: activeBlockSelect.value });
  alert("Active block updated.");
});

closeBlockBtn.addEventListener("click", async () => {
  await update(ref(db, "settings/closedBlocks"), { [activeBlockCache]: true });
  alert("Block closed.");
});

reopenBlockBtn.addEventListener("click", async () => {
  await update(ref(db, "settings/closedBlocks"), { [activeBlockCache]: false });
  alert("Block reopened.");
});

exportBlockBtn.addEventListener("click", () => {
  exportBlock(exportBlockSelect.value, exportGroupSelect.value);
});

importExamScoresBtn.addEventListener("click", importExamScores);
manualStudentSearch.addEventListener("input", renderManualOptions);
manualStudentSelect.addEventListener("change", renderManualPreview);
manualBlockSelect.addEventListener("change", renderManualPreview);

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderManualOptions();
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderExportGroups();
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  activeBlockCache = settingsCache.activeBlock || "Block 1";
  renderBlockInfo();
  renderManualPreview();
});