import { db } from "./firebase.js";
import { ref, push, set, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { generateId } from "./app.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { migrateExistingStudents } from "./student-auth.js";

requireTeacherAuth();

const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const teacherIdentity = document.getElementById("teacherIdentity");
const logoutBtn = document.getElementById("logoutBtn");

const groupNameInput = document.getElementById("groupNameInput");
const createGroupBtn = document.getElementById("createGroupBtn");
const deleteGroupSelect = document.getElementById("deleteGroupSelect");
const deleteGroupBtn = document.getElementById("deleteGroupBtn");

const studentNameInput = document.getElementById("studentName");
const studentNicknameInput = document.getElementById("studentNickname");
const studentNumberManualInput = document.getElementById("studentNumberManual");
const studentGroupSelect = document.getElementById("studentGroupSelect");
const createStudentBtn = document.getElementById("createStudent");

const csvGroupSelect = document.getElementById("csvGroupSelect");
const csvFileInput = document.getElementById("csvFile");
const importCsvBtn = document.getElementById("importCsv");

const textGroupSelect = document.getElementById("textGroupSelect");
const bulkTextInput = document.getElementById("bulkText");
const importTextBtn = document.getElementById("importText");

const groupsTableBody = document.getElementById("groupsTableBody");

teacherIdentity.textContent = getTeacherName();
logoutBtn.addEventListener("click", logoutTeacher);
menuToggle.addEventListener("click", () => sidebar.classList.toggle("sidebar-open"));

let groupsCache = {};
let studentsCache = {};

function renderGroupSelectors() {
  const groups = Object.keys(groupsCache || {}).sort();
  const options = ['<option value="">Select group</option>']
    .concat(groups.map((group) => `<option value="${group}">${group}</option>`))
    .join("");

  studentGroupSelect.innerHTML = options;
  csvGroupSelect.innerHTML = '<option value="">Select group for imported students</option>' + groups.map((group) => `<option value="${group}">${group}</option>`).join("");
  textGroupSelect.innerHTML = '<option value="">Select group for pasted students</option>' + groups.map((group) => `<option value="${group}">${group}</option>`).join("");
  deleteGroupSelect.innerHTML = '<option value="">Select group</option>' + groups.map((group) => `<option value="${group}">${group}</option>`).join("");
}

function renderGroupsTable() {
  const groups = Object.keys(groupsCache || {}).sort();

  if (!groups.length) {
    groupsTableBody.innerHTML = `<tr><td colspan="2">No groups yet.</td></tr>`;
    return;
  }

  groupsTableBody.innerHTML = groups.map((group) => {
    const count = Object.values(studentsCache || {}).filter((student) => (student.groupName || "") === group).length;
    return `<tr><td>${group}</td><td>${count}</td></tr>`;
  }).join("");
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  return lines.map((line) => {
    const cols = parseCsvLine(line);
    return {
      studentNumber: (cols[0] || "").trim(),
      fullName: (cols[1] || "").trim(),
      nickname: ""
    };
  }).filter((student) => student.fullName);
}

function parseBulkText(text) {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    if (line.includes("\t")) {
      const parts = line.split("\t");
      return {
        studentNumber: (parts[0] || "").trim(),
        fullName: parts.slice(1).join(" ").trim(),
        nickname: ""
      };
    }

    const parts = parseCsvLine(line);
    return {
      studentNumber: (parts[0] || "").trim(),
      fullName: (parts[1] || "").trim() || line,
      nickname: ""
    };
  }).filter((student) => student.fullName);
}

async function saveStudent(fullName, nickname = "", studentNumber = "", groupName = "") {
  const cleanName = fullName.trim();
  const cleanNickname = nickname.trim() || cleanName.split(" ")[0];
  const cleanNumber = studentNumber.trim();
  const internalId = generateId();

  const newRef = push(ref(db, "students"));

  await set(newRef, {
    fullName: cleanName,
    name: cleanName,
    nickname: cleanNickname,
    studentNumber: cleanNumber,
    groupName,
    id: internalId,
    password: "1234",
    activeNow: true,
    blockPoints: {
      "Block 1": 0,
      "Block 2": 0,
      "Block 3": 0
    }
  });
}

createGroupBtn.addEventListener("click", async () => {
  const groupName = groupNameInput.value.trim();
  if (!groupName) {
    alert("Enter a group name.");
    return;
  }

  await update(ref(db, "groups"), {
    [groupName]: {
      name: groupName,
      createdAt: Date.now()
    }
  });

  groupNameInput.value = "";
  alert("Group created.");
});

deleteGroupBtn.addEventListener("click", async () => {
  const groupName = deleteGroupSelect.value;
  if (!groupName) {
    alert("Select a group.");
    return;
  }

  const hasStudents = Object.values(studentsCache || {}).some((student) => (student.groupName || "") === groupName);
  if (hasStudents) {
    alert("This group still has students assigned. Reassign them first.");
    return;
  }

  await remove(ref(db, `groups/${groupName}`));
  alert("Group deleted.");
});

createStudentBtn.addEventListener("click", async () => {
  const fullName = studentNameInput.value.trim();
  const nickname = studentNicknameInput.value.trim();
  const studentNumber = studentNumberManualInput.value.trim();
  const groupName = studentGroupSelect.value;

  if (!fullName) {
    alert("Please enter a student name.");
    return;
  }

  if (!groupName) {
    alert("Select a group.");
    return;
  }

  await saveStudent(fullName, nickname, studentNumber, groupName);
  studentNameInput.value = "";
  studentNicknameInput.value = "";
  studentNumberManualInput.value = "";
  alert("Student added.");
});

importCsvBtn.addEventListener("click", async () => {
  const file = csvFileInput.files[0];
  const groupName = csvGroupSelect.value;

  if (!file) {
    alert("Please choose a CSV file.");
    return;
  }

  if (!groupName) {
    alert("Select a group for the imported students.");
    return;
  }

  const text = await file.text();
  const students = parseCsv(text);

  if (!students.length) {
    alert("No valid students were found.");
    return;
  }

  for (const student of students) {
    await saveStudent(student.fullName, student.nickname || "", student.studentNumber || "", groupName);
  }

  csvFileInput.value = "";
  alert(`${students.length} students imported successfully.`);
});

importTextBtn.addEventListener("click", async () => {
  const text = bulkTextInput.value.trim();
  const groupName = textGroupSelect.value;

  if (!text) {
    alert("Paste the student list first.");
    return;
  }

  if (!groupName) {
    alert("Select a group for the pasted students.");
    return;
  }

  const students = parseBulkText(text);

  if (!students.length) {
    alert("No valid students were found.");
    return;
  }

  for (const student of students) {
    await saveStudent(student.fullName, student.nickname || "", student.studentNumber || "", groupName);
  }

  bulkTextInput.value = "";
  alert(`${students.length} students imported successfully.`);
});

(async () => {
  await migrateExistingStudents();
})();

onValue(ref(db, "groups"), (snapshot) => {
  groupsCache = snapshot.val() || {};
  renderGroupSelectors();
  renderGroupsTable();
});

onValue(ref(db, "students"), (snapshot) => {
  studentsCache = snapshot.val() || {};
  renderGroupsTable();
});
