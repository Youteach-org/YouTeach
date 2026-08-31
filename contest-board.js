import {
  pairPublicBoard,
  subscribePublicContest
} from "./contest-firebase.js";

const params = new URLSearchParams(window.location.search);
const previewMode = params.get("preview") === "1";
let sessionId = params.get("session") || localStorage.getItem("youteachPublicBoardSession") || "";
let current = null;
let unsubscribe = null;

if (previewMode) document.body.classList.add("preview");

const byId = (id) => document.getElementById(id);
const elements = {
  contestTitle: byId("contestTitle"),
  roundLabel: byId("roundLabel"),
  roundTimer: byId("roundTimer"),
  roundNumber: byId("roundNumber"),
  activityProgress: byId("activityProgress"),
  roundBank: byId("roundBank"),
  phaseText: byId("phaseText"),
  activeStudent: byId("activeStudent"),
  promptText: byId("promptText"),
  revealedAnswer: byId("revealedAnswer"),
  responseTimer: byId("responseTimer"),
  feedbackBanner: byId("feedbackBanner"),
  pairingOverlay: byId("pairingOverlay"),
  pairingInput: byId("pairingInput"),
  pairBoardBtn: byId("pairBoardBtn"),
  pairingMessage: byId("pairingMessage")
};

function formatTimer(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timerNow(timer) {
  if (!timer) return 0;
  if (timer.status !== "running") return Number(timer.remainingMs || 0);
  const elapsedSinceProjection = Date.now() - Number(timer.projectedAt || Date.now());
  return Math.max(0, Number(timer.remainingMs || 0) - elapsedSinceProjection);
}

function strikesMarkup(count) {
  return Array.from({ length: Number(count || 0) }, () => '<span class="strike">✕</span>').join("");
}

function renderTeam(team, index, controlTeamId) {
  byId(`teamName${index}`).textContent = team?.name || `Team ${index + 1}`;
  byId(`teamScore${index}`).textContent = String(team?.score || 0);
  byId(`teamStrikes${index}`).innerHTML = strikesMarkup(team?.strikes);
  byId(`teamCard${index}`).classList.toggle("control", team?.id === controlTeamId);
}

function showFeedback(feedback) {
  if (!feedback) {
    elements.feedbackBanner.hidden = true;
    return;
  }
  const labels = {
    ANSWER_CORRECT: "CORRECT!",
    CONTROL_WON: "CONTROL!",
    ANSWER_WRONG: "STRIKE!",
    FACEOFF_WRONG: "WRONG!",
    STEAL_CORRECT: "STEAL!",
    STEAL_WRONG: "NO STEAL",
    ROUND_TIME_EXPIRED: "TIME!"
  };
  elements.feedbackBanner.textContent = labels[feedback.type] || "";
  elements.feedbackBanner.classList.toggle(
    "wrong",
    ["ANSWER_WRONG", "FACEOFF_WRONG", "STEAL_WRONG", "ROUND_TIME_EXPIRED"].includes(feedback.type)
  );
  elements.feedbackBanner.hidden = !labels[feedback.type];
  window.clearTimeout(showFeedback.timeout);
  showFeedback.timeout = window.setTimeout(() => {
    elements.feedbackBanner.hidden = true;
  }, 1800);
}

function render(value) {
  current = value;
  if (!value) return;
  elements.contestTitle.textContent = value.title || "100 Students Said";
  elements.roundLabel.textContent = value.round?.title || "ROUND";
  elements.roundNumber.textContent = value.round ? `Round ${value.round.number} ×${value.round.multiplier}` : "Waiting";
  elements.activityProgress.textContent = value.activity
    ? `${value.activity.progress} / ${value.activity.total}`
    : "0 / 0";
  elements.roundBank.textContent = String(value.bank || 0);
  elements.phaseText.textContent = String(value.phase || "waiting").replaceAll("_", " ").toUpperCase();
  elements.activeStudent.textContent = value.activeStudentName || value.buzzWinnerName || "—";
  elements.promptText.textContent = value.activity?.prompt || "The activity will appear here.";
  elements.revealedAnswer.hidden = !value.activity?.revealedModel;
  elements.revealedAnswer.textContent = value.activity?.revealedModel || "";
  elements.roundTimer.parentElement.classList.toggle("expired", Boolean(value.roundTimeExpired));
  renderTeam(value.teams?.[0], 0, value.controlTeam?.id);
  renderTeam(value.teams?.[1], 1, value.controlTeam?.id);
  showFeedback(value.feedback);
}

function connect() {
  if (!sessionId) {
    elements.pairingOverlay.hidden = previewMode;
    return;
  }
  localStorage.setItem("youteachPublicBoardSession", sessionId);
  elements.pairingOverlay.hidden = true;
  if (unsubscribe) unsubscribe();
  unsubscribe = subscribePublicContest(sessionId, render);
}

elements.pairBoardBtn.addEventListener("click", async () => {
  try {
    elements.pairingMessage.textContent = "Connecting...";
    sessionId = await pairPublicBoard(elements.pairingInput.value);
    elements.pairingMessage.textContent = "";
    connect();
  } catch (error) {
    elements.pairingMessage.textContent = error.message;
  }
});

elements.pairingInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") elements.pairBoardBtn.click();
});

window.setInterval(() => {
  if (!current) return;
  const now = Date.now();
  const roundRemaining = current.roundTimer?.status === "running"
    ? Math.max(0, current.roundTimer.remainingMs - (now - current.roundTimer.projectedAt))
    : current.roundTimer?.remainingMs;
  const responseRemaining = current.responseTimer?.status === "running"
    ? Math.max(0, current.responseTimer.remainingMs - (now - current.responseTimer.projectedAt))
    : current.responseTimer?.remainingMs;
  elements.roundTimer.textContent = formatTimer(roundRemaining);
  elements.responseTimer.textContent = formatTimer(responseRemaining);
}, 200);

connect();
