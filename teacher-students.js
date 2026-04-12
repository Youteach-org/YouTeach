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
menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

let studentsCache = {};
let groupsCache = {};

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

function groupOptions(selectedGroup) {
  const groups = Object.keys(groupsCache || {}).sort();
  return ['<option value="">No group</option>']
    .concat(groups.map((group) => `<option value="${group}" ${group === selectedGroup ? "selected" : ""}>${group}</option>`))
    .join("");
}

function renderStudents() {
  const query = normalizeText(searchStudentInput.value);

  const entries = Object.entries(studentsCache || {}).filter(([, student]) => {
    const searchable = normalizeText([
      student.fullName || student.name || "",
      student.nickname || "",
      student.studentNumber || "",
      student.id || "",
      student.groupName || ""
    ].join(" "));
    return !query || searchable.includes(query);
  });

  if (!entries.length) {
    studentsTableBody.innerHTML = `<tr><td colspan="12">No students found.</td></tr>`;
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
        <td>${student.groupName || ""}</td>
        <td>${student.activeNow ? "YES" : "NO"}</td>
        <td>${blockPoints["Block 1"]}</td>
        <td>${blockPoints["Block 2"]}</td>
        <td>${blockPoints["Block 3"]}</td>
        <td><input class="table-input" id="nickname-${key}" value="${(student.nickname || "").replace(/"/g, "&quot;")}"></td>
        <td>
          <select class="table-input" id="groupName-${key}">
            ${groupOptions(student.groupName || "")}
          </select>
        </td>
        <td><button class="small-btn" onclick="window.saveStudentRow('${key}')">Save</button></td>
      </tr>
    `;
  }).join("");
}

window.saveStudentRow = async function(studentKey) {
  const nickname = document.getElementById(`nickname-${studentKey}`).value.trim();
  const groupName = document.getElementById(`groupName-${studentKey}`).value;

  await update(ref(db, `students/${studentKey}`), {
    nickname,
    groupName
  });

  alert("Student updated.");
};

searchStudentInput.addEventListener("input", renderStudents);

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderStudents();
});

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderStudents();
});
