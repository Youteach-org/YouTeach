import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { loginStudentByExternalIdAndPassword, setStudentActiveFlag } from "./student-auth.js";

const studentIdInput = document.getElementById("studentId");
const studentPasswordInput = document.getElementById("studentPassword");
const studentLoginBtn = document.getElementById("studentLoginBtn");
const studentLoginMessage = document.getElementById("studentLoginMessage");

studentLoginBtn.addEventListener("click", async () => {
  const externalId = studentIdInput.value.trim();
  const password = studentPasswordInput.value;

  if (!externalId || !password) {
    studentLoginMessage.textContent = "Enter external ID and password.";
    studentLoginMessage.className = "status-text bad";
    return;
  }

  const result = await loginStudentByExternalIdAndPassword(externalId, password);

  if (!result.ok) {
    studentLoginMessage.textContent = result.message;
    studentLoginMessage.className = "status-text bad";
    return;
  }

  await setStudentActiveFlag(result.key, true);
  window.location.href = "student-buzzer.html";
});

onValue(ref(db, "students"), () => {});
