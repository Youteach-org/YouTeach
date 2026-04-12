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
const buzzerStatusBox = document.getElementById("buzzerStatusBox");
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};

menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

function getStudentBlockPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function renderAll() {
  if (!currentStudent) return;

  const activeBlock = settingsCache.activeBlock || "Block 1";
  const displayName = currentStudent.nickname || currentstudent.nickname || (student.fullName || student.nickname || (student.fullName || student.name || "").split(" ")[0] || "").split(" ")[0] || currentstudent.nickname || (student.fullName || student.name || "").split(" ")[0] || "Student";
  const currentTeam = currentSession?.assignments?.[studentKey] || "No active session";
  const liveTeamPoints = Number(currentSession?.liveTeamPoints?.[currentTeam] || 0);
  const liveStudentPoints = Number(currentSession?.liveStudentPoints?.[studentKey] || 0);
  const officialPoints = getStudentBlockPoints(currentStudent, activeBlock);
  const buzzer = currentSession?.buzzer || {};

  studentIdentity.textContent = displayName;
  displayNameCard.textContent = displayName;
  groupCard.textContent = currentStudent.groupName || "";
  activeBlockCard.textContent = `${activeBlock}${settingsCache.closedBlocks?.[activeBlock] ? " (CLOSED)" : " (OPEN)"}`;
  officialPointsCard.textContent = String(officialPoints);
  liveTeamPointsCard.textContent = String(liveTeamPoints);
  liveStudentPointsCard.textContent = String(liveStudentPoints);

  if (!currentSession?.active) {
    buzzerStatusBox.textContent = "No active session.";
  } else if (buzzer.currentBuzz?.studentKey === studentKey) {
    buzzerStatusBox.textContent = "You buzzed first. Waiting for teacher decision.";
  } else if (buzzer.currentBuzz) {
    buzzerStatusBox.textContent = `Current buzz: ${buzzer.currentBuzz.name} (${buzzer.currentBuzz.team})`;
  } else if (buzzer.lockedOut?.[studentKey]) {
    buzzerStatusBox.textContent = "You are locked out for this round.";
  } else if (buzzer.roundOpen) {
    buzzerStatusBox.textContent = "Round is open.";
  } else {
    buzzerStatusBox.textContent = "Round is closed.";
  }

  const historyEntries = Object.entries(pointsLogCache || {})
    .filter(([, entry]) => entry.studentKey === studentKey)
    .sort((a, b) => Number(b[1]?.appliedAt || 0) - Number(a[1]?.appliedAt || 0));

  if (!historyEntries.length) {
    studentHistoryTableBody.innerHTML = `<tr><td colspan="7">No point history yet.</td></tr>`;
  } else {
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
}

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

