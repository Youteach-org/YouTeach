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
const extraImportFile = document.getElementById("extraImportFile");
const extraImportMode = document.getElementById("extraImportMode");
const importExtraFileBtn = document.getElementById("importExtraFileBtn");
const extraImportTextarea = document.getElementById("extraImportTextarea");
const extraPasteMode = document.getElementById("extraPasteMode");
const importExtraTextBtn = document.getElementById("importExtraTextBtn");
const studentsImportResultBox = document.getElementById("studentsImportResultBox");

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

function normalizeHeader(text) {
  return normalizeText(text).replace(/[^a-z0-9]/g, "");
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

  if (!selectedGroup || !groups.includes(selectedGroup)) {
    selectedGroup = groups[0];
  }

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

function hasField(record, candidates) {
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

async function processExtraRows(rows, mode) {
  const seenStudents = new Set();
  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (let index = 0; index < rows.length; index += 1) {
    const record = normalizeRecord(rows[index]);
    const studentKey = findStudentKeyFromRecord(record);

    if (!studentKey || !studentsCache[studentKey]) {
      failCount += 1;
      failures.push(`Row ${index + 2}: student not found`);
      continue;
    }

    if (seenStudents.has(studentKey)) {
      failCount += 1;
      failures.push(`Row ${index + 2}: duplicate student in same import`);
      continue;
    }
    seenStudents.add(studentKey);

    const hasAnyBlock = hasField(record, ["block1", "block 1"]) || hasField(record, ["block2", "block 2"]) || hasField(record, ["block3", "block 3"]);
    if (!hasAnyBlock) {
      failCount += 1;
      failures.push(`Row ${index + 2}: no block columns found`);
      continue;
    }

    const student = studentsCache[studentKey];
    const blockPoints = {
      "Block 1": getExtraPoints(student, "Block 1"),
      "Block 2": getExtraPoints(student, "Block 2"),
      "Block 3": getExtraPoints(student, "Block 3")
    };

    const updates = [];

    const blockMap = [
      { label: "Block 1", keys: ["block1", "block 1"] },
      { label: "Block 2", keys: ["block2", "block 2"] },
      { label: "Block 3", keys: ["block3", "block 3"] }
    ];

    let rowHasChange = false;
    let invalidNumeric = false;

    for (const block of blockMap) {
      if (!hasField(record, block.keys)) {
        continue;
      }

      const rawValue = getRecordValue(record, block.keys);
      if (String(rawValue).trim() === "") {
        continue;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        invalidNumeric = true;
        break;
      }

      blockPoints[block.label] = mode === "add"
        ? Number(blockPoints[block.label] || 0) + numericValue
        : numericValue;

      rowHasChange = true;
      updates.push(`${block.label}=${blockPoints[block.label]}`);
    }

    if (invalidNumeric) {
      failCount += 1;
      failures.push(`Row ${index + 2}: invalid numeric value`);
      continue;
    }

    if (!rowHasChange) {
      failCount += 1;
      failures.push(`Row ${index + 2}: no valid block values`);
      continue;
    }

    await update(ref(db, `students/${studentKey}`), { blockPoints });
    successCount += 1;
  }

  studentsImportResultBox.innerHTML = `
    <strong>Import finished.</strong><br>
    Success: ${successCount}<br>
    Failed: ${failCount}
    ${failures.length ? `<br><br>${failures.slice(0, 12).join("<br>")}` : ""}
  `;

  if (failCount) {
    alert(`Import finished. Success: ${successCount}. Failed: ${failCount}.`);
  } else {
    alert(`Import finished successfully. Rows updated: ${successCount}.`);
  }
}

async function importExtraFile() {
  const file = extraImportFile.files?.[0];
  if (!file) {
    alert("Choose a CSV or Excel file first.");
    return;
  }

  if (!window.XLSX) {
    alert("Excel library not loaded.");
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

  await processExtraRows(rows, extraImportMode.value || "replace");
  extraImportFile.value = "";
}

function parseCsvText(text) {
  const workbook = window.XLSX.read(text, { type: "string" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

async function importExtraText() {
  const text = extraImportTextarea.value.trim();
  if (!text) {
    alert("Paste a CSV-like list first.");
    return;
  }

  if (!window.XLSX) {
    alert("Excel library not loaded.");
    return;
  }

  const rows = parseCsvText(text);
  if (!rows.length) {
    alert("No rows found in pasted content.");
    return;
  }

  await processExtraRows(rows, extraPasteMode.value || "replace");
  extraImportTextarea.value = "";
}

groupFilter.addEventListener("change", () => {
  selectedGroup = groupFilter.value || "";
  renderStudents();
});

searchStudentInput.addEventListener("input", renderStudents);
importExtraFileBtn.addEventListener("click", importExtraFile);
importExtraTextBtn.addEventListener("click", importExtraText);

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