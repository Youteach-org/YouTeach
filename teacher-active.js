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

const manualEarlyLeaveStudent = document.getElementById("manualEarlyLeaveStudent");
const manualEarlyLeaveReason = document.getElementById("manualEarlyLeaveReason");
const manualEarlyLeaveBtn = document.getElementById("manualEarlyLeaveBtn");
const manualEarlyLeaveStatus = document.getElementById("manualEarlyLeaveStatus");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);
menuToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.toggle("sidebar-open");
});

let attendanceCache = {};
let groupsCache = {};
let studentsCache = {};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString();
}

function getStudentExternalId(studentKey, row) {
  return row?.studentNumber || row?.externalId || studentsCache?.[studentKey]?.studentNumber || "";
}

function getStudentName(studentKey, row) {
  return row?.studentName || studentsCache?.[studentKey]?.nickname || studentsCache?.[studentKey]?.fullName || studentsCache?.[studentKey]?.name || "";
}

function getStudentGroup(studentKey, row) {
  return row?.groupName || studentsCache?.[studentKey]?.groupName || "";
}

function getStudentLoginTime(row) {
  return row?.detectedAt || row?.loginAt || "";
}

function isStudentOnline(studentKey) {
  return studentsCache?.[studentKey]?.activeNow === true;
}

function renderGroupFilter() {
  const groups = Object.keys(groupsCache || {}).sort();
  groupFilter.innerHTML =
    '<option value="">All groups</option>' +
    groups.map((group) => `<option value="${group}">${group}</option>`).join("");
}

function renderTable() {
  const groupValue = groupFilter.value;
  const statusValue = statusFilter.value;

  const entries = Object.entries(attendanceCache || {}).filter(([studentKey, row]) => {
    const studentGroup = getStudentGroup(studentKey, row);
    const online = isStudentOnline(studentKey);

    const groupOk = !groupValue || studentGroup === groupValue;
    const statusOk =
      !statusValue ||
      (statusValue === "active" && online) ||
      (statusValue === "left" && !online);

    return groupOk && statusOk;
  });

  if (!entries.length) {
    activeTableBody.innerHTML = '<tr><td colspan="8">No attendance today.</td></tr>';
    return;
  }

  activeTableBody.innerHTML = entries.map(([studentKey, row]) => {
    const online = isStudentOnline(studentKey);

    return `
      <tr>
        <td>${getStudentName(studentKey, row)}</td>
        <td>${getStudentExternalId(studentKey, row)}</td>
        <td>${getStudentGroup(studentKey, row)}</td>
        <td>${formatDate(getStudentLoginTime(row))}</td>
        <td>${online ? "ACTIVE" : "LEFT"}</td>
        <td>${formatDate(row.leaveAt)}</td>
        <td>${row.leaveReason || ""}</td>
        <td>
          ${online
            ? `<button class="small-btn" onclick="window.registerLeave('${studentKey}')">Register Leave</button>`
            : "Done"}
        </td>
      </tr>
    `;
  }).join("");
}

function renderManualEarlyLeaveOptions() {
  if (!manualEarlyLeaveStudent) return;

  const options = Object.entries(attendanceCache || {})
    .filter(([studentKey]) => isStudentOnline(studentKey))
    .map(([studentKey, row]) => {
      const label = getStudentName(studentKey, row) || studentKey;
      const ext = getStudentExternalId(studentKey, row);
      return `<option value="${studentKey}">${label}${ext ? ` · ${ext}` : ""}</option>`;
    })
    .join("");

  manualEarlyLeaveStudent.innerHTML =
    `<option value="">Select student detected today</option>` + options;
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
    leaveReason: reason,
    leftEarly: true
  });

  await update(ref(db, `students/${studentKey}`), {
    activeNow: false
  });

  alert("Leave registered.");
};

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

groupFilter.addEventListener("change", renderTable);
statusFilter.addEventListener("change", renderTable);

onValue(ref(db, `attendance/${todayKey()}`), (snapshot) => {
  attendanceCache = snapshot.val() || {};
  renderTable();
  renderManualEarlyLeaveOptions();
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupFilter();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderTable();
  renderManualEarlyLeaveOptions();
});