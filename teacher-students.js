import { db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");
const searchStudentInput = document.getElementById("searchStudent");
const studentsTableBody = document.getElementById("studentsTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);

menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("sidebar-open");
});

let studentsCache = {};

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ensureBlockPointsObject(student) {
  return {
    "Block 1": Number(student?.blockPoints?.["Block 1"] || 0),
    "Block 2": Number(student?.blockPoints?.["Block 2"] || 0),
    "Block 3": Number(student?.blockPoints?.["Block 3"] || 0)
  };
}

function buildSearchIndex(student) {
  return normalizeText([
    student.fullName || student.name || "",
    student.nickname || "",
    student.studentNumber || "",
    student.id || ""
  ].join(" "));
}

function renderStudents() {
  const query = normalizeText(searchStudentInput.value);
  const entries = Object.entries(studentsCache || {}).filter(([, student]) => {
    if (!query) return true;
    return buildSearchIndex(student).includes(query);
  });

  if (entries.length === 0) {
    studentsTableBody.innerHTML = `<tr><td colspan="11">No students found.</td></tr>`;
    return;
  }

  studentsTableBody.innerHTML = entries.map(([key, student]) => {
    const blockPoints = ensureBlockPointsObject(student);
    return `
      <tr>
        <td>${student.fullName || student.name || ""}</td>
        <td>${student.nickname || ""}</td>
        <td>${student.studentNumber || ""}</td>
        <td>${student.id || ""}</td>
        <td>${blockPoints["Block 1"]}</td>
        <td>${blockPoints["Block 2"]}</td>
        <td>${blockPoints["Block 3"]}</td>
        <td><input class="table-input" id="fullName-${key}" value="${(student.fullName || student.name || "").replace(/"/g, "&quot;")}"></td>
        <td><input class="table-input" id="nickname-${key}" value="${(student.nickname || "").replace(/"/g, "&quot;")}"></td>
        <td><input class="table-input" id="studentNumber-${key}" value="${(student.studentNumber || "").replace(/"/g, "&quot;")}"></td>
        <td><button class="small-btn" onclick="window.saveStudentRow('${key}')">Save</button></td>
      </tr>
    `;
  }).join("");
}

window.saveStudentRow = async function(studentKey) {
  const fullName = document.getElementById(`fullName-${studentKey}`).value.trim();
  const nickname = document.getElementById(`nickname-${studentKey}`).value.trim();
  const studentNumber = document.getElementById(`studentNumber-${studentKey}`).value.trim();

  if (!fullName) {
    alert("Name cannot be empty.");
    return;
  }

  await update(ref(db, `students/${studentKey}`), {
    fullName,
    name: fullName,
    nickname,
    studentNumber
  });

  alert("Student updated.");
};

searchStudentInput.addEventListener("input", renderStudents);

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderStudents();
});
