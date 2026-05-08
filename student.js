import { db } from "./firebase.js";
import {
  ref,
  get,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const loadBtn = document.getElementById("load");
const buzzBtn = document.getElementById("buzzBtn");

const idInput = document.getElementById("id");
const nameOutput = document.getElementById("name");
const activeBlockText = document.getElementById("activeBlockText");
const pointsOutput = document.getElementById("points");
const liveTeamPointsOutput = document.getElementById("liveTeamPoints");
const liveStudentPointsOutput = document.getElementById("liveStudentPoints");
const studentPointsHistory = document.getElementById("studentPointsHistory");
const buzzerMessage = document.getElementById("buzzerMessage");

let currentStudentKey = null;
let currentStudent = null;
let currentSession = null;
let activeBlockCache = "Block 1";
let activeBlockClosedCache = false;
let pointsLogCache = {};
let settingsCache = {};

function getStudentBlockPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function isBlockClosed(blockName) {
  return Boolean(settingsCache?.closedBlocks?.[blockName]);
}

function renderStudentHistory() {
  if (!currentStudentKey) {
    studentPointsHistory.innerHTML = "Login first.";
    return;
  }

  const entries = Object.entries(pointsLogCache || {})
    .filter(([, entry]) => entry.studentKey === currentStudentKey)
    .sort((a, b) => Number(b[1]?.appliedAt || 0) - Number(a[1]?.appliedAt || 0));

  if (entries.length === 0) {
    studentPointsHistory.innerHTML = "No point history yet.";
    return;
  }

  studentPointsHistory.innerHTML = entries.map(([, entry]) => `
    <div class="info-card">
      Type: ${entry.type || "unknown"}<br>
      Block: ${entry.block || "Block 1"}<br>
      Added Points: ${Number(entry.addedPoints || 0)}<br>
      ${entry.teamLabel ? `Team: ${entry.teamLabel}<br>` : ""}
      Applied: ${formatDate(entry.appliedAt)}
    </div>
  `).join("");
}

function renderStudentView() {
  if (!currentStudent) return;

  const displayName = currentStudent.fullName || currentStudent.name || "";
  const officialPoints = getStudentBlockPoints(currentStudent, activeBlockCache);
  const liveTeam = currentSession?.assignments?.[currentStudentKey] || "No active session";
  const liveTeamPoints = Number(currentSession?.liveTeamPoints?.[liveTeam] || 0);
  const pendingStudentPoints = Number(currentSession?.liveStudentPoints?.[currentStudentKey] || 0);

  nameOutput.innerText = displayName;
  activeBlockText.innerText = `Active Block: ${activeBlockCache} (${activeBlockClosedCache ? "CLOSED" : "OPEN"})`;
  pointsOutput.innerText = `${officialPoints} | ${liveTeam}`;
  liveTeamPointsOutput.innerText = `${liveTeamPoints}`;
  liveStudentPointsOutput.innerText = `${pendingStudentPoints}`;

  const buzzer = currentSession?.buzzer || {};
  const roundOpen = Boolean(buzzer.roundOpen);
  const currentBuzz = buzzer.currentBuzz || null;
  const lockedOut = Boolean(buzzer.lockedOut?.[currentStudentKey]);

  if (!currentSession || !currentSession.active) {
    buzzBtn.disabled = true;
    buzzerMessage.innerText = "No active session.";
    renderStudentHistory();
    return;
  }

  if (currentBuzz && currentBuzz.studentKey === currentStudentKey) {
    buzzBtn.disabled = true;
    buzzerMessage.innerText = "You buzzed first. Waiting for teacher decision.";
    renderStudentHistory();
    return;
  }

  if (currentBuzz && currentBuzz.studentKey !== currentStudentKey) {
    buzzBtn.disabled = true;
    buzzerMessage.innerText = `Current buzz: ${currentBuzz.name} (${currentBuzz.team})`;
    renderStudentHistory();
    return;
  }

  if (lockedOut) {
    buzzBtn.disabled = true;
    buzzerMessage.innerText = "You are locked out for this round.";
    renderStudentHistory();
    return;
  }

  if (roundOpen) {
    buzzBtn.disabled = false;
    buzzerMessage.innerText = "Round is open. Press Buzz!";
    renderStudentHistory();
    return;
  }

  buzzBtn.disabled = true;
  buzzerMessage.innerText = "Round is closed.";
  renderStudentHistory();
}

loadBtn.onclick = async () => {
  const id = idInput.value.trim();

  const snapshot = await get(ref(db, "students"));
  const data = snapshot.val();

  if (!data) {
    alert("No students found.");
    return;
  }

  for (let key in data) {
    if (data[key].id === id) {
      currentStudentKey = key;
      currentStudent = data[key];

      onValue(ref(db, `students/${key}`), (snap) => {
        currentStudent = snap.val();
        renderStudentView();
      });

      onValue(ref(db, "session/current"), (snap) => {
        currentSession = snap.val();
        renderStudentView();
      });

      onValue(ref(db, "settings"), (snap) => {
        settingsCache = snap.val() || {};
        activeBlockCache = settingsCache.activeBlock || "Block 1";
        activeBlockClosedCache = isBlockClosed(activeBlockCache);
        renderStudentView();
      });

      onValue(ref(db, "pointsLog"), (snap) => {
        pointsLogCache = snap.val() || {};
        renderStudentView();
      });

      return;
    }
  }

  alert("Student not found.");
};

buzzBtn.onclick = async () => {
  if (!currentStudentKey || !currentStudent || !currentSession?.active) {
    return;
  }

  const team = currentSession.assignments?.[currentStudentKey] || "No team";

  await runTransaction(ref(db, "session/current/buzzer"), (buzzer) => {
    if (!buzzer) return buzzer;

    const roundOpen = Boolean(buzzer.roundOpen);
    const currentBuzz = buzzer.currentBuzz || null;
    const lockedOut = buzzer.lockedOut || {};

    if (!roundOpen) return buzzer;
    if (currentBuzz) return buzzer;
    if (lockedOut[currentStudentKey]) return buzzer;

    buzzer.currentBuzz = {
      studentKey: currentStudentKey,
      id: currentStudent.id,
      name: currentStudent.fullName || currentStudent.name,
      team,
      timestamp: Date.now()
    };

    // keep round open while waiting for teacher decision
    return buzzer;
  });
};
