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
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");
const attendanceStatusText = document.getElementById("attendanceStatusText");
const summaryPageTitle = document.getElementById("summaryPageTitle");
const summaryPageSubtitle = document.getElementById("summaryPageSubtitle");
const blockScoreTableBody = document.getElementById("blockScoreTableBody");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};

function cleanText(value) {
  return String(value || "")
    .replace(/Ã|Â|·/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatGradeNumber(value) {
  const number = Number(value || 0);
  return Number(number.toFixed(1)).toString();
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
      <a class="sidebar-link active-link" href="/group-mangement">Group Management</a>
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

function getP(student, blockName) {
  return Number(student?.blockPoints?.[blockName] || 0);
}

function getA(student, blockName) {
  return Number(student?.attendancePoints?.[blockName] || 0);
}

function getT(student, blockName) {
  return Number(student?.taskPoints?.[blockName] || 0);
}

function blockHasGrades(blockName) {
  const exam = currentStudent?.examPoints?.[blockName] || {};
  return Boolean(
    exam.written !== undefined ||
    exam.oral !== undefined ||
    exam.verbs !== undefined ||
    currentStudent?.blockPoints?.[blockName] !== undefined ||
    currentStudent?.attendancePoints?.[blockName] !== undefined ||
    currentStudent?.taskPoints?.[blockName] !== undefined
  );
}

function getBlockGradeData(blockName) {
  const exam = getExamPoints(currentStudent, blockName);
  const p = getP(currentStudent, blockName);
  const a = getA(currentStudent, blockName);
  const t = getT(currentStudent, blockName);
  const total = exam.written + exam.oral + exam.verbs + p + a + t;

  return { exam, p, a, t, total };
}

function renderBlockScoreTable() {
  if (!blockScoreTableBody) return;

  const blocks = ["Block 1", "Block 2", "Block 3"];

  blockScoreTableBody.innerHTML = blocks.map((blockName) => {
    if (!blockHasGrades(blockName)) {
      return `
        <tr>
          <td>${blockName}</td>
          <td>NY</td>
          <td>NY</td>
          <td>NY</td>
          <td>NY</td>
          <td>NY</td>
          <td>NY</td>
          <td><strong>NY</strong></td>
        </tr>
      `;
    }

    const data = getBlockGradeData(blockName);

    return `
      <tr>
        <td>${blockName}</td>
        <td>${formatGradeNumber(data.exam.written)}</td>
        <td>${formatGradeNumber(data.exam.oral)}</td>
        <td>${formatGradeNumber(data.exam.verbs)}</td>
        <td>${formatGradeNumber(data.p)}</td>
        <td>${formatGradeNumber(data.a)}</td>
        <td>${formatGradeNumber(data.t)}</td>
        <td><strong>${formatGradeNumber(data.total)}</strong></td>
      </tr>
    `;
  }).join("");
}

function renderHistory() {
  if (!studentHistoryTableBody) return;

  const blocks = ["Block 1", "Block 2", "Block 3"];
  const rows = [];

  blocks.forEach((blockName) => {
    const historyEntries = Object.entries(pointsLogCache || {})
      .filter(([, entry]) => entry.studentKey === studentKey && (entry.block || "") === blockName)
      .sort((a, b) => Number(b[1]?.appliedAt || 0) - Number(a[1]?.appliedAt || 0));

    if (!historyEntries.length) {
      rows.push(`
        <tr>
          <td>${blockName}</td>
          <td colspan="6">NY</td>
        </tr>
      `);
      return;
    }

    historyEntries.forEach(([, entry]) => {
      rows.push(`
        <tr>
          <td>${entry.block || blockName}</td>
          <td>${entry.type || ""}</td>
          <td>${Number(entry.addedPoints || 0)}</td>
          <td>${Number(entry.previousPoints || 0)}</td>
          <td>${Number(entry.newPoints || 0)}</td>
          <td>${entry.teamLabel || ""}</td>
          <td>${formatDate(entry.appliedAt)}</td>
        </tr>
      `);
    });
  });

  studentHistoryTableBody.innerHTML = rows.join("");
}

function renderAll() {
  if (!currentStudent) return;

  const topIdentity = formatTopIdentity(currentStudent);
  const nickname = getNickname(currentStudent);
  const activeBlock = settingsCache.activeBlock || "Block 1";
  const activeBlockClosed = !!settingsCache?.closedBlocks?.[activeBlock];
  const activeBlockData = getBlockGradeData(activeBlock);

  if (studentIdentity) studentIdentity.textContent = isTeacherView ? getTeacherName() : topIdentity;
  if (displayNameCard) displayNameCard.textContent = isTeacherView ? topIdentity : nickname;
  if (groupCard) groupCard.textContent = currentStudent.groupName || "";
  if (classActiveBlockHero) classActiveBlockHero.textContent = activeBlock;
  if (classActiveBlockStatus) classActiveBlockStatus.textContent = activeBlockClosed ? "Closed block" : "Open block";

  if (totalBlockPointsCard) {
    totalBlockPointsCard.textContent = blockHasGrades(activeBlock) ? formatGradeNumber(activeBlockData.total) : "NY";
  }

  renderBlockScoreTable();
  renderHistory();
}

setupTeacherViewShell();

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
      window.location.href = "/group-mangement";
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
  renderAll();
});

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderAll();
});

onValue(ref(db, `attendance/${todayKey()}/${studentKey}`), (snapshot) => {
  renderAttendanceStatus(snapshot.val() || null);
});