import { db } from "./firebase.js";
import { ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, getStudentSessionToken, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { canStudentAccessLiveGame } from "./cog-live-session-policy.mjs";

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
const liveGameCard = document.getElementById("liveGameCard");
const liveGameName = document.getElementById("liveGameName");
const joinLiveGameBtn = document.getElementById("joinLiveGameBtn");

let currentStudent = null;
let currentSession = null;
let hundredSS = null;
const gameTurnCard = document.getElementById("gameTurnCard");
const gameTurnPosition = document.getElementById("gameTurnPosition");

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

function activeLiveGameForStudent() {
  const connectedGame = currentSession?.connectedGame || null;
  if (!currentStudent || !connectedGame) return null;
  return canStudentAccessLiveGame({
    connectedGame,
    studentGroup: currentStudent.groupName || "GENERAL",
    studentKey,
    now: Date.now()
  }) ? connectedGame : null;
}

function renderLiveGameCard() {
  if (!liveGameCard || !joinLiveGameBtn || !liveGameName) return;
  const connectedGame = activeLiveGameForStudent();
  liveGameCard.hidden = !connectedGame;
  if (!connectedGame) return;

  liveGameName.textContent = connectedGame.gameName || "Classroom Online Game";
  const lastJoined = localStorage.getItem("youteachLastLiveGameSession") || "";
  joinLiveGameBtn.textContent =
    lastJoined === String(connectedGame.cogSessionId || "")
      ? "RETURN TO GAME"
      : "JOIN GAME";
}

function renderBuzzer() {
  if (!currentStudent) return;

  studentName.textContent = getDisplayName(currentStudent);

  if (!currentSession?.active) {
    studentTeam.textContent = "No team assigned";
    studentStatus.textContent = "No active session.";
    buzzBtn.disabled = true;
    renderActivityScores();
    renderLiveGameCard();
    return;
  }

  const team = currentSession.assignments?.[studentKey] || "No team";
  const buzzer = getBuzzerState();
  const currentBuzz = buzzer.currentBuzz || null;
  const gameActive = Boolean(currentSession?.connectedGame?.gameId === "100-students-said" && currentSession?.connectedGame?.status === "active" && hundredSS?.integration?.active);
  const alreadyParticipated = Boolean(hundredSS?.usedStudents?.[studentKey]);
  const assignedTurn = hundredSS?.turnStudentKey || "";
  if (gameTurnCard) gameTurnCard.hidden = !gameActive;
  if (gameActive && gameTurnPosition) gameTurnPosition.textContent = assignedTurn === studentKey ? "YOUR TURN" : (alreadyParticipated ? "Already participated this round" : "Waiting for assigned turn");
  const lockedOutTeam = Boolean(buzzer.lockedOutTeams?.[team]);
  const currentTeam = currentBuzz?.team || "";

  studentTeam.textContent = team;
  renderActivityScores();
  renderLiveGameCard();

  if (gameActive && (alreadyParticipated || (assignedTurn && assignedTurn !== studentKey))) {
    buzzBtn.disabled = true;
    studentStatus.textContent = alreadyParticipated ? "You already participated in this round." : "Wait for your assigned turn.";
    return;
  }

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

if (joinLiveGameBtn) {
  joinLiveGameBtn.addEventListener("click", async () => {
    const connectedGame = activeLiveGameForStudent();
    const studentSessionToken = getStudentSessionToken();
    if (!connectedGame || !studentSessionToken) {
      studentStatus.textContent = "This live activity is not available.";
      return;
    }

    joinLiveGameBtn.disabled = true;
    const oldText = joinLiveGameBtn.textContent;
    joinLiveGameBtn.textContent = "OPENING…";

    try {
      const response = await fetch("/api/cog-live-student-launch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${studentSessionToken}`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true || !payload?.launchUrl) {
        throw new Error(payload?.error || "Could not open the live activity.");
      }

      localStorage.setItem(
        "youteachLastLiveGameSession",
        String(connectedGame.cogSessionId || "")
      );
      window.location.href = payload.launchUrl;
    } catch (error) {
      console.error("Could not open live Classroom Online Game", error);
      studentStatus.textContent = error?.message || "Could not open the live activity. Try again.";
      joinLiveGameBtn.disabled = false;
      joinLiveGameBtn.textContent = oldText;
    }
  });
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

  if (currentSession?.connectedGame?.gameId === "100-students-said" && currentSession?.connectedGame?.status === "active" && hundredSS?.integration?.active) {
    let eligible = false;
    await runTransaction(ref(db, "classroomGames/hundredStudentsSaid/current"), (game) => {
      if (!game || game.usedStudents?.[studentKey]) return game;
      if (game.turnStudentKey && game.turnStudentKey !== studentKey) return game;
      game.usedStudents = game.usedStudents || {};
      game.usedStudents[studentKey] = true;
      eligible = true;
      return game;
    });
    if (!eligible) return;
  }

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
  renderBuzzer();
});

onValue(ref(db, "session/current"), (snapshot) => {
  currentSession = snapshot.val() || null;
  renderBuzzer();
});

onValue(ref(db, `attendance/${todayKey()}/${studentKey}`), (snapshot) => {
  renderAttendanceStatus(snapshot.val() || null);
});
onValue(ref(db, "classroomGames/hundredStudentsSaid/current"), (snapshot) => {
  hundredSS = snapshot.val() || null;
  renderBuzzer();
});
