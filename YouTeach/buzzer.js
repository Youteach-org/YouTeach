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

if (sessionStorage.getItem("youteachTeacherAuth") !== "true") {
  window.location.href = "teacher-login.html";
}

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
const sessionHistoryList = document.getElementById("sessionHistoryList");

const activeBlockLabel = document.getElementById("activeBlockLabel");
const blockStatusLabel = document.getElementById("blockStatusLabel");
const sessionStatusLabel = document.getElementById("sessionStatusLabel");
const studentCountLabel = document.getElementById("studentCountLabel");

let studentsCache = {};
let pairHistoryCache = {};
let sessionCache = null;
let settingsCache = {};
let sessionHistoryCache = {};
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

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function assertBlockOpen(blockName = activeBlockCache) {
  if (isBlockClosed(blockName)) {
    alert(`The block (${blockName}) is closed. Reopen it first if you want to apply points.`);
    return false;
  }
  return true;
}

function logout() {
  sessionStorage.removeItem("youteachTeacherAuth");
  sessionStorage.removeItem("youteachTeacherRole");
  sessionStorage.removeItem("youteachTeacherName");
  window.location.href = "teacher-login.html";
}

function getPairKey(a, b) {
  return [a, b].sort().join("__");
}

function getTeamPenalty(teamMembers, candidateKey) {
  let score = 0;

  for (const memberKey of teamMembers) {
    const pairKey = getPairKey(memberKey, candidateKey);
    score += Number(pairHistoryCache[pairKey] || 0);
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
        const currentCount = Number(pairHistoryCache[pairKey] || 0);
        updates[`pairHistory/${pairKey}`] = currentCount + 1;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}

function renderHeader() {
  activeBlockLabel.textContent = activeBlockCache;
  blockStatusLabel.textContent = isBlockClosed(activeBlockCache) ? "CLOSED" : "OPEN";
  sessionStatusLabel.textContent = sessionCache?.active ? "Active session" : "No active session";
  studentCountLabel.textContent = String(Object.keys(studentsCache || {}).length);
}

function renderBuzzerStatus(session) {
  if (!session || !session.active) {
    buzzerStatus.innerHTML = "No active session.";
    return;
  }

  const buzzer = session.buzzer || {};
  const roundOpen = Boolean(buzzer.roundOpen);
  const currentBuzz = buzzer.currentBuzz || null;
  const lockedOutCount = buzzer.lockedOut ? Object.keys(buzzer.lockedOut).length : 0;

  buzzerStatus.innerHTML = `
    <div>
      <strong>Active Block:</strong> ${activeBlockCache}<br>
      <strong>Block Status:</strong> ${isBlockClosed(activeBlockCache) ? "CLOSED" : "OPEN"}<br>
      <strong>Round Status:</strong> ${roundOpen ? "OPEN" : "CLOSED"}<br>
      <strong>Current Buzz:</strong> ${currentBuzz ? `${currentBuzz.name} (${currentBuzz.team})` : "None yet"}<br>
      <strong>Locked Out This Round:</strong> ${lockedOutCount}
    </div>
  `;
}

function renderTeams(teams) {
  if (!teams || Object.keys(teams).length === 0) {
    teamsList.innerHTML = "No active session.";
    return;
  }

  teamsList.innerHTML = Object.entries(teams).map(([team, members]) => `
    <div class="info-card">
      <h4>${team.replace("team", "Team ")}</h4>
      <ul class="compact-list">
        ${members.map((member) => `<li>${member}</li>`).join("")}
      </ul>
    </div>
  `).join("");
}

function renderLiveScores(session) {
  if (!session || !session.active) {
    liveScores.innerHTML = "No active session.";
    return;
  }

  const teamPoints = session.liveTeamPoints || {};
  const studentPoints = session.liveStudentPoints || {};
  const teams = session.teams || {};

  const teamHtml = Object.keys(teams).length
    ? Object.keys(teams).map((teamKey) => {
        const teamLabel = teamKey.replace("team", "Team ");
        const points = Number(teamPoints[teamLabel] || 0);
        return `<div class="info-card"><strong>${teamLabel}</strong><br>Live Team Points: ${points}</div>`;
      }).join("")
    : "No teams.";

  const studentHtml = Object.entries(studentPoints).length
    ? Object.entries(studentPoints).map(([studentKey, points]) => {
        const student = studentsCache[studentKey];
        const name = student ? (student.fullName || student.name) : studentKey;
        return `<div class="info-card"><strong>${name}</strong><br>Pending Student Points: ${points}</div>`;
      }).join("")
    : "No pending student points.";

  liveScores.innerHTML = `
    <div class="card-list-block">
      <h4>Team Scores</h4>
      <div class="card-list">${teamHtml}</div>
    </div>
    <div class="card-list-block">
      <h4>Pending Student Points</h4>
      <div class="card-list">${studentHtml}</div>
    </div>
  `;
}

function renderSessionHistory(history) {
  const entries = Object.entries(history || {}).sort((a, b) => {
    const timeA = Number(a[1]?.closedAt || 0);
    const timeB = Number(b[1]?.closedAt || 0);
    return timeB - timeA;
  });

  if (entries.length === 0) {
    sessionHistoryList.innerHTML = "No past sessions yet.";
    return;
  }

  sessionHistoryList.innerHTML = entries.map(([, session]) => {
    const teams = session.teams || {};
    const liveTeamPoints = session.liveTeamPoints || {};
    const teamSummary = Object.entries(teams).map(([teamKey, members]) => {
      const teamLabel = teamKey.replace("team", "Team ");
      const teamScore = Number(liveTeamPoints[teamLabel] || 0);
      return `
        <div class="session-team-row">
          <strong>${teamLabel}</strong> - Final live team points: ${teamScore}<br>
          Members: ${members.join(", ")}
        </div>
      `;
    }).join("");

    return `
      <div class="info-card">
        <strong>Closed:</strong> ${formatDate(session.closedAt)}<br>
        <strong>Created:</strong> ${formatDate(session.createdAt)}<br>
        <strong>Block:</strong> ${session.block || "Block 1"}<br>
        <strong>Status:</strong> ${session.status || "closed"}<br><br>
        ${teamSummary}
      </div>
    `;
  }).join("");
}

logoutBtn.addEventListener("click", logout);

createTeamsBtn.onclick = async () => {
  const numTeams = parseInt(numTeamsInput.value, 10);

  if (!numTeams || numTeams < 2) {
    alert("Please enter a valid number of teams.");
    return;
  }

  try {
    const snapshot = await get(ref(db, "students"));
    const students = snapshot.val();

    if (!students || Object.keys(students).length === 0) {
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
  } catch (error) {
    console.error(error);
    alert("Could not generate teams.");
  }
};

resetSessionBtn.onclick = async () => {
  try {
    await remove(ref(db, "session/current"));
    alert("Session cleared.");
  } catch (error) {
    console.error(error);
    alert("Could not clear the session.");
  }
};

closeSessionBtn.onclick = async () => {
  try {
    const sessionSnap = await get(ref(db, "session/current"));
    const session = sessionSnap.val();

    if (!session || !session.active) {
      alert("No active session to close.");
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
    alert("Session closed and saved to history.");
  } catch (error) {
    console.error(error);
    alert("Could not close session.");
  }
};

openRoundBtn.onclick = async () => {
  if (!sessionCache || !sessionCache.active) {
    alert("No active session.");
    return;
  }

  await update(ref(db, "session/current/buzzer"), {
    roundOpen: true,
    currentBuzz: null,
    lockedOut: {}
  });
};

wrongAnswerBtn.onclick = async () => {
  if (!sessionCache?.buzzer?.currentBuzz) {
    alert("No current buzz.");
    return;
  }

  const currentBuzz = sessionCache.buzzer.currentBuzz;
  const lockedOut = sessionCache.buzzer.lockedOut || {};
  lockedOut[currentBuzz.studentKey] = true;

  await update(ref(db, "session/current/buzzer"), {
    roundOpen: true,
    currentBuzz: null,
    lockedOut
  });
};

closeRoundBtn.onclick = async () => {
  if (!sessionCache || !sessionCache.active) {
    alert("No active session.");
    return;
  }

  await update(ref(db, "session/current/buzzer"), {
    roundOpen: false
  });
};

awardTeamPointBtn.onclick = async () => {
  if (!sessionCache?.buzzer?.currentBuzz) {
    alert("No current buzz.");
    return;
  }

  const teamLabel = sessionCache.buzzer.currentBuzz.team;
  const currentPoints = Number(sessionCache.liveTeamPoints?.[teamLabel] || 0);

  await update(ref(db, "session/current/liveTeamPoints"), {
    [teamLabel]: currentPoints + 1
  });
};

awardStudentPointBtn.onclick = async () => {
  if (!sessionCache?.buzzer?.currentBuzz) {
    alert("No current buzz.");
    return;
  }

  const studentKey = sessionCache.buzzer.currentBuzz.studentKey;
  const currentPoints = Number(sessionCache.liveStudentPoints?.[studentKey] || 0);

  await update(ref(db, "session/current/liveStudentPoints"), {
    [studentKey]: currentPoints + 1
  });
};

resetLivePointsBtn.onclick = async () => {
  if (!sessionCache || !sessionCache.active) {
    alert("No active session.");
    return;
  }

  const teams = sessionCache.teams || {};
  const liveTeamPoints = {};

  Object.keys(teams).forEach((teamKey) => {
    const teamLabel = teamKey.replace("team", "Team ");
    liveTeamPoints[teamLabel] = 0;
  });

  await update(ref(db, "session/current"), {
    liveTeamPoints,
    liveStudentPoints: {}
  });
};

applyStudentPointsBtn.onclick = async () => {
  if (!assertBlockOpen()) return;

  try {
    const sessionSnap = await get(ref(db, "session/current"));
    const session = sessionSnap.val();

    if (!session || !session.active) {
      alert("No active session.");
      return;
    }

    const pending = session.liveStudentPoints || {};
    const pendingEntries = Object.entries(pending);

    if (pendingEntries.length === 0) {
      alert("There are no pending student points to apply.");
      return;
    }

    for (const [studentKey, pointsToAdd] of pendingEntries) {
      const studentSnap = await get(ref(db, `students/${studentKey}`));
      const student = studentSnap.val();

      if (!student) continue;

      const blockPoints = ensureBlockPointsObject(student);
      const currentBlockValue = Number(blockPoints[activeBlockCache] || 0);
      const addValue = Number(pointsToAdd || 0);
      blockPoints[activeBlockCache] = currentBlockValue + addValue;

      await update(ref(db, `students/${studentKey}`), {
        blockPoints
      });

      const logRef = push(ref(db, "pointsLog"));
      await set(logRef, {
        type: "student",
        block: activeBlockCache,
        studentKey,
        studentName: student.fullName || student.name || "",
        addedPoints: addValue,
        previousPoints: currentBlockValue,
        newPoints: blockPoints[activeBlockCache],
        appliedAt: Date.now()
      });
    }

    await set(ref(db, "session/current/liveStudentPoints"), {});
    alert(`Student live points applied to ${activeBlockCache}.`);
  } catch (error) {
    console.error(error);
    alert("Could not apply student points.");
  }
};

applyTeamPointsBtn.onclick = async () => {
  if (!assertBlockOpen()) return;

  try {
    const sessionSnap = await get(ref(db, "session/current"));
    const session = sessionSnap.val();

    if (!session || !session.active) {
      alert("No active session.");
      return;
    }

    const teamPoints = session.liveTeamPoints || {};
    const assignments = session.assignments || {};
    const teamEntries = Object.entries(teamPoints);

    const hasAnyTeamPoints = teamEntries.some(([, value]) => Number(value) > 0);

    if (!hasAnyTeamPoints) {
      alert("There are no live team points to apply.");
      return;
    }

    for (const [studentKey, teamLabel] of Object.entries(assignments)) {
      const teamValue = Number(teamPoints[teamLabel] || 0);

      if (teamValue <= 0) continue;

      const studentSnap = await get(ref(db, `students/${studentKey}`));
      const student = studentSnap.val();

      if (!student) continue;

      const blockPoints = ensureBlockPointsObject(student);
      const currentBlockValue = Number(blockPoints[activeBlockCache] || 0);
      blockPoints[activeBlockCache] = currentBlockValue + teamValue;

      await update(ref(db, `students/${studentKey}`), {
        blockPoints
      });

      const logRef = push(ref(db, "pointsLog"));
      await set(logRef, {
        type: "team",
        block: activeBlockCache,
        teamLabel,
        studentKey,
        studentName: student.fullName || student.name || "",
        addedPoints: teamValue,
        previousPoints: currentBlockValue,
        newPoints: blockPoints[activeBlockCache],
        appliedAt: Date.now()
      });
    }

    const resetTeamPoints = {};
    Object.keys(teamPoints).forEach((teamLabel) => {
      resetTeamPoints[teamLabel] = 0;
    });

    await set(ref(db, "session/current/liveTeamPoints"), resetTeamPoints);
    alert(`Team live points applied to ${activeBlockCache} for all current team members.`);
  } catch (error) {
    console.error(error);
    alert("Could not apply team points.");
  }
};

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
  renderBuzzerStatus(sessionCache);
});

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  renderHeader();
  renderTeams(sessionCache?.teams || {});
  renderBuzzerStatus(sessionCache);
  renderLiveScores(sessionCache);
});

onValue(ref(db, "sessionHistory"), (snapshot) => {
  sessionHistoryCache = snapshot.val() || {};
  renderSessionHistory(sessionHistoryCache);
});
