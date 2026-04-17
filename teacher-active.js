import { db } from "./firebase.js";
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const groupFilter = document.getElementById("groupFilter");
const statusFilter = document.getElementById("statusFilter");
const activeTableBody = document.getElementById("activeTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);
menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

let attendanceCache = {};
let groupsCache = {};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
}

function renderGroupFilter() {
  const groups = Object.keys(groupsCache || {}).sort();
  groupFilter.innerHTML = '<option value="">All groups</option>' + groups.map((group) => `<option value="${group}">${group}</option>`).join("");
}

function renderTable() {
  const groupValue = groupFilter.value;
  const statusValue = statusFilter.value;

  const entries = Object.entries(attendanceCache || {}).filter(([, row]) => {
    const groupOk = !groupValue || (row.groupName || "") === groupValue;
    const statusOk =
      !statusValue ||
      (statusValue === "active" && row.activeNow !== false) ||
      (statusValue === "left" && row.activeNow === false);
    return groupOk && statusOk;
  });

  if (!entries.length) {
    activeTableBody.innerHTML = '<tr><td colspan="8">No attendance today.</td></tr>';
    return;
  }

  activeTableBody.innerHTML = entries.map(([studentKey, row]) => `
    <tr>
      <td>${row.studentName || ""}</td>
      <td>${row.externalId || ""}</td>
      <td>${row.groupName || ""}</td>
      <td>${formatDate(row.loginAt)}</td>
      <td>${row.activeNow !== false ? "ACTIVE" : "LEFT"}</td>
      <td>${formatDate(row.leaveAt)}</td>
      <td>${row.leaveReason || ""}</td>
      <td>
        ${row.activeNow !== false
          ? `<button class="small-btn" onclick="window.registerLeave('${studentKey}')">Register Leave</button>`
          : "Done"}
      </td>
    </tr>
  `).join("");
}

window.registerLeave = async function(studentKey) {
  const reason = prompt("Reason for leaving early:", "") || "";
  const path = `attendance/${todayKey()}/${studentKey}`;
  const rowSnap = await get(ref(db, path));
  const row = rowSnap.val();

  if (!row) {
    alert("Attendance row not found.");
    return;
  }

  await update(ref(db, path), {
    activeNow: false,
    leaveAt: Date.now(),
    leaveReason: reason
  });

  await update(ref(db, `students/${studentKey}`), {
    activeNow: false
  });

  alert("Leave registered.");
};

groupFilter.addEventListener("change", renderTable);
statusFilter.addEventListener("change", renderTable);

onValue(ref(db, `attendance/${todayKey()}`), (snapshot) => {
  attendanceCache = snapshot.val() || {};
  renderTable();
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupFilter();
});

const manualEarlyLeaveStudent = document.getElementById("manualEarlyLeaveStudent");
const manualEarlyLeaveReason = document.getElementById("manualEarlyLeaveReason");
const manualEarlyLeaveBtn = document.getElementById("manualEarlyLeaveBtn");
const manualEarlyLeaveStatus = document.getElementById("manualEarlyLeaveStatus");

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

let attendanceTodayCache = {};
let studentsActiveCache = {};

function renderManualEarlyLeaveOptions() {
  if (!manualEarlyLeaveStudent) return;

  const options = Object.entries(attendanceTodayCache || {})
    .filter(([, row]) => row.activeNow === true)
    .map(([studentKey, row]) => {
      const label = row.studentName || row.studentKey || studentKey;
      const ext = row.studentNumber ? ` · ${row.studentNumber}` : "";
      return `<option value="${studentKey}">${label}${ext}</option>`;
    })
    .join("");

  manualEarlyLeaveStudent.innerHTML =
    `<option value="">Select student detected today</option>` + options;
}

if (manualEarlyLeaveBtn) {
  manualEarlyLeaveBtn.addEventListener("click", async () => {
    const studentKey = manualEarlyLeaveStudent.value;
    const reason = (manualEarlyLeaveReason.value || "").trim();

    if (!studentKey) {
      manualEarlyLeaveStatus.textContent = "Select a student first.";
      manualEarlyLeaveStatus.className = "status-text bad";
      return;
    }

    if (!reason) {
      manualEarlyLeaveStatus.textContent = "Write a reason first.";
      manualEarlyLeaveStatus.className = "status-text bad";
      return;
    }

    try {
      const leaveAt = Date.now();

      await update(ref(db, `attendance/${todayKey()}/${studentKey}`), {
        activeNow: false,
        leftEarly: true,
        leaveAt,
        leaveReason: reason
      });

      await update(ref(db, `students/${studentKey}`), {
        activeNow: false
      });

      manualEarlyLeaveReason.value = "";
      manualEarlyLeaveStatus.textContent = "Early leave marked successfully.";
      manualEarlyLeaveStatus.className = "status-text ok";
    } catch (error) {
      console.error(error);
      manualEarlyLeaveStatus.textContent = "Could not mark early leave.";
      manualEarlyLeaveStatus.className = "status-text bad";
    }
  });
}

onValue(ref(db, `attendance/${todayKey()}`), (snapshot) => {
  attendanceTodayCache = snapshot.val() || {};
  renderManualEarlyLeaveOptions();
});