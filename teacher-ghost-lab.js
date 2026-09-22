import { db } from "./firebase.js";
import {
  ref,
  onValue,
  get,
  update,
  runTransaction,
  push,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { generateId } from "./app.js";
import { evaluationBlockNames } from "./group-evaluation-model.js";
import { studentInGroup } from "./student-groups.js";

if (!requireTeacherAuth()) {
  throw new Error("Teacher session required.");
}

const teacherIdentity = document.getElementById("teacherIdentity");
const sidebarIdentity = document.getElementById("sidebarIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const ghostTableBody = document.getElementById("ghostTableBody");
const ghostMasterCheckbox = document.getElementById("ghostMasterCheckbox");
const activateGhostsBtn = document.getElementById("activateGhostsBtn");
const deactivateGhostsBtn = document.getElementById("deactivateGhostsBtn");
const presenceProgress = document.getElementById("presenceProgress");
const assignmentSelect = document.getElementById("assignmentSelect");
const submitGhostWorkBtn = document.getElementById("submitGhostWorkBtn");
const withdrawGhostWorkBtn = document.getElementById("withdrawGhostWorkBtn");
const assignmentProgress = document.getElementById("assignmentProgress");
const assignmentStatus = document.getElementById("assignmentStatus");
const sessionState = document.getElementById("sessionState");
const sessionGroup = document.getElementById("sessionGroup");
const roundState = document.getElementById("roundState");
const currentBuzzState = document.getElementById("currentBuzzState");
const raceGhostsBtn = document.getElementById("raceGhostsBtn");
const buzzerProgress = document.getElementById("buzzerProgress");
const openAddStudentModalBtn = document.getElementById("openAddStudentModalBtn");
const addStudentDialog = document.getElementById("addStudentDialog");
const addStudentGroupLabel = document.getElementById("addStudentGroupLabel");
const closeAddStudentDialogBtn = document.getElementById("closeAddStudentDialogBtn");
const manualStudentTabBtn = document.getElementById("manualStudentTabBtn");
const csvStudentTabBtn = document.getElementById("csvStudentTabBtn");
const pasteStudentTabBtn = document.getElementById("pasteStudentTabBtn");
const existingStudentTabBtn = document.getElementById("existingStudentTabBtn");
const manualStudentPane = document.getElementById("manualStudentPane");
const csvStudentPane = document.getElementById("csvStudentPane");
const pasteStudentPane = document.getElementById("pasteStudentPane");
const existingStudentPane = document.getElementById("existingStudentPane");
const studentNameInput = document.getElementById("studentName");
const studentNicknameInput = document.getElementById("studentNickname");
const studentNumberManualInput = document.getElementById("studentNumberManual");
const createStudentBtn = document.getElementById("createStudent");
const csvFileInput = document.getElementById("csvFile");
const importCsvBtn = document.getElementById("importCsv");
const bulkTextInput = document.getElementById("bulkText");
const importTextBtn = document.getElementById("importText");
const existingStudentSearch = document.getElementById("existingStudentSearch");
const existingStudentGroupFilter = document.getElementById("existingStudentGroupFilter");
const existingStudentsMasterCheckbox = document.getElementById("existingStudentsMasterCheckbox");
const existingStudentsList = document.getElementById("existingStudentsList");
const existingStudentSelectionCount = document.getElementById("existingStudentSelectionCount");
const enrollExistingStudentsBtn = document.getElementById("enrollExistingStudentsBtn");
const addStudentStatus = document.getElementById("addStudentStatus");

openAddStudentModalBtn.addEventListener("click", openAddStudentsDialog);
closeAddStudentDialogBtn.addEventListener("click", () => addStudentDialog.close());
manualStudentTabBtn.addEventListener("click", () => setAddStudentPane("manual"));
csvStudentTabBtn.addEventListener("click", () => setAddStudentPane("csv"));
pasteStudentTabBtn.addEventListener("click", () => setAddStudentPane("paste"));
existingStudentTabBtn.addEventListener("click", () => setAddStudentPane("existing"));
existingStudentSearch.addEventListener("input", renderExistingStudents);
existingStudentGroupFilter.addEventListener("change", renderExistingStudents);
existingStudentsList.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".existing-student-checkbox");
  if (!checkbox) return;
  const studentKey = String(checkbox.dataset.existingStudentKey || "");
  if (!studentKey) return;
  if (checkbox.checked) selectedExistingStudentKeys.add(studentKey);
  else selectedExistingStudentKeys.delete(studentKey);
  syncExistingMaster();
});
existingStudentsMasterCheckbox.addEventListener("change", () => {
  existingStudentCandidates().forEach(([studentKey]) => {
    if (existingStudentsMasterCheckbox.checked) selectedExistingStudentKeys.add(studentKey);
    else selectedExistingStudentKeys.delete(studentKey);
  });
  renderExistingStudents();
});
enrollExistingStudentsBtn.addEventListener("click", enrollExistingStudents);

createStudentBtn.addEventListener("click", async () => {
  const fullName = studentNameInput.value.trim();
  if (!fullName) {
    addStudentStatus.textContent = "Enter the student's full name.";
    return;
  }
  await saveStudent(
    fullName,
    studentNicknameInput.value.trim(),
    studentNumberManualInput.value.trim(),
    { enrollmentSource: "ghost-lab-manual", enrolledBy: getTeacherName() }
  );
  studentNameInput.value = "";
  studentNicknameInput.value = "";
  studentNumberManualInput.value = "";
  addStudentStatus.textContent = "Student added to FANTASMA.";
});

importCsvBtn.addEventListener("click", async () => {
  const file = csvFileInput.files[0];
  if (!file) {
    addStudentStatus.textContent = "Choose a CSV file first.";
    return;
  }
  const students = parseCsv(await file.text());
  for (const student of students) {
    await saveStudent(student.fullName, student.nickname, student.studentNumber, {
      enrollmentSource: "ghost-lab-csv",
      enrolledBy: getTeacherName()
    });
  }
  csvFileInput.value = "";
  addStudentStatus.textContent = `${students.length} student(s) imported into FANTASMA.`;
});

importTextBtn.addEventListener("click", async () => {
  const students = parseBulkText(bulkTextInput.value);
  if (!students.length) {
    addStudentStatus.textContent = "Paste at least one valid student.";
    return;
  }
  for (const student of students) {
    await saveStudent(student.fullName, student.nickname, student.studentNumber, {
      enrollmentSource: "ghost-lab-paste",
      enrolledBy: getTeacherName()
    });
  }
  bulkTextInput.value = "";
  addStudentStatus.textContent = `${students.length} student(s) imported into FANTASMA.`;
});

teacherIdentity.textContent = getTeacherName();
sidebarIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

const GHOST_GROUP = "FANTASMA";
let studentsCache = {};
let groupsCache = {};
let assignmentsCache = {};
let sessionCache = null;
let selectedGhostKeys = new Set();
let selectionInitialized = false;
let selectedAssignmentId = "";
let selectedAssignmentSubmissions = {};
let stopSubmissionListener = null;
let selectedExistingStudentKeys = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text) {
  return String(text || "").replace(/\r/g, "").split("\n")
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      const cols = parseCsvLine(line);
      return {
        studentNumber: (cols[0] || "").trim(),
        fullName: (cols[1] || "").trim(),
        nickname: (cols[2] || "").trim()
      };
    }).filter((student) => student.fullName);
}

function parseBulkText(text) {
  return String(text || "").replace(/\r/g, "").split("\n")
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      if (line.includes("\t")) {
        const parts = line.split("\t");
        return {
          studentNumber: (parts[0] || "").trim(),
          fullName: parts.slice(1).join(" ").trim(),
          nickname: ""
        };
      }
      const parts = parseCsvLine(line);
      return {
        studentNumber: (parts[0] || "").trim(),
        fullName: (parts[1] || "").trim() || line,
        nickname: (parts[2] || "").trim()
      };
    }).filter((student) => student.fullName);
}

function initialBlockPoints() {
  const group = groupsCache?.[GHOST_GROUP] || {};
  return Object.fromEntries(evaluationBlockNames(group).map((blockName) => [blockName, 0]));
}

async function saveStudent(fullName, nickname = "", studentNumber = "", extras = {}) {
  const cleanName = String(fullName || "").trim();
  const cleanNickname = String(nickname || "").trim() || cleanName.split(" ")[0] || "Student";
  const cleanNumber = String(studentNumber || "").trim();
  const internalId = generateId();
  const newRef = push(ref(db, "students"));

  await set(newRef, {
    fullName: cleanName,
    name: cleanName,
    nickname: cleanNickname,
    studentNumber: cleanNumber,
    groupName: GHOST_GROUP,
    groupMemberships: { [GHOST_GROUP]: true },
    id: internalId,
    password: "1234",
    activeNow: false,
    enrollmentStatus: "approved",
    enrolledAt: Date.now(),
    blockPoints: initialBlockPoints(),
    ...extras
  });

  return newRef.key;
}

function setAddStudentPane(active) {
  const panes = {
    manual: [manualStudentTabBtn, manualStudentPane],
    csv: [csvStudentTabBtn, csvStudentPane],
    paste: [pasteStudentTabBtn, pasteStudentPane],
    existing: [existingStudentTabBtn, existingStudentPane]
  };
  Object.entries(panes).forEach(([key, [button, pane]]) => {
    const isActive = key === active;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    pane.hidden = !isActive;
  });
  if (active === "existing") renderExistingStudents();
}

function normalizeExistingSearch(value) {
  return String(value || "").toLocaleLowerCase().trim();
}

function existingStudentCandidates() {
  const query = normalizeExistingSearch(existingStudentSearch?.value || "");
  const groupFilter = String(existingStudentGroupFilter?.value || "");
  return Object.entries(studentsCache || {})
    .filter(([, student]) => !studentInGroup(student, GHOST_GROUP))
    .filter(([, student]) => !groupFilter || String(student?.groupName || "") === groupFilter)
    .filter(([studentKey, student]) => {
      if (!query) return true;
      return [
        studentKey,
        student?.fullName,
        student?.name,
        student?.nickname,
        student?.studentNumber,
        student?.externalId,
        student?.id,
        student?.groupName
      ].map(normalizeExistingSearch).join(" ").includes(query);
    })
    .sort((a, b) =>
      String(a[1]?.fullName || a[1]?.name || a[1]?.nickname || "")
        .localeCompare(String(b[1]?.fullName || b[1]?.name || b[1]?.nickname || ""), undefined, { sensitivity: "base" })
    );
}

function renderExistingGroupFilter() {
  const previous = existingStudentGroupFilter.value;
  const groups = [...new Set(
    Object.values(studentsCache || {})
      .map((student) => String(student?.groupName || "").trim())
      .filter(Boolean)
      .filter((groupName) => groupName !== GHOST_GROUP)
  )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  existingStudentGroupFilter.innerHTML =
    '<option value="">All groups</option>' +
    groups.map((groupName) => `<option value="${escapeHtml(groupName)}">${escapeHtml(groupName)}</option>`).join("");
  if (groups.includes(previous)) existingStudentGroupFilter.value = previous;
}

function syncExistingMaster(entries = existingStudentCandidates()) {
  const visibleKeys = entries.map(([studentKey]) => studentKey);
  const selectedVisible = visibleKeys.filter((studentKey) => selectedExistingStudentKeys.has(studentKey));
  existingStudentsMasterCheckbox.disabled = visibleKeys.length === 0;
  existingStudentsMasterCheckbox.checked =
    visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;
  existingStudentsMasterCheckbox.indeterminate =
    selectedVisible.length > 0 && selectedVisible.length < visibleKeys.length;
  existingStudentSelectionCount.textContent = `${selectedExistingStudentKeys.size} selected`;
  enrollExistingStudentsBtn.disabled = selectedExistingStudentKeys.size === 0;
}

function renderExistingStudents() {
  renderExistingGroupFilter();
  const entries = existingStudentCandidates();
  existingStudentsList.innerHTML = entries.length
    ? entries.map(([studentKey, student]) => {
        const checked = selectedExistingStudentKeys.has(studentKey) ? "checked" : "";
        const fullName = String(student?.fullName || student?.name || student?.nickname || studentKey).trim();
        const nickname = String(student?.nickname || "").trim();
        const groupName = String(student?.groupName || "").trim();
        const external = String(student?.studentNumber || student?.externalId || "").trim();
        return `
          <tr>
            <td><input class="existing-student-checkbox" type="checkbox"
              data-existing-student-key="${escapeHtml(studentKey)}" ${checked}
              aria-label="Select ${escapeHtml(fullName)}"></td>
            <td><span class="existing-student-name">${escapeHtml(fullName)}</span></td>
            <td>${escapeHtml(nickname || "—")}</td>
            <td>${escapeHtml(groupName || "—")}</td>
            <td>${escapeHtml(external || "—")}</td>
          </tr>
        `;
      }).join("")
    : '<tr><td colspan="5">No existing students match this search.</td></tr>';
  syncExistingMaster(entries);
}

function openAddStudentsDialog() {
  addStudentGroupLabel.textContent = `Group: ${GHOST_GROUP}`;
  addStudentStatus.textContent = "";
  selectedExistingStudentKeys.clear();
  existingStudentSearch.value = "";
  existingStudentGroupFilter.value = "";
  setAddStudentPane("manual");
  addStudentDialog.showModal();
}

async function enrollExistingStudents() {
  const selectedKeys = [...selectedExistingStudentKeys]
    .filter((studentKey) => studentsCache?.[studentKey])
    .filter((studentKey) => !studentInGroup(studentsCache[studentKey], GHOST_GROUP));

  if (!selectedKeys.length) {
    addStudentStatus.textContent = "Select at least one existing student.";
    return;
  }

  const now = Date.now();
  const updates = {};
  selectedKeys.forEach((studentKey) => {
    updates[`students/${studentKey}/groupMemberships/${GHOST_GROUP}`] = true;
    updates[`students/${studentKey}/enrollmentStatus`] = "approved";
    updates[`students/${studentKey}/enrollmentSource`] = "ghost-lab-existing";
    updates[`students/${studentKey}/enrolledAt`] = now;
    updates[`students/${studentKey}/enrolledBy`] = getTeacherName();
  });

  enrollExistingStudentsBtn.disabled = true;
  try {
    await update(ref(db), updates);
    selectedExistingStudentKeys.clear();
    addStudentStatus.textContent = `${selectedKeys.length} existing student(s) enrolled in ${GHOST_GROUP}.`;
    renderExistingStudents();
  } catch (error) {
    console.error(error);
    addStudentStatus.textContent = `Could not enroll selected students: ${error?.message || "unknown error"}`;
  }
}

function ghostNumber(student) {
  const external = String(student?.studentNumber || student?.externalId || student?.id || "").trim();
  const externalMatch = external.match(/^GHOST0*(\d+)$/i);
  if (externalMatch) return Number(externalMatch[1]);

  const nickname = String(student?.nickname || "").trim();
  const nicknameMatch = nickname.match(/^FAKE-0*(\d+)$/i);
  return nicknameMatch ? Number(nicknameMatch[1]) : Number.MAX_SAFE_INTEGER;
}

function isGhostStudent(student) {
  return studentInGroup(student, GHOST_GROUP);
}

function ghostEntries() {
  return Object.entries(studentsCache || {})
    .filter(([, student]) => isGhostStudent(student))
    .sort((a, b) => {
      const numeric = ghostNumber(a[1]) - ghostNumber(b[1]);
      if (numeric) return numeric;
      return String(a[1]?.nickname || "").localeCompare(String(b[1]?.nickname || ""));
    });
}

function selectedGhostEntries() {
  return ghostEntries().filter(([key]) => selectedGhostKeys.has(key));
}

function displayName(student) {
  return String(student?.nickname || student?.fullName || student?.name || "Ghost").trim();
}

function externalId(student) {
  return String(student?.studentNumber || student?.id || "").trim();
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function assignmentAppliesToStudent(assignment, studentKey, student) {
  const rawRecipients = assignment?.recipientStudentKeys;
  const recipientKeys = Array.isArray(rawRecipients)
    ? rawRecipients.map((value) => String(value || "")).filter(Boolean)
    : (rawRecipients && typeof rawRecipients === "object"
      ? Object.values(rawRecipients).map((value) => String(value || "")).filter(Boolean)
      : []);

  if (recipientKeys.length) return recipientKeys.includes(String(studentKey));

  const target = String(assignment?.groupName || "ALL");
  return target === "ALL" || studentInGroup(student, target);
}

function assignmentIsOpen(assignment) {
  if (!assignment?.active) return false;
  const dueAt = Number(assignment?.dueAt || 0);
  return !dueAt || Date.now() <= dueAt;
}

function eligibleAssignments() {
  const ghosts = ghostEntries();
  return Object.entries(assignmentsCache || {})
    .filter(([, assignment]) => assignmentIsOpen(assignment))
    .filter(([, assignment]) => ghosts.some(([studentKey, student]) => assignmentAppliesToStudent(assignment, studentKey, student)))
    .sort((a, b) => Number(b[1]?.createdAt || 0) - Number(a[1]?.createdAt || 0));
}

function gradeStatus(submission) {
  if (!submission?.driveFileId) {
    return submission?.withdrawn ? { text: "Withdrawn", cls: "withdrawn" } : { text: "No submission", cls: "" };
  }
  const raw = submission?.grading?.totalScore;
  const score = raw === null || raw === undefined || raw === "" ? null : Number(raw);
  if (submission?.gradePublished && Number.isFinite(score)) {
    return { text: `Published ${Number(score.toFixed(2))}/100`, cls: "published" };
  }
  if (Number.isFinite(score)) {
    return { text: `Reviewed ${Number(score.toFixed(2))}/100`, cls: "reviewed" };
  }
  return { text: "Pending review", cls: "pending" };
}

function teamForGhost(key) {
  return String(sessionCache?.assignments?.[key] || "—");
}

function ghostCanBuzz(key) {
  if (!sessionCache?.active) return false;
  const team = sessionCache?.assignments?.[key];
  const buzzer = sessionCache?.buzzer || {};
  if (!team || !buzzer.roundOpen || buzzer.currentBuzz) return false;
  return !Boolean(buzzer.lockedOutTeams?.[team]);
}

function syncGhostMasterCheckbox() {
  if (!ghostMasterCheckbox) return;
  const ghosts = ghostEntries();
  const selectedCount = ghosts.reduce(
    (count, [key]) => count + (selectedGhostKeys.has(key) ? 1 : 0),
    0
  );

  ghostMasterCheckbox.disabled = ghosts.length === 0;
  ghostMasterCheckbox.checked = ghosts.length > 0 && selectedCount === ghosts.length;
  ghostMasterCheckbox.indeterminate = selectedCount > 0 && selectedCount < ghosts.length;
}

function renderGhosts() {
  const ghosts = ghostEntries();
  if (!selectionInitialized && ghosts.length) {
    selectedGhostKeys = new Set(ghosts.map(([key]) => key));
    selectionInitialized = true;
  }

  if (!ghosts.length) {
    ghostTableBody.innerHTML = '<tr><td colspan="7" class="ghost-empty">No test students were found in the FANTASMA group.</td></tr>';
    syncGhostMasterCheckbox();
    return;
  }

  ghostTableBody.innerHTML = ghosts.map(([key, student]) => {
    const checked = selectedGhostKeys.has(key) ? "checked" : "";
    const online = student?.activeNow === true;
    const submission = selectedAssignmentId ? selectedAssignmentSubmissions?.[key] : null;
    const grade = selectedAssignmentId ? gradeStatus(submission) : null;
    const buzzDisabled = ghostCanBuzz(key) ? "" : "disabled";
    const onlineLabel = online ? "Online" : "Offline";
    const onlineClass = online ? "online" : "";
    const gradeHtml = grade ? `<div><span class="ghost-status ${grade.cls}">${escapeHtml(grade.text)}</span></div>` : "";

    return `
      <tr>
        <td><input class="ghost-select" type="checkbox" data-ghost-key="${escapeHtml(key)}" ${checked} aria-label="Use ${escapeHtml(displayName(student))}"></td>
        <td><div class="ghost-name">${escapeHtml(displayName(student))}</div>${gradeHtml}</td>
        <td>${escapeHtml(externalId(student) || "—")}</td>
        <td>${escapeHtml(student?.groupName || "GENERAL")}</td>
        <td><span class="ghost-status ${onlineClass}">${onlineLabel}</span></td>
        <td>${escapeHtml(teamForGhost(key))}</td>
        <td class="ghost-row-actions"><button type="button" data-buzz-ghost="${escapeHtml(key)}" ${buzzDisabled}>Buzz</button></td>
      </tr>
    `;
  }).join("");
  syncGhostMasterCheckbox();
}

function renderAssignmentOptions() {
  const entries = eligibleAssignments();
  const previous = selectedAssignmentId || assignmentSelect.value || "";

  assignmentSelect.innerHTML = '<option value="">Select open assignment</option>' + entries.map(([id, assignment]) => {
    const code = assignment?.code ? `${assignment.code} · ` : "";
    const group = assignment?.groupName || "ALL";
    return `<option value="${escapeHtml(id)}">${escapeHtml(code + (assignment?.title || "Assignment") + ` [${group}]`)}</option>`;
  }).join("");

  if (previous && entries.some(([id]) => id === previous)) {
    assignmentSelect.value = previous;
  } else {
    selectedAssignmentId = "";
  }

  if (!entries.length) {
    assignmentStatus.textContent = "No open assignment currently applies to the FANTASMA test students. Create one for FANTASMA or ALL.";
  } else if (!selectedAssignmentId) {
    assignmentStatus.textContent = "Choose an open assignment assigned to FANTASMA or ALL.";
  }
}

function renderAssignmentStatus() {
  if (!selectedAssignmentId) return;
  const assignment = assignmentsCache[selectedAssignmentId];
  if (!assignment) {
    assignmentStatus.textContent = "The selected assignment is no longer available.";
    return;
  }

  const ghosts = ghostEntries().filter(([, student]) => assignmentAppliesToStudent(assignment, student));
  const counts = { pending: 0, reviewed: 0, published: 0, withdrawn: 0, none: 0 };
  ghosts.forEach(([key]) => {
    const status = gradeStatus(selectedAssignmentSubmissions?.[key]);
    if (status.cls === "pending") counts.pending += 1;
    else if (status.cls === "reviewed") counts.reviewed += 1;
    else if (status.cls === "published") counts.published += 1;
    else if (status.cls === "withdrawn") counts.withdrawn += 1;
    else counts.none += 1;
  });

  assignmentStatus.textContent = `${assignment.code || "Assignment"} · ${ghosts.length} compatible Ghosts · ${counts.pending} pending · ${counts.reviewed} reviewed · ${counts.published} published · ${counts.none} not submitted`;
}

function renderSession() {
  const buzzer = sessionCache?.buzzer || {};
  sessionState.textContent = sessionCache?.active ? "Active" : "No active session";
  sessionGroup.textContent = sessionCache?.groupName || "—";
  roundState.textContent = buzzer?.roundOpen ? "OPEN" : "Closed";
  currentBuzzState.textContent = buzzer?.currentBuzz
    ? `${buzzer.currentBuzz.name || "Student"} · ${buzzer.currentBuzz.team || "No team"}`
    : "—";
  raceGhostsBtn.disabled = !sessionCache?.active || !buzzer?.roundOpen || Boolean(buzzer?.currentBuzz);
  renderGhosts();
}

async function setGhostPresence(active) {
  const entries = selectedGhostEntries();
  if (!entries.length) {
    presenceProgress.textContent = "Select at least one Ghost student.";
    return;
  }

  activateGhostsBtn.disabled = true;
  deactivateGhostsBtn.disabled = true;
  presenceProgress.textContent = active ? "Activating Ghost students…" : "Deactivating Ghost students…";

  try {
    const now = Date.now();
    const day = todayKey();
    const updates = {};

    for (const [key, student] of entries) {
      const attendanceSnap = await get(ref(db, `attendance/${day}/${key}`));
      const currentAttendance = attendanceSnap.val() || {};
      const name = displayName(student);
      const id = externalId(student);
      const groupName = student?.groupName || "GENERAL";

      updates[`students/${key}/activeNow`] = active;
      updates[`students/${key}/lastSeenAt`] = now;

      if (active) {
        updates[`attendance/${day}/${key}`] = {
          ...currentAttendance,
          studentKey: key,
          studentName: name,
          externalId: id,
          studentNumber: id,
          groupName,
          loginAt: Number(currentAttendance.loginAt || now),
          detectedAt: now,
          leaveAt: null,
          leaveReason: "",
          activeNow: true,
          leftEarly: false,
          eligibleToday: true,
          simulatedGhost: true
        };
      } else {
        updates[`attendance/${day}/${key}`] = {
          ...currentAttendance,
          studentKey: key,
          studentName: name,
          externalId: id,
          studentNumber: id,
          groupName,
          detectedAt: Number(currentAttendance.detectedAt || now),
          activeNow: false,
          leaveAt: now,
          leaveReason: "Ghost Test Lab stopped simulation",
          leftEarly: false,
          simulatedGhost: true
        };
      }
    }

    await update(ref(db), updates);
    presenceProgress.textContent = `${entries.length} Ghost student${entries.length === 1 ? "" : "s"} ${active ? "activated" : "deactivated"}.`;
  } catch (error) {
    console.error(error);
    presenceProgress.textContent = error?.message || "Could not update Ghost presence.";
  } finally {
    activateGhostsBtn.disabled = false;
    deactivateGhostsBtn.disabled = false;
  }
}

function asciiText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value, max = 78) {
  const words = asciiText(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function makePdfBlob(student, assignment) {
  const prompt = String(assignment?.instructions || "").split("[[YOUTEACH_RUBRIC_V1:")[0].trim();
  const lines = [
    "YouTeach Ghost Test Submission",
    "",
    `Student: ${displayName(student)}`,
    `External ID: ${externalId(student)}`,
    `Group: ${student?.groupName || "GENERAL"}`,
    `Assignment: ${(assignment?.code || "") + (assignment?.code ? " - " : "") + (assignment?.title || "Assignment")}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "TEST RESPONSE",
    "This is a simulated student submission created only to verify the YouTeach workflow.",
    "It should be reviewed and graded exactly like a normal PDF submission.",
    "The content is intentionally simple; the purpose is testing submission, grading and publication."
  ];

  if (prompt) {
    lines.push("", "Detected assignment instructions:", ...wrapText(prompt, 76).slice(0, 8));
  }
  lines.push("", `Sample answer from ${displayName(student)}: Test task completed.`);

  const contentLines = [];
  lines.slice(0, 34).forEach((line, index) => {
    if (index === 0) {
      contentLines.push(`BT /F1 16 Tf 50 755 Td (${asciiText(line)}) Tj ET`);
    } else {
      const y = 755 - index * 19;
      contentLines.push(`BT /F1 11 Tf 50 ${y} Td (${asciiText(line)}) Tj ET`);
    }
  });
  const stream = contentLines.join("\n") + "\n";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = new TextEncoder().encode(pdf).length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
}

async function uploadGhostSubmission(assignmentId, key, student) {
  const assignment = assignmentsCache[assignmentId];
  if (!assignment) throw new Error("Assignment not found.");
  if (!assignmentAppliesToStudent(assignment, student)) throw new Error(`${displayName(student)} is not in the assignment group.`);
  const id = externalId(student);
  if (!id) throw new Error(`${displayName(student)} has no external ID.`);

  const blob = makePdfBlob(student, assignment);
  const response = await fetch("/api/drive-upload-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "X-Assignment-Id": assignmentId,
      "X-Student-Key": key,
      "X-External-Id": id,
      "X-File-Size": String(blob.size)
    },
    body: blob
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Upload failed for ${displayName(student)}.`);
  }
  return result;
}

async function withdrawGhostSubmission(assignmentId, key, student) {
  const id = externalId(student);
  if (!id) throw new Error(`${displayName(student)} has no external ID.`);
  const response = await fetch("/api/drive-upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "undo", assignmentId, studentKey: key, externalId: id })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Withdrawal failed for ${displayName(student)}.`);
  }
  return result;
}

async function runAssignmentBatch(mode) {
  const assignmentId = assignmentSelect.value;
  if (!assignmentId) {
    assignmentProgress.textContent = "Select an assignment first.";
    return;
  }

  const assignment = assignmentsCache[assignmentId];
  const entries = selectedGhostEntries().filter(([, student]) => assignmentAppliesToStudent(assignment, student));
  if (!entries.length) {
    assignmentProgress.textContent = "None of the selected Ghosts belong to the assignment group.";
    return;
  }

  submitGhostWorkBtn.disabled = true;
  withdrawGhostWorkBtn.disabled = true;
  const failures = [];
  let completed = 0;

  try {
    for (const [key, student] of entries) {
      assignmentProgress.textContent = `${mode === "submit" ? "Submitting" : "Withdrawing"} ${displayName(student)} (${completed + 1}/${entries.length})…`;
      try {
        if (mode === "submit") await uploadGhostSubmission(assignmentId, key, student);
        else await withdrawGhostSubmission(assignmentId, key, student);
        completed += 1;
      } catch (error) {
        console.error(error);
        failures.push(`${displayName(student)}: ${error?.message || "error"}`);
      }
    }

    assignmentProgress.textContent = failures.length
      ? `${completed} completed; ${failures.length} failed. ${failures.join(" | ")}`
      : `${completed} Ghost submission${completed === 1 ? "" : "s"} ${mode === "submit" ? "uploaded" : "withdrawn"} successfully.`;
  } finally {
    submitGhostWorkBtn.disabled = false;
    withdrawGhostWorkBtn.disabled = false;
  }
}

async function buzzAsGhost(key) {
  const student = studentsCache[key];
  if (!student) throw new Error("Ghost student not found.");

  let accepted = false;
  let rejection = "The buzzer did not accept this press.";
  await runTransaction(ref(db, "session/current/buzzer"), (buzzer) => {
    if (!buzzer) {
      rejection = "No active buzzer state.";
      return buzzer;
    }
    if (!buzzer.roundOpen) {
      rejection = "The round is closed.";
      return buzzer;
    }
    const team = sessionCache?.assignments?.[key];
    if (!team) {
      rejection = `${displayName(student)} has no team in this session.`;
      return buzzer;
    }

    buzzer.queue = [];
    buzzer.lockedOutTeams = buzzer.lockedOutTeams || {};
    if (buzzer.lockedOutTeams[team]) {
      rejection = `${team} is locked out.`;
      return buzzer;
    }
    if (buzzer.currentBuzz) {
      rejection = `${buzzer.currentBuzz.name || "Another student"} already buzzed.`;
      return buzzer;
    }

    buzzer.currentBuzz = {
      studentKey: key,
      id: externalId(student),
      name: displayName(student),
      team,
      timestamp: Date.now()
    };
    accepted = true;
    return buzzer;
  });

  if (!accepted) throw new Error(rejection);
  return true;
}

async function simulateRace() {
  const eligible = selectedGhostEntries().filter(([key]) => ghostCanBuzz(key));
  if (!eligible.length) {
    buzzerProgress.textContent = "No selected Ghost is currently eligible to buzz. Create teams and open the round first.";
    return;
  }

  raceGhostsBtn.disabled = true;
  buzzerProgress.textContent = `Racing ${eligible.length} Ghost students…`;
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);

  try {
    await Promise.all(shuffled.map(([key], index) => new Promise((resolve) => {
      const delay = 40 + Math.floor(Math.random() * 180) + index * 3;
      window.setTimeout(async () => {
        try { await buzzAsGhost(key); } catch (_) {}
        resolve();
      }, delay);
    })));
    window.setTimeout(() => {
      const current = sessionCache?.buzzer?.currentBuzz;
      buzzerProgress.textContent = current
        ? `First buzz: ${current.name || "Ghost"} · ${current.team || "No team"}.`
        : "Race finished, but no buzz was accepted.";
    }, 350);
  } finally {
    window.setTimeout(() => {
      raceGhostsBtn.disabled = !sessionCache?.active || !sessionCache?.buzzer?.roundOpen || Boolean(sessionCache?.buzzer?.currentBuzz);
    }, 400);
  }
}

function subscribeToSelectedAssignment() {
  if (stopSubmissionListener) {
    stopSubmissionListener();
    stopSubmissionListener = null;
  }
  selectedAssignmentSubmissions = {};
  selectedAssignmentId = assignmentSelect.value || "";

  if (!selectedAssignmentId) {
    renderGhosts();
    renderAssignmentStatus();
    return;
  }

  stopSubmissionListener = onValue(ref(db, `assignmentSubmissions/${selectedAssignmentId}`), (snapshot) => {
    selectedAssignmentSubmissions = snapshot.val() || {};
    renderGhosts();
    renderAssignmentStatus();
  });
}

ghostTableBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".ghost-select");
  if (!checkbox) return;
  const key = checkbox.dataset.ghostKey || "";
  if (!key) return;
  if (checkbox.checked) selectedGhostKeys.add(key);
  else selectedGhostKeys.delete(key);
  syncGhostMasterCheckbox();
});

ghostTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-buzz-ghost]");
  if (!button) return;
  const key = button.dataset.buzzGhost || "";
  button.disabled = true;
  buzzerProgress.textContent = `Buzzing as ${displayName(studentsCache[key])}…`;
  try {
    await buzzAsGhost(key);
    buzzerProgress.textContent = `${displayName(studentsCache[key])} buzzed successfully.`;
  } catch (error) {
    buzzerProgress.textContent = error?.message || "Buzz failed.";
  }
});

ghostMasterCheckbox.addEventListener("change", () => {
  selectedGhostKeys = ghostMasterCheckbox.checked
    ? new Set(ghostEntries().map(([key]) => key))
    : new Set();
  renderGhosts();
});
activateGhostsBtn.addEventListener("click", () => setGhostPresence(true));
deactivateGhostsBtn.addEventListener("click", () => setGhostPresence(false));
assignmentSelect.addEventListener("change", subscribeToSelectedAssignment);
submitGhostWorkBtn.addEventListener("click", () => runAssignmentBatch("submit"));
withdrawGhostWorkBtn.addEventListener("click", () => runAssignmentBatch("withdraw"));
raceGhostsBtn.addEventListener("click", simulateRace);

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  if (existingStudentPane && !existingStudentPane.hidden) renderExistingStudents();
  renderGhosts();
  renderAssignmentOptions();
  renderAssignmentStatus();
});

onValue(ref(db, "assignments"), (snapshot) => {
  assignmentsCache = snapshot.val() || {};
  renderAssignmentOptions();
  renderAssignmentStatus();
});

onValue(ref(db, "session/current"), (snapshot) => {
  sessionCache = snapshot.val() || null;
  renderSession();
});
