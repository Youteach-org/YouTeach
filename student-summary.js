import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

const params = new URLSearchParams(window.location.search);
const teacherViewStudentKey = params.get("teacherViewStudentKey") || sessionStorage.getItem("teacherViewStudentKey") || "";
const isTeacherView = Boolean(teacherViewStudentKey);

let studentKey = "";

if (isTeacherView) {
  requireTeacherAuth();
  studentKey = teacherViewStudentKey;
  sessionStorage.setItem("teacherViewStudentKey", studentKey);
} else {
  const session = requireStudentSession();
  if (!session) throw new Error("Student session required.");
  studentKey = session.studentKey;
}

const studentIdentity = document.getElementById("studentIdentity");
const displayNameCard = document.getElementById("displayNameCard");
const groupCard = document.getElementById("groupCard");
const classActiveBlockHero = document.getElementById("classActiveBlockHero");
const classActiveBlockStatus = document.getElementById("classActiveBlockStatus");
const totalBlockPointsCard = document.getElementById("totalBlockPointsCard");
const blockSelector = document.getElementById("blockSelector");
const viewingBlockStatus = document.getElementById("viewingBlockStatus");
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");
const attendanceStatusText = document.getElementById("attendanceStatusText");
const summaryPageTitle = document.getElementById("summaryPageTitle");
const summaryPageSubtitle = document.getElementById("summaryPageSubtitle");
const blockScoreTableBody = document.getElementById("blockScoreTableBody");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};
let selectedBlock = "";

function cleanText(value) {
  return String(value || "")
    .replace(/ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·|ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€š|Ãƒâ€šÃ‚Â·|Ã‚Â·|ÃƒÆ’Ã¢â‚¬Å¡|Ãƒâ€š/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function setupTeacherViewShell() {
  if (!isTeacherView) return;

  const brandTitle = document.querySelector(".brand h1");
  const brandSubtitle = document.querySelector(".brand p");
  const sidebarIdentity = document.getElementById("sidebarIdentity");
  const sidebarLinks = document.querySelector(".sidebar-links");

  if (brandTitle) brandTitle.textContent = "YouTeach";
  if (brandSubtitle) brandSubtitle.textContent = "Teacher Menu";
  if (sidebarIdentity) sidebarIdentity.textContent = getTeacherName();
  if (studentIdentity) studentIdentity.textContent = getTeacherName();

  if (summaryPageTitle) summaryPageTitle.textContent = "Student Summary";
  if (summaryPageSubtitle) summaryPageSubtitle.textContent = "Teacher view with teacher permissions.";

  if (sidebarLinks) {
    sidebarLinks.innerHTML = `
      <a class="sidebar-link" href="buzzer.html">Buzzer</a>
      <a class="sidebar-link" href="teacher.html">Teacher Home</a>
      <a class="sidebar-link active-link" href="teacher-students.html">Students</a>
      <a class="sidebar-link" href="teacher-enrollment.html">Groups / Import</a>
      <a class="sidebar-link" href="teacher-active.html">Active Today</a>
      <a class="sidebar-link" href="teacher-points.html">Points / Export</a>
      <a class="sidebar-link" href="teacher-history.html">History</a>
      <button id="logoutBtn" class="logout-btn">Logout</button>
    `;
  }

  const freshLogoutBtn = document.getElementById("logoutBtn");
  if (freshLogoutBtn) freshLogoutBtn.addEventListener("click", logoutTeacher);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function renderAttendanceStatus(row) {
  if (!attendanceStatusText) return;

  if (currentStudent?.activeNow === true) {
    attendanceStatusText.textContent = "Active now";
    return;
  }

  if (row?.leaveAt) {
    attendanceStatusText.textContent = "Logged out today";
    return;
  }

  attendanceStatusText.textContent = "Not active yet";
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp).toLocaleString();
}

function getNickname(student) {
  if (!student) return "Student";
  return cleanText(student.nickname || ((student.fullName || student.name || "").split(" ")[0]) || "Student");
}

function getFullName(student) {
  if (!student) return "Student";
  return cleanText(student.fullName || student.name || student.nickname || "Student");
}

function getExternalId(student) {
  return cleanText(student?.studentNumber || student?.externalId || "");
}

function formatTopIdentity(student) {
  const fullName = getFullName(student);
  const externalId = getExternalId(student);
  return externalId ? `${fullName} - ${externalId}` : fullName;
}

function getExamPoints(student, blockName) {
  const examBlock = student?.examPoints?.[blockName] || {};
  return {
    written: Number(examBlock.written || 0),
    oral: Number(examBlock.oral || 0),
    verbs: Number(examBlock.verbs || 0)
  };
}

function getExtraBlockPoints(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function getAttendancePoints(student, blockName) {
  return Number(student?.attendancePoints?.[blockName] || 0);
}

function getAvailableBlocks() {
  const blockSet = new Set(["Block 1", "Block 2", "Block 3"]);

  Object.keys(currentStudent?.blockPoints || {}).forEach((blockName) => blockSet.add(blockName));
  Object.keys(currentStudent?.examPoints || {}).forEach((blockName) => blockSet.add(blockName));
  Object.keys(currentStudent?.attendancePoints || {}).forEach((blockName) => blockSet.add(blockName));
  Object.keys(settingsCache?.closedBlocks || {}).forEach((blockName) => blockSet.add(blockName));

  if (settingsCache?.activeBlock) blockSet.add(settingsCache.activeBlock);

  return Array.from(blockSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function ensureSelectedBlock() {
  const availableBlocks = getAvailableBlocks();

  if (!selectedBlock || !availableBlocks.includes(selectedBlock)) {
    selectedBlock = settingsCache.activeBlock || availableBlocks[0] || "Block 1";
  }

  if (blockSelector) {
    blockSelector.innerHTML = availableBlocks.map((blockName) => `<option value="${blockName}">${blockName}</option>`).join("");
    blockSelector.value = selectedBlock;
  }
}

function renderHistory(blockName) {
  if (!studentHistoryTableBody) return;

  const historyEntries = Object.entries(pointsLogCache || {})
    .filter(([, entry]) => entry.studentKey === studentKey && (entry.block || "") === blockName)
    .sort((a, b) => Number(b[1]?.appliedAt || 0) - Number(a[1]?.appliedAt || 0));

  if (!historyEntries.length) {
    studentHistoryTableBody.innerHTML = `<tr><td colspan="7">No point history for ${blockName} yet.</td></tr>`;
    return;
  }

  studentHistoryTableBody.innerHTML = historyEntries.map(([, entry]) => `
    <tr>
      <td>${entry.type || ""}</td>
      <td>${entry.block || ""}</td>
      <td>${Number(entry.addedPoints || 0)}</td>
      <td>${Number(entry.previousPoints || 0)}</td>
      <td>${Number(entry.newPoints || 0)}</td>
      <td>${entry.teamLabel || ""}</td>
      <td>${formatDate(entry.appliedAt)}</td>
    </tr>
  `).join("");
}

function formatGradeNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
}

function renderBlockScoreTable(examPoints, pointTotal, attendancePoints, taskPoints, totalBlockPoints) {
  if (!blockScoreTableBody) return;

  blockScoreTableBody.innerHTML = `
    <tr>
      <td>${examPoints.written}</td>
      <td>${examPoints.oral}</td>
      <td>${examPoints.verbs}</td>
      <td>${pointTotal}</td>
      <td>${attendancePoints}</td>
      <td>${taskPoints}</td>
      <td><strong>${formatGradeNumber(totalBlockPoints)}</strong></td>
    </tr>
  `;
}

function renderAll() {
  if (!currentStudent) return;

  ensureSelectedBlock();

  const topIdentity = formatTopIdentity(currentStudent);
  const nickname = getNickname(currentStudent);
  const activeBlock = settingsCache.activeBlock || "Block 1";
  const currentTeam = currentSession?.assignments?.[studentKey] || "";
  const showLivePoints = selectedBlock === activeBlock;

  const liveTeamPoints = showLivePoints ? Number(currentSession?.liveTeamPoints?.[currentTeam] || 0) : 0;
  const liveStudentPoints = showLivePoints ? Number(currentSession?.liveStudentPoints?.[studentKey] || 0) : 0;
  const examPoints = getExamPoints(currentStudent, selectedBlock);
  const storedPoints = getExtraBlockPoints(currentStudent, selectedBlock);
  const pointTotal = storedPoints + liveStudentPoints + liveTeamPoints;
  const attendancePoints = getAttendancePoints(currentStudent, selectedBlock);
    const taskPoints = Number(currentStudent?.taskPoints?.[selectedBlock] || 0);
  const totalBlockPoints = examPoints.written + examPoints.oral + examPoints.verbs + pointTotal + attendancePoints + taskPoints;

  const activeBlockClosed = !!settingsCache?.closedBlocks?.[activeBlock];
  const selectedBlockClosed = !!settingsCache?.closedBlocks?.[selectedBlock];

  if (studentIdentity) studentIdentity.textContent = isTeacherView ? getTeacherName() : topIdentity;
  if (displayNameCard) displayNameCard.textContent = isTeacherView ? topIdentity : nickname;
  if (groupCard) groupCard.textContent = currentStudent.groupName || "";
  if (classActiveBlockHero) classActiveBlockHero.textContent = activeBlock;
  if (classActiveBlockStatus) classActiveBlockStatus.textContent = activeBlockClosed ? "Closed block" : "Open block";
  if (viewingBlockStatus) viewingBlockStatus.textContent = selectedBlockClosed ? "Selected block is closed." : "Selected block is open.";
  if (totalBlockPointsCard) totalBlockPointsCard.textContent = formatGradeNumber(totalBlockPoints);

  renderBlockScoreTable(examPoints, pointTotal, attendancePoints, taskPoints, totalBlockPoints);
  renderHistory(selectedBlock);
}

setupTeacherViewShell();

if (blockSelector) {
  blockSelector.addEventListener("change", () => {
    selectedBlock = blockSelector.value || settingsCache.activeBlock || "Block 1";
    renderAll();
  });
}

if (!isTeacherView) {
  const studentLogoutBtn = document.getElementById("logoutBtn");
  if (studentLogoutBtn) {
    studentLogoutBtn.addEventListener("click", async () => {
      const reason = prompt("Reason for leaving (optional):", "") || "";
      await saveLeaveLog(studentKey, reason);
      clearStudentSession();
      window.location.href = "index.html";
    });
  }
}

onValue(ref(db, `students/${studentKey}`), (snapshot) => {
  currentStudent = snapshot.val();

  if (!currentStudent) {
    if (isTeacherView) {
      alert("Student not found.");
      window.location.href = "teacher-students.html";
    } else {
      clearStudentSession();
      window.location.href = "index.html";
    }
    return;
  }

  renderAll();
});

onValue(ref(db, "session/current"), (snapshot) => {
  currentSession = snapshot.val() || null;
  renderAll();
});

onValue(ref(db, "settings"), (snapshot) => {
  settingsCache = snapshot.val() || {};
  selectedBlock = selectedBlock || settingsCache.activeBlock || "Block 1";
  renderAll();
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderAll();
});

onValue(ref(db, `attendance/${todayKey()}/${studentKey}`), (snapshot) => {
  renderAttendanceStatus(snapshot.val() || null);
});