import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { studentGroupNames, studentInGroup } from "./student-groups.js";

const WORKING_GROUP_KEY = "youteachWorkingGroup";
const params = new URLSearchParams(window.location.search);
const openedFromTeacherMenu = params.get("teacherMenu") === "1";
if (openedFromTeacherMenu) sessionStorage.removeItem("teacherViewStudentKey");
const teacherViewStudentKey = openedFromTeacherMenu
  ? ""
  : (params.get("teacherViewStudentKey") || sessionStorage.getItem("teacherViewStudentKey") || "");
const teacherSessionActive = sessionStorage.getItem("youteachTeacherAuth") === "true";
const isTeacherView = Boolean(teacherViewStudentKey) || teacherSessionActive;

let studentKey = "";

if (isTeacherView) {
  requireTeacherAuth();
  studentKey = teacherViewStudentKey;
  if (studentKey) sessionStorage.setItem("teacherViewStudentKey", studentKey);
} else {
  const session = requireStudentSession();
  if (!session) throw new Error("Student session required.");
  studentKey = session.studentKey;
}

const studentIdentity = document.getElementById("studentIdentity");
const displayNameCard = document.getElementById("displayNameCard");
const groupCard = document.getElementById("groupCard");
const classActiveBlockHero = document.getElementById("classActiveBlockHero");
const totalBlockPointsCard = document.getElementById("totalBlockPointsCard");
const studentHistoryTableBody = document.getElementById("studentHistoryTableBody");
const summaryPageTitle = document.getElementById("summaryPageTitle");
const summaryPageSubtitle = document.getElementById("summaryPageSubtitle");
const blockScoreTableBody = document.getElementById("blockScoreTableBody");
const previousStudentBtn = document.getElementById("previousStudentBtn");
const nextStudentBtn = document.getElementById("nextStudentBtn");

let currentStudent = null;
let currentSession = null;
let settingsCache = {};
let pointsLogCache = {};
let studentsCache = {};

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
  if (studentIdentity) {
    studentIdentity.textContent = getTeacherName();
    studentIdentity.id = "teacherIdentity";
  }

  if (summaryPageTitle) summaryPageTitle.textContent = "Student Summary";
  if (summaryPageSubtitle) summaryPageSubtitle.textContent = "Teacher view with teacher permissions.";

  if (sidebarLinks) {
    sidebarLinks.innerHTML = `
      <a class="sidebar-link" href="buzzer.html">Buzzer</a>
      <a class="sidebar-link" href="teacher.html">Teacher Home</a>
      <a class="sidebar-link" href="/group-mangement">Group Management</a>
      <a class="sidebar-link active-link" href="student-summary.html?teacherMenu=1">Students Summary</a>
      <a class="sidebar-link" href="/points">Points</a>
      <a class="sidebar-link" href="teacher-history.html">History</a>
      <button id="logoutBtn" class="logout-btn">Logout</button>
    `;
  }

  const freshLogoutBtn = document.getElementById("logoutBtn");
  if (freshLogoutBtn) freshLogoutBtn.addEventListener("click", logoutTeacher);
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
  const activeBlockData = getBlockGradeData(activeBlock);

  if (studentIdentity) studentIdentity.textContent = isTeacherView ? getTeacherName() : topIdentity;
  if (displayNameCard) {
    displayNameCard.textContent = isTeacherView ? topIdentity : nickname;
    displayNameCard.classList.toggle("present-now", currentStudent.activeNow === true);
  }
  if (groupCard) {
    groupCard.textContent = isTeacherView
      ? (sessionStorage.getItem(WORKING_GROUP_KEY) || currentStudent.groupName || "")
      : (currentStudent.groupName || "");
  }
  if (classActiveBlockHero) classActiveBlockHero.textContent = activeBlock;

  if (totalBlockPointsCard) {
    totalBlockPointsCard.textContent = blockHasGrades(activeBlock) ? formatGradeNumber(activeBlockData.total) : "NY";
  }

  renderBlockScoreTable();
  renderHistory();
}

function activeTeacherGroup() {
  return String(sessionStorage.getItem(WORKING_GROUP_KEY) || "").trim();
}

function teacherGroupEntries() {
  const groupName = activeTeacherGroup();
  if (!groupName) return [];
  return Object.entries(studentsCache || {})
    .filter(([, student]) => studentInGroup(student, groupName))
    .sort((a, b) =>
      getFullName(a[1]).localeCompare(getFullName(b[1]), undefined, { sensitivity: "base" })
    );
}

function updateTeacherStudentUrl() {
  if (!isTeacherView || !studentKey) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("teacherMenu");
  url.searchParams.set("teacherViewStudentKey", studentKey);
  history.replaceState(null, "", url);
}

function renderTeacherStudentNavigation() {
  if (!isTeacherView) {
    previousStudentBtn.hidden = true;
    nextStudentBtn.hidden = true;
    return;
  }

  const entries = teacherGroupEntries();
  const index = entries.findIndex(([key]) => key === studentKey);
  const hasSelection = index >= 0;

  previousStudentBtn.hidden = !hasSelection || entries.length <= 1;
  nextStudentBtn.hidden = !hasSelection || entries.length <= 1;
  previousStudentBtn.disabled = !hasSelection || index <= 0;
  nextStudentBtn.disabled = !hasSelection || index >= entries.length - 1;
}

function selectTeacherStudent(nextStudentKey, { updateUrl = true } = {}) {
  const nextStudent = studentsCache?.[nextStudentKey] || null;
  if (!nextStudent) return false;

  studentKey = nextStudentKey;
  currentStudent = nextStudent;
  sessionStorage.setItem("teacherViewStudentKey", studentKey);
  if (updateUrl) updateTeacherStudentUrl();
  renderAll();
  renderTeacherStudentNavigation();
  return true;
}

function renderTeacherSummaryLanding(message = "No students found in the active group.") {
  if (!isTeacherView) return;
  currentStudent = null;
  studentKey = "";
  sessionStorage.removeItem("teacherViewStudentKey");
  if (summaryPageTitle) summaryPageTitle.textContent = "Students Summary";
  if (summaryPageSubtitle) summaryPageSubtitle.textContent = message;
  if (displayNameCard) {
    displayNameCard.textContent = "No student selected";
    displayNameCard.classList.remove("present-now");
  }
  if (groupCard) groupCard.textContent = activeTeacherGroup() || "—";
  if (classActiveBlockHero) classActiveBlockHero.textContent = "—";
  if (totalBlockPointsCard) totalBlockPointsCard.textContent = "—";
  if (blockScoreTableBody) blockScoreTableBody.innerHTML = '<tr><td colspan="8">No student available for this group.</td></tr>';
  if (studentHistoryTableBody) studentHistoryTableBody.innerHTML = '<tr><td colspan="7">No student available.</td></tr>';
  renderTeacherStudentNavigation();
}

function syncTeacherStudentSelection() {
  if (!isTeacherView) return;

  let groupName = activeTeacherGroup();
  if (!groupName && studentKey && studentsCache?.[studentKey]) {
    groupName = studentGroupNames(studentsCache[studentKey])[0] || "";
    if (groupName) {
      sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
      window.dispatchEvent(new CustomEvent("youteach:working-group-changed", { detail: { groupName } }));
    }
  }

  if (!groupName) {
    renderTeacherSummaryLanding("Select an active group first.");
    return;
  }

  const entries = teacherGroupEntries();
  if (!entries.length) {
    renderTeacherSummaryLanding(`No students enrolled in ${groupName}.`);
    return;
  }

  const currentStillBelongs = Boolean(
    studentKey &&
    studentsCache?.[studentKey] &&
    studentInGroup(studentsCache[studentKey], groupName)
  );

  if (!currentStillBelongs) {
    selectTeacherStudent(entries[0][0]);
    return;
  }

  currentStudent = studentsCache[studentKey];
  renderAll();
  renderTeacherStudentNavigation();
}

setupTeacherViewShell();

if (isTeacherView) {
  previousStudentBtn.addEventListener("click", () => {
    const entries = teacherGroupEntries();
    const index = entries.findIndex(([key]) => key === studentKey);
    if (index > 0) selectTeacherStudent(entries[index - 1][0]);
  });

  nextStudentBtn.addEventListener("click", () => {
    const entries = teacherGroupEntries();
    const index = entries.findIndex(([key]) => key === studentKey);
    if (index >= 0 && index < entries.length - 1) selectTeacherStudent(entries[index + 1][0]);
  });

  onValue(ref(db, "students"), (snapshot) => {
    studentsCache = snapshot.val() || {};
    syncTeacherStudentSelection();
  });

  window.addEventListener("youteach:working-group-changed", () => {
    studentKey = "";
    syncTeacherStudentSelection();
  });
} else {
  const studentLogoutBtn = document.getElementById("logoutBtn");
  if (studentLogoutBtn) {
    studentLogoutBtn.addEventListener("click", async () => {
      const reason = prompt("Reason for leaving (optional):", "") || "";
      await saveLeaveLog(studentKey, reason);
      clearStudentSession();
      window.location.href = "index.html";
    });
  }

  onValue(ref(db, `students/${studentKey}`), (snapshot) => {
    currentStudent = snapshot.val();

    if (!currentStudent) {
      clearStudentSession();
      window.location.href = "index.html";
      return;
    }

    renderAll();
  });
}

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
