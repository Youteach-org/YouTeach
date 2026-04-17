import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

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
  const dayIndex = new Date().getDay(); // 0 sun ... 6 sat

  const dayTokens = {
    0: ["sunday", "domingo"],
    1: ["monday", "lunes"],
    2: ["tuesday", "martes"],
    3: ["wednesday", "miercoles", "miércoles"],
    4: ["thursday", "jueves"],
    5: ["friday", "viernes"],
    6: ["saturday", "sabado", "sábado"]
  };

  const tokens = dayTokens[dayIndex] || [];
  if (!normalized) return true;

  const containsAnyToken = tokens.some((token) => normalized.includes(token));
  const mentionsKnownDay = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday","lunes","martes","miercoles","miércoles","jueves","viernes","sabado","sábado","domingo"]
    .some((token) => normalized.includes(token));

  if (mentionsKnownDay) {
    return containsAnyToken;
  }

  return true;
}

function getPrimaryLoginButton() {
  return (
    document.getElementById("loginBtn") ||
    document.querySelector('[data-login-primary="1"]') ||
    document.querySelector('button[type="submit"]') ||
    document.querySelector('form button') ||
    document.querySelector('button')
  );
}

async function markPendingAttendance(studentKey) {
  if (!studentKey) return;

  try {
    const studentSnap = await get(ref(db, `students/${studentKey}`));
    const student = studentSnap.val();
    if (!student) return;

    const groupName = student.groupName || "";
    const detectedAt = Date.now();
    const attendancePath = `attendance/${todayKey()}/${studentKey}`;

    await update(ref(db, attendancePath), {
      studentKey,
      studentName: student.fullName || student.name || student.nickname || "",
      studentNumber: student.studentNumber || "",
      groupName,
      detectedAt,
      activeNow: true,
      attendanceValidated: false,
      present: false,
      leaveAt: null,
      leaveReason: "",
      eligibleToday: hasClassToday(groupName)
    });

    await update(ref(db, `students/${studentKey}`), {
      activeNow: true,
      lastSeenAt: detectedAt
    });
  } catch (error) {
    console.error("markPendingAttendance failed:", error);
  }
}

function wireTeacherLoginRedirect() {
  const btn = getPrimaryLoginButton();
  const runCheck = () => {
    window.setTimeout(() => {
      const raw = localStorage.getItem("youteachTeacherAuth") || sessionStorage.getItem("youteachTeacherAuth");
      if (!raw) return;

      localStorage.setItem("youteachTeacherAuth", raw);
      sessionStorage.removeItem("youteachTeacherAuth");
      if (!window.location.pathname.toLowerCase().includes("buzzer.html")) {
        window.location.href = "buzzer.html";
      }
    }, 280);
  };

  if (btn) btn.addEventListener("click", runCheck);
  const form = document.querySelector("form");
  if (form) form.addEventListener("submit", runCheck);
}

function wireStudentAttendanceCapture() {
  const btn = getPrimaryLoginButton();
  const runCheck = () => {
    window.setTimeout(async () => {
      const studentKey = localStorage.getItem("youteachStudentKey") || sessionStorage.getItem("youteachStudentKey");
      if (!studentKey) return;
      await markPendingAttendance(studentKey);
    }, 280);
  };

  if (btn) btn.addEventListener("click", runCheck);
  const form = document.querySelector("form");
  if (form) form.addEventListener("submit", runCheck);
}

document.addEventListener("DOMContentLoaded", () => {
  if (page === "teacher-login.html") {
    wireTeacherLoginRedirect();
  }

  if (page === "student.html") {
    wireStudentAttendanceCapture();
  }
});