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

const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const numTeamsInput = document.getElementById("numTeams");
const createTeamsBtn = document.getElementById("createTeams");
const resetSessionBtn = document.getElementById("resetSession");
const closeSessionBtn = document.getElementById("closeSessionBtn");

const openRoundBtn = document.getElementById("openRoundBtn");
const wrongAnswerBtn = document.getElementById("wrongAnswerBtn");
const closeRoundBtn = document.getElementById("closeRoundBtn");
const awardTeamPointBtn = document.getElementById("awardTeamPointBtn");
const awardStudentPointBtn = document.getElementById("awardStudentPointBtn");
const resetLivePointsBtn = document.getElementById("resetLivePointsBtn");
const applyStudentPointsBtn = document.getElementById("applyStudentPointsBtn");
const applyTeamPointsBtn = document.getElementById("applyTeamPointsBtn");

const buzzerStatus = document.getElementById("buzzerStatus");
const teamsList = document.getElementById("teamsList");
const liveScores = document.getElementById("liveScores");

const activeBlockLabel = document.getElementById("activeBlockLabel");
const blockStatusLabel = document.getElementById("blockStatusLabel");
const sessionStatusLabel = document.getElementById("sessionStatusLabel");
const studentCountLabel = document.getElementById("studentCountLabel");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

let studentsCache = {};
let pairHistoryCache = {};
let sessionCache = null;
let settingsCache = {};
let activeBlockCache = "Block 1";

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
    teams[bestTeamIndex].memberNames.push(student.fullName || student.name);
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

function renderHeader() {
  activeBlockLabel.textContent = activeBlockCache;
  blockStatusLabel.textContent = isBlockClosed(activeBlockCache) ? "CLOSED" : "OPEN";
  sessionStatusLabel.textContent = sessionCache?.active ? "Active session" : "No active session";
  studentCountLabel.textContent = String(Object.keys(studentsCache || {}).length);
}

function renderBuzzerStatus() {
  if (!sessionCache || !sessionCache.active) {
    buzzerStatus.innerHTML = "No active session.";
    return;
  }

  const buzzer = sessionCache.buzzer || {};
  const currentBuzz = buzzer.currentBuzz || null;

  buzzerStatus.innerHTML = `
    <strong>Round Status:</strong> ${buzzer.roundOpen ? "OPEN" : "CLOSED"}<br>
    <strong>Current Buzz:</strong> ${currentBuzz ? `${currentBuzz.name} (${currentBuzz.team})` : "None yet"}<br>
    <strong>Locked Out:</strong> ${Object.keys(buzzer.lockedOut || {}).length}
  `;
}

function renderTeams() {
  if (!sessionCache?.teams) {
    teamsList.innerHTML = "No active session.";
    return;
  }

  teamsList.innerHTML = Object.entries(sessionCache.teams).map(([team, members]) => `
    <div class="info-card">
      <h4>${team.replace("team", "Team ")}</h4>
      <ul class="compact-list">${members.map((member) => `<li>${member}</li>`).join("")}</ul>
    </div>
  `).join("");
}

function renderLiveScores() {
  if (!sessionCache?.active) {
    liveScores.innerHTML = "No active session.";
    return;
  }

  const teamPoints = sessionCache.liveTeamPoints || {};
  const studentPoints = sessionCache.liveStudentPoints || {};

  const teamHtml = Object.entries(teamPoints).map(([team, points]) => `
    <div class="info-card"><strong>${team}</strong><br>Live Team Points: ${Number(points || 0)}</div>
  `).join("");

  const studentHtml = Object.entries(studentPoints).map(([studentKey, points]) => {
    const student = studentsCache[studentKey];
    const label = student?.nickname || student?.fullName || student?.name || studentKey;
    return `<div class="info-card"><strong>${label}</strong><br>Pending Student Points: ${Number(points || 0)}</div>`;
  }).join("");

  liveScores.innerHTML = `
    <div class="card-list-block">
      <h4>Team Scores</h4>
      <div class="card-list">${teamHtml || "No live team points."}</div>
    </div>
    <div class="card-list-block">
      <h4>Pending Student Points</h4>
      <div class="card-list">${studentHtml || "No pending student points."}</div>
    </div>
  `;
}

createTeamsBtn.addEventListener("click", async () => {
  const numTeams = parseInt(numTeamsInput.value, 10);

  if (!numTeams || numTeams < 2) {
    alert("Please enter a valid number of teams.");
    return;
  }

  const snapshot = await get(ref(db, "students"));
  const students = snapshot.val() || {};

  if (!Object.keys(students).length) {
    alert("No students found.");
    return;
  }

  const studentEntries = Object.entries(students);
  const smartTeams = buildSmartTeams(studentEntries, numTeams);

  const sessionTeams = {};
  const assignments = {};
  const liveTeamPoints = {};

  for (const team of smartTeams) {
    sessionTeams[team.key] = team.memberNames;
    liveTeamPoints[team.label] = 0;

    for (const memberKey of team.memberKeys) {
      assignments[memberKey] = team.label;
    }
  }

  await set(ref(db, "session/current"), {
    active: true,
    createdAt: Date.now(),
    teams: sessionTeams,
    assignments,
    liveTeamPoints,
    liveStudentPoints: {},
    buzzer: {
      roundOpen: false,
      currentBuzz: null,
      lockedOut: {}
    }
  });

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
  Object.keys(sessionCache.teams || {}).forEach((teamKey) => {
    teamPoints[teamKey.replace("team", "Team ")] = 0;
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
      studentName: student.fullName || student.name || "",
      addedPoints: addValue,
      previousPoints,
      newPoints: blockPoints[activeBlockCache],
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
      studentName: student.fullName || student.name || "",
      addedPoints: teamValue,
      previousPoints,
      newPoints: blockPoints[activeBlockCache],
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
});

onValue(ref(db, "pairHistory"), (snapshot) => {
  pairHistoryCache = snapshot.val() || {};
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  activeBlockCache = settingsCache.activeBlock || "Block 1";
  renderHeader();
  renderBuzzerStatus();
});

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  renderHeader();
  renderTeams();
  renderBuzzerStatus();
  renderLiveScores();
});
