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

requireTeacherAuth();

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupSelect = document.getElementById("groupSelect");
const numTeamsInput = document.getElementById("numTeams");
const createTeamsBtn = document.getElementById("createTeams");
const resetSessionBtn = document.getElementById("resetSession");
const closeSessionBtn = document.getElementById("closeSessionBtn");

const openRoundBtn = document.getElementById("openRoundBtn");
const wrongAnswerBtn = document.getElementById("wrongAnswerBtn");
const closeRoundBtn = document.getElementById("closeRoundBtn");
const resetActivityScoresBtn = document.getElementById("resetActivityScoresBtn");
const awardTeamPointBtn = document.getElementById("awardTeamPointBtn");
const awardStudentPointBtn = document.getElementById("awardStudentPointBtn");
const resetLivePointsBtn = document.getElementById("resetLivePointsBtn");
const applyStudentPointsBtn = document.getElementById("applyStudentPointsBtn");
const applyTeamPointsBtn = document.getElementById("applyTeamPointsBtn");

const activeBlockLabel = document.getElementById("activeBlockLabel");
const blockStatusLabel = document.getElementById("blockStatusLabel");
const sessionStatusLabel = document.getElementById("sessionStatusLabel");
const studentCountLabel = document.getElementById("studentCountLabel");
const presentTodayLabel = document.getElementById("presentTodayLabel");

const resultGroup = document.getElementById("resultGroup");
const resultRound = document.getElementById("resultRound");
const resultBuzz = document.getElementById("resultBuzz");
const resultLocked = document.getElementById("resultLocked");
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
  if (sessionCache?.groupName && groups.includes(sessionCache.groupName)) {
    return sessionCache.groupName;
  }

  const storedGroup = getStoredWorkingGroup();
  if (storedGroup && groups.includes(storedGroup)) {
    return storedGroup;
  }

  return groups[0] || "";
}

function getAllTeamLabels() {
  const labels = Object.values(sessionCache?.assignments || {});
  return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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

function getQueuedEntryForTeam(teamLabel) {
  return getQueue().find((entry) => entry?.team === teamLabel) || null;
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
  const presentCount = activePresentStudentsForGroup(selectedGroup).length;
  studentCountLabel.textContent = String(presentCount);
  if (presentTodayLabel) presentTodayLabel.textContent = String(presentCount);
}

function renderResult() {
  if (!sessionCache?.active) {
    resultGroup.textContent = groupSelect.value || "---";
    resultRound.textContent = "CLOSED";
    resultBuzz.textContent = "None yet";
    resultLocked.textContent = "0";
    teacherStatusNote.textContent = "No active session.";
    return;
  }

  const buzzer = getBuzzerState();
  const currentBuzz = buzzer.currentBuzz || null;
  const lockedCount = Object.keys(getLockedOutTeams()).length;
  const queuedCount = getQueue().length;

  resultGroup.textContent = sessionCache.groupName || groupSelect.value || "---";
  resultRound.textContent = buzzer.roundOpen ? "OPEN" : "CLOSED";
  resultBuzz.textContent = currentBuzz ? `${currentBuzz.team} - ${currentBuzz.name}` : "Waiting";
  resultLocked.textContent = String(lockedCount);

  if (!buzzer.roundOpen) {
    teacherStatusNote.textContent = "Round is closed.";
  } else if (currentBuzz) {
    teacherStatusNote.textContent = `Current turn: ${currentBuzz.team}. Queue size: ${queuedCount}.`;
  } else if (lockedCount >= getAllTeamLabels().length && getAllTeamLabels().length > 0) {
    teacherStatusNote.textContent = "All teams are locked for this round.";
  } else {
    teacherStatusNote.textContent = "Round open. Waiting for teams to buzz.";
  }
}

function bindTeamPlusButtons() {
  const plusButtons = Array.from(document.querySelectorAll(".team-plus-btn"));
  plusButtons.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      const teamLabel = btn.dataset.teamLabel || "";
      if (!teamLabel || !sessionCache?.active) return;

      const currentScore = Number(sessionCache.activityScores?.[teamLabel] || 0);
      await update(ref(db, "session/current/activityScores"), { [teamLabel]: currentScore + 1 });
    });
  });
}

function renderTeamRoster() {
  if (!sessionCache?.active) {
    teamRosterList.innerHTML = '<div class="empty-state">No active session.</div>';
    teamSelectionNote.textContent = 'Use +1 on the team card to add score quickly.';
    return;
  }

  const activityScores = sessionCache.activityScores || {};
  const lockedOutTeams = getLockedOutTeams();
  const queue = getQueue();
  const currentTeam = getCurrentTeam();
  const orderedTeams = getOrderedTeamLabels();

  if (!orderedTeams.length) {
    teamRosterList.innerHTML = '<div class="empty-state">No teams yet.</div>';
    teamSelectionNote.textContent = 'Use +1 on the team card to add score quickly.';
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
          <strong>${teamLabel}</strong>
          <span class="team-score-chip">${Number(activityScores[teamLabel] || 0)} pts</span>
        </div>
        <div class="team-meta-row">
          ${stateChip}
        </div>
        <div class="team-members">${membersHtml}</div>
        <div class="team-actions">
          <button type="button" class="team-plus-btn" data-team-label="${teamLabel}">+1</button>
        </div>
      </div>
    `;
  }).join("");

  bindTeamPlusButtons();
  teamSelectionNote.textContent = 'Use +1 on the team card to add score quickly.';
}

function renderLiveScores() {
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

groupSelect.addEventListener("change", () => {
  setStoredWorkingGroup(groupSelect.value || "");
  renderHeader();
  renderResult();
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

  const sourceEntries = activePresentStudentsForGroup(groupName);

  if (!sourceEntries.length) {
    alert("There are no active students for this group right now.");
    return;
  }

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

  const queue = getQueue().filter((entry) => entry?.team !== currentBuzz.team);
  const nextEntry = queue[0] || null;
  const allTeams = getAllTeamLabels();
  const allLocked = allTeams.length > 0 && allTeams.every((teamLabel) => lockedOutTeams[teamLabel]);

  await update(ref(db, "session/current/buzzer"), {
    lockedOutTeams,
    queue,
    currentBuzz: nextEntry,
    roundOpen: allLocked ? false : true
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

awardTeamPointBtn.addEventListener("click", async () => {
  const currentBuzz = getBuzzerState().currentBuzz;
  if (!currentBuzz) {
    alert("No current team.");
    return;
  }

  const teamLabel = currentBuzz.team;
  const currentPoints = Number(sessionCache.liveTeamPoints?.[teamLabel] || 0);
  await update(ref(db, "session/current/liveTeamPoints"), { [teamLabel]: currentPoints + 1 });
});

awardStudentPointBtn.addEventListener("click", async () => {
  const currentBuzz = getBuzzerState().currentBuzz;
  if (!currentBuzz) {
    alert("No current team.");
    return;
  }

  const studentKey = currentBuzz.studentKey;
  const currentPoints = Number(sessionCache.liveStudentPoints?.[studentKey] || 0);
  await update(ref(db, "session/current/liveStudentPoints"), { [studentKey]: currentPoints + 1 });
});

resetLivePointsBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  const teamPoints = {};
  Object.keys(sessionCache.liveTeamPoints || {}).forEach((teamLabel) => {
    teamPoints[teamLabel] = 0;
  });

  await update(ref(db, "session/current"), {
    liveTeamPoints: teamPoints,
    liveStudentPoints: {}
  });
});

applyStudentPointsBtn.addEventListener("click", async () => {
  if (!assertBlockOpen()) return;

  const sessionSnapshot = await get(ref(db, "session/current"));
  const session = sessionSnapshot.val();

  if (!session?.active) {
    alert("No active session.");
    return;
  }

  const pendingEntries = Object.entries(session.liveStudentPoints || {});
  if (!pendingEntries.length) {
    alert("There are no pending student points.");
    return;
  }

  for (const [studentKey, pointsToAdd] of pendingEntries) {
    const studentSnapshot = await get(ref(db, `students/${studentKey}`));
    const student = studentSnapshot.val();
    if (!student) continue;

    const blockPoints = ensureBlockPointsObject(student);
    const previousPoints = Number(blockPoints[activeBlockCache] || 0);
    const addValue = Number(pointsToAdd || 0);
    blockPoints[activeBlockCache] = previousPoints + addValue;

    await update(ref(db, `students/${studentKey}`), { blockPoints });

    const logRef = push(ref(db, "pointsLog"));
    await set(logRef, {
      type: "student",
      block: activeBlockCache,
      studentKey,
      studentName: getFirstName(student),
      addedPoints: addValue,
      previousPoints,
      newPoints: blockPoints[activeBlockCache],
      groupName: session.groupName || "",
      appliedAt: Date.now()
    });
  }

  await set(ref(db, "session/current/liveStudentPoints"), {});
  alert("Student live points applied.");
});

applyTeamPointsBtn.addEventListener("click", async () => {
  if (!assertBlockOpen()) return;

  const sessionSnapshot = await get(ref(db, "session/current"));
  const session = sessionSnapshot.val();

  if (!session?.active) {
    alert("No active session.");
    return;
  }

  const teamPoints = session.liveTeamPoints || {};
  const assignments = session.assignments || {};
  const hasAnyTeamPoints = Object.values(teamPoints).some((value) => Number(value) > 0);

  if (!hasAnyTeamPoints) {
    alert("There are no live team points.");
    return;
  }

  for (const [studentKey, teamLabel] of Object.entries(assignments)) {
    const teamValue = Number(teamPoints[teamLabel] || 0);
    if (teamValue <= 0) continue;

    const studentSnapshot = await get(ref(db, `students/${studentKey}`));
    const student = studentSnapshot.val();
    if (!student) continue;

    const blockPoints = ensureBlockPointsObject(student);
    const previousPoints = Number(blockPoints[activeBlockCache] || 0);
    blockPoints[activeBlockCache] = previousPoints + teamValue;

    await update(ref(db, `students/${studentKey}`), { blockPoints });

    const logRef = push(ref(db, "pointsLog"));
    await set(logRef, {
      type: "team",
      block: activeBlockCache,
      teamLabel,
      studentKey,
      studentName: getFirstName(student),
      addedPoints: teamValue,
      previousPoints,
      newPoints: blockPoints[activeBlockCache],
      groupName: session.groupName || "",
      appliedAt: Date.now()
    });
  }

  const resetTeamPoints = {};
  Object.keys(teamPoints).forEach((teamLabel) => {
    resetTeamPoints[teamLabel] = 0;
  });

  await set(ref(db, "session/current/liveTeamPoints"), resetTeamPoints);
  alert("Team live points applied.");
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
  sessionCache = snapshot.val() || null;
  if (sessionCache?.groupName) {
    setStoredWorkingGroup(sessionCache.groupName);
  }
  renderGroupOptions();
  renderHeader();
  renderResult();
  renderTeamRoster();
  renderLiveScores();
});

numTeamsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    createTeamsBtn.click();
  }
});