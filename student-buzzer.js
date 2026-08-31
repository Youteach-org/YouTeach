import { db } from "./firebase.js";
import { ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import {
  contestPaths,
  subscribeStudentContest,
  submitContestBuzz
} from "./contest-firebase.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;

const logoutBtn = document.getElementById("logoutBtn");
const attendanceStatusText = document.getElementById("attendanceStatusText");
const studentName = document.getElementById("studentName");
const studentTeam = document.getElementById("studentTeam");
const studentStatus = document.getElementById("studentStatus");
const buzzBtn = document.getElementById("buzzBtn");

const activityScoresStrip = document.getElementById("activityScoresStrip");
const contestTurnCard = document.getElementById("contestTurnCard");
const contestPosition = document.getElementById("contestPosition");
const contestTitle = document.getElementById("contestTitle");
const contestInstruction = document.getElementById("contestInstruction");
const contestEligibility = document.getElementById("contestEligibility");

let currentStudent = null;
let currentSession = null;
let activeContestId = "";
let contestState = null;
let unsubscribeActiveContest = null;
let unsubscribeContestState = null;

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

function playContestBuzz() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audioContext = new AudioContextClass();
  const now = audioContext.currentTime;
  const gain = audioContext.createGain();
  gain.connect(audioContext.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  [659.25, 783.99, 987.77].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now + index * 0.08);
    oscillator.stop(now + 0.22 + index * 0.08);
  });

  window.setTimeout(() => audioContext.close().catch(() => {}), 700);
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
      <span class="score-team-label">${teamLabel}:</span>
      <strong class="score-number">${Number(scores[teamLabel] || 0)}</strong>
    </div>
  `).join("");
}

function renderContestMode() {
  const eligibility = contestState?.eligibility;
  const publicState = contestState?.public;
  const contestActive = Boolean(activeContestId && eligibility && publicState);

  contestTurnCard.hidden = !contestActive;
  if (!contestActive) return false;

  contestTitle.textContent = publicState.title || "100 Students Said";
  contestPosition.textContent = String(eligibility.position || "—");
  const phase = String(publicState.phase || "").replaceAll("_", " ");
  const isEligible = eligibility.eligible === true && !publicState.roundTimeExpired;

  contestEligibility.textContent = isEligible ? "YOUR TURN" : "WAIT";
  contestEligibility.style.color = isEligible ? "#166534" : "#92400e";

  if (isEligible) {
    contestInstruction.textContent = publicState.phase === "faceoff"
      ? "You are a team leader. Buzz when you are ready to answer."
      : "This activity is assigned to you. Buzz when you are ready.";
    studentStatus.textContent = publicState.phase === "faceoff"
      ? "Face-off open: you may buzz."
      : "Your assigned turn is active.";
  } else {
    contestInstruction.textContent = `Position ${eligibility.position || "—"} · ${phase || "waiting"}`;
    studentStatus.textContent = publicState.roundTimeExpired
      ? "Round time has ended."
      : "Wait for your assigned turn.";
  }

  buzzBtn.disabled = !isEligible;
  return true;
}

function connectContestForGroup(groupName) {
  if (unsubscribeActiveContest) unsubscribeActiveContest();
  if (unsubscribeContestState) unsubscribeContestState();
  activeContestId = "";
  contestState = null;
  if (!groupName) return;

  unsubscribeActiveContest = onValue(
    ref(db, contestPaths.activeGroup(groupName)),
    (snapshot) => {
      const active = snapshot.val();
      const nextSessionId = active?.status === "active" ? active.sessionId : "";
      if (nextSessionId === activeContestId) return;
      if (unsubscribeContestState) unsubscribeContestState();
      activeContestId = nextSessionId;
      contestState = null;
      if (!activeContestId) {
        renderBuzzer();
        return;
      }
      unsubscribeContestState = subscribeStudentContest(
        activeContestId,
        studentKey,
        (value) => {
          contestState = value;
          renderBuzzer();
        }
      );
    }
  );
}

function renderBuzzer() {
  if (!currentStudent) return;

  studentName.textContent = getDisplayName(currentStudent);

  if (renderContestMode()) {
    renderActivityScores();
    return;
  }

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
  const lockedOutTeam = Boolean(buzzer.lockedOutTeams?.[team]);
  const currentTeam = currentBuzz?.team || "";

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

  if (currentBuzz) {
    buzzBtn.disabled = true;
    studentStatus.textContent = currentTeam === team
      ? `${team} answered. Waiting for teacher decision.`
      : "Another team buzzed first. Waiting for teacher decision.";
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
  if (!currentStudent) return;

  if (activeContestId && contestState?.eligibility?.eligible) {
    buzzBtn.disabled = true;
    playContestBuzz();
    const result = await submitContestBuzz(activeContestId, {
      studentKey,
      teamId: contestState.eligibility.teamId,
      studentName: getDisplayName(currentStudent)
    });
    studentStatus.textContent = result.accepted
      ? "Buzz accepted. Give your answer."
      : "Another eligible student buzzed first.";
    return;
  }

  if (!currentSession?.active) return;

  const team = currentSession.assignments?.[studentKey] || "No team";
  const studentNameText = getDisplayName(currentStudent);

  playContestBuzz();

  await runTransaction(ref(db, "session/current/buzzer"), (buzzer) => {
    if (!buzzer) return buzzer;
    if (!buzzer.roundOpen) return buzzer;

    buzzer.queue = [];
    buzzer.lockedOutTeams = buzzer.lockedOutTeams || {};

    if (buzzer.lockedOutTeams[team]) return buzzer;
    if (buzzer.currentBuzz) return buzzer;

    const entry = {
      studentKey,
      id: currentStudent.studentNumber || currentStudent.id,
      name: studentNameText,
      team,
      timestamp: Date.now()
    };

    buzzer.currentBuzz = entry;
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
  connectContestForGroup(currentStudent.groupName || "GENERAL");
  renderBuzzer();
});

onValue(ref(db, "session/current"), (snapshot) => {
  currentSession = snapshot.val() || null;
  renderBuzzer();
});

onValue(ref(db, `attendance/${todayKey()}/${studentKey}`), (snapshot) => {
  renderAttendanceStatus(snapshot.val() || null);
});