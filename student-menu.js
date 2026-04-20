import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { loginStudentByExternalIdAndPassword } from "./student-auth.js";

const studentIdInput = document.getElementById("studentId");
const studentPasswordInput = document.getElementById("studentPassword");
const studentLoginBtn = document.getElementById("studentLoginBtn");
const studentLoginMessage = document.getElementById("studentLoginMessage");

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
    3: ["wednesday", "miercoles", "miércoles"],
    4: ["thursday", "jueves"],
    5: ["friday", "viernes"],
    6: ["saturday", "sabado", "sábado"]
  };

  const tokens = dayTokens[dayIndex] || [];
  if (!normalized) return true;

  const containsAnyToken = tokens.some((token) => normalized.includes(token));
  const mentionsKnownDay = [
    "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
    "lunes","martes","miercoles","miércoles","jueves","viernes","sabado","sábado","domingo"
  ].some((token) => normalized.includes(token));

  if (mentionsKnownDay) {
    return containsAnyToken;
  }

  return true;
}

async function reflectLoginImmediately(studentKey) {
  if (!studentKey) return;

  const studentSnap = await get(ref(db, `students/${studentKey}`));
  const student = studentSnap.val();
  if (!student) return;

  const nowTs = Date.now();
  const today = todayKey();
  const groupName = student.groupName || "";

  await update(ref(db, `students/${studentKey}`), {
    activeNow: true,
    lastSeenAt: nowTs
  });

  await update(ref(db, `attendance/${today}/${studentKey}`), {
    studentKey,
    studentName: student.fullName || student.name || student.nickname || "",
    studentNumber: student.studentNumber || "",
    groupName,
    activeNow: true,
    detectedAt: nowTs,
    attendanceValidated: false,
    present: false,
    leftEarly: false,
    leaveAt: null,
    leaveReason: "",
    eligibleToday: hasClassToday(groupName)
  });
}

async function doStudentLogin() {
  const externalId = studentIdInput.value.trim();
  const password = studentPasswordInput.value;

  studentLoginMessage.textContent = "";

  if (!externalId || !password) {
    studentLoginMessage.textContent = "Enter external ID or internal ID, and password.";
    studentLoginMessage.className = "status-text bad";
    return;
  }

  studentLoginBtn.disabled = true;
  studentLoginMessage.textContent = "Checking login...";
  studentLoginMessage.className = "status-text";

  try {
    const result = await loginStudentByExternalIdAndPassword(externalId, password);

    if (!result.ok) {
      studentLoginMessage.textContent = result.message;
      studentLoginMessage.className = "status-text bad";
      studentLoginBtn.disabled = false;
      return;
    }

    const studentKey =
      result.studentKey ||
      localStorage.getItem("youteachStudentKey") ||
      sessionStorage.getItem("youteachStudentKey");

    await reflectLoginImmediately(studentKey);

    studentLoginMessage.textContent = "Login successful.";
    studentLoginMessage.className = "status-text ok";
    window.location.href = "student-buzzer.html";
  } catch (error) {
    console.error(error);
    studentLoginMessage.textContent = `Login failed: ${error.message || "unknown error"}`;
    studentLoginMessage.className = "status-text bad";
    studentLoginBtn.disabled = false;
  }
}

studentLoginBtn.addEventListener("click", doStudentLogin);

[studentIdInput, studentPasswordInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doStudentLogin();
    }
  });
});