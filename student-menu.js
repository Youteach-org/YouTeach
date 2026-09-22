import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { loginStudentByExternalIdAndPassword } from "./student-auth.js";

const studentIdInput = document.getElementById("studentId");
const studentPasswordInput = document.getElementById("studentPassword");
const studentLoginBtn = document.getElementById("studentLoginBtn");
const studentLoginMessage = document.getElementById("studentLoginMessage");

async function reflectLoginImmediately(studentKey) {
  if (!studentKey) return;

  await update(ref(db, `students/${studentKey}`), {
    activeNow: true,
    lastSeenAt: Date.now()
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