import { db } from "./firebase.js";
import {
  ref,
  push,
  set,
  get,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";

if (sessionStorage.getItem("youteachTeacherAuth") !== "true") {
  window.location.href = "teacher-login.html";
}

const logoutBtn = document.getElementById("logoutBtn");
const teacherIdentity = document.getElementById("teacherIdentity");

const createStudentBtn = document.getElementById("createStudent");
const importCsvBtn = document.getElementById("importCsv");
const importTextBtn = document.getElementById("importText");

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
const searchStudentInput = document.getElementById("searchStudent");

const studentsTableBody = document.getElementById("studentsTableBody");
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

teacherIdentity.textContent = sessionStorage.getItem("youteachTeacherName") || "Teacher";

let studentsCache = {};
let settingsCache = {};
let pointsLogCache = {};
let sessionHistoryCache = {};
let sessionCache = null;
let activeBlockCache = "Block 1";
let activeBlockClosedCache = false;

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

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("youteachTeacherAuth");
  sessionStorage.removeItem("youteachTeacherRole");
  sessionStorage.removeItem("youteachTeacherName");
  window.location.href = "teacher-login.html";
});

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
  renderManualStudentPreview();
  updateDashboard();
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderPointsHistory(pointsLogCache);
});

onValue(ref(db, "sessionHistory"), (snapshot) => {
  sessionHistoryCache = snapshot.val() || {};
  renderSessionHistory(sessionHistoryCache);
});

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  updateDashboard();
});

switchSection("dashboardSection");
