import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const pointHistorySearch = document.getElementById("pointHistorySearch");
const pointHistoryBlockFilter = document.getElementById("pointHistoryBlockFilter");
const pointHistoryTypeFilter = document.getElementById("pointHistoryTypeFilter");
const pointsHistoryTableBody = document.getElementById("pointsHistoryTableBody");
const attendanceHistoryTableBody = document.getElementById("attendanceHistoryTableBody");
const sessionHistoryTableBody = document.getElementById("sessionHistoryTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);


let pointsLogCache = {};
let sessionHistoryCache = {};
let attendanceCache = {};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
}

function renderPointsHistory() {
  const studentQuery = normalizeText(pointHistorySearch.value);
  const blockFilter = pointHistoryBlockFilter.value;
  const typeFilter = pointHistoryTypeFilter.value;

  const entries = Object.entries(pointsLogCache || {}).sort((a, b) => Number(b[1]?.appliedAt || 0) - Number(a[1]?.appliedAt || 0))
    .filter(([, entry]) => {
      const matchesStudent = !studentQuery || normalizeText(entry.studentName || "").includes(studentQuery);
      const matchesBlock = !blockFilter || entry.block === blockFilter;
      const matchesType = !typeFilter || entry.type === typeFilter;
      return matchesStudent && matchesBlock && matchesType;
    });

  if (!entries.length) {
    pointsHistoryTableBody.innerHTML = `<tr><td colspan="8">No point history found.</td></tr>`;
    return;
  }

  pointsHistoryTableBody.innerHTML = entries.map(([, entry]) => `
    <tr>
      <td>${entry.studentName || ""}</td>
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

function renderAttendanceHistory() {
  const entries = Object.entries(attendanceCache || {});
  if (!entries.length) {
    attendanceHistoryTableBody.innerHTML = `<tr><td colspan="7">No attendance data today.</td></tr>`;
    return;
  }

  attendanceHistoryTableBody.innerHTML = entries.map(([, row]) => `
    <tr>
      <td>${row.studentName || ""}</td>
      <td>${row.externalId || ""}</td>
      <td>${row.groupName || ""}</td>
      <td>${formatDate(row.loginAt)}</td>
      <td>${formatDate(row.leaveAt)}</td>
      <td>${row.leaveReason || ""}</td>
      <td>${row.activeNow !== false ? "ACTIVE" : "LEFT"}</td>
    </tr>
  `).join("");
}

function renderSessionHistory() {
  const entries = Object.entries(sessionHistoryCache || {}).sort((a, b) => Number(b[1]?.closedAt || 0) - Number(a[1]?.closedAt || 0));

  if (!entries.length) {
    sessionHistoryTableBody.innerHTML = `<tr><td colspan="6">No past sessions yet.</td></tr>`;
    return;
  }

  sessionHistoryTableBody.innerHTML = entries.map(([, session]) => {
    const teamText = Object.entries(session.teams || {}).map(([teamKey, members]) => {
      const label = teamKey.replace("team", "Team ");
      const score = Number(session.liveTeamPoints?.[label] || 0);
      return `${label} (${score}): ${members.join(", ")}`;
    }).join(" | ");

    return `
      <tr>
        <td>${formatDate(session.closedAt)}</td>
        <td>${formatDate(session.createdAt)}</td>
        <td>${session.block || ""}</td>
        <td>${session.groupName || ""}</td>
        <td>${session.status || ""}</td>
        <td>${teamText}</td>
      </tr>
    `;
  }).join("");
}

pointHistorySearch.addEventListener("input", renderPointsHistory);
pointHistoryBlockFilter.addEventListener("change", renderPointsHistory);
pointHistoryTypeFilter.addEventListener("change", renderPointsHistory);

onValue(ref(db, "pointsLog"), (snapshot) => {
  pointsLogCache = snapshot.val() || {};
  renderPointsHistory();
});

onValue(ref(db, `attendance/${todayKey()}`), (snapshot) => {
  attendanceCache = snapshot.val() || {};
  renderAttendanceHistory();
});

onValue(ref(db, "sessionHistory"), (snapshot) => {
  sessionHistoryCache = snapshot.val() || {};
  renderSessionHistory();
});

