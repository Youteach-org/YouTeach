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
const awardActivityScoreBtn = document.getElementById("awardActivityScoreBtn");
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

const resultGroup = document.getElementById("resultGroup");
const resultRound = document.getElementById("resultRound");
const resultBuzz = document.getElementById("resultBuzz");
const resultLocked = document.getElementById("resultLocked");
const teacherStatusNote = document.getElementById("teacherStatusNote");
const liveScores = document.getElementById("liveScores");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let pairHistoryCache = {};
let sessionCache = null;
let settingsCache = {};
let activeBlockCache = "Block 1";
let groupsCache = {};

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
    teams[bestTeamIndex].memberNames.push(getFirstName(student));
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
  studentCountLabel.textContent = String(activePresentStudentsForGroup(selectedGroup).length);
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

  const buzzer = sessionCache.buzzer || {};
  const currentBuzz = buzzer.currentBuzz || null;

  resultGroup.textContent = sessionCache.groupName || groupSelect.value || "---";
  resultRound.textContent = buzzer.roundOpen ? "OPEN" : "CLOSED";
  resultBuzz.textContent = currentBuzz ? `${currentBuzz.name} (${currentBuzz.team})` : "None yet";
  resultLocked.textContent = String(Object.keys(buzzer.lockedOut || {}).length);
  teacherStatusNote.textContent = currentBuzz ? "A student has buzzed." : "Waiting for buzz.";
}

function renderLiveScores() {
  if (!sessionCache?.active) {
    liveScores.innerHTML = '<div class="empty-state">No active session.</div>';
    return;
  }

  const activityScores = sessionCache.activityScores || {};
  const assignments = sessionCache.assignments || {};
  const teamsFromAssignments = {};

  Object.entries(assignments).forEach(([studentKey, teamLabel]) => {
    if (!teamsFromAssignments[teamLabel]) teamsFromAssignments[teamLabel] = [];
    const student = studentsCache[studentKey];
    if (student) teamsFromAssignments[teamLabel].push(getFirstName(student));
  });

  const orderedTeams = Object.keys(activityScores).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const teamCards = orderedTeams.map((teamLabel) => {
    const members = teamsFromAssignments[teamLabel] || [];
    const membersHtml = members.length
      ? members.map((name) => `<span class="team-member-chip">${name}</span>`).join("")
      : '<span class="empty-state">No members</span>';

    return `
      <div class="live-score-card">
        <div class="live-score-top">
          <strong>${teamLabel}</strong>
          <span class="live-score-points">${Number(activityScores[teamLabel] || 0)} pts</span>
        </div>
        <div class="team-members">${membersHtml}</div>
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

  if (!numTeams || numTeams < 2) {
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
      lockedOut: {}
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
    lockedOut: {}
  });
});

wrongAnswerBtn.addEventListener("click", async () => {
  const currentBuzz = sessionCache?.buzzer?.currentBuzz;

  if (!currentBuzz) {
    alert("No current buzz.");
    return;
  }

  const lockedOut = sessionCache.buzzer.lockedOut || {};
  lockedOut[currentBuzz.studentKey] = true;

  await update(ref(db, "session/current/buzzer"), {
    roundOpen: true,
    currentBuzz: null,
    lockedOut
  });
});

closeRoundBtn.addEventListener("click", async () => {
  if (!sessionCache?.active) {
    alert("No active session.");
    return;
  }

  await update(ref(db, "session/current/buzzer"), { roundOpen: false });
});

awardActivityScoreBtn.addEventListener("click", async () => {
  const currentBuzz = sessionCache?.buzzer?.currentBuzz;
  if (!currentBuzz) {
    alert("No current buzz.");
    return;
  }

  const teamLabel = currentBuzz.team;
  const currentScore = Number(sessionCache.activityScores?.[teamLabel] || 0);
  await update(ref(db, "session/current/activityScores"), { [teamLabel]: currentScore + 1 });
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
  const currentBuzz = sessionCache?.buzzer?.currentBuzz;
  if (!currentBuzz) {
    alert("No current buzz.");
    return;
  }

  const teamLabel = currentBuzz.team;
  const currentPoints = Number(sessionCache.liveTeamPoints?.[teamLabel] || 0);
  await update(ref(db, "session/current/liveTeamPoints"), { [teamLabel]: currentPoints + 1 });
});

awardStudentPointBtn.addEventListener("click", async () => {
  const currentBuzz = sessionCache?.buzzer?.currentBuzz;
  if (!currentBuzz) {
    alert("No current buzz.");
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
  renderLiveScores();
});