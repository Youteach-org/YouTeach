import { db } from "./firebase.js";
import { ref, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
const ALLOWED_PAGES = new Set(["buzzer.html", "teacher.html", "teacher-home.html"]);

if (!ALLOWED_PAGES.has(page)) {
  // no-op
} else {
  const panelId = "attendanceValidationPanel";

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

  function hasClassToday(groupName) {
    const normalized = normalizeText(groupName);
    const dayIndex = new Date().getDay();

    const dayTokens = {
      0: ["sunday", "domingo"],
      1: ["monday", "lunes"],
      2: ["tuesday", "martes"],
      3: ["wednesday", "miercoles", "miÃ©rcoles"],
      4: ["thursday", "jueves"],
      5: ["friday", "viernes"],
      6: ["saturday", "sabado", "sÃ¡bado"]
    };

    const tokens = dayTokens[dayIndex] || [];
    if (!normalized) return true;

    const containsAnyToken = tokens.some((token) => normalized.includes(token));
    const mentionsKnownDay = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday","lunes","martes","miercoles","miÃ©rcoles","jueves","viernes","sabado","sÃ¡bado","domingo"]
      .some((token) => normalized.includes(token));

    if (mentionsKnownDay) {
      return containsAnyToken;
    }

    return true;
  }

  function ensurePanel() {
    if (document.getElementById(panelId)) return document.getElementById(panelId);

    const topbar = document.querySelector(".topbar");
    if (!topbar) return null;

    const panel = document.createElement("section");
    panel.id = panelId;
    panel.className = "panel-card";
    panel.style.marginBottom = "16px";
    panel.innerHTML = `
      <div class="panel-card-header">
        <h3>Attendance Validation</h3>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <button id="validateAttendanceTodayBtn" type="button">Validate attendance of today</button>
        <button id="resetOfflineNowBtn" type="button">Reset all students offline</button>
      </div>
      <div id="attendanceValidationInfo" style="margin-top:12px;font-size:13px;color:#475569;">
        Loading attendance data...
      </div>
    `;

    const main = document.querySelector(".main-content"); if(main) main.appendChild(panel);
    return panel;
  }

  async function validateAttendanceToday() {
    const today = todayKey();
    const attendanceSnap = await get(ref(db, `attendance/${today}`));
    const studentsSnap = await get(ref(db, "students"));
    const attendance = attendanceSnap.val() || {};
    const students = studentsSnap.val() || {};

    let validated = 0;
    let skipped = 0;

    for (const [studentKey, row] of Object.entries(attendance)) {
      const student = students[studentKey];
      const groupName = student?.groupName || row.groupName || "";

      const eligible = row.activeNow === true && hasClassToday(groupName);
      if (!eligible) {
        skipped += 1;
        continue;
      }

      await update(ref(db, `attendance/${today}/${studentKey}`), {
        attendanceValidated: true,
        attendanceValidatedAt: Date.now(),
        present: true,
        groupName,
        eligibleToday: true
      });

      validated += 1;
    }

    alert(`Attendance validated. Validated: ${validated}. Skipped: ${skipped}.`);
  }

  async function resetAllStudentsOffline() {
    const confirmed = window.confirm("This will set all students offline and clear today's active flags. Continue?");
    if (!confirmed) return;

    const today = todayKey();
    const studentsSnap = await get(ref(db, "students"));
    const attendanceSnap = await get(ref(db, `attendance/${today}`));

    const students = studentsSnap.val() || {};
    const attendance = attendanceSnap.val() || {};

    for (const studentKey of Object.keys(students)) {
      await update(ref(db, `students/${studentKey}`), {
        activeNow: false
      });
    }

    for (const studentKey of Object.keys(attendance)) {
      await update(ref(db, `attendance/${today}/${studentKey}`), {
        activeNow: false,
        attendanceValidated: false,
        present: false
      });
    }

    alert("All students set offline for today's fresh attendance run.");
  }

  function bindPanelActions(panel) {
    if (!panel) return;

    const validateBtn = panel.querySelector("#validateAttendanceTodayBtn");
    const resetBtn = panel.querySelector("#resetOfflineNowBtn");

    if (validateBtn && !validateBtn.dataset.bound) {
      validateBtn.dataset.bound = "1";
      validateBtn.addEventListener("click", validateAttendanceToday);
    }

    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = "1";
      resetBtn.addEventListener("click", resetAllStudentsOffline);
    }
  }

  function renderInfo(panel, attendance) {
    const info = panel?.querySelector("#attendanceValidationInfo");
    if (!info) return;

    const rows = Object.values(attendance || {});
    const detected = rows.filter((row) => row.activeNow === true).length;
    const validated = rows.filter((row) => row.attendanceValidated === true).length;
    const eligible = rows.filter((row) => row.eligibleToday === true).length;

    info.innerHTML = `
      Detected today: <strong>${detected}</strong> |
      Eligible today: <strong>${eligible}</strong> |
      Validated: <strong>${validated}</strong>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const panel = ensurePanel();
    bindPanelActions(panel);

    const today = todayKey();
    onValue(ref(db, `attendance/${today}`), (snapshot) => {
      renderInfo(panel, snapshot.val() || {});
    });
  });
}