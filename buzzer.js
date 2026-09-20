import { db } from "./firebase.js";
import {
  ref,
  push,
  set,
  get,
  update,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { openAssignmentsModule } from "./assignment-module-launcher.js?v=popup-library-20260920";

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupSelect = document.getElementById("groupSelect");
const numTeamsInput = document.getElementById("numTeams");
const teamSourceSelect = document.getElementById("teamSourceSelect");
const teamSourceStudentCount = document.getElementById("teamSourceStudentCount");
const openAssignmentsModuleBtn = document.getElementById("openAssignmentsModuleBtn");
const createTeamsBtn = document.getElementById("createTeams");
const printTeamsBtn = document.getElementById("printTeamsBtn");
const printNameModeSelect = document.getElementById("printNameModeSelect");
const resetSessionBtn = document.getElementById("resetSession");
const closeSessionBtn = document.getElementById("closeSessionBtn");

const openRoundBtn = document.getElementById("openRoundBtn");
const wrongAnswerBtn = document.getElementById("wrongAnswerBtn");
const closeRoundBtn = document.getElementById("closeRoundBtn");
const resetActivityScoresBtn = document.getElementById("resetActivityScoresBtn");
const markCorrectBtn = document.getElementById("markCorrectBtn");
const finishActivityBtn = document.getElementById("finishActivityBtn");

const activeBlockLabel = document.getElementById("activeBlockLabel");
const blockStatusLabel = document.getElementById("blockStatusLabel");
const sessionStatusLabel = document.getElementById("sessionStatusLabel");
const studentCountLabel = document.getElementById("studentCountLabel");
const presentTodayLabel = document.getElementById("presentTodayLabel");

const contextGroupLabel = document.getElementById("contextGroupLabel");
const roundStatusChip = document.getElementById("roundStatusChip");
const resultGroup = document.getElementById("resultGroup");
const resultRound = document.getElementById("resultRound");
const resultBuzz = document.getElementById("resultBuzz");
const resultLocked = document.getElementById("resultLocked");
const resultPosition = document.getElementById("resultPosition");
const teacherStatusNote = document.getElementById("teacherStatusNote");
const liveScores = document.getElementById("liveScores");
const teamRosterList = document.getElementById("teamRosterList");
const teamSelectionNote = document.getElementById("teamSelectionNote");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let pairHistoryCache = {};
let sessionCache = null;
let settingsCache = {};
let activeBlockCache = "Block 1";
let groupsCache = {};

let teacherAudioContext = null;
let buzzAudioStateInitialized = false;
let lastObservedBuzzToken = "";

function ensureTeacherAudioContext() {
  if (!teacherAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    teacherAudioContext = new AudioContextClass();
  }
  return teacherAudioContext;
}

function primeTeacherAudio() {
  const context = ensureTeacherAudioContext();
  if (context?.state === "suspended") {
    context.resume().catch(() => {});
  }
}

function playTeacherBuzzAlert() {
  const context = ensureTeacherAudioContext();
  if (!context) return;

  const play = () => {
    const start = context.currentTime + 0.01;
    const tones = [
      { frequency: 880, offset: 0, duration: 0.13 },
      { frequency: 1175, offset: 0.16, duration: 0.18 }
    ];

    tones.forEach(({ frequency, offset, duration }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = start + offset;
      const toneEnd = toneStart + duration;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, toneStart);
      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(0.28, toneStart + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);
    });
  };

  if (context.state === "suspended") {
    context.resume().then(play).catch(() => {});
  } else {
    play();
  }
}

function getBuzzAudioToken(currentBuzz) {
  if (!currentBuzz) return "";
  return [
    currentBuzz.timestamp || "",
    currentBuzz.studentKey || currentBuzz.id || currentBuzz.name || "",
    currentBuzz.team || ""
  ].join("|");
}

function handleTeacherBuzzAudio(nextSession) {
  const currentBuzz = nextSession?.buzzer?.currentBuzz || null;
  const token = getBuzzAudioToken(currentBuzz);

  if (!buzzAudioStateInitialized) {
    buzzAudioStateInitialized = true;
    lastObservedBuzzToken = token;
    return;
  }

  if (!token) {
    lastObservedBuzzToken = "";
    return;
  }

  if (token !== lastObservedBuzzToken) {
    lastObservedBuzzToken = token;
    playTeacherBuzzAlert();
  }
}

window.addEventListener("pointerdown", primeTeacherAudio, { once: true, capture: true });
window.addEventListener("keydown", primeTeacherAudio, { once: true, capture: true });

function getDisplayName(student) {
  return (student?.nickname || student?.fullName || student?.name || "Student").trim();
}

function getFirstName(student) {
  const full = (student?.fullName || student?.name || "").trim();
  if (!full) return student?.nickname || "Student";
  return full.split(/\s+/)[0];
}

function ensureBlockPointsObject(student) {
  return {
    "Block 1": Number(student?.blockPoints?.["Block 1"] || 0),
    "Block 2": Number(student?.blockPoints?.["Block 2"] || 0),
    "Block 3": Number(student?.blockPoints?.["Block 3"] || 0)
  };
}

function isBlockClosed(blockName) {
  return Boolean(settingsCache?.closedBlocks?.[blockName]);
}

function assertBlockOpen(blockName = activeBlockCache) {
  if (isBlockClosed(blockName)) {
    alert(`The block (${blockName}) is closed. Reopen it first if you want to apply points.`);
    return false;
  }
  return true;
}

function getPairKey(a, b) {
  return [a, b].sort().join("__");
}

function getTeamPenalty(teamMembers, candidateKey) {
  let score = 0;
  for (const memberKey of teamMembers) {
    score += Number(pairHistoryCache[getPairKey(memberKey, candidateKey)] || 0);
  }
  return score;
}

function createEmptyTeams(numTeams) {
  const teams = [];
  for (let i = 1; i <= numTeams; i += 1) {
    teams.push({
      key: `team${i}`,
      label: `Team ${i}`,
      memberKeys: [],
      memberNames: []
    });
  }
  return teams;
}

function buildSmartTeams(studentEntries, numTeams) {
  const shuffled = [...studentEntries].sort(() => Math.random() - 0.5);
  const teams = createEmptyTeams(numTeams);

  for (const [studentKey, student] of shuffled) {
    let bestTeamIndex = 0;
    let bestScore = Infinity;

    for (let i = 0; i < teams.length; i += 1) {
      const team = teams[i];
      const sizePenalty = team.memberKeys.length * 1000;
      const historyPenalty = getTeamPenalty(team.memberKeys, studentKey);
      const totalScore = sizePenalty + historyPenalty;

      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestTeamIndex = i;
      }
    }

    teams[bestTeamIndex].memberKeys.push(studentKey);
    teams[bestTeamIndex].memberNames.push(getDisplayName(student));
  }

  return teams;
}

async function savePairHistory(teams) {
  const updates = {};

  for (const team of teams) {
    for (let i = 0; i < team.memberKeys.length; i += 1) {
      for (let j = i + 1; j < team.memberKeys.length; j += 1) {
        const pairKey = getPairKey(team.memberKeys[i], team.memberKeys[j]);
        updates[`pairHistory/${pairKey}`] = Number(pairHistoryCache[pairKey] || 0) + 1;
      }
    }
  }

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

function activePresentStudentsForGroup(groupName) {
  return Object.entries(studentsCache || {})
    .filter(([, student]) => {
      const activeNow = student?.activeNow === true;
      const groupOk = !groupName || (student?.groupName || "") === groupName;
      return activeNow && groupOk;
    });
}

function allStudentsForGroup(groupName) {
  return Object.entries(studentsCache || {})
    .filter(([, student]) => {
      const groupOk = !groupName || (student?.groupName || "") === groupName;
      return groupOk;
    });
}

function studentsForTeams(groupName) {
  const mode = teamSourceSelect?.value || "present";

  if (mode === "all") {
    return {
      entries: allStudentsForGroup(groupName),
      mode: "all"
    };
  }

  return {
    entries: activePresentStudentsForGroup(groupName),
    mode: "present"
  };
}

function selectedSourceCount(groupName) {
  if (!groupName) return 0;
  return studentsForTeams(groupName).entries.length;
}

function buildAssignmentsModuleContext() {
  if (!sessionCache?.active) return null;

  const assignments = sessionCache.assignments || {};
  const teams = getAllTeamLabels().map((label) => ({
    label,
    memberKeys: Object.entries(assignments)
      .filter(([, teamLabel]) => teamLabel === label)
      .map(([studentKey]) => studentKey)
  })).filter((team) => team.memberKeys.length);

  if (!teams.length) return null;

  return {
    source: "team-creator",
    groupName: sessionCache.groupName || groupSelect.value || "",
    sessionCreatedAt: Number(sessionCache.createdAt || 0),
    teamSourceMode: sessionCache.teamSourceMode || "present",
    teams
  };
}

function renderAssignmentsModuleButton() {
  if (!openAssignmentsModuleBtn) return;
  const context = buildAssignmentsModuleContext();
  openAssignmentsModuleBtn.disabled = !context;
  openAssignmentsModuleBtn.title = context
    ? "Open Assignments for the generated teams"
    : "Generate teams first";
}

function todayKey() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

function getStoredWorkingGroup() {
  return sessionStorage.getItem(WORKING_GROUP_KEY) || "";
}

function setStoredWorkingGroup(groupName) {
  if (groupName) {
    sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  } else {
    sessionStorage.removeItem(WORKING_GROUP_KEY);
  }
}

function getPreferredGroup(groups) {
  const storedGroup = getStoredWorkingGroup();
  if (storedGroup && groups.includes(storedGroup)) {
    return storedGroup;
  }

  if (sessionCache?.groupName && groups.includes(sessionCache.groupName)) {
    return sessionCache.groupName;
  }

  return groups[0] || "";
}

function getAllTeamLabels() {
  const labels = Object.values(sessionCache?.assignments || {});
  return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getActiveTeamLabels() {
  const assignments = sessionCache?.assignments || {};
  const labels = new Set();

  Object.entries(assignments).forEach(([studentKey, teamLabel]) => {
    const student = studentsCache?.[studentKey];
    const inSessionGroup = !sessionCache?.groupName || (student?.groupName || "") === sessionCache.groupName;
    if (teamLabel && student?.activeNow === true && inSessionGroup) {
      labels.add(teamLabel);
    }
  });

  return Array.from(labels).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getBuzzerState() {
  return sessionCache?.buzzer || {
    roundOpen: false,
    currentBuzz: null,
    queue: [],
    lockedOutTeams: {}
  };
}

function getQueue() {
  const queue = getBuzzerState().queue;
  return Array.isArray(queue) ? queue : [];
}

function getLockedOutTeams() {
  return getBuzzerState().lockedOutTeams || {};
}

function getCurrentTeam() {
  return getBuzzerState().currentBuzz?.team || "";
}

function getTeamMembersByLabel(teamLabel) {
  const assignments = sessionCache?.assignments || {};
  return Object.entries(assignments)
    .filter(([, assignedLabel]) => assignedLabel === teamLabel)
    .map(([studentKey]) => getDisplayName(studentsCache[studentKey]))
    .filter(Boolean);
}

function getOrderedTeamLabels() {
  const allTeams = getAllTeamLabels();
  const currentTeam = getCurrentTeam();
  const queue = getQueue();
  const lockedOutTeams = getLockedOutTeams();

  const queuedTeams = queue
    .map((entry) => entry?.team)
    .filter((teamLabel) => teamLabel && teamLabel !== currentTeam && !lockedOutTeams[teamLabel]);

  const remainingTeams = allTeams.filter((teamLabel) => {
    return (
      teamLabel !== currentTeam &&
      !queuedTeams.includes(teamLabel) &&
      !lockedOutTeams[teamLabel]
    );
  });

  const lockedTeams = allTeams.filter((teamLabel) => lockedOutTeams[teamLabel]);

  const ordered = [];
  if (currentTeam) ordered.push(currentTeam);
  ordered.push(...queuedTeams);
  ordered.push(...remainingTeams);
  ordered.push(...lockedTeams);

  return ordered;
}

function renderGroupOptions() {
  const groups = Object.keys(groupsCache || {}).sort();
  const preferredGroup = getPreferredGroup(groups);

  groupSelect.innerHTML = '<option value="">Select group</option>' + groups.map((group) => `<option value="${group}">${group}</option>`).join("");

  if (preferredGroup) {
    groupSelect.value = preferredGroup;
    setStoredWorkingGroup(preferredGroup);
  }
}

function renderHeader() {
  const selectedGroup = groupSelect.value;
  activeBlockLabel.textContent = activeBlockCache;
  blockStatusLabel.textContent = isBlockClosed(activeBlockCache) ? "CLOSED" : "OPEN";
  sessionStatusLabel.textContent = sessionCache?.active ? "Active session" : "No active session";

  const presentCount = selectedGroup ? activePresentStudentsForGroup(selectedGroup).length : 0;
  const sourceCount = selectedSourceCount(selectedGroup);

  studentCountLabel.textContent = String(sourceCount);
  if (teamSourceStudentCount) teamSourceStudentCount.textContent = String(sourceCount);
  if (presentTodayLabel) presentTodayLabel.textContent = String(presentCount);
}

function renderResult() {
  const groupText = sessionCache?.groupName || groupSelect.value || "---";
  const buzzer = getBuzzerState();
  const currentBuzz = buzzer.currentBuzz || null;
  const lockedCount = Object.keys(getLockedOutTeams()).length;
  const queuedCount = getQueue().length;

  const isRoundClosed = !sessionCache?.active || !buzzer.roundOpen;
  const isWaiting = Boolean(sessionCache?.active && buzzer.roundOpen && currentBuzz);
  const isOpen = Boolean(sessionCache?.active && buzzer.roundOpen && !currentBuzz);

  if (contextGroupLabel) {
    contextGroupLabel.textContent = groupText;
  }

  if (roundStatusChip) {
    roundStatusChip.classList.remove("open", "waiting");

    if (isWaiting) {
      roundStatusChip.textContent = "WAITING";
      roundStatusChip.classList.add("waiting");
    } else if (isOpen) {
      roundStatusChip.textContent = "OPEN";
      roundStatusChip.classList.add("open");
    } else {
      roundStatusChip.textContent = "CLOSED";
    }
  }

  if (resultBuzz) resultBuzz.textContent = currentBuzz?.name || "Waiting for a student";
  if (resultGroup) resultGroup.textContent = currentBuzz?.team || "---";
  if (resultRound) resultRound.textContent = isWaiting ? "DECISION REQUIRED" : (isOpen ? "OPEN" : "CLOSED");
  if (resultPosition) resultPosition.textContent = currentBuzz ? "1st" : "---";
  if (resultLocked) resultLocked.textContent = String(lockedCount);

  if (!sessionCache?.active) {
    teacherStatusNote.textContent = "No active session.";
    return;
  }

  if (isRoundClosed) {
    teacherStatusNote.textContent = "Round is closed.";
  } else if (isWaiting) {
    teacherStatusNote.textContent = `Waiting for decision: ${currentBuzz.name} · ${currentBuzz.team}.`;
  } else {
    const activeTeams = getActiveTeamLabels();
    const activeTeamsAllLocked =
      activeTeams.length > 0 &&
      activeTeams.every((teamLabel) => Boolean(getLockedOutTeams()[teamLabel]));

    if (activeTeamsAllLocked) {
      teacherStatusNote.textContent = "All active teams are locked. Round closed.";
    } else {
      teacherStatusNote.textContent = "Round open. Waiting for the first team to buzz.";
    }
  }
}

function bindTeamScoreButtons() {
  const buttons = Array.from(document.querySelectorAll(".team-score-btn"));
  buttons.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      const teamLabel = btn.dataset.teamLabel || "";
      const delta = Number(btn.dataset.delta || 0);
      if (!teamLabel || !sessionCache?.active || !delta) return;

      const currentScore = Number(sessionCache.activityScores?.[teamLabel] || 0);
      const nextScore = Math.max(0, currentScore + delta);
      await update(ref(db, "session/current/activityScores"), { [teamLabel]: nextScore });
    });
  });
}

function renderTeamRoster() {
  if (!sessionCache?.active) {
    teamRosterList.innerHTML = '<div class="empty-state">No active session.</div>';
    teamSelectionNote.textContent = 'Use + / - on the team card to change score quickly.';
    return;
  }

  const activityScores = sessionCache.activityScores || {};
  const lockedOutTeams = getLockedOutTeams();
  const queue = getQueue();
  const currentTeam = getCurrentTeam();
  const orderedTeams = getOrderedTeamLabels();

  if (!orderedTeams.length) {
    teamRosterList.innerHTML = '<div class="empty-state">No teams yet.</div>';
    teamSelectionNote.textContent = 'Use + / - on the team card to change score quickly.';
    return;
  }

  teamRosterList.innerHTML = orderedTeams.map((teamLabel) => {
    const members = getTeamMembersByLabel(teamLabel);
    const membersHtml = members.length
      ? members.map((name) => `<span class="team-member-chip">${name}</span>`).join("")
      : '<span class="empty-state">No members</span>';

    const queueIndex = queue.findIndex((entry) => entry?.team === teamLabel);
    const isCurrent = currentTeam === teamLabel;
    const isLocked = Boolean(lockedOutTeams[teamLabel]);
    const isQueued = !isCurrent && queueIndex >= 0;

    const stateClass = isCurrent ? " current" : (isQueued ? " queued" : (isLocked ? " locked" : ""));
    let stateChip = '<span class="team-state-chip">Ready</span>';

    if (isCurrent) {
      stateChip = '<span class="team-state-chip current">Current</span>';
    } else if (isQueued) {
      stateChip = `<span class="team-state-chip queued">Queued #${queueIndex + 1}</span>`;
    } else if (isLocked) {
      stateChip = '<span class="team-state-chip locked">Locked this round</span>';
    }

    return `
      <div class="team-roster-card${stateClass}">
        <div class="team-roster-top">
          <div class="team-roster-left">
            <strong>${teamLabel}</strong>
            ${stateChip}
          </div>
          <div class="team-roster-right">
            <span class="team-score-chip">${Number(activityScores[teamLabel] || 0)} pts</span>
            <div class="team-actions">
              <button type="button" class="team-score-btn" data-team-label="${teamLabel}" data-delta="-1">-</button>
              <button type="button" class="team-score-btn" data-team-label="${teamLabel}" data-delta="1">+</button>
            </div>
          </div>
        </div>
        <div class="team-members">${membersHtml}</div>
      </div>
    `;
  }).join("");

  bindTeamScoreButtons();
  teamSelectionNote.textContent = 'Use + / - on the team card to change score quickly.';
}

function renderLiveScores() {
  if (!liveScores) return;
  if (!sessionCache?.active) {
    liveScores.innerHTML = '<div class="empty-state">No active session.</div>';
    return;
  }

  const activityScores = sessionCache.activityScores || {};
  const orderedTeams = Object.keys(activityScores).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const teamCards = orderedTeams.map((teamLabel) => {
    return `
      <div class="live-score-card">
        <div class="live-score-top">
          <strong>${teamLabel}</strong>
          <span class="live-score-points">${Number(activityScores[teamLabel] || 0)} pts</span>
        </div>
      </div>
    `;
  });

  liveScores.innerHTML = teamCards.join("") || '<div class="empty-state">No activity scores yet.</div>';
}


function getPrintableStudentName(student) {
  const mode = printNameModeSelect?.value || "nickname";
  const nickname = (student?.nickname || "").trim();
  const fullName = (student?.fullName || student?.name || "").trim();

  if (mode === "fullName") {
    return fullName || nickname || "Student";
  }

  return nickname || fullName || "Student";
}

function printTeamsPdf() {
  if (!sessionCache?.active) {
    alert("No active session with teams to print.");
    return;
  }

  const groupName = sessionCache.groupName || groupSelect.value || "";
  const sourceMode = sessionCache.teamSourceMode === "all" ? "All students" : "Present students";
  const teams = sessionCache.teams || {};
  const assignments = sessionCache.assignments || {};
  const nowText = new Date().toLocaleString();

  const teamLabels = Object.keys(teams)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const rowsHtml = teamLabels.map((teamKey) => {
    const label = teamKey.replace(/^team/i, "Team ");
    const studentKeys = Object.entries(assignments)
      .filter(([, teamLabel]) => teamLabel === label)
      .map(([studentKey]) => studentKey);

    const fallbackNames = Array.isArray(teams[teamKey]) ? teams[teamKey] : [];

    const members = studentKeys.length
      ? studentKeys.map((studentKey) => {
          const student = studentsCache[studentKey] || {};
                    const externalId = student.studentNumber || student.id || "";
          const printableName = getPrintableStudentName(student);
          return `${printableName}${externalId ? ` (${externalId})` : ""}`;
        })
      : fallbackNames;

    return `
      <section class="team-card">
        <h2>${label}</h2>
        <ol>
          ${members.map((name) => `<li>${name}</li>`).join("")}
        </ol>
      </section>
    `;
  }).join("");

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Popup blocked. Allow popups for this site and try again.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>YouTeach Teams</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #0f172a;
          padding: 24px;
        }

        .header {
          border-bottom: 2px solid #0f172a;
          padding-bottom: 12px;
          margin-bottom: 18px;
        }

        h1 {
          margin: 0 0 6px 0;
          font-size: 28px;
        }

        .meta {
          font-size: 13px;
          color: #475569;
          line-height: 1.5;
        }

        .teams {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .team-card {
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 12px 16px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .team-card h2 {
          margin: 0 0 8px 0;
          font-size: 18px;
        }

        ol {
          margin: 0;
          padding-left: 22px;
        }

        li {
          margin: 5px 0;
          font-size: 14px;
        }

        @media print {
          body {
            padding: 0;
          }

          .teams {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>YouTeach Teams</h1>
        <div class="meta">
          Group: ${groupName || "---"}<br>
          Source: ${sourceMode}<br>
          Generated: ${nowText}
        </div>
      </div>

      <div class="teams">
        ${rowsHtml}
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

groupSelect.addEventListener("change", () => {
  setStoredWorkingGroup(groupSelect.value || "");
  renderHeader();
  renderResult();
});

teamSourceSelect.addEventListener("change", () => {
  renderHeader();
});

openAssignmentsModuleBtn?.addEventListener("click", () => {
  const context = buildAssignmentsModuleContext();
  if (!context) {
    alert("Generate teams first.");
    return;
  }
  openAssignmentsModule(context);
});

createTeamsBtn.addEventListener("click", async () => {
  const numTeams = parseInt(numTeamsInput.value, 10);
  const groupName = groupSelect.value;

  if (!groupName) {
    alert("Select a group first.");
    return;
  }

  if (!numTeams || numTeams < 1) {
    alert("Please enter a valid number of teams.");
    return;
  }

    const teamSource = studentsForTeams(groupName);
    let sourceEntries = teamSource.entries;

  if (!sourceEntries.length && teamSource.mode !== "present") {
    alert("There are no students in this group.");
    return;
  }

  if (teamSource.mode === "all") {
    const presentCount = activePresentStudentsForGroup(groupName).length;
    const totalCount = sourceEntries.length;
    const proceed = confirm(`Generate teams using ALL students in this group? Present now: ${presentCount}. Total in group: ${totalCount}.`);
    if (!proceed) return;
  }

  if (teamSource.mode === "present" && !sourceEntries.length) {
    const totalCount = allStudentsForGroup(groupName).length;
    const useAll = confirm(`No students are marked present. Use ALL students in this group instead? Total: ${totalCount}.`);
    if (!useAll) return;
    teamSource.entries = allStudentsForGroup(groupName);
    teamSource.mode = "all";
  }

  sourceEntries = teamSource.entries;
  const smartTeams = buildSmartTeams(sourceEntries, numTeams);

  const sessionTeams = {};
  const assignments = {};
  const liveTeamPoints = {};
  const activityScores = {};

  for (const team of smartTeams) {
    sessionTeams[team.key] = team.memberNames;
    liveTeamPoints[team.label] = 0;
    activityScores[team.label] = 0;

    for (const memberKey of team.memberKeys) {
      assignments[memberKey] = team.label;
    }
  }

    await set(ref(db, "session/current"), {
    active: true,
    createdAt: Date.now(),
    groupName,
    teamSourceMode: teamSource.mode,
    teams: sessionTeams,
    assignments,
    liveTeamPoints,
    liveStudentPoints: {},
    activityScores,
    buzzer: {
      roundOpen: false,
      currentBuzz: null,
      queue: [],
      lockedOutTeams: {}
    }
  });

  setStoredWorkingGroup(groupName);
  await savePairHistory(smartTeams);
  alert("Smart teams created.");
});

resetSessionBtn.addEventListener("click", async () => {
  await remove(ref(db, "session/current"));
  alert("Session cleared.");
});

closeSessionBtn.addEventListener("click", async () => {
  const sessionSnapshot = await get(ref(db, "session/current"));
  const session = sessionSnapshot.val();

  if (!session?.active) {
    alert("No active session.");
    return;
  }

  const historyRef = push(ref(db, "sessionHistory"));
  await set(historyRef, {
    ...session,
    block: activeBlockCache,
    status: "closed",
    closedAt: Date.now()
  });

  await remove(ref(db, "session/current"));
  alert("Session closed and saved.");
});

openRoundBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  await update(ref(db, "session/current/buzzer"), {
    roundOpen: true,
    currentBuzz: null,
    queue: [],
    lockedOutTeams: {}
  });
});

wrongAnswerBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  const buzzer = getBuzzerState();
  const currentBuzz = buzzer.currentBuzz;

  if (!currentBuzz) {
    alert("No current team.");
    return;
  }

  const lockedOutTeams = { ...(buzzer.lockedOutTeams || {}) };
  lockedOutTeams[currentBuzz.team] = true;

  const activeTeams = getActiveTeamLabels();
  if (currentBuzz.team && !activeTeams.includes(currentBuzz.team)) {
    activeTeams.push(currentBuzz.team);
  }

  const allActiveTeamsLocked =
    activeTeams.length > 0 &&
    activeTeams.every((teamLabel) => lockedOutTeams[teamLabel]);

  await update(ref(db, "session/current/buzzer"), {
    lockedOutTeams,
    queue: [],
    currentBuzz: null,
    roundOpen: !allActiveTeamsLocked
  });
});

closeRoundBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  await update(ref(db, "session/current/buzzer"), {
    roundOpen: false,
    currentBuzz: null,
    queue: [],
    lockedOutTeams: {}
  });
});

resetActivityScoresBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  const resetScores = {};
  Object.keys(sessionCache.activityScores || {}).forEach((teamLabel) => {
    resetScores[teamLabel] = 0;
  });

  await set(ref(db, "session/current/activityScores"), resetScores);
});

markCorrectBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  const currentBuzz = getBuzzerState().currentBuzz;
  if (!currentBuzz?.team) {
    alert("No team has buzzed.");
    return;
  }

  const currentScore = Number(sessionCache.activityScores?.[currentBuzz.team] || 0);
  await update(ref(db, "session/current"), {
    [`activityScores/${currentBuzz.team}`]: currentScore + 1,
    "buzzer/roundOpen": false,
    "buzzer/currentBuzz": null,
    "buzzer/queue": [],
    "buzzer/lockedOutTeams": {}
  });
});

finishActivityBtn.addEventListener("click", async () => {
  if (!assertBlockOpen()) return;

  const sessionSnapshot = await get(ref(db, "session/current"));
  const session = sessionSnapshot.val();

  if (!session?.active) {
    alert("No active session.");
    return;
  }

  const scoreEntries = Object.entries(session.activityScores || {});
  const topScore = Math.max(0, ...scoreEntries.map(([, score]) => Number(score || 0)));

  if (topScore <= 0) {
    alert("No activity points have been awarded yet.");
    return;
  }

  const winningTeams = scoreEntries
    .filter(([, score]) => Number(score || 0) === topScore)
    .map(([teamLabel]) => teamLabel);

  const winnerEntries = Object.entries(session.assignments || {})
    .filter(([, teamLabel]) => winningTeams.includes(teamLabel));

  if (!winnerEntries.length) {
    alert("The winning teams have no assigned students.");
    return;
  }

  const winnerNames = [];

  for (const [studentKey, teamLabel] of winnerEntries) {
    const studentSnapshot = await get(ref(db, `students/${studentKey}`));
    const student = studentSnapshot.val();
    if (!student) continue;

    const blockPoints = ensureBlockPointsObject(student);
    const previousPoints = Number(blockPoints[activeBlockCache] || 0);
    blockPoints[activeBlockCache] = previousPoints + 1;
    winnerNames.push(getDisplayName(student));

    await update(ref(db, `students/${studentKey}`), { blockPoints });

    const logRef = push(ref(db, "pointsLog"));
    await set(logRef, {
      type: "activity-winner",
      block: activeBlockCache,
      teamLabel,
      studentKey,
      studentName: getDisplayName(student),
      addedPoints: 1,
      previousPoints,
      newPoints: blockPoints[activeBlockCache],
      groupName: session.groupName || "",
      activityScore: topScore,
      awardedAt: Date.now()
    });
  }

  const historyRef = push(ref(db, "sessionHistory"));
  await set(historyRef, {
    ...session,
    block: activeBlockCache,
    status: "completed",
    winningTeams,
    winnerNames,
    topActivityScore: topScore,
    closedAt: Date.now()
  });

  await remove(ref(db, "session/current"));
  alert(`Activity finished. Winner${winningTeams.length > 1 ? "s" : ""}: ${winningTeams.join(", ")}. One grade point awarded to each winning member.`);
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderHeader();
  renderTeamRoster();
  renderLiveScores();
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupOptions();
  renderHeader();
});

onValue(ref(db, "pairHistory"), (snapshot) => {
  pairHistoryCache = snapshot.val() || {};
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  activeBlockCache = settingsCache.activeBlock || "Block 1";
  renderHeader();
});

onValue(ref(db, "session/current"), (snapshot) => {
  const nextSession = snapshot.val() || null;
  handleTeacherBuzzAudio(nextSession);
  sessionCache = nextSession;
  if (sessionCache?.groupName && !getStoredWorkingGroup()) {
    setStoredWorkingGroup(sessionCache.groupName);
  }
  renderGroupOptions();
  renderHeader();
  renderResult();
  renderTeamRoster();
  renderLiveScores();
  renderAssignmentsModuleButton();
});

if (printTeamsBtn) printTeamsBtn.addEventListener("click", printTeamsPdf);

numTeamsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    createTeamsBtn.click();
  }
});
