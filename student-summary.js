import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;

const logoutBtn = document.getElementById("logoutBtn");
const studentIdentity = document.getElementById("studentIdentity");
const displayNameCard = document.getElementById("displayNameCard");
const groupCard = document.getElementById("groupCard");
const classActiveBlockHero = document.getElementById("classActiveBlockHero");
const classActiveBlockStatus = document.getElementById("classActiveBlockStatus");
const totalBlockPointsCard = document.getElementById("totalBlockPointsCard");
const liveTeamPointsCard = document.getElementById("liveTeamPointsCard");
const liveStudentPointsCard = document.getElementById("liveStudentPointsCard");
const writtenExamCard = document.getElementById("writtenExamCard");
const oralExamCard = document.getElementById("oralExamCard");
const verbsExamCard = document.getElementById("verbsExamCard");
const blockSelector = document.getElementById("blockSelector");
const viewingBlockStatus = document.getElementById("viewingBlockStatus");
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");
const attendanceStatusText = document.getElementById("attendanceStatusText");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};
let selectedBlock = "";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function renderAttendanceStatus(row) {
  if (!attendanceStatusText) return;

  if (currentStudent?.activeNow === true) {
    attendanceStatusText.textContent = "Active now";
    return;
  }

  if (row?.leaveAt) {
    attendanceStatusText.textContent = "Logged out today";
    return;
  }

  attendanceStatusText.textContent = "Not active yet";
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function getDisplayName(student) {
  if (!student) return "Student";
  return student.nickname || ((student.fullName || student.name || "").split(" ")[0]) || "Student";
}

function getExternalId(student) {
  return student?.studentNumber || student?.externalId || "";
}

function formatStudentLabel(student) {
  const name = getDisplayName(student);
  const externalId = getExternalId(student);
  return externalId ? `${name} · ${externalId}` : name;
}

function getExamPoints(student, blockName) {
  const examBlock = student?.examPoints?.[blockName] || {};
  return {
    written: Number(examBlock.written || 0),
    oral: Number(examBlock.oral || 0),
    verbs: Number(examBlock.verbs || 0)
  };
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

  const studentLabel = formatStudentLabel(currentStudent);
  const activeBlock = settingsCache.activeBlock || "Block 1";
  const currentTeam = currentSession?.assignments?.[studentKey] || "";
  const showLivePoints = selectedBlock === activeBlock;
  const liveTeamPoints = showLivePoints ? Number(currentSession?.liveTeamPoints?.[currentTeam] || 0) : 0;
  const liveStudentPoints = showLivePoints ? Number(currentSession?.liveStudentPoints?.[studentKey] || 0) : 0;
  const examPoints = getExamPoints(currentStudent, selectedBlock);
  const totalBlockPoints = examPoints.written + examPoints.oral + examPoints.verbs + liveStudentPoints + liveTeamPoints;
  const activeBlockClosed = !!settingsCache?.closedBlocks?.[activeBlock];
  const selectedBlockClosed = !!settingsCache?.closedBlocks?.[selectedBlock];

  studentIdentity.textContent = studentLabel;
  displayNameCard.textContent = studentLabel;
  groupCard.textContent = currentStudent.groupName || "";
  classActiveBlockHero.textContent = activeBlock;
  classActiveBlockStatus.textContent = activeBlockClosed ? "Closed block" : "Open block";
  viewingBlockStatus.textContent = selectedBlockClosed ? "Selected block is closed." : "Selected block is open.";

  totalBlockPointsCard.textContent = String(totalBlockPoints);
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
  const reason = prompt("Reason for leaving (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "index.html";
});

onValue(ref(db, `students/${studentKey}`), (snapshot) => {
  currentStudent = snapshot.val();
  if (!currentStudent) {
    clearStudentSession();
    window.location.href = "index.html";
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
  selectedBlock = settingsCache.activeBlock || selectedBlock || "Block 1";
  renderAll();
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderAll();
});

onValue(ref(db, `attendance/${todayKey()}/${studentKey}`), (snapshot) => {
  renderAttendanceStatus(snapshot.val() || null);
});