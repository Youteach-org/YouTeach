import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireStudentSession, clearStudentSession, saveLeaveLog } from "./student-auth.js";

const session = requireStudentSession();
if (!session) throw new Error("Student session required.");
const { studentKey, sessionToken } = session;

const logoutBtn = document.getElementById("logoutBtn");
const studentIdentity = document.getElementById("studentIdentity");
const nicknameInput = document.getElementById("nicknameInput");
const saveNicknameBtn = document.getElementById("saveNicknameBtn");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const savePasswordBtn = document.getElementById("savePasswordBtn");
const settingsMessage = document.getElementById("settingsMessage");

function getDisplayName(student) {
  if (!student) return "Student";
  return student.nickname || ((student.fullName || student.name || "").split(" ")[0]) || "Student";
}
function getExternalId(student) {
  return student?.studentNumber || student?.externalId || "";
}
function formatStudentLabel(student) {
  const name = getDisplayName(student);
  const externalId = getExternalId(student);
  return externalId ? `${name} · ${externalId}` : name;
}

logoutBtn.addEventListener("click", async () => {
  const reason = prompt("Reason for leaving (optional):", "") || "";
  await saveLeaveLog(studentKey, reason);
  clearStudentSession();
  window.location.href = "index.html";
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

  savePasswordBtn.disabled = true;
  try {
    const response = await fetch("/api/student-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      settingsMessage.textContent = data.error || "Could not change the password.";
      return;
    }

    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    settingsMessage.textContent = "Password updated. Sign in again with your new password.";
    clearStudentSession();
    setTimeout(() => { window.location.href = "student.html"; }, 500);
  } catch (error) {
    console.error(error);
    settingsMessage.textContent = "Could not change the password.";
  } finally {
    savePasswordBtn.disabled = false;
  }
});

onValue(ref(db, `students/${studentKey}`), (snapshot) => {
  const student = snapshot.val();
  if (!student) {
    clearStudentSession();
    window.location.href = "index.html";
    return;
  }
  studentIdentity.textContent = formatStudentLabel(student);
  nicknameInput.value = student.nickname || "";
});
