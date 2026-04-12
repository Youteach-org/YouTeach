import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const manualStudentSearch = document.getElementById("manualStudentSearch");
const manualStudentSelect = document.getElementById("manualStudentSelect");
const manualBlockSelect = document.getElementById("manualBlockSelect");
const manualPointsInput = document.getElementById("manualPointsInput");
const applyManualPointsBtn = document.getElementById("applyManualPointsBtn");
const manualStudentPreview = document.getElementById("manualStudentPreview");

const activeBlockSelect = document.getElementById("activeBlockSelect");
const saveBlockBtn = document.getElementById("saveBlockBtn");
const closeBlockBtn = document.getElementById("closeBlockBtn");
const reopenBlockBtn = document.getElementById("reopenBlockBtn");
const exportBlockSelect = document.getElementById("exportBlockSelect");
const exportBlockBtn = document.getElementById("exportBlockBtn");
const currentBlockLabel = document.getElementById("currentBlockLabel");
const currentBlockStatusLabel = document.getElementById("currentBlockStatusLabel");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let settingsCache = {};
let activeBlockCache = "Block 1";

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ensureBlockPointsObject(student) {
  return {
    "Block 1": Number(student?.blockPoints?.["Block 1"] || 0),
    "Block 2": Number(student?.blockPoints?.["Block 2"] || 0),
    "Block 3": Number(student?.blockPoints?.["Block 3"] || 0)
  };
}

function isBlockClosed(blockName) {
  return Boolean(settingsCache?.closedBlocks?.[blockName]);
}

function assertBlockOpen(blockName) {
  if (isBlockClosed(blockName)) {
    alert(`The block (${blockName}) is closed. Reopen it first.`);
    return false;
  }
  return true;
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

function renderManualOptions() {
  const query = normalizeText(manualStudentSearch.value);

  const entries = Object.entries(studentsCache || {}).filter(([, student]) => {
    const searchable = normalizeText([
      student.fullName || student.name || "",
      student.nickname || "",
      student.studentNumber || "",
      student.id || ""
    ].join(" "));
    return !query || searchable.includes(query);
  });

  manualStudentSelect.innerHTML =
    `<option value="">Select a student</option>` +
    entries.map(([key, student]) => `
      <option value="${key}">
        ${(student.nickname || student.fullName || student.name || "")} | ${student.studentNumber || "No number"} | ${student.id || ""}
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
  const blockPoints = ensureBlockPointsObject(student);

  manualStudentPreview.innerHTML = `
    <strong>${student.fullName || student.name || ""}</strong><br>
    Nickname: ${student.nickname || ""}<br>
    Student Number: ${student.studentNumber || ""}<br>
    Internal ID: ${student.id || ""}<br>
    Current Points in ${selectedBlock}: ${blockPoints[selectedBlock]}<br>
    Block Status: ${isBlockClosed(selectedBlock) ? "CLOSED" : "OPEN"}
  `;
}

function renderBlockInfo() {
  currentBlockLabel.textContent = `Current active block: ${activeBlockCache}`;
  currentBlockStatusLabel.textContent = `Current block status: ${isBlockClosed(activeBlockCache) ? "CLOSED" : "OPEN"}`;
  activeBlockSelect.value = activeBlockCache;
  exportBlockSelect.value = activeBlockCache;
  manualBlockSelect.value = activeBlockCache;
}

function exportBlock(selectedBlock) {
  const students = Object.entries(studentsCache || {}).sort((a, b) => {
    const nameA = a[1]?.fullName || a[1]?.name || "";
    const nameB = b[1]?.fullName || b[1]?.name || "";
    return nameA.localeCompare(nameB);
  });

  if (!students.length) {
    alert("No students available to export.");
    return;
  }

  const lines = [["internalId", "studentNumber", "nickname", "fullName", "block", "points"].join(",")];

  for (const [, student] of students) {
    const blockPoints = ensureBlockPointsObject(student);
    lines.push([
      escapeCsv(student.id || ""),
      escapeCsv(student.studentNumber || ""),
      escapeCsv(student.nickname || ""),
      escapeCsv(student.fullName || student.name || ""),
      escapeCsv(selectedBlock),
      escapeCsv(blockPoints[selectedBlock] || 0)
    ].join(","));
  }

  downloadTextFile(`${selectedBlock.replace(/\s+/g, "_").toLowerCase()}_points.csv`, lines.join("\n"), "text/csv;charset=utf-8");
}

applyManualPointsBtn.addEventListener("click", async () => {
  const studentKey = manualStudentSelect.value;
  const blockName = manualBlockSelect.value;
  const delta = Number(manualPointsInput.value);

  if (!studentKey || !studentsCache[studentKey]) {
    alert("Select a student first.");
    return;
  }

  if (!Number.isFinite(delta) || delta === 0) {
    alert("Enter a non-zero number.");
    return;
  }

  if (!assertBlockOpen(blockName)) return;

  const student = studentsCache[studentKey];
  const blockPoints = ensureBlockPointsObject(student);
  blockPoints[blockName] = Number(blockPoints[blockName] || 0) + delta;

  await update(ref(db, `students/${studentKey}`), { blockPoints });
  manualPointsInput.value = "";
  alert("Points updated.");
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
  exportBlock(exportBlockSelect.value);
});

manualStudentSearch.addEventListener("input", renderManualOptions);
manualStudentSelect.addEventListener("change", renderManualPreview);
manualBlockSelect.addEventListener("change", renderManualPreview);

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderManualOptions();
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  activeBlockCache = settingsCache.activeBlock || "Block 1";
  renderBlockInfo();
  renderManualPreview();
});
