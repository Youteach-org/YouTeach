import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { loginStudentByIdAndPassword, clearStudentSession, getStudentKey } from "./student-auth.js";

const logoutBtn = document.getElementById("logoutBtn");
const studentIdentity = document.getElementById("studentIdentity");
const studentIdInput = document.getElementById("studentId");
const studentPasswordInput = document.getElementById("studentPassword");
const studentLoginBtn = document.getElementById("studentLoginBtn");
const studentLoginMessage = document.getElementById("studentLoginMessage");

logoutBtn.addEventListener("click", () => {
  clearStudentSession();
  studentIdentity.textContent = "Student";
  studentLoginMessage.textContent = "Session closed.";
});

studentLoginBtn.addEventListener("click", async () => {
  const internalId = studentIdInput.value.trim();
  const password = studentPasswordInput.value;

  if (!internalId || !password) {
    studentLoginMessage.textContent = "Enter internal ID and password.";
    return;
  }

  const result = await loginStudentByIdAndPassword(internalId, password);

  if (!result.ok) {
    studentLoginMessage.textContent = result.message;
    return;
  }

  const student = result.student;
  studentIdentity.textContent = student.nickname || student.fullName || student.name || "Student";
  studentLoginMessage.textContent = "Login successful. You can now open Summary, Buzzer or Settings.";
});

onValue(ref(db, "students"), (snapshot) => {
  const studentKey = getStudentKey();
  if (!studentKey) {
    studentIdentity.textContent = "Student";
    return;
  }

  const student = (snapshot.val() || {})[studentKey];
  if (student) {
    studentIdentity.textContent = student.nickname || student.fullName || student.name || "Student";
  }
});
