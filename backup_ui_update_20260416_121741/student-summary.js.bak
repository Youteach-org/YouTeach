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
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");
const blockSelector = document.getElementById("blockSelector");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};
let selectedBlock = "";

menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

function getStudentBlockPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function getDisplayName(student) {
  if (!student) return "Student";
  return (
    student.nickname ||
    ((student.fullName || student.name || "").split(" ")[0]) ||
    "Student"
  );
}

function getAvailableBlocks() {
  const blockSet = new Set();

  const defaultBlocks = ["Block 1", "Block 2", "Block 3"];
  defaultBlocks.forEach((b) => blockSet.add(b));

  Object.keys(currentStudent?.blockPoints || {}).forEach((b) => blockSet.add(b));
  Object.keys(settingsCache?.closedBlocks || {}).forEach((b) => blockSet.add(b));

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

  const optionsHtml = availableBlocks
    .map((blockName) => `<option value="${blockName}">${blockName}</option>`)
    .join("");

  blockSelector.innerHTML = optionsHtml;
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
  const officialPoints = getStudentBlockPoints(currentStudent, selectedBlock);
  const isClosed = !!settingsCache?.closedBlocks?.[selectedBlock];

  studentIdentity.textContent = displayName;
  displayNameCard.textContent = displayName;
  groupCard.textContent = currentStudent.groupName || "";
  activeBlockCard.textContent = `${selectedBlock}${isClosed ? " (CLOSED)" : " (OPEN)"}`;
  officialPointsCard.textContent = String(officialPoints);
  liveTeamPointsCard.textContent = String(liveTeamPoints);
  liveStudentPointsCard.textContent = String(liveStudentPoints);

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