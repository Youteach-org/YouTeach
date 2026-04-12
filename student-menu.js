import { loginStudentByExternalIdAndPassword } from "./student-auth.js";

const studentIdInput = document.getElementById("studentId");
const studentPasswordInput = document.getElementById("studentPassword");
const studentLoginBtn = document.getElementById("studentLoginBtn");
const studentLoginMessage = document.getElementById("studentLoginMessage");

studentLoginBtn.addEventListener("click", async () => {
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

    studentLoginMessage.textContent = "Login successful.";
    studentLoginMessage.className = "status-text ok";
    window.location.href = "student-buzzer.html";
  } catch (error) {
    console.error(error);
    studentLoginMessage.textContent = "Login failed. Open browser console and tell me the exact error.";
    studentLoginMessage.className = "status-text bad";
    studentLoginBtn.disabled = false;
  }
});
