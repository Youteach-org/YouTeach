import { db } from "./firebase.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth } from "./teacher-auth.js";
import { reportedSpeechContest } from "./contest-seed.js";
import {
  contestPaths,
  createLiveContest,
  subscribeTeacherContest,
  sendTeacherCommand,
  clearContestBuzz
} from "./contest-firebase.js";
import { remainingMs } from "./contest-timers.js";

requireTeacherAuth();

const elements = Object.fromEntries(
  [
    "pairingCode", "openBoardBtn", "roundMinutes", "responseSeconds", "strikeLimit",
    "createContestBtn", "startRoundBtn", "markCorrectBtn", "markWrongBtn",
    "openActivityBtn", "revealModelBtn", "stealCorrectBtn", "stealWrongBtn",
    "endRoundBtn", "pauseRoundBtn", "resumeRoundBtn", "minusRoundBtn", "plusRoundBtn",
    "boardPreview", "connectionStatus", "teacherPrompt", "phaseChip", "modelAnswer",
    "alternatives", "explanation", "studyReference", "roundTimerReadout",
    "controlTeam", "activeStudent", "buzzWinner", "roundBank", "teacherMessage"
  ].map((id) => [id, document.getElementById(id)])
);

const SESSION_STORAGE_KEY = "youteachContestSessionId";
let sessionId = localStorage.getItem(SESSION_STORAGE_KEY) || "";
let liveValue = null;
let unsubscribeContest = null;
let unsubscribeBuzz = null;
let processingBuzzAt = null;
let studentsCache = {};

function message(text, isError = false) {
  elements.teacherMessage.textContent = text;
  elements.teacherMessage.style.color = isError ? "#b42331" : "";
}

function formatTimer(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pairingCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function studentName(studentKey) {
  const student = studentsCache[studentKey] || {};
  return student.nickname || student.fullName || student.name || studentKey || "—";
}

function teamName(teamId) {
  return liveValue?.private?.state?.config?.teams?.find((team) => team.id === teamId)?.name || teamId || "—";
}

function contestConfigFromBuzzer(buzzerSession) {
  const assignments = buzzerSession?.assignments || {};
  const labels = [...new Set(Object.values(assignments))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  if (labels.length !== 2) {
    throw new Error("This game needs exactly two teams. Generate two teams in Buzzer first.");
  }
  const teams = labels.map((label, index) => ({
    id: `team${index + 1}`,
    name: label,
    students: Object.entries(assignments)
      .filter(([, assignedLabel]) => assignedLabel === label)
      .map(([studentKey]) => studentKey)
  }));
  if (teams.some((team) => !team.students.length)) {
    throw new Error("Both teams need at least one student.");
  }
  return {
    contestId: reportedSpeechContest.id,
    strikeLimit: Number(elements.strikeLimit.value || 2),
    roundDurationMs: Number(elements.roundMinutes.value || 5) * 60_000,
    responseDurationMs: Number(elements.responseSeconds.value || 10) * 1_000,
    teams,
    rounds: reportedSpeechContest.rounds.map((round) => ({
      multiplier: round.multiplier,
      activityIds: round.activities.map((activity) => activity.id)
    }))
  };
}

function setBoardSource() {
  if (!sessionId) {
    elements.boardPreview.removeAttribute("src");
    return;
  }
  elements.boardPreview.src = `contest-board.html?session=${encodeURIComponent(sessionId)}&preview=1`;
}

function render() {
  const state = liveValue?.private?.state || null;
  const guide = liveValue?.teacherGuide || null;
  elements.connectionStatus.textContent = state ? "Live" : "Not connected";
  elements.connectionStatus.style.background = state ? "#d7f7e6" : "";
  elements.phaseChip.textContent = String(state?.phase || "lobby").replaceAll("_", " ");
  elements.teacherPrompt.textContent = guide?.activity?.prompt || "Create a game to begin.";
  elements.modelAnswer.textContent = guide?.teacherGuide?.modelAnswer || "—";
  elements.alternatives.textContent = guide?.teacherGuide?.acceptedAlternatives?.join(" / ") || "—";
  elements.explanation.textContent = guide?.teacherGuide?.explanation || "—";
  elements.studyReference.textContent = guide?.teacherGuide?.studyReference || "—";
  elements.controlTeam.textContent = teamName(state?.controlTeamId);
  elements.activeStudent.textContent = studentName(state?.activeStudentKey);
  elements.buzzWinner.textContent = studentName(state?.buzzWinner?.studentKey);
  elements.roundBank.textContent = String(state?.roundBank || 0);
}

function connectToSession() {
  if (unsubscribeContest) unsubscribeContest();
  if (unsubscribeBuzz) unsubscribeBuzz();
  if (!sessionId) return;

  elements.pairingCode.textContent = sessionId.slice(-5).toUpperCase();
  setBoardSource();

  unsubscribeContest = subscribeTeacherContest(sessionId, (value) => {
    liveValue = value;
    render();
  });

  unsubscribeBuzz = onValue(ref(db, contestPaths.buzzLock(sessionId)), async (snapshot) => {
    const buzz = snapshot.val();
    if (!buzz || processingBuzzAt === buzz.at) return;
    processingBuzzAt = buzz.at;
    try {
      const phase = liveValue?.private?.state?.phase;
      if (phase === "faceoff") {
        await sendTeacherCommand(sessionId, {
          type: "ACCEPT_BUZZ",
          studentKey: buzz.studentKey
        });
        message(`${studentName(buzz.studentKey)} buzzed first.`);
      }
    } catch (error) {
      message(error.message, true);
    } finally {
      await clearContestBuzz(sessionId);
    }
  });
}

async function createContest() {
  try {
    message("Creating game...");
    const [buzzerSnapshot, studentsSnapshot] = await Promise.all([
      get(ref(db, "session/current")),
      get(ref(db, "students"))
    ]);
    const buzzerSession = buzzerSnapshot.val();
    studentsCache = studentsSnapshot.val() || {};
    if (!buzzerSession?.active) {
      throw new Error("Create an active two-team session in Buzzer first.");
    }

    const config = contestConfigFromBuzzer(buzzerSession);
    const code = pairingCode();
    sessionId = `contest-${Date.now()}-${code.toLowerCase()}`;
    await createLiveContest({
      sessionId,
      contest: reportedSpeechContest,
      config,
      pairingCode: code
    });
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    elements.pairingCode.textContent = code;
    connectToSession();
    message("Game created. Open the public board, then start Round 1.");
  } catch (error) {
    console.error(error);
    message(error.message || "Could not create the game.", true);
  }
}

async function command(type, extra = {}) {
  if (!sessionId) return message("Create a game first.", true);
  try {
    await sendTeacherCommand(sessionId, { type, ...extra });
    message(`${type.replaceAll("_", " ")} completed.`);
  } catch (error) {
    console.error(error);
    message(error.message || "Command failed.", true);
  }
}

elements.createContestBtn.addEventListener("click", createContest);
elements.startRoundBtn.addEventListener("click", () => command("START_ROUND", {
  roundDurationMs: Number(elements.roundMinutes.value || 5) * 60_000,
  responseDurationMs: Number(elements.responseSeconds.value || 10) * 1_000
}));
elements.openActivityBtn.addEventListener("click", () => command("OPEN_ACTIVITY", {
  responseDurationMs: Number(elements.responseSeconds.value || 10) * 1_000
}));
elements.markCorrectBtn.addEventListener("click", () => command("MARK_CORRECT", {
  points: liveValue?.teacherGuide?.teacherGuide?.basePoints || 10
}));
elements.markWrongBtn.addEventListener("click", () => command("MARK_WRONG"));
elements.revealModelBtn.addEventListener("click", () => command("REVEAL_MODEL"));
elements.stealCorrectBtn.addEventListener("click", () => command("MARK_STEAL_CORRECT"));
elements.stealWrongBtn.addEventListener("click", () => command("MARK_STEAL_WRONG"));
elements.endRoundBtn.addEventListener("click", () => command("END_ROUND"));
elements.pauseRoundBtn.addEventListener("click", () => command("PAUSE_ROUND_TIMER"));
elements.resumeRoundBtn.addEventListener("click", () => command("RESUME_ROUND_TIMER"));
elements.minusRoundBtn.addEventListener("click", () => command("ADJUST_ROUND_TIMER", { deltaMs: -30_000 }));
elements.plusRoundBtn.addEventListener("click", () => command("ADJUST_ROUND_TIMER", { deltaMs: 30_000 }));
elements.openBoardBtn.addEventListener("click", () => {
  if (!sessionId) return message("Create a game first.", true);
  window.open(`contest-board.html?session=${encodeURIComponent(sessionId)}`, "_blank", "noopener");
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  render();
});

window.setInterval(() => {
  const timer = liveValue?.private?.state?.timers?.round;
  elements.roundTimerReadout.textContent = formatTimer(remainingMs(timer, Date.now()));
  if (
    timer?.status === "running" &&
    remainingMs(timer, Date.now()) === 0 &&
    !liveValue?.private?.state?.roundTimeExpired
  ) {
    command("ROUND_TIME_EXPIRED");
  }
}, 250);

if (sessionId) connectToSession();
