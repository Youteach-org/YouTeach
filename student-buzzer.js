import { db } from "./firebase.js";
import { ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;

const logoutBtn = document.getElementById("logoutBtn");
const attendanceStatusText = document.getElementById("attendanceStatusText");
const studentName = document.getElementById("studentName");
const studentTeam = document.getElementById("studentTeam");
const studentStatus = document.getElementById("studentStatus");
const buzzBtn = document.getElementById("buzzBtn");
const buzzSound = document.getElementById("buzzSound");
const activityScoresStrip = document.getElementById("activityScoresStrip");

let currentStudent = null;
let currentSession = null;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getDisplayName(student) {
  if (!student) return "Student";
  return student.nickname || ((student.fullName || student.name || "").split(" ")[0]) || "Student";
}

function getBuzzerState() {
  return currentSession?.buzzer || {
    roundOpen: false,
    currentBuzz: null,
    queue: [],
    lockedOutTeams: {}
  };
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

function renderActivityScores() {
  if (!activityScoresStrip) return;

  const scores = currentSession?.activityScores || {};
  const teamLabels = Object.keys(scores).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!teamLabels.length) {
    activityScoresStrip.innerHTML = `
      <div class="student-score-card">
        <span>No scores yet</span>
        <strong>0</strong>
      </div>
    `;
    return;
  }

  activityScoresStrip.innerHTML = teamLabels.map((teamLabel) => `
    <div class="student-score-card">
      <span>${teamLabel}</span>
      <strong>${Number(scores[teamLabel] || 0)}</strong>
    </div>
  `).join("");
}

function renderBuzzer() {
  if (!currentStudent) return;

  studentName.textContent = getDisplayName(currentStudent);

  if (!currentSession?.active) {
    studentTeam.textContent = "No team assigned";
    studentStatus.textContent = "No active session.";
    buzzBtn.disabled = true;
    renderActivityScores();
    return;
  }

  const team = currentSession.assignments?.[studentKey] || "No team";
  const buzzer = getBuzzerState();
  const currentBuzz = buzzer.currentBuzz || null;
  const queue = Array.isArray(buzzer.queue) ? buzzer.queue : [];
  const lockedOutTeam = Boolean(buzzer.lockedOutTeams?.[team]);
  const currentTeam = currentBuzz?.team || "";
  const queueIndex = queue.findIndex((entry) => entry?.team === team);

  studentTeam.textContent = team;
  renderActivityScores();

  if (lockedOutTeam) {
    buzzBtn.disabled = true;
    studentStatus.textContent = "Your team is locked for this round.";
    return;
  }

  if (!buzzer.roundOpen) {
    buzzBtn.disabled = true;
    studentStatus.textContent = "Round is closed.";
    return;
  }

      if (currentTeam === team) {
    buzzBtn.disabled = true;
    studentStatus.textContent = `${team} answered. Waiting for teacher decision.`;
    return;
  }
  }
  }

  if (queueIndex >= 0) {
    buzzBtn.disabled = true;
    studentStatus.textContent = `${team} is queued (#${queueIndex + 1}).`;
    return;
  }

  buzzBtn.disabled = false;
  studentStatus.textContent = "Round is open. Your team can buzz.";
}

logoutBtn.addEventListener("click", async () => {
  const reason = prompt("Reason for leaving (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "index.html";
});

buzzBtn.addEventListener("click", async () => {
  if (!currentStudent || !currentSession?.active) return;

  const team = currentSession.assignments?.[studentKey] || "No team";
  const studentNameText = getDisplayName(currentStudent);

  try {
    buzzSound.currentTime = 0; buzzSound.volume = 1; buzzSound.volume = 1;
    await buzzSound.play();
  } catch (error) {}

  await runTransaction(ref(db, "session/current/buzzer"), (buzzer) => {
    if (!buzzer) return buzzer;
    if (!buzzer.roundOpen) return buzzer;

    buzzer.queue = Array.isArray(buzzer.queue) ? buzzer.queue : [];
    buzzer.lockedOutTeams = buzzer.lockedOutTeams || {};

    if (buzzer.lockedOutTeams[team]) return buzzer;
    if (buzzer.currentBuzz?.team === team) return buzzer;
    if (buzzer.queue.some((entry) => entry?.team === team)) return buzzer;

    const entry = {
      studentKey,
      id: currentStudent.studentNumber || currentStudent.id,
      name: studentNameText,
      team,
      timestamp: Date.now()
    };

    if (!buzzer.currentBuzz) {
      buzzer.currentBuzz = entry;
    } else {
      buzzer.queue.push(entry);
    }

    return buzzer;
  });
});

onValue(ref(db, `students/${studentKey}`), (snapshot) => {
  currentStudent = snapshot.val();
  if (!currentStudent) {
    clearStudentSession();
    window.location.href = "index.html";
    return;
  }
  renderBuzzer();
});

onValue(ref(db, "session/current"), (snapshot) => {
  currentSession = snapshot.val() || null;
  renderBuzzer();
});

onValue(ref(db, `attendance/${todayKey()}/${studentKey}`), (snapshot) => {
  renderAttendanceStatus(snapshot.val() || null);
});