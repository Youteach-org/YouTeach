import { db } from "./firebase.js";
import { ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;

const logoutBtn = document.getElementById("logoutBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const studentIdentity = document.getElementById("studentIdentity");
const buzzBtn = document.getElementById("buzzBtn");
const buzzerMessage = document.getElementById("buzzerMessage");
const studentStatusBox = document.getElementById("studentStatusBox");

let currentStudent = null;
let currentSession = null;

menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

function renderBuzzer() {
  if (!currentStudent) return;

  const displayName = currentStudent.nickname || currentStudent.fullName || currentStudent.name || "Student";
  studentIdentity.textContent = displayName;

  if (!currentSession?.active) {
    buzzBtn.disabled = true;
    buzzerMessage.textContent = "No active session.";
    studentStatusBox.textContent = `Name: ${displayName} | Group: ${currentStudent.groupName || ""}`;
    return;
  }

  const team = currentSession.assignments?.[studentKey] || "No team";
  const buzzer = currentSession.buzzer || {};
  const currentBuzz = buzzer.currentBuzz || null;
  const lockedOut = Boolean(buzzer.lockedOut?.[studentKey]);

  studentStatusBox.textContent = `Name: ${displayName} | Group: ${currentStudent.groupName || ""} | Team: ${team}`;

  if (currentBuzz?.studentKey === studentKey) {
    buzzBtn.disabled = true;
    buzzerMessage.textContent = "You buzzed first. Waiting for teacher decision.";
    return;
  }

  if (currentBuzz && currentBuzz.studentKey !== studentKey) {
    buzzBtn.disabled = true;
    buzzerMessage.textContent = `Current buzz: ${currentBuzz.name} (${currentBuzz.team})`;
    return;
  }

  if (lockedOut) {
    buzzBtn.disabled = true;
    buzzerMessage.textContent = "You are locked out for this round.";
    return;
  }

  if (buzzer.roundOpen) {
    buzzBtn.disabled = false;
    buzzerMessage.textContent = "Round is open. Press Buzz!";
    return;
  }

  buzzBtn.disabled = true;
  buzzerMessage.textContent = "Round is closed.";
}

logoutBtn.addEventListener("click", async () => {
  const reason = prompt("Reason for leaving class (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "student.html";
});

buzzBtn.addEventListener("click", async () => {
  if (!currentStudent || !currentSession?.active) return;

  const team = currentSession.assignments?.[studentKey] || "No team";

  await runTransaction(ref(db, "session/current/buzzer"), (buzzer) => {
    if (!buzzer) return buzzer;
    if (!buzzer.roundOpen) return buzzer;
    if (buzzer.currentBuzz) return buzzer;
    if (buzzer.lockedOut?.[studentKey]) return buzzer;

    buzzer.currentBuzz = {
      studentKey,
      id: currentStudent.studentNumber || currentStudent.id,
      name: currentStudent.nickname || currentStudent.fullName || currentStudent.name,
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
    window.location.href = "student.html";
    return;
  }
  renderBuzzer();
});

onValue(ref(db, "session/current"), (snapshot) => {
  currentSession = snapshot.val() || null;
  renderBuzzer();
});
