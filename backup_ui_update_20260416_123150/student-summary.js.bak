import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;

const logoutBtn = document.getElementById("logoutBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const studentIdentity = document.getElementById("studentIdentity");
const displayNameCard = document.getElementById("displayNameCard");
const groupCard = document.getElementById("groupCard");
const activeBlockCard = document.getElementById("activeBlockCard");
const officialPointsCard = document.getElementById("officialPointsCard");
const liveTeamPointsCard = document.getElementById("liveTeamPointsCard");
const liveStudentPointsCard = document.getElementById("liveStudentPointsCard");
const writtenExamCard = document.getElementById("writtenExamCard");
const oralExamCard = document.getElementById("oralExamCard");
const verbsExamCard = document.getElementById("verbsExamCard");
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");
const blockSelector = document.getElementById("blockSelector");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};
let selectedBlock = "";

menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

function getDisplayName(student) {
  if (!student) return "Student";
  return (
    student.nickname ||
    (student.fullName || student.name || "").split(" ")[0] ||
    "Student"
  );
}

function getBaseBlockPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function getExamPoints(student, blockName) {
  const examBlock = student?.examPoints?.[blockName] || {};
  return {
    written: Number(examBlock.written || 0),
    oral: Number(examBlock.oral || 0),
    verbs: Number(examBlock.verbs || 0)
  };
}

function getOfficialPoints(student, blockName) {
  const basePoints = getBaseBlockPoints(student, blockName);
  const examPoints = getExamPoints(student, blockName);
  return basePoints + examPoints.written + examPoints.oral + examPoints.verbs;
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function getAvailableBlocks() {
  const blockSet = new Set(["Block 1", "Block 2", "Block 3"]);

  Object.keys(currentStudent?.blockPoints || {}).forEach((blockName) => blockSet.add(blockName));
  Object.keys(currentStudent?.examPoints || {}).forEach((blockName) => blockSet.add(blockName));
  Object.keys(settingsCache?.closedBlocks || {}).forEach((blockName) => blockSet.add(blockName));

  if (settingsCache?.activeBlock) {
    blockSet.add(settingsCache.activeBlock);
  }

  return Array.from(blockSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function ensureSelectedBlock() {
  const availableBlocks = getAvailableBlocks();

  if (!selectedBlock || !availableBlocks.includes(selectedBlock)) {
    selectedBlock = settingsCache.activeBlock || availableBlocks[0] || "Block 1";
  }

  blockSelector.innerHTML = availableBlocks
    .map((blockName) => `<option value="${blockName}">${blockName}</option>`)
    .join("");

  blockSelector.value = selectedBlock;
}

function renderHistory(blockName) {
  const historyEntries = Object.entries(pointsLogCache || {})
    .filter(([, entry]) => entry.studentKey === studentKey && (entry.block || "") === blockName)
    .sort((a, b) => Number(b[1]?.appliedAt || 0) - Number(a[1]?.appliedAt || 0));

  if (!historyEntries.length) {
    studentHistoryTableBody.innerHTML = `<tr><td colspan="7">No point history for ${blockName} yet.</td></tr>`;
    return;
  }

  studentHistoryTableBody.innerHTML = historyEntries.map(([, entry]) => `
    <tr>
      <td>${entry.type || ""}</td>
      <td>${entry.block || ""}</td>
      <td>${Number(entry.addedPoints || 0)}</td>
      <td>${Number(entry.previousPoints || 0)}</td>
      <td>${Number(entry.newPoints || 0)}</td>
      <td>${entry.teamLabel || ""}</td>
      <td>${formatDate(entry.appliedAt)}</td>
    </tr>
  `).join("");
}

function renderAll() {
  if (!currentStudent) return;

  ensureSelectedBlock();

  const displayName = getDisplayName(currentStudent);
  const currentTeam = currentSession?.assignments?.[studentKey] || "No active team";
  const liveTeamPoints = Number(currentSession?.liveTeamPoints?.[currentTeam] || 0);
  const liveStudentPoints = Number(currentSession?.liveStudentPoints?.[studentKey] || 0);
  const examPoints = getExamPoints(currentStudent, selectedBlock);
  const officialPoints = getOfficialPoints(currentStudent, selectedBlock);
  const isClosed = !!settingsCache?.closedBlocks?.[selectedBlock];

  studentIdentity.textContent = displayName;
  displayNameCard.textContent = displayName;
  groupCard.textContent = currentStudent.groupName || "";
  activeBlockCard.textContent = `${selectedBlock}${isClosed ? " (CLOSED)" : " (OPEN)"}`;
  officialPointsCard.textContent = String(officialPoints);
  liveTeamPointsCard.textContent = String(liveTeamPoints);
  liveStudentPointsCard.textContent = String(liveStudentPoints);
  writtenExamCard.textContent = String(examPoints.written);
  oralExamCard.textContent = String(examPoints.oral);
  verbsExamCard.textContent = String(examPoints.verbs);

  renderHistory(selectedBlock);
}

blockSelector.addEventListener("change", () => {
  selectedBlock = blockSelector.value || settingsCache.activeBlock || "Block 1";
  renderAll();
});

logoutBtn.addEventListener("click", async () => {
  const reason = prompt("Reason for leaving class (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "student.html";
});

onValue(ref(db, `students/${studentKey}`), (snapshot) => {
  currentStudent = snapshot.val();
  if (!currentStudent) {
    clearStudentSession();
    window.location.href = "student.html";
    return;
  }
  renderAll();
});

onValue(ref(db, "session/current"), (snapshot) => {
  currentSession = snapshot.val() || null;
  renderAll();
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  renderAll();
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderAll();
});