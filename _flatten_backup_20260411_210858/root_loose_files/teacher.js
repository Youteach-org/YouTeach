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
import { generateId } from "./app.js";

const createStudentBtn = document.getElementById("createStudent");
const importCsvBtn = document.getElementById("importCsv");
const importTextBtn = document.getElementById("importText");
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

const activeBlockSelect = document.getElementById("activeBlockSelect");
const saveBlockBtn = document.getElementById("saveBlockBtn");
const closeBlockBtn = document.getElementById("closeBlockBtn");
const reopenBlockBtn = document.getElementById("reopenBlockBtn");
const currentBlockLabel = document.getElementById("currentBlockLabel");
const currentBlockStatusLabel = document.getElementById("currentBlockStatusLabel");

const exportBlockSelect = document.getElementById("exportBlockSelect");
const exportBlockBtn = document.getElementById("exportBlockBtn");
const pointsPageBlockMirror = document.getElementById("pointsPageBlockMirror");
const pointsPageSetBlockBtn = document.getElementById("pointsPageSetBlockBtn");
const pointsPageExportBtn = document.getElementById("pointsPageExportBtn");

const manualStudentSearch = document.getElementById("manualStudentSearch");
const manualStudentSelect = document.getElementById("manualStudentSelect");
const manualBlockSelect = document.getElementById("manualBlockSelect");
const manualPointsInput = document.getElementById("manualPointsInput");
const applyManualPointsBtn = document.getElementById("applyManualPointsBtn");
const manualStudentPreview = document.getElementById("manualStudentPreview");

const studentNameInput = document.getElementById("studentName");
const studentNumberManualInput = document.getElementById("studentNumberManual");
const csvFileInput = document.getElementById("csvFile");
const bulkTextInput = document.getElementById("bulkText");
const numTeamsInput = document.getElementById("numTeams");
const searchStudentInput = document.getElementById("searchStudent");

const studentsTableBody = document.getElementById("studentsTableBody");
const teamsList = document.getElementById("teamsList");
const buzzerStatus = document.getElementById("buzzerStatus");
const liveScores = document.getElementById("liveScores");
const sessionHistoryList = document.getElementById("sessionHistoryList");

const pointHistorySearch = document.getElementById("pointHistorySearch");
const pointHistoryBlockFilter = document.getElementById("pointHistoryBlockFilter");
const pointHistoryTypeFilter = document.getElementById("pointHistoryTypeFilter");
const pointsHistoryList = document.getElementById("pointsHistoryList");

const dashboardActiveBlock = document.getElementById("dashboardActiveBlock");
const dashboardBlockStatus = document.getElementById("dashboardBlockStatus");
const dashboardStudentCount = document.getElementById("dashboardStudentCount");
const dashboardSessionStatus = document.getElementById("dashboardSessionStatus");

const navButtons = document.querySelectorAll(".nav-btn");
const pageSections = document.querySelectorAll(".page-section");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

let studentsCache = {};
let pairHistoryCache = {};
let sessionCache = null;
let activeBlockCache = "Block 1";
let activeBlockClosedCache = false;
let settingsCache = {};
let sessionHistoryCache = {};
let pointsLogCache = {};

const pageMeta = {
  dashboardSection: {
    title: "Dashboard",
    subtitle: "Overview of your class tools"
  },
  studentsSection: {
    title: "Students",
    subtitle: "Consult and edit the student list"
  },
  enrollmentSection: {
    title: "Add / Import",
    subtitle: "Add students manually or import them"
  },
  pointsSection: {
    title: "Points",
    subtitle: "Adjust and export block points"
  },
  historySection: {
    title: "History",
    subtitle: "Review points and past sessions"
  },
  buzzerSection: {
    title: "Buzzer / Teams",
    subtitle: "Run activities, teams and live scoring"
  }
};

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchIndex(fullName, studentNumber = "") {
  return `${normalizeText(studentNumber)} ${normalizeText(fullName)}`.trim();
}

function getStudentBlockPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
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

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function assertBlockOpen(blockName = activeBlockCache) {
  if (isBlockClosed(blockName)) {
    alert(`The block (${blockName}) is closed. Reopen it first if you want to change points.`);
    return false;
  }
  return true;
}

function switchSection(sectionId) {
  pageSections.forEach((section) => {
    section.classList.toggle("active-section", section.id === sectionId);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });

  const meta = pageMeta[sectionId] || { title: "Teacher Panel", subtitle: "" };
  pageTitle.textContent = meta.title;
  pageSubtitle.textContent = meta.subtitle;
}

function updateDashboard() {
  dashboardActiveBlock.textContent = activeBlockCache;
  dashboardBlockStatus.textContent = activeBlockClosedCache ? "CLOSED" : "OPEN";
  dashboardStudentCount.textContent = String(Object.keys(studentsCache || {}).length);
  dashboardSessionStatus.textContent = sessionCache?.active ? "Yes" : "No";
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader =
    header.includes("name") ||
    header.includes("fullname") ||
    header.includes("studentnumber") ||
    header.includes("id") ||
    header.includes("controlnumber");

  const rows = hasHeader ? lines.slice(1) : lines;

  return rows.map((line) => {
    const cols = parseCsvLine(line);

    if (hasHeader) {
      const nameIndex =
        header.indexOf("name") >= 0 ? header.indexOf("name") :
        header.indexOf("fullname") >= 0 ? header.indexOf("fullname") : -1;

      const studentNumberIndex =
        header.indexOf("studentnumber") >= 0 ? header.indexOf("studentnumber") :
        header.indexOf("id") >= 0 ? header.indexOf("id") :
        header.indexOf("controlnumber") >= 0 ? header.indexOf("controlnumber") : -1;

      return {
        fullName: nameIndex >= 0 ? (cols[nameIndex] || "").trim() : "",
        studentNumber: studentNumberIndex >= 0 ? (cols[studentNumberIndex] || "").trim() : ""
      };
    }

    if (cols.length >= 2) {
      return {
        studentNumber: (cols[0] || "").trim(),
        fullName: (cols[1] || "").trim()
      };
    }

    return {
      studentNumber: "",
      fullName: (cols[0] || "").trim()
    };
  }).filter((student) => student.fullName.length > 0);
}

function parseBulkText(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => {
    if (line.includes("\t")) {
      const parts = line.split("\t");
      return {
        studentNumber: (parts[0] || "").trim(),
        fullName: parts.slice(1).join(" ").trim()
      };
    }

    const csvParts = parseCsvLine(line);
    if (csvParts.length >= 2) {
      return {
        studentNumber: (csvParts[0] || "").trim(),
        fullName: csvParts.slice(1).join(" ").trim()
      };
    }

    return {
      studentNumber: "",
      fullName: line.trim()
    };
  }).filter((student) => student.fullName.length > 0);
}

async function saveStudent(fullName, studentNumber = "") {
  const cleanName = fullName.trim();
  const cleanNumber = studentNumber.trim();

  if (!cleanName) {
    throw new Error("Empty student name");
  }

  const newRef = push(ref(db, "students"));

  await set(newRef, {
    fullName: cleanName,
    name: cleanName,
    studentNumber: cleanNumber,
    id: generateId(),
    blockPoints: {
      "Block 1": 0,
      "Block 2": 0,
      "Block 3": 0
    },
    searchIndex: buildSearchIndex(cleanName, cleanNumber)
  });
}

function renderStudents(students) {
  const query = normalizeText(searchStudentInput.value);
  const allStudents = Object.entries(students || {});

  const filtered = query
    ? allStudents.filter(([, student]) =>
        normalizeText(student.searchIndex || buildSearchIndex(student.fullName || student.name, student.studentNumber)).includes(query)
      )
    : allStudents;

  if (filtered.length === 0) {
    studentsTableBody.innerHTML = `
      <tr>
        <td colspan="10">No students found.</td>
      </tr>
    `;
    return;
  }

  studentsTableBody.innerHTML = filtered.map(([key, student]) => {
    const displayName = student.fullName || student.name || "";
    const displayNumber = student.studentNumber || "";
    const blockPoints = ensureBlockPointsObject(student);

    return `
      <tr>
        <td>${displayName}</td>
        <td>${displayNumber || "None"}</td>
        <td>${student.id || ""}</td>
        <td>${blockPoints["Block 1"]}</td>
        <td>${blockPoints["Block 2"]}</td>
        <td>${blockPoints["Block 3"]}</td>
        <td>${getStudentBlockPoints(student, activeBlockCache)}</td>
        <td>
          <input class="table-input" id="edit-name-${key}" value="${displayName.replace(/"/g, "&quot;")}" placeholder="Edit name">
        </td>
        <td>
          <input class="table-input" id="edit-number-${key}" value="${displayNumber.replace(/"/g, "&quot;")}" placeholder="Edit number">
        </td>
        <td>
          <button class="small-btn" onclick="window.saveStudentEdit('${key}')">Save</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderManualStudentOptions() {
  const query = normalizeText(manualStudentSearch.value);
  const entries = Object.entries(studentsCache || {}).filter(([, student]) => {
    if (!query) return true;
    const searchable = normalizeText(
      `${student.fullName || student.name || ""} ${student.studentNumber || ""} ${student.id || ""}`
    );
    return searchable.includes(query);
  });

  manualStudentSelect.innerHTML =
    `<option value="">Select a student</option>` +
    entries.map(([key, student]) => {
      const label = `${student.fullName || student.name || ""} | ${student.studentNumber || "No student number"} | ${student.id || ""}`;
      return `<option value="${key}">${label}</option>`;
    }).join("");

  renderManualStudentPreview();
}

function renderManualStudentPreview() {
  const studentKey = manualStudentSelect.value;

  if (!studentKey || !studentsCache[studentKey]) {
    manualStudentPreview.innerHTML = "No student selected.";
    return;
  }

  const student = studentsCache[studentKey];
  const selectedBlock = manualBlockSelect.value;
  const points = getStudentBlockPoints(student, selectedBlock);

  manualStudentPreview.innerHTML = `
    <div>
      <strong>${student.fullName || student.name || ""}</strong><br>
      Student Number: ${student.studentNumber || "None"}<br>
      Internal ID: ${student.id || ""}<br>
      Current Points in ${selectedBlock}: ${points}<br>
      Block Status: ${isBlockClosed(selectedBlock) ? "CLOSED" : "OPEN"}
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
      <strong>Block Status:</strong> ${activeBlockClosedCache ? "CLOSED" : "OPEN"}<br>
      <strong>Round Status:</strong> ${roundOpen ? "OPEN" : "CLOSED"}<br>
      <strong>Current Buzz:</strong> ${currentBuzz ? `${currentBuzz.name} (${currentBuzz.team})` : "None yet"}<br>
      <strong>Locked Out This Round:</strong> ${lockedOutCount}
    </div>
  `;
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

function renderPointsHistory(history) {
  const studentQuery = normalizeText(pointHistorySearch.value);
  const blockFilter = pointHistoryBlockFilter.value;
  const typeFilter = pointHistoryTypeFilter.value;

  const entries = Object.entries(history || {}).sort((a, b) => {
    const timeA = Number(a[1]?.appliedAt || 0);
    const timeB = Number(b[1]?.appliedAt || 0);
    return timeB - timeA;
  });

  const filtered = entries.filter(([, entry]) => {
    const matchesStudent = studentQuery
      ? normalizeText(entry.studentName || "").includes(studentQuery)
      : true;

    const matchesBlock = blockFilter ? entry.block === blockFilter : true;
    const matchesType = typeFilter ? entry.type === typeFilter : true;

    return matchesStudent && matchesBlock && matchesType;
  });

  if (filtered.length === 0) {
    pointsHistoryList.innerHTML = "No point history found.";
    return;
  }

  pointsHistoryList.innerHTML = filtered.map(([, entry]) => `
    <div class="info-card">
      <strong>${entry.studentName || "Unknown student"}</strong><br>
      Type: ${entry.type || "unknown"}<br>
      Block: ${entry.block || "Block 1"}<br>
      Added Points: ${Number(entry.addedPoints || 0)}<br>
      Previous Points: ${Number(entry.previousPoints || 0)}<br>
      New Points: ${Number(entry.newPoints || 0)}<br>
      ${entry.teamLabel ? `Team: ${entry.teamLabel}<br>` : ""}
      Applied: ${formatDate(entry.appliedAt)}
    </div>
  `).join("");
}

window.saveStudentEdit = async function(studentKey) {
  const nameInput = document.getElementById(`edit-name-${studentKey}`);
  const numberInput = document.getElementById(`edit-number-${studentKey}`);

  const fullName = nameInput.value.trim();
  const studentNumber = numberInput.value.trim();

  if (!fullName) {
    alert("Name cannot be empty.");
    return;
  }

  try {
    await update(ref(db, `students/${studentKey}`), {
      fullName,
      name: fullName,
      studentNumber,
      searchIndex: buildSearchIndex(fullName, studentNumber)
    });

    alert("Student updated.");
  } catch (error) {
    console.error(error);
    alert("Could not update student.");
  }
};

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

function exportBlock(selectedBlock) {
  const students = Object.entries(studentsCache || {}).sort((a, b) => {
    const nameA = (a[1]?.fullName || a[1]?.name || "").localeCompare(b[1]?.fullName || b[1]?.name || "");
    return nameA;
  });

  if (students.length === 0) {
    alert("No students available to export.");
    return;
  }

  const lines = [
    ["internalId", "studentNumber", "fullName", "block", "points"].join(",")
  ];

  for (const [, student] of students) {
    lines.push([
      escapeCsv(student.id || ""),
      escapeCsv(student.studentNumber || ""),
      escapeCsv(student.fullName || student.name || ""),
      escapeCsv(selectedBlock),
      escapeCsv(getStudentBlockPoints(student, selectedBlock))
    ].join(","));
  }

  const filename = `${selectedBlock.replace(/\s+/g, "_").toLowerCase()}_points.csv`;
  downloadTextFile(filename, lines.join("\n"), "text/csv;charset=utf-8");
}

saveBlockBtn.onclick = async () => {
  const selectedBlock = activeBlockSelect.value;

  try {
    await update(ref(db, "settings"), {
      activeBlock: selectedBlock
    });
    alert(`Active block set to ${selectedBlock}.`);
  } catch (error) {
    console.error(error);
    alert("Could not save active block.");
  }
};

pointsPageSetBlockBtn.onclick = async () => {
  const selectedBlock = pointsPageBlockMirror.value;

  try {
    await update(ref(db, "settings"), {
      activeBlock: selectedBlock
    });
    alert(`Active block set to ${selectedBlock}.`);
  } catch (error) {
    console.error(error);
    alert("Could not save active block.");
  }
};

closeBlockBtn.onclick = async () => {
  try {
    await update(ref(db, "settings/closedBlocks"), {
      [activeBlockCache]: true
    });
    alert(`${activeBlockCache} is now closed.`);
  } catch (error) {
    console.error(error);
    alert("Could not close block.");
  }
};

reopenBlockBtn.onclick = async () => {
  try {
    await update(ref(db, "settings/closedBlocks"), {
      [activeBlockCache]: false
    });
    alert(`${activeBlockCache} is now open again.`);
  } catch (error) {
    console.error(error);
    alert("Could not reopen block.");
  }
};

exportBlockBtn.onclick = () => {
  exportBlock(exportBlockSelect.value);
};

pointsPageExportBtn.onclick = () => {
  exportBlock(pointsPageBlockMirror.value);
};

applyManualPointsBtn.onclick = async () => {
  const studentKey = manualStudentSelect.value;
  const blockName = manualBlockSelect.value;
  const delta = Number(manualPointsInput.value);

  if (!studentKey || !studentsCache[studentKey]) {
    alert("Select a student first.");
    return;
  }

  if (!Number.isFinite(delta) || delta === 0) {
    alert("Enter a non-zero number of points.");
    return;
  }

  if (!assertBlockOpen(blockName)) return;

  try {
    const student = studentsCache[studentKey];
    const blockPoints = ensureBlockPointsObject(student);
    const previousPoints = Number(blockPoints[blockName] || 0);
    const newPoints = previousPoints + delta;

    blockPoints[blockName] = newPoints;

    await update(ref(db, `students/${studentKey}`), {
      blockPoints
    });

    manualPointsInput.value = "";
    alert("Points updated.");
  } catch (error) {
    console.error(error);
    alert("Could not update points.");
  }
};

createStudentBtn.onclick = async () => {
  const fullName = studentNameInput.value.trim();
  const studentNumber = studentNumberManualInput.value.trim();

  if (!fullName) {
    alert("Please enter a student name.");
    return;
  }

  try {
    await saveStudent(fullName, studentNumber);
    studentNameInput.value = "";
    studentNumberManualInput.value = "";
    alert("Student added.");
  } catch (error) {
    console.error(error);
    alert("Could not add student.");
  }
};

importCsvBtn.onclick = async () => {
  const file = csvFileInput.files[0];

  if (!file) {
    alert("Please choose a CSV file.");
    return;
  }

  try {
    const text = await file.text();
    const students = parseCsv(text);

    if (students.length === 0) {
      alert("No valid students were found in the CSV.");
      return;
    }

    for (const student of students) {
      await saveStudent(student.fullName, student.studentNumber || "");
    }

    csvFileInput.value = "";
    alert(`${students.length} students imported successfully.`);
  } catch (error) {
    console.error(error);
    alert("Could not import the CSV file.");
  }
};

importTextBtn.onclick = async () => {
  const text = bulkTextInput.value.trim();

  if (!text) {
    alert("Paste the student list first.");
    return;
  }

  try {
    const students = parseBulkText(text);

    if (students.length === 0) {
      alert("No valid students were found in the pasted list.");
      return;
    }

    for (const student of students) {
      await saveStudent(student.fullName, student.studentNumber || "");
    }

    bulkTextInput.value = "";
    alert(`${students.length} students imported successfully.`);
  } catch (error) {
    console.error(error);
    alert("Could not import the pasted list.");
  }
};

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

searchStudentInput.addEventListener("input", () => {
  renderStudents(studentsCache);
});

manualStudentSearch.addEventListener("input", renderManualStudentOptions);
manualStudentSelect.addEventListener("change", renderManualStudentPreview);
manualBlockSelect.addEventListener("change", renderManualStudentPreview);

pointHistorySearch.addEventListener("input", () => {
  renderPointsHistory(pointsLogCache);
});

pointHistoryBlockFilter.addEventListener("change", () => {
  renderPointsHistory(pointsLogCache);
});

pointHistoryTypeFilter.addEventListener("change", () => {
  renderPointsHistory(pointsLogCache);
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchSection(button.dataset.section);
  });
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderStudents(studentsCache);
  renderManualStudentOptions();
  updateDashboard();
});

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  renderTeams(sessionCache?.teams || {});
  renderBuzzerStatus(sessionCache);
  renderLiveScores(sessionCache);
  updateDashboard();
});

onValue(ref(db, "pairHistory"), (snapshot) => {
  pairHistoryCache = snapshot.val() || {};
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  activeBlockCache = settingsCache.activeBlock || "Block 1";
  activeBlockClosedCache = isBlockClosed(activeBlockCache);
  activeBlockSelect.value = activeBlockCache;
  exportBlockSelect.value = activeBlockCache;
  manualBlockSelect.value = activeBlockCache;
  pointsPageBlockMirror.value = activeBlockCache;
  currentBlockLabel.textContent = `Current active block: ${activeBlockCache}`;
  currentBlockStatusLabel.textContent = `Current block status: ${activeBlockClosedCache ? "CLOSED" : "OPEN"}`;
  renderStudents(studentsCache);
  renderBuzzerStatus(sessionCache);
  renderManualStudentPreview();
  updateDashboard();
});

onValue(ref(db, "sessionHistory"), (snapshot) => {
  sessionHistoryCache = snapshot.val() || {};
  renderSessionHistory(sessionHistoryCache);
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderPointsHistory(pointsLogCache);
});

switchSection("dashboardSection");
