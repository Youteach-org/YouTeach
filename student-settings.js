import { db } from "./firebase.js";
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");

const { studentKey } = session;

const logoutBtn = document.getElementById("logoutBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const studentIdentity = document.getElementById("studentIdentity");
const nicknameInput = document.getElementById("nicknameInput");
const saveNicknameBtn = document.getElementById("saveNicknameBtn");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const savePasswordBtn = document.getElementById("savePasswordBtn");
const settingsMessage = document.getElementById("settingsMessage");

let currentStudent = null;



function getDisplayName(student) {
  if (!student) return "Student";
  return (
    student.nickname ||
    ((student.fullName || student.name || "").split(" ")[0]) ||
    "Student"
  );
}

function getExternalId(student) {
  return student?.studentNumber || student?.externalId || "";
}

function formatStudentLabel(student) {
  const name = getDisplayName(student);
  const externalId = getExternalId(student);
  return externalId ? `${name} Â· ${externalId}` : name;
}

logoutBtn.addEventListener("click", async () => {
  const reason = prompt("Reason for leaving (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "student.html";
});

saveNicknameBtn.addEventListener("click", async () => {
  const nickname = nicknameInput.value.trim();

  if (!nickname) {
    settingsMessage.textContent = "Nickname cannot be empty.";
    return;
  }

  await update(ref(db, `students/${studentKey}`), { nickname });
  settingsMessage.textContent = "Nickname updated.";
});

savePasswordBtn.addEventListener("click", async () => {
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;

  if (!newPassword) {
    settingsMessage.textContent = "New password cannot be empty.";
    return;
  }

  const snapshot = await get(ref(db, `students/${studentKey}`));
  const student = snapshot.val();

  if (!student) {
    settingsMessage.textContent = "Student not found.";
    return;
  }

  const validCurrentPassword = student.password || "1234";
  if (currentPassword !== validCurrentPassword) {
    settingsMessage.textContent = "Current password is incorrect.";
    return;
  }

  await update(ref(db, `students/${studentKey}`), { password: newPassword });
  currentPasswordInput.value = "";
  newPasswordInput.value = "";
  settingsMessage.textContent = "Password updated.";
});

onValue(ref(db, `students/${studentKey}`), (snapshot) => {
  currentStudent = snapshot.val();
  if (!currentStudent) {
    clearStudentSession();
    window.location.href = "student.html";
    return;
  }

  studentIdentity.textContent = formatStudentLabel(currentStudent);
  nicknameInput.value = currentStudent.nickname || "";
});

