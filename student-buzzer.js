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

function renderBuzzer() {
  if (!currentStudent) return;

  studentName.textContent = getDisplayName(currentStudent);

  if (!currentSession?.active) {
    studentTeam.textContent = "No team assigned";
    studentStatus.textContent = "No active session.";
    buzzBtn.disabled = true;
    return;
  }

  const team = currentSession.assignments?.[studentKey] || "No team";
  const buzzer = currentSession.buzzer || {};
  const currentBuzz = buzzer.currentBuzz || null;
  const lockedOut = Boolean(buzzer.lockedOut?.[studentKey]);

  studentTeam.textContent = team;

  if (currentBuzz?.studentKey === studentKey) {
    buzzBtn.disabled = true;
    studentStatus.textContent = "You buzzed first. Waiting for teacher decision.";
    return;
  }

  if (currentBuzz && currentBuzz.studentKey !== studentKey) {
    buzzBtn.disabled = true;
    studentStatus.textContent = `Current buzz: ${currentBuzz.name}`;
    return;
  }

  if (lockedOut) {
    buzzBtn.disabled = true;
    studentStatus.textContent = "You are locked out for this round.";
    return;
  }

  if (buzzer.roundOpen) {
    buzzBtn.disabled = false;
    studentStatus.textContent = "Round is open. Tap the buzzer.";
    return;
  }

  buzzBtn.disabled = true;
  studentStatus.textContent = "Round is closed.";
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

  try {
    buzzSound.currentTime = 0;
    await buzzSound.play();
  } catch (error) {}

  await runTransaction(ref(db, "session/current/buzzer"), (buzzer) => {
    if (!buzzer) return buzzer;
    if (!buzzer.roundOpen) return buzzer;
    if (buzzer.currentBuzz) return buzzer;
    if (buzzer.lockedOut?.[studentKey]) return buzzer;

    buzzer.currentBuzz = {
      studentKey,
      id: currentStudent.studentNumber || currentStudent.id,
      name: getDisplayName(currentStudent),
      team,
      timestamp: Date.now()
    };
    buzzer.roundOpen = false;
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